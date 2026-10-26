import type {Initiator,Record_} from '@harnessy/journal';
import {RuntimeError,object} from './errors.ts';
import {promotionIdentity} from './chats.ts';
import {AUTOPILOT_OWNER,type Runtime} from './runtime.ts';
import type {ProjectState,Waiting} from './types.ts';
import {
 AUTOPILOT_COUNCIL_OPERATIONS,
 AUTOPILOT_COUNCIL_STOP_CODES,
 AutopilotCouncil,
 autopilotHash,
 type AutopilotAgentPort,
 type AutopilotAgentRequest,
 type AutopilotBudgetPort,
 type AutopilotCapability,
 type AutopilotCouncilClock,
 type AutopilotCouncilOutcome,
 type AutopilotDecisionEntry,
 type AutopilotDecisionStore,
 type AutopilotEffectPort,
 type AutopilotEffectReceipt,
 type AutopilotGenerationPort,
 type AutopilotIssue,
 type AutopilotSafetyPort,
 type BoundCapability,
 type CouncilProposal
} from './autopilot-council.ts';

const sourceEqual=(left:AutopilotIssue['source'],right:AutopilotIssue['source'])=>left.id===right.id&&left.kind===right.kind&&left.text===right.text;
const sameProject=(runtime:Runtime,project:ProjectState)=>{if(project.closed||runtime.project!==project)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409)};
export async function runAutopilotOwnerEffect<T>(apply:(initiator:Initiator)=>T|Promise<T>):Promise<T>{return apply(AUTOPILOT_OWNER)}

export const autopilotJournalSource=(record:Pick<Record_,'seq'|'id'|'kind'|'text'>)=>Object.freeze({id:'journal:'+record.seq+':'+record.id,kind:record.kind,text:record.text});
export const autopilotApprovalSource=(pane:string,approval:Readonly<{id:string;title:string;detail:string}>)=>Object.freeze({id:'approval:'+autopilotHash({pane,id:approval.id,title:approval.title,detail:approval.detail}),kind:'approval',text:approval.title+'\n'+approval.detail});
export const autopilotWaitingSource=(pane:string,waiting:Pick<Waiting,'status'|'turnInstanceId'|'actions'|'failure'>)=>Object.freeze({id:'waiting:'+pane+':'+waiting.turnInstanceId,kind:'waiting',text:JSON.stringify({status:waiting.status,actions:[...waiting.actions],failure:waiting.failure?{code:waiting.failure.code,reason:waiting.failure.reason}:null})});
export const autopilotAssignmentSource=(parameters:Readonly<Record<string,unknown>>)=>Object.freeze({id:'assignment:'+autopilotHash(parameters),kind:'assign_role',text:JSON.stringify(parameters)});


function parameters(capability:BoundCapability,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{const value=capability.parameters,keys=Object.keys(value);if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))throw new RuntimeError('capability_invalid','Параметры операции Автопилота не входят в закрытый список',409);return value as Record<string,unknown>}
function answerKind(operation:BoundCapability['operation']){return operation.slice('answer_'.length)}
function effectReceipt(result:Record<string,unknown>,effectVersion:string):AutopilotEffectReceipt{return Object.freeze({result:Object.freeze(structuredClone(result)),effectVersion})}

