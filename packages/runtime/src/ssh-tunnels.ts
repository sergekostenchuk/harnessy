import {createServer,isIP} from 'node:net';
import {mkdtempSync,chmodSync,realpathSync,statSync,rmSync,existsSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {systemClock,type Clock} from './types.ts';
import {spawnSsh,type SshSpawn,type SshExit,type SshProcess} from './ssh-process.ts';

export interface SshTunnelConfig {host:string;port:number;user:string;keyPath:string}
const reasons={ssh_config_invalid:'Неверные настройки SSH-выхода',ssh_key_unavailable:'Ключ SSH недоступен: выберите файл в ~/.ssh',ssh_host_key_unknown:'Добавьте ключ хоста в known_hosts владельца',ssh_host_key_changed:'Ключ хоста изменился: проверьте known_hosts владельца',ssh_auth_failed:'Вход по ключу SSH не выполнен',ssh_unavailable:'Программа ssh недоступна',ssh_forward_failed:'SSH не смог открыть локальный SOCKS-порт',ssh_connect_failed:'SSH-соединение прервано или недоступно',ssh_timeout:'Истекло время запуска SSH-туннеля',ssh_stopped:'SSH-туннель остановлен',ssh_capacity:'Достигнут предел SSH-туннелей'} as const;
export type SshTunnelCode=keyof typeof reasons;
export class SshTunnelError extends Error {readonly code:SshTunnelCode;constructor(code:SshTunnelCode){super(reasons[code]);this.code=code}}
export interface SshTunnelSnapshot {id:string;state:'starting'|'up'|'down'|'stopped';url:string|null;generation:number;code:SshTunnelCode|null;reason:string|null;retryAt:number|null}
export interface SshTunnelOptions {home?:string;binary?:string;temporaryDirectory?:string;spawn?:SshSpawn;clock?:Clock;startupTimeoutMs?:number;retryBaseMs?:number;retryMaxMs?:number}
type Entry={config:SshTunnelConfig;stamp:string;state:SshTunnelSnapshot;wanted:boolean;failures:number;upAt:number|null;controller:AbortController;job:Promise<SshTunnelSnapshot>|null;worker:SshProcess|null;control:SshProcess|null;timer:unknown;directory:string|null};
const idValid=(id:unknown):id is string=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(id)&&!['constructor','prototype','__proto__'].includes(id);
const terminal=new Set<SshTunnelCode>(['ssh_config_invalid','ssh_key_unavailable','ssh_host_key_unknown','ssh_host_key_changed','ssh_auth_failed','ssh_unavailable']);
function configuration(input:SshTunnelConfig):SshTunnelConfig {
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['host','port','user','keyPath'].includes(k)))throw new SshTunnelError('ssh_config_invalid');
 const {host,port,user,keyPath}=input;
 const dns=typeof host==='string'&&host.length<=253&&host.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s));
 if(typeof host!=='string'||!(isIP(host)||dns)||!Number.isSafeInteger(port)||port<1||port>65535||typeof user!=='string'||!/^[a-z_][a-z0-9_.-]{0,63}$/i.test(user)||typeof keyPath!=='string'||!keyPath||keyPath.length>4096||/[\x00-\x1f\x7f%$]/.test(keyPath))throw new SshTunnelError('ssh_config_invalid');
 return {host:host.toLowerCase(),port,user,keyPath};
}
function paths(home:string,keyPath:string){
 try{
  const directory=realpathSync(join(home,'.ssh')),file=realpathSync(keyPath.startsWith('~/')?join(home,keyPath.slice(2)):keyPath),within=relative(directory,file);
  if(!isAbsolute(keyPath)&&!keyPath.startsWith('~/')||!within||within==='..'||within.startsWith('..'+sep)||isAbsolute(within)||!statSync(file).isFile()||/[\x00-\x1f\x7f%$]/.test(file))throw Error();
  return {key:file,known:join(home,'.ssh','known_hosts')};
 }catch{throw new SshTunnelError('ssh_key_unavailable')}
}
function failure(result:SshExit):SshTunnelCode {
 if(result.error==='missing'||result.error==='spawn')return 'ssh_unavailable';
 const text=result.stderr;
 if(/REMOTE HOST IDENTIFICATION HAS CHANGED|REVOKED HOST KEY|Offending .* key/i.test(text))return 'ssh_host_key_changed';
 if(/Host key verification failed|No .* host key is known|requested strict checking/i.test(text))return 'ssh_host_key_unknown';
 if(/Permission denied|Load key|UNPROTECTED PRIVATE KEY|incorrect passphrase|sign_and_send_pubkey/i.test(text))return 'ssh_auth_failed';
 if(/Address already in use|cannot listen to port|Could not request local forwarding|forwarding request failed/i.test(text))return 'ssh_forward_failed';
 return 'ssh_connect_failed';
}
async function freePort(){const server=createServer();return new Promise<number>((done,reject)=>{server.once('error',()=>reject(new SshTunnelError('ssh_forward_failed')));server.listen(0,'127.0.0.1',()=>{const port=(server.address() as {port:number}).port;server.close(error=>error?reject(new SshTunnelError('ssh_forward_failed')):done(port))})})}
const option=(name:string,value:string)=>['-o',name+'='+value];
const quoted=(value:string)=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')+'"';

