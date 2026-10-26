import type {Initiator,Journal,Record_} from '@harnessy/journal';
import {RuntimeError,object} from './errors.ts';
import {promotionIdentity} from './chats.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState,Waiting} from './types.ts';
import {
 AUTOPILOT_COUNCIL_OPERATIONS,
 AutopilotCouncil,
 autopilotHash,
 type AutopilotAgentPort,
 type AutopilotAgentRequest,
 type AutopilotBudgetPort,
 type AutopilotCapability,
 type AutopilotCouncilClock,
 type AutopilotCouncilOutcome,
 type AutopilotDecisionBase,
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

const INTENT_ORIGIN='autopilot-intent',APPLIED_ORIGIN='autopilot-applied',FAILED_ORIGIN='autopilot-failed';
const LIFECYCLE_ORIGINS=new Set([INTENT_ORIGIN,APPLIED_ORIGIN,FAILED_ORIGIN]);
const HASH=/^[0-9a-f]{64}$/;
const AUTOPILOT_EFFECT_OWNER=Object.freeze({seat:'owner',trust:'owner',source:'autopilot'}) as Initiator&{readonly source:'autopilot'};

const exact=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
function fail(message:string):never {throw new RuntimeError('decision_invalid',message,409)}
const sourceEqual=(left:AutopilotIssue['source'],right:AutopilotIssue['source'])=>left.id===right.id&&left.kind===right.kind&&left.text===right.text;
const sameProject=(runtime:Runtime,project:ProjectState)=>{if(project.closed||runtime.project!==project)throw new RuntimeError('project_changed','Проект решения Автопилота изменился',409)};
const baseValue=(entry:AutopilotDecisionEntry|AutopilotDecisionBase)=>({decisionId:entry.decisionId,proposalHash:entry.proposalHash,issueHash:entry.issueHash,generation:entry.generation,operation:entry.operation,capability:entry.capability,proposal:entry.proposal,round:entry.round});
const baseEqual=(left:AutopilotDecisionEntry|AutopilotDecisionBase,right:AutopilotDecisionEntry|AutopilotDecisionBase)=>autopilotHash(baseValue(left))===autopilotHash(baseValue(right));

function parseDecision(raw:unknown):AutopilotDecisionEntry {
 if(!object(raw)||typeof raw.state!=='string')return fail('Запись решения Автопилота не читается');
 const baseKeys=['decisionId','proposalHash','issueHash','generation','operation','capability','proposal','round','state'];
 const keys=raw.state==='intent'?baseKeys:raw.state==='applied'?[...baseKeys,'receipt']:raw.state==='failed'||raw.state==='uncertain'?[...baseKeys,'code','reason']:[];
 if(!keys.length||!exact(raw,keys)||!HASH.test(String(raw.decisionId))||!HASH.test(String(raw.proposalHash))||!HASH.test(String(raw.issueHash))||!Number.isSafeInteger(raw.generation)||Number(raw.generation)<1||!AUTOPILOT_COUNCIL_OPERATIONS.includes(raw.operation as never)||!object(raw.capability)||!object(raw.proposal)||![1,2].includes(Number(raw.round)))return fail('Запись решения Автопилота повреждена');
 const capability=raw.capability;
 if(!Object.keys(capability).every(key=>['id','operation','parameters','effectModelCall'].includes(key))||!HASH.test(String(capability.id))||capability.operation!==raw.operation||!object(capability.parameters)||autopilotHash({operation:capability.operation,parameters:capability.parameters})!==capability.id)return fail('Полномочие сохранённого решения повреждено');
 if(capability.effectModelCall!==undefined&&(!object(capability.effectModelCall)||!exact(capability.effectModelCall,['seat','model'])||typeof capability.effectModelCall.seat!=='string'||!capability.effectModelCall.seat||typeof capability.effectModelCall.model!=='string'||!capability.effectModelCall.model))return fail('Вызов модели эффекта повреждён');
 const proposal=raw.proposal;
 if(!exact(proposal,['requestHash','capability','answer','reason'])||proposal.requestHash!==raw.issueHash||proposal.capability!==capability.id||proposal.answer!==null&&typeof proposal.answer!=='string'||typeof proposal.reason!=='string'||autopilotHash(proposal)!==raw.proposalHash)return fail('Предложение сохранённого решения повреждено');
 if(raw.state==='applied'&&(!object(raw.receipt)||!exact(raw.receipt,['result','effectVersion'])||!object(raw.receipt.result)||typeof raw.receipt.effectVersion!=='string'||!raw.receipt.effectVersion))return fail('Квитанция эффекта Автопилота повреждена');
 if((raw.state==='failed'||raw.state==='uncertain')&&(typeof raw.code!=='string'||!raw.code||typeof raw.reason!=='string'||!raw.reason))return fail('Причина отказа Автопилота повреждена');
 return structuredClone(raw) as unknown as AutopilotDecisionEntry;
}

function parseLifecycle(record:Record_):AutopilotDecisionEntry {
 if(record.from!=='harness'||record.to.length!==1||record.to[0]!=='owner'||record.kind!=='note'||!record.origin||!LIFECYCLE_ORIGINS.has(record.origin))return fail('Источник записи решения Автопилота подделан');
 let value:unknown;try{value=JSON.parse(record.text)}catch{return fail('JSON решения Автопилота повреждён')}
 if(!object(value)||!exact(value,['version','entry'])||value.version!==1)return fail('Версия записи решения Автопилота не поддерживается');
 const entry=parseDecision(value.entry),origin=entry.state==='intent'?INTENT_ORIGIN:entry.state==='applied'?APPLIED_ORIGIN:FAILED_ORIGIN;
 if(record.origin!==origin||record.thread!=='autopilot:'+entry.decisionId)return fail('Этап решения Автопилота не совпадает с записью');
 if(entry.state==='intent'?record.reply_to!==null:!Number.isSafeInteger(record.reply_to)||Number(record.reply_to)<1)return fail('Связь этапов решения Автопилота повреждена');
 return entry;
}

interface DecisionRow {entry:AutopilotDecisionEntry;intentSeq:number;terminalSeq:number|null}
export class JournalAutopilotDecisionStore implements AutopilotDecisionStore {
 private readonly journal:Journal;
 constructor(journal:Journal){this.journal=journal}
 private rows():Map<string,DecisionRow>{
  const rows=new Map<string,DecisionRow>(),terminals:{record:Record_;entry:AutopilotDecisionEntry}[]=[];
  for(const record of this.journal.read({limit:0})){
   if(!record.origin||!LIFECYCLE_ORIGINS.has(record.origin))continue;
   const entry=parseLifecycle(record);
   if(entry.state!=='intent'){terminals.push({record,entry});continue}
   if(rows.has(entry.decisionId))fail('Намерение решения Автопилота записано больше одного раза');
   rows.set(entry.decisionId,{entry,intentSeq:record.seq,terminalSeq:null});
  }
  for(const {record,entry} of terminals){const row=rows.get(entry.decisionId);if(!row)fail('Завершение решения Автопилота не имеет намерения');if(record.reply_to!==row.intentSeq||!baseEqual(row.entry,entry)||row.terminalSeq!==null)fail('Завершение решения Автопилота не связано с одним намерением');row.entry=entry;row.terminalSeq=record.seq}
  return rows;
 }
 findByIssue(issueHash:string):AutopilotDecisionEntry|null {const found=[...this.rows().values()].filter(row=>row.entry.issueHash===issueHash);if(found.length>1)fail('Один вопрос связан с несколькими решениями Автопилота');return found[0]?.entry??null}
 get(decisionId:string):AutopilotDecisionEntry|null {return this.rows().get(decisionId)?.entry??null}
 private append(entry:AutopilotDecisionEntry,origin:string,replyTo:number|null){this.journal.append({sender:'harness',to:['owner'],kind:'note',origin,thread:'autopilot:'+entry.decisionId,...(replyTo===null?{}:{reply_to:replyTo}),text:JSON.stringify({version:1,entry})})}
 intent(entry:Readonly<AutopilotDecisionBase>):void {const rows=this.rows(),current=rows.get(entry.decisionId);if(current){if(!baseEqual(current.entry,entry))fail('Идентификатор решения уже связан с другим намерением');return}this.append({...structuredClone(entry),state:'intent'},INTENT_ORIGIN,null)}
 applied(entry:Readonly<AutopilotDecisionBase&{receipt:AutopilotEffectReceipt}>):void {const row=this.rows().get(entry.decisionId);if(!row)fail('Квитанция решения не имеет намерения');if(!baseEqual(row.entry,entry))fail('Квитанция решения не связана с намерением');if(row.entry.state==='applied'){if(autopilotHash(row.entry.receipt)!==autopilotHash(entry.receipt))fail('Квитанция решения изменилась');return}if(row.entry.state!=='intent')fail('Решение уже завершено другим исходом');this.append({...structuredClone(entry),state:'applied'},APPLIED_ORIGIN,row.intentSeq)}
 failed(entry:Readonly<AutopilotDecisionBase&{state:'failed'|'uncertain';code:string;reason:string}>):void {const row=this.rows().get(entry.decisionId);if(!row)fail('Отказ решения не имеет намерения');if(!baseEqual(row.entry,entry))fail('Отказ решения не связан с намерением');if(row.entry.state==='failed'||row.entry.state==='uncertain'){if(autopilotHash(row.entry)!==autopilotHash(entry))fail('Исход решения изменился');return}if(row.entry.state!=='intent')fail('Решение уже подтверждено выполненным');this.append(structuredClone(entry),FAILED_ORIGIN,row.intentSeq)}
}

export const autopilotJournalSource=(record:Pick<Record_,'seq'|'id'|'kind'|'text'>)=>Object.freeze({id:'journal:'+record.seq+':'+record.id,kind:record.kind,text:record.text});
export const autopilotApprovalSource=(pane:string,approval:Readonly<{id:string;title:string;detail:string}>)=>Object.freeze({id:'approval:'+autopilotHash({pane,id:approval.id,title:approval.title,detail:approval.detail}),kind:'approval',text:approval.title+'\n'+approval.detail});
export const autopilotWaitingSource=(pane:string,waiting:Pick<Waiting,'status'|'turnInstanceId'|'actions'|'failure'>)=>Object.freeze({id:'waiting:'+pane+':'+waiting.turnInstanceId,kind:'waiting',text:JSON.stringify({status:waiting.status,actions:[...waiting.actions],failure:waiting.failure?{code:waiting.failure.code,reason:waiting.failure.reason}:null})});
export const autopilotAssignmentSource=(parameters:Readonly<Record<string,unknown>>)=>Object.freeze({id:'assignment:'+autopilotHash(parameters),kind:'assign_role',text:JSON.stringify(parameters)});

export async function runAutopilotOwnerEffect<T>(apply:(initiator:Initiator)=>T|Promise<T>):Promise<T>{return apply(AUTOPILOT_EFFECT_OWNER)}

function parameters(capability:BoundCapability,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{const value=capability.parameters,keys=Object.keys(value);if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))throw new RuntimeError('capability_invalid','Параметры операции Автопилота не входят в закрытый список',409);return value as Record<string,unknown>}
function answerKind(operation:BoundCapability['operation']){return operation.slice('answer_'.length)}
function effectReceipt(result:Record<string,unknown>,effectVersion:string):AutopilotEffectReceipt{return Object.freeze({result:Object.freeze(structuredClone(result)),effectVersion})}