export class RuntimeAutopilotEffects implements AutopilotEffectPort {
 private readonly runtime:Runtime;private readonly project:ProjectState;
 constructor(runtime:Runtime,project:ProjectState=runtime.project){this.runtime=runtime;this.project=project}
 private current(){sameProject(this.runtime,this.project);return this.project}
 private journalRecord(input:{issue:Pick<AutopilotIssue,'project'|'source'>;capability:BoundCapability}){
  const value=parameters(input.capability,['pane','replyTo']);if(typeof value.pane!=='string'||!Number.isSafeInteger(value.replyTo)||Number(value.replyTo)<1)throw new RuntimeError('capability_invalid','Для ответа нужны pane и replyTo',409);
  const record=this.current().journal.get(Number(value.replyTo)),kind=answerKind(input.capability.operation);
  if(!record||record.kind!==kind||record.from!==value.pane||!record.to.includes('owner')||!sourceEqual(input.issue.source,autopilotJournalSource(record)))throw new RuntimeError('source_changed','Исходный вопрос Автопилота изменился',409);
  return {pane:value.pane,record};
 }
 private approval(input:{issue:AutopilotIssue;capability:BoundCapability}){
  const value=parameters(input.capability,['pane','approvalId']);if(typeof value.pane!=='string'||typeof value.approvalId!=='string'||!value.approvalId)throw new RuntimeError('capability_invalid','Для разрешения нужны pane и approvalId',409);
  const pane=this.current().registry.get(value.pane),approval=pane?.approvals.get(value.approvalId);if(!pane||!approval||!sourceEqual(input.issue.source,autopilotApprovalSource(value.pane,approval)))throw new RuntimeError('source_changed','Запрос разрешения Автопилота изменился',409);
  return {pane:value.pane,approvalId:value.approvalId};
 }
 private waiting(input:{issue:AutopilotIssue;capability:BoundCapability}){
  const value=parameters(input.capability,['pane','turnInstanceId','action']);if(typeof value.pane!=='string'||typeof value.turnInstanceId!=='string'||!value.turnInstanceId||typeof value.action!=='string')throw new RuntimeError('capability_invalid','Для решения хода нужны pane, turnInstanceId и action',409);
  const allowed=input.capability.operation==='continue_pane'?['retry','finish']:['skip','finish'];if(!allowed.includes(value.action))throw new RuntimeError('capability_invalid','Действие хода не входит в закрытый список',409);
  const current=this.runtime.waiting(value.pane);if(!current||current.turnInstanceId!==value.turnInstanceId||!current.actions.includes(value.action as never)||!sourceEqual(input.issue.source,autopilotWaitingSource(value.pane,current)))throw new RuntimeError('source_changed','Ожидание места изменилось',409);
  return {pane:value.pane,turnInstanceId:value.turnInstanceId,action:value.action as 'retry'|'skip'|'finish'};
 }
 private assignment(input:{issue:AutopilotIssue;capability:BoundCapability}){
  const value=parameters(input.capability,['role','chat','project','revision','documents'],['task','createProject']);
  if(value.role!=='orchestrator'||typeof value.chat!=='string'||!value.chat||value.project!==this.current().dir||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.documents)||value.createProject===true||value.createProject!==undefined&&value.createProject!==false||value.task!==undefined&&typeof value.task!=='string'||!sourceEqual(input.issue.source,autopilotAssignmentSource(value)))throw new RuntimeError('capability_invalid','Назначение роли не связано с текущим разговором проекта',409);
  const chat=this.project.state.chats.chats[value.chat],active=this.project.state.chats.active.room;if(!chat||chat.pane!=='room'||active!==chat.id||chat.revision!==value.revision||JSON.stringify(chat.documents??[])!==JSON.stringify(value.documents))throw new RuntimeError('source_changed','Разговор для назначения роли изменился',409);
  return value;
 }
 async apply(input:Readonly<{decisionId:string;issue:AutopilotIssue;capability:BoundCapability;proposal:CouncilProposal}>):Promise<AutopilotEffectReceipt>{
  this.current();if(input.issue.project!==this.project.dir)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409);
  return runAutopilotOwnerEffect(async initiator=>{
   if(input.capability.operation.startsWith('answer_')){const {pane,record}=this.journalRecord(input),result=this.runtime.chat({pane,kind:'decision',message:input.proposal.answer,reply_to:record.seq,direct:true},{...initiator,autopilotDecisionId:input.decisionId} as Initiator);return effectReceipt({ok:true,seq:result.seq,thread:result.thread,pane},'journal:'+result.seq+':'+this.project.journal.get(result.seq)!.id)}
   if(input.capability.operation==='approve'||input.capability.operation==='deny'){const bound=this.approval(input),decision=input.capability.operation==='approve'?'allow':'deny',result=this.runtime.approve(bound.pane,bound.approvalId,decision,initiator);if(!result.ok)throw new RuntimeError('approval_closed',result.error??'Запрос разрешения уже закрыт',409);return effectReceipt({ok:true,pane:bound.pane,approvalId:bound.approvalId,decision},'approval:'+bound.pane+':'+bound.approvalId+':'+decision)}
   if(input.capability.operation==='assign_role'){const value=this.assignment(input),result=await this.runtime.assignRoomRole(value,initiator),promotion=result.promotion;if(!promotion)throw new RuntimeError('effect_unconfirmed','Назначение роли не вернуло квитанцию',409);return effectReceipt({ok:true,project:result.project,pane:result.pane.id,chat:result.chat.id,operationId:promotion.operationId},'promotion:'+promotion.operationId)}
   const bound=this.waiting(input),result=await this.runtime.attempt(bound.pane,{project:this.project.dir,turnInstanceId:bound.turnInstanceId,action:bound.action},initiator);return effectReceipt({...result},'attempt:'+result.seq)
  });
 }
 async recover(input:Readonly<{decisionId:string;issue:Pick<AutopilotIssue,'project'|'source'>;capability:BoundCapability;proposal:CouncilProposal}>):Promise<AutopilotEffectReceipt|null>{
  this.current();if(input.issue.project!==this.project.dir)return null;
  if(input.capability.operation.startsWith('answer_')){let bound:ReturnType<RuntimeAutopilotEffects['journalRecord']>;try{bound=this.journalRecord(input)}catch(error){if(error instanceof RuntimeError&&error.code==='source_changed')return null;throw error}const reply=this.project.journal.repliesTo(bound.record.seq).find(record=>record.from==='owner'&&record.to.length===1&&record.to[0]===bound.pane&&record.kind==='decision'&&record.origin==='autopilot:'+input.decisionId&&record.text===input.proposal.answer);return reply?effectReceipt({ok:true,seq:reply.seq,thread:reply.thread,pane:bound.pane},'journal:'+reply.seq+':'+reply.id):null}
  if(input.capability.operation==='continue_pane'||input.capability.operation==='stop_pane'){const value=parameters(input.capability,['pane','turnInstanceId','action']);if(typeof value.pane!=='string'||typeof value.turnInstanceId!=='string'||typeof value.action!=='string')return null;const decisions=this.project.journal.read({limit:0}).filter(record=>{const attempt=record.attempt;if(!attempt)return false;return record.from==='harness'&&record.kind==='note'&&record.origin==='attempt'&&attempt.pane===value.pane&&attempt.turnInstanceId===value.turnInstanceId&&attempt.action===value.action}),intent=decisions.find(record=>record.attempt?.done===false),done=intent&&decisions.find(record=>record.attempt?.done===true&&record.reply_to===intent.seq);return intent&&done?effectReceipt({ok:true,pane:value.pane,turnInstanceId:value.turnInstanceId,action:value.action,seq:intent.seq},'attempt:'+intent.seq):null}
  if(input.capability.operation==='assign_role'){const value=parameters(input.capability,['role','chat','project','revision','documents'],['task','createProject']),chat=typeof value.chat==='string'?this.project.state.chats.chats[value.chat]:null;if(!chat||!object(chat.promotion)||chat.promotion.done!==true||!object(chat.promotion.input)||chat.promotion.input.project!==value.project||chat.promotion.input.revision!==value.revision||JSON.stringify(chat.promotion.input.documents)!==JSON.stringify(value.documents))return null;const promotion=promotionIdentity(chat);return promotion&&promotion.completed===4?effectReceipt({ok:true,project:this.project.dir,pane:chat.pane,chat:chat.id,operationId:promotion.operationId},'promotion:'+promotion.operationId):null}
  return null;
 }
}

