import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {record,type Provider,type ProviderLimits,type LimitsCode,type Vendor} from '@harnessy/providers';
import type {Clock} from './types.ts';
import {SharedLimitsCache,saved,limitAccount,atomicJSON,reasons,nextAttempt,type SharedSnapshot,type Saved} from './limits-cache.ts';

let nextLimitsRevision=0;
const sharedJobs=new Map<string,Promise<void>>(),labels={claude:'Claude',codex:'Codex'},sources={claude:'claude.ai /usage',codex:'Codex app-server'};
export class LimitsStore {
 private revision=++nextLimitsRevision;private values=new Map<Vendor,Saved>();private errors=new Map<Vendor,LimitsCode>();private nextAttempts=new Map<Vendor,number>();private turns=new Map<Vendor,number>();
 private jobs=new Map<Vendor,Promise<void>>();private aborts=new Set<AbortController>();private timer:unknown;private closed=false;
 private readonly path:string;private cache:SharedLimitsCache;
 private trace:((vendor:Vendor,result:ProviderLimits)=>void)|undefined;private dir:string;private clock:Clock;private providers:Partial<Record<Vendor,Provider>>;private publish:()=>void;
 constructor(dir:string,clock:Clock,providers:Partial<Record<Vendor,Provider>>,publish:()=>void,sharedDir=join(homedir(),'.harnessy/limits'),trace?:(vendor:Vendor,result:ProviderLimits)=>void){
 this.trace=trace;this.dir=dir;this.clock=clock;this.providers=providers;this.publish=publish;
 this.path=join(dir,'.harness/state/limits.json');this.cache=new SharedLimitsCache(sharedDir,()=>this.clock.now()/1000);
 try{
 const stat=lstatSync(this.path);if(!this.safeDirectory()||!stat.isFile()||stat.size>65536)throw Error('not a regular cache');
 const raw:unknown=JSON.parse(readFileSync(this.path,'utf8'));
 if(!record(raw)||raw.version!==1||raw.project!==dir||!Array.isArray(raw.providers))throw Error('invalid cache');
 for(const vendor of Object.keys(providers) as Vendor[]){const row=raw.providers.find(r=>record(r)&&r.vendor===vendor);if(row===undefined)continue;const value=saved(row,vendor,clock.now()/1000);if(value)this.values.set(vendor,value);else this.errors.set(vendor,'limits_invalid')}
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')for(const vendor of Object.keys(providers) as Vendor[])this.errors.set(vendor,'limits_invalid')}
 for(const vendor of Object.keys(providers) as Vendor[])if(providers[vendor]?.limits)try{const row=this.cache.load(vendor),hadValue=this.values.has(vendor);if(row){this.adopt(row,false);if(row.value||hadValue)this.persist()}}catch{this.errors.set(vendor,'limits_storage')}
 }
 private safeDirectory(){try{return realpathSync(dirname(this.path))===join(realpathSync(this.dir),'.harness/state')}catch{return false}}
 // The minute tick only adopts other engines' snapshots; shared claim() gates network reads to five minutes.
 start(){if(this.closed||this.timer!==undefined)return;this.timer=this.clock.setTimeout(()=>{this.timer=undefined;void this.refresh().finally(()=>this.start())},60000)}
 snapshot(){const now=this.clock.now()/1000;return {ok:true as const,project:this.dir,revision:this.revision,updatedAt:this.values.size?Math.max(...[...this.values.values()].map(v=>v.fetchedAt)):null,
 providers:(Object.keys(this.providers) as Vendor[]).map(vendor=>{const value=this.values.get(vendor),code=this.errors.get(vendor)??(!value?(this.providers[vendor]?.limits?'limits_unavailable':'limits_unsupported'):null);return {vendor,account:value?.account??null,plan:value?.plan??null,planLevel:value?.planLevel??null,extraUsageEnabled:value?.extraUsageEnabled??null,status:code==='limits_not_applicable'?'not_applicable':code?'unavailable':'ok',label:labels[vendor],source:sources[vendor],sourceConnected:typeof this.providers[vendor]?.limits==='function',fetchedAt:value?.fetchedAt??null,
 windows:value?.windows.map(w=>({...w,resetsIn:w.resetsAt===null?null:Math.max(0,w.resetsAt-now)}))??[],...(value?.credits?{credits:value.credits}:{}),...(value?.resetCredits!==undefined?{resetCredits:value.resetCredits}:{}),nextAttemptAt:this.nextAttempts.get(vendor)??null,stale:!value||!!code||now-value.fetchedAt>900,...(code?{code,reason:labels[vendor]+': '+reasons[code]}:{})}})}
 }
 private adopt(row:SharedSnapshot,notify=true){if(this.closed)return;const vendor=row.vendor,before=JSON.stringify([this.values.get(vendor),this.errors.get(vendor),this.nextAttempts.get(vendor)]);
 // A pending or failed attempt may have no shared measurement; only explicit non-applicability clears the last one.
 const previous=this.values.get(vendor);if(row.code==='limits_not_applicable')this.values.delete(vendor);else if(row.value&&(!previous||row.value.fetchedAt>=previous.fetchedAt))this.values.set(vendor,row.value);if(row.code)this.errors.set(vendor,row.code);else this.errors.delete(vendor);this.nextAttempts.set(vendor,nextAttempt(row));
 if(notify&&before!==JSON.stringify([this.values.get(vendor),this.errors.get(vendor),this.nextAttempts.get(vendor)])){this.persist();this.revision=++nextLimitsRevision;this.publish()}
 }
 async refresh(vendor?:Vendor,afterTurn=false){if(this.closed)return;if(vendor&&afterTurn)this.turns.set(vendor,this.clock.now()/1000);await Promise.all((vendor?[vendor]:Object.keys(this.providers) as Vendor[]).map(v=>this.refreshVendor(v,afterTurn)))}
 private async refreshVendor(vendor:Vendor,afterTurn:boolean):Promise<void>{
 if(this.closed)return;const running=this.jobs.get(vendor);if(running){await running;return}
 const provider=this.providers[vendor];if(!provider?.limits){const previous=this.errors.get(vendor)??(this.values.has(vendor)?null:'limits_unsupported');this.errors.set(vendor,'limits_unsupported');if(previous!=='limits_unsupported'){this.revision=++nextLimitsRevision;this.publish()}return}
 const key=this.cache.path(vendor),shared=sharedJobs.get(key);if(shared){const stop=new AbortController();this.aborts.add(stop);try{await Promise.race([shared,new Promise<void>(resolve=>stop.signal.addEventListener('abort',()=>resolve(),{once:true}))])}finally{this.aborts.delete(stop)}if(this.closed)return;return this.refreshVendor(vendor,afterTurn)}
 const job=this.read(vendor,provider,afterTurn||this.turns.has(vendor));this.jobs.set(vendor,job);sharedJobs.set(key,job);try{await job}finally{if(this.jobs.get(vendor)===job)this.jobs.delete(vendor);if(sharedJobs.get(key)===job)sharedJobs.delete(key)}
 }
 private async read(vendor:Vendor,provider:Provider,afterTurn:boolean){
 let token:string|null=null;const abort=new AbortController();this.aborts.add(abort);let timer:unknown;
 try{
 const current=this.cache.load(vendor);if(current&&this.turns.has(vendor)&&current.attemptedAt>this.turns.get(vendor)!){this.turns.delete(vendor);afterTurn=false}if(current&&this.clock.now()/1000<nextAttempt(current,afterTurn)){this.adopt(current);return}
 const claim=this.cache.claim(vendor,afterTurn,this.values.get(vendor)??null);token=claim.token;if(token)this.turns.delete(vendor);if(!token){this.adopt(claim.row);return}
 timer=this.clock.setTimeout(()=>abort.abort(),10000);const cancelled=new Promise<ProviderLimits>(resolve=>abort.signal.addEventListener('abort',()=>resolve({ok:false,code:'limits_timeout',reason:''}),{once:true}));
 const measure=async()=>{
  const identity=async()=>{try{const a=await provider.auth();return a.loggedIn===true?limitAccount(a.email):null}catch{return null}};
  const before=await identity();if(abort.signal.aborted)return {ok:false as const,code:'limits_timeout' as const,reason:''};
  const result=await provider.limits!(abort.signal);if(!result.ok)return result;
  const after=await identity();return {...result,account:before&&before===after?before:null};
 };
 let result:ProviderLimits;try{result=await Promise.race([measure(),cancelled])}catch{result={ok:false,code:'limits_unavailable',reason:''}}
 if(!this.closed)try{this.trace?.(vendor,result)}catch{}
 const row=this.cache.complete(vendor,token,result);if(row)this.adopt(row);
 }catch{if(!this.closed){this.errors.set(vendor,'limits_storage');this.nextAttempts.set(vendor,this.clock.now()/1000+300);this.revision=++nextLimitsRevision;this.publish()}}
 finally{this.clock.clearTimeout(timer);this.aborts.delete(abort)}
 }
 private persist(){try{if(!this.safeDirectory())throw Error('unsafe directory');atomicJSON(this.path,{version:1,project:this.dir,providers:[...this.values.values()]})}catch{for(const vendor of this.values.keys())this.errors.set(vendor,'limits_storage')}}
 close(){this.closed=true;this.clock.clearTimeout(this.timer);this.timer=undefined;for(const abort of this.aborts)abort.abort()}
}
