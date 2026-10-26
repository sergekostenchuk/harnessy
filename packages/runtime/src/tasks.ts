import {createHash} from 'node:crypto';
import {appendFileSync,closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Record_} from '@harnessy/journal';
import {RuntimeError,object} from './errors.ts';
import type {ProjectState} from './types.ts';

export type TaskState='unassigned'|'queued'|'work'|'review'|'done'|'blocked'|'partial'|'unknown';
export interface TaskView {n:number|null;taskId:string;text:string;to:string|null;state:TaskState;reason:string;thread:string;assignedSeq:number|null;ts:string;replies:Record_[];expectedState:string;readonly:boolean}
type Event=Record<string,unknown>;
interface Intent {event:'intent';opId:string;hash:string;action:'create'|'assign';taskId:string;n:number;text:string;to:string|null;prevSeq:number|null;ts:string;by:string}
const hash=(v:unknown):string=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const invalid=(code:string,message:string):never=>{throw new RuntimeError(code,message,409)};
const terminalReply=(replies:Record_[])=>[...replies].reverse().find(r=>r.kind==='status'&&['done','partial','blocked'].includes(r.outcome??'')||r.kind==='verdict'&&r.accepted===true);
export class TaskStore {
 readonly path:string;
 private p:ProjectState;
 constructor(p:ProjectState){this.p=p;this.path=join(p.dir,'.harness','state','tasks.ndjson')}
 private read():Event[]{
  if(!existsSync(this.path))return [];
  try{const text=readFileSync(this.path,'utf8');if(text&&!text.endsWith('\n'))return invalid('tasks_unavailable','Реестр задач не завершён; сохраните файл и восстановите его из резервной копии');
   return text.split('\n').filter(Boolean).map(line=>{const e=JSON.parse(line);if(!object(e)||!['intent','created','assigned','revoked','closed','committed'].includes(String(e.event))||typeof e.taskId!=='string'||typeof e.opId!=='string')return invalid('tasks_unavailable','Повреждён реестр задач');const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0,sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),time=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
    if(!sha(e.taskId)||e.event==='intent'&&(!sha(e.hash)||!['create','assign'].includes(String(e.action))||!integer(e.n)||typeof e.text!=='string'||!e.text.trim()||!(e.to===null||typeof e.to==='string'&&!!e.to)||!(e.prevSeq===null||integer(e.prevSeq))||!time(e.ts)||e.by!=='owner')||e.event==='created'&&(!integer(e.n)||typeof e.text!=='string'||!e.text.trim()||!time(e.ts)||e.by!=='owner')||e.event==='assigned'&&(!integer(e.seq)||typeof e.to!=='string'||!e.to||!time(e.ts))||e.event==='revoked'&&!integer(e.seq)||e.event==='closed'&&(!integer(e.assignedSeq)||!integer(e.bySeq)||!['done','partial','blocked'].includes(String(e.outcome)))||e.event==='committed'&&!sha(e.hash))return invalid('tasks_unavailable','Форма события реестра задач не подтверждена');
    return e});
  }catch(e){if(e instanceof RuntimeError)throw e;return invalid('tasks_unavailable','Реестр задач недоступен')}
 }
 private append(e:Event){mkdirSync(join(this.p.dir,'.harness','state'),{recursive:true});const fd=openSync(this.path,'a',0o600);try{appendFileSync(fd,JSON.stringify(e)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
 private emit(){this.p.owner.publish({type:'tasks',project:this.p.dir})}
 private row(events:Event[],id:string):TaskView|null {
  const c=events.find(e=>e.event==='created'&&e.taskId===id);if(!c)return null;
  const a=[...events].reverse().find(e=>e.event==='assigned'&&e.taskId===id),seq=a?Number(a.seq):null,to=a?String(a.to):null;
  return this.classify({n:Number(c.n),taskId:id,text:String(c.text),to,assignedSeq:seq,ts:String(c.ts),thread:'task:'+id,readonly:false});
 }
 private classify(base:Omit<TaskView,'state'|'reason'|'replies'|'expectedState'>):TaskView {
  const p=this.p,seq=base.assignedSeq,pane=base.to?p.registry.get(base.to):null,records=p.journal.read({limit:0});
  let state:TaskState='unassigned',reason='Задача ещё не назначена',replies:Record_[]=[];
  if(seq!==null){
   const task=p.journal.get(seq),direct=records.filter(r=>r.seq>seq&&r.reply_to===seq&&r.from===base.to),reviews=direct.filter(r=>r.kind==='review-request');
   const verdicts=records.filter(r=>r.kind==='verdict'&&r.accepted===true&&reviews.some(q=>r.reply_to===q.seq&&q.to.includes(r.from)));
   replies=[...direct,...verdicts].sort((a,b)=>a.seq-b.seq);
   const terminal=terminalReply(replies);
   const blocked=[...direct].reverse().find(r=>['question','blocker'].includes(r.kind));
   if(!task||task.kind!=='task'||task.from!=='owner'||task.to.length!==1||task.to[0]!==base.to||task.text!==base.text||!base.readonly&&task.thread!==base.thread){state='unknown';reason='Запись назначения не совпадает с реестром';replies=[]}
   else if(terminal){state=terminal.kind==='verdict'||terminal.outcome==='done'?'done':terminal.outcome==='blocked'?'blocked':'partial';reason=terminal.text}
   else if(blocked){state='blocked';reason=blocked.text}
   else if(reviews.length){state='review';reason='Исполнитель запросил проверку'}
   else if(p.active.get(base.to!)?.records.some(r=>r.seq===seq)){state='work';reason='Исполнитель выполняет ход с этой задачей'}
   else if(!pane||!task||p.journal.deliveryRevoked(seq)||p.restoreFailed.has(base.to!)||['unsent','uncertain','recovering'].includes(pane.status)||p.state.attempts[base.to!]){state='unknown';reason=!pane?'Исполнитель удалён':!task?'Запись задания недоступна':p.journal.deliveryRevoked(seq)?'Назначение отозвано':'Исход прежней попытки не подтверждён'}
   else {
    const abandoned=records.some(r=>r.attempt?.pane===base.to&&r.attempt.action==='skip'&&r.attempt.done&&r.attempt.deliverySeq!==null&&r.attempt.deliverySeq>=seq&&r.seq>seq)||pane!.transcript.some(t=>object(t.runtime)&&Array.isArray(t.runtime.recordSeqs)&&t.runtime.recordSeqs.includes(seq)&&t.runtime.interrupted===true);
    const pending=p.journal.pendingFor(base.to!).find(e=>e.record.seq===seq),deliverySeq=task.ack==='pending'?p.journal.repliesTo(seq).find(r=>r.kind==='ack'&&r.from==='owner')?.seq:seq;
    if(abandoned){state='unknown';reason='Прежняя попытка пропущена или прервана; исход задачи не подтверждён'}
    else if(deliverySeq!==undefined&&deliverySeq<=(p.journal.cursors[base.to!]??0)){state='work';reason='Задача доставлена; типизированный исход ещё не получен'}
    else if(pending){state='queued';reason='Ждёт доставки исполнителю'}
    else {state='unknown';reason='Доставка задачи не подтверждена'}
   }
  }
  return {...base,state,reason,replies,expectedState:hash([base.taskId,seq,base.to,state,replies.map(r=>[r.seq,r.id]),pane?.status??null,p.active.get(base.to??'')?.scope.turnInstanceId??null])};
 }
 list(){const events=this.read(),tasks=events.filter(e=>e.event==='created').map(e=>this.row(events,String(e.taskId))!);
  for(const t of tasks){const closing=terminalReply(t.replies);if(closing&&['done','partial','blocked'].includes(t.state)&&!events.some(e=>e.event==='closed'&&e.taskId===t.taskId&&e.assignedSeq===t.assignedSeq&&e.bySeq===closing.seq))this.append({event:'closed',taskId:t.taskId,opId:'close:'+t.assignedSeq+':'+closing.seq,assignedSeq:t.assignedSeq,outcome:t.state,bySeq:closing.seq})}
  const assigned=new Set(events.filter(e=>e.event==='assigned').map(e=>Number(e.seq)));
  const outsideQueue=this.p.journal.read({limit:0}).filter(r=>r.from==='owner'&&r.kind==='task'&&!assigned.has(r.seq)&&r.to.length===1&&!this.p.journal.deliveryRevoked(r.seq)).map(r=>this.classify({n:null,taskId:'journal:'+r.seq,text:r.text,to:r.to[0]!,assignedSeq:r.seq,ts:r.ts,thread:r.thread??'',readonly:true}));
  return {ok:true as const,project:this.p.dir,instance:this.p.trace.instanceId,tasks,outsideQueue};
 }
 private finish(i:Intent){
  let events=this.read();const seen=(event:string)=>events.some(e=>e.event===event&&e.opId===i.opId);
  if(seen('committed'))return this.row(events,i.taskId)!;
  if(i.action==='create'&&!seen('created')){this.append({event:'created',opId:i.opId,taskId:i.taskId,n:i.n,text:i.text,ts:i.ts,by:i.by});events=this.read()}
  if(i.prevSeq!==null){const target=this.p.journal.get(i.prevSeq);if(!target)invalid('tasks_unavailable','Прежнее назначение недоступно');
   if(!this.p.journal.deliveryRevoked(i.prevSeq))this.p.journal.append({sender:'harness',to:['owner'],kind:'rejected',origin:'task-reassign',reply_to:i.prevSeq,thread:target!.thread,text:'Назначение отозвано владельцем перед переназначением'});
   if(!seen('revoked'))this.append({event:'revoked',opId:i.opId,taskId:i.taskId,seq:i.prevSeq,reason:'Переназначение владельцем',ts:i.ts});
  }
  if(i.to){const origin='task-operation:'+i.opId,found=this.p.journal.read({limit:0}).filter(r=>r.origin===origin),record=found[0];
   if(found.length>1||record&&(record.kind!=='task'||record.from!=='owner'||record.text!==i.text||record.thread!=='task:'+i.taskId||record.to.length!==1||record.to[0]!==i.to))invalid('tasks_unavailable','Квитанция задачи не совпадает с операцией');
   const task=record??this.p.channel.postCore({to:[i.to],kind:'task',text:i.text,thread:'task:'+i.taskId,origin},{seat:'owner',trust:'owner'});
   if(!seen('assigned'))this.append({event:'assigned',opId:i.opId,taskId:i.taskId,to:i.to,seq:task.seq,ts:i.ts});
  }
  this.append({event:'committed',opId:i.opId,taskId:i.taskId,hash:i.hash});this.emit();return this.row(this.read(),i.taskId)!;
 }
 hasOperation(id:unknown){return typeof id==='string'&&this.read().some(e=>e.event==='intent'&&e.opId===id)}
 recover(){for(const e of this.read().filter(e=>e.event==='intent'))this.finish(e as unknown as Intent)}
 change(action:'create'|'assign',body:Record<string,unknown>,id?:string){
  const allowed=action==='create'?['project','instance','opId','text','to']:['project','instance','opId','to','expectedState'];
  if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.opId!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(body.opId))invalid('task_invalid','Нужен устойчивый идентификатор действия');
  const to=body.to===undefined?null:body.to;if(to!==null&&(typeof to!=='string'||!to))invalid('task_invalid','Выберите исполнителя');
  const digest=hash([action,id??null,body.project,body.instance,body.text??null,to,body.expectedState??null]),events=this.read(),prior=events.find(e=>e.event==='intent'&&e.opId===body.opId);
  if(prior){if(prior.hash!==digest)invalid('op_conflict','Это действие уже записано с другими параметрами');return this.finish(prior as unknown as Intent)}
  this.recover();
  if(to!==null&&!this.p.registry.get(String(to)))invalid('seat_unknown','Такого исполнителя больше нет');
  if(to!==null&&(this.p.editing.has(String(to))||this.p.materializing.has(String(to))))invalid('task_state_unknown','Настройки исполнителя ещё меняются');
  let n:number,text:string,taskId:string,prevSeq:number|null=null;
  const ts=new Date(this.p.now()).toISOString();
  if(action==='create'){
   if(typeof body.text!=='string'||!body.text.trim()||[...body.text].length>100000)invalid('task_invalid','Введите задачу длиной до 100000 знаков');
   n=this.read().filter(e=>e.event==='created').reduce((m,e)=>Math.max(m,Number(e.n)),0)+1;text=String(body.text);taskId=hash([this.p.trace.instanceId,n,ts]);
  }else{
   const task=this.row(this.read(),id!);if(!task)invalid('task_unknown','Задача не найдена');
   if(task!.state==='unknown')invalid('task_state_unknown',task!.reason);
   if(!['unassigned','queued'].includes(task!.state))invalid('task_active','Задача уже доставлена; её нельзя переназначить');
   if(typeof body.expectedState!=='string'||body.expectedState!==task!.expectedState)invalid('task_changed','Назначение изменилось; обновите очередь');
   if(to===null)invalid('task_invalid','Выберите исполнителя');
   n=task!.n!;text=task!.text;taskId=task!.taskId;prevSeq=task!.assignedSeq;
  }
  const intent:Intent={event:'intent',opId:String(body.opId),hash:digest,action,taskId,n,text,to:to as string|null,prevSeq,ts,by:'owner'};
  this.append(intent as unknown as Event);return this.finish(intent);
 }
}
