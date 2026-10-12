import {isOllamaCloudRoute,OLLAMA_CLOUD_MODELS_URL} from './presets.ts';
import {catalogModels,modelInfo} from './catalog.ts';
import {validId,isObject} from './config.ts';
import {LlmError,classify} from './errors.ts';
import type {ProviderConfig} from './types.ts';
export async function discover(config:ProviderConfig,key:string|null,fetcher:typeof fetch=fetch,signal?:AbortSignal){
 if(config.catalog&&!config.baseURL)return catalogModels(config.catalog).map(modelInfo);
 if(!config.baseURL)throw new LlmError('discovery_unsupported');
 const api=config.api??'openai-completions';if(!['openai-completions','openai-responses','anthropic-messages'].includes(api))throw new LlmError('discovery_unsupported');
 const cloud=isOllamaCloudRoute(config);if(cloud&&!key)throw new LlmError('missing_credential');
 const url=cloud?OLLAMA_CLOUD_MODELS_URL:config.baseURL.replace(/\/+$/,'')+(api==='anthropic-messages'&&!/\/v1$/.test(config.baseURL)?'/v1':'')+'/models';
 const headers:Record<string,string>={Accept:'application/json'};if(api==='anthropic-messages'){headers['anthropic-version']='2023-06-01';if(key)headers['x-api-key']=key}else if(key)headers.Authorization='Bearer '+key;
 try{const response=await fetcher(url,{headers,redirect:'error',credentials:'omit',signal:signal??AbortSignal.timeout(config.timeoutMs??15000)});if(!response.ok){await response.body?.cancel();throw new LlmError(classify('',response.status))}
  const reader=response.body?.getReader();if(!reader)throw new LlmError('discovery_invalid');let length=0;const chunks:Uint8Array[]=[];try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>2_097_152)throw new LlmError('discovery_invalid');chunks.push(next.value)}}finally{await reader.cancel().catch(()=>{})}
  const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!isObject(data))throw new LlmError('discovery_invalid');const models=cloud?data.models:data.data;if(!Array.isArray(models)||models.length>5000)throw new LlmError('discovery_invalid');
  const seen=new Set<string>();return models.map(value=>{const row=cloud&&isObject(value)?{...value,id:value.name}:value;if(!isObject(row)||!validId(row.id)||key&&row.id.includes(key)||seen.has(row.id))throw new LlmError('discovery_invalid');seen.add(row.id);const name=typeof row.display_name==='string'?row.display_name:typeof row.name==='string'?row.name:row.id;if(name.length>200||/[\x00-\x1f\x7f]/.test(name)||key&&name.includes(key))throw new LlmError('discovery_invalid');return {id:row.id,name}});
 }catch(e){if(signal?.aborted)throw new LlmError('cancelled');if(e instanceof LlmError)throw e;throw new LlmError(e instanceof SyntaxError?'discovery_invalid':'transport')}
}
