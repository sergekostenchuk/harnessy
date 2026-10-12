import {mkdirSync,lstatSync,realpathSync,readFileSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {record,limitsReason,type ProviderCatalog,type CatalogEntry,type ProviderLimits,type LimitWindow} from '@harnessy/providers';
import {atomicJSON} from './limits-cache.ts';
import type {Clock} from './types.ts';
import type {LimitsStore} from './limits.ts';
export type CliLimitsRow=Omit<ReturnType<LimitsStore['snapshot']>['providers'][number],'vendor'|'fetchedAt'|'code'> & {vendor:string;fetchedAt:number|null;checkedAt:number;kind:'subscription';ok:boolean;code?:Failure['code']|'limits_unlimited';unlimited?:boolean};
type AuthBinding=ReturnType<ProviderCatalog['authBinding']>;
interface Value {account:string;plan:string|null;windows:LimitWindow[];fetchedAt:number;unlimited?:true}
interface Cache {version:1;vendor:string;account:string|null;checkedAt:number;nextAttemptAt:number;backoff:number;pending:string|null;value:Value|null;code:'limits_unavailable'|'login_changed'|'limits_unlimited'|null;reason:string|null}
export interface Failure {vendor:string;ok:false;code:'limits_unavailable'|'login_changed';reason:string;checkedAt:number}
const shared=new Map<string,Promise<void>>();let revision=0;
const unavailable=(vendor:string,checkedAt:number,code:Failure['code']='limits_unavailable',reason?:unknown):Failure=>({vendor,ok:false,code,reason:code==='login_changed'?'Вход сменился во время чтения лимитов':limitsReason('limits_unavailable',reason),checkedAt});
export interface LimitsDiagnostic {vendor:string;ok:boolean;code:Failure['code']|'limits_unlimited'|null;reason:string;durationMs:number}
const account=(a:{loggedIn:boolean;email?:string|null})=>a.loggedIn&&typeof a.email==='string'&&/^[^\s@]+@[^\s@]+$/.test(a.email)?a.email.toLowerCase():null;
function measurement(raw:unknown):Value|null{
 if(!record(raw)||typeof raw.account!=='string'||!(raw.plan===null||typeof raw.plan==='string')||typeof raw.fetchedAt!=='number'||!Number.isFinite(raw.fetchedAt)||raw.fetchedAt<=0||!Array.isArray(raw.windows)||raw.windows.length>20||!(raw.unlimited===undefined||raw.unlimited===true)||((raw.unlimited===true)!==(raw.windows.length===0)))return null;
 const windows:LimitWindow[]=[];for(const w of raw.windows){if(!record(w)||typeof w.label!=='string'||!w.label||w.label.length>80||typeof w.percentUsed!=='number'||!Number.isFinite(w.percentUsed)||w.percentUsed<0||w.percentUsed>100||!(w.windowMinutes===null||Number.isSafeInteger(w.windowMinutes)&&Number(w.windowMinutes)>0)||!(w.resetsAt===null||typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&w.resetsAt>0))return null;windows.push({label:w.label,percentUsed:w.percentUsed,windowMinutes:w.windowMinutes===null?null:Number(w.windowMinutes),resetsAt:w.resetsAt})}
 return {account:raw.account,plan:raw.plan,windows,fetchedAt:raw.fetchedAt,...(raw.unlimited===true?{unlimited:true as const}:{})};
}
/** CLI-only reader. The Claude/Codex LimitsStore and Vendor type are unchanged. */
export class ProviderLimitsStore {
 private rows=new Map<string,Cache>();private errors=new Map<string,Failure>();private generation=0;private closed=false;private controllers=new Set<AbortController>();
 private catalog:ProviderCatalog;private clock:Clock;private publish:()=>void;private dir:string;private observe:((event:LimitsDiagnostic)=>void)|undefined;
 constructor(catalog:ProviderCatalog,clock:Clock,publish:()=>void,dir=join(homedir(),'.harnessy/limits'),observe?:(event:LimitsDiagnostic)=>void){this.catalog=catalog;this.clock=clock;this.publish=publish;this.dir=dir;this.observe=observe}
 private path(id:string){if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('invalid vendor');return join(this.dir,id+'.json')}
 private directory(path=this.dir){try{if(!lstatSync(path).isDirectory()||realpathSync(path)!==resolve(path))throw Error('unsafe cache')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;this.directory(dirname(path));try{mkdirSync(path,{mode:0o700})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}if(!lstatSync(path).isDirectory()||realpathSync(path)!==resolve(path))throw Error('unsafe cache')}}
 private load(id:string):Cache|null{
  let fd:number;try{if(realpathSync(this.dir)!==resolve(this.dir))throw Error('unsafe cache');fd=openSync(this.path(id),constants.O_RDONLY|constants.O_NOFOLLOW)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}
  let raw:unknown;try{const s=fstatSync(fd);if(!s.isFile()||s.size>65536)throw Error('invalid cache');raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(fd)))}finally{closeSync(fd)}
  if(!record(raw)||raw.version!==1||raw.vendor!==id||!(raw.account===null||typeof raw.account==='string')||typeof raw.checkedAt!=='number'||!Number.isFinite(raw.checkedAt)||raw.checkedAt<=0||raw.checkedAt>this.clock.now()+60000||typeof raw.nextAttemptAt!=='number'||!Number.isFinite(raw.nextAttemptAt)||raw.nextAttemptAt<raw.checkedAt||!Number.isSafeInteger(raw.backoff)||Number(raw.backoff)<0||Number(raw.backoff)>1800000||!(raw.pending===null||typeof raw.pending==='string'&&/^[0-9a-f-]{36}$/.test(raw.pending))||![null,'limits_unavailable','login_changed','limits_unlimited'].includes(raw.code as never))throw Error('invalid cache');
  if(raw.reason!==undefined&&raw.reason!==null&&typeof raw.reason!=='string')throw Error('invalid cache');
  const value=raw.value===null?null:measurement(raw.value);if(raw.value!==null&&!value||value&&value.account!==raw.account||raw.code==='limits_unlimited'&&!value?.unlimited)throw Error('invalid cache');
  return {version:1,vendor:id,account:raw.account,checkedAt:raw.checkedAt,nextAttemptAt:raw.nextAttemptAt,backoff:Number(raw.backoff),pending:raw.pending,code:raw.code as Cache['code'],reason:raw.code==='limits_unlimited'?limitsReason('limits_unlimited'):raw.code?unavailable(id,raw.checkedAt,raw.code as Failure['code'],raw.reason).reason:null,value};
 }
 private locked<T>(fn:()=>T):T{this.directory();const path=join(this.dir,'coordination.sqlite');try{if(!lstatSync(path).isFile())throw Error('unsafe lock')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}const db=new DatabaseSync(path);try{db.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE');const value=fn();db.exec('COMMIT');return value}finally{db.close()}}
 private bindingChanged(id:string,identity:string|null,expected?:AuthBinding){const current=this.catalog.authBinding(id);return expected!==undefined&&current?.generation!==expected.generation||current!==undefined&&current.identity!==this.catalog.accountIdentity({loggedIn:identity!==null,email:identity})}
 private adopt(id:string,row:Cache|null,error?:Failure,binding?:AuthBinding){
  const before=JSON.stringify([this.rows.get(id),this.errors.get(id)]);row??=this.rows.get(id)??null;
  if(row?this.bindingChanged(id,row.account,binding):binding!==undefined&&this.catalog.authBinding(id)?.generation!==binding.generation){const old=this.errors.get(id);error=old?.code==='login_changed'?old:unavailable(id,this.clock.now(),'login_changed');if(row)row={...row,value:null,code:'login_changed',reason:error.reason}}
  else if(row?.code==='login_changed')error=unavailable(id,row.checkedAt,'login_changed');
  if(!this.closed){if(row)this.rows.set(id,row);if(error)this.errors.set(id,error);else this.errors.delete(id);if(before!==JSON.stringify([this.rows.get(id),this.errors.get(id)])){this.generation=++revision;this.publish()}}
  return {row,error};
 }
 snapshot(){const providers:CliLimitsRow[]=[];for(const entry of this.catalog.limitsEntries()){this.adopt(entry.id,null,this.errors.get(entry.id));const row=this.rows.get(entry.id),error=this.errors.get(entry.id)??(row?.code&&row.code!=='limits_unlimited'?unavailable(entry.id,row.checkedAt,row.code,row.reason):undefined);if(!row&&!error)continue;const v=row?.value;
  providers.push({vendor:entry.id,kind:'subscription',ok:!!v&&!error,account:v?.account??null,plan:v?.plan??null,planLevel:null,extraUsageEnabled:null,status:error?'unavailable':'ok',label:entry.title,source:entry.title+' CLI',sourceConnected:true,fetchedAt:v?.fetchedAt??null,checkedAt:row?.checkedAt??error!.checkedAt,windows:v?.windows.map(w=>({...w,resetsIn:w.resetsAt===null?null:Math.max(0,w.resetsAt-this.clock.now()/1000)}))??[],nextAttemptAt:row?row.nextAttemptAt/1000:null,stale:!v||!!error||this.clock.now()/1000-v.fetchedAt>300,...(v?.unlimited?{unlimited:true}:{}),...(error?{code:error.code,reason:error.reason}:v?.unlimited?{code:'limits_unlimited',reason:limitsReason('limits_unlimited')}:{})});
 }return {revision:this.generation,providers,errors:[...this.errors.values()]}}
 async refresh(){await Promise.all(this.catalog.limitsEntries().map(e=>this.refreshOne(e)))}
 private async refreshOne(entry:CatalogEntry){const key=this.path(entry.id),previous=shared.get(key);if(previous)await previous;if(this.closed)return;
  const job=this.read(entry);shared.set(key,job);try{await job}finally{if(shared.get(key)===job)shared.delete(key)}
 }
 private complete(id:string,token:string,identity:string|null,result:ProviderLimits|null,code:Cache['code'],reason?:string,binding?:AuthBinding):Cache|null{return this.locked(()=>{
  const row=this.load(id);if(!row||row.pending!==token||row.account!==identity)return null;
  // Success, rejection and timeout must all finish against the captured login generation.
  if(this.bindingChanged(id,identity,binding)){code='login_changed';result=null}
  // A confirmed absence of quota is a new measurement, not a retryable failure.
  const unlimited=code==='limits_unlimited'&&identity!==null&&result&&!result.ok&&result.code==='limits_unlimited';
  const value=unlimited?measurement({account:identity,plan:null,windows:[],unlimited:true,fetchedAt:this.clock.now()/1000}):code===null&&result?.ok?measurement({...result,account:identity,fetchedAt:this.clock.now()/1000}):null;
  row.pending=null;row.checkedAt=this.clock.now();row.code=value?(value.unlimited?'limits_unlimited':null):code??'limits_unavailable';row.value=value??(code==='login_changed'?null:row.value);row.reason=row.code==='limits_unlimited'?limitsReason('limits_unlimited'):row.code?unavailable(id,row.checkedAt,row.code,reason??(result&&!result.ok?limitsReason(result.code,result.reason):undefined)).reason:null;
  row.backoff=value?0:Math.min(1800000,Math.max(300000,row.backoff*2));
  const retry=result&&!result.ok&&typeof result.retryAfterSeconds==='number'&&Number.isFinite(result.retryAfterSeconds)?Math.max(0,result.retryAfterSeconds*1000):0;
  row.nextAttemptAt=row.checkedAt+Math.max(value?300000:row.backoff,retry);atomicJSON(this.path(id),row);return row;
 })}
 private async read(entry:CatalogEntry){const id=entry.id,stop=new AbortController(),started=this.clock.now();this.controllers.add(stop);let timer:unknown,token:string|null=null,identity:string|null=null,attempted=false,binding=this.catalog.authBinding(id),diagnostic:Omit<LimitsDiagnostic,'durationMs'>|null=null,stage:'auth'|'storage'|'quota'='storage';
  const aborted=new Promise<never>((_,reject)=>stop.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));timer=this.clock.setTimeout(()=>stop.abort(),15000);
  const wait=<T>(fn:()=>Promise<T>)=>Promise.race([Promise.resolve().then(fn),aborted]);
  const accept=(row:Cache|null,failure?:Failure)=>{const accepted=this.adopt(id,row,failure,attempted?binding:undefined);row=accepted.row;failure=accepted.error;diagnostic={vendor:id,ok:!failure,code:failure?.code??(row?.code==='limits_unlimited'?'limits_unlimited':null),reason:failure?.reason??(row?.code==='limits_unlimited'?limitsReason('limits_unlimited'):'')}};
  try{
   // Reserve the whole attempt, including auth. A cache hit never starts a CLI.
   const claim=this.locked(()=>{const old=this.load(id),now=this.clock.now(),binding=this.catalog.authBinding(id),changed=!!old&&!!binding&&binding.identity!==this.catalog.accountIdentity({loggedIn:old.account!==null,email:old.account});
    if(old&&!changed&&now<old.nextAttemptAt)return {row:old,token:null};
    const token=randomUUID(),row:Cache={version:1,vendor:id,account:old?.account??null,checkedAt:now,nextAttemptAt:now+300000,backoff:old?.backoff??0,pending:token,value:changed?null:old?.value??null,code:changed?'login_changed':old?.code??'limits_unavailable',reason:changed?'Вход сменился во время чтения лимитов':old?.reason??limitsReason('limits_unavailable')};
    atomicJSON(this.path(id),row);return {row,token};
   });token=claim.token;identity=claim.row.account;
   if(!token){accept(claim.row,claim.row.code&&claim.row.code!=='limits_unlimited'?unavailable(id,claim.row.checkedAt,claim.row.code,claim.row.reason):undefined);return}
   attempted=true;stage='auth';const auth=await wait(()=>entry.auth(stop.signal));if(this.closed)return;const observed=account(auth);if(auth.state==='unknown'||auth.loggedIn&&!observed)throw Error('unverified account');identity=observed;
   binding=this.catalog.authBinding(id);
   stage='storage';const bound=this.locked(()=>{const row=this.load(id);if(!row||row.pending!==token)return null;if(row.account!==identity){row.account=identity;row.value=null;row.backoff=0;row.code='limits_unavailable';row.reason=limitsReason('limits_auth');atomicJSON(this.path(id),row)}return row});
   if(!bound){accept(null,unavailable(id,this.clock.now(),'limits_unavailable',limitsReason('limits_storage')));return}
   let result:ProviderLimits|null=null,code:Cache['code']='limits_unavailable',reason=limitsReason('limits_auth');
   if(identity){stage='quota';result=await wait(()=>entry.limits!(stop.signal));
    if(result.ok){code=null;reason=limitsReason('limits_invalid')}else{code=result.code==='limits_unlimited'?'limits_unlimited':'limits_unavailable';reason=limitsReason(result.code,result.reason)}}
   if(this.closed)return;
   stage='storage';const row=this.complete(id,token,identity,result,code,reason,binding);
   accept(row,!row?unavailable(id,this.clock.now(),'limits_unavailable',limitsReason('limits_storage')):row.code&&row.code!=='limits_unlimited'?unavailable(id,row.checkedAt,row.code,row.reason):undefined);
  }catch{attempted=true;if(!this.closed){const reason=limitsReason(stop.signal.aborted?'limits_timeout':stage==='storage'?'limits_storage':stage==='auth'?'limits_auth':'limits_unavailable');let row:Cache|null=null;try{if(token)row=this.complete(id,token,identity,null,'limits_unavailable',reason,binding)}catch{/* Preserve unreadable bytes; adopt validates the memory snapshot's login binding. */}accept(row,unavailable(id,this.clock.now(),'limits_unavailable',reason))}}
  finally{this.clock.clearTimeout(timer);this.controllers.delete(stop);if(!this.closed&&attempted){this.observe?.({...(diagnostic??{vendor:id,ok:true,code:null,reason:''}),durationMs:Math.max(0,this.clock.now()-started)})}}
 }

 close(){this.closed=true;for(const stop of this.controllers)stop.abort()}
}
