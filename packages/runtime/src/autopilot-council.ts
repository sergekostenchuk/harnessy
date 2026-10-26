import {createHash,randomBytes} from 'node:crypto';

import {AUTOPILOT_OPERATIONS,AUTOPILOT_STOP_CASES} from '@harnessy/projects';
export const AUTOPILOT_COUNCIL_OPERATIONS=AUTOPILOT_OPERATIONS;
export type AutopilotCouncilOperation=typeof AUTOPILOT_COUNCIL_OPERATIONS[number];
export const AUTOPILOT_COUNCIL_STOP_CODES=AUTOPILOT_STOP_CASES;
export type AutopilotCouncilStopCode=typeof AUTOPILOT_COUNCIL_STOP_CODES[number];

export interface AutopilotPermissionSnapshot {
 readonly generation:number;
 readonly revision:number;
 readonly conditions:Readonly<{operations:readonly AutopilotCouncilOperation[];maxSpendPercent:number;stopCases:readonly AutopilotCouncilStopCode[]}>;
 readonly stopCodes:readonly AutopilotCouncilStopCode[];
}
export interface AutopilotGenerationPort {
 withAutopilotGeneration<T>(expectedGeneration:number,apply:(snapshot:AutopilotPermissionSnapshot)=>T|Promise<T>):Promise<T>;
}
export interface AutopilotCapability {
 readonly operation:AutopilotCouncilOperation;
 readonly parameters:Readonly<Record<string,unknown>>;
 readonly effectModelCall?:Readonly<{seat:string;model:string;vendor?:string}>;
}
export interface AutopilotIssue {
 readonly project:string;
 readonly generation:number;
 readonly permission:AutopilotPermissionSnapshot;
 readonly source:Readonly<{id:string;kind:string;text:string}>;
 readonly capabilities:readonly AutopilotCapability[];
}
export interface AutopilotParticipant {readonly seat:string;readonly model:string;readonly vendor?:string;readonly role:'orchestrator'|'reviewer'}
export interface AutopilotAgentRequest {
 readonly participant:AutopilotParticipant;
 readonly generation:number;
 readonly requestId:string;
 readonly replyTo:string;
 readonly token:string;
 readonly round:1|2;
 readonly prompt:string;
 readonly signal:AbortSignal;
}
export interface AutopilotAgentReply {
 readonly seat:string;
 readonly model:string;
 readonly requestId:string;
 readonly replyTo:string;
 readonly token:string;
 readonly text:string;
 readonly measured?:boolean;
}
export interface AutopilotAgentPort {
 participants(project:string):Promise<Readonly<{orchestrator:AutopilotParticipant|null;reviewer:AutopilotParticipant|null}>>|Readonly<{orchestrator:AutopilotParticipant|null;reviewer:AutopilotParticipant|null}>;
 run(request:AutopilotAgentRequest):Promise<AutopilotAgentReply>;
}
export interface AutopilotBudgetCall {readonly seat:string;readonly model:string;readonly vendor?:string;readonly purpose:'proposal'|'review'|'effect';readonly round:1|2}
export interface AutopilotBudgetLease {
 use(call:AutopilotBudgetCall):Promise<void>|void;
 /** A completed call plus a fresh provider measurement; cancellation never calls this. */
 complete?(call:AutopilotBudgetCall):Promise<void>|void;
 close(result:'applied'|'owner'):Promise<void>|void;
}
export interface AutopilotBudgetPort {
 reserve(input:Readonly<{project:string;generation:number;maxSpendPercent:number;calls:readonly AutopilotBudgetCall[]}>):Promise<AutopilotBudgetLease>;
}
export interface AutopilotSafetyResult {readonly checked:readonly AutopilotCouncilStopCode[];readonly blocked:readonly AutopilotCouncilStopCode[]}
export interface AutopilotSafetyPort {
 check(input:Readonly<{issue:AutopilotIssue;capability:BoundCapability;proposal:CouncilProposal;snapshot:AutopilotPermissionSnapshot}>):Promise<AutopilotSafetyResult>|AutopilotSafetyResult;
}
export interface AutopilotEffectReceipt {readonly result:Readonly<Record<string,unknown>>;readonly effectVersion:string}
export interface AutopilotEffectPort {
 apply(input:Readonly<{decisionId:string;issue:AutopilotIssue;capability:BoundCapability;proposal:CouncilProposal;modelComplete?:()=>Promise<void>}>):Promise<AutopilotEffectReceipt>;
 recover(input:Readonly<{decisionId:string;issue:AutopilotIssue;capability:BoundCapability;proposal:CouncilProposal}>):Promise<AutopilotEffectReceipt|null>;
}
export interface AutopilotDecisionBase {
 readonly question:AutopilotIssue['source'];
 readonly council:Readonly<{orchestrator:AutopilotParticipant;reviewer:AutopilotParticipant}>;
 readonly cost:Readonly<{currency:'USD';amount:number|null;status:'measured'|'unavailable'}>;
 readonly decisionId:string;
 readonly proposalHash:string;
 readonly issueHash:string;
 readonly generation:number;
 readonly operation:AutopilotCouncilOperation;
 readonly capability:BoundCapability;
 readonly proposal:CouncilProposal;
 readonly round:1|2;
}
export type AutopilotDecisionEntry=
 |Readonly<AutopilotDecisionBase&{state:'intent'}>
 |Readonly<AutopilotDecisionBase&{state:'applied';receipt:AutopilotEffectReceipt}>
 |Readonly<AutopilotDecisionBase&{state:'failed'|'uncertain';code:string;reason:string}>;
