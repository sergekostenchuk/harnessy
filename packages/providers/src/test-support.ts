import {ProviderError,type Seat,type TurnContext,type TurnEvent,type TurnHandle} from './types.ts';
import {RpcClient,type Transport,type SpawnOptions} from './codex/client.ts';
export function fixture(vendor:'claude'|'codex'='codex'){
 const seat:Seat={id:'worker',vendor,label:'Worker',model:'model',mode:'ask',cwd:'/project',sessionId:null,writePaths:['src'],worktree:null};
 const controller=new AbortController(),events:TurnEvent[]=[],sessions:string[]=[],tokens:string[]=[],revoked:string[]=[];let handle:TurnHandle|null=null;
 const ctx:TurnContext={signal:controller.signal,publish:e=>events.push(e),askApproval:async()=>true,session:id=>sessions.push(id),setHandle:h=>{handle=h},
 env:{},roleNote:'role',peers:[{id:'worker',label:'Worker',vendor},{id:'reviewer',label:'Review',vendor:'codex'}],
 tools:{proposeSeats:async()=>({ok:true,text:'proposed'}),createSeats:async()=>({ok:true,text:'created'}),send:async()=>({ok:true,text:'sent'}),ask:async()=>({ok:true,text:'reply'}),readPane:async()=>({ok:true,text:'history'}),merge:async()=>({ok:true,text:'merged'}),assignRole:async()=>({ok:true,text:'assigned'})},
 relayDepth:0,projectDir:'/project',appUrl:'http://127.0.0.1:3777',registerProcessToken:t=>tokens.push(t),revokeProcessToken:t=>revoked.push(t),writableRoots:['/project/.harness/evidence']};
 return {seat,ctx,events,sessions,tokens,revoked,controller,get handle(){return handle}};
}
export const HOLD=Symbol('hold');
export class FakeTransport implements Transport{
 lines=new Set<(line:string)=>void>();closes=new Set<(e:ProviderError)=>void>();requests:Record<string,unknown>[]=[];replies:Record<string,unknown>[]=[];closed=false;turn=0;
 responder:(method:string,params:Record<string,unknown>,t:FakeTransport)=>unknown=(m,_p,t)=>{
 if(m==='initialize')return {};
 if(m==='account/read')return {account:{type:'chatgpt',email:null,planType:'plus'},requiresOpenaiAuth:true};
 if(m==='thread/start'||m==='thread/resume')return {thread:{id:'thread'}};
 if(m==='turn/start'){const id='turn-'+(++t.turn);queueMicrotask(()=>t.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}}));return {turn:{id}}}
 if(m==='turn/interrupt'){t.notify('turn/completed',{threadId:'thread',turn:{id:'turn-'+t.turn,status:'interrupted'}});return {}}
 if(m==='turn/steer')return {};
 if(m==='model/list')return {data:[{id:'display-id',model:'wire-model',displayName:'Model'}],nextCursor:null};
 if(m==='thread/list')return {data:[],nextCursor:null};
 if(m==='thread/read')return {thread:{turns:[]}};
 return {};
 };
 write(line:string){
 const m=JSON.parse(line) as Record<string,unknown>;
 if(typeof m.method!=='string'){this.replies.push(m);return}
 this.requests.push(m);if(!('id'in m))return;
 try{const value=this.responder(m.method,m.params as Record<string,unknown>,this);void Promise.resolve(value).then(result=>{if(result!==HOLD)this.emit({id:m.id,result})}).catch(e=>this.emit({id:m.id,error:{code:-32600,message:e.message,data:e.info}}))}
 catch(e){const error=e as Error;this.emit({id:m.id,error:{code:-32600,message:error.message}})}
 }
 emit(value:unknown){for(const cb of this.lines)cb(typeof value==='string'?value:JSON.stringify(value))}
 notify(method:string,params:unknown){this.emit({method,params})}
 onLine(cb:(line:string)=>void){this.lines.add(cb);return ()=>this.lines.delete(cb)}
 onClose(cb:(e:ProviderError)=>void){this.closes.add(cb);return ()=>this.closes.delete(cb)}
 die(e=new ProviderError('transport_lost','EOF')){this.closed=true;for(const cb of this.closes)cb(e)}
 async close(){this.die()}
}
export function codexHarness(setup?:(t:FakeTransport)=>void){
 const transports:FakeTransport[]=[],options:SpawnOptions[]=[];
 return {transports,options,deps:{transportFactory:(o:SpawnOptions)=>{const t=new FakeTransport();setup?.(t);transports.push(t);options.push(o);return t},
 servers:async()=>['foreign'],router:async()=>null,env:{OPENAI_API_KEY:'not-a-real-key'},cwd:'/project'}};
}
export async function until(predicate:()=>boolean){for(let i=0;i<100;i++){if(predicate())return;await new Promise<void>(r=>setImmediate(r))}throw new Error('event did not arrive')}
export const terminals=(events:TurnEvent[])=>events.filter(e=>e.type==='done'||e.type==='error');
