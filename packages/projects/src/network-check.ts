import {readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {isIP} from 'node:net';
import {executeCli,hasPublicSecret,ProviderError} from '@harnessy/providers';
import {validRoute} from '@harnessy/llm';
import type {Settings} from './settings.ts';
import type {NetworkSettings} from './network.ts';
import {networkRevision,type NetworkExit} from './network-config.ts';
import {ProjectError} from './errors.ts';
type SshCheck=(exit:Extract<NetworkExit,{type:'ssh'}>)=>Promise<{url:string|null;reason?:string|null;code?:string|null}>;
export interface ExitCheck {code?:string;revision:string;checkedAt:number;ok:boolean;ip:string|null;country:string|null;durationMs:number|null;state:'checked'|'matches'|'mismatch'|'failed';reason?:string}
export class NetworkChecks {
 private settings:Settings;private network:NetworkSettings;private execute:typeof executeCli;private sshDir:string;private ssh:SshCheck|undefined;private checks=new Map<string,ExitCheck>();private listeners=new Set<(id:string,value:ExitCheck)=>void>();
 constructor(settings:Settings,network:NetworkSettings,options:{execute?:typeof executeCli;sshDir?:string;ssh?:SshCheck}={}){this.ssh=options.ssh;this.settings=settings;this.network=network;this.execute=options.execute??executeCli;this.sshDir=options.sshDir??join(homedir(),'.ssh')}
 subscribe(fn:(id:string,value:ExitCheck)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 snapshot(id:string,revision:string){const value=this.checks.get(id);return value?.revision===revision?structuredClone(value):null}
 keys(){
  const result:{name:string;path:string}[]=[];let entries;
  try{if(lstatSync(this.sshDir).isSymbolicLink())throw Error();entries=readdirSync(this.sshDir,{withFileTypes:true})}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw new ProjectError('ssh_keys_unavailable','Список ~/.ssh не читается',409)}
  for(const entry of entries){if(result.length>=256)break;if(!entry.isFile()||entry.isSymbolicLink()||entry.name.endsWith('.pub')||['known_hosts','known_hosts.old','config','authorized_keys'].includes(entry.name)||/[\p{C}]/u.test(entry.name))continue;result.push({name:entry.name,path:'~/.ssh/'+entry.name})}return result.sort((a,b)=>a.name.localeCompare(b.name));
 }
 async check(id:string,revision:unknown,through?:{fetch:typeof fetch;signal:AbortSignal}){
  await this.network.migrate();if(!validRoute(id))throw new ProjectError('network_invalid','Некорректный id выхода');const exit=this.settings.network().exits[id];if(!exit)throw new ProjectError('exit_unknown','Выход не найден',404);
  const same=()=>{if(revision!==networkRevision(exit)||revision!==networkRevision(this.settings.network().exits[id]))throw new ProjectError('network_conflict','Выход изменился; повторите проверку',409)};same();
  if(exit.type==='ssh'&&!through&&!this.ssh)throw new ProjectError('network_check_unavailable','Проверка после подключения туннеля',409);
  let proxy='',secret:string|null=null;if(exit.type==='proxy'&&!through){const url=new URL(exit.url),password=await this.network.resolvePassword(exit);secret=password;if(exit.passwordRef&&password===null)throw new ProjectError('credential_unavailable','Пароль прокси отсутствует в связке ключей',503);if(exit.login)url.username=exit.login;if(password!==null)url.password=password;proxy=url.toString()}same();
  const request=async(url:string,seconds:number)=>{same();if(through){const signal=AbortSignal.any([through.signal,AbortSignal.timeout(seconds*1000)]),start=performance.now();signal.throwIfAborted();const response=await through.fetch(url,{signal,redirect:'error',credentials:'omit'});if(!response.ok||!response.body)throw Error();const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)throw Error();parts.push(part.value)}}finally{await reader.cancel().catch(()=>{})}return {code:0,signal:null,stdout:Buffer.concat(parts).toString('utf8')+'\n'+(performance.now()-start)/1000,stderr:''}}const input=['silent','show-error','max-time = '+seconds,'proxy = '+JSON.stringify(proxy),'noproxy = ""','url = '+JSON.stringify(url),'write-out = "\\n%{time_total}"'].join('\n');return this.execute({binary:'curl',args:['-q','--config','-'],input,cwd:'/',env:{PATH:process.env.PATH},timeoutMs:(seconds+2)*1000,maxBytes:16384},AbortSignal.timeout((seconds+2)*1000))};
  const value:ExitCheck={revision:revision as string,checkedAt:Date.now(),ok:false,ip:null,country:null,durationMs:null,state:'failed'};
  try{if(exit.type==='ssh'&&!through){
    const tunnel=await this.ssh!(exit);same();
    if(!tunnel.url){value.reason=tunnel.reason&&!hasPublicSecret(tunnel.reason)?tunnel.reason.slice(0,400):'VPS не отвечает';if(tunnel.code&&/^ssh_[a-z_]{1,50}$/.test(tunnel.code))value.code=tunnel.code;throw Error()}
    const url=new URL(tunnel.url);if(url.protocol!=='socks5h:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password)throw Error();proxy=url.toString();
   }const r=await request('https://api.ipify.org?format=json',10);same();if(r.code!==0||r.signal)throw Error();const cut=r.stdout.lastIndexOf('\n'),body=JSON.parse(r.stdout.slice(0,cut)),seconds=Number(r.stdout.slice(cut+1));if(!body||typeof body.ip!=='string'||!isIP(body.ip)||!Number.isFinite(seconds)||seconds<0)throw Error();value.ip=body.ip;value.durationMs=Math.round(seconds*1000);value.ok=true;value.state=exit.expectedIp?exit.expectedIp===value.ip?'matches':'mismatch':'checked';
   try{const geo=await request('https://ipapi.co/'+encodeURIComponent(body.ip)+'/json/',6);if(geo.code===0&&!geo.signal){const country=JSON.parse(geo.stdout.slice(0,geo.stdout.lastIndexOf('\n')))?.country_name;if(typeof country==='string'&&!hasPublicSecret(country)&&!(secret&&country.includes(secret))&&/^[\p{L}\p{M} .()-]{1,100}$/u.test(country))value.country=country}}catch(e){if(e instanceof ProjectError)throw e}if(!value.country)value.reason='Страна не получена';
  }catch(e){if(e instanceof ProjectError)throw e;value.reason??='Не удалось получить ответ службы определения IP · проверьте подключение'}
  if(through?.signal.aborted)throw new ProviderError('cancelled','Проверка отменена');same();this.checks.set(id,value);for(const fn of this.listeners)try{fn(id,structuredClone(value))}catch{}return structuredClone(value);
 }
}