export interface AutopilotDecisionStore {
 findByIssue(issueHash:string):Promise<AutopilotDecisionEntry|null>|AutopilotDecisionEntry|null;
 get(decisionId:string):Promise<AutopilotDecisionEntry|null>|AutopilotDecisionEntry|null;
 intent(entry:Readonly<AutopilotDecisionBase>):Promise<void>|void;
 applied(entry:Readonly<AutopilotDecisionBase&{receipt:AutopilotEffectReceipt}>):Promise<void>|void;
 failed(entry:Readonly<AutopilotDecisionBase&{state:'failed'|'uncertain';code:string;reason:string}>):Promise<void>|void;
}
export interface AutopilotCouncilClock {setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(timer:unknown):void}
export interface AutopilotCouncilDeps {
 state:AutopilotGenerationPort;
 agents:AutopilotAgentPort;
 budget:AutopilotBudgetPort;
 safety:AutopilotSafetyPort;
 effects:AutopilotEffectPort;
 decisions:AutopilotDecisionStore;
 clock:AutopilotCouncilClock;
 timeoutMs?:number;
 randomToken?:()=>string;
}

export interface BoundCapability extends AutopilotCapability {readonly id:string;readonly [key:string]:unknown}
export interface CouncilProposal {readonly [key:string]:unknown;readonly requestHash:string;readonly capability:string;readonly answer:string|null;readonly reason:string}
export interface CouncilReview {readonly proposalHash:string;readonly verdict:'agree'|'objection';readonly reason:string}
export type AutopilotCouncilOutcome=
 |Readonly<{status:'applied';decisionId:string;proposalHash:string;operation:AutopilotCouncilOperation;receipt:AutopilotEffectReceipt;round:1|2;replayed:boolean}>
 |Readonly<{status:'owner';code:string;reason:string;round:0|1|2;proposalHash?:string;decisionId?:string}>;