export class RuntimeAutopilotEffects implements AutopilotEffectPort {
 private readonly runtime:Runtime;private readonly project:ProjectState;
 constructor(runtime:Runtime,project:ProjectState=runtime.project){this.runtime=runtime;this.project=project}
 private current(){sameProject(this.runtime,this.project);return this.project}
 private journalRecord(input:{issue:AutopilotIssue;capability:BoundCapability}){
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
   if(input.capability.operation.startsWith('answer_')){const {pane,record}=this.journalRecord(input),result=this.runtime.chat({pane,kind:'decision',message:input.proposal.answer,reply_to:record.seq,direct:true},initiator);return effectReceipt({ok:true,seq:result.seq,thread:result.thread,pane},'journal:'+result.seq+':'+this.project.journal.get(result.seq)!.id)}
   if(input.capability.operation==='approve'||input.capability.operation==='deny'){const bound=this.approval(input),decision=input.capability.operation==='approve'?'allow':'deny',result=this.runtime.approve(bound.pane,bound.approvalId,decision,initiator);if(!result.ok)throw new RuntimeError('approval_closed',result.error??'Запрос разрешения уже закрыт',409);return effectReceipt({ok:true,pane:bound.pane,approvalId:bound.approvalId,decision},'approval:'+bound.pane+':'+bound.approvalId+':'+decision)}
   if(input.capability.operation==='assign_role'){const value=this.assignment(input),result=await this.runtime.assignRoomRole(value,initiator),promotion=result.promotion;if(!promotion)throw new RuntimeError('effect_unconfirmed','Назначение роли не вернуло квитанцию',409);return effectReceipt({ok:true,project:result.project,pane:result.pane.id,chat:result.chat.id,operationId:promotion.operationId},'promotion:'+promotion.operationId)}
   const bound=this.waiting(input),result=await this.runtime.attempt(bound.pane,{project:this.project.dir,turnInstanceId:bound.turnInstanceId,action:bound.action},initiator);return effectReceipt({...result},'attempt:'+result.seq)
  });
 }
 async recover(input:Readonly<{decisionId:string;issue:AutopilotIssue;capability:BoundCapability;proposal:CouncilProposal}>):Promise<AutopilotEffectReceipt|null>{
  this.current();if(input.issue.project!==this.project.dir)return null;
  if(input.capability.operation.startsWith('answer_')){let bound:ReturnType<RuntimeAutopilotEffects['journalRecord']>;try{bound=this.journalRecord(input)}catch(error){if(error instanceof RuntimeError&&error.code==='source_changed')return null;throw error}const reply=this.project.journal.repliesTo(bound.record.seq).find(record=>record.from==='owner'&&record.to.length===1&&record.to[0]===bound.pane&&record.kind==='decision'&&record.text===input.proposal.answer);return reply?effectReceipt({ok:true,seq:reply.seq,thread:reply.thread,pane:bound.pane},'journal:'+reply.seq+':'+reply.id):null}
  if(input.capability.operation==='continue_pane'||input.capability.operation==='stop_pane'){const value=parameters(input.capability,['pane','turnInstanceId','action']);if(typeof value.pane!=='string'||typeof value.turnInstanceId!=='string'||typeof value.action!=='string')return null;const decisions=this.project.journal.read({limit:0}).filter(record=>{const attempt=record.attempt;if(!attempt)return false;return record.from==='harness'&&record.kind==='note'&&record.origin==='attempt'&&attempt.pane===value.pane&&attempt.turnInstanceId===value.turnInstanceId&&attempt.action===value.action}),intent=decisions.find(record=>record.attempt?.done===false),done=intent&&decisions.find(record=>record.attempt?.done===true&&record.reply_to===intent.seq);return intent&&done?effectReceipt({ok:true,pane:value.pane,turnInstanceId:value.turnInstanceId,action:value.action,seq:intent.seq},'attempt:'+intent.seq):null}
  if(input.capability.operation==='assign_role'){const value=parameters(input.capability,['role','chat','project','revision','documents'],['task','createProject']),chat=typeof value.chat==='string'?this.project.state.chats.chats[value.chat]:null;if(!chat||!object(chat.promotion)||chat.promotion.done!==true||!object(chat.promotion.input)||chat.promotion.input.project!==value.project||chat.promotion.input.revision!==value.revision||JSON.stringify(chat.promotion.input.documents)!==JSON.stringify(value.documents))return null;const promotion=promotionIdentity(chat);return promotion&&promotion.completed===4?effectReceipt({ok:true,project:this.project.dir,pane:chat.pane,chat:chat.id,operationId:promotion.operationId},'promotion:'+promotion.operationId):null}
  return null;
 }
}

