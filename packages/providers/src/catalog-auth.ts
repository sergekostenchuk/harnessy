import {ProviderError} from './types.ts';
import {waitWithSignal} from './cancellation.ts';
import {CATALOG_READ_TIMEOUT_MS} from './catalog-scheduler.ts';
import type {CliAuth} from './cli/types.ts';

/** Share an in-flight login read, never cache permission to run a model. */
export class CatalogAuth {
 private active:{stop:AbortController;work:Promise<CliAuth>;users:number}|undefined;
 private current:{generation:number;identity:string|null}|undefined;
 private read:(signal:AbortSignal)=>Promise<CliAuth>;private identify:(auth:CliAuth)=>string|null;
 constructor(read:(signal:AbortSignal)=>Promise<CliAuth>,identify:(auth:CliAuth)=>string|null){this.read=read;this.identify=identify}
 binding(){return this.current?{...this.current}:undefined}
 async get(signal:AbortSignal=AbortSignal.timeout(CATALOG_READ_TIMEOUT_MS)):Promise<CliAuth>{
  if(signal.aborted)throw new ProviderError('cancelled','Чтение входа отменено');
  let job=this.active;
  if(!job){const stop=new AbortController();job={stop,users:0,work:Promise.resolve().then(()=>waitWithSignal(()=>this.read(stop.signal),stop.signal)).then(auth=>{
   if(!auth||typeof auth.loggedIn!=='boolean')throw new ProviderError('protocol','Состояние входа не прочитано');
   const identity=this.identify(auth);
   if(auth.state!=='unknown'&&(!auth.loggedIn||identity!==null)){const old=this.current;this.current={identity,generation:old?old.generation+Number(old.identity!==identity):1}}
   return auth;
  })};this.active=job;const own=job;void job.work.finally(()=>{if(this.active===own)this.active=undefined}).catch(()=>{})}
  job.users++;try{return {...await waitWithSignal(()=>job.work,signal)}}finally{if(--job.users===0){job.stop.abort();if(this.active===job)this.active=undefined}}
 }
 close(){this.active?.stop.abort()}
}