const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const text=(value:unknown,max:number,empty=false):value is string=>typeof value==='string'&&(empty||value.trim().length>0)&&[...value].length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value);
function jsonValue(value:unknown,depth=0,nodes={value:0}):boolean {
 if(++nodes.value>2000||depth>12)return false;
 if(value===null||typeof value==='boolean'||typeof value==='string'&&[...value].length<=20_000||finite(value))return true;
 if(Array.isArray(value))return value.length<=200&&value.every(item=>jsonValue(item,depth+1,nodes));
 if(!object(value)||Object.keys(value).length>100)return false;
 return Object.entries(value).every(([key,item])=>text(key,100)&&key!=='__proto__'&&key!=='prototype'&&key!=='constructor'&&jsonValue(item,depth+1,nodes));
}
function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value as Record<string,unknown>).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
}
export const autopilotHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const sameSet=<T extends string>(actual:readonly T[],expected:readonly T[])=>actual.length===expected.length&&new Set(actual).size===actual.length&&expected.every(value=>actual.includes(value));
const freezeRecord=(value:Readonly<Record<string,unknown>>)=>Object.freeze(structuredClone(value));

function permissionSnapshot(value:unknown,generation:number):AutopilotPermissionSnapshot {
 if(!object(value)||!exact(value,['generation','revision','conditions','stopCodes'])||value.generation!==generation||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!object(value.conditions)||!exact(value.conditions,['operations','maxSpendPercent','stopCases'])||!Array.isArray(value.conditions.operations)||!value.conditions.operations.every(op=>AUTOPILOT_COUNCIL_OPERATIONS.includes(op as AutopilotCouncilOperation))||new Set(value.conditions.operations).size!==value.conditions.operations.length||!finite(value.conditions.maxSpendPercent)||Number(value.conditions.maxSpendPercent)<0||Number(value.conditions.maxSpendPercent)>100||!Array.isArray(value.conditions.stopCases)||!Array.isArray(value.stopCodes)||!sameSet(value.stopCodes as AutopilotCouncilStopCode[],AUTOPILOT_COUNCIL_STOP_CODES)||!sameSet(value.conditions.stopCases as AutopilotCouncilStopCode[],AUTOPILOT_COUNCIL_STOP_CODES))throw new CouncilError('permission_invalid','Снимок условий Автопилота не читается');
 return Object.freeze({generation,revision:Number(value.revision),conditions:Object.freeze({operations:Object.freeze([...(value.conditions.operations as AutopilotCouncilOperation[])]),maxSpendPercent:Number(value.conditions.maxSpendPercent),stopCases:Object.freeze([...(value.conditions.stopCases as AutopilotCouncilStopCode[])])}),stopCodes:Object.freeze([...(value.stopCodes as AutopilotCouncilStopCode[])])});
}
function normalizeIssue(raw:AutopilotIssue):Readonly<{issue:AutopilotIssue;capabilities:readonly BoundCapability[];issueHash:string}> {
 if(!object(raw)||!text(raw.project,4096)||!Number.isSafeInteger(raw.generation)||raw.generation<1||!object(raw.source)||!exact(raw.source,['id','kind','text'])||!text(raw.source.id,500)||!text(raw.source.kind,80)||!text(raw.source.text,100_000,true)||!Array.isArray(raw.capabilities)||raw.capabilities.length<1||raw.capabilities.length>20)throw new CouncilError('issue_invalid','Решение Автопилота не связано с проверяемым вопросом');
 const permission=permissionSnapshot(raw.permission,raw.generation);
 const capabilities=raw.capabilities.map((entry,index)=>{
  if(!object(entry)||Object.keys(entry).some(key=>!['operation','parameters','effectModelCall'].includes(key))||!AUTOPILOT_COUNCIL_OPERATIONS.includes(entry.operation as AutopilotCouncilOperation)||!object(entry.parameters)||!jsonValue(entry.parameters))throw new CouncilError('capability_invalid','Разрешённая операция #'+(index+1)+' не читается');
  const effect=entry.effectModelCall;
  if(effect!==undefined&&(!object(effect)||Object.keys(effect).some(key=>!['seat','model','vendor'].includes(key))||effect.vendor!==undefined&&!text(effect.vendor,100)||!text(effect.seat,100)||!text(effect.model,300)))throw new CouncilError('capability_invalid','Вызов модели эффекта не связан с местом');
  const operation=entry.operation as AutopilotCouncilOperation,parameters=freezeRecord(entry.parameters),id=autopilotHash({operation,parameters});
  return Object.freeze({operation,parameters,id,...(effect?{effectModelCall:Object.freeze({seat:String(effect.seat),model:String(effect.model),...(effect.vendor?{vendor:String(effect.vendor)}:{})})}:{})});
 });
 if(new Set(capabilities.map(value=>value.id)).size!==capabilities.length)throw new CouncilError('capability_invalid','Разрешённая операция повторяется');
 if(capabilities.some(value=>!permission.conditions.operations.includes(value.operation)))throw new CouncilError('operation_denied','Разрешённая операция не входит в условия Автопилота');
 const issue=Object.freeze({project:raw.project,generation:raw.generation,permission,source:Object.freeze({...raw.source}),capabilities:Object.freeze(raw.capabilities.map(value=>Object.freeze({...value,parameters:freezeRecord(value.parameters)})))});
 return Object.freeze({issue,capabilities:Object.freeze(capabilities),issueHash:autopilotHash({project:issue.project,source:issue.source,generation:issue.generation,revision:permission.revision,capabilities:capabilities.map(({id,operation,parameters})=>({id,operation,parameters}))})});
}
function proposal(raw:string,requestHash:string,capabilities:readonly BoundCapability[]):Readonly<{value:CouncilProposal;capability:BoundCapability;hash:string}> {
 let value:unknown;try{value=JSON.parse(raw)}catch{throw new CouncilError('proposal_unparsed','Оркестратор не вернул одно JSON-решение')}
 if(!object(value)||!exact(value,['requestHash','capability','answer','reason'])||value.requestHash!==requestHash||!text(value.capability,64)||!text(value.reason,4000)||value.answer!==null&&!text(value.answer,20_000))throw new CouncilError('proposal_unparsed','Предложение оркестратора не связано с поручением');
 const capability=capabilities.find(entry=>entry.id===value.capability);if(!capability)throw new CouncilError('capability_denied','Предложена операция вне выданного списка');
 const answerOperation=capability.operation.startsWith('answer_');
 if(answerOperation?typeof value.answer!=='string'||!value.answer.trim():value.answer!==null)throw new CouncilError('proposal_unparsed',answerOperation?'Для ответа нужен непустой текст':'Эта операция не принимает текст ответа');
 const parsed=Object.freeze({requestHash:value.requestHash as string,capability:value.capability as string,answer:value.answer as string|null,reason:value.reason as string});
 return Object.freeze({value:parsed,capability,hash:autopilotHash(parsed)});
}
function review(raw:string,proposalHash:string):CouncilReview {
 let value:unknown;try{value=JSON.parse(raw)}catch{throw new CouncilError('review_unparsed','Ревьюер не вернул одно JSON-решение')}
 if(!object(value)||!exact(value,['proposalHash','verdict','reason'])||value.proposalHash!==proposalHash||!['agree','objection'].includes(String(value.verdict))||!text(value.reason,4000,value.verdict==='agree'))throw new CouncilError('review_unparsed','Ответ ревьюера не связан с точным предложением');
 return Object.freeze({proposalHash,verdict:value.verdict as CouncilReview['verdict'],reason:value.reason as string});
}
class CouncilError extends Error {readonly code:string;constructor(code:string,message:string){super(message);this.name='CouncilError';this.code=code}}
const errorReason=(error:unknown)=>error instanceof Error?error.message:String(error);
const errorCode=(error:unknown)=>object(error)&&typeof error.code==='string'?error.code:'autopilot_failed';