/** Startup reconciliation proves an old effect; it never grants authority for a new one. */
export async function recoverAutopilotIntents(runtime:Runtime,project:ProjectState){
 const ledger=runtime.autopilotDecisionLedger(project),effects=new RuntimeAutopilotEffects(runtime,project);
 for(const {entry}of ledger.list()){
  if(entry.state!=='intent')continue;sameProject(runtime,project);
  let receipt:AutopilotEffectReceipt|null=null;
  try{if(AUTOPILOT_COUNCIL_OPERATIONS.includes(entry.operation as never))receipt=await effects.recover({decisionId:entry.decisionId,issue:{project:project.dir,source:entry.question},capability:entry.capability as BoundCapability,proposal:entry.proposal as CouncilProposal})}catch(error){if(error instanceof RuntimeError&&error.code==='project_changed')throw error}
  sameProject(runtime,project);
  if(receipt)await ledger.applied({...entry,receipt});
  else await ledger.failed({...entry,state:'uncertain',code:'effect_uncertain',reason:'Исход прежнего эффекта не подтверждён; повтор запрещён'});
 }
}

class RuntimeCouncilAgents implements AutopilotAgentPort {
 private readonly runtime:Runtime;private readonly project:ProjectState;
 constructor(runtime:Runtime,project:ProjectState){this.runtime=runtime;this.project=project}
 participants(project:string){sameProject(this.runtime,this.project);if(project!==this.project.dir)throw new RuntimeError('project_changed','Проект консилиума изменился',409);const select=(role:'orchestrator'|'reviewer')=>[...this.project.registry.panes.values()].filter(pane=>pane.kind===role&&!!pane.model).sort((a,b)=>a.id.localeCompare(b.id));const orchestrators=select('orchestrator'),reviewers=select('reviewer');if(orchestrators.length>1||reviewers.length>1)throw new RuntimeError('participants_invalid','В консилиуме должно быть по одному подтверждённому месту каждой роли',409);const participant=(role:'orchestrator'|'reviewer',pane:typeof orchestrators[number]|undefined)=>pane?Object.freeze({seat:pane.id,model:pane.model,vendor:pane.vendor,role}):null;return Object.freeze({orchestrator:participant('orchestrator',orchestrators[0]),reviewer:participant('reviewer',reviewers[0])})}
 run(request:AutopilotAgentRequest){sameProject(this.runtime,this.project);return this.runtime.autopilotCouncilAgent(this.project,request)}
}

