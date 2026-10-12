import {readFileSync,existsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {providerId,withPathLock,addSeatLocked,ensureSeatFileLocked,loadTeam,readManifest,mapping,pyDefault,pyString,ROLE_CATALOG,MODE_IDS,MODES,instructionsFor,seatKind,TeamError,type Seat,type Mode,type Vendor,type PathLock,type AddSeatArgs} from '@harnessy/team';
import {onboarding,transcriptText} from '@harnessy/context';
import {pythonTrim,type Initiator} from '@harnessy/journal';
import {object,RuntimeError,deepFreeze,message} from './errors.ts';
import {jsonClone,conversationHistory,type Chat} from './state.ts';
import {closeChat,meta} from './chats.ts';
import {owner,same,free} from './operations.ts';
import type {Pane} from './pane.ts';
import type {Runtime} from './runtime.ts';
import type {ActionContext,AssignRoleResult,ProjectState} from './types.ts';
import type {AssignRoleArgs} from '@harnessy/providers';

export interface SeatInput {
 role:string;kind:import('@harnessy/team').SeatKind;vendor:Vendor;model:string;mode:Mode;specialization?:{title:string;text:string};
 instructions:{path:string|null;content:string};label:string;writePaths:string[];worktree:string|null;mandate?:number;
}
export interface Assignment {
 awaitFirstOpen?:boolean;
 operationId:string;sid:string;by:string;how:string;error?:string;input:SeatInput;files:{seat:{path:string;content:string}|null};
 source:{chat:Chat|null;carry:string};stages:{team:boolean;seatFile:boolean;chat:boolean;status:boolean;onboarding:boolean};
}
export interface CreateSeatInput {role?:unknown;model?:unknown;mode?:unknown;specialization?:unknown}
interface Authority {by:string;how:string;assert():void;mandate?:number}
const caches=new WeakMap<object,Map<string,Assignment>>(),failures=new WeakMap<object,Map<string,string>>();
const all=(op:Assignment)=>Object.values(op.stages).every(Boolean);
function invalid():never {throw new RuntimeError('materialization_invalid','неверная запись назначения роли',409)}
function valid(raw:unknown):Assignment {
 if(object(raw)&&raw.awaitFirstOpen!==undefined&&typeof raw.awaitFirstOpen!=='boolean')invalid();
 if(!object(raw)||typeof raw.operationId!=='string'||!/^c[0-9a-f]{5,}$/.test(raw.operationId)||typeof raw.sid!=='string'||!/^[a-z][a-z0-9_-]{0,30}$/.test(raw.sid)||['owner','harness','all','room'].includes(raw.sid)||typeof raw.by!=='string'||!raw.by||typeof raw.how!=='string'||!object(raw.input)||!object(raw.files)||!object(raw.source)||!object(raw.stages))invalid();
 if(raw.error!==undefined&&(typeof raw.error!=='string'||!raw.error||raw.error.length>600))invalid();
 const i=raw.input,st=raw.stages;if(!Object.hasOwn(i,'kind'))i.kind=seatKind(undefined,i.role);else seatKind(i.kind);
 if(typeof i.role!=='string'||!i.role||!providerId(i.vendor)||typeof i.model!=='string'||!i.model||!MODE_IDS.includes(i.mode as Mode)||!object(i.instructions)||(i.instructions.path!==null&&typeof i.instructions.path!=='string')||typeof i.instructions.content!=='string'||typeof i.label!=='string'||!Array.isArray(i.writePaths)||!i.writePaths.every(x=>typeof x==='string')||(i.worktree!==null&&typeof i.worktree!=='string')||typeof raw.source.carry!=='string'||!['team','seatFile','chat','status','onboarding'].every(k=>typeof st[k]==='boolean'))invalid();
 if(i.specialization!==undefined)specialization(i.specialization);
 if(i.mandate!==undefined&&(!Number.isSafeInteger(i.mandate)||Number(i.mandate)<1))invalid();
 if(raw.files.seat!==null&&(!object(raw.files.seat)||raw.files.seat.path!=='roles/seats/'+raw.sid+'.md'||typeof raw.files.seat.content!=='string'))invalid();
 const c=raw.source.chat;
 if(c!==null&&(!object(c)||typeof c.id!=='string'||typeof c.pane!=='string'||c.model!==null&&typeof c.model!=='string'||!providerId(c.vendor)||typeof c.carry!=='string'||typeof c.cwd!=='string'||!Array.isArray(c.transcript)||!c.transcript.every(m=>object(m)&&typeof m.role==='string'&&typeof m.text==='string'&&typeof m.ts==='number')))invalid();
 const op=raw as unknown as Assignment;deepFreeze(op.input);deepFreeze(op.source);deepFreeze(op.files);return op;
}
function operations(p:ProjectState):Map<string,Assignment> {
 const cached=caches.get(p.state);if(cached)return cached;
 const raw=p.state.readMaterializations();if(!Array.isArray(raw))invalid();const map=new Map<string,Assignment>();
 for(const item of raw){const op=valid(item);if(map.has(op.operationId))invalid();map.set(op.operationId,op);if(!all(op))p.materializing.add(op.sid)}
 caches.set(p.state,map);return map;
}
export function materializationProgress(p:ProjectState,operationId:string,sid:string){
 const op=operations(p).get(operationId);if(!op)return {operationId,sid,state:'pending' as const,stages:null,error:null};if(op.sid!==sid)invalid();
 const error=failures.get(p.state)?.get(operationId)??op.error??p.restoreFailed.get(sid)??null;
 return {operationId,sid,stages:{...op.stages},state:error?'failed' as const:all(op)?'complete' as const:'running' as const,error};
}
export function assignmentSnapshot(p:ProjectState,operationId:string,sid:string):Assignment|null {
 const op=operations(p).get(operationId);if(op&&op.sid!==sid)invalid();return op?jsonClone(op):null;
}
export function proposalAssignment(p:ProjectState,sid:string):Assignment|null {
 const found=[...operations(p).values()].find(op=>op.sid===sid&&op.how.startsWith('по подтверждённому составу '));return found?jsonClone(found):null;
}
function put(p:ProjectState,op:Assignment):void {
 const map=operations(p),next=new Map(map);next.set(op.operationId,op);
 try{p.state.saveMaterializations([...next.values()]);caches.set(p.state,next)}catch(e){caches.delete(p.state);try{operations(p)}catch{}throw e}
}
function stage(p:ProjectState,op:Assignment,key:keyof Assignment['stages']):Assignment {
 const next={...op,stages:{...op.stages,[key]:true}};put(p,next);return next;
}
function specialization(raw:unknown):{title:string;text:string} {
 if(!object(raw)||Object.keys(raw).some(k=>!['title','text'].includes(k))||typeof raw.title!=='string'||[...raw.title].length<1||[...raw.title].length>60||typeof raw.text!=='string'||[...raw.text].length<1||[...raw.text].length>20000)throw new TeamError('specialization_invalid','специализация: title — строка 1–60 символов, text — строка 1–20000 символов');
 return {title:raw.title,text:raw.text};
}
export function noProject(runtime:Runtime,p=runtime.project):boolean{return p.dir===runtime.defaultDir}
export function roomWithoutProject(runtime:Runtime,p=runtime.project){return noProject(runtime,p)||p.registry.get('room')?.mode==='chat'}
export function hasOrchestrator(p:ProjectState){return [...p.registry.panes.values()].some(x=>x.kind==='orchestrator')}
export function roleCatalog(runtime:Runtime){const p=runtime.project,orch=hasOrchestrator(p);return ROLE_CATALOG.map(c=>({...c,kind:seatKind(undefined,c.role),available:c.role==='orchestrator'&&!orch,reason:c.role==='orchestrator'&&!orch?null:c.role==='orchestrator'?'В проекте уже есть оркестратор':'участников создаёт оркестратор по подтверждённому предложению'}))}
function input(runtime:Runtime,p:ProjectState,args:CreateSeatInput,existing?:Seat):SeatInput {
 const role=String(args.role||''),cat=ROLE_CATALOG.find(c=>c.role===role);
 if(!existing)seatKind(undefined,role);
 if(!p.team)throw new RuntimeError('team_invalid','команда папки не читается: '+p.lineErrors.join('; '),400);
 if(!existing&&noProject(runtime,p))throw new RuntimeError('no_project','папка по умолчанию — не проект: создай проект или назначь оркестратора разговору без проекта',400);
 if(!existing&&role!=='orchestrator'&&!hasOrchestrator(p))throw new TeamError('role_unknown','сначала оркестратор — он разворачивает проект и вводит остальные роли');
 const model=existing?.model||pythonTrim(String(args.model||''))||p.registry.get('room')?.model||p.registry.models.claude?.find(x=>x.id)?.id||'';
 const vendor=existing?.vendor??[...p.registry.providers].find(v=>p.registry.models[v]?.some(x=>x.id===model));
 if(!vendor)throw new RuntimeError('model_unknown','модель не из каталога',400);
 const rawMode=existing?.mode??String(args.mode||runtime.settings.effective().defaultMode||'read'),mode=MODE_IDS.includes(rawMode as Mode)?rawMode as Mode:'read';
 const path=existing?.instructions??(existsSync(join(p.team.harnessDir,'roles',role+'.md'))?'roles/'+role+'.md':null);
 const content=existing?instructionsFor(p.team,existing):path?readFileSync(join(p.team.harnessDir,path),'utf8'):'';
 const spec=args.specialization===undefined?undefined:specialization(args.specialization);
 return {role,kind:existing?.kind??seatKind(undefined,role),vendor,model,mode,...(spec?{specialization:spec}:{}),instructions:{path,content},label:existing?.label??cat?.label??role,writePaths:[...(existing?.writePaths??[])],worktree:existing?.worktree??null};
}
export function chatSnapshot(p:ProjectState,pane:Pane):Chat {
 const old=p.state.activeChat(pane,false),base=old?jsonClone(old):{id:p.state.newChatId(),pane:pane.id,title:'',created:Math.floor(p.now()/1000),closed:null,model:pane.model,vendor:pane.vendor,sessionId:pane.sessionId,transcript:[],carry:pane.carry};
 return jsonClone({...base,model:pane.model,vendor:pane.vendor,sessionId:pane.sessionId,transcript:conversationHistory(pane.transcript),carry:pane.carry,cwd:pane.cwd});
}
function matches(seat:Seat,i:SeatInput,op:Assignment):boolean {
 const instructions=op.files.seat?.path??i.instructions.path;
 return seat.kind===i.kind&&seat.role===i.role&&seat.vendor===i.vendor&&seat.model===i.model&&seat.mode===i.mode&&seat.label===i.label&&seat.instructions===instructions&&JSON.stringify(seat.writePaths)===JSON.stringify(i.writePaths)&&seat.worktree===i.worktree;
}
function currentStatus(p:ProjectState,op:Assignment){return p.journal.read({limit:0,thread:'assignment:'+op.operationId}).find(r=>r.from==='harness'&&r.kind==='status'&&r.origin==='assign'&&r.to.includes('owner'))}
function materialize(runtime:Runtime,p:ProjectState,lock:PathLock,original:Assignment,authority:()=>void):{pane:Pane;chat:Chat} {
 try{const result=materializeSteps(runtime,p,lock,original,authority),saved=operations(p).get(original.operationId)!;
  if(saved.error!==undefined){const {error:_,...clean}=saved;put(p,clean)}failures.get(p.state)?.delete(original.operationId);if(!p.materializing.has(original.sid))p.restoreFailed.delete(original.sid);return result;
 }catch(e){if(!p.closed){const error=message(e).slice(0,600)||'Назначение не завершено';let errors=failures.get(p.state);if(!errors){errors=new Map();failures.set(p.state,errors)}errors.set(original.operationId,error);
  // Preserve the original failure even when the storage that failed cannot save its diagnostic.
  try{const saved=operations(p).get(original.operationId);if(saved&&saved.sid===original.sid)put(p,{...saved,error})}catch{}
  p.owner.publish({type:'teamProposals',project:p.dir});
 }throw e}
}
function materializeSteps(runtime:Runtime,p:ProjectState,lock:PathLock,original:Assignment,authority:()=>void):{pane:Pane;chat:Chat} {
 let op=original;authority();same(runtime,p);
 if(all(op)){if(![...operations(p).values()].some(x=>x.sid===op.sid&&!all(x)))p.materializing.delete(op.sid);const pane=p.registry.get(op.sid),chat=p.state.chats.chats[op.operationId];if(!pane||!chat)invalid();return {pane,chat}}
 p.materializing.add(op.sid);
 let team=loadTeam(p.team!.harnessDir),seat=team.seats[op.sid];
 if(seat){if(!matches(seat,op.input,op))throw new RuntimeError('seat_mismatch','место '+op.sid+' не совпадает с сохранённым назначением');if(op.files.seat){authority();ensureSeatFileLocked(lock,team.harnessDir,op.sid,op.files.seat.content,true)}}
 else {
  authority();const args:AddSeatArgs={role:op.input.role,kind:op.input.kind,label:op.input.label,vendor:op.input.vendor,model:op.input.model,mode:op.input.mode,...(op.input.specialization?{specialization:op.input.specialization}:{}),instructions:op.input.instructions.path};
  seat=addSeatLocked(lock,team.harnessDir,args,{}, {sid:op.sid,instructions:op.files.seat?.path??op.input.instructions.path,file:op.files.seat,acceptExisting:true});
  team=loadTeam(team.harnessDir);if(!matches(seat,op.input,op))throw new RuntimeError('seat_mismatch','место '+op.sid+' не совпадает с сохранённым назначением');
 }
 p.team=team;const pane=p.registry.add(seat);if(!op.stages.team)op=stage(p,op,'team');if(!op.stages.seatFile)op=stage(p,op,'seatFile');
 let c=p.state.chats.chats[op.operationId];
 if(!op.stages.chat){authority();const creating=!c;
  if(!c){
   const source=op.source.chat,old=p.state.activeChat(pane,false);
   if(old&&old.id!==op.operationId)closeChat(p,pane,'none');
   c=p.state.newChat(pane,op.source.carry,false,op.operationId);
   if(op.awaitFirstOpen)c.firstOpen={project:p.dir,pane:pane.id,chat:c.id,operationId:op.operationId,opened:false};
   if(source){const originalVendor=pane.vendor;pane.transcript=conversationHistory(source.transcript);pane.carry=op.source.carry;
    pane.sessionId=source.vendor===originalVendor&&source.cwd===pane.cwd?source.sessionId:null;pane.vendor=source.vendor as Vendor;pane.model=source.model||'';
    c.transcript=pane.transcript;c.carry=pane.carry;c.sessionId=pane.sessionId;c.vendor=pane.vendor;c.model=pane.model;
   }
  }else if(c.pane!==op.sid)invalid();
  // A persisted chat is the receipt for this step. Never overwrite its later model replies on replay.
  p.state.chats.active[pane.id]=c.id;pane.transcript=c.transcript;pane.transcriptSeq=c.transcriptSeq??0;pane.carry=c.carry;pane.sessionId=c.sessionId;pane.model=c.model||'';pane.vendor=c.vendor as Vendor;pane.seen={};
  const source=op.source.chat,room=source?.pane==='room'?p.registry.get('room'):null;
  if(room&&creating){p.state.newChat(room);room.revision++}
  p.state.savePanes(p.registry,p.journal);op=stage(p,op,'chat');
 }
 if(!c)c=p.state.chats.chats[op.operationId];if(!c)invalid();
 let status=currentStatus(p,op);
 if(!status){authority();const tail=op.source.chat?.pane==='room'?' разговору без роли':'';status=p.channel.postCore({to:['owner'],kind:'status',text:'Назначена роль «'+pane.label+'» ('+pane.id+', '+pane.model+', '+pane.mode+')'+tail+' — инициатор: '+op.by+'.',origin:'assign',thread:'assignment:'+op.operationId},{seat:'harness',trust:'harness'})}
 if(!op.stages.status)op=stage(p,op,'status');
 const existing=p.journal.read({limit:0}).find(r=>r.seq>status!.seq&&r.from==='harness'&&r.origin==='onboarding'&&r.to.includes(pane.id));
 if(!existing){authority();const roles=Object.fromEntries([...p.registry.panes].map(([id,x])=>[id,x.kind??'room'])),labels=Object.fromEntries([...p.registry.panes].map(([id,x])=>[id,x.label]));
  const text=onboarding(pane,op.how,{projectDir:p.dir,repoRoot:p.repoRoot,team:p.team,instructionText:op.files.seat?.content??op.input.instructions.content,policySummary:p.policy?.summaryFor(pane.kind??'room',roles,labels)??null,memoryText:memory(p),peers:[...p.registry.panes.values()],records:p.journal.read({limit:0}),now:new Date(parseInt(op.operationId.slice(1,-4),16)),modeLabels:Object.fromEntries(MODES.map(m=>[m.id,m.label]))});
  p.channel.postCore({to:[pane.id],kind:'note',text,origin:'onboarding'},{seat:'harness',trust:'harness'});
 }
 if(!op.stages.onboarding)op=stage(p,op,'onboarding');p.materializing.delete(op.sid);return {pane,chat:c};
}
function memory(p:ProjectState):string {try{return readFileSync(join(p.dir,'.harness','MEMORY.md'),'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return '';throw e}}
// The proposal layer owns confirmation and stable identities; this is the same durable materializer used for recovery.
export function assignProposed(runtime:Runtime,p:ProjectState,lock:PathLock,raw:Assignment,authority:()=>void){
 authority();const op=valid(raw),saved=operations(p).get(op.operationId);
 if(saved&&(saved.sid!==op.sid||JSON.stringify(saved.input)!==JSON.stringify(op.input)))throw new RuntimeError('proposal_invalid','назначение не совпадает с подтверждённым составом',409);
 if(!saved){put(p,op);p.materializing.add(op.sid)}
 return materialize(runtime,p,lock,saved??op,authority);
}
function pending(p:ProjectState,role:string){return [...operations(p).values()].find(op=>op.input.role===role&&!all(op))}
export async function createSeat(runtime:Runtime,_args:CreateSeatInput,initiator:Initiator):Promise<{ok:true;pane:ReturnType<Pane['settings']>;chat:ReturnType<typeof meta>}> {
 owner(runtime,initiator);throw new RuntimeError('proposal_required','участников создаёт оркестратор по подтверждённому предложению',409);
}
export async function assign(runtime:Runtime,p:ProjectState,args:CreateSeatInput,authority:Authority,source:Chat|null=null,existing?:Seat) {
 const role=String(args.role||''),frozen=input(runtime,p,args,existing);
 return withPathLock(p.dir,lock=>{authority.assert();same(runtime,p);
  const incomplete=pending(p,role);if(incomplete)return materialize(runtime,p,lock,incomplete,authority.assert);
  if(existing){const target=p.registry.get(existing.id);if(!target)throw new RuntimeError('pane_unknown','нет такого места');free(p,target,'«'+target.label+'» сейчас отвечает — назначьте после ответа')}
  const team=loadTeam(p.team!.harnessDir),raw=readManifest(team.harnessDir).get('seats') as Map<unknown,unknown>;
  const found=[...raw].filter(([,r])=>mapping(r)&&seatKind(r.get('kind'),r.get('role'))===frozen.kind),cat=ROLE_CATALOG.find(c=>c.role===role),n=found.length+1;
  if(!existing&&found.length&&!cat?.multi)throw new TeamError('role_taken','роль «'+cat!.label+'» в этой папке уже есть ('+pyString(pyDefault((found[0]![1] as Map<unknown,unknown>).get('label'),found[0]![0]))+')');
  const sid=existing?.id??role+(n===1?'':n);
  if(!existing&&raw.has(sid))throw new TeamError('seat_exists','место '+sid+' уже есть в team.yaml');
  const opid=p.state.newChatId(),spec=frozen.specialization,file=spec?{path:'roles/seats/'+sid+'.md',content:frozen.instructions.content+'\n\n'+spec.text}:null;
  if(file){try{lstatSync(join(team.harnessDir,file.path));throw new TeamError('seat_file_exists','файл места уже существует: '+file.path)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
  const label=existing?.label??(spec?.title||cat!.label)+(n===1?'':' '+n),target=existing?p.registry.get(existing.id):null;
  let carry=source?.carry??'';if(source&&target)carry=(closePreview(p,target)+'\n\n'+carry).trim();
  if(source&&(source.cwd!==(target?.cwd??p.dir)||source.vendor!==(target?.vendor??frozen.vendor))){const text=transcript(source);if(text&&!carry.endsWith(text))carry=(carry?carry+'\n\n':'')+text}
  const normalized={...frozen,label,...(authority.mandate?{mandate:authority.mandate}:{})};
  const op=valid({operationId:opid,sid,by:authority.by,how:authority.how,input:normalized,files:{seat:file},source:{chat:source,carry},stages:{team:false,seatFile:false,chat:false,status:false,onboarding:false}});
  put(p,op);p.materializing.add(sid);return materialize(runtime,p,lock,op,authority.assert);
 }).then(async result=>{if(!p.closed)await runtime.resumeQueue(result.pane.id,p);return result});
}
function closePreview(p:ProjectState,pane:Pane):string {const c=p.state.activeChat(pane,false);if(!c?.transcript.length)return '';return 'Контекст прежнего чата «'+pane.label+'»'+(c.title?' ('+c.title+')':'')+', для сведения:\n\n'+transcript(c)}
function transcript(c:Chat):string {return transcriptText(c.transcript)}
export async function assignConversation(runtime:Runtime,p:ProjectState,args:CreateSeatInput,source:Chat,how:string) {
 const role=String(args.role||''),cat=ROLE_CATALOG.find(c=>c.role===role);if(!cat)throw new TeamError('role_unknown','неизвестная роль '+role);
 if(!p.team)throw new RuntimeError('team_invalid','команда папки не читается: '+p.lineErrors.join('; '),400);
 if(role!=='orchestrator'&&!hasOrchestrator(p))throw new TeamError('role_unknown','сначала оркестратор — он разворачивает проект и вводит остальные роли');
 const sameSeat=Object.values(p.team.seats).find(s=>s.kind===seatKind(undefined,role)),existing=!cat!.multi?sameSeat:undefined;
 if(existing){free(p,p.registry.get(existing.id)!,'«'+existing.label+'» сейчас отвечает — назначьте после ответа');if(args.specialization!==undefined)throw new TeamError('role_taken','роль «'+cat!.label+'» в этой папке уже есть ('+existing.label+')')}
 const result=await assign(runtime,p,{...args,model:source.model,mode:args.mode??p.registry.get('room')?.mode}, {by:'владелец (интерфейс)',how,assert:()=>same(runtime,p)},source,existing);
 return {result,replaced:!!existing};
}
export async function ensureSeatMaterialized(runtime:Runtime,sid:string,initiator:Initiator,operationId?:string) {
 const p=owner(runtime,initiator);return withPathLock(p.dir,lock=>{same(runtime,p);
  if(Object.values(p.state.chats.chats).some(c=>object(c.promotion)&&c.promotion.sid===sid&&c.promotion.done===false))throw new RuntimeError('promotion_pending','Повышение сохранено; повторите «Назначить оркестратора».',409);
  let op=operationId?operations(p).get(operationId):[...operations(p).values()].find(x=>x.sid===sid&&!all(x));
  if(operationId&&(!op||op.sid!==sid))invalid();
  const seat=p.team?.seats[sid];if(!op&&!seat)throw new RuntimeError('pane_unknown','нет такого места или это разговор без роли',404);
  if(!op){const pane=p.registry.get(sid)!;free(p,pane);const source=chatSnapshot(p,pane),id=p.state.chats.active[sid]??p.state.newChatId(),i=input(runtime,p,{role:seat!.role},seat!);
   op=valid({operationId:id,sid,by:'владелец (интерфейс)',how:'при первом открытии чата роли',input:i,files:{seat:null},source:{chat:source,carry:source.carry},stages:{team:false,seatFile:false,chat:false,status:false,onboarding:false}});p.materializing.add(sid);put(p,op);
  }
  return materialize(runtime,p,lock,op,()=>same(runtime,p));
 }).then(async result=>{if(!p.closed)await runtime.resumeQueue(sid,p);return {ok:true as const,pane:result.pane.settings(),chat:meta(p,result.chat)}});
}
function firstOpening(p:ProjectState,pane:Pane):{chat:Chat;opened:boolean}|null {
 const op=[...operations(p).values()].find(op=>op.sid===pane.id&&op.awaitFirstOpen),active=p.state.chats.chats[p.state.chats.active[pane.id]??''];
 const c=op?p.state.chats.chats[op.operationId]:active,v=c?.firstOpen;
 if(v===undefined){if(op)throw new RuntimeError('chat_invalid','не сохранено ожидание первого открытия',409);return null}
 if(!op||!object(v)||v.project!==p.dir||v.pane!==pane.id||v.chat!==c!.id||v.operationId!==op.operationId||typeof v.opened!=='boolean')throw new RuntimeError('chat_invalid','ожидание первого открытия не соответствует разговору',409);
 return {chat:c!,opened:v.opened};
}
export function firstOpenPending(p:ProjectState,pane:Pane):boolean {
 const opening=firstOpening(p,pane);return opening!==null&&!opening.opened;
}
export async function onboard(runtime:Runtime,sid:string,initiator:Initiator,binding:{project?:unknown;chat?:unknown}={}) {
 const p=owner(runtime,initiator),pane=p.registry.get(sid);if(Object.values(p.state.chats.chats).some(c=>object(c.promotion)&&c.promotion.sid===sid&&c.promotion.done===false))throw new RuntimeError('promotion_pending','Повышение сохранено; повторите «Назначить оркестратора».',409);if(!pane||sid==='room')throw new RuntimeError('pane_unknown','нет такого места или это разговор без роли',404);
 if(firstOpenPending(p,pane)){
  await withPathLock(p.dir,()=>{same(runtime,p);const c=p.state.chats.chats[p.state.chats.active[sid]??''];if(binding.project!==p.dir||binding.chat!==c?.id)throw new RuntimeError('stale_chat','проект или разговор первого открытия изменился',409);
   const opening=firstOpening(p,pane);if(!opening||opening.opened)return;if(p.materializing.has(sid))throw new RuntimeError('recovering','создание роли ещё не завершено',409);
   const previous=opening.chat.firstOpen;opening.chat.firstOpen={...(previous as object),opened:true};try{p.state.saveChats(p.registry)}catch(e){opening.chat.firstOpen=previous;throw e}
  });if(!p.closed)void runtime.resumeQueue(sid,p);return {ok:true as const,sent:true as const};
 }
 if(p.journal.read({limit:0}).some(r=>r.from==='harness'&&r.origin==='onboarding'&&r.to.includes(sid))&&!p.materializing.has(sid))return {ok:true as const,already:true as const};
 if(!p.materializing.has(sid))free(p,pane,'место сейчас отвечает');else if(pane.busy||p.editing.has(sid))throw new RuntimeError('busy','место сейчас отвечает');await ensureSeatMaterialized(runtime,sid,initiator);return {ok:true as const,sent:true as const};
}
export async function restoreAssignments(runtime:Runtime,p:ProjectState):Promise<void> {
 const ops=operations(p);for(const original of ops.values())if(!all(original))try{await withPathLock(p.dir,lock=>materialize(runtime,p,lock,original,()=>same(runtime,p)))}catch(e){p.lineErrors.push('назначение '+original.sid+' не завершено: '+message(e));p.registry.get(original.sid)?.publish({type:'error',message:message(e),sessionId:null})}
}
export async function assignRoleAction(_args:AssignRoleArgs,ctx:ActionContext):Promise<AssignRoleResult> {
 ctx.assertActive();return {ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'};
}
