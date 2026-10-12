import {ProviderError,record} from './types.ts';
import {waitWithSignal} from './cancellation.ts';
import type {CliModel} from './cli/types.ts';
export const OLLAMA_URL='http://127.0.0.1:11434';
export const OLLAMA_CLOUD_REASON='облачные модели — через Ollama Cloud по API';
export const isOllamaCloudModel=(name:string)=>/(?:[:\-])cloud$/i.test(name);
export const modelId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,179}$/.test(v);
const cloudRequired=()=>new ProviderError('cloud_api_required',OLLAMA_CLOUD_REASON);
export async function ollamaRequest(fetcher:typeof fetch,url:string,timeoutMs:number,signal?:AbortSignal):Promise<unknown>{
 const stop=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs),source='демон Ollama';
 try{return await waitWithSignal(async()=>{
  const response=await fetcher(url,{signal:stop,redirect:'error',credentials:'omit'});
  if(!response.ok){await response.body?.cancel();throw new ProviderError('transport_lost',source+': HTTP '+response.status)}
  const reader=response.body?.getReader();if(!reader)throw new ProviderError('protocol',source+': пустой ответ');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1_048_576)throw new ProviderError('protocol',source+': ответ слишком велик');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new ProviderError('protocol',source+': неверный JSON')}
 },stop)}catch(e){if(signal?.aborted)throw new ProviderError('cancelled',source+': чтение отменено');if(e instanceof ProviderError&&e.code!=='cancelled')throw e;throw new ProviderError('transport_lost',source+': '+(stop.aborted?'истёк срок ожидания':'нет связи'))}
}
interface LocalModel {name:string;remote?:string}
export class OllamaModels {
 readonly reason=OLLAMA_CLOUD_REASON;
 private fetcher:typeof fetch;private httpTimeoutMs:number;
 constructor(fetcher:typeof fetch,httpTimeoutMs:number){this.fetcher=fetcher;this.httpTimeoutMs=httpTimeoutMs}
 private async local(signal?:AbortSignal):Promise<LocalModel[]>{
  const value=await ollamaRequest(this.fetcher,OLLAMA_URL+'/api/tags',this.httpTimeoutMs,signal);
  if(!record(value)||!Array.isArray(value.models)||value.models.length>1000)throw new ProviderError('models_unavailable','Ollama: список моделей не прочитан');
  const seen=new Set<string>();return value.models.map(m=>{if(!record(m)||!modelId(m.name)||seen.has(m.name)||m.remote_model!==undefined&&!modelId(m.remote_model))throw new ProviderError('models_unavailable','Ollama: неверная модель');seen.add(m.name);return {name:m.name,...(m.remote_model?{remote:m.remote_model as string}:{})}});
 }
 async list(signal?:AbortSignal):Promise<CliModel[]>{
  return (await this.local(signal)).filter(m=>!m.remote&&!isOllamaCloudModel(m.name)).map(m=>({id:m.name,label:m.name+' · локально'}));
 }
 async prepare(model:string,signal:AbortSignal){
  if(signal.aborted)throw new ProviderError('cancelled','Чтение моделей отменено');
  // Old saved seats must fail before contacting even the local daemon.
  if(isOllamaCloudModel(model))throw cloudRequired();
  const local=await this.local(signal),found=local.find(m=>m.name===model);
  if(found?.remote)throw cloudRequired();
  if(!found)throw new ProviderError('model_unsupported','Ollama: модель отсутствует в локальном демоне');
 }
}