function proposalPrompt(issue:AutopilotIssue,capabilities:readonly BoundCapability[],issueHash:string,round:1|2,previous?:Readonly<{proposal:CouncilProposal;objection:string}>):string {
 return [
  'Ты оркестратор проекта. Предложи одно решение вопроса Автопилота с кратким обоснованием.',
  'Верни только JSON с точными ключами requestHash, capability, answer, reason. Никакого Markdown.',
  'requestHash: '+issueHash,
  'Вопрос: '+issue.source.text,
  'Разрешённые операции: '+canonical(capabilities.map(({id,operation,parameters})=>({id,operation,parameters}))),
  'Для answer_* поле answer — непустой ответ; для остальных — null.',
  ...(round===2&&previous?['Предыдущее предложение: '+canonical(previous.proposal),'Возражение ревьюера: '+previous.objection,'Исправь предложение один раз.']:[])
 ].join('\n');
}
function reviewPrompt(issue:AutopilotIssue,proposalValue:CouncilProposal,proposalHash:string):string {
 return ['Ты независимый ревьюер. Проверь предложение для вопроса и разрешённую операцию.','Верни только JSON с точными ключами proposalHash, verdict, reason. verdict = agree или objection.','proposalHash: '+proposalHash,'Вопрос: '+issue.source.text,'Разрешённые операции: '+canonical(issue.capabilities),'Предложение: '+canonical(proposalValue)].join('\n');
}

