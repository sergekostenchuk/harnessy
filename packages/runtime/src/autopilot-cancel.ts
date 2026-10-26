import {withPathLock,loadTeam,unassignSeatLocked} from '@harnessy/team';
import type {Initiator,Record_} from '@harnessy/journal';
import {lstatSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {RuntimeError,object} from './errors.ts';
import {promotionIdentity} from './chats.ts';
import {promotionSeatFile} from './promotion.ts';
import type {AutopilotCancellation,AutopilotDecisionEntry} from './autopilot-decisions.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';

const CANCEL_OWNER:Initiator=Object.freeze({seat:'owner',trust:'owner',source:'autopilot-cancel'});
const HARNESS:Initiator&{trust:'harness'}=Object.freeze({seat:'harness',trust:'harness'});
type Outcome=Omit<AutopilotCancellation,'effectVersion'|'state'>&{state:'cancelled'|'partial'|'irreversible';code:string;reason:string;nextStep:string;result:Record<string,unknown>};
const outcome=(state:Outcome['state'],code:string,reason:string,nextStep:string,result:Record<string,unknown>={}):Outcome=>({state,code,reason,nextStep,result});
const irreversible=(reason:string,nextStep:string,code='cancel_irreversible')=>outcome('irreversible',code,reason,nextStep);
const validSeq=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
const field=(value:unknown):value is string=>typeof value==='string'&&value.length>0;

function promotionRecords(p:ProjectState,operationId:string,paneId:string,intro?:string,task?:string):Record_[]|null {
 if(!/^c[0-9a-f]+$/.test(operationId))return null;
 const specs=[{suffix:'intro',from:'harness',kind:'note',origin:'onboarding',text:intro},{suffix:'task',from:'owner',kind:'task',origin:'promotion',text:task}];
 const records:Record_[]=[];
 for(const spec of specs){const thread='promotion:'+operationId+':'+spec.suffix;
  const found=p.journal.read({limit:0,thread}).filter(r=>r.thread===thread&&r.from===spec.from&&r.kind===spec.kind&&r.origin===spec.origin&&r.to.length===1&&r.to[0]===paneId);
  if(found.length!==1||spec.text!==undefined&&found[0]!.text!==spec.text)return null;
  records.push(found[0]!);
 }
 return records;
}
function revokePromotionRecords(p:ProjectState,records:Record_[],paneId:string):boolean {
 for(const record of records)if(!p.journal.autopilotPromotionRevoked(record.seq)&&!p.journal.pendingFor(paneId).some(row=>row.record.seq===record.seq))return false;
 for(const record of records)if(!p.journal.autopilotPromotionRevoked(record.seq))p.channel.postCore({to:['owner'],kind:'rejected',reply_to:record.seq,thread:record.thread,origin:'autopilot-cancel',text:'Запись назначения #'+record.seq+' отозвана владельцем'},HARNESS);
 return true;
}

function answer(runtime:Runtime,p:ProjectState,entry:Extract<AutopilotDecisionEntry,{state:'applied'}>):Promise<Outcome>{
 return withPathLock(p.dir,()=>{
  runtime.assertOwner(CANCEL_OWNER);if(runtime.project!==p)throw new RuntimeError('project_changed','Проект решения изменился',409);
  const result=entry.receipt.result,parameters=entry.capability.parameters as Record<string,unknown>,seq=result.seq,pane=result.pane,replyTo=parameters.replyTo;
  if(!validSeq(seq)||!field(pane)||!validSeq(replyTo)||parameters.pane!==pane)return irreversible('Квитанция ответа не содержит подтверждённого адресата и номера записи','Откройте исходный вопрос и проверьте ответ вручную','cancel_unverifiable');
  const record=p.journal.get(seq),version=record?'journal:'+record.seq+':'+record.id:'';
  if(!record||version!==entry.receipt.effectVersion||record.from!=='owner'||record.kind!=='decision'||record.to.length!==1||record.to[0]!==pane||record.reply_to!==replyTo||record.text!==entry.proposal.answer)return irreversible('Ответ не совпал с сохранённым эффектом','Откройте журнал и уточните, какое решение было доставлено','effect_changed');
  if(p.journal.autopilotReplyRevoked(seq))return outcome('cancelled','cancelled','Ответ был отозван до доставки','Можно ответить на исходный вопрос заново',{seq,pane});
  if((p.journal.cursors[pane]??0)>=seq||p.active.get(pane)?.records.some(r=>r.seq===seq)||p.state.attempts[pane]?.recordSeqs.includes(seq)||!p.journal.pendingFor(pane).some(r=>r.record.seq===seq))return irreversible('Ответ уже был передан месту; отменить его исполнение нельзя','Откройте чат места и отправьте уточнение');
  p.channel.postCore({to:['owner'],kind:'rejected',reply_to:seq,thread:record.thread,origin:'autopilot-cancel',text:'Ответ Автопилота #'+seq+' отозван владельцем до доставки'},HARNESS);
  runtime.ownerAutopilotAction(p,CANCEL_OWNER);
  return outcome('cancelled','cancelled','Ответ отозван до начала исполнения','Можно ответить на исходный вопрос заново',{seq,pane});
 });
}

function assignment(runtime:Runtime,p:ProjectState,entry:Extract<AutopilotDecisionEntry,{state:'applied'}>):Promise<Outcome>{
 return withPathLock(p.dir,lock=>{
  runtime.assertOwner(CANCEL_OWNER);if(runtime.project!==p)throw new RuntimeError('project_changed','Проект решения изменился',409);
  const result=entry.receipt.result,paneId=result.pane,chatId=result.chat,operationId=result.operationId;
  if(!field(paneId)||!field(chatId)||!field(operationId)||entry.receipt.effectVersion!=='promotion:'+operationId)return irreversible('Квитанция назначения не содержит проверенную версию','Откройте карточку роли и проверьте назначение вручную','cancel_unverifiable');
  const pane=p.registry.get(paneId),chat=p.state.chats.chats[chatId],promotion=chat&&promotionIdentity(chat),op=chat&&object(chat.promotion)?chat.promotion:null,input=op&&object(op.input)?op.input:null;
  const team=loadTeam(join(p.dir,'.harness')),seat=team.seats[paneId],instructions='roles/seats/'+operationId+'.md';
  let roleFileMatches=false;try{const path=join(team.harnessDir,instructions),info=lstatSync(path);roleFileMatches=info.isFile()&&!info.isSymbolicLink()&&readFileSync(path,'utf8')===promotionSeatFile(operationId)}catch{}
  if(!chat||!promotion||promotion.operationId!==operationId||promotion.pane!==paneId||promotion.target!==p.dir||promotion.completed!==4||chat.pane!==paneId||!op||!input||!field(op.model)||!field(op.vendor)||!field(op.mode)||!field(op.intro)||!field(input.task)||!seat||seat.id!==paneId||seat.role!=='orchestrator'||seat.kind!=='orchestrator'||seat.label!=='Оркестратор'||seat.vendor!==op.vendor||seat.model!==op.model||seat.mode!==op.mode||seat.instructions!==instructions||seat.digest||seat.writePaths.length!==0||seat.worktree!==null||!roleFileMatches)return irreversible('Назначение изменилось после применения: модель, права, инструкция или вводная не совпали','Откройте команду и проверьте роль','effect_changed');
  if(!pane||pane.vendor!==op.vendor||pane.model!==op.model||pane.mode!==op.mode||pane.role!=='orchestrator'||pane.kind!=='orchestrator'||pane.label!==seat.label||pane.digest||pane.writePaths.length!==0||p.state.chats.active[paneId]!==chatId)return irreversible('Текущая роль уже отличается от сохранённого назначения','Откройте команду и проверьте роль','effect_changed');
  const records=promotionRecords(p,operationId,paneId,op.intro as string,input.task as string);
  if(!records)return irreversible('Вводная или первое поручение назначения изменились','Откройте журнал повышения роли','effect_changed');
  const room=p.registry.get('room'),roomChat=p.state.chats.chats[p.state.chats.active.room??''];
  if(pane.busy||p.active.has(paneId)||(p.journal.cursors[paneId]??0)>0||p.state.attempts[paneId]||!room||room.busy||p.active.has('room')||roomChat?.transcript.length)return outcome('partial','cancel_partial','Роль или исходный разговор уже продолжили работу; автоматическое снятие могло бы скрыть новые результаты','Остановите ходы и снимите роль вручную',{pane:paneId,operationId});
  if(!revokePromotionRecords(p,records,paneId))return irreversible('Вводная или поручение уже доставлены; безопасно снять роль нельзя','Проверьте историю места и снимите роль вручную');
  if(!unassignSeatLocked(lock,team.harnessDir,paneId,seat))return outcome('partial','cancel_partial','Записи назначения отозваны, но сама роль успела измениться','Проверьте команду и снимите роль вручную',{pane:paneId,operationId});
  p.registry.panes.delete(paneId);delete p.state.chats.active[paneId];p.team=loadTeam(team.harnessDir);
  if(roomChat&&roomChat.id!==chat.id)roomChat.closed=Math.floor(p.now()/1000);
  chat.pane='room';delete chat.promotion;p.state.chats.active.room=chat.id;
  room.transcript=chat.transcript;room.transcriptSeq=chat.transcriptSeq??0;room.sessionId=chat.sessionId;room.carry=chat.carry;room.model=chat.model??room.model;room.vendor=chat.vendor as typeof room.vendor;room.revision++;
  p.state.savePanes(p.registry,p.journal);
  runtime.ownerAutopilotAction(p,CANCEL_OWNER);
  p.owner.publish({type:'state',project:p.dir});
  return outcome('cancelled','cancelled','Назначение снято; разговор возвращён в «Комнату», файлы роли сохранены','При необходимости назначьте роль снова',{pane:paneId,operationId});
 });
}

function turn(runtime:Runtime,p:ProjectState,entry:Extract<AutopilotDecisionEntry,{state:'applied'}>):Outcome{
 runtime.assertOwner(CANCEL_OWNER);if(runtime.project!==p)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409);
 const result=entry.receipt.result,paneId=result.pane,seq=result.seq;
 if(!field(paneId)||!validSeq(seq)||entry.receipt.effectVersion!=='attempt:'+seq)return irreversible('Квитанция решения хода не подтверждена','Откройте ход и проверьте его состояние','cancel_unverifiable');
 const record=p.journal.get(seq),attempt=record?.attempt;
 if(!record||record.from!=='harness'||record.origin!=='attempt'||attempt?.pane!==paneId||attempt.turnInstanceId!==result.turnInstanceId||attempt.action!==result.action)return irreversible('Решение хода уже изменилось','Откройте ход и проверьте его состояние','effect_changed');
 const started=result.startedTurnInstanceId,active=p.active.get(paneId);
 if(!field(started)||!active||active.scope.turnInstanceId!==started)return irreversible('Ход уже завершён или его текущий экземпляр не подтверждён','Откройте чат и проверьте сделанные изменения');
 const stopped=runtime.interrupt(paneId,CANCEL_OWNER);
 if(!stopped.ok)return irreversible('Ход успел завершиться до остановки','Откройте чат и проверьте сделанные изменения');
 return outcome('partial','cancel_partial','Ход остановлен; сделанные им изменения не откатываются','Проверьте изменения проекта перед продолжением',{pane:paneId,turnInstanceId:started});
}

