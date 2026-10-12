import {isOllamaCloudRoute} from './presets.ts';
import {randomUUID} from 'node:crypto';
import {SecretRedactor} from './redaction.ts';
import {routeModels,modelInfo,validateResolvedRoutes,catalogProviders,validateDiscoveryDraft} from './catalog.ts';
import {discover} from './discovery.ts';
import {piStream,assistant,terminalBlock,usage} from './pi-adapter.ts';
import {LlmError,classify,failure} from './errors.ts';
import {isObject,validId,validRoute,LEVELS} from './config.ts';
import type {LlmDependencies,LlmService,GenerateOptions,StreamChunk,ProviderConfig,Usage,FailureCode,Message} from './types.ts';
export function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{if(signal.aborted)return Promise.reject(new LlmError('cancelled'));return new Promise((resolve,reject)=>{const abort=()=>reject(new LlmError('cancelled'));signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort)).catch(()=>{})})}
function validRequest(r:GenerateOptions){
 if(!isObject(r)||!validRoute(r.provider)||!validId(r.model)||!Array.isArray(r.messages)||!r.messages.length||r.messages.length>10000)throw new LlmError('invalid_request');
 if(r.maxTokens!==undefined&&(!Number.isSafeInteger(r.maxTokens)||r.maxTokens<1)||r.temperature!==undefined&&(!Number.isFinite(r.temperature)||r.temperature<0||r.temperature>2)||r.reasoning!==undefined&&!LEVELS.includes(r.reasoning))throw new LlmError('invalid_request');
 for(const m of r.messages){if(!isObject(m)||!['system','user','assistant','tool'].includes(m.role as string)||!Array.isArray(m.content))throw new LlmError('invalid_request');for(const b of m.content){if(!isObject(b))throw new LlmError('invalid_request');if(b.type==='text'||b.type==='reasoning'){if(typeof b.text!=='string'||b.signature!==undefined&&typeof b.signature!=='string'||b.type==='reasoning'&&b.redacted!==undefined&&typeof b.redacted!=='boolean')throw new LlmError('invalid_request')}else if(b.type==='image'){if(typeof b.data!=='string'||typeof b.mimeType!=='string'||b.data.length>28_000_000)throw new LlmError('invalid_request')}else if(b.type==='tool-call'){if(typeof b.id!=='string'||! /^[\x21-\x7e]{1,512}$/.test(b.id)||typeof b.name!=='string'||! /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(b.name)||!isObject(b.arguments))throw new LlmError('invalid_request')}else throw new LlmError('invalid_request')}}
 const names=new Set();if(r.tools!==undefined){if(!Array.isArray(r.tools)||r.tools.length>256)throw new LlmError('invalid_request');for(const t of r.tools){if(!isObject(t)||typeof t.name!=='string'||!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(t.name)||typeof t.description!=='string'||!isObject(t.parameters)||t.parameters.type!=='object'||names.has(t.name))throw new LlmError('invalid_request');names.add(t.name)}}
}
export function createLlmService(deps:LlmDependencies):LlmService {
 const protection=new SecretRedactor();
 const routes=()=>validateResolvedRoutes(deps.routes());
 const route=(id:string)=>{const all=routes();if(!validRoute(id)||!Object.hasOwn(all,id))throw new LlmError('provider_unknown');return all[id]!};
 const resolveKey=async(r:ProviderConfig,signal:AbortSignal)=>{if(!r.keyRef){if(isOllamaCloudRoute(r))throw new LlmError('missing_credential');return null;}let key;try{key=await abortable(deps.resolveKey(r.keyRef,r.keyGeneration),signal)}catch(e){if(signal.aborted)throw new LlmError('cancelled');throw new LlmError('credential_unavailable')}if(!key)throw new LlmError('missing_credential');if(!/^[\x21-\x7e]{1,4096}$/.test(key))throw new LlmError('credential_unavailable');protection.add(key);return key};
 const service:LlmService={
 redact:protection.redact,textRedactor:protection.textRedactor,
 routes,models:id=>routeModels(id,route(id)).map(modelInfo),retryPolicy:id=>structuredClone(route(id).retryPolicy??{mode:'normal',maxRetries:5,initialDelayMs:1000,maxDelayMs:30000,jitterRatio:.2}),
 onRoutesChanged(listener){return deps.subscribeRoutes?.(()=>{try{listener({type:'llm.routes',providers:Object.keys(routes())})}catch{}})??(()=>{})},
 async discover(id,signal){const r=route(id);if(!r.baseURL&&catalogProviders().includes((r.catalog??id) as never))return routeModels(id,r).map(modelInfo);const timer=new AbortController(),combined=signal?AbortSignal.any([signal,timer.signal]):timer.signal,t=setTimeout(()=>timer.abort(),r.timeoutMs??15000);try{const key=await resolveKey(r,combined);let current;try{current=route(id)}catch{throw new LlmError('route_changed')}if(JSON.stringify(current)!==JSON.stringify(r))throw new LlmError('route_changed');return await abortable(discover(r,key,deps.fetch,combined),combined)}catch(e){if(timer.signal.aborted&&!signal?.aborted)throw new LlmError('timeout');throw e}finally{clearTimeout(t)}},
 stream(input){
  // Capture the route and request NOW, before an await or consumer delay can mix settings generations.
  let request:GenerateOptions,config:ProviderConfig,setup:FailureCode|undefined;
  try{validRequest(input);const {signal:callerSignal,...copy}=input;request={...structuredClone(copy),...(callerSignal?{signal:callerSignal}:{})};config=route(request.provider)}catch(e){setup=e instanceof LlmError?e.code:'invalid_request';request=input;config={}}
  const started=performance.now(),requestId=randomUUID();
  const trace=(kind:'llm.request'|'llm.response',code?:FailureCode,u?:Usage)=>{try{deps.trace?.({kind,requestId,provider:validRoute(input?.provider)?input.provider:'invalid',model:validId(input?.model)?input.model:'invalid',outcome:code==='cancelled'?'cancelled':code?'failed':'ok',...(code?{code}:{}),durationMs:Math.round(performance.now()-started),...(u?{usage:u}:{})})}catch{}};
  return (async function*():AsyncGenerator<StreamChunk>{
   const controller=new AbortController(),signal=request?.signal?AbortSignal.any([request.signal,controller.signal]):controller.signal,timer=setTimeout(()=>controller.abort(),config.timeoutMs??300000);let terminal=false,u:Usage|null=null,status:number|undefined;let boundaryFailure:FailureCode|undefined;
   trace('llm.request');
   try{if(setup)throw new LlmError(setup);if(signal.aborted)throw new LlmError('cancelled');const model=routeModels(request.provider,config).find(m=>m.id===request.model);if(!model)throw new LlmError('model_unsupported');if(request.maxTokens!==undefined&&request.maxTokens>model.maxTokens)throw new LlmError('invalid_request');
    const efforts=config.models?.find(m=>m.id===model.id)?.reasoningEfforts??config.modelOverrides?.[model.id]?.reasoningEfforts??config.reasoningEfforts;
    if(request.reasoning&&request.reasoning!=='off'&&(!model.reasoning||efforts&&!Object.hasOwn(efforts,request.reasoning)))throw new LlmError('invalid_request');
    const key=await resolveKey(config,signal);if(signal.aborted)throw new LlmError('cancelled');
    const fetcher:typeof fetch=async(url,init)=>{const headers=new Headers(init?.headers??(url instanceof Request?url.headers:undefined));if(!key){headers.delete('authorization');headers.delete('x-api-key');headers.delete('x-goog-api-key')}
     let current;try{current=route(request.provider)}catch{boundaryFailure='route_changed';throw new LlmError('route_changed')}if(JSON.stringify(current)!==JSON.stringify(config)){boundaryFailure='route_changed';throw new LlmError('route_changed')};
     const result=await (deps.fetch??fetch)(url,{...init,headers,signal,redirect:'error',credentials:'omit'});status=result.status;return result};
    const events=piStream(model,request,key,signal,config.timeoutMs??300000,fetcher)[Symbol.asyncIterator]();
    for(;;){const next=await abortable(events.next(),signal);if(next.done)break;const e=next.value;
     if(e.type==='text_start'||e.type==='thinking_start'||e.type==='toolcall_start')yield {type:'block-start',index:e.contentIndex,blockType:e.type==='text_start'?'text':e.type==='thinking_start'?'reasoning':'tool-call'};
     else if(e.type==='text_delta'||e.type==='thinking_delta')yield {type:e.type==='text_delta'?'text-delta':'reasoning-delta',index:e.contentIndex,text:e.delta};
     else if(e.type==='toolcall_delta')yield {type:'tool-call-delta',index:e.contentIndex,argumentsDelta:e.delta};
     else if(e.type==='text_end'||e.type==='thinking_end'||e.type==='toolcall_end'){const block=terminalBlock(e);if(!block)throw new LlmError('stream_closed');yield {type:'block-end',index:e.contentIndex,block}}
     else if(e.type==='error'){const counts=usage(e.error.usage);u=Object.values(counts).some(n=>n>0)?counts:null;throw new LlmError(signal.aborted?'cancelled':boundaryFailure??classify(e.error.errorMessage??'',status))}
     else if(e.type==='done'){
      u=usage(e.message.usage);if(!e.message.content.length)throw new LlmError('empty_response');if(!['stop','length','toolUse'].includes(e.message.stopReason))throw new LlmError('provider_error');
      yield {type:'usage',usage:u};terminal=true;trace('llm.response',undefined,u);yield {type:'finish',reason:e.message.stopReason==='toolUse'?'tool-calls':e.message.stopReason==='length'?'length':'stop',message:assistant(e.message),usage:u};return;
     }
    }throw new LlmError('stream_closed');
   }catch(e){const code=request?.signal?.aborted?'cancelled':controller.signal.aborted?'timeout':e instanceof LlmError?e.code:'provider_error';terminal=true;trace('llm.response',code,u??undefined);yield {type:'finish',reason:code==='cancelled'?'cancelled':'error',failure:failure(code),usage:u}}
   finally{clearTimeout(timer);controller.abort();if(!terminal)trace('llm.response','cancelled',u??undefined)}
  })();
 }
 };return service;
}

export async function discoverDraft(id:string,raw:unknown,deps:Pick<LlmDependencies,'resolveKey'|'fetch'>,signal?:AbortSignal){
 const config=validateDiscoveryDraft(id,raw);if(!config.baseURL)return routeModels(id,config).map(modelInfo);const timer=new AbortController(),combined=signal?AbortSignal.any([signal,timer.signal]):timer.signal,t=setTimeout(()=>timer.abort(),config.timeoutMs??15000);
 try{const key=config.keyRef?await abortable(deps.resolveKey(config.keyRef,config.keyGeneration),combined):null;if(config.keyRef&&!key)throw new LlmError('missing_credential');if(key&&!/^[\x21-\x7e]{1,4096}$/.test(key))throw new LlmError('credential_unavailable');return await abortable(discover(config,key,deps.fetch,combined),combined)}catch(e){if(timer.signal.aborted&&!signal?.aborted)throw new LlmError('timeout');if(e instanceof LlmError)throw e;throw new LlmError('credential_unavailable')}finally{clearTimeout(t)}
}
