import {LlmError} from './errors.ts';
import type {ProviderConfig,ProviderRoutes,ModelConfig,Compat,Reasoning} from './types.ts';
export const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
export const validId=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/+-]{0,199}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
export const validRoute=(x:unknown):x is string=>validId(x)&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
const bad=():never=>{throw new LlmError('config_invalid')};
const fields=(v:unknown,keys:string[]):Record<string,unknown>=>{if(!isObject(v)||Object.keys(v).some(k=>!keys.includes(k)))return bad();return v};
const size=(v:unknown,min:number,max:number)=>{if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)bad()};
const str=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>200||/[\x00-\x1f\x7f]/.test(v))bad()};
export const LEVELS:Reasoning[]=['off','minimal','low','medium','high','xhigh','max'];
function efforts(v:unknown){const obj=fields(v,LEVELS);for(const [k,s] of Object.entries(obj))if(!(k==='off'&&s===null)&&(typeof s!=='string'||!validId(s)))bad()}
export const COMPAT_FIELDS={
 'openai-completions':['supportsStore','supportsDeveloperRole','supportsReasoningEffort','supportsUsageInStreaming','supportsFinishReason','requiresToolResultName','requiresAssistantAfterToolResult','requiresThinkingAsText','requiresReasoningContentOnAssistantMessages','supportsStrictMode','maxTokensField','thinkingFormat','thinkingTokenBudgetField','cacheControlFormat'],
 'openai-responses':['supportsDeveloperRole','supportsStrictMode','supportsMaxOutputTokens','supportsMidConvoSystemMessages'],
 'anthropic-messages':['supportsEagerToolInputStreaming','supportsLongCacheRetention','sendSessionAffinityHeaders','supportsToolCacheControl','forceAdaptiveThinking','allowEmptySignature','supportsStrictTools','supportsMidConvoEffort','supportsMidConvoSystemMessages','supportsMidConvoToolChanges']
} as const;
const enums:Record<string,string[]>={maxTokensField:['max_tokens','max_completion_tokens'],thinkingFormat:['openai','openrouter','deepseek','together','qwen','qwen-chat-template','zai','minimax','kimi'],thinkingTokenBudgetField:['thinking_token_budget','thinking_budget','thinking_budget_tokens'],cacheControlFormat:['anthropic']};
function compat(v:unknown){const obj=fields(v,[...new Set(Object.values(COMPAT_FIELDS).flat())]);for(const [k,x] of Object.entries(obj))if(enums[k]?!enums[k]!.includes(String(x)):typeof x!=='boolean')bad()}
export function validateCompat(api:string,value:Compat|undefined){if(value&&Object.keys(value).some(k=>!(COMPAT_FIELDS[api as keyof typeof COMPAT_FIELDS] as readonly string[]|undefined)?.includes(k)))bad()}
function model(v:unknown,id=true){const m=fields(v,['id','name','contextWindow','maxTokens','input','reasoning','reasoningEfforts','compat']);if(id&&!validId(m.id)||!id&&m.id!==undefined)bad();if(m.name!==undefined)str(m.name);for(const k of ['contextWindow','maxTokens'])if(m[k]!==undefined)size(m[k],1,100_000_000);if(m.input!==undefined&&(!Array.isArray(m.input)||!m.input.length||m.input.some(x=>x!=='text'&&x!=='image')||new Set(m.input).size!==m.input.length))bad();if(m.reasoning!==undefined&&typeof m.reasoning!=='boolean')bad();if(m.reasoningEfforts!==undefined)efforts(m.reasoningEfforts);if(m.compat!==undefined)compat(m.compat)}
export const validGeneration=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function validateProvider(raw:unknown):ProviderConfig{
 const v=fields(raw,['displayName','catalog','api','baseURL','keyRef','keyGeneration','models','modelOverrides','compat','reasoningEfforts','defaultContextWindow','defaultMaxTokens','timeoutMs','retryPolicy']);
 if(v.displayName!==undefined)str(v.displayName);for(const k of ['catalog','keyRef'])if(v[k]!==undefined&&!validRoute(v[k]))bad();
 if(v.keyGeneration!==undefined&&(!validGeneration(v.keyGeneration)||v.keyRef===undefined))bad();
 if(v.api!==undefined&&!['openai-completions','openai-responses','anthropic-messages'].includes(String(v.api)))bad();
 if(v.baseURL!==undefined){if(typeof v.baseURL!=='string'||v.baseURL.length>2048)bad();try{const u=new URL(v.baseURL as string);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))bad()}catch{bad()}}
 for(const k of ['defaultContextWindow','defaultMaxTokens'])if(v[k]!==undefined)size(v[k],1,100_000_000);if(v.timeoutMs!==undefined)size(v.timeoutMs,10,1_800_000);
 if(v.models!==undefined){if(!Array.isArray(v.models)||v.models.length>5000)bad();const seen=new Set();for(const m of v.models as unknown[]){model(m);const id=(m as ModelConfig).id;if(seen.has(id))bad();seen.add(id)}}
 if(v.modelOverrides!==undefined){if(!isObject(v.modelOverrides)||v.models!==undefined)bad();for(const [id,m] of Object.entries(v.modelOverrides as Record<string,unknown>)){if(!validId(id))bad();model(m,false)}}
 if(v.compat!==undefined)compat(v.compat);if(v.reasoningEfforts!==undefined)efforts(v.reasoningEfforts);
 if(v.retryPolicy!==undefined){const r=fields(v.retryPolicy,['mode','maxRetries','initialDelayMs','maxDelayMs','jitterRatio']);if(!['normal','always'].includes(String(r.mode)))bad();if(r.maxRetries!==undefined)size(r.maxRetries,0,100);if(r.mode==='always'&&r.maxRetries!==undefined)bad();for(const k of ['initialDelayMs','maxDelayMs'])if(r[k]!==undefined)size(r[k],1,3_600_000);if(r.initialDelayMs!==undefined&&r.maxDelayMs!==undefined&&Number(r.initialDelayMs)>Number(r.maxDelayMs))bad();if(r.jitterRatio!==undefined&&(typeof r.jitterRatio!=='number'||!Number.isFinite(r.jitterRatio)||r.jitterRatio<0||r.jitterRatio>1))bad()}
 return structuredClone(v) as ProviderConfig;
}
export function validateRoutes(raw:unknown):ProviderRoutes{if(!isObject(raw)||Object.keys(raw as Record<string,unknown>).length>100)bad();return Object.fromEntries(Object.entries(raw as Record<string,unknown>).map(([id,v])=>{if(!validRoute(id))bad();return [id,validateProvider(v)]}))}
