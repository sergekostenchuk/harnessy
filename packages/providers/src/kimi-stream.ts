import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';

// Kimi Code 2.1.1 PromptJsonWriter: assistant/tool messages then session.resume_hint.
// Retrying/version metadata is not model output; the resume hint follows success.
export function kimiStream(){
 return (v:unknown):CliEvent[]=>{
  const bad=()=>new ProviderError('protocol','Kimi: неверный поток хода');
  if(!record(v))throw bad();
  if(v.role==='meta'){
   if(v.type==='system.version'||v.type==='turn.step.retrying')return [];
   if(v.type!=='session.resume_hint'||typeof v.session_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v.session_id))throw bad();
   return [{type:'done',sessionId:v.session_id}];
  }
  if(v.role==='tool'){
   if(typeof v.tool_call_id!=='string'||!v.tool_call_id||typeof v.content!=='string')throw bad();
   return [{type:'tool.result',id:v.tool_call_id,outcome:'ok',output:v.content}];
  }
  if(v.role!=='assistant'||v.content!==undefined&&typeof v.content!=='string'||v.tool_calls!==undefined&&!Array.isArray(v.tool_calls)||v.content===undefined&&v.tool_calls===undefined)throw bad();
  const events:CliEvent[]=typeof v.content==='string'?[{type:'delta',text:v.content}]:[];
  for(const call of v.tool_calls??[]){
   if(!record(call)||call.type!=='function'||typeof call.id!=='string'||!call.id||!record(call.function)||typeof call.function.name!=='string'||!call.function.name||typeof call.function.arguments!=='string')throw bad();
   let input:unknown;try{input=JSON.parse(call.function.arguments)}catch{throw bad()}
   events.push({type:'tool.call',id:call.id,name:call.function.name,input});
  }
  return events;
 };
}
