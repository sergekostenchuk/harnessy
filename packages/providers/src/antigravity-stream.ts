import {ProviderError,record,type Usage} from './types.ts';
import type {CliEvent} from './cli/types.ts';

const fail=()=>new ProviderError('protocol','Antigravity: неверный поток ответа');
const nonempty=(v:unknown):v is string=>typeof v==='string'&&!!v&&!/[\x00-\x1f\x7f]/.test(v);
interface Step {kind:string;done:boolean;name?:string}
const counter=(value:unknown):number|null=>Number.isSafeInteger(value)&&(value as number)>=0?value as number:null;
/** Cumulative counters are scoped to an actual CLI conversation, not a pane or process. */
export class AntigravityUsageState {
 private previous=new Map<string,Usage>();private unknownResumes=new Set<string>();
 private flights=new Map<string,{current:object|null;uncertain:boolean;overlapped:boolean}>();
 resume(id:string){if(!this.previous.has(id))this.unknownResumes.add(id)}
 start(id:string,turn:object){let flight=this.flights.get(id);if(!flight){flight={current:null,uncertain:false,overlapped:false};this.flights.set(id,flight)}if(flight.current){flight.uncertain=true;flight.overlapped=true}flight.current=turn}
 fail(id:string,turn:object){const flight=this.flights.get(id);if(flight){if(flight.current===turn)flight.current=null;else flight.overlapped=true;flight.uncertain=true}}
 turn(id:string,value:unknown,turn:object):Usage{
  const raw=record(value)?value:{};
  const current:Usage={input:counter(raw.input_tokens),output:counter(raw.output_tokens),cacheRead:counter(raw.cache_read_tokens)};
  const previous=this.previous.get(id),flight=this.flights.get(id),stale=!flight||flight.current!==turn,unknown=(!previous&&this.unknownResumes.has(id))||stale||!!flight?.uncertain;
  const difference=(next:number|null,old:number|null|undefined):number|null=>next===null||unknown||old===null?null:old===undefined?next:next<old?null:next-old;
  const delta:Usage={input:difference(current.input,previous?.input),output:difference(current.output,previous?.output),cacheRead:difference(current.cacheRead,previous?.cacheRead)};
  if(stale){this.previous.set(id,{input:null,output:null,cacheRead:null});if(flight){flight.uncertain=true;flight.overlapped=true}}
  else{this.previous.set(id,flight?.overlapped?{input:null,output:null,cacheRead:null}:current);this.unknownResumes.delete(id);this.flights.delete(id)}
  return delta;
 }
}
/** One instance per process. Protocol: https://www.antigravity.google/docs/cli/headless/ .
 * Decoding does not authorize a run: the descriptor declares the supported modes.
 */
export class AntigravityStream {
 private session:string|null=null;private terminal=false;private steps=new Map<number,Step>();private usageState:AntigravityUsageState;
 constructor(usageState=new AntigravityUsageState()){this.usageState=usageState}
 push(value:unknown):CliEvent[]{
  if(!record(value)||this.terminal||typeof value.event!=='string')throw fail();
  if(value.event==='init'){
   if(this.session!==null||!nonempty(value.conversation_id)||!record(value.init))throw fail();
   this.session=value.conversation_id;this.usageState.start(this.session,this);return [{type:'session',id:this.session}];
  }
  if(!this.session)throw fail();
  if(value.event==='result'){
   const r=value.result;
   if(!record(r)||r.conversation_id!==this.session||typeof r.status!=='string')throw fail();
   if(['ERROR','CANCELED','INTERRUPTED'].includes(r.status)){
    this.terminal=true;this.usageState.fail(this.session,this);return [{type:'error',code:r.status==='ERROR'?'turn_failed':'cancelled',text:typeof r.error==='string'&&r.error?r.error:'Antigravity: ход не завершён'}];
   }
   if(r.status!=='SUCCESS'||typeof r.response!=='string'||[...this.steps.values()].some(s=>s.kind==='tool'&&!s.done))throw fail();
   this.terminal=true;
   // duration_seconds is cumulative too; the CLI driver measures this turn's elapsed time.
   return [{type:'done',sessionId:this.session,text:r.response,usage:this.usageState.turn(this.session,r.usage,this)}];
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
 finish(){if(!this.terminal){if(this.session)this.usageState.fail(this.session,this);throw new ProviderError('transport_lost','Antigravity: поток оборвался до результата')}}
}