function councilStore(runtime:Runtime,project:ProjectState):AutopilotDecisionStore {
 const ledger=runtime.autopilotDecisionLedger(project);
 const read=(entry:ReturnType<typeof ledger.get>):AutopilotDecisionEntry|null=>{if(!entry)return null;if(!AUTOPILOT_COUNCIL_OPERATIONS.includes(entry.operation as never))throw new RuntimeError('decision_invalid','Операция сохранённого решения неизвестна',409);return entry as AutopilotDecisionEntry};
 return {findByIssue:hash=>read(ledger.findByIssue(hash)),get:id=>read(ledger.get(id)),intent:entry=>ledger.intent(structuredClone(entry)),applied:entry=>ledger.applied(structuredClone(entry)),failed:entry=>ledger.failed(structuredClone(entry))};
}

export interface RuntimeAutopilotCouncilPorts {state:AutopilotGenerationPort;budget:AutopilotBudgetPort;safety:AutopilotSafetyPort;timeoutMs?:number;randomToken?:()=>string}
export class RuntimeAutopilotCouncil {
 private readonly runtime:Runtime;private readonly project:ProjectState;private readonly council:AutopilotCouncil;
 constructor(runtime:Runtime,ports:RuntimeAutopilotCouncilPorts){this.runtime=runtime;this.project=runtime.project;const clock:AutopilotCouncilClock={setTimeout:(fn,ms)=>runtime.clock.setTimeout(fn,ms),clearTimeout:timer=>runtime.clock.clearTimeout(timer)};this.council=new AutopilotCouncil({state:ports.state,budget:ports.budget,safety:ports.safety,agents:new RuntimeCouncilAgents(runtime,this.project),effects:new RuntimeAutopilotEffects(runtime,this.project),decisions:councilStore(runtime,this.project),clock,...(ports.timeoutMs===undefined?{}:{timeoutMs:ports.timeoutMs}),...(ports.randomToken===undefined?{}:{randomToken:ports.randomToken})})}
 close(){this.council.close()}
 consider(issue:AutopilotIssue):Promise<AutopilotCouncilOutcome>{sameProject(this.runtime,this.project);if(issue.project!==this.project.dir)return Promise.resolve(Object.freeze({status:'owner',code:'project_changed',reason:'Проект решения Автопилота изменился',round:0}));return this.council.consider(issue)}
}
export const createRuntimeAutopilotCouncil=(runtime:Runtime,ports:RuntimeAutopilotCouncilPorts)=>new RuntimeAutopilotCouncil(runtime,ports);

