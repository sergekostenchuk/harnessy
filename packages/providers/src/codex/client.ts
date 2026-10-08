import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {ProviderError,record} from '../types.ts';
import {vendorError} from '../errors.ts';
export interface Transport {
 write(line:string):void;onLine(cb:(line:string)=>void):()=>void;
 onClose(cb:(error:ProviderError)=>void):()=>void;close():Promise<void>
}
export interface SpawnOptions {cwd:string;args:string[];env:NodeJS.ProcessEnv;secrets?:string[]}
export type TransportFactory=(options:SpawnOptions)=>Transport;
export const spawnTransport:TransportFactory=opts=>{
 const child=spawn('codex',opts.args,{cwd:opts.cwd,env:opts.env,stdio:['pipe','pipe','pipe']});
 const lines=new Set<(line:string)=>void>(),closed=new Set<(error:ProviderError)=>void>();let last:ProviderError|null=null;let stderr='';
 const clean=(s:string)=>(opts.secrets??[]).reduce((v,key)=>v.replaceAll(key,'[redacted]'),s);
 const die=(e:ProviderError)=>{if(last)return;last=e;for(const cb of closed)cb(e)};
 child.stdin.on('error',e=>die(new ProviderError('transport_lost',clean(e.message))));
 const rl=createInterface({input:child.stdout});rl.on('error',e=>die(new ProviderError('transport_lost',clean(e.message))));rl.on('line',line=>{for(const cb of lines)cb(line)});
 child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000)});
 child.on('error',e=>die(new ProviderError((e as NodeJS.ErrnoException).code==='ENOENT'?'no_binary':'transport_lost',clean(e.message))));
 child.on('close',()=>die(new ProviderError('transport_lost',clean(stderr.trim()||'codex app-server closed before terminal'))));
 return {
 write(line){if(last)throw last;child.stdin.write(line+'\n')},
 onLine(cb){lines.add(cb);return ()=>lines.delete(cb)},
 onClose(cb){closed.add(cb);if(last)cb(last);return ()=>closed.delete(cb)},
 async close(){if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolve=>{
 child.once('close',()=>resolve());child.stdin.end();child.kill('SIGTERM');
 const timer=setTimeout(()=>{child.kill('SIGKILL')},1000);timer.unref();child.once('close',()=>clearTimeout(timer))
 })}
 };
};
type Pending={resolve:(v:unknown)=>void;reject:(e:ProviderError)=>void;cleanup:()=>void;method:string};
export class RpcClient {
 private pending=new Map<string,Pending>();private retired=new Set<string>();private sequence=0;private failure:ProviderError|null=null;
 private notifications=new Set<(method:string,params:unknown)=>void>();private failures=new Set<(e:ProviderError)=>void>();
 private serverHandler:((method:string,params:unknown,id:string|number)=>Promise<unknown>)|null=null;
 private transport:Transport;private secrets:string[];
 constructor(transport:Transport,secrets:string[]=[]) {this.transport=transport;this.secrets=secrets;
 transport.onLine(line=>this.receive(line));transport.onClose(e=>this.fail(e))
 }
 private clean(s:string){return this.secrets.reduce((v,key)=>v.replaceAll(key,'[redacted]'),s)}
 private fail(e:ProviderError){if(this.failure)return;this.failure=e;for(const p of this.pending.values()){p.cleanup();p.reject(e)}this.pending.clear();for(const cb of this.failures)cb(e)}
 private receive(line:string){
 try{
 const msg:unknown=JSON.parse(line);if(!record(msg))throw new ProviderError('protocol','invalid JSON-RPC envelope');
 if(typeof msg.method==='string'){
 if('id'in msg){if(typeof msg.id!=='string'&&typeof msg.id!=='number')throw new ProviderError('protocol','invalid server request id');
 const id=msg.id,method=msg.method;
 void (async()=>{try{if(!this.serverHandler){this.send({id,error:{code:-32601,message:'unknown request'}});return}
 const result=await this.serverHandler(method,msg.params,id);this.send({id,result})}
 catch(e){const err=e instanceof ProviderError?e:new ProviderError('protocol','invalid server request');this.send({id,error:{code:err.code==='unknown_request'?-32601:-32602,message:this.clean(err.vendorText)}})}})().catch(()=>{});
 }else for(const cb of this.notifications)cb(msg.method,msg.params);
 return
 }
 if(!('id'in msg)||typeof msg.id!=='string'&&typeof msg.id!=='number')throw new ProviderError('protocol','missing response id');
 const id=String(msg.id),p=this.pending.get(id);if(!p){if(this.retired.has(id))return;throw new ProviderError('protocol','unknown response id')}
 if(('result'in msg)===('error'in msg))throw new ProviderError('protocol','ambiguous response');
 this.pending.delete(id);this.retired.add(id);p.cleanup();
 if('error'in msg){if(!record(msg.error)||typeof msg.error.message!=='string'||typeof msg.error.code!=='number'){p.reject(new ProviderError('protocol','invalid RPC error'));return}
 p.reject(vendorError('codex',this.clean(msg.error.message),p.method,msg.error.data));}
 else p.resolve(msg.result);
 }catch(e){this.fail(e instanceof ProviderError?e:new ProviderError('protocol','invalid JSONL message'))}
 }
 send(v:unknown){if(this.failure)throw this.failure;this.transport.write(JSON.stringify(v))}
 request<T=unknown>(method:string,params:unknown,signal?:AbortSignal):Promise<T>{
 if(this.failure)return Promise.reject(this.failure);if(signal?.aborted)return Promise.reject(new ProviderError('cancelled','ход отменён'));
 const id='harnessy-'+(++this.sequence);
 return new Promise<T>((resolve,reject)=>{
 const abort=()=>{const p=this.pending.get(id);if(!p)return;this.pending.delete(id);this.retired.add(id);p.cleanup();reject(new ProviderError('cancelled','ход отменён'))};
 const timer=setTimeout(()=>{const p=this.pending.get(id);if(!p)return;this.pending.delete(id);this.retired.add(id);p.cleanup();reject(new ProviderError('transport_lost','app-server request timed out: '+method))},30000);
 const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
 this.pending.set(id,{resolve:v=>resolve(v as T),reject,cleanup,method});signal?.addEventListener('abort',abort,{once:true});
 try{this.send({id,method,params})}catch(e){this.pending.delete(id);cleanup();reject(e)}
 })
 }
 async initialize(signal?:AbortSignal){await this.request('initialize',{clientInfo:{name:'harnessy',title:'Harnessy',version:'0.1.0'},capabilities:{experimentalApi:false}},signal);this.send({method:'initialized'})}
 onNotification(cb:(method:string,params:unknown)=>void){this.notifications.add(cb);return ()=>this.notifications.delete(cb)}
 onFailure(cb:(e:ProviderError)=>void){this.failures.add(cb);if(this.failure)cb(this.failure);return ()=>this.failures.delete(cb)}
 setServerHandler(cb:(method:string,params:unknown,id:string|number)=>Promise<unknown>){this.serverHandler=cb}
 async close(){this.fail(new ProviderError('transport_lost','app-server closed'));await this.transport.close()}
}
