export type Api='openai-completions'|'openai-responses'|'anthropic-messages';
export type Reasoning='off'|'minimal'|'low'|'medium'|'high'|'xhigh'|'max';
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type ContentBlock={type:'text';text:string;signature?:string}|{type:'reasoning';text:string;signature?:string;redacted?:boolean}|{type:'image';data:string;mimeType:string}|{type:'tool-call';id:string;name:string;arguments:Record<string,Json>;signature?:string};
export interface Message {role:'system'|'user'|'assistant'|'tool';content:ContentBlock[];toolCallId?:string;toolName?:string;isError?:boolean;replay?:{api:string;provider:string;model:string}}
export interface Tool {name:string;description:string;parameters:Record<string,Json>}
export interface Usage {input:number;output:number;cacheRead:number;cacheWrite:number;totalTokens:number}
export type FailureCode='transport_unsupported'|'route_changed'|'provider_unknown'|'model_unsupported'|'config_invalid'|'settings_unreadable'|'missing_credential'|'credential_unavailable'|'auth'|'rate_limited'|'invalid_request'|'context_overflow'|'provider_error'|'transport'|'timeout'|'cancelled'|'stream_closed'|'empty_response'|'discovery_invalid'|'discovery_unsupported';
export interface Failure {code:FailureCode;reason:string;retryable:boolean}
export type FinishReason='stop'|'length'|'tool-calls'|'error'|'cancelled';
export type StreamChunk={type:'block-start';index:number;blockType:ContentBlock['type']}|{type:'text-delta'|'reasoning-delta';index:number;text:string}|{type:'tool-call-delta';index:number;argumentsDelta:string}|{type:'block-end';index:number;block:ContentBlock}|{type:'usage';usage:Usage}|{type:'finish';reason:FinishReason;failure?:Failure;message?:Message;usage:Usage|null};
export interface GenerateOptions {provider:string;model:string;messages:Message[];tools?:Tool[];maxTokens?:number;temperature?:number;reasoning?:Reasoning;signal?:AbortSignal}
export interface RetryPolicy {mode:'normal'|'always';maxRetries?:number;initialDelayMs?:number;maxDelayMs?:number;jitterRatio?:number}
export type Compat=Record<string,boolean|string>;
export interface ModelConfig {id:string;name?:string;contextWindow?:number;maxTokens?:number;input?:('text'|'image')[];reasoning?:boolean;reasoningEfforts?:Partial<Record<Reasoning,string|null>>;compat?:Compat}
export interface ProviderConfig {displayName?:string;catalog?:string;api?:Api;baseURL?:string;keyRef?:string;models?:ModelConfig[];modelOverrides?:Record<string,Omit<ModelConfig,'id'>>;compat?:Compat;reasoningEfforts?:Partial<Record<Reasoning,string|null>>;defaultContextWindow?:number;defaultMaxTokens?:number;timeoutMs?:number;retryPolicy?:RetryPolicy}
export type ProviderRoutes=Record<string,ProviderConfig>;
export interface ModelInfo {id:string;name:string;api:string;contextWindow:number;maxTokens:number;input:('text'|'image')[];reasoning:boolean;reasoningEfforts?:Partial<Record<Reasoning,string|null>>}
export interface LlmTrace {kind:'llm.request'|'llm.response';requestId:string;provider:string;model:string;outcome:'ok'|'failed'|'cancelled';code?:FailureCode;durationMs:number;usage?:Usage}
export interface LlmDependencies {routes:()=>ProviderRoutes;resolveKey:(keyRef:string)=>Promise<string|null>;trace?:(event:LlmTrace)=>void;fetch?:typeof fetch;subscribeRoutes?:(listener:()=>void)=>()=>void}
export interface DiscoveredModel {id:string;name:string;api?:string;contextWindow?:number;maxTokens?:number;input?:('text'|'image')[];reasoning?:boolean}
export interface RoutesChanged {type:'llm.routes';providers:string[]}
/** One model request; never executes tools or performs retries. Finish is terminal, including setup failures. */
export interface LlmService {
 stream(request:GenerateOptions):AsyncIterable<StreamChunk>;
 routes():ProviderRoutes;
 models(provider:string):ModelInfo[];
 retryPolicy(provider:string):RetryPolicy;
 discover(provider:string,signal?:AbortSignal):Promise<DiscoveredModel[]>;
 onRoutesChanged(listener:(event:RoutesChanged)=>void):()=>void;
}
export type CreateLlmService=(deps:LlmDependencies)=>LlmService;
