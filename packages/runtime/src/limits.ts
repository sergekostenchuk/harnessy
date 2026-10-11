import {lstatSync,readFileSync,writeFileSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {record,limitPlan,type Provider,type ProviderLimits,type LimitWindow,type LimitsCode,type Vendor} from '@harnessy/providers';
import type {Clock} from './types.ts';

let nextLimitsRevision=0;
const labels={claude:'Claude',codex:'Codex'},sources={claude:'claude.ai /usage',codex:'Codex app-server'};
const reasons:Record<LimitsCode,string>={limits_unsupported:'лимиты провайдер не отдаёт',limits_not_applicable:'ключ API не имеет окон подписки',limits_auth:'вход по подписке недоступен',limits_rate_limited:'сервис лимитов просит повторить позже',limits_unavailable:'сервис лимитов временно недоступен',limits_invalid:'ответ или сохранённый снимок лимитов повреждён',limits_timeout:'чтение лимитов отменено или превысило время ожидания',limits_storage:'не удалось сохранить снимок лимитов'};
type Saved={vendor:Vendor;plan:string|null;windows:LimitWindow[];fetchedAt:number};
function saved(raw:unknown,vendor:Vendor,now:number):Saved|null{
 if(!record(raw)||!(raw.plan===null||typeof raw.plan==='string'&&limitPlan(raw.plan)===raw.plan)||raw.vendor!==vendor||typeof raw.fetchedAt!=='number'||!Number.isFinite(raw.fetchedAt)||raw.fetchedAt<=0||raw.fetchedAt>now+60||!Array.isArray(raw.windows)||!raw.windows.length||raw.windows.length>20)return null;
 const windows:LimitWindow[]=[];
 for(const w of raw.windows){if(!record(w)||typeof w.label!=='string'||!w.label||w.label.length>80||typeof w.percentUsed!=='number'||!Number.isFinite(w.percentUsed)||w.percentUsed<0||w.percentUsed>100||!Number.isSafeInteger(w.windowMinutes)||Number(w.windowMinutes)<=0||!(w.resetsAt===null||typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&w.resetsAt>0))return null;
 windows.push({label:w.label,percentUsed:w.percentUsed,windowMinutes:Number(w.windowMinutes),resetsAt:w.resetsAt})}
 return {vendor,plan:raw.plan as string|null,windows,fetchedAt:raw.fetchedAt};
}
export class LimitsStore {
 private revision=++nextLimitsRevision;private values=new Map<Vendor,Saved>();private errors=new Map<Vendor,LimitsCode>();private attempts=new Map<Vendor,number>();
 private jobs=new Map<Vendor,Promise<void>>();private aborts=new Set<AbortController>();private timer:unknown;private closed=false;
 private readonly path:string;private dir:string;private clock:Clock;private providers:Partial<Record<Vendor,Provider>>;private publish:()=>void;
 constructor(dir:string,clock:Clock,providers:Partial<Record<Vendor,Provider>>,publish:()=>void){
 this.dir=dir;this.clock=clock;this.providers=providers;this.publish=publish;this.path=join(dir,'.harness/state/limits.json');
 try{
 const stat=lstatSync(this.path);if(!this.safeDirectory()||!stat.isFile()||stat.size>65536)throw Error('not a regular cache');
 const raw:unknown=JSON.parse(readFileSync(this.path,'utf8'));
 if(!record(raw)||raw.version!==1||raw.project!==dir||!Array.isArray(raw.providers))throw Error('invalid cache');
 for(const vendor of Object.keys(providers) as Vendor[]){const row=raw.providers.find(r=>record(r)&&r.vendor===vendor);if(row===undefined)continue;const value=saved(row,vendor,clock.now()/1000);if(value)this.values.set(vendor,value);else this.errors.set(vendor,'limits_invalid')}
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')for(const vendor of Object.keys(providers) as Vendor[])this.errors.set(vendor,'limits_invalid')}
 }
 private safeDirectory(){try{return realpathSync(dirname(this.path))===join(realpathSync(this.dir),'.harness/state')}catch{return false}}
 start(){if(this.closed||this.timer!==undefined)return;this.timer=this.clock.setTimeout(()=>{this.timer=undefined;void this.refresh().finally(()=>this.start())},60000)}
 snapshot(){const now=this.clock.now()/1000;return {ok:true as const,project:this.dir,revision:this.revision,updatedAt:this.values.size?Math.max(...[...this.values.values()].map(v=>v.fetchedAt)):null,
 providers:(Object.keys(this.providers) as Vendor[]).map(vendor=>{const value=this.values.get(vendor),code=this.errors.get(vendor)??(!value?(this.providers[vendor]?.limits?'limits_unavailable':'limits_unsupported'):null);return {vendor,plan:value?.plan??null,status:code==='limits_not_applicable'?'not_applicable':code?'unavailable':'ok',label:labels[vendor],source:sources[vendor],sourceConnected:typeof this.providers[vendor]?.limits==='function',fetchedAt:value?.fetchedAt??null,
 windows:value?.windows.map(w=>({...w,resetsIn:w.resetsAt===null?null:Math.max(0,w.resetsAt-now)}))??[],stale:!value||!!code||now-value.fetchedAt>900,...(code?{code,reason:labels[vendor]+': '+reasons[code]}:{})}})}
 }
 async refresh(vendor?:Vendor,force=false){if(this.closed)return;await Promise.all((vendor?[vendor]:Object.keys(this.providers) as Vendor[]).map(v=>this.refreshVendor(v,force)))}
 private async refreshVendor(vendor:Vendor,force:boolean):Promise<void>{
 if(this.closed)return;const running=this.jobs.get(vendor);if(running){await running;if(force&&!this.closed)return this.refreshVendor(vendor,true);return}
 const provider=this.providers[vendor];if(!provider?.limits){const previous=this.errors.get(vendor)??(this.values.has(vendor)?null:'limits_unsupported');this.errors.set(vendor,'limits_unsupported');if(previous!=='limits_unsupported'){this.revision=++nextLimitsRevision;this.publish()}return}
 const now=this.clock.now(),last=this.attempts.get(vendor);if(!force&&last!==undefined&&now-last<60000)return;this.attempts.set(vendor,now);
 const job=this.read(vendor,provider);this.jobs.set(vendor,job);try{await job}finally{if(this.jobs.get(vendor)===job)this.jobs.delete(vendor)}
 }
 private async read(vendor:Vendor,provider:Provider){
 const abort=new AbortController();this.aborts.add(abort);const timer=this.clock.setTimeout(()=>abort.abort(),10000);
 const cancelled=new Promise<ProviderLimits>(resolve=>abort.signal.addEventListener('abort',()=>resolve({ok:false,code:'limits_timeout',reason:''}),{once:true}));
 try{
 const result=await Promise.race([Promise.resolve().then(()=>provider.limits!(abort.signal)),cancelled]);if(this.closed)return;
 const value=result?.ok===true?saved({...result,vendor},vendor,this.clock.now()/1000):null;
 if(value){this.values.set(vendor,value);this.errors.delete(vendor);this.persist()}
 else {const code=result?.ok===false&&Object.hasOwn(reasons,result.code)?result.code:'limits_invalid';this.errors.set(vendor,code);if(code==='limits_not_applicable'){this.values.delete(vendor);this.persist()}}
 }catch{if(!this.closed)this.errors.set(vendor,'limits_unavailable')}
 finally{this.clock.clearTimeout(timer);this.aborts.delete(abort);if(!this.closed){this.revision=++nextLimitsRevision;this.publish()}}
 }
 private persist(){let temporary:string|undefined;
 try{
 if(!this.safeDirectory())throw Error('unsafe directory');temporary=this.path+'.'+randomUUID()+'.tmp';
 writeFileSync(temporary,JSON.stringify({version:1,project:this.dir,providers:[...this.values.values()]})+'\n',{flag:'wx',mode:0o600});renameSync(temporary,this.path);
 }catch{for(const vendor of this.values.keys())this.errors.set(vendor,'limits_storage')}
 finally{if(temporary)try{unlinkSync(temporary)}catch{}}
 }
 close(){this.closed=true;this.clock.clearTimeout(this.timer);this.timer=undefined;for(const abort of this.aborts)abort.abort()}
}
