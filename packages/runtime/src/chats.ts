import {transcriptText,type ConversationSnapshot} from '@harnessy/context';
import {realpathSync} from 'node:fs';
import {join,relative,isAbsolute,sep} from 'node:path';
import {orderedClone,pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,message,slice,object} from './errors.ts';
import {owner,place,free,reserve,locked,same} from './operations.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
import {jsonClone,chatMetadata,diskIO,type Chat} from './state.ts';
import type {Pane} from './pane.ts';
import {makeRoomIn} from './rooms.ts';
import {SEAT_KINDS,type SeatKind} from '@harnessy/team';

function proposalRows(p:ProjectState,q:Record<string,unknown>,seats:unknown[]){
 const invalid=():never=>{throw new RuntimeError('proposal_invalid','состояние строк предложения для контекста повреждено',409)};
 if(q.ownerSeats!==undefined&&!object(q.ownerSeats))invalid();
 const selections=object(q.ownerSeats)?q.ownerSeats:{},operations=p.state.readMaterializations();if(!Array.isArray(operations))return invalid();
 for(const [index,selection] of Object.entries(selections))if(!/^(0|[1-9][0-9]*)$/.test(index)||Number(index)>=seats.length||!object(selection)||!SEAT_KINDS.includes(selection.kind as SeatKind)||typeof selection.created!=='boolean')invalid();
 return seats.map((raw,index)=>{
  if(!object(raw)||!SEAT_KINDS.includes(raw.kind as SeatKind)||typeof raw.sid!=='string'||typeof raw.operationId!=='string')return invalid();
  const selected=selections[index],selection=object(selected)?selected:null,found=operations.filter(op=>object(op)&&op.operationId===raw.operationId);
  if(found.length>1)invalid();const operation=found[0],stages=object(operation)?operation.stages:null;
  if(operation!==undefined&&(!object(operation)||operation.sid!==raw.sid||!object(operation.input)||!SEAT_KINDS.includes(operation.input.kind as SeatKind)||typeof operation.by!=='string'||!object(stages)||!['team','seatFile','chat','status','onboarding'].every(k=>typeof stages[k]==='boolean')))invalid();
  const op=operation as {input:{kind:SeatKind};by:string;stages:Record<string,boolean>}|undefined,actual=p.registry.get(raw.sid);
  if(selection&&op&&selection.kind!==op.input.kind||actual&&(!op||actual.kind!==op.input.kind))invalid();
  const created=!!op&&['team','seatFile','chat','status','onboarding'].every(k=>op.stages[k]);
  if(created&&(!actual||p.state.chats.chats[raw.operationId]?.pane!==raw.sid)||selection?.created===true&&!created)invalid();
  return {...raw,kind:actual?.kind??op?.input.kind??selection?.kind??raw.kind,created,state:created?'создана':op?'создаётся':'ожидает',createdBy:created?op!.by:null,requestedBy:op?.by??(selection?'владелец (интерфейс)':q.confirmed?'оркестратор '+q.from:null)};
 });
}

