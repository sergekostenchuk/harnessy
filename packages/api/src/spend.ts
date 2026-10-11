import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseCompat} from '@harnessy/journal';
import {RuntimeError,type Runtime} from '@harnessy/runtime';
import {text} from './responses.ts';

type Outcome='ok'|'interrupted'|'error'|'unknown';
type Period='7'|'30'|'90'|'all';
type Row=Record<string,unknown>;
function object(value:unknown):value is Row {return !!value&&typeof value==='object'&&!Array.isArray(value)}
interface Metrics {turns:number;input:number;output:number;cacheRead:number;durationMs:number;averageDurationMs:number|null;durationSamples:number;outcomes:Record<Outcome,number>;missingMeasurements:number}
interface Candidate {message:Row;pane:string;chat:string;title:string}
const metrics=():Metrics=>({turns:0,input:0,output:0,cacheRead:0,durationMs:0,averageDurationMs:null,durationSamples:0,outcomes:{ok:0,interrupted:0,error:0,unknown:0},missingMeasurements:0});
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function add(group:Metrics,message:Row){
 group.turns++;const outcome:Outcome=message.outcome==='ok'||message.outcome==='interrupted'||message.outcome==='error'?message.outcome:'unknown';group.outcomes[outcome]++;
 const usage=object(message.usage)?message.usage:{};let missing=false;
 for(const key of ['input','output','cacheRead'] as const){const value=usage[key];if(number(value))group[key]+=value;else missing=true}
 if(number(message.durationMs)){group.durationMs+=message.durationMs;group.durationSamples++;group.averageDurationMs=group.durationMs/group.durationSamples}else missing=true;
 if(missing)group.missingMeasurements++;
}
export async function spend(runtime:Runtime,query:URLSearchParams){
 const raw=query.get('period')??'all';if(query.getAll('period').length>1||!['7','30','90','all'].includes(raw))throw new RuntimeError('period_invalid','period: ожидается 7, 30, 90 или all',400);
 const period=raw as Period,p=runtime.project,now=runtime.clock.now(),since=period==='all'?null:(now-Number(period)*86_400_000)/1000;
 let data:unknown;
 try{data=parseCompat(await readFile(join(p.dir,'.harness','state','chats.json'),'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')data={chats:{}};else throw new RuntimeError('spend_unreadable','chats.json не читается: '+text(error),409)}
 if(p.closed||runtime.project!==p)throw new RuntimeError('project_changed','проект сменился',409);
 const fail=(reason:string):never=>{throw new RuntimeError('spend_unreadable','chats.json не читается: '+reason,409)};
 if(!object(data)||!object(data.chats))return fail('неверная форма');
 const totals=metrics(),byPane=new Map<string,Metrics&{pane:string;label:string}>(),byChat=new Map<string,Metrics&{chat:string;pane:string;title:string}>(),byModel=new Map<string,Metrics&{model:string|null}>(),local=new Map<string,Candidate>();
 let transferred=0,unknownOrigin=0,undated=0;
 const inPeriod=(message:Row)=>{const ts=message.ts;if(!number(ts)||ts===0){undated++;return period==='all'}return ts<=now/1000&&(since===null||ts>=since)};
 for(const [id,value] of Object.entries(data.chats)){
  if(!object(value)||typeof value.pane!=='string'||!Array.isArray(value.transcript)||value.turns!==undefined&&!Array.isArray(value.turns))return fail('неверная форма чата '+id);
  const pane=value.pane,title=typeof value.title==='string'?value.title:'';
  for(const rawMessage of value.transcript){
   if(!object(rawMessage)||typeof rawMessage.role!=='string'||typeof rawMessage.text!=='string')return fail('неверная форма реплики '+id);
   if(rawMessage.role!=='ai')continue;
   const rt=object(rawMessage.runtime)?rawMessage.runtime:null;
   if(rawMessage.origin!=='transferred'&&rt&&typeof rt.turnInstanceId==='string'&&rt.turnInstanceId&&Number.isSafeInteger(rawMessage.deliverySeq)&&Number(rawMessage.deliverySeq)>=0)local.set(rt.turnInstanceId,{message:rawMessage,pane,chat:id,title});
   else if(inPeriod(rawMessage)){if(rawMessage.origin==='transferred')transferred++;else unknownOrigin++}
  }
  for(const turn of value.turns??[]){
   if(!object(turn)||typeof turn.turnInstanceId!=='string'||!turn.turnInstanceId||turn.outcome!=='error'||typeof turn.errorCode!=='string'||!turn.errorCode||!number(turn.ts)||typeof turn.model!=='string')return fail('неверная форма хода '+id);
   if(!local.has(turn.turnInstanceId))local.set(turn.turnInstanceId,{message:turn,pane,chat:id,title});
  }
 }
 for(const {message,pane,chat,title} of local.values()){
  if(!inPeriod(message))continue;const model=typeof message.model==='string'&&message.model?message.model:null;
  if(!byPane.has(pane))byPane.set(pane,{pane,label:p.registry.get(pane)?.label??pane,...metrics()});
  if(!byChat.has(chat))byChat.set(chat,{chat,pane,title,...metrics()});
  if(!byModel.has(model??''))byModel.set(model??'',{model,...metrics()});
  for(const group of [totals,byPane.get(pane)!,byChat.get(chat)!,byModel.get(model??'')!])add(group,message);
 }
 return {ok:true,project:p.dir,period,since,generatedAt:now/1000,source:'chats.json',totals,byPane:[...byPane.values()],byChat:[...byChat.values()],byModel:[...byModel.values()],transferred,unknownOrigin,undated,cost:null,costReason:'нет прайс-листа и чтения квот'};
}