/** Lazily owned by Runtime. Settings/route application belong to TS-22c. */
export class SshTunnels {
 private entries=new Map<string,Entry>();private listeners=new Set<(state:SshTunnelSnapshot)=>void>();private closed=false;private closing:Promise<void>|null=null;private generation=0;
 private options:SshTunnelOptions;private clock:Clock;private home:string;private spawn:SshSpawn;
 constructor(options:SshTunnelOptions={}){this.options=options;this.clock=options.clock??systemClock;this.home=resolve(options.home??homedir());this.spawn=options.spawn??spawnSsh;
  if(/[\x00-\x1f\x7f%$]/.test(this.home))throw new SshTunnelError('ssh_config_invalid');
  for(const [name,value]of Object.entries(options))if(['startupTimeoutMs','retryBaseMs','retryMaxMs'].includes(name)&&(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>120000))throw new SshTunnelError('ssh_config_invalid');
 }
 get(id:string){const row=this.entries.get(id);return row?{...row.state}:null}
 snapshots(){return [...this.entries.values()].map(e=>({...e.state}))}
 subscribe(listener:(state:SshTunnelSnapshot)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 private publish(entry:Entry,patch:Partial<SshTunnelSnapshot>){Object.assign(entry.state,patch);for(const listener of this.listeners)try{listener({...entry.state})}catch{}}
 private current(entry:Entry){return !this.closed&&entry.wanted&&this.entries.get(entry.state.id)===entry&&!entry.controller.signal.aborted}
 private assert(entry:Entry){if(!this.current(entry))throw new SshTunnelError('ssh_stopped')}
 async ensure(id:string,input:SshTunnelConfig):Promise<SshTunnelSnapshot>{
  if(this.closed)throw new SshTunnelError('ssh_stopped');if(!idValid(id))throw new SshTunnelError('ssh_config_invalid');const config=configuration(input),stamp=JSON.stringify(config),old=this.entries.get(id);
  if(old?.stamp===stamp&&old.wanted){if(old.job)return old.job;if(old.state.state==='up')return {...old.state};if(old.state.retryAt!==null&&this.clock.now()<old.state.retryAt)throw new SshTunnelError(old.state.code??'ssh_connect_failed');return this.start(old)}
  if(!old&&this.entries.size>=32)throw new SshTunnelError('ssh_capacity');
  const entry:Entry={config,stamp,state:{id,state:'starting',url:null,generation:++this.generation,code:null,reason:null,retryAt:null},wanted:true,failures:0,upAt:null,controller:new AbortController(),job:null,worker:null,control:null,timer:null,directory:null};this.entries.set(id,entry);
  const previous=old?this.stopEntry(old):Promise.resolve();return this.start(entry,previous);
 }
 private start(entry:Entry,previous:Promise<void>=Promise.resolve()){
  if(entry.timer!==null)this.clock.clearTimeout(entry.timer);entry.timer=null;entry.controller=new AbortController();this.publish(entry,{state:'starting',url:null,code:null,reason:null,retryAt:null,generation:++this.generation});
  const job=this.launch(entry,previous);entry.job=job;void job.finally(()=>{if(entry.job===job)entry.job=null}).catch(()=>{});return job;
 }
 private command(entry:Entry,args:string[]){return {binary:this.options.binary??'/usr/bin/ssh',args,cwd:entry.directory!,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:this.home,LC_ALL:'C',SSH_ASKPASS_REQUIRE:'never',...(process.env.SSH_AUTH_SOCK?{SSH_AUTH_SOCK:process.env.SSH_AUTH_SOCK}:{})},onEngineExit:()=>this.cleanup(entry)}}
 private args(entry:Entry,port:number,control:string,key:string,known:string){
  const opts={BatchMode:'yes',ExitOnForwardFailure:'yes',ServerAliveInterval:'15',ServerAliveCountMax:'2',ConnectTimeout:'10',StrictHostKeyChecking:'yes',UserKnownHostsFile:quoted(known),GlobalKnownHostsFile:'/dev/null',CheckHostIP:'no',VerifyHostKeyDNS:'no',UpdateHostKeys:'no',KnownHostsCommand:'none',IdentitiesOnly:'yes',PreferredAuthentications:'publickey',PasswordAuthentication:'no',KbdInteractiveAuthentication:'no',ForwardAgent:'no',ForwardX11:'no',PermitLocalCommand:'no',ProxyCommand:'none',ProxyJump:'none',ControlPersist:'no',ForkAfterAuthentication:'no'};
  return ['-F','/dev/null','-N','-T','-M','-S',control,'-D','127.0.0.1:'+port,'-i',key,'-p',String(entry.config.port),'-l',entry.config.user,...Object.entries(opts).flatMap(([k,v])=>option(k,v)),'--',entry.config.host];
 }
 private async launch(entry:Entry,previous:Promise<void>){
  let timeout:NodeJS.Timeout|undefined,expired=false,code:SshTunnelCode='ssh_connect_failed',worker:SshProcess|null=null;
  try{
   await previous;this.assert(entry);const credentials=paths(this.home,entry.config.keyPath);
   try{if(!statSync(credentials.known).isFile())throw Error()}catch{throw new SshTunnelError('ssh_host_key_unknown')}
   entry.directory=mkdtempSync(join(this.options.temporaryDirectory??tmpdir(),'hssh-'));chmodSync(entry.directory,0o700);const control=join(entry.directory,'s'),port=await freePort();this.assert(entry);
   worker=this.spawn(this.command(entry,this.args(entry,port,control,credentials.key,credentials.known)));entry.worker=worker;
   let exit:SshExit|undefined;const ended=worker.done.then(result=>{exit=result;return result});
   timeout=setTimeout(()=>{expired=true;entry.controller.abort()},this.options.startupTimeoutMs??15000);timeout.unref();
   const abort=()=>{void worker!.stop();void entry.control?.stop()};entry.controller.signal.addEventListener('abort',abort,{once:true});
   try{
    while(!exit){this.assert(entry);
     if(existsSync(control)&&await this.forward(entry,port,control)){this.assert(entry);if(exit)break;if(timeout)clearTimeout(timeout);timeout=undefined;entry.upAt=this.clock.now();this.publish(entry,{state:'up',url:'socks5h://127.0.0.1:'+port});this.assert(entry);
      void ended.then(result=>this.lost(entry,worker!,result));return {...entry.state};
     }
     await Promise.race([ended,delay(100,undefined,{signal:entry.controller.signal})]);
    }
    throw new SshTunnelError(failure(exit!));
   }finally{entry.controller.signal.removeEventListener('abort',abort)}
  }catch(e){code=expired?'ssh_timeout':!entry.wanted||this.closed||this.entries.get(entry.state.id)!==entry?'ssh_stopped':e instanceof SshTunnelError?e.code:'ssh_connect_failed';
   await entry.control?.stop();if(worker)await worker.stop();entry.control=null;entry.worker=null;this.cleanup(entry);
   if(entry.wanted&&this.entries.get(entry.state.id)===entry&&!this.closed)this.down(entry,code);throw new SshTunnelError(code);
  }finally{if(timeout)clearTimeout(timeout)}
 }
 private async forward(entry:Entry,port:number,control:string){
  // -O forward acknowledges the master's own listener, including an existing identical -D.
  // A private 0700 control directory prevents a foreign SOCKS listener from proving readiness.
  const args=['-F','/dev/null','-S',control,'-O','forward','-D','127.0.0.1:'+port,'--',entry.config.host],child=this.spawn(this.command(entry,args));entry.control=child;
  const timeout=setTimeout(()=>void child.stop(),1000);timeout.unref();try{const result=await child.done;return result.code===0&&!result.error}finally{clearTimeout(timeout);if(entry.control===child)entry.control=null}
 }
 private async lost(entry:Entry,worker:SshProcess,result:SshExit){if(entry.worker!==worker)return;entry.worker=null;this.cleanup(entry);if(!entry.wanted||this.closed||this.entries.get(entry.state.id)!==entry)return;
  if(entry.upAt!==null&&this.clock.now()-entry.upAt>=60000)entry.failures=0;this.down(entry,failure(result));
 }
 private down(entry:Entry,code:SshTunnelCode){
  const wait=Math.min(this.options.retryMaxMs??30000,(this.options.retryBaseMs??1000)*2**Math.min(entry.failures++,10)),retryAt=terminal.has(code)?null:this.clock.now()+wait;
  this.publish(entry,{state:'down',url:null,code,reason:reasons[code],retryAt});
  if(retryAt!==null&&entry.wanted&&!this.closed&&this.entries.get(entry.state.id)===entry&&entry.state.state==='down')entry.timer=this.clock.setTimeout(()=>{entry.timer=null;if(entry.wanted&&!this.closed&&this.entries.get(entry.state.id)===entry)void this.start(entry).catch(()=>{})},wait);
 }
 private cleanup(entry:Entry){if(entry.directory){try{rmSync(entry.directory,{recursive:true,force:true})}catch{}entry.directory=null}}
 private async stopEntry(entry:Entry){entry.wanted=false;if(entry.timer!==null)this.clock.clearTimeout(entry.timer);entry.timer=null;entry.controller.abort();this.publish(entry,{state:'stopped',url:null,code:'ssh_stopped',reason:reasons.ssh_stopped,retryAt:null});await Promise.all([entry.control?.stop(),entry.worker?.stop(),entry.job?.catch(()=>{})]);this.cleanup(entry)}
 async stop(id:string){const entry=this.entries.get(id);if(entry){await this.stopEntry(entry);if(this.entries.get(id)===entry)this.entries.delete(id)}}
 close(){if(!this.closing){this.closed=true;this.closing=Promise.all([...this.entries.values()].map(e=>this.stopEntry(e))).then(()=>{this.entries.clear();this.listeners.clear()})}return this.closing}
}
