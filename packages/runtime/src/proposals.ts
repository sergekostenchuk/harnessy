import {randomBytes,createHash} from 'node:crypto';
import {withPathLock,SEAT_KINDS,MODE_IDS,loadTeam,readManifest,type PathLock,type SeatKind,type Vendor,type Mode} from '@harnessy/team';
import type {Initiator} from '@harnessy/journal';
import {RuntimeError,object,deepFreeze} from './errors.ts';
import {jsonClone} from './state.ts';
import {owner,same} from './operations.ts';
import {assignProposed,materializationProgress,type Assignment} from './roles.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState,ActionContext} from './types.ts';

export interface ProposalSeat {kind:SeatKind;label:string;vendor:Vendor;model:string;mode:Mode;intro:string;sid:string;operationId:string}
export interface TeamProposal {turnInstanceId?:string;requestKey?:string;proposalId:string;version:number;from:string;thread:string;questionSeq:number|null;confirmed:boolean;seats:ProposalSeat[];ownerSeats?:Record<string,{kind:SeatKind;created:boolean}>}
interface Store {project:string;proposals:TeamProposal[]}
export interface ProposalInput {proposalId?:unknown;version?:unknown;seats?:unknown}
export interface ProposalRef {proposalId?:unknown;version?:unknown;project?:unknown}
export interface OwnerSeatInput extends ProposalRef {seatIndex?:unknown;kind?:unknown}
const HARNESS={seat:'harness',trust:'harness'} as const;
function fail(code:string,text:string,status=409):never {throw new RuntimeError(code,text,status)}
function invalid(text='предложение команды не читается'):never {return fail('proposal_invalid',text)}
const token=(value:unknown,prefix:string)=>typeof value==='string'&&new RegExp('^'+prefix+'[0-9a-f]{24}$').test(value);
function seatInput(raw:unknown):Omit<ProposalSeat,'sid'|'operationId'> {
 if(!object(raw)||Object.keys(raw).some(k=>!['kind','label','vendor','model','mode','intro'].includes(k))||!SEAT_KINDS.includes(raw.kind as SeatKind)||raw.kind==='orchestrator'||typeof raw.label!=='string'||!raw.label.trim()||[...raw.label].length>60||!['claude','codex'].includes(String(raw.vendor))||typeof raw.model!=='string'||!raw.model.trim()||!MODE_IDS.includes(raw.mode as Mode)||typeof raw.intro!=='string'||!raw.intro.trim()||Buffer.byteLength(raw.intro,'utf8')>8192)invalid('место: kind участника, label до 60 знаков, vendor, model, mode и intro до 8 КиБ обязательны');
 return {kind:raw.kind as SeatKind,label:raw.label,vendor:raw.vendor as Vendor,model:raw.model,mode:raw.mode as Mode,intro:raw.intro};
}
function read(p:ProjectState):Store {
 const raw=p.state.readProposals();if(!object(raw)||raw.project!==p.dir||!Array.isArray(raw.proposals))invalid();const ids=new Set<string>(),places=new Set<string>(),ops=new Set<string>();
 for(const value of raw.proposals){if(!object(value)||value.turnInstanceId!==undefined&&(typeof value.turnInstanceId!=='string'||!value.turnInstanceId||value.turnInstanceId.length>128)||value.requestKey!==undefined&&(typeof value.requestKey!=='string'||!/^sha256:[0-9a-f]{64}$/.test(value.requestKey))||!token(value.proposalId,'p')||ids.has(String(value.proposalId))||!Number.isSafeInteger(value.version)||Number(value.version)<1||typeof value.from!=='string'||!/^[a-z][a-z0-9_-]{0,30}$/.test(value.from)||typeof value.confirmed!=='boolean'||value.thread!=='team:'+value.proposalId+':'+value.version||!(value.questionSeq===null||Number.isSafeInteger(value.questionSeq)&&Number(value.questionSeq)>0)||!Array.isArray(value.seats)||!value.seats.length||value.seats.length>12)invalid();ids.add(String(value.proposalId));
  for(const rawSeat of value.seats){if(!object(rawSeat))invalid();const {sid,operationId,...input}=rawSeat;seatInput(input);if(typeof sid!=='string'||sid!==input.kind+'-'+String(operationId).slice(1)||typeof operationId!=='string'||!/^c[0-9a-f]{5,20}$/.test(operationId)||places.has(sid)||ops.has(String(operationId)))invalid();places.add(sid);ops.add(String(operationId))}
  if(value.ownerSeats!==undefined){if(!object(value.ownerSeats))invalid();for(const [index,selection] of Object.entries(value.ownerSeats)){if(!/^(0|[1-9][0-9]*)$/.test(index)||Number(index)>=value.seats.length||!object(selection)||Object.keys(selection).some(k=>!['kind','created'].includes(k))||!SEAT_KINDS.includes(selection.kind as SeatKind)||typeof selection.created!=='boolean')invalid('выбор владельца не читается')}}
  if(value.requestKey!==undefined&&value.requestKey!==savedRequestKey(value as unknown as TeamProposal))invalid('ключ повтора не соответствует составу');
 }
 return raw as unknown as Store;
}
function ref(input:ProposalRef){if(!token(input.proposalId,'p')||!Number.isSafeInteger(input.version)||Number(input.version)<1)invalid('нужны proposalId и положительная целая version');return {proposalId:input.proposalId as string,version:input.version as number}}
function find(store:Store,input:ProposalRef){const wanted=ref(input),q=store.proposals.find(q=>q.proposalId===wanted.proposalId);if(!q)fail('proposal_not_found','предложение не найдено',404);if(q.version!==wanted.version)fail('proposal_stale','версия предложения изменилась');return q}
function authority(ctx:ActionContext,p:ProjectState){ctx.assertActive();if(ctx.scope.projectDir!==p.dir)fail('proposal_project_changed','проект предложения сменился');if(p.registry.get(ctx.scope.seatId)?.kind!=='orchestrator')fail('policy_denied','состав команды предлагает и создаёт только оркестратор',403)}
function proposalKey(from:string,seats:ReturnType<typeof seatInput>[],update:ReturnType<typeof ref>|null,turnInstanceId?:string){return 'sha256:'+createHash('sha256').update(JSON.stringify({from,update,seats,...(turnInstanceId?{turnInstanceId}:{})})).digest('hex')}
function savedRequestKey(q:TeamProposal){return proposalKey(q.from,q.seats.map(({sid,operationId,...input})=>seatInput(input)),q.version===1?null:{proposalId:q.proposalId,version:q.version-1},q.turnInstanceId)}
function receipt(p:ProjectState,q:TeamProposal){return {ok:true as const,project:p.dir,proposal:jsonClone(q),proposalId:q.proposalId,version:q.version}}
function summary(q:TeamProposal){return 'Оркестратор '+q.from+' предлагает состав команды, версия '+q.version+'.\n\n'+q.seats.map((s,i)=>(i+1)+'. '+s.label+' · '+s.kind+' · '+s.vendor+'/'+s.model+' · '+s.mode+'\nВводная: '+s.intro.slice(0,240)+(s.intro.length>240?'…':'')).join('\n\n')+'\n\nПодтвердите именно эту версию кнопкой в окне. Ответ «да» в чате не подтверждает состав.'}
function question(p:ProjectState,q:TeamProposal){
 const records=p.journal.read({limit:0,thread:q.thread}),text=summary(q),saved=records.find(r=>r.from==='harness'&&r.kind==='question'&&r.origin==='team-proposal'&&r.to.length===1&&r.to[0]==='owner');
 if(saved&&saved.text!==text||q.questionSeq!==null&&saved?.seq!==q.questionSeq)invalid('вопрос о составе не совпадает с сохранённым предложением');
 q.questionSeq=(saved??p.channel.postCore({to:['owner'],kind:'question',text,thread:q.thread,origin:'team-proposal'},HARNESS)).seq;
}
function confirmedNote(p:ProjectState,q:TeamProposal){
 const text='Владелец подтвердил состав команды '+q.proposalId+', версия '+q.version+'. Создай участников инструментом create_seats с proposalId="'+q.proposalId+'", version='+q.version+'.';
 const saved=p.journal.read({limit:0,thread:q.thread}).find(r=>r.from==='harness'&&r.origin==='team-proposal-confirm'&&r.kind==='note'&&r.to.length===1&&r.to[0]===q.from);
 if(saved&&saved.text!==text)invalid('подтверждение состава не совпадает');
 if(!saved)p.channel.postCore({to:[q.from],kind:'note',text,thread:q.thread,reply_to:q.questionSeq,origin:'team-proposal-confirm'},HARNESS);
}
function publish(p:ProjectState){if(!p.closed)p.owner.publish({type:'teamProposals',project:p.dir})}
export async function propose(runtime:Runtime,ctx:ActionContext,input:ProposalInput){
 const p=runtime.project;authority(ctx,p);if(!Array.isArray(input.seats)||input.seats.length<1||input.seats.length>12)invalid('состав должен содержать от 1 до 12 мест');
 const seats=deepFreeze(input.seats.map(seatInput)),update=input.proposalId!==undefined||input.version!==undefined?ref(input):null;
 for(const s of seats)if(!p.registry.providers.has(s.vendor)||!p.registry.models[s.vendor]?.some(m=>m.id===s.model))invalid('модель не из каталога указанного провайдера');
 return withPathLock(p.dir,()=>{authority(ctx,p);same(runtime,p);const store=read(p),key=proposalKey(ctx.scope.seatId,seats,update,ctx.scope.turnInstanceId),retry=store.proposals.find(q=>!q.confirmed&&q.turnInstanceId===ctx.scope.turnInstanceId&&q.from===ctx.scope.seatId&&(q.requestKey??savedRequestKey(q))===key);
  // Only this turn's unconfirmed intent can be retried. A confirmed composition or a new turn is a new proposal.
  if(retry){question(p,retry);p.state.saveProposals(store);publish(p);return receipt(p,retry)}
  const old=update?find(store,update):null;
  if(old?.confirmed||old?.ownerSeats&&Object.keys(old.ownerSeats).length)fail('proposal_stale','подтверждённый состав заморожен; создайте новое предложение');if(old&&old.from!==ctx.scope.seatId)fail('policy_denied','предложение принадлежит другому оркестратору',403);
  const proposalId=old?.proposalId??'p'+randomBytes(12).toString('hex'),version=(old?.version??0)+1;
  const manifest=readManifest(p.team!.harnessDir).get('seats') as Map<string,unknown>,assignments=p.state.readMaterializations();if(!Array.isArray(assignments))invalid('сохранённые назначения не читаются');
  const allocated=new Set<string>(assignments.map(op=>object(op)?String(op.operationId):''));const q:TeamProposal={turnInstanceId:ctx.scope.turnInstanceId,requestKey:key,proposalId,version,from:ctx.scope.seatId,thread:'team:'+proposalId+':'+version,questionSeq:null,confirmed:false,seats:seats.map(s=>{let operationId='';for(let n=0;n<100;n++){const id='c'+Math.floor(p.now()).toString(16)+randomBytes(2).toString('hex');if(!store.proposals.some(x=>x.seats.some(s=>s.operationId===id))&&!p.state.chats.chats[id]&&!allocated.has(id)&&!manifest.has(s.kind+'-'+id.slice(1))&&!p.registry.get(s.kind+'-'+id.slice(1))){operationId=id;allocated.add(id);break}}if(!operationId)invalid('не удалось выделить идентификатор места');return {...s,sid:s.kind+'-'+operationId.slice(1),operationId}})};
  store.proposals=store.proposals.filter(x=>x!==old);store.proposals.push(q);p.state.saveProposals(store);question(p,q);p.state.saveProposals(store);publish(p);return receipt(p,q);
 });
}
export async function proposals(runtime:Runtime,initiator:Initiator){const p=owner(runtime,initiator);return withPathLock(p.dir,()=>{same(runtime,p);const store=read(p);for(const q of store.proposals){question(p,q);if(q.confirmed)confirmedNote(p,q)}if(store.proposals.length)p.state.saveProposals(store);return {ok:true as const,project:store.project,proposals:jsonClone(store.proposals).map(q=>({...q,materializations:q.seats.map(s=>materializationProgress(p,s.operationId,s.sid))}))}})}
export async function confirm(runtime:Runtime,input:ProposalRef,initiator:Initiator){
 const p=owner(runtime,initiator),wanted=ref(input),project=input.project;if(project!==p.dir)fail('proposal_project_changed','проект подтверждения не совпадает');
 return withPathLock(p.dir,()=>{same(runtime,p);if(runtime.project.dir!==project)fail('proposal_project_changed','проект подтверждения сменился');const store=read(p),q=find(store,wanted),already=q.confirmed;
  question(p,q);q.confirmed=true;p.state.saveProposals(store);confirmedNote(p,q);publish(p);return {ok:true as const,project:p.dir,proposalId:q.proposalId,version:q.version,already};
 });
}
export async function create(runtime:Runtime,ctx:ActionContext,input:ProposalRef){
 const p=runtime.project;authority(ctx,p);const wanted=ref(input);
 const result=await withPathLock(p.dir,lock=>{authority(ctx,p);same(runtime,p);const q=find(read(p),wanted);if(!q.confirmed)fail('proposal_unconfirmed','владелец ещё не подтвердил эту версию');if(q.from!==ctx.scope.seatId)fail('policy_denied','предложение принадлежит другому оркестратору',403);
  p.team=loadTeam(p.team!.harnessDir);const seats=q.seats.map((_s,i)=>materializeSeat(runtime,p,lock,q,i,()=>authority(ctx,p)));publish(p);return {ok:true as const,project:p.dir,proposalId:q.proposalId,version:q.version,seats};
 });
 for(const seat of result.seats){ctx.assertActive();void runtime.resumeQueue(seat.pane,p)}return result;
}
function materializeSeat(runtime:Runtime,p:ProjectState,lock:PathLock,q:TeamProposal,index:number,assert:()=>void){
 const s=q.seats[index]!,selection=q.ownerSeats?.[index],kind=selection?.kind??s.kind,file={path:'roles/seats/'+s.sid+'.md',content:s.intro};
 const op:Assignment={operationId:s.operationId,sid:s.sid,by:selection?'владелец (интерфейс)':'оркестратор '+q.from+' по подтверждению владельца',how:'по подтверждённому составу '+q.proposalId+' версии '+q.version,input:{specialization:{title:s.label,text:s.intro},role:kind,kind,label:s.label,vendor:s.vendor,model:s.model,mode:s.mode,instructions:{path:file.path,content:file.content},writePaths:[],worktree:null},files:{seat:file},source:{chat:null,carry:''},stages:{team:false,seatFile:false,chat:false,status:false,onboarding:false}};
 const out=assignProposed(runtime,p,lock,op,assert);return {pane:out.pane.id,chat:out.chat.id,label:s.label};
}
export async function createOwnerSeat(runtime:Runtime,input:OwnerSeatInput,initiator:Initiator){
 const p=owner(runtime,initiator),wanted=ref(input),project=input.project,index=input.seatIndex,kind=input.kind;
 if(project!==p.dir)fail('proposal_project_changed','проект создания не совпадает');
 if(!Number.isSafeInteger(index)||Number(index)<0||kind!==undefined&&!SEAT_KINDS.includes(kind as SeatKind))invalid('нужны индекс строки и класс прав из семи');
 const result=await withPathLock(p.dir,lock=>{same(runtime,p);const store=read(p),q=find(store,wanted),s=q.seats[Number(index)];if(!s)invalid('нет такой строки предложения');
  const selection=q.ownerSeats?.[Number(index)],chosen=(kind as SeatKind|undefined)??selection?.kind??s.kind,ops=p.state.readMaterializations();if(!Array.isArray(ops))invalid();
  const saved=ops.find(o=>object(o)&&o.operationId===s.operationId);
  if(selection&&selection.kind!==chosen||object(saved)&&object(saved.input)&&saved.input.kind!==chosen)fail('proposal_seat_locked','создание уже начато с другим классом прав');
  p.team=loadTeam(p.team!.harnessDir);if(chosen==='orchestrator'&&Object.values(p.team.seats).some(x=>x.kind==='orchestrator'&&x.id!==s.sid))fail('role_taken','в проекте уже есть оркестратор');
  question(p,q);q.ownerSeats??={};q.ownerSeats[Number(index)]??={kind:chosen,created:false};p.state.saveProposals(store);
  const seat=materializeSeat(runtime,p,lock,q,Number(index),()=>same(runtime,p));q.ownerSeats[Number(index)]!.created=true;p.state.saveProposals(store);publish(p);
  return {ok:true as const,project:p.dir,proposalId:q.proposalId,version:q.version,seatIndex:index,...seat,already:!!saved};
 });
 if(!p.closed)void runtime.resumeQueue(result.pane,p);return result;
}
export async function restoreProposals(runtime:Runtime,p:ProjectState){try{await withPathLock(p.dir,lock=>{same(runtime,p);const store=read(p);for(const q of store.proposals){question(p,q);if(q.confirmed)confirmedNote(p,q);for(const [index,selection] of Object.entries(q.ownerSeats??{}))if(!selection.created){materializeSeat(runtime,p,lock,q,Number(index),()=>same(runtime,p));selection.created=true}}if(store.proposals.length)p.state.saveProposals(store)})}catch(e){p.lineErrors.push('предложения команды: '+(e as Error).message)}}
