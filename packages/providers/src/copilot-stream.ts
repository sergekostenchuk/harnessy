import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';
const invalid=()=>new ProviderError('protocol','Copilot: неверный поток событий');
const text=(v:unknown):v is string=>typeof v==='string'&&!v.includes('\0');
const id=(v:unknown):v is string=>text(v)&&!!v&&v.length<256;
/** Copilot 1.0.12 schemas/session-events.schema.json + CLI JSONL result envelope. One instance per turn. */
export class CopilotStream {
 private pending:CliEvent[]=[];
 private expected:string|null;
 constructor(expected:string|null=null){this.expected=expected}
 private session:string|null=null;private done=false;private messages=new Map<string,string>();private finished=new Set<string>();
 push(v:unknown):CliEvent[]{
  let events:CliEvent[];
  try{events=this.read(v)}catch(error){this.pending=[];throw error}
  if(events.some(e=>e.type==='error')){this.pending=[];return events}
  if(this.session===null){this.pending.push(...events);return []}
  const pending=this.pending.splice(0);
  if(!pending.length)return events;
  // Establish identity in the common driver before releasing any buffered output.
  return events[0]?.type==='session'?[...events,...pending]:[{type:'session',id:this.session},...pending,...events];
 }
 private read(v:unknown):CliEvent[]{
  if(!record(v)||!text(v.type)||this.done)throw invalid();
  if(v.type==='result'){
   if(!id(v.sessionId)||this.expected!==null&&this.expected!==v.sessionId||this.session!==null&&this.session!==v.sessionId||!Number.isInteger(v.exitCode))throw invalid();this.done=true;
   if(v.exitCode!==0)return [{type:'error',code:'turn_failed',text:'Copilot: ход завершился с ошибкой'}];
   this.session=v.sessionId;
   // CLI result.usage is cumulative for the session and has no per-turn token counters.
   return [{type:'done',sessionId:v.sessionId,usage:{input:null,output:null,cacheRead:null}}];
  }
  if(!record(v.data))throw invalid();const d=v.data;
  if(v.type==='session.start'){if(!id(d.sessionId)||this.expected!==null&&this.expected!==d.sessionId||this.session!==null&&this.session!==d.sessionId)throw invalid();this.session=d.sessionId;return [{type:'session',id:d.sessionId}]}
  if(v.type==='session.error'){if(!text(d.errorType)||!text(d.message))throw invalid();return [{type:'error',code:d.errorType==='authentication'?'not_logged_in':d.errorType==='authorization'?'permission_denied':'turn_failed',text:d.message}]}
  if(v.type==='assistant.message_delta'){
   if(!id(d.messageId)||!text(d.deltaContent)||this.finished.has(d.messageId))throw invalid();this.messages.set(d.messageId,(this.messages.get(d.messageId)??'')+d.deltaContent);return [{type:'delta',text:d.deltaContent}];
  }
  if(v.type==='assistant.message'){
   if(!id(d.messageId)||!text(d.content)||this.finished.has(d.messageId))throw invalid();const previous=this.messages.get(d.messageId)??'';if(!d.content.startsWith(previous))throw invalid();this.finished.add(d.messageId);const suffix=d.content.slice(previous.length);return suffix?[{type:'delta',text:suffix}]:[];
  }
  if(v.type==='tool.execution_start'){if(!id(d.toolCallId)||!id(d.toolName))throw invalid();return [{type:'tool.call',id:d.toolCallId,name:d.toolName,input:d.arguments}]}
  if(v.type==='tool.execution_complete'){
   if(!id(d.toolCallId)||typeof d.success!=='boolean'||!d.success&&(!record(d.error)||!text(d.error.message)))throw invalid();
   return [{type:'tool.result',id:d.toolCallId,outcome:d.success?'ok':record(d.error)&&d.error.code==='permission_denied'?'rejected':'failed',...(d.success?{output:d.result}:{reason:(d.error as {message:string}).message})}];
  }
  if(['assistant.reasoning','assistant.reasoning_delta'].includes(v.type))return [{type:'response'}];
  if(['user.message','session.resume','assistant.turn_start','assistant.turn_end','assistant.reasoning','assistant.reasoning_delta','tool.execution_progress','tool.execution_partial_result','session.info','session.mcp_server_status_changed','session.mcp_servers_loaded','session.tools_updated','subagent.started','subagent.completed','subagent.failed','subagent.selected','abort'].includes(v.type))return [];
  throw invalid();
 }
}