function effect(runtime:Runtime,p:ProjectState,entry:Extract<AutopilotDecisionEntry,{state:'applied'}>):Promise<Outcome>|Outcome{
 if(entry.operation==='answer_question'||entry.operation==='answer_blocker'||entry.operation==='answer_escalation')return answer(runtime,p,entry);
 if(entry.operation==='assign_role')return assignment(runtime,p,entry);
 if(entry.operation==='continue_pane'||entry.operation==='stop_pane')return turn(runtime,p,entry);
 if(entry.operation==='approve'||entry.operation==='deny')return irreversible('Разрешение уже применено и не имеет обратного действия','Проверьте ход, которому было дано разрешение');
 return irreversible('Для этого решения обратное действие неизвестно','Откройте исходный вопрос','cancel_unverifiable');
}

export async function cancelAutopilotDecision(runtime:Runtime,project:string,id:string,effectVersion:string,initiator:Initiator){
 runtime.assertOwner(initiator);const p=runtime.project;
 if(project!==p.dir)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409);
 if(!/^[0-9a-f]{64}$/.test(id))throw new RuntimeError('decision_unknown','Решение Автопилота не найдено',404);
 const ledger=runtime.autopilotDecisionLedger(p);
 return withPathLock(ledger.path+'.cancel.'+id,async()=>{
 if(runtime.project!==p)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409);
 const entry=ledger.get(id);
 if(!entry)throw new RuntimeError('decision_unknown','Решение Автопилота не найдено',404);
 if(entry.state!=='applied')throw new RuntimeError('cancel_unavailable','Решение ещё не применено',409);
 if(effectVersion!==entry.receipt.effectVersion)throw new RuntimeError('effect_changed','Квитанция эффекта изменилась — обновите карточку',409);
 const existing=ledger.cancellation(id);
 if(existing&&existing.state!=='intent')return cancellationResult(existing);
 const started=await ledger.beginCancellation(id,effectVersion);
 if(existing?.state==='intent'&&entry.operation==='assign_role'){
  const pane=entry.receipt.result.pane,chatId=entry.receipt.result.chat,operationId=entry.receipt.result.operationId;
  if(field(pane)&&field(operationId)){
   const recovered=await withPathLock(p.dir,()=>{
    runtime.assertOwner(CANCEL_OWNER);if(runtime.project!==p)throw new RuntimeError('project_changed','Проект решения изменился',409);
    if(loadTeam(join(p.dir,'.harness')).seats[pane])return null;
    const records=promotionRecords(p,operationId,pane),revoked=!!records&&revokePromotionRecords(p,records,pane);
    return {restored:field(chatId)&&p.state.chats.active.room===chatId,revoked};
   });
   if(recovered){
    const complete=recovered.restored&&recovered.revoked,finished=await ledger.finishCancellation(id,{state:complete?'cancelled':'partial',effectVersion,code:complete?'cancelled':'cancel_partial',reason:complete?'Назначение снято и записи отозваны':'Роль снята, но восстановление разговора или отзыв записей требует проверки',nextStep:complete?'При необходимости назначьте роль снова':'Откройте историю разговора и журнал назначения',result:{pane}});return cancellationResult(finished)
   }
  }
 }
 if(existing?.state==='intent'&&['continue_pane','stop_pane'].includes(entry.operation)){
  const paneId=entry.receipt.result.pane,startedTurn=entry.receipt.result.startedTurnInstanceId;
  if(field(paneId)&&field(startedTurn)){
   const pane=p.registry.get(paneId),active=p.active.get(paneId),saved=pane&&p.state.results(pane).find(row=>row.runtime?.turnInstanceId===startedTurn);
   if(!active||active.scope.turnInstanceId!==startedTurn){
    const confirmed=saved?.outcome==='interrupted',finished=await ledger.finishCancellation(id,{state:'partial',effectVersion,code:confirmed?'cancel_partial':'cancel_uncertain',reason:confirmed?'Ход остановлен; сделанные изменения не откатываются':'После прежней попытки ход завершился; исход остановки не подтверждён',nextStep:'Проверьте изменения и итог этого хода',result:{pane:paneId,turnInstanceId:startedTurn}});return cancellationResult(finished)
   }
  }
 }
 // An interrupted previous attempt is retried only through checks of the exact effect version.
 if(started.state!=='intent')return cancellationResult(started);
 let result:Outcome;
 try{result=await effect(runtime,p,entry)}catch(error){
  if(error instanceof RuntimeError&&['autopilot_busy','project_changed'].includes(error.code))throw error;
  const reason=error instanceof Error?error.message:'Исход отмены не подтверждён';result=outcome('partial','cancel_uncertain','Отмена могла быть выполнена частично: '+reason,'Проверьте состояние эффекта и историю проекта');
 }
 const finished=await ledger.finishCancellation(id,{...result,effectVersion});return cancellationResult(finished);
 });
}

function cancellationResult(value:AutopilotCancellation){
 if(value.state==='intent')throw new RuntimeError('cancel_uncertain','Исход отмены не подтверждён',409);
 if(value.state==='irreversible')throw new RuntimeError(value.code??'cancel_irreversible',value.reason??'Решение необратимо',409,{fields:{nextStep:value.nextStep}});
 return {ok:true as const,state:value.state,reason:value.reason,nextStep:value.nextStep,result:value.result??{}};
}
