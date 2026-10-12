import {ProviderError,record} from './types.ts';
import {waitWithSignal} from './cancellation.ts';
import type {CliModel} from './cli/types.ts';
export const OLLAMA_URL='http://127.0.0.1:11434';
export const OLLAMA_CLOUD_URL='https://ollama.com/api/tags';
export const OLLAMA_MODELS_TTL_MS=300_000;
// Live metadata pulls (no inference) 2026-10-12: 511–683 ms; 10 s permits cold network setup.
export const OLLAMA_PULL_TIMEOUT_MS=10_000;
export const modelId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,179}$/.test(v);
// https://ollama.com/library/gpt-oss:120b-cloud ; untagged models use :cloud.
export function ollamaCloudName(name:string){
 if(!modelId(name)||name.includes('/')||name.split(':').length>2)throw new ProviderError('models_unavailable','Ollama: неверное имя облачной модели');
 const [base,tag]=name.split(':');if(!base||tag==='')throw new ProviderError('models_unavailable','Ollama: неверное имя облачной модели');
 const value=base+':'+(!tag||tag==='latest'?'cloud':tag.endsWith('-cloud')||tag==='cloud'?tag:tag+'-cloud');
 if(!modelId(value)||value.length>160)throw new ProviderError('models_unavailable','Ollama: слишком длинное имя облачной модели');return value;
}
export async function ollamaRequest(fetcher:typeof fetch,url:string,timeoutMs:number,signal?:AbortSignal,body?:{model:string;stream:false}):Promise<unknown>{
 const stop=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs),source=url===OLLAMA_CLOUD_URL?'облачный каталог':body?'добавление модели':'демон Ollama';
 try{return await waitWithSignal(async()=>{
  const response=await fetcher(url,{signal:stop,redirect:'error',credentials:'omit',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!response.ok){await response.body?.cancel();throw new ProviderError('transport_lost',source+': HTTP '+response.status)}
  const reader=response.body?.getReader();if(!reader)throw new ProviderError('protocol',source+': пустой ответ');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1_048_576)throw new ProviderError('protocol',source+': ответ слишком велик');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new ProviderError('protocol',source+': неверный JSON')}
 },stop)}catch(e){if(signal?.aborted)throw new ProviderError('cancelled',source+': чтение отменено');if(e instanceof ProviderError&&e.code!=='cancelled')throw e;throw new ProviderError('transport_lost',source+': '+(stop.aborted?'истёк срок ожидания':'нет связи'))}
}
interface PullJob {controller:AbortController;waiters:number;settled:boolean;done:Promise<void>}
interface LocalModel {name:string;remote?:string}
export class OllamaModels {
 reason:string|undefined;
 private pulls=new Map<string,PullJob>();
 private cloud:CliModel[]=[];private attemptedAt:number|null=null;private generation=0;
 private fetcher:typeof fetch;private httpTimeoutMs:number;private pullTimeoutMs:number;private now:()=>number;
 constructor(fetcher:typeof fetch,httpTimeoutMs:number,pullTimeoutMs=OLLAMA_PULL_TIMEOUT_MS,now:()=>number=Date.now){this.fetcher=fetcher;this.httpTimeoutMs=httpTimeoutMs;this.pullTimeoutMs=pullTimeoutMs;this.now=now}
 private async local(signal?:AbortSignal):Promise<LocalModel[]>{
  const value=await ollamaRequest(this.fetcher,OLLAMA_URL+'/api/tags',this.httpTimeoutMs,signal);
  if(!record(value)||!Array.isArray(value.models)||value.models.length>1000)throw new ProviderError('models_unavailable','Ollama: список моделей не прочитан');
  const seen=new Set<string>();return value.models.map(m=>{if(!record(m)||!modelId(m.name)||seen.has(m.name)||m.remote_model!==undefined&&!modelId(m.remote_model))throw new ProviderError('models_unavailable','Ollama: неверная модель');seen.add(m.name);return {name:m.name,...(m.remote_model?{remote:m.remote_model as string}:{})}});
 }
 private async remote(signal?:AbortSignal,force=false){
  if(!force&&this.attemptedAt!==null&&this.now()-this.attemptedAt<OLLAMA_MODELS_TTL_MS)return;
  const generation=++this.generation;
  try{
   const value=await ollamaRequest(this.fetcher,OLLAMA_CLOUD_URL,this.httpTimeoutMs,signal);
   if(!record(value)||!Array.isArray(value.models)||value.models.length>1000)throw new ProviderError('models_unavailable','облачный каталог: нет списка моделей');
   const seen=new Set<string>(),models=value.models.map(m=>{if(!record(m)||!modelId(m.name))throw new ProviderError('models_unavailable','облачный каталог: неверная модель');const id=ollamaCloudName(m.name);if(seen.has(id))throw new ProviderError('models_unavailable','облачный каталог: повтор модели');seen.add(id);return {id,label:id+' · облако'}});
   if(generation!==this.generation)return;this.cloud=models;this.reason=undefined;
  }catch(e){if(signal?.aborted)throw e;if(generation!==this.generation)return;this.reason='Не удалось обновить облачный каталог · '+(e instanceof ProviderError?e.vendorText:'ошибка чтения')}
  this.attemptedAt=this.now();
 }
 async list(signal?:AbortSignal,refresh=false):Promise<CliModel[]>{
  const local=await this.local(signal);await this.remote(signal,refresh);const installed=new Set(local.map(m=>m.name));
  // A daemon may have a shorter alias, e.g. gemma4:cloud → gemma4:31b.
  for(const m of local)if(m.remote)try{installed.add(ollamaCloudName(m.remote))}catch{/* An unrelated local registry name is not a service model. */}
  return [...local.map(m=>({id:m.name,label:m.name+' · '+(m.remote||/(?:[:\-])cloud$/.test(m.name)?'облако':'локально')})),...this.cloud.filter(m=>!installed.has(m.id)).map(m=>({...m,label:m.label+' · добавится при первом ходе'}))];
 }
 // Publish the operation before its first read: absence-check and pull are one shared job.
 async prepare(model:string,signal:AbortSignal){
  if(signal.aborted)throw new ProviderError('cancelled','Добавление модели отменено');
  let job=this.pulls.get(model);
  if(!job){
   const created:PullJob={controller:new AbortController(),waiters:0,settled:false,done:Promise.resolve()};this.pulls.set(model,created);
   created.done=this.pull(model,created.controller.signal).finally(()=>{created.settled=true;if(this.pulls.get(model)===created)this.pulls.delete(model)});
   void created.done.catch(()=>{}); // All subscribers may cancel before the shared request settles.
   job=created;
  }
  job.waiters++;
  try{await waitWithSignal(()=>job!.done,signal)}
  finally{job.waiters--;if(!job.waiters&&!job.settled){job.controller.abort();if(this.pulls.get(model)===job)this.pulls.delete(model)}}
 }
 private async pull(model:string,signal:AbortSignal){
  if((await this.local(signal)).some(m=>m.name===model))return;
  await this.remote(signal);
  if(!this.cloud.some(m=>m.id===model))throw new ProviderError('model_unsupported','Ollama: модель отсутствует в облачном каталоге');
  const result=await ollamaRequest(this.fetcher,OLLAMA_URL+'/api/pull',this.pullTimeoutMs,signal,{model,stream:false});
  if(!record(result)||result.status!=='success'||result.error!==undefined)throw new ProviderError('turn_failed','Ollama: демон не подтвердил добавление модели');
  if(!(await this.local(signal)).some(m=>m.name===model))throw new ProviderError('turn_failed','Ollama: добавленная модель отсутствует в демоне');
 }
}
