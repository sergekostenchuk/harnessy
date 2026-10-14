import {setTimeout as delay} from 'node:timers/promises';
import {ProviderError,attachmentSnapshot,record,API_TURN_MODES,type Provider,type Seat,type TurnContext,type Usage,type CliExecutor} from '@harnessy/providers';
import {validRoute,type LlmService,type Message,type StreamChunk,type Failure,type ContentBlock} from '@harnessy/llm';
import {AgentTools} from './agent-tools.ts';
import {untilAbort,cancellable} from './agent-cancel.ts';
import type {WebFetchOptions} from './agent-web.ts';

export const apiRoute=(vendor:string)=>vendor.startsWith('api:')&&validRoute(vendor.slice(4))?vendor.slice(4):null;
export const API_MODES=API_TURN_MODES;
type Finish=Extract<StreamChunk,{type:'finish'}>;
type Call=Extract<ContentBlock,{type:'tool-call'}>;
export interface ApiAgentOptions {service:(signal?:AbortSignal)=>LlmService|Promise<LlmService>;prepareModel?:(model:string,signal:AbortSignal)=>Promise<void>;vendor?:string;maxSteps?:number;maxToolCalls?:number;shell?:CliExecutor;web?:WebFetchOptions;wait?:(ms:number,signal:AbortSignal)=>Promise<void>}
function stopped(signal:AbortSignal){if(signal.aborted)throw new ProviderError('cancelled','Ход отменён')}
const usageEmpty=():Usage=>({input:null,output:null,cacheRead:null});
function protectMessage(service:LlmService,message:Message):Message {
 const safe=service.redact(message);
 for(const kind of ['text','reasoning'] as const){const filter=service.textRedactor();let last:Extract<ContentBlock,{type:typeof kind}>|undefined;
  message.content.forEach((block,index)=>{if(block.type===kind){const target=safe.content[index] as Extract<ContentBlock,{type:typeof kind}>;target.text=filter.push(block.text);last=target}});
  if(last)last.text+=filter.finish();
 }
 return safe;
}

/** One Harnessy turn owns the service and tool loop. Native agent sessions are
 * never created: the runtime supplies the saved Harnessy conversation next turn. */