// Capture only the saved active conversation, before injecting this turn's records.
export function transferSnapshot(p:ProjectState,pane:Pane,records:readonly import('@harnessy/journal').Record_[],enabled=true):ConversationSnapshot|null {
 const id=p.state.chats.active[pane.id];if(!id){if(pane.transcript.length)throw new RuntimeError('context_binding_invalid','не сохранена привязка истории к разговору',409);return null}const c=p.state.chats.chats[id];
 if(p.state.dir!==p.dir||!c||c.id!==id||c.pane!==pane.id)throw new RuntimeError('context_binding_invalid','сохранённый контекст относится к другому разговору',409);
 // Opt-out needs only the binding for its receipt. Do not inspect history or side files.
 if(!enabled)return {project:p.dir,chat:id,messages:[],facts:[]};
 chatMetadata(c);
 const messages=c.transcript.filter(m=>!pane.uncommitted.has(m)&&!m.contextTransfer&&['me','ai','peer'].includes(m.role));
 if(!messages.length&&!c.turns?.length)return null;
 // Explicit foreign provenance is never accepted as this chat's history. Promotion
 // within the same chat legitimately changes pane identity, not project/chat identity.
 for(const m of messages)if(m.project!==undefined&&m.project!==p.dir||m.chat!==undefined&&m.chat!==id||object(m.provenance)&&(m.provenance.project!==p.dir||m.provenance.chat!==id))throw new RuntimeError('context_binding_invalid','стенограмма содержит чужую привязку',409);
 const turns=new Set(messages.flatMap(m=>object(m.runtime)&&typeof m.runtime.turnInstanceId==='string'?[m.runtime.turnInstanceId]:[]));
 for(const turn of c.turns??[])turns.add(turn.turnInstanceId);
 const seqs=new Set(messages.flatMap(m=>object(m.runtime)&&Array.isArray(m.runtime.recordSeqs)?m.runtime.recordSeqs.filter((n):n is number=>Number.isSafeInteger(n)):[]));
 for(const r of records)seqs.add(r.seq);
 const history=p.journal.read({limit:0}).filter(r=>seqs.has(r.seq));
 if(history.some(r=>!r.to.includes(pane.id)&&!r.to.includes('*')))throw new RuntimeError('context_binding_invalid','запись контекста адресована другому месту',409);
 const threads=new Set(history.flatMap(r=>r.thread?[r.thread]:[]));
 const facts:ConversationSnapshot['facts']=[];
 const promotion=c.promotion;if(object(promotion)&&promotion.target===p.dir&&promotion.sid===pane.id&&object(promotion.source)&&object(promotion.source.chat)&&promotion.source.chat.id===id&&typeof promotion.intro==='string')facts.push({label:'Предметная вводная при повышении',text:promotion.intro});
 else {const intro=history.find(r=>r.origin==='onboarding'&&r.from==='harness');if(intro)facts.push({label:'Вводная роли',text:intro.text})}
 let memory='';try{const file=realpathSync(join(p.dir,'.harness/MEMORY.md')),path=relative(realpathSync(p.dir),file);if(isAbsolute(path)||path==='..'||path.startsWith('..'+sep))throw new RuntimeError('context_binding_invalid','память находится вне проекта',409);memory=diskIO.read(file)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
 if(memory.trim())facts.push({label:'Память проекта',text:memory});
 if(c.documents?.length)facts.push({label:'Прикреплённые документы (ссылки)',text:JSON.stringify(c.documents)});
 const store=p.state.readProposals();if(!object(store)||store.project!==p.dir||!Array.isArray(store.proposals))throw new RuntimeError('proposal_invalid','предложения для контекста не читаются',409);
 for(const q of store.proposals){if(!object(q)||q.from!==pane.id||!turns.has(String(q.turnInstanceId)))continue;
  if(typeof q.proposalId!=='string'||!Number.isSafeInteger(q.version)||!Array.isArray(q.seats)||typeof q.confirmed!=='boolean')throw new RuntimeError('proposal_invalid','предложение для контекста повреждено',409);
  const seats=proposalRows(p,q,q.seats);if(q.confirmed&&seats.every(s=>s.created))continue;
  facts.push({label:'Незавершённое предложение команды',text:JSON.stringify({proposalId:q.proposalId,version:q.version,confirmed:q.confirmed,seats,originalSeats:q.seats})});
 }
 const pending=p.channel.pendingAcks().filter(r=>seqs.has(r.seq)||r.from===pane.id&&r.thread&&threads.has(r.thread));
 if(pending.length)facts.push({label:'Ожидающие подтверждения владельца',text:JSON.stringify(pending.map(r=>({seq:r.seq,kind:r.kind,text:r.text,thread:r.thread})))});
 const task=[...history].reverse().find(r=>r.from==='owner'&&['task','question'].includes(r.kind));if(task)facts.push({label:'Последнее поручение владельца · №'+task.seq,text:task.text});
 return jsonClone({project:p.dir,chat:id,messages:messages.map(({role,text,ts})=>({role,text,ts})),facts});
}

export const SUMMARY_PROMPT='Напиши краткую выжимку этого разговора для передачи в новый чат той же роли: что решено, что сделано, открытые вопросы, чего ждёт владелец. Коротко, списком, без вступления.';
export interface PromotionIdentity {operationId:string;chat:string;sourceProject:string;sourceRevision:number;target:string;pane:string;step:number;stepCount:4;stepLabel:string;completed:number;error:string|null}
export function promotionIdentity(c:Chat):PromotionIdentity|null {
 const op=c.promotion;if(!object(op)||typeof op.id!=='string'||typeof op.sid!=='string'||typeof op.target!=='string'||!object(op.input)||typeof op.input.project!=='string'||!Number.isSafeInteger(op.input.revision))return null;
 const saved=object(op.progress)?op.progress:null,derived=op.done===true?4:c.pane===op.sid?3:op.target===op.input.project?1:0,completed=op.done===true?4:saved&&Number.isInteger(saved.completed)&&Number(saved.completed)>=0&&Number(saved.completed)<4?Math.max(derived,Number(saved.completed)):derived,step=Math.min(completed+1,4);
 return {operationId:op.id,chat:c.id,sourceProject:op.input.project,sourceRevision:op.input.revision as number,target:op.target,pane:op.sid,step,stepCount:4,stepLabel:['папка','вводная и документы','место','первое поручение'][step-1]!,completed,error:saved&&typeof saved.error==='string'?saved.error:null};
}
export interface ChatMeta {promotion?:{pending:boolean;target:string}&Partial<PromotionIdentity>;revision:number;documents:import('./state.ts').DocumentRef[];id:string;pane:string;label:string;role:string|null;title:string;created:number;closed:number|null;model:string|null;vendor:string;messages:number;last:number;active:boolean}
export function meta(p:ProjectState,c:Chat):ChatMeta {
 chatMetadata(c);const promotion=object(c.promotion)&&typeof c.promotion.target==='string'?{...promotionIdentity(c),pending:c.promotion.done===false||object(c.promotion.progress)&&typeof c.promotion.progress.error==='string',target:c.promotion.target}:null,refs=promotion&&object(c.promotion)&&object(c.promotion.input)&&Array.isArray(c.promotion.input.documents)?c.promotion.input.documents:c.documents??[];const pane=p.registry.get(c.pane),last=c.transcript.at(-1);
 return {...(promotion?{promotion}:{}),revision:c.revision??0,documents:jsonClone(refs),id:c.id,pane:c.pane,label:pane?.label??c.pane,role:pane?.role??null,title:c.title||'',created:c.created,closed:c.closed??null,model:c.model,vendor:c.vendor,messages:c.transcript.length,last:last?.ts?Math.trunc(last.ts):c.created,active:p.state.chats.active[c.pane]===c.id};
}
export function closeChat(p:ProjectState,pane:Pane,carry:string):string {
 const c=p.state.activeChat(pane,false);if(!c)return '';
 p.state.sync(p.registry);
 const text=carry==='text'&&c.transcript.length?'Контекст прежнего чата «'+pane.label+'»'+(c.title?' ('+c.title+')':'')+', для сведения:\n\n'+transcriptText(c.transcript):'';
 c.closed=Math.floor(p.now()/1000);return text;
}
function find(p:ProjectState,id:string):Chat {const c=p.state.chats.chats[id];if(!c)throw new RuntimeError('chat_unknown','нет такого чата',404);return c}
export function chatsList(runtime:Runtime,initiator:Initiator) {
 const p=owner(runtime,initiator);p.state.saveChats(p.registry);
 return {active:orderedClone(p.state.chats.active),chats:Object.values(p.state.chats.chats).map(c=>meta(p,c)).sort((a,b)=>b.last-a.last)};
}
export function chatGet(runtime:Runtime,id:string,initiator:Initiator) {
 const p=owner(runtime,initiator),c=find(p,id);p.state.saveChats(p.registry);return {chat:meta(p,c),messages:jsonClone(c.transcript)};
}
export async function chatsNew(runtime:Runtime,input:{pane?:unknown;carry?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),pid=String(input.pane||'');if(pid==='room'&&!p.registry.get('room'))makeRoomIn(p,runtime,'',p.dir===runtime.defaultDir?'chat':'read');const pane=place(p,pid),carry=String(input.carry||'text');free(p,pane);
 if(!['text','summary','none'].includes(carry))throw new RuntimeError('carry_invalid','carry: text, summary или none',400);
 const hold=reserve(p,[pane]),old=p.state.activeChat(pane,false),oldId=old?.id,revision=pane.revision;
 let carryText='',done=false;
 try {
  if(pane.id!=='room'&&carry==='summary'&&old?.transcript.length){
   let summary:string;
   try {summary=await runtime.runTurn(pane.id,SUMMARY_PROMPT,{project:p,reservation:hold.token});}
   catch(e){throw new RuntimeError('summary_failed','выжимка не получилась: '+slice(message(e),200),400,{cause:e})}
   same(runtime,p);
   if(p.registry.get(pane.id)!==pane||p.state.chats.active[pane.id]!==oldId)throw new RuntimeError('stale_chat','чат изменился во время выжимки');
   const last=pane.transcript.at(-1);
   if(last&&object(last.runtime)&&last.runtime.interrupted)throw new RuntimeError('summary_failed','выжимка не получилась: ход отменён',400);
   if(pane.status!=='idle')throw new RuntimeError('recovering','ответ модели сохранён; завершается восстановление доставки');
   carryText='Выжимка прежнего чата «'+pane.label+'»'+(old.title?' ('+old.title+')':'')+':\n\n'+pythonTrim(summary);
  }
  return await locked(runtime,p,()=>{
   if(p.registry.get(pane.id)!==pane||pane.busy||p.state.chats.active[pane.id]!==oldId||carry!=='summary'&&pane.revision!==revision)throw new RuntimeError('stale_chat','чат изменился во время создания');
   if(pane.status!=='idle')throw new RuntimeError('recovering','ответ модели сохранён; завершается восстановление доставки');
   const snapshot=jsonClone(p.state.chats),saved={sessionId:pane.sessionId,transcript:pane.transcript,carry:pane.carry,seen:pane.seen};
   try {
    if(old)p.state.sync(p.registry);
    if(pane.id!=='room'){if(carry==='summary'&&old?.transcript.length)old.closed=Math.floor(runtime.clock.now()/1000);else carryText=closeChat(p,pane,carry)}
    const c=p.state.newChat(pane,carryText);p.state.savePanes(p.registry,p.journal);done=true;return {ok:true as const,chat:meta(p,c),pane:pane.settings(),carried:!!carryText};
   }catch(e){p.state.chats=snapshot;Object.assign(pane,saved);throw e}
  });
 }finally{hold.release();if(done&&!p.closed)await runtime.resumeQueue(pane.id,p)}
}
export async function chatsOpen(runtime:Runtime,input:{chat?:unknown;carry?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),c=find(p,String(input.chat||'')),pane=place(p,c.pane,'место этого чата больше не существует');free(p,pane);
 if(p.state.chats.active[pane.id]===c.id)return {ok:true as const,chat:meta(p,c),pane:pane.settings(),already:true as const};
 const hold=reserve(p,[pane]);let done=false;
 try{return await locked(runtime,p,()=>{
  const snapshot=jsonClone(p.state.chats),saved={sessionId:pane.sessionId,transcript:pane.transcript,carry:pane.carry,seen:pane.seen,vendor:pane.vendor,model:pane.model};
  try {
   const carried=pane.id==='room'?'':closeChat(p,pane,String(input.carry||'text'));
   c.closed=null;p.state.chats.active[pane.id]=c.id;pane.sessionId=c.sessionId;pane.transcript=c.transcript;pane.carry=pythonTrim((c.carry||'')+(carried?'\n\n'+carried:''));pane.seen={};pane.revision++;
   if((c.vendor==='claude'||c.vendor==='codex')&&p.registry.providers.has(c.vendor))pane.vendor=c.vendor;
   if(c.model===null)pane.model='';else if(c.model)pane.model=c.model;
   p.state.savePanes(p.registry,p.journal);done=true;return {ok:true as const,chat:meta(p,c),pane:pane.settings(),carried:!!carried};
  }catch(e){p.state.chats=snapshot;Object.assign(pane,saved);throw e}
 });}finally{hold.release();if(done&&!p.closed)await runtime.resumeQueue(pane.id,p)}
}
