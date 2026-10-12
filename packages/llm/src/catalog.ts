import {getBuiltinModels,getBuiltinProviders,type BuiltinProvider} from '@earendil-works/pi-ai/providers/all';
import type {Api,Model} from '@earendil-works/pi-ai';
import {validateRoutes,validateCompat} from './config.ts';
import {LlmError} from './errors.ts';
import type {ProviderConfig,ProviderRoutes,ModelInfo,ModelConfig} from './types.ts';
const keyApis=new Set(['openai-completions','openai-responses','anthropic-messages','mistral-conversations']);
export function catalogProviders(){return getBuiltinProviders().filter(id=>getBuiltinModels(id).some(m=>keyApis.has(m.api)))}
export function catalogModels(id:string):Model<Api>[]{if(!getBuiltinProviders().includes(id as BuiltinProvider))throw new LlmError('config_invalid');const models=getBuiltinModels(id as BuiltinProvider).filter(m=>keyApis.has(m.api));if(!models.length)throw new LlmError('transport_unsupported');return structuredClone(models) as Model<Api>[]}
export function routeModels(id:string,config:ProviderConfig):Model<Api>[] {
 const source=config.catalog??(!config.api&&!config.baseURL&&getBuiltinProviders().includes(id as BuiltinProvider)?id:undefined),base=source?catalogModels(source):[],byId=new Map(base.map(m=>[m.id,m]));
 if(!source&&(!config.api||!config.baseURL||!config.models?.length)||config.modelOverrides&&(!source||Object.keys(config.modelOverrides).some(k=>!byId.has(k))))throw new LlmError('config_invalid');
 const rows:ModelConfig[]=config.models??base.map(m=>({id:m.id,...config.modelOverrides?.[m.id]}));
 return rows.map(row=>{const old=byId.get(row.id),api=config.api??old?.api,url=config.baseURL??old?.baseUrl;
  if(!api||!url||!keyApis.has(api))throw new LlmError('config_invalid');
  validateCompat(api,config.compat);validateCompat(api,row.compat);
  const effort=row.reasoningEfforts??config.reasoningEfforts;
  const m:Model<Api>={...old,id:row.id,name:row.name??old?.name??row.id,api,provider:source??id,baseUrl:url,reasoning:row.reasoning??(effort?Object.keys(effort).some(k=>k!=='off'):old?.reasoning??false),input:row.input??old?.input??['text'],contextWindow:row.contextWindow??old?.contextWindow??config.defaultContextWindow??32768,maxTokens:row.maxTokens??old?.maxTokens??config.defaultMaxTokens??4096,cost:old?.cost??{input:0,output:0,cacheRead:0,cacheWrite:0},...(effort?{thinkingLevelMap:{...effort}}:{})};
  // Changing wire protocol drops incompatible catalog switches and all implicit headers.
  delete m.headers;delete m.compat;const switches={...(old?.api===api?old.compat:{}),...config.compat,...row.compat};if(Object.keys(switches).length)m.compat=switches;
  if(m.maxTokens>m.contextWindow)throw new LlmError('config_invalid');return m;
 });
}
export function validateResolvedRoutes(raw:unknown):ProviderRoutes{const routes=validateRoutes(raw);for(const [id,r]of Object.entries(routes)){if(r.keyRef!==undefined&&r.keyRef!==id)throw new LlmError('config_invalid');routeModels(id,r)}return routes}
export function modelInfo(m:Model<Api>):ModelInfo{return {id:m.id,name:m.name,api:m.api,contextWindow:m.contextWindow,maxTokens:m.maxTokens,input:[...m.input],reasoning:m.reasoning,...(m.thinkingLevelMap?{reasoningEfforts:{...m.thinkingLevelMap}}:{})}}
