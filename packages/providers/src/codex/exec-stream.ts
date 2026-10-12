import {ProviderError,record} from '../types.ts';
import type {CliEvent} from '../cli/types.ts';
// Codex exec --json: https://developers.openai.com/codex/noninteractive
export function codexExecStream(){
 let started=false,turn=false,finished=false;const tools=new Set<string>();
 const invalid=()=>new ProviderError('protocol','Codex: неверный поток exec');
 return (value:unknown):CliEvent[]=>{
  if(!record(value)||typeof value.type!=='string'||finished)throw invalid();
  if(value.type==='thread.started'){if(started||typeof value.thread_id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(value.thread_id))throw invalid();started=true;return [{type:'session',id:value.thread_id}]}
  if(value.type==='turn.started'){if(!started||turn)throw invalid();turn=true;return []}
  if(value.type==='error'||value.type==='turn.failed'){finished=true;const e=record(value.error)?value.error:value;const message=typeof e.message==='string'?e.message:'Ход Codex завершился с ошибкой';return [{type:'error',code:/401|sign.?in|unauthoriz/i.test(message)?'not_logged_in':'turn_failed',text:message}]}
  if(!turn)throw invalid();
  if(value.type==='turn.completed'){if(tools.size||!record(value.usage))throw invalid();const u=value.usage,keys=['input_tokens','output_tokens','cached_input_tokens'];if(keys.some(k=>typeof u[k]!=='number'||!Number.isSafeInteger(u[k])||Number(u[k])<0)||Number(u.cached_input_tokens)>Number(u.input_tokens))throw invalid();finished=true;return [{type:'done',usage:{input:Number(u.input_tokens)-Number(u.cached_input_tokens),output:Number(u.output_tokens),cacheRead:Number(u.cached_input_tokens)}}]}
  if(!['item.started','item.updated','item.completed'].includes(value.type)||!record(value.item))throw invalid();const item=value.item;if(typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(item.id)||typeof item.type!=='string')throw invalid();
  if(item.type==='agent_message'){if(typeof item.text!=='string')throw invalid();return value.type==='item.completed'?[{type:'delta',text:item.text}]:[]}
  if(['reasoning','todo_list'].includes(item.type))return [];
  if(!['command_execution','file_change','mcp_tool_call','web_search'].includes(item.type))throw invalid();
  if(item.type==='mcp_tool_call'&&[item.server,item.tool].some(v=>typeof v!=='string'||!/^[-a-zA-Z0-9_.]{1,100}$/.test(v)))throw invalid();
  if(item.type==='command_execution'&&typeof item.command!=='string'||item.type==='file_change'&&!Array.isArray(item.changes)||item.type==='web_search'&&typeof item.query!=='string')throw invalid();
  if(value.type==='item.completed'&&item.type!=='web_search'&&!['completed','failed','declined','rejected'].includes(String(item.status)))throw invalid();
  const out:CliEvent[]=[],name=item.type==='mcp_tool_call'?item.server+'.'+item.tool:item.type;
  if(!tools.has(item.id)){tools.add(item.id);out.push({type:'tool.call',id:item.id,name,input:item})}
  if(value.type==='item.completed'){tools.delete(item.id);const failed=item.status==='failed'||item.status==='declined'||item.status==='rejected'||typeof item.exit_code==='number'&&item.exit_code!==0||!!item.error;out.push({type:'tool.result',id:item.id,output:item,outcome:item.status==='declined'||item.status==='rejected'?'rejected':failed?'failed':'ok',...(failed?{reason:'Ошибка инструмента Codex'}:{})})}return out;
 };
}