class RuntimeCouncilAgents implements AutopilotAgentPort {
 private readonly runtime:Runtime;private readonly project:ProjectState;
 constructor(runtime:Runtime,project:ProjectState){this.runtime=runtime;this.project=project}
 participants(project:string){sameProject(this.runtime,this.project);if(project!==this.project.dir)throw new RuntimeError('project_changed','Проект консилиума изменился',409);const select=(role:'orchestrator'|'reviewer')=>[...this.project.registry.panes.values()].filter(pane=>pane.kind===role&&!!pane.model).sort((a,b)=>a.id.localeCompare(b.id));const orchestrators=select('orchestrator'),reviewers=select('reviewer');if(orchestrators.length>1||reviewers.length>1)throw new RuntimeError('participants_invalid','В консилиуме должно быть по одному подтверждённому месту каждой роли',409);const participant=(role:'orchestrator'|'reviewer',pane:typeof orchestrators[number]|undefined)=>pane?Object.freeze({seat:pane.id,model:pane.model,role}):null;return Object.freeze({orchestrator:participant('orchestrator',orchestrators[0]),reviewer:participant('reviewer',reviewers[0])})}
 run(request:AutopilotAgentRequest){sameProject(this.runtime,this.project);return this.runtime.autopilotCouncilAgent(this.project,request)}
}

