import {readdirSync,lstatSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {isIP} from 'node:net';
import {executeCli,hasPublicSecret,ProviderError} from '@harnessy/providers';
import {validRoute} from '@harnessy/llm';
import type {Settings} from './settings.ts';
import type {NetworkSettings} from './network.ts';
import {networkRevision,validateExit,type NetworkExit} from './network-config.ts';
import {ProjectError} from './errors.ts';
export interface ExitCheck {revision:string;checkedAt:number;ok:boolean;ip:string|null;country:string|null;durationMs:number|null;state:'checked'|'matches'|'mismatch'|'failed';reason?:string;code?:string}
interface CheckTunnels {ensure(id:string,config:{host:string;port:number;user:string;keyPath:string}):Promise<{url:string|null;state:string;code?:string|null}>;stop(id:string):Promise<void>}
type Through={fetch:typeof fetch;signal:AbortSignal};
const messages:Record<string,string>={ssh_host_key_unknown:'Ключ хоста ещё не добавлен. Подключитесь к серверу в Терминале и проверьте отпечаток ключа.',ssh_host_key_changed:'Ключ хоста изменился. Проверьте его отпечаток у владельца сервера.',ssh_auth_failed:'Сервер не принял ключ. Проверьте пользователя и добавьте открытый ключ на сервере.',ssh_key_unavailable:'Ключ недоступен. Выберите другой файл из ~/.ssh.',ssh_key_invalid:'Ключ недоступен. Выберите файл внутри ~/.ssh.',ssh_unavailable:'SSH недоступен на этой машине.',ssh_timeout:'Сервер не отвечает. Проверьте адрес и порт.',ssh_connect_failed:'Сервер не отвечает. Проверьте адрес, порт и доступ к сети.',network_proxy_auth:'Неверный логин или пароль прокси. Проверьте данные у поставщика.',network_check_failed:'Адрес не отвечает. Проверьте адрес, порт и доступ к сети.'};
const checkSignature=(exit:NetworkExit,secret:unknown)=>{const {label,price,...fields}=exit;return networkRevision({...fields,password:secret??null})!};
export class NetworkChecks {
 private settings:Settings;private network:NetworkSettings;private execute:typeof executeCli;private sshDir:string;private tunnels:CheckTunnels|undefined;private checks=new Map<string,ExitCheck>();private previews=new Map<string,{signature:string;value:ExitCheck}>();private listeners=new Set<(id:string,value:ExitCheck)=>void>();
 constructor(settings:Settings,network:NetworkSettings,options:{execute?:typeof executeCli;sshDir?:string;tunnels?:CheckTunnels}={}){this.settings=settings;this.network=network;this.execute=options.execute??executeCli;this.sshDir=options.sshDir??join(homedir(),'.ssh');this.tunnels=options.tunnels}
 subscribe(fn:(id:string,value:ExitCheck)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 snapshot(id:string,revision:string){const value=this.checks.get(id);return value?.revision===revision?structuredClone(value):null}
 private remember(id:string,value:ExitCheck){this.checks.set(id,value);for(const fn of this.listeners)try{fn(id,structuredClone(value))}catch{}}
 keys(){
  const result:{name:string;path:string}[]=[];let entries;
  try{if(lstatSync(this.sshDir).isSymbolicLink())throw Error();entries=readdirSync(this.sshDir,{withFileTypes:true})}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw new ProjectError('ssh_keys_unavailable','Список ~/.ssh не читается',409)}
  for(const entry of entries){if(result.length>=256)break;if(!entry.isFile()||entry.isSymbolicLink()||entry.name.endsWith('.pub')||['known_hosts','known_hosts.old','config','authorized_keys'].includes(entry.name)||/[\p{C}]/u.test(entry.name))continue;result.push({name:entry.name,path:'~/.ssh/'+entry.name})}return result.sort((a,b)=>a.name.localeCompare(b.name));
 }
 // Only a measurement from this engine, of the same transport and credentials,
 // can survive the explicit save. Labels and prices do not change the connection.
 saved(raw:unknown,secret:unknown,saved:NetworkExit){const exit=validateExit(raw),preview=this.previews.get(exit.id);if(!preview||preview.signature!==checkSignature(exit,secret)||Date.now()-preview.value.checkedAt>300000)return;this.previews.delete(exit.id);this.remember(saved.id,{...preview.value,revision:networkRevision(saved)!})}
 async preview(raw:unknown,secret:unknown,signal:AbortSignal){
  const exit=validateExit(raw);
  if(exit.type==='direct'||exit.type==='proxy'&&(exit.passwordRef!==undefined||exit.passwordGeneration!==undefined)||secret!==undefined&&(exit.type!=='proxy'||typeof secret!=='string'||!secret.length||Buffer.byteLength(secret)>4096||/[\p{C}]/u.test(secret)))throw new ProjectError('network_invalid','Проверьте адрес и данные для входа');
  const value=await this.measure(exit,networkRevision(exit)!,typeof secret==='string'?secret:null,()=>signal.throwIfAborted(),undefined,signal);
  if(this.previews.size>=256)this.previews.delete(this.previews.keys().next().value!);
  this.previews.set(exit.id,{signature:checkSignature(exit,secret),value});return value;
 }
 async check(id:string,revision:unknown,through?:Through,signal=through?.signal??AbortSignal.timeout(35000)){
  await this.network.migrate();if(!validRoute(id))throw new ProjectError('network_invalid','Некорректный id выхода');const exit=this.settings.network().exits[id];if(!exit)throw new ProjectError('exit_unknown','Выход не найден',404);
  const same=()=>{if(revision!==networkRevision(exit)||revision!==networkRevision(this.settings.network().exits[id]))throw new ProjectError('network_conflict','Выход изменился; повторите проверку',409)};same();
  const secret=exit.type==='proxy'&&!through?await this.network.resolvePassword(exit):null;
  if(exit.type==='proxy'&&exit.passwordRef&&secret===null&&!through)throw new ProjectError('credential_unavailable','Пароль прокси отсутствует в связке ключей',503);same();
  const value=await this.measure(exit,revision as string,secret,same,through,signal);same();this.remember(id,value);return structuredClone(value);
 }
 private async measure(exit:NetworkExit,revision:string,secret:string|null,same:()=>void,through:Through|undefined,signal:AbortSignal){
  const value:ExitCheck={revision,checkedAt:Date.now(),ok:false,ip:null,country:null,durationMs:null,state:'failed'};
  let proxy='',tunnelId:string|undefined;const abortTunnel=()=>{if(tunnelId)void this.tunnels?.stop(tunnelId).catch(()=>{})};
  try{
   signal.throwIfAborted();same();
   if(exit.type==='proxy'&&!through){const url=new URL(exit.url);if(exit.login)url.username=exit.login;if(secret!==null)url.password=secret;proxy=url.toString()}
   if(exit.type==='ssh'&&!through){
    if(!this.tunnels)throw new ProjectError('network_check_unavailable','Проверка после подключения туннеля',409);
    tunnelId='check-'+randomUUID();signal.addEventListener('abort',abortTunnel,{once:true});const tunnel=await this.tunnels.ensure(tunnelId,{host:exit.host,port:exit.port,user:exit.user,keyPath:exit.keyPath});signal.throwIfAborted();same();
    if(tunnel.state!=='up'||!tunnel.url)throw Object.assign(Error(),{code:tunnel.code});if(!/^socks5h:\/\/127\.0\.0\.1:[0-9]+$/.test(tunnel.url))throw Error();proxy=tunnel.url;
   }
   const request=async(url:string,seconds:number)=>{
    same();const combined=AbortSignal.any([signal,AbortSignal.timeout((seconds+2)*1000)]);combined.throwIfAborted();
    if(through){const start=performance.now(),response=await through.fetch(url,{signal:combined,redirect:'error',credentials:'omit'});if(!response.ok||!response.body)throw Error();const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){combined.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)throw Error();parts.push(part.value)}}finally{await reader.cancel().catch(()=>{})}return {code:0,signal:null,stdout:Buffer.concat(parts).toString('utf8')+'\n'+(performance.now()-start)/1000,stderr:''}}
    const input=['silent','show-error','max-time = '+seconds,'proxy = '+JSON.stringify(proxy),'noproxy = ""','url = '+JSON.stringify(url),'write-out = "\\n%{time_total}"'].join('\n');
    const result=await this.execute({binary:'curl',args:['-q','--config','-'],input,cwd:'/',env:{PATH:process.env.PATH},timeoutMs:(seconds+2)*1000,maxBytes:16384},combined);
    if(result.code===67||/\b407\b|authentication failed|user was rejected/i.test(result.stderr))throw new ProviderError('network_proxy_auth',messages.network_proxy_auth!);
    return result;
   };
   const r=await request('https://api.ipify.org?format=json',10);same();if(r.code!==0||r.signal)throw Error();const cut=r.stdout.lastIndexOf('\n'),body=JSON.parse(r.stdout.slice(0,cut)),seconds=Number(r.stdout.slice(cut+1));if(!body||typeof body.ip!=='string'||!isIP(body.ip)||!Number.isFinite(seconds)||seconds<0)throw Error();value.ip=body.ip;value.durationMs=Math.round(seconds*1000);value.ok=true;value.state=exit.expectedIp?exit.expectedIp===value.ip?'matches':'mismatch':'checked';
   try{const geo=await request('https://ipapi.co/'+encodeURIComponent(body.ip)+'/json/',6);if(geo.code===0&&!geo.signal){const country=JSON.parse(geo.stdout.slice(0,geo.stdout.lastIndexOf('\n')))?.country_name;if(typeof country==='string'&&!hasPublicSecret(country)&&!(secret&&country.includes(secret))&&/^[\p{L}\p{M} .()-]{1,100}$/u.test(country))value.country=country}}catch(e){if(e instanceof ProjectError)throw e}if(!value.country)value.reason='Страна не получена';
  }catch(e){if(e instanceof ProjectError)throw e;const code=(e as {code?:string})?.code;value.code=code&&messages[code]?code:'network_check_failed';value.reason=messages[value.code]!}
  finally{signal.removeEventListener('abort',abortTunnel);if(tunnelId)await this.tunnels!.stop(tunnelId)}
  if(signal.aborted)throw new ProviderError('cancelled','Проверка отменена');same();return value;
 }
}
