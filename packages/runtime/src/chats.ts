import {transcriptText} from '@harnessy/context';
import {orderedClone,pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,message,slice,object} from './errors.ts';
import {owner,place,free,reserve,locked,same} from './operations.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
import {jsonClone,type Chat} from './state.ts';
import type {Pane} from './pane.ts';
import {makeRoomIn} from './rooms.ts';

export const SUMMARY_PROMPT='Напиши краткую выжимку этого разговора для передачи в новый чат той же роли: что решено, что сделано, открытые вопросы, чего ждёт владелец. Коротко, списком, без вступления.';
export interface ChatMeta {id:string;pane:string;label:string;role:string|null;title:string;created:number;closed:number|null;model:string|null;vendor:string;messages:number;last:number;active:boolean}
export function meta(p:ProjectState,c:Chat):ChatMeta {
 const pane=p.registry.get(c.pane),last=c.transcript.at(-1);
 return {id:c.id,pane:c.pane,label:pane?.label??c.pane,role:pane?.role??null,title:c.title||'',created:c.created,closed:c.closed??null,model:c.model,vendor:c.vendor,messages:c.transcript.length,last:last?.ts?Math.trunc(last.ts):c.created,active:p.state.chats.active[c.pane]===c.id};
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