export interface RuntimeAutopilotCouncilPorts {state:AutopilotGenerationPort;budget:AutopilotBudgetPort;safety:AutopilotSafetyPort;timeoutMs?:number;randomToken?:()=>string}
export class RuntimeAutopilotCouncil {
 private readonly runtime:Runtime;private readonly project:ProjectState;private readonly council:AutopilotCouncil;
 constructor(runtime:Runtime,ports:RuntimeAutopilotCouncilPorts){this.runtime=runtime;this.project=runtime.project;const clock:AutopilotCouncilClock={setTimeout:(fn,ms)=>runtime.clock.setTimeout(fn,ms),clearTimeout:timer=>runtime.clock.clearTimeout(timer)};this.council=new AutopilotCouncil({state:ports.state,budget:ports.budget,safety:ports.safety,agents:new RuntimeCouncilAgents(runtime,this.project),effects:new RuntimeAutopilotEffects(runtime,this.project),decisions:new JournalAutopilotDecisionStore(this.project.journal),clock,...(ports.timeoutMs===undefined?{}:{timeoutMs:ports.timeoutMs}),...(ports.randomToken===undefined?{}:{randomToken:ports.randomToken})})}
 consider(issue:AutopilotIssue):Promise<AutopilotCouncilOutcome>{sameProject(this.runtime,this.project);if(issue.project!==this.project.dir)return Promise.resolve(Object.freeze({status:'owner',code:'project_changed',reason:'Проект решения Автопилота изменился',round:0}));return this.council.consider(issue)}
}
export const createRuntimeAutopilotCouncil=(runtime:Runtime,ports:RuntimeAutopilotCouncilPorts)=>new RuntimeAutopilotCouncil(runtime,ports);

export type RuntimeAutopilotCapability=AutopilotCapability;
