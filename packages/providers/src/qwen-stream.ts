import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';

// Qwen 0.24.0 BaseJsonOutputAdapter/buildSystemMessage; no partial messages requested.
export function qwenStream(){let session:string|null=null,finished=false;return (value:unknown):CliEvent[]=>{
 const invalid=():never=>{throw new ProviderError('protocol','Qwen: неверный поток ответа')};
 if(!record(value)||finished||typeof value.session_id!=='string'||!value.session_id)return invalid();
 if(value.type==='system'&&['init','session_start'].includes(value.subtype as string)){
  if(session!==null)return invalid();session=value.session_id;return [{type:'session',id:session}];
 }
 if(session===null||value.session_id!==session)return invalid();
 const child=value.parent_tool_use_id!==undefined&&value.parent_tool_use_id!==null;
 if(child&&typeof value.parent_tool_use_id!=='string')return invalid();
 if(value.type==='assistant'||value.type==='user'){
  if(!record(value.message)||value.message.role!==value.type||!Array.isArray(value.message.content))return invalid();
  return value.message.content.flatMap((block:unknown):CliEvent[]=>{
   if(!record(block))return invalid();
   if(block.type==='text'){if(typeof block.text!=='string')return invalid();return value.type==='assistant'&&!child?[{type:'delta',text:block.text}]:[]}
   if(block.type==='thinking')return [];
   if(block.type==='tool_use'&&value.type==='assistant'){
    if(typeof block.id!=='string'||!block.id||typeof block.name!=='string'||!block.name||!record(block.input))return invalid();
    return [{type:'tool.call',id:block.id,name:block.name,input:block.input}];
   }
   if(block.type==='tool_result'&&value.type==='user'){
    if(typeof block.tool_use_id!=='string'||!block.tool_use_id||typeof block.is_error!=='boolean')return invalid();
    return [{type:'tool.result',id:block.tool_use_id,outcome:block.is_error?'failed':'ok',output:block.content,...(block.is_error?{reason:'Qwen: инструмент завершился с ошибкой'}:{})}];
   }
   // User multimodal input is not an assistant answer or an executable tool event.
   if(value.type==='user'&&['image','audio','video','document'].includes(block.type as string))return [];
   return invalid();
  });
 }
 if(value.type==='result'){
  if(typeof value.is_error!=='boolean')return invalid();
  if(child)return [];
  finished=true;
  if(value.is_error)return [{type:'error',code:'turn_failed',text:record(value.error)&&typeof value.error.message==='string'?value.error.message:'Qwen: ход завершился с ошибкой'}];
  if(value.subtype!=='success'||typeof value.result!=='string')return invalid();
  const usage=record(value.usage)?value.usage:{},number=(key:string)=>{
   const n=usage[key];if(n===undefined)return null;if(typeof n!=='number'||!Number.isFinite(n)||n<0)return invalid();return n;
  },input=number('input_tokens'),cache=number('cache_read_input_tokens');
  if(input!==null&&cache!==null&&cache>input)return invalid();
  // Qwen totalPromptTokens includes cached tokens, unlike Claude input_tokens.
  return [{type:'done',text:value.result,sessionId:session,usage:{input:input!==null&&cache!==null?input-cache:null,output:number('output_tokens'),cacheRead:cache}}];
 }
 if(value.type==='system'&&typeof value.subtype==='string')return [];
 if(value.type==='stream_event'&&record(value.event))return [];
 return invalid();
}}
