import {readFileSync,mkdirSync,openSync,fsyncSync,closeSync,renameSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {atomicWrite} from '@harnessy/team';
import {compatJson,parseCompat,orderedClone,orderedKeys,pythonTrim,type Journal} from '@harnessy/journal';
import {object,message,RuntimeError,slice} from './errors.ts';
import type {Pane,Registry} from './pane.ts';
import type {Clock} from './types.ts';
export interface StateIO {read(path:string):string;write(path:string,text:string):void;rename?(from:string,to:string):void}
export const diskIO:StateIO={read:path=>new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)),write(path,text){
 mkdirSync(dirname(path),{recursive:true});atomicWrite(path,text);const fd=openSync(dirname(path),'r');try{fsyncSync(fd)}finally{closeSync(fd)}
},rename(from,to){renameSync(from,to);const fd=openSync(dirname(to),'r');try{fsyncSync(fd)}finally{closeSync(fd)}}};
export interface Receipt {turnInstanceId:string;recordSeqs:number[];effectsPending:boolean;interrupted:boolean;nextSeen:Record<string,number>}
export type TurnOutcome='ok'|'interrupted'|'error';
export interface TranscriptMessage {role:string;text:string;ts:number;model?:string;outcome?:TurnOutcome;errorCode?:string;origin?:'transferred';[key:string]:unknown}
export interface AnalyticalTurn {turnInstanceId:string;ts:number;model:string;vendor?:'claude'|'codex'|null;outcome:'error';errorCode:string}
export interface ResultMessage extends TranscriptMessage {role:'ai';deliverySeq:number;runtime:Receipt}
export interface Attempt {turnInstanceId:string;recordSeqs:number[];startedAt:number;deliverySeq?:number;status?:'uncertain'}
export interface DocumentRef {project:string;path:string}
export interface Chat {revision?:number;revisionHash?:string;documents?:DocumentRef[];id:string;pane:string;title:string;created:number;closed:number|null;model:string|null;vendor:string;sessionId:string|null;transcript:TranscriptMessage[];carry:string;turns?:AnalyticalTurn[];[key:string]:unknown}
export function chatMetadata(c:Chat):void {if(c.revision!==undefined&&(!Number.isSafeInteger(c.revision)||c.revision<0)||c.documents!==undefined&&(!Array.isArray(c.documents)||c.documents.length>50||!c.documents.every(d=>object(d)&&typeof d.project==='string'&&typeof d.path==='string')))throw new RuntimeError('chat_invalid','revision или documents сохранённого разговора не читаются',409)}
export function jsonClone<T>(value:T):T{return parseCompat(compatJson(value)) as T}
const CONVERSATION_FIELDS=new Set(['role','text','ts','model','vendor','usage','durationMs']);
// Execution receipts belong to the source seat and journal, never to transferred history.
export function conversationHistory(messages:readonly TranscriptMessage[]):TranscriptMessage[] {
 return jsonClone(messages.map(message=>{
  const copy=orderedClone(message);
  for(const key of orderedKeys(copy))if(!CONVERSATION_FIELDS.has(key))delete copy[key];
  if(copy.role==='ai')copy.origin='transferred';
  return copy;
 }));
}
interface Chats {chats:Record<string,Chat>;active:Record<string,string>}
export function timestampMessage(role:string,text:string,ms:number):TranscriptMessage {
 const seconds=ms/1000,number=Number.isInteger(seconds)?seconds.toFixed(1):String(seconds);
 return parseCompat('{"role":'+JSON.stringify(role)+',"text":'+JSON.stringify(text)+',"ts":'+number+'}') as TranscriptMessage
}
export class StateStore {
 readonly chatsPath:string;readonly haltPath:string;readonly attemptsPath:string;readonly materializationPath:string;
 chats:Chats={chats:{},active:{}};attempts:Record<string,Attempt>={};readonly undurable=new Set<string>();
 readonly dir:string;private io:StateIO;private clock:Clock;private id:()=>string;private damagedFingerprint:string|null=null;
 constructor(dir:string,io:StateIO,clock:Clock,id:()=>string=()=>randomBytes(2).toString('hex')){this.dir=dir;this.io=io;this.clock=clock;this.id=id;const base=join(dir,'.harness','state');this.chatsPath=join(base,'chats.json');this.haltPath=join(base,'halt.json');this.attemptsPath=join(base,'attempts.json');this.materializationPath=join(base,'seat-materialization.json')}
 private read(path:string):unknown {return parseCompat(this.io.read(path))}
 private write(path:string,data:unknown,indent?:number):void{try{this.io.write(path,compatJson(data,indent))}catch(e){throw new RuntimeError('write_failed','состояние не сохранено: '+message(e),500,{cause:e})}}
 load(registry:Registry,lineErrors:string[]):boolean {
 try{const raw=this.read(this.chatsPath);if(!object(raw)||!object(raw.chats)||!object(raw.active)||!Object.values(raw.active).every(v=>typeof v==='string'))throw Error('неверная форма');
 const chats=raw.chats as Record<string,Chat>,active=orderedClone(raw.active as Record<string,string>);
 for(const id of orderedKeys(chats)){const c=chats[id];if(!object(c)||typeof c.pane!=='string'||!Array.isArray(c.transcript)||!c.transcript.every(m=>object(m)&&typeof m.role==='string'&&typeof m.text==='string'&&typeof m.ts==='number'))throw Error('неверная форма чата '+id)}
 this.chats={chats,active};for(const [pid,cid] of Object.entries(active)){const pane=registry.get(pid),c=chats[cid];if(!pane||!c||c.pane!==pid){delete active[pid];continue}
 pane.revision=typeof c.revision==='number'?c.revision:0;
 pane.sessionId=typeof c.sessionId==='string'&&c.sessionId?c.sessionId:null;pane.transcript=c.transcript;pane.carry=typeof c.carry==='string'?c.carry:'';
 if(c.vendor==='claude'||c.vendor==='codex')pane.vendor=c.vendor;if(c.model===null)pane.model='';else if(typeof c.model==='string'&&c.model)pane.model=c.model;
 const last=[...this.recoverable(c)].reverse().find(m=>object(m.runtime)&&object(m.runtime.nextSeen));if(last&&object(last.runtime)&&object(last.runtime.nextSeen))pane.seen={...last.runtime.nextSeen} as Record<string,number>
 }
 }catch(e){this.chats={chats:{},active:{}};if((e as NodeJS.ErrnoException).code!=='ENOENT')lineErrors.push('chats.json не читается: '+message(e))}
 try{
  this.restoreRepair();
  const raw=this.read(this.attemptsPath);if(!this.validAttempts(raw))throw Error('неверная форма');this.attempts=raw;if(Object.values(raw).some(a=>a.turnInstanceId==='unreadable'))this.markDamaged(registry);
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){lineErrors.push('attempts.json не читается: '+message(e));this.markDamaged(registry)}}
 try{const raw=this.read(this.haltPath);if(!object(raw)||typeof raw.on!=='boolean')throw Error('неверная форма');return raw.on}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')lineErrors.push('halt.json не читается: '+message(e));return false}
 }
 newChatId():string {for(let n=0;n<100;n++){const cid='c'+Math.floor(this.clock.now()).toString(16)+this.id();if(!/^c[0-9a-f]+$/.test(cid))throw new RuntimeError('chat_id_invalid','неверный идентификатор чата');if(!Object.hasOwn(this.chats.chats,cid))return cid}throw new RuntimeError('chat_exists','идентификатор чата уже существует',409)}
 newChat(pane:Pane,carry='',adopt=false,id=this.newChatId()):Chat {
 if(Object.hasOwn(this.chats.chats,id))throw new RuntimeError('chat_exists','чат уже существует',409);
 const chat:Chat={id,pane:pane.id,title:'',created:Math.floor(this.clock.now()/1000),closed:null,model:pane.model||null,vendor:pane.vendor,sessionId:adopt?pane.sessionId:null,transcript:adopt?pane.transcript:[],carry:adopt?(pane.carry||carry):carry};
 this.chats.chats=orderedClone(this.chats.chats,{[id]:chat});this.chats.active=orderedClone(this.chats.active,{[pane.id]:id});
 if(!adopt){pane.sessionId=null;pane.transcript=chat.transcript;pane.carry=carry;pane.seen={};pane.revision++}
 return chat
 }
 readActions():unknown {const path=join(this.dir,'.harness','state','actions.json');try{return this.read(path)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {reviews:[],merges:[]};throw new RuntimeError('actions_invalid','действия не читаются: '+message(e),409,{cause:e})}}
 saveActions(value:unknown):void{this.write(join(this.dir,'.harness','state','actions.json'),value,2)}
 readMaterializations():unknown {try{return this.read(this.materializationPath)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw new RuntimeError('materialization_invalid','назначения ролей не читаются: '+message(e),409,{cause:e})}}
 saveMaterializations(value:unknown):void{this.write(this.materializationPath,value,2)}
 activeChat(pane:Pane,create=true):Chat|null {const id=this.chats.active[pane.id],existing=id?this.chats.chats[id]:null;return existing??(create?this.newChat(pane,'',true):null)}
 sync(registry:Registry):void {for(const p of registry.panes.values()){const c=this.activeChat(p,true);if(!c)continue;chatMetadata(c);
 c.transcript=p.transcript.filter(m=>!p.uncommitted.has(m));c.sessionId=p.sessionId;c.model=p.model||null;c.vendor=p.vendor;c.carry=p.carry;
 if(!c.title||c.title==='вводная роли'){const first=p.transcript.find(m=>m.role==='me')?.text||p.transcript.find(m=>m.role==='ai'&&pythonTrim(m.text))?.text||'';c.title=slice(pythonTrim(first).split('\n')[0]??'',60)||(p.transcript.some(m=>m.role==='peer'&&m.text.startsWith('[от харнесс]'))?'вводная роли':'')}
 const hash=createHash('sha256').update(compatJson({transcript:c.transcript,sessionId:c.sessionId,model:c.model,vendor:c.vendor,carry:c.carry,mode:p.mode,cwd:p.cwd,closed:c.closed,documents:c.documents??[]})).digest('hex');
 if(c.revisionHash!==hash){c.revision=(c.revision??0)+1;c.revisionHash=hash}
 }}
 saveChats(registry:Registry):void{this.sync(registry);this.write(this.chatsPath,this.chats,2)}
 savePanes(registry:Registry,journal:Journal):void {journal.savePanes(Object.fromEntries([...registry.panes].map(([id,p])=>[id,p.persist()])));this.saveChats(registry)}
 saveHalt(on:boolean):void{this.write(this.haltPath,{on,ts:Math.floor(this.clock.now()/1000),by:'владелец'})}
 private validAttempts(raw:unknown):raw is Record<string,Attempt> {return object(raw)&&Object.values(raw).every(v=>object(v)&&typeof v.turnInstanceId==='string'&&!!v.turnInstanceId&&Array.isArray(v.recordSeqs)&&v.recordSeqs.every(n=>Number.isSafeInteger(n)&&Number(n)>0)&&typeof v.startedAt==='number'&&Number.isFinite(v.startedAt)&&(v.deliverySeq===undefined||Number.isSafeInteger(v.deliverySeq)&&Number(v.deliverySeq)>=0))}
 private restoreRepair():void {
  try{this.io.read(this.attemptsPath);return}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')return}
  let repair:unknown;try{repair=this.read(this.attemptsPath+'.repair')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e}
  if(!this.validAttempts(repair))throw new RuntimeError('write_failed','восстановление попыток не читается: '+this.attemptsPath+'.repair',500);
  try{(this.io.rename??diskIO.rename!)(this.attemptsPath+'.repair',this.attemptsPath)}catch(e){throw new RuntimeError('write_failed','состояние не сохранено: '+this.attemptsPath+': '+message(e),500,{cause:e})}
 }
 private fingerprint():string {let raw='',stamp='';try{raw=this.io.read(this.attemptsPath)}catch(e){raw=message(e)}try{const stat=statSync(this.attemptsPath,{bigint:true});stamp=stat.ino+':'+stat.size+':'+stat.mtimeNs}catch{}return createHash('sha256').update(raw+'\n'+stamp).digest('hex')}
 private markDamaged(registry:Registry):void {const fingerprint=this.fingerprint();if(fingerprint===this.damagedFingerprint)return;this.damagedFingerprint=fingerprint;this.attempts={};for(const id of registry.ids)this.attempts[id]={turnInstanceId:'unreadable:'+id+':'+fingerprint,recordSeqs:[],startedAt:this.clock.now(),status:'uncertain'}}
 refreshDamage(registry:Registry):void {this.restoreRepair();try{const raw=this.read(this.attemptsPath);if(this.validAttempts(raw)&&!Object.values(raw).some(a=>a.turnInstanceId==='unreadable')){this.attempts=raw;this.damagedFingerprint=null;return}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return}this.markDamaged(registry)}
 deliveryBoundary(id:string,journal:Journal,attempt=this.attempts[id]):number|null {
  if(!attempt||attempt.turnInstanceId.startsWith('unreadable:'))return null;
  let boundary=0;for(const seq of attempt.recordSeqs){const record=journal.get(seq);if(!record||record.from===id||record.origin==='steer'||['protocol','rejected','ack','policy'].includes(record.kind)||!record.to.some(to=>to===id||to==='*'))return null;
   if(record.ack==='pending'){const decision=journal.repliesTo(seq).find(r=>r.seq>seq&&(r.kind==='ack'&&r.from==='owner'||r.kind==='rejected'&&r.from==='harness'&&r.to.includes('owner')));if(decision?.kind!=='ack')return null;boundary=Math.max(boundary,decision.seq)}else boundary=Math.max(boundary,seq)
  }
  return attempt.deliverySeq===undefined||attempt.deliverySeq===boundary?boundary:null
 }
 private writeAttempts(next:Record<string,Attempt>):void {
  if(!this.damagedFingerprint){this.write(this.attemptsPath,next,2);return}
  // Every writer preserves the damaged original, including turns of unrelated seats.
  // A failed fsync may leave a completed rename; a retry must use a fresh archive name.
  const repair=this.attemptsPath+'.repair',backup=this.attemptsPath+'.damaged-'+this.clock.now()+'-'+this.damagedFingerprint+'-'+randomBytes(16).toString('hex'),rename=this.io.rename??diskIO.rename!;
  this.write(repair,next,2);
  try{
   try{rename(this.attemptsPath,backup)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
   rename(repair,this.attemptsPath);
  }catch(e){throw new RuntimeError('write_failed','состояние не сохранено: '+this.attemptsPath+': '+message(e),500,{cause:e})}
  this.damagedFingerprint=null;
 }
 startAttempt(pane:Pane,attempt:Attempt):void {const next=orderedClone(this.attempts,{[pane.id]:attempt});this.writeAttempts(next);this.attempts=next}
 clearAttempt(id:string):void {if(!Object.hasOwn(this.attempts,id))return;const next=orderedClone(this.attempts);delete next[id];this.writeAttempts(next);this.attempts=next}
 uncertain(id:string):void {const a=this.attempts[id];if(a&&a.status!=='uncertain'){const next=orderedClone(this.attempts,{[id]:{...a,status:'uncertain' as const}});this.writeAttempts(next);this.attempts=next}}
 commitResult(pane:Pane,registry:Registry,result:ResultMessage):void {
 if(!pane.transcript.some(m=>object(m.runtime)&&m.runtime.turnInstanceId===result.runtime.turnInstanceId))pane.transcript.push(result);
 this.undurable.add(result.runtime.turnInstanceId);this.saveChats(registry);this.undurable.delete(result.runtime.turnInstanceId)
 }
 recordFailedTurn(pane:Pane,registry:Registry,turn:AnalyticalTurn):void {
  if(Object.values(this.chats.chats).some(chat=>chat.turns?.some(t=>t.turnInstanceId===turn.turnInstanceId)||chat.transcript.some(m=>object(m.runtime)&&m.runtime.turnInstanceId===turn.turnInstanceId)))return;
  const chat=this.activeChat(pane)!;chat.turns=[...(chat.turns??[]),turn];this.saveChats(registry)
 }
 private recoverable(c:Chat):TranscriptMessage[]{const op=c.promotion;return object(op)&&op.target===this.dir&&op.sid===c.pane&&Number.isSafeInteger(op.boundary)?c.transcript.slice(Number(op.boundary)):c.transcript}
 results(pane:Pane):ResultMessage[]{return Object.values(this.chats.chats).filter(c=>c.pane===pane.id).flatMap(c=>this.recoverable(c).filter(m=>m.role==='ai'&&(Object.hasOwn(m,'runtime')||Object.hasOwn(m,'deliverySeq'))) as ResultMessage[])}
 finishEffects(result:ResultMessage,registry:Registry):void {result.runtime.effectsPending=false;try{this.saveChats(registry)}catch(e){result.runtime.effectsPending=true;throw e}}
 validate(result:ResultMessage,pane:Pane,journal:Journal):void {
 const rt=result.runtime,fail=():never=>{throw new RuntimeError('recovering','записи сохранённого ответа не совпадают с журналом',409)};
 if(!object(rt)||typeof rt.turnInstanceId!=='string'||!rt.turnInstanceId||typeof rt.effectsPending!=='boolean'||typeof rt.interrupted!=='boolean'||!object(rt.nextSeen)||!Object.values(rt.nextSeen).every(n=>Number.isSafeInteger(n)&&Number(n)>=0)||!Array.isArray(rt.recordSeqs)||new Set(rt.recordSeqs).size!==rt.recordSeqs.length||!Number.isSafeInteger(result.deliverySeq)||result.deliverySeq<0)fail();
 let max=0;for(const seq of rt.recordSeqs){if(!Number.isSafeInteger(seq)||seq<=0)fail();const r=journal.get(seq);if(!r||r.from===pane.id||r.origin==='steer'||!r.to.some(t=>t===pane.id||t==='*')||['protocol','rejected','ack','policy'].includes(r.kind))fail();
 const decision=r!.ack==='pending'?journal.repliesTo(seq).find(a=>a.seq>seq&&(a.kind==='ack'&&a.from==='owner'||a.kind==='rejected'&&a.from==='harness'&&a.to.includes('owner'))):null;
 const delivered=r!.ack==='pending'?decision?.kind==='ack'?decision.seq:undefined:r!.seq;if(delivered===undefined)fail();max=Math.max(max,delivered!)
 }if(max!==result.deliverySeq)fail()
 }
}
