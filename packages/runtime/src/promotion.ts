import {existsSync,realpathSync,statSync,readFileSync} from 'node:fs';
import {join,relative,isAbsolute,sep} from 'node:path';
import {providerId,withPathLock,loadTeam,readManifest,addSeatLocked,ensureSeatFileLocked,canonicalPath,MODE_IDS,type PathLock,type Mode,type Vendor} from '@harnessy/team';
import {initProject,projectsRoot,projectNameFrom} from '@harnessy/projects';
import {transcriptText,promotionIntro} from '@harnessy/context';
import type {Initiator} from '@harnessy/journal';
import {RuntimeError,object,deepFreeze,message} from './errors.ts';
import {owner,free,reserve,same} from './operations.ts';
import {jsonClone,conversationHistory,diskIO,type Chat,type DocumentRef} from './state.ts';
import {parseCompat} from '@harnessy/journal';
import {meta,promotionIdentity} from './chats.ts';
import {roomWithoutProject} from './roles.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
const HARNESS={seat:'harness',trust:'harness'} as const,OWNER={seat:'owner',trust:'owner'} as const;
const DEFAULT_TASK='Сформулируй по обсуждению цель проекта, свою предметную вводную и предложи состав команды. До подтверждения владельцем участников не создавай.';
export interface PromotionInput {project?:unknown;revision?:unknown;documents?:unknown;task?:unknown;createProject?:unknown}
interface Promotion {
 id:string;sid:string;target:string;root:string;boundary:number;done:boolean;progress?:{completed:number;error:string|null};
 input:{project:string;revision:number;documents:DocumentRef[];task:string;createProject:boolean};
 source:{pane:string;cwd:string;chat:Chat};model:string;vendor:Vendor;mode:Mode;intro:string;
}
function invalid(text='сохранённое повышение не читается'):never {throw new RuntimeError('promotion_invalid',text,409)}
function parse(raw:unknown):Promotion {
 if(!object(raw)||typeof raw.id!=='string'||!/^c[0-9a-f]+$/.test(raw.id)||typeof raw.sid!=='string'||raw.sid.length>31||!/^orchestrator(?:[1-9][0-9]*)?$/.test(raw.sid)||typeof raw.target!=='string'||!isAbsolute(raw.target)||typeof raw.root!=='string'||!Number.isSafeInteger(raw.boundary)||Number(raw.boundary)<0||typeof raw.done!=='boolean'||!object(raw.input)||!object(raw.source)||!object(raw.source.chat)||typeof raw.source.pane!=='string'||typeof raw.source.cwd!=='string'||typeof raw.source.chat.id!=='string'||!Array.isArray(raw.source.chat.transcript)||raw.boundary!==raw.source.chat.transcript.length||typeof raw.model!=='string'||!raw.model||!providerId(raw.vendor)||!MODE_IDS.includes(raw.mode as Mode)||typeof raw.intro!=='string')invalid();
 if(raw.progress!==undefined&&(!object(raw.progress)||!Number.isInteger(raw.progress.completed)||Number(raw.progress.completed)<0||Number(raw.progress.completed)>4||!(raw.progress.error===null||typeof raw.progress.error==='string'&&raw.progress.error.length<=600)))invalid();
 const i=raw.input;if(typeof i.project!=='string'||!Number.isSafeInteger(i.revision)||!Array.isArray(i.documents)||!i.documents.every(d=>object(d)&&typeof d.project==='string'&&typeof d.path==='string')||typeof i.task!=='string'||typeof i.createProject!=='boolean')invalid();
 const op=raw as unknown as Promotion;if(op.source.pane!=='room'||op.source.chat.pane!=='room'||typeof op.source.chat.carry!=='string'||!isAbsolute(op.input.project)||!isAbsolute(op.root)||!isAbsolute(op.source.cwd)||op.input.revision<0||op.input.documents.length>50||op.source.chat.promotion!==undefined||!op.source.chat.transcript.every(m=>object(m)&&typeof m.role==='string'&&typeof m.text==='string'&&typeof m.ts==='number'))invalid();return deepFreeze(op);
}
function documents(value:unknown):DocumentRef[]{
 if(!Array.isArray(value)||value.length>50)throw new RuntimeError('documents_invalid','documents: не более 50 ссылок {project,path}',400);
 return value.map(raw=>{
  if(!object(raw)||typeof raw.project!=='string'||!isAbsolute(raw.project)||typeof raw.path!=='string'||!raw.path)throw new RuntimeError('documents_invalid','документ: нужны исходный проект и путь',400);
  try{const project=realpathSync(raw.project),file=realpathSync(isAbsolute(raw.path)?raw.path:join(project,raw.path)),path=relative(project,file);
   if(!path||path==='..'||path.startsWith('..'+sep)||isAbsolute(path)||!statSync(file).isFile())throw Error('файл вне исходного проекта или не обычный файл');return {project,path};
  }catch(e){throw new RuntimeError('documents_invalid','документ не прочитан: '+message(e),400)}
 });
}
function verifyDocuments(refs:DocumentRef[]){if(JSON.stringify(documents(refs))!==JSON.stringify(refs))throw new RuntimeError('documents_invalid','путь документа изменился после сохранения',409)}
function rolePath(op:Promotion){return 'roles/seats/'+op.id+'.md'}
function roleFile(op:Promotion){return '<!-- promotion:'+op.id+' -->\nОркестратор команды проекта. Предметная вводная и первое поручение сохранены в журнале повышения.\n'}
// Only receipts from this operation's frozen source may retain the old addressee.
// A room label alone proves nothing: another room chat uses that same label.
export function promotionHistory(p:ProjectState,c:Chat):{pane:string;seqs:Set<number>}|null {
 if(c.promotion===undefined)return null;
 const op=parse(c.promotion);
 if(!op.done||op.target!==p.dir||op.sid!==c.pane||op.source.chat.id!==c.id||!existing(p,op))invalid('родословная контекста не совпадает с повышением');
 const seqs=new Set<number>();
 // Moving a conversation strips journal receipts; source numbers cannot name target records.
 if(op.input.project!==p.dir||op.source.cwd!==p.dir)return {pane:op.source.pane,seqs};
 for(const m of op.source.chat.transcript){
  if(m.project!==undefined&&m.project!==op.input.project||m.chat!==undefined&&m.chat!==c.id||object(m.provenance)&&(m.provenance.project!==op.input.project||m.provenance.chat!==c.id))invalid('исходная стенограмма содержит чужую привязку');
  const receipt=m.runtime;if(!object(receipt)||typeof receipt.turnInstanceId!=='string'||!Array.isArray(receipt.recordSeqs))continue;
  const preserved=c.transcript.some(n=>n.role===m.role&&n.text===m.text&&n.ts===m.ts&&object(n.runtime)&&n.runtime.turnInstanceId===receipt.turnInstanceId&&JSON.stringify(n.runtime.recordSeqs)===JSON.stringify(receipt.recordSeqs));
  if(preserved)for(const seq of receipt.recordSeqs)if(Number.isSafeInteger(seq)&&Number(seq)>0)seqs.add(Number(seq));
 }
 return {pane:op.source.pane,seqs};
}
function existing(p:ProjectState,op?:Promotion){const seat=Object.values(p.team?.seats??{}).find(s=>s.kind==='orchestrator');
 let own=false;if(seat&&op&&seat.id===op.sid&&seat.instructions===rolePath(op)){
  try{own=readFileSync(join(p.dir,'.harness',seat.instructions),'utf8')===roleFile(op)}catch{}
 }
 if(seat&&!own)throw new RuntimeError('orchestrator_exists','В проекте уже есть оркестратор. Откройте существующий разговор.',409,{fields:{pane:seat.id,chat:p.state.chats.active[seat.id]??null}});
 return seat;
}
function availableSid(p:ProjectState):string {
 const seats=readManifest(join(p.dir,'.harness')).get('seats') as Map<string,unknown>;
 const occupied=new Set([...seats.keys(),...p.registry.ids,...Object.values(p.state.chats.chats).map(c=>c.pane)]);
 let sid='orchestrator',n=1;while(occupied.has(sid))sid='orchestrator'+(++n);return sid;
}
function publishProgress(p:ProjectState,c:Chat){if(!p.closed)p.owner.publish({type:'promotion',project:p.dir,promotion:promotionIdentity(c)})}
function progress(c:Chat,op:Promotion,completed:number,error:string|null=null){const previous=promotionIdentity(c);return {...op,progress:{completed:Math.max(previous?.completed??0,completed),error}}}
function save(p:ProjectState,c:Chat,op:Promotion){c.promotion=jsonClone(progress(c,op,op.done?4:c.pane===op.sid?3:op.target===op.input.project?1:0,op.done?null:op.progress?.error??null));p.state.savePanes(p.registry,p.journal);publishProgress(p,c)}
function materialize(runtime:Runtime,p:ProjectState,lock:PathLock,op:Promotion){
 same(runtime,p);if(op.target!==p.dir)invalid('папка повышения не совпадает');verifyDocuments(op.input.documents);
 let c=p.state.chats.chats[op.source.chat.id];if(c&&(!object(c.promotion)||c.promotion.id!==op.id))invalid('этот идентификатор занят другим разговором');
 if(c&&parse(c.promotion).done){p.state.savePanes(p.registry,p.journal);release(p,op);return c}
 if(!c){c=jsonClone(op.source.chat);c.promotion=jsonClone(progress(c,op,1));p.state.chats.chats[c.id]=c;p.state.saveChats(p.registry);publishProgress(p,c)}
 // The marker precedes the seat file. A crash after a successful file write resumes the same identity.
 p.team=loadTeam(join(p.dir,'.harness'));const found=existing(p,op);p.materializing.add(op.sid);
 c.promotion=jsonClone(progress(c,op,2));publishProgress(p,c);
 ensureSeatFileLocked(lock,p.team.harnessDir,op.id,roleFile(op),true);
 const seat=found??addSeatLocked(lock,p.team.harnessDir,{role:'orchestrator',kind:'orchestrator',label:'Оркестратор',vendor:op.vendor,model:op.model,mode:op.mode},{},{sid:op.sid,instructions:rolePath(op),file:null});
 if(seat.vendor!==op.vendor||seat.model!==op.model||seat.mode!==op.mode)invalid('настройки сохранённого места изменились');
 p.team=loadTeam(p.team.harnessDir);const pane=p.registry.add(seat);
 if(c.pane!==op.sid){
  const moved=op.source.cwd!==p.dir,history=moved?conversationHistory(op.source.chat.transcript).map((m,i)=>{const seq=op.source.chat.transcript[i]!.seq;return seq===undefined?m:{...m,seq}}):jsonClone(op.source.chat.transcript).map(m=>({...m,provenance:{project:op.input.project,pane:op.source.pane,chat:c!.id}}));
  const sourcePane=p.registry.get(op.source.pane);if(sourcePane&&p.state.chats.active[sourcePane.id]===c.id)p.state.newChat(sourcePane);
  c.pane=op.sid;c.transcript=history;c.transcriptSeq=op.source.chat.transcriptSeq??0;c.documents=jsonClone(op.input.documents);c.sessionId=!moved?op.source.chat.sessionId:null;c.carry=op.source.chat.carry;
  if(moved){const carry=transcriptText(conversationHistory(op.source.chat.transcript));if(carry&&!c.carry.endsWith(carry))c.carry=(c.carry?c.carry+'\n\n':'')+carry}
  c.model=op.model;c.vendor=op.vendor;c.closed=null;
 }
 p.state.chats.active[pane.id]=c.id;pane.transcript=c.transcript;pane.transcriptSeq=c.transcriptSeq??0;pane.sessionId=c.sessionId;pane.carry=c.carry;pane.seen={};pane.revision++;
 save(p,c,op);
 const thread='promotion:'+op.id;
 for(const [suffix,kind,text,origin] of [['intro','note',op.intro,'onboarding'],['task','task',op.input.task,'promotion']] as const){
  const from=suffix==='intro'?HARNESS:OWNER;
  const saved=p.journal.read({limit:0,thread:thread+':'+suffix}).find(r=>r.from===from.seat&&r.origin===origin&&r.kind===kind&&r.to.length===1&&r.to[0]===pane.id);
  if(saved&&saved.text!==text)invalid('квитанция повышения не совпадает');
  if(!saved)p.channel.postCore({to:[pane.id],kind,text,origin,thread:thread+':'+suffix},from);
 }
 save(p,c,{...op,done:true});release(p,op);return c;
}
function reply(p:ProjectState,c:Chat,op:Promotion,already:boolean){const pane=p.registry.get(op.sid);if(!pane)invalid();return {ok:true as const,project:p.dir,pane:pane.settings(),chat:meta(p,c),promotion:promotionIdentity(c),created:op.target!==op.input.project,already,team:join(p.dir,'.harness','team.yaml')}}
export async function promoteChat(runtime:Runtime,id:string,args:PromotionInput,initiator:Initiator){
 const p=owner(runtime,initiator);p.state.saveChats(p.registry);const c=p.state.chats.chats[id];if(!c)throw new RuntimeError('chat_unknown','нет такого разговора',404);
 if(typeof args.project!=='string'||!Number.isSafeInteger(args.revision)||Number(args.revision)<0||args.task!==undefined&&typeof args.task!=='string'||args.createProject!==undefined&&typeof args.createProject!=='boolean')throw new RuntimeError('promotion_invalid','нужны project, revision и documents; task — строка, createProject — boolean',400);
 const refs=documents(args.documents),task=typeof args.task==='string'?args.task.trim()||DEFAULT_TASK:DEFAULT_TASK;let op:Promotion;
 if([...task].length>100000)throw new RuntimeError('promotion_invalid','первое поручение длиннее 100000 символов',400);
 if(c.promotion!==undefined){op=parse(c.promotion);
  if(args.project!==op.input.project&&args.project!==op.target||args.revision!==op.input.revision&&args.revision!==c.revision||JSON.stringify(refs)!==JSON.stringify(op.input.documents)||args.task!==undefined&&task!==op.input.task||args.createProject!==undefined&&args.createProject!==op.input.createProject)throw new RuntimeError('stale_chat','вход повышения отличается от сохранённого',409);
  if(p.dir!==op.input.project&&p.dir!==op.target)throw new RuntimeError('project_changed','проект сменился',409);
  if(op.done&&p.dir===op.target){p.state.savePanes(p.registry,p.journal);release(p,op);await runtime.resumeQueue(op.sid,p);return reply(p,c,op,true)}
 }else {
  if(args.project!==p.dir)throw new RuntimeError('project_changed','проект сменился',409);
  const source=p.registry.get(c.pane);if(!source||source.id!=='room'||p.state.chats.active[source.id]!==c.id)throw new RuntimeError('stale_chat','выберите активный разговор без роли',409);
  free(p,source,undefined,args.createProject===true||roomWithoutProject(runtime,p));if(c.revision!==args.revision)throw new RuntimeError('stale_chat','разговор изменился',409);if(args.createProject!==true&&!roomWithoutProject(runtime,p))existing(p);
  if(!source.model)throw new RuntimeError('model_required','Сначала выберите модель разговора.',400);
  const createProject=args.createProject===true||roomWithoutProject(runtime,p),opid=p.state.newChatId(),root=canonicalPath(projectsRoot(runtime.settings.effective())),target=createProject?runtime.projectPath(join(root,projectNameFrom(c.transcript,()=>new Date(runtime.clock.now()))+'-'+opid.slice(1)),root):p.dir;
  if(createProject&&existsSync(target))throw new RuntimeError('project_exists','целевая папка уже существует',409);
  const sourceChat=jsonClone(c);delete sourceChat.promotion;
  op=parse({id:opid,sid:'orchestrator',target,root,boundary:c.transcript.length,done:false,input:{project:p.dir,revision:c.revision,documents:refs,task,createProject:args.createProject??createProject},source:{pane:source.id,cwd:source.cwd,chat:sourceChat},model:source.model,vendor:source.vendor,mode:source.mode==='chat'?'read':source.mode,intro:promotionIntro(target,createProject?'Контекст прежнего разговора передан в этой же пачке.':transcriptText(c.transcript),refs)});
  if([...op.intro].length>100000)throw new RuntimeError('documents_invalid','ссылки на документы не помещаются во вводную: сократите список',400);
 }
 op=parse({...op,progress:{completed:promotionIdentity(c)?.completed??0,error:null}});
 const source=p.registry.get(c.pane),revision=c.revision,oldPaneRevision=source?.revision;
 if(p.dir===op.input.project&&c.pane===op.source.pane&&c.revision!==op.input.revision)throw new RuntimeError('stale_chat','исходный разговор изменился после сохранения повышения',409);
 const owned=[op.sid,op.source.pane].filter(id=>p.materializing.has(id)||p.restoreFailed.has(id));
 for(const id of owned)if(p.editing.has(id)||p.registry.get(id)?.busy)throw new RuntimeError('busy','повышение уже выполняется',409);
 const hold=reserve(p,[...p.registry.panes.values()].filter(x=>!owned.includes(x.id)),'повышение: дождитесь завершения активных ходов',op.target!==p.dir);
 for(const id of owned)p.editing.set(id,hold.token);

 const assertSource=()=>{same(runtime,p);p.state.sync(p.registry);if(c.revision!==revision||source&&(p.registry.get(source.id)!==source||p.state.chats.active[source.id]!==c.id)||source?.revision!==oldPaneRevision)throw new RuntimeError('stale_chat','разговор изменился во время повышения',409)};
 let result:ReturnType<typeof reply>;
 try{
  await withPathLock(p.dir,lock=>{assertSource();verifyDocuments(op.input.documents);if(c.promotion===undefined){p.team=loadTeam(join(p.dir,'.harness'));if(op.target===p.dir){existing(p);op=parse({...op,sid:availableSid(p)})}p.materializing.add(op.source.pane);save(p,c,op)}else save(p,c,op);p.materializing.add(op.source.pane);if(op.target===p.dir)result=reply(p,materialize(runtime,p,lock,op),op,false)});if(op.target!==p.dir)assertSource();
  if(op.target!==p.dir){
   const validatePath=()=>{assertSource();if(runtime.projectPath(op.target,op.root)!==op.target)throw new RuntimeError('project_changed','целевая папка изменилась',409)};validatePath();await initProject(op.target,{orchestrator:false,git:true},{validatePath,...(runtime.deps.gitops?{gitops:runtime.deps.gitops}:{})});assertSource();c.promotion=jsonClone(progress(c,op,1));publishProgress(p,c);
   await runtime.openProject(op.target,{expected:p,deferPumps:true,initialize:next=>withPathLock(next.dir,lock=>{const chat=materialize(runtime,next,lock,op);result=reply(next,chat,op,false)})});
  }
 }catch(e){for(const candidate of [p,...(()=>{try{return [runtime.project]}catch{return []}})()]){const chat=candidate.state.chats.chats[id];if(!candidate.closed&&object(chat?.promotion)&&chat.promotion.id===op.id)markFailure(candidate,chat,e)}throw e
 }finally{hold.release();for(const id of owned)if(p.editing.get(id)===hold.token)p.editing.delete(id)}
 const next=runtime.project;await runtime.resumeQueue(op.sid,next);return result!;
}
function markFailure(p:ProjectState,c:Chat,e:unknown){const ids=[c.pane];if(object(c.promotion)){try{const op=parse(c.promotion);c.promotion=jsonClone(progress(c,op,promotionIdentity(c)?.completed??0,message(e).slice(0,600)));publishProgress(p,c);ids.push(op.source.pane);if(p.team?.seats[op.sid]?.instructions===rolePath(op))ids.push(op.sid)}catch{}}for(const id of ids){p.materializing.delete(id);p.restoreFailed.set(id,message(e))}}
function release(p:ProjectState,op:Promotion){for(const id of [op.sid,op.source.pane]){p.materializing.delete(id);p.restoreFailed.delete(id)}}
function targetCompleted(op:Promotion):boolean {
 let data:unknown;try{data=parseCompat(diskIO.read(join(op.target,'.harness/state/chats.json')))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}
 if(!object(data)||!object(data.chats))invalid('целевой разговор не читается');const c=data.chats[op.source.chat.id];
 if(!object(c)||c.promotion===undefined)return false;const target=parse(c.promotion);
 return target.done&&target.id===op.id&&target.target===op.target&&c.pane===op.sid&&target.source.chat.id===op.source.chat.id&&JSON.stringify(target.input)===JSON.stringify(op.input);
}
export async function restorePromotions(runtime:Runtime,p:ProjectState){
 for(const c of Object.values(p.state.chats.chats)){if(c.promotion===undefined)continue;
  try{const op=parse(c.promotion);if(!op.done){p.materializing.add(op.source.pane);if(op.target===p.dir)await withPathLock(p.dir,lock=>materialize(runtime,p,lock,op));else if(targetCompleted(op)){save(p,c,{...op,done:true});release(p,op)}else {markFailure(p,c,Error('Повышение сохранено. Повторите «Назначить оркестратора», чтобы открыть целевой проект.'))}}}
  catch(e){p.lineErrors.push('повышение '+c.id+' не завершено: '+message(e));markFailure(p,c,e)}
 }
}