export class AutopilotCouncil {
 private controllers=new Set<AbortController>();
 private closed=false;
 close(){this.closed=true;for(const controller of this.controllers)controller.abort()}
 private jobs=new Map<string,Promise<AutopilotCouncilOutcome>>();
 private readonly timeoutMs:number;
 private readonly randomToken:()=>string;
 private readonly deps:AutopilotCouncilDeps;
 constructor(deps:AutopilotCouncilDeps){this.deps=deps;this.timeoutMs=deps.timeoutMs??120_000;this.randomToken=deps.randomToken??(()=>randomBytes(32).toString('hex'))}
 consider(raw:AutopilotIssue):Promise<AutopilotCouncilOutcome> {
  if(this.closed)return Promise.resolve(this.owner(new CouncilError('cancelled','Консилиум отменён'),0));
  let normalized:ReturnType<typeof normalizeIssue>;try{normalized=normalizeIssue(raw)}catch(error){return Promise.resolve(this.owner(error,0))}
  const key=autopilotHash({project:normalized.issue.project,source:normalized.issue.source,generation:normalized.issue.generation}),existing=this.jobs.get(key);if(existing)return existing;
  const job=this.run(normalized).finally(()=>{if(this.jobs.get(key)===job)this.jobs.delete(key)});this.jobs.set(key,job);return job;
 }
 private owner(error:unknown,round:0|1|2,extra:Partial<Extract<AutopilotCouncilOutcome,{status:'owner'}>>={}):Extract<AutopilotCouncilOutcome,{status:'owner'}>{return Object.freeze({status:'owner',code:errorCode(error),reason:errorReason(error),round,...extra})}
 private async authenticatedCall(generation:number,participant:AutopilotParticipant,prompt:string,replyTo:string,round:1|2,lease:AutopilotBudgetLease,purpose:'proposal'|'review'):Promise<string>{
  const requestId=autopilotHash({replyTo,seat:participant.seat,round,purpose,nonce:this.randomToken()}),token=this.randomToken(),controller=new AbortController();
  if(this.closed)throw new CouncilError('cancelled','Консилиум отменён');
  await lease.use({seat:participant.seat,model:participant.model,...(participant.vendor?{vendor:participant.vendor}:{}),purpose,round});
  if(this.closed)throw new CouncilError('cancelled','Консилиум отменён');this.controllers.add(controller);
  let timer:unknown;const timeout=new Promise<never>((_,reject)=>{timer=this.deps.clock.setTimeout(()=>{controller.abort('autopilot_timeout');reject(new CouncilError('council_timeout','Консилиум не ответил вовремя'))},this.timeoutMs)});
  try{
   const cancelled=new Promise<never>((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(new CouncilError(controller.signal.reason==='autopilot_timeout'?'council_timeout':'cancelled',controller.signal.reason==='autopilot_timeout'?'Консилиум не ответил вовремя':'Консилиум отменён')),{once:true})});
   const start=this.deps.state.withAutopilotGeneration(generation,()=>{if(controller.signal.aborted||this.closed)throw new CouncilError('cancelled','Консилиум отменён');return {response:this.deps.agents.run({generation,participant,requestId,replyTo,token,round,prompt,signal:controller.signal})}});
   const response=await Promise.race([start.then(started=>started.response),timeout,cancelled]);
   if(!object(response)||response.seat!==participant.seat||response.model!==participant.model||response.requestId!==requestId||response.replyTo!==replyTo||response.token!==token||typeof response.text!=='string')throw new CouncilError('sender_invalid','Ответ консилиума пришёл не от подтверждённого места');
   if(response.measured===true)await lease.complete?.({seat:participant.seat,model:participant.model,...(participant.vendor?{vendor:participant.vendor}:{}),purpose,round});
   return response.text;
  }finally{this.controllers.delete(controller);if(timer!==undefined)this.deps.clock.clearTimeout(timer)}
 }
 private async run({issue,capabilities,issueHash}:ReturnType<typeof normalizeIssue>):Promise<AutopilotCouncilOutcome>{
  let prior:AutopilotDecisionEntry|null;try{prior=await this.deps.decisions.findByIssue(issueHash)}catch(error){return this.owner(new CouncilError('decision_unreadable','Журнал решений Автопилота не читается: '+errorReason(error)),0)}
  if(prior)return this.replay(issue,capabilities,issueHash,prior);
  let participants:Awaited<ReturnType<AutopilotAgentPort['participants']>>;try{participants=await this.deps.agents.participants(issue.project)}catch(error){return this.owner(error,0)}
  const orchestrator=participants.orchestrator,reviewer=participants.reviewer;
  if(!orchestrator||orchestrator.role!=='orchestrator')return this.owner(new CouncilError('orchestrator_missing','В проекте нет подтверждённого оркестратора'),0);
  if(!reviewer||reviewer.role!=='reviewer')return this.owner(new CouncilError('reviewer_missing','В проекте нет подтверждённого ревьюера'),0);
  if(orchestrator.seat===reviewer.seat)return this.owner(new CouncilError('participants_invalid','Оркестратор и ревьюер должны быть разными местами'),0);
  const calls:AutopilotBudgetCall[]=[{seat:orchestrator.seat,model:orchestrator.model,...(orchestrator.vendor?{vendor:orchestrator.vendor}:{}),purpose:'proposal',round:1},{seat:reviewer.seat,model:reviewer.model,...(reviewer.vendor?{vendor:reviewer.vendor}:{}),purpose:'review',round:1},{seat:orchestrator.seat,model:orchestrator.model,...(orchestrator.vendor?{vendor:orchestrator.vendor}:{}),purpose:'proposal',round:2},{seat:reviewer.seat,model:reviewer.model,...(reviewer.vendor?{vendor:reviewer.vendor}:{}),purpose:'review',round:2},...capabilities.filter(value=>value.effectModelCall).map(value=>({...value.effectModelCall!,purpose:'effect' as const,round:1 as const}))];
  let lease:AutopilotBudgetLease;try{lease=await this.deps.budget.reserve({project:issue.project,generation:issue.generation,maxSpendPercent:issue.permission.conditions.maxSpendPercent,calls})}catch(error){return this.owner(new CouncilError(errorCode(error)==='autopilot_failed'?'spend_check_missing':errorCode(error),errorReason(error)),0)}
  let outcome:AutopilotCouncilOutcome=this.owner(new CouncilError('autopilot_failed','Консилиум не завершён'),0);
  try{
   let previous:Readonly<{proposal:CouncilProposal;objection:string}>|undefined;
   for(const round of [1,2] as const){
    let parsed:ReturnType<typeof proposal>,checked:CouncilReview;
    try{
     await this.deps.state.withAutopilotGeneration(issue.generation,()=>{});
     const request='autopilot:'+issueHash+':proposal:'+round,answer=await this.authenticatedCall(issue.generation,orchestrator,proposalPrompt(issue,capabilities,issueHash,round,previous),request,round,lease,'proposal');parsed=proposal(answer,issueHash,capabilities);
     await this.deps.state.withAutopilotGeneration(issue.generation,()=>{});
     const reviewRequest='autopilot:'+issueHash+':review:'+round+':'+parsed.hash,answerReview=await this.authenticatedCall(issue.generation,reviewer,reviewPrompt(issue,parsed.value,parsed.hash),reviewRequest,round,lease,'review');checked=review(answerReview,parsed.hash);
    }catch(error){outcome=this.owner(error,round);break}
    if(checked.verdict==='objection'){
     if(round===2){outcome=this.owner(new CouncilError('review_objection','Ревьюер возразил после повторного круга: '+checked.reason),2,{proposalHash:parsed.hash});break}
     previous=Object.freeze({proposal:parsed.value,objection:checked.reason});continue;
    }
    outcome=await this.apply(issue,issueHash,parsed,round,lease,{orchestrator,reviewer});break;
   }
  }finally{try{await lease.close(outcome.status==='applied'?'applied':'owner')}catch(error){outcome=this.owner(error,outcome.round)}}
  return outcome;
 }
 private async checkSafety(issue:AutopilotIssue,capability:BoundCapability,proposalValue:CouncilProposal,snapshot:AutopilotPermissionSnapshot):Promise<void>{
  if(snapshot.generation!==issue.generation||snapshot.revision!==issue.permission.revision||snapshot.conditions.maxSpendPercent!==issue.permission.conditions.maxSpendPercent||!Number.isSafeInteger(snapshot.revision)||!sameSet(snapshot.stopCodes,AUTOPILOT_COUNCIL_STOP_CODES)||!sameSet(snapshot.conditions.stopCases,snapshot.stopCodes))throw new CouncilError('stop_checks_missing','Полный набор стоп-случаев Автопилота не подтверждён');
  if(!snapshot.conditions.operations.includes(capability.operation))throw new CouncilError('operation_denied','Операция больше не разрешена условиями Автопилота');
  const safety=await this.deps.safety.check({issue,capability,proposal:proposalValue,snapshot});
  if(!object(safety)||!Array.isArray(safety.checked)||!Array.isArray(safety.blocked)||!sameSet(safety.checked,snapshot.stopCodes)||safety.blocked.some(code=>!snapshot.stopCodes.includes(code)))throw new CouncilError('stop_checks_missing','Проверка стоп-случаев операции отсутствует или неполна');
  if(safety.blocked.length)throw new CouncilError('stop_case','Операция остановлена: '+safety.blocked.join(', '));
 }
 private validPrior(issue:AutopilotIssue,capabilities:readonly BoundCapability[],issueHash:string,entry:AutopilotDecisionEntry):BoundCapability {
  const capability=capabilities.find(value=>value.id===entry.capability.id);
  if(entry.issueHash!==issueHash||entry.generation!==issue.generation||!capability||entry.operation!==capability.operation||canonical(entry.capability)!==canonical(capability)||entry.proposal.requestHash!==issueHash||entry.proposal.capability!==capability.id||autopilotHash(entry.proposal)!==entry.proposalHash||autopilotHash({project:issue.project,question:issue.source,proposal:entry.proposal,generation:issue.generation})!==entry.decisionId)throw new CouncilError('decision_invalid','Сохранённое решение не связано с этим вопросом');
  return capability;
 }
 private async replay(issue:AutopilotIssue,capabilities:readonly BoundCapability[],issueHash:string,entry:AutopilotDecisionEntry):Promise<AutopilotCouncilOutcome>{
  let capability:BoundCapability;try{capability=this.validPrior(issue,capabilities,issueHash,entry)}catch(error){return this.owner(error,0)}
  if(entry.state==='applied')return Object.freeze({status:'applied' as const,decisionId:entry.decisionId,proposalHash:entry.proposalHash,operation:entry.operation,receipt:entry.receipt,round:entry.round,replayed:true});
  if(entry.state==='failed'||entry.state==='uncertain')return this.owner(new CouncilError(entry.code,entry.reason),entry.round,{proposalHash:entry.proposalHash,decisionId:entry.decisionId});
  try{return await this.deps.state.withAutopilotGeneration(issue.generation,async snapshot=>{
   await this.checkSafety(issue,capability,entry.proposal,snapshot);
   const recovered=await this.deps.effects.recover({decisionId:entry.decisionId,issue,capability,proposal:entry.proposal});
   if(!recovered){const reason='Намерение сохранено, но исход прежнего эффекта не подтверждён; повтор запрещён';await this.deps.decisions.failed({...entry,state:'uncertain',code:'effect_uncertain',reason});throw new CouncilError('effect_uncertain',reason)}
   await this.deps.decisions.applied({...entry,receipt:recovered});return Object.freeze({status:'applied' as const,decisionId:entry.decisionId,proposalHash:entry.proposalHash,operation:entry.operation,receipt:recovered,round:entry.round,replayed:true});
  })}catch(error){return this.owner(error,entry.round,{proposalHash:entry.proposalHash,decisionId:entry.decisionId})}
 }
 private async apply(issue:AutopilotIssue,issueHash:string,parsed:ReturnType<typeof proposal>,round:1|2,lease:AutopilotBudgetLease,council:AutopilotDecisionBase['council']):Promise<AutopilotCouncilOutcome>{
  const decisionId=autopilotHash({project:issue.project,question:issue.source,proposal:parsed.value,generation:issue.generation}),base:AutopilotDecisionBase=Object.freeze({question:issue.source,council,cost:{currency:'USD' as const,amount:null,status:'unavailable' as const},decisionId,proposalHash:parsed.hash,issueHash,generation:issue.generation,operation:parsed.capability.operation,capability:parsed.capability,proposal:parsed.value,round});
  try{return await this.deps.state.withAutopilotGeneration(issue.generation,async snapshot=>{
   await this.checkSafety(issue,parsed.capability,parsed.value,snapshot);
   if(parsed.capability.effectModelCall)await lease.use({...parsed.capability.effectModelCall,purpose:'effect',round});
   const saved=await this.deps.decisions.get(decisionId);
   if(saved){
    this.validPrior(issue,[parsed.capability],issueHash,saved);if(saved.proposalHash!==parsed.hash)throw new CouncilError('decision_conflict','Идентификатор решения уже связан с другим предложением');
    if(saved.state==='applied')return Object.freeze({status:'applied' as const,decisionId,proposalHash:parsed.hash,operation:parsed.capability.operation,receipt:saved.receipt,round,replayed:true});
    if(saved.state==='failed'||saved.state==='uncertain')throw new CouncilError(saved.code,saved.reason);
    const recovered=await this.deps.effects.recover({decisionId,issue,capability:parsed.capability,proposal:parsed.value});
    if(!recovered){const reason='Намерение сохранено, но исход прежнего эффекта не подтверждён; повтор запрещён';await this.deps.decisions.failed({...base,state:'uncertain',code:'effect_uncertain',reason});throw new CouncilError('effect_uncertain',reason)}
    await this.deps.decisions.applied({...base,receipt:recovered});return Object.freeze({status:'applied' as const,decisionId,proposalHash:parsed.hash,operation:parsed.capability.operation,receipt:recovered,round,replayed:true});
   }
   await this.deps.decisions.intent(base);
   let receipt:AutopilotEffectReceipt;try{receipt=await this.deps.effects.apply({decisionId,issue,capability:parsed.capability,proposal:parsed.value,...(parsed.capability.effectModelCall&&lease.complete?{modelComplete:async()=>{await lease.complete!({...parsed.capability.effectModelCall!,purpose:'effect',round})}}:{})})}catch(error){const reason=errorReason(error),code=errorCode(error);await this.deps.decisions.failed({...base,state:'uncertain',code,reason});throw error}
   try{await this.deps.decisions.applied({...base,receipt})}catch(error){throw new CouncilError('effect_uncertain','Эффект выполнен, но подтверждение не записано: '+errorReason(error))}
   return Object.freeze({status:'applied' as const,decisionId,proposalHash:parsed.hash,operation:parsed.capability.operation,receipt,round,replayed:false});
  })}catch(error){return this.owner(error,round,{proposalHash:parsed.hash,decisionId})}
 }
}