export type RuntimeAutopilotCapability=AutopilotCapability;

/** Operation checks inspect runtime objects, never the model's explanation. */
export class RuntimeAutopilotSafety implements AutopilotSafetyPort {
 private runtime:Runtime;private project:ProjectState;
 constructor(runtime:Runtime,project:ProjectState=runtime.project){this.runtime=runtime;this.project=project}
 check({issue,capability,proposal}:Parameters<AutopilotSafetyPort['check']>[0]){
  sameProject(this.runtime,this.project);
  const p=this.project,value=capability.parameters,pane=typeof value.pane==='string'?p.registry.get(value.pane):null;
  if(capability.operation==='approve')throw new RuntimeError('stop_checks_missing','Запрос разрешения не содержит подтверждённых кодов эффекта; решение ждёт владельца',409);
  if(capability.operation==='deny'){
   const approval=typeof value.approvalId==='string'?pane?.approvals.get(value.approvalId):null;
   if(!approval||!sourceEqual(issue.source,autopilotApprovalSource(pane!.id,approval)))throw new RuntimeError('source_changed','Запрос разрешения изменился',409);
  }else if(capability.operation.startsWith('answer_')){
   const record=Number.isSafeInteger(value.replyTo)?p.journal.get(Number(value.replyTo)):null;
   if(!pane||!record||!sourceEqual(issue.source,autopilotJournalSource(record))||record.from!==pane.id||!record.to.includes('owner')||record.kind!==answerKind(capability.operation)||p.journal.repliesTo(record.seq).some(r=>r.from==='owner'&&r.kind==='decision'&&r.origin!=='autopilot:'+autopilotHash({project:issue.project,question:issue.source,proposal,generation:issue.generation})))throw new RuntimeError('source_changed','Вопрос уже закрыт или изменился',409);
   if(!capability.effectModelCall||capability.effectModelCall.seat!==pane.id||capability.effectModelCall.model!==pane.model||capability.effectModelCall.vendor!==pane.vendor)throw new RuntimeError('spend_check_missing','Модель ответа изменилась после резервирования расхода',409);
   if(pane.mode!=='chat')throw new RuntimeError('stop_checks_missing','Ответ запустит место с инструментами; внешние эффекты не подтверждены',409);
  }else if(capability.operation==='continue_pane'||capability.operation==='stop_pane'){
   const wait=pane&&this.runtime.waiting(pane.id);
   if(!wait||!sourceEqual(issue.source,autopilotWaitingSource(pane!.id,wait)))throw new RuntimeError('source_changed','Ожидание изменилось',409);
   if(value.action==='retry'&&(!capability.effectModelCall||capability.effectModelCall.seat!==pane!.id||capability.effectModelCall.model!==pane!.model||capability.effectModelCall.vendor!==pane!.vendor))throw new RuntimeError('spend_check_missing','Модель продолжения не связана с расходом',409);
   if(value.action==='finish'||capability.operation==='continue_pane'&&pane!.mode!=='chat')throw new RuntimeError('stop_checks_missing','Продолжение может выполнить неподтверждённые инструменты; решение ждёт владельца',409);
  }else if(capability.operation==='assign_role'){
   if(value.role!=='orchestrator'||value.createProject===true||!sourceEqual(issue.source,autopilotAssignmentSource(value)))throw new RuntimeError('stop_checks_missing','Назначение не связано с ролью текущей команды',409);
   // Promotion starts a new model turn in read mode; its tool/network effects have no typed certificate.
   throw new RuntimeError('stop_checks_missing','Назначение запускает ход с неподтверждёнными инструментами и расходом; решение ждёт владельца',409);
  }else throw new RuntimeError('stop_checks_missing','Проверка этой операции не реализована',409);
  return {checked:[...AUTOPILOT_COUNCIL_STOP_CODES],blocked:[]};
 }
}
