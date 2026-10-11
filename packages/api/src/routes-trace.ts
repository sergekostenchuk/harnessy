import {traceId,traceBindingId,TRACE_REASONS,type TraceOutcome,type TraceReason} from '@harnessy/runtime';
import {json} from './responses.ts';
import type {Runtime} from '@harnessy/runtime';
import type {Route} from './routes.ts';
const outcomes=['ok','failed','rejected','timeout','cancelled'];
export function traceRoutes(r:Runtime):Route[]{return [
 {method:'GET',path:'/api/trace',style:'J',handle:async({query})=>{
 const p=r.project,id=query.get('traceId'),since=query.get('since'),outcome=query.get('outcome'),seq=query.get('journalSeq');
 if(id!==null&&!traceId(id)||since!==null&&!Number.isFinite(Date.parse(since))||outcome!==null&&!outcomes.includes(outcome)||seq!==null&&(!/^\d+$/.test(seq)||!Number.isSafeInteger(Number(seq))||Number(seq)<1))return json({ok:false,code:'trace_invalid',error:'Некорректный фильтр цепочки'},400);
 if(query.has('project')&&query.get('project')!==p.dir)return json({ok:false,code:'project_changed',error:'Проект сменился'},409);
 let records=await p.trace.read({...id?{traceId:id}:{},...since?{since:Date.parse(since)}:{},...outcome?{outcome:outcome as TraceOutcome}:{}});
 if(seq){const ids=new Set(records.filter(row=>row.refs.journalSeq===Number(seq)).map(row=>row.traceId));records=records.filter(row=>ids.has(row.traceId))}
 if(r.project!==p||p.closed)return json({ok:false,code:'project_changed',error:'Проект сменился'},409);
 return json({ok:true,project:p.dir,instanceId:p.trace.instanceId,status:p.trace.status,records});
 }},
 {method:'POST',path:'/api/trace',style:'J',handle:({body})=>{
 const p=r.project,b=body.binding as {project?:unknown;instanceId?:unknown;chat?:unknown;pane?:unknown;turnInstanceId?:unknown}|undefined;
 if(!b||typeof b!=='object'||b.project!==p.dir||b.instanceId!==p.trace.instanceId)return json({ok:false,code:'project_changed',error:'Привязка цепочки устарела'},409);
 const outcome=body.kind==='ui.outcome',kind=outcome?'ui.outcome':'ui.action';
 const invalid=()=>json({ok:false,code:'trace_invalid',error:'Некорректное действие или привязка цепочки'},400);
 if(Object.keys(body).some(key=>!['action','page','binding','traceId','spanId','parentSpanId','kind','outcome','reason','error'].includes(key))||Object.keys(b).some(key=>!['project','instanceId','chat','pane','turnInstanceId'].includes(key))||body.kind!==undefined&&!['ui.action','ui.outcome'].includes(String(body.kind))||typeof body.action!=='string'||!body.action.trim()||body.action.length>100||/[\x00-\x1f<>]/.test(body.action)||typeof body.page!=='string'||!/^[a-z-]{1,30}$/.test(body.page)||!traceId(body.traceId)||!traceId(body.spanId)||body.parentSpanId!=null&&!traceId(body.parentSpanId)||outcome&&!outcomes.includes(String(body.outcome))||outcome&&!TRACE_REASONS.includes(body.reason as TraceReason)||b.chat!=null&&!traceBindingId(b.chat,'chat')||b.pane!=null&&!traceBindingId(b.pane,'pane')||b.turnInstanceId!=null&&!traceBindingId(b.turnInstanceId,'turn'))return invalid();
 // This read and record are synchronous: project/seat/chat cannot change between them.
 const pane=typeof b.pane==='string'?p.registry.get(b.pane):null,chat=typeof b.chat==='string'&&Object.hasOwn(p.state.chats.chats,b.chat)?p.state.chats.chats[b.chat]:null;
 if(b.pane!=null&&!pane||b.chat!=null&&(!chat||!pane||chat.id!==b.chat||chat.pane!==pane.id))return invalid();
 if(typeof b.turnInstanceId==='string'){
  if(!pane||!chat)return invalid();
  const turn=p.trace.forTurn(b.turnInstanceId),attempt=p.state.attempts[pane.id],known=turn?.pane===pane.id&&turn.chat===chat.id||p.state.chats.active[pane.id]===chat.id&&attempt?.turnInstanceId===b.turnInstanceId||chat.transcript.some(message=>message.runtime&&typeof message.runtime==='object'&&'turnInstanceId' in message.runtime&&message.runtime.turnInstanceId===b.turnInstanceId)||chat.turns?.some(turn=>turn.turnInstanceId===b.turnInstanceId);
  if(!known)return invalid();
 }
 p.trace.record(kind,{traceId:body.traceId,spanId:body.spanId,parentSpanId:traceId(body.parentSpanId)?body.parentSpanId:null,actor:'window',chat:chat?.id??null,pane:pane?.id??null,turnInstanceId:typeof b.turnInstanceId==='string'?b.turnInstanceId:null,outcome:outcome?body.outcome as TraceOutcome:'ok',reason:{code:outcome?body.reason as TraceReason:'none',text:typeof body.error==='string'?body.error:''},data:{action:body.action,page:body.page}});
 return json({ok:true,traceId:body.traceId,spanId:body.spanId,project:p.dir,instanceId:p.trace.instanceId});
 }}
]}
