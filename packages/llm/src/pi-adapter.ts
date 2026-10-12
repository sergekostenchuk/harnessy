import {normalizeContext} from '@earendil-works/pi-ai';
import type {Model,Api,Message as PiMessage,AssistantMessage,Tool as PiTool,AssistantMessageEvent,Usage as PiUsage,TSchema} from '@earendil-works/pi-ai';
import {openAICompletionsApi} from '@earendil-works/pi-ai/api/openai-completions.lazy';
import {openAIResponsesApi} from '@earendil-works/pi-ai/api/openai-responses.lazy';
import {anthropicMessagesApi} from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import {builtinProviders} from '@earendil-works/pi-ai/providers/all';
import {LlmError} from './errors.ts';
import type {ContentBlock,GenerateOptions,Message,Usage} from './types.ts';
const zero:PiUsage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
const factory={'openai-completions':openAICompletionsApi,'openai-responses':openAIResponsesApi,'anthropic-messages':anthropicMessagesApi};
export function usage(u:PiUsage):Usage{return {input:u.input,output:u.output,cacheRead:u.cacheRead,cacheWrite:u.cacheWrite,totalTokens:u.totalTokens}}
function toBlock(b:ContentBlock):AssistantMessage['content'][number]{switch(b.type){case 'text':return {type:'text',text:b.text,...(b.signature?{textSignature:b.signature}:{})};case 'reasoning':return {type:'thinking',thinking:b.text,...(b.signature?{thinkingSignature:b.signature}:{}),...(b.redacted?{redacted:true}:{})};case 'tool-call':return {type:'toolCall',id:b.id,name:b.name,arguments:b.arguments,...(b.signature?{thoughtSignature:b.signature}:{})};default:throw new LlmError('invalid_request')}}
function fromBlock(b:AssistantMessage['content'][number]):ContentBlock{switch(b.type){case 'text':return {type:'text',text:b.text,...(b.textSignature?{signature:b.textSignature}:{})};case 'thinking':return {type:'reasoning',text:b.thinking,...(b.thinkingSignature?{signature:b.thinkingSignature}:{}),...(b.redacted?{redacted:true}:{})};case 'toolCall':return {type:'tool-call',id:b.id,name:b.name,arguments:b.arguments as Extract<ContentBlock,{type:'tool-call'}>['arguments'],...(b.thoughtSignature?{signature:b.thoughtSignature}:{})}}}
export function assistant(message:AssistantMessage):Message{return {role:'assistant',content:message.content.map(fromBlock),replay:{api:message.api,provider:message.provider,model:message.model}}}
export function terminalBlock(event:AssistantMessageEvent):ContentBlock|undefined{if(event.type==='toolcall_end')return fromBlock(event.toolCall);if(event.type==='text_end'||event.type==='thinking_end'){const b=event.partial.content[event.contentIndex];return b?fromBlock(b):undefined}return undefined}
function messages(request:GenerateOptions,model:Model<Api>):PiMessage[]{
 const list:PiMessage[]=request.messages.map(m=>{const timestamp=Date.now();if(m.role==='assistant')return {role:'assistant',content:m.content.map(toBlock),api:m.replay?.api??model.api,provider:m.replay?.provider??model.provider,model:m.replay?.model??model.id,usage:zero,stopReason:m.content.some(b=>b.type==='tool-call')?'toolUse':'stop',timestamp};
 const content=m.content.map(b=>{if(b.type==='text')return {type:'text' as const,text:b.text};if(b.type==='image'&&m.role!=='system'&&model.input.includes('image'))return {type:'image' as const,data:b.data,mimeType:b.mimeType};throw new LlmError('invalid_request')});
 if(m.role==='tool'){if(!m.toolCallId||!m.toolName)throw new LlmError('invalid_request');return {role:'toolResult',toolCallId:m.toolCallId,toolName:m.toolName,isError:m.isError??false,content,timestamp}}
 if(m.role==='system')return {role:'system',content:content.map(b=>{if(b.type!=='text')throw new LlmError('invalid_request');return b}),timestamp};return {role:'user',content,timestamp};
 });
 if(request.tools?.length){const tools=request.tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters as TSchema}) as PiTool);if(list[0]?.role==='system')list[0].toolsAdded=tools;else list.unshift({role:'system',content:'',toolsAdded:tools,timestamp:Date.now()})}return list;
}
export function piStream(model:Model<Api>,request:GenerateOptions,key:string|null,signal:AbortSignal,timeoutMs:number,fetcher:typeof fetch){
 const api=factory[model.api as keyof typeof factory]?.()??builtinProviders().find(p=>p.id===model.provider);if(!api)throw new LlmError('config_invalid');
 // A nonempty explicit key prevents pi-ai from resolving process.env or CLI/OAuth credentials.
 // Keyless local endpoints receive no Authorization header in the fetch boundary below.
 const options={apiKey:key??'harnessy-unauthenticated',signal,timeoutMs,maxRetries:0,fetch:fetcher,maxTokens:request.maxTokens??model.maxTokens,transport:'sse' as const,...(request.temperature!==undefined?{temperature:request.temperature}:{}),...(request.reasoning&&request.reasoning!=='off'?{reasoning:request.reasoning}:{})};
 return api.streamSimple(model,normalizeContext({messages:messages(request,model)}),options);
}