export class ApiAgent implements Provider {
 readonly vendor:string;readonly route:string;private options:ApiAgentOptions;private active=new Map<AbortController,Promise<void>>();
 constructor(route:string,options:ApiAgentOptions){this.route=route;this.options=options;if(!validRoute(route))throw new ProviderError('provider_unknown','Неизвестный API-маршрут');this.vendor=options.vendor??'api:'+route}
 async models(){return (await this.options.service()).models(this.route).map(m=>({id:m.id,label:m.name,...(m.input.includes('image')?{images:true}:{})}))}
 async auth():ReturnType<Provider['auth']>{return {loggedIn:false,state:'unknown',reason:'Учётные данные проверяются при запросе API'}}
 async listSessions(){return []}
 async sessionMessages():Promise<{role:'me'|'ai';text:string}[]>{throw new ProviderError('session_missing','История API-моделей хранится в разговоре Harnessy')}
 async reset(){const active=[...this.active];for(const [controller]of active)controller.abort();await Promise.all(active.map(([,done])=>done))}
 close(){return this.reset()}
 async runTurn(raw:Seat,prompt:string,ctx:TurnContext){
  if(!record(raw)||raw.vendor!==this.vendor||typeof raw.id!=='string'||typeof raw.cwd!=='string'||!Array.isArray(raw.writePaths)||!raw.writePaths.every(p=>typeof p==='string')||!Object.hasOwn(API_MODES,raw.mode))throw new ProviderError('protocol','Неверная привязка API-места');
  if(API_MODES[raw.mode].ok!==true)throw new ProviderError('mode_unsupported','Этот режим API-модели не подключён');
  if(raw.mode!=='chat'&&!ctx.projectDir)throw new ProviderError('permission_denied','Файловые инструменты требуют проект');
  const seat={...raw,writePaths:[...raw.writePaths]},attachments=attachmentSnapshot(ctx.attachments);
  const controller=new AbortController(),signal=AbortSignal.any([ctx.signal,controller.signal]);let settle!:()=>void;this.active.set(controller,new Promise<void>(done=>{settle=done}));
  let changed=false,text='',measured=false,unknownUsage=false,pendingRequest=false,usage={input:0,output:0,cacheRead:0},calls=0,started=false;const callIds=new Set<string>();
  let unsubscribe=()=>{};
  const messages:Message[]=[{role:'system',content:[{type:'text',text:ctx.roleNote}]},{role:'user',content:[]}];
  const start=performance.now(),maxSteps=this.options.maxSteps??32,maxCalls=this.options.maxToolCalls??128;
  const receipt=()=>ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:Math.round(performance.now()-start),usage:measured?{...usage}:usageEmpty(),...(unknownUsage||pendingRequest?{usageIncomplete:true as const}:{})});
  try{
   let service:LlmService|undefined;
   if(attachments.length){service=await untilAbort(signal,async()=>this.options.service(signal));const model=service.models(this.route).find(m=>m.id===seat.model);if(model&&!model.input.includes('image'))throw new ProviderError('images_unsupported','Выбранная модель не видит изображения')}
   if(this.options.prepareModel)await untilAbort(signal,()=>this.options.prepareModel!(seat.model,signal));
   service??=await untilAbort(signal,async()=>this.options.service(signal));const model=service.models(this.route).find(m=>m.id===seat.model);if(!model)throw new ProviderError('model_unsupported','Модель отсутствует в маршруте');if(attachments.length&&!model.input.includes('image'))throw new ProviderError('images_unsupported','Выбранная модель не видит изображения');
   const route=JSON.stringify(service.routes()[this.route]);
   unsubscribe=service.onRoutesChanged(()=>{let current:string|undefined;try{current=JSON.stringify(service.routes()[this.route])}catch{}if(current!==route){changed=true;controller.abort()}});
   stopped(signal);if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>256||!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>1024)throw new ProviderError('protocol','Неверные пределы агентного цикла');
   const tools=new AgentTools(seat,ctx,signal,this.options.shell,service.redact,this.options.web);
   ctx.setHandle({interrupt:async()=>controller.abort(),steer:async()=>{throw new ProviderError('unknown_request','Сообщение будет передано следующим ходом Harnessy')}});
   for(let step=0;step<maxSteps;step++){
    const policy=service.retryPolicy(this.route);let finish:Finish|undefined;
    for(let retry=0;;retry++){
     stopped(signal);await untilAbort(signal,async()=>ctx.beforeModel?.({provider:this.vendor,model:seat.model}));stopped(signal);
     if(step===0&&retry===0&&!messages[1]!.content.length){const images=attachments.map(attachment=>({type:'image' as const,data:attachment.data.toString('base64'),mimeType:attachment.mime}));messages[1]!.content.push(...images,...(prompt?[{type:'text' as const,text:prompt}]:[]))}
     if(seat.sessionId)throw new ProviderError('session_missing','API-модель использует историю Harnessy');
     if(!started){ctx.modelStarted?.();started=true}
     let emitted='',bytes=0,sawText=false;const filter=service.textRedactor(),publish=(value:string)=>{if(!value)return;if(!emitted&&text){text+='\n\n';ctx.publish({type:'delta',text:'\n\n'})}emitted+=value;text+=value;if(text.length>1024*1024)throw new ProviderError('protocol','Текст хода превысил предел');ctx.publish({type:'delta',text:value})};finish=undefined;pendingRequest=true;
     for await(const chunk of cancellable(service.stream({provider:this.route,model:seat.model,messages:structuredClone(messages),tools:tools.definitions,signal}),signal)){
      stopped(signal);if(chunk.type!=='finish'&&chunk.type!=='usage')ctx.modelResponded?.();if(finish)throw new ProviderError('protocol','Событие после завершения ответа API');
      bytes+=Buffer.byteLength(JSON.stringify(chunk));if(bytes>4*1024*1024)throw new ProviderError('protocol','Ответ API превысил предел');
      if(chunk.type==='text-delta'){
       sawText||=chunk.text.length>0;publish(filter.push(chunk.text));
      }
      if(chunk.type==='finish')finish=chunk;
     }
     stopped(signal);if(!finish)throw new ProviderError('protocol','Поток API завершился без конечного исхода');
     publish(filter.finish());finish={...finish,...(finish.failure?{failure:service.redact(finish.failure)}:{}),...(finish.message?{message:protectMessage(service,finish.message)}:{})};
     pendingRequest=false;if(finish.usage){for(const value of Object.values(finish.usage))if(!Number.isSafeInteger(value)||value<0)throw new ProviderError('protocol','Неверный учёт токенов API');measured=true;usage.input+=finish.usage.input+finish.usage.cacheWrite;usage.output+=finish.usage.output;usage.cacheRead+=finish.usage.cacheRead;if(Object.values(usage).some(v=>!Number.isSafeInteger(v)))throw new ProviderError('protocol','Учёт токенов вне допустимого диапазона')}else unknownUsage=true;
     if(finish.reason==='cancelled')throw new ProviderError('cancelled','Вызов модели отменён');
     if(finish.reason!=='error'){
      if(!finish.message||finish.message.role!=='assistant'||!Array.isArray(finish.message.content))throw new ProviderError('protocol','Нет завершённого сообщения модели');
      const finalText=finish.message.content.filter((b):b is Extract<ContentBlock,{type:'text'}>=>b.type==='text').map(b=>b.text).join('');
      if(emitted&&emitted!==finalText)throw new ProviderError('protocol','Текст потока не совпадает с завершённым ответом');
      if(!emitted&&finalText){const addition=(text?'\n\n':'')+finalText;if(text.length+addition.length>1024*1024)throw new ProviderError('protocol','Текст хода превысил предел');text+=addition;ctx.publish({type:'delta',text:addition})}break;
     }
     const failure=finish.failure;if(!failure)throw new ProviderError('protocol','Нет причины отказа API');
     if(!failure.retryable||sawText||policy.mode!=='always'&&retry>=(policy.maxRetries??5))throw this.failed(failure);
     const base=Math.min(policy.maxDelayMs??30000,(policy.initialDelayMs??1000)*2**Math.min(retry,20)),jitter=policy.jitterRatio??.2,ms=Math.max(1,Math.round(base*(1+jitter*(Math.random()*2-1))));
     ctx.traceEvent?.({id:'api-retry-'+step+'-'+retry,name:'api.retry',phase:'warning',reason:failure.code});
     await untilAbort(signal,()=>this.options.wait?this.options.wait(ms,signal):delay(ms,undefined,{signal}));
    }
    const message=finish.message!,toolCalls=message.content.filter((b):b is Call=>b.type==='tool-call');
    if(finish.reason!=='tool-calls'){if(toolCalls.length)throw new ProviderError('protocol','Вызовы инструментов без разрешающего исхода API');receipt();return {text,sessionId:null}}
    if(!toolCalls.length||calls+toolCalls.length>maxCalls)throw new ProviderError('turn_failed','Достигнут предел вызовов инструментов');
    for(const call of toolCalls){if(typeof call.id!=='string'||!call.id||call.id.length>200||callIds.has(call.id)||typeof call.name!=='string'||!record(call.arguments)||Buffer.byteLength(JSON.stringify(call.arguments))>1024*1024)throw new ProviderError('protocol','Неверный вызов инструмента API');callIds.add(call.id)}
    // Preserve reasoning/signatures/replay, except any reflected route credential.
    messages.push(structuredClone(message));
    for(const call of toolCalls){stopped(signal);calls++;const result=await tools.call(call.name,call.arguments);stopped(signal);messages.push({role:'tool',toolCallId:call.id,toolName:call.name,isError:!result.ok,content:[{type:'text',text:result.ok?result.text:JSON.stringify(result)}]})}
   }
   throw new ProviderError('turn_failed','Достигнут предел шагов агентного цикла');
  }catch(e){
   receipt();if(changed)throw new ProviderError('turn_failed','route_changed: маршрут API изменился');if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');throw e;
  }finally{controller.abort();unsubscribe();ctx.setHandle(null);this.active.delete(controller);settle()}
 }
 private failed(failure:Failure){return new ProviderError(failure.code==='network_unavailable'||failure.code==='network_country_unverified'||failure.code==='network_no_reserve'||failure.code==='network_proxy_auth'?failure.code:failure.code==='model_unsupported'?'model_unsupported':failure.code==='cancelled'?'cancelled':'turn_failed',failure.code+': '+failure.reason)}
}
