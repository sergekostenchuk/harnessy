import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';

const fail=()=>new ProviderError('protocol','Antigravity: неверный поток ответа');
const nonempty=(v:unknown):v is string=>typeof v==='string'&&!!v&&!/[\x00-\x1f\x7f]/.test(v);
interface Step {kind:string;done:boolean;name?:string}
/** One instance per process. Protocol: https://www.antigravity.google/docs/cli/headless/ .
 * Decoding does not authorize a run: TS-20b keeps process turns unavailable.
 */
export class AntigravityStream {
 private session:string|null=null;private terminal=false;private steps=new Map<number,Step>();
 push(value:unknown):CliEvent[]{
  if(!record(value)||this.terminal||typeof value.event!=='string')throw fail();
  if(value.event==='init'){
   if(this.session!==null||!nonempty(value.conversation_id)||!record(value.init))throw fail();
   this.session=value.conversation_id;return [{type:'session',id:this.session}];
  }
  if(!this.session)throw fail();
  if(value.event==='result'){
   const r=value.result;
   if(!record(r)||r.conversation_id!==this.session||typeof r.status!=='string')throw fail();
   if(['ERROR','CANCELED','INTERRUPTED'].includes(r.status)){
    this.terminal=true;return [{type:'error',code:r.status==='ERROR'?'turn_failed':'cancelled',text:typeof r.error==='string'&&r.error?r.error:'Antigravity: ход не завершён'}];
   }
   if(r.status!=='SUCCESS'||typeof r.response!=='string'||[...this.steps.values()].some(s=>s.kind==='tool'&&!s.done))throw fail();
   this.terminal=true;
   // result.usage and duration_seconds include previous turns on --conversation.
   // Do not report cumulative conversation counters as this turn's consumption.
   return [{type:'done',sessionId:this.session,text:r.response,usage:{input:null,output:null,cacheRead:null}}];
  }
  if(value.event!=='step_update'||!record(value.step_update))throw fail();
  const s=value.step_update,index=s.step_index;
  if(s.conversation_id!==this.session||!Number.isSafeInteger(index)||(index as number)<0||!['user_input','agent_response','tool','checkpoint'].includes(s.step_type as string)||!['ACTIVE','DONE'].includes(s.state as string)||s.text_delta!==undefined&&typeof s.text_delta!=='string')throw fail();
  const previous=this.steps.get(index as number);
  if(previous&&(previous.done||previous.kind!==s.step_type))throw fail();
  const step:Step=previous??{kind:s.step_type as string,done:false},events:CliEvent[]=[];
  if(step.kind==='agent_response'&&typeof s.text_delta==='string'&&s.text_delta)events.push({type:'delta',text:s.text_delta});
  if(step.kind==='tool'){
   const info=s.tool_info;
   if(!record(info))throw fail();
   const name=s.tool_name??info.name;
   if(!nonempty(name)||step.name&&step.name!==name)throw fail();
   const id=this.session+':'+index;
   if(!step.name){events.push({type:'tool.call',id,name,...(info.parameters!==undefined?{input:info.parameters}:{})});step.name=name}
   if(s.state==='DONE'){
    if(info.error!==undefined&&(!record(info.error)||typeof info.error.message!=='string'))throw fail();
    const error=info.error as {message:string}|undefined;
    events.push({type:'tool.result',id,...(info.output!==undefined?{output:info.output}:{}),outcome:error?'failed':'ok',...(error?{reason:error.message}:{})});
   }
  }
  step.done=s.state==='DONE';this.steps.set(index as number,step);return events;
 }
 finish(){if(!this.terminal)throw new ProviderError('transport_lost','Antigravity: поток оборвался до результата')}
}
