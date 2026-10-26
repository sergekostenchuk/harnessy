import test from 'node:test';
import assert from 'node:assert/strict';
import {AutopilotCouncil,AUTOPILOT_COUNCIL_STOP_CODES,autopilotHash,type AutopilotAgentPort,type AutopilotAgentRequest,type AutopilotBudgetCall,type AutopilotBudgetLease,type AutopilotCouncilDeps,type AutopilotCouncilOutcome,type AutopilotDecisionBase,type AutopilotDecisionEntry,type AutopilotEffectReceipt,type AutopilotIssue,type AutopilotPermissionSnapshot} from './autopilot-council.ts';
import {FakeClock,deferred,until} from './test-helpers.ts';

const stops=[...AUTOPILOT_COUNCIL_STOP_CODES];
const permission:AutopilotPermissionSnapshot={generation:7,revision:3,conditions:{operations:['answer_question','deny','continue_pane'],maxSpendPercent:12,stopCases:stops},stopCodes:stops};
const issue=(overrides:Partial<AutopilotIssue>={}):AutopilotIssue=>({project:'/project',generation:7,permission,source:{id:'channel:41:record',kind:'question',text:'Как продолжить?'},capabilities:[{operation:'answer_question',parameters:{pane:'worker',replyTo:41}}],...overrides});
const capabilityId=(value:AutopilotIssue['capabilities'][number])=>autopilotHash({operation:value.operation,parameters:value.parameters});
const jsonFrom=(line:string,prefix:string)=>JSON.parse(line.split('\n').find(value=>value.startsWith(prefix))!.slice(prefix.length));
const hashFrom=(line:string,prefix:string)=>line.split('\n').find(value=>value.startsWith(prefix))!.slice(prefix.length);
const error=(code:string,reason=code)=>Object.assign(new Error(reason),{code});

interface FixtureOptions {
 responders?:(((request:AutopilotAgentRequest)=>Promise<string>|string)|undefined)[];
 tamper?:(reply:Readonly<{seat:string;model:string;requestId:string;replyTo:string;token:string;text:string}>,request:AutopilotAgentRequest)=>Readonly<{seat:string;model:string;requestId:string;replyTo:string;token:string;text:string}>;
 decision?:AutopilotDecisionEntry|null;
 reviewer?:boolean;
 state?:AutopilotPermissionSnapshot|Error;
 safety?:{checked:readonly typeof stops[number][];blocked:readonly typeof stops[number][]}|Error;
 reserveError?:Error;
 effect?:AutopilotEffectReceipt|Error;
 recovered?:AutopilotEffectReceipt|null;
}
function fixture(options:FixtureOptions={}){
 const clock=new FakeClock(),requests:AutopilotAgentRequest[]=[],events:string[]=[],uses:AutopilotBudgetCall[]=[],records=new Map<string,AutopilotDecisionEntry>();
 if(options.decision)records.set(options.decision.decisionId,options.decision);
 const responders=[...(options.responders??[])];
 const agents:AutopilotAgentPort={participants:()=>({orchestrator:{seat:'orch',model:'o1',role:'orchestrator'},reviewer:options.reviewer===false?null:{seat:'review',model:'r1',role:'reviewer'}}),async run(request){requests.push(request);const answer=await (responders.shift()?.(request)??(()=>{if(request.participant.role==='orchestrator'){const caps=jsonFrom(request.prompt,'Разрешённые операции: ');return JSON.stringify({requestHash:hashFrom(request.prompt,'requestHash: '),capability:caps[0].id,answer:'Делай безопасно',reason:'вопрос внутренний'})}return JSON.stringify({proposalHash:hashFrom(request.prompt,'proposalHash: '),verdict:'agree',reason:'проверено'})})()),reply={seat:request.participant.seat,model:request.participant.model,requestId:request.requestId,replyTo:request.replyTo,token:request.token,text:answer};return options.tamper?.(reply,request)??reply}};
 const lease:AutopilotBudgetLease={use(call){uses.push(call);events.push('budget:'+call.purpose+':'+call.round)},close(result){events.push('budget-close:'+result)}};
 const reserved:{project:string;generation:number;maxSpendPercent:number;calls:readonly AutopilotBudgetCall[]}[]=[];
 let applyCalls=0,recoverCalls=0;
 const deps:AutopilotCouncilDeps={clock,agents,state:{async withAutopilotGeneration(_generation,apply){events.push('generation');if(options.state instanceof Error)throw options.state;return apply(options.state??permission)}},budget:{async reserve(input){if(options.reserveError)throw options.reserveError;reserved.push(input);events.push('budget-reserve');return lease}},safety:{async check(){events.push('safety');if(options.safety instanceof Error)throw options.safety;return options.safety??{checked:stops,blocked:[]}}},effects:{async apply(){applyCalls++;events.push('effect');if(options.effect instanceof Error)throw options.effect;return options.effect??{result:{ok:true,seq:42},effectVersion:'reply:42'}},async recover(){recoverCalls++;events.push('recover');return options.recovered??null}},decisions:{findByIssue(issueHash){events.push('find-issue');return [...records.values()].find(entry=>entry.issueHash===issueHash)??null},get(id){events.push('get');return records.get(id)??null},intent(entry){events.push('intent');records.set(entry.decisionId,{...entry,state:'intent'})},applied(entry){events.push('receipt');records.set(entry.decisionId,{...entry,state:'applied'})},failed(entry){events.push(entry.state);records.set(entry.decisionId,entry)}},randomToken:(()=>{let n=0;return()=>String(++n).padStart(64,'0')})(),timeoutMs:500};
 const council=new AutopilotCouncil(deps);
 return {council,clock,requests,events,uses,reserved,records,get applyCalls(){return applyCalls},get recoverCalls(){return recoverCalls}};
}
function applied(outcome:AutopilotCouncilOutcome):asserts outcome is Extract<AutopilotCouncilOutcome,{status:'applied'}>{assert.equal(outcome.status,'applied',JSON.stringify(outcome))}
const owner=(outcome:AutopilotCouncilOutcome,code:string)=>{assert.equal(outcome.status,'owner',JSON.stringify(outcome));if(outcome.status==='owner')assert.equal(outcome.code,code)};

test('38.2: agreement uses bound capability, exact generation and durable intent before one owner effect',async()=>{
 const f=fixture(),outcome=await f.council.consider(issue());applied(outcome);
 assert.equal(outcome.operation,'answer_question');assert.equal(outcome.round,1);assert.equal(outcome.replayed,false);assert.equal(f.applyCalls,1);
 assert.ok(f.events.indexOf('generation')<f.events.indexOf('safety'));assert.ok(f.events.indexOf('safety')<f.events.indexOf('intent'));assert.ok(f.events.indexOf('intent')<f.events.indexOf('effect'));assert.ok(f.events.indexOf('effect')<f.events.indexOf('receipt'));
 assert.equal(f.reserved[0]!.maxSpendPercent,12);assert.deepEqual(f.reserved[0]!.calls.map(c=>c.purpose+':'+c.round),['proposal:1','review:1','proposal:2','review:2']);assert.deepEqual(f.uses.map(c=>c.purpose+':'+c.round),['proposal:1','review:1']);
 assert.equal(f.requests[0]!.participant.seat,'orch');assert.equal(f.requests[1]!.participant.seat,'review');assert.notEqual(f.requests[0]!.token,f.requests[1]!.token);assert.match(outcome.decisionId,/^[0-9a-f]{64}$/);
});

test('38.2: forged sender token, stale reply and review of another proposal never reach owner API',async()=>{
 for(const field of ['seat','token','replyTo','proposalHash'] as const){
  const responders=field==='proposalHash'?[undefined,(request:AutopilotAgentRequest)=>JSON.stringify({proposalHash:'0'.repeat(64),verdict:'agree',reason:''})]:[];
  const f=fixture({responders,...(field==='proposalHash'?{}:{tamper:(reply,request)=>({...reply,seat:field==='seat'?'other':request.participant.seat,replyTo:field==='replyTo'?'old':request.replyTo,token:field==='token'?'forged':request.token,text:JSON.stringify({requestHash:hashFrom(request.prompt,'requestHash: '),capability:capabilityId(issue().capabilities[0]!),answer:'ответ',reason:'причина'})})})});
  const outcome=await f.council.consider(issue());owner(outcome,field==='proposalHash'?'review_unparsed':'sender_invalid');assert.equal(f.applyCalls,0);
 }
});

test('38.2: one objection opens exactly one second round; a second objection leaves the question to owner',async()=>{
 const answerProposal=(request:AutopilotAgentRequest)=>{const caps=jsonFrom(request.prompt,'Разрешённые операции: ');return JSON.stringify({requestHash:hashFrom(request.prompt,'requestHash: '),capability:caps[0].id,answer:'ответ '+request.round,reason:'попытка '+request.round})};
 const answerReview=(verdict:'agree'|'objection')=>(request:AutopilotAgentRequest)=>JSON.stringify({proposalHash:hashFrom(request.prompt,'proposalHash: '),verdict,reason:verdict==='agree'?'':'нужна точность'});
 const accepted=fixture({responders:[answerProposal,answerReview('objection'),answerProposal,answerReview('agree')]}),ok=await accepted.council.consider(issue());applied(ok);assert.equal(ok.round,2);assert.equal(accepted.requests.length,4);assert.equal(accepted.applyCalls,1);
 const rejected=fixture({responders:[answerProposal,answerReview('objection'),answerProposal,answerReview('objection')]}),no=await rejected.council.consider(issue());owner(no,'review_objection');assert.equal(rejected.requests.length,4);assert.equal(rejected.applyCalls,0);
});

test('38.2: missing reviewer, unknown budget and malformed proposal fail closed before owner effect',async()=>{
 const noReviewer=fixture({reviewer:false}),a=await noReviewer.council.consider(issue());owner(a,'reviewer_missing');assert.equal(noReviewer.requests.length,0);
 const noPrice=fixture({reserveError:error('spend_unknown','Цена модели неизвестна')}),b=await noPrice.council.consider(issue());owner(b,'spend_unknown');assert.equal(noPrice.requests.length,0);
 const malformed=fixture({responders:[()=>'{not json']}),c=await malformed.council.consider(issue());owner(c,'proposal_unparsed');assert.equal(malformed.applyCalls,0);
});

test('38.2: timeout aborts the exact request and does not start reviewer or effect',async()=>{
 const gate=deferred<string>(),f=fixture({responders:[request=>{request.signal.addEventListener('abort',()=>gate.resolve('late'),{once:true});return gate.promise}]}),pending=f.council.consider(issue());await until(()=>f.requests.length===1);f.clock.advance(500);const outcome=await pending;owner(outcome,'council_timeout');assert.equal(f.requests.length,1);assert.equal(f.requests[0]!.signal.aborted,true);assert.equal(f.applyCalls,0);
});

test('38.2: stale generation, incomplete stop checks and a triggered stop case refuse inside atomic application',async()=>{
 const stale=fixture({state:error('autopilot_generation_mismatch')}),a=await stale.council.consider(issue());owner(a,'autopilot_generation_mismatch');assert.equal(stale.applyCalls,0);
 const missing=fixture({safety:{checked:stops.slice(0,-1),blocked:[]}}),b=await missing.council.consider(issue());owner(b,'stop_checks_missing');assert.equal(missing.applyCalls,0);
 const blocked=fixture({safety:{checked:stops,blocked:['data_delete']}}),c=await blocked.council.consider(issue());owner(c,'stop_case');assert.equal(blocked.applyCalls,0);
});

test('38.2: concurrent duplicate shares one council and applied replay returns the first receipt',async()=>{
 const first=deferred<string>(),f=fixture({responders:[async request=>{await first.promise;const caps=jsonFrom(request.prompt,'Разрешённые операции: ');return JSON.stringify({requestHash:hashFrom(request.prompt,'requestHash: '),capability:caps[0].id,answer:'один',reason:'одна причина'})}]});
 const a=f.council.consider(issue()),b=f.council.consider(issue());assert.equal(a,b);first.resolve('go');const [one,two]=await Promise.all([a,b]);applied(one);applied(two);assert.equal(one.decisionId,two.decisionId);assert.equal(f.requests.length,2);assert.equal(f.applyCalls,1);
 const saved=f.records.get(one.decisionId)!;const replay=fixture({decision:saved}),again=await replay.council.consider(issue());applied(again);assert.equal(again.replayed,true);assert.equal(replay.applyCalls,0);assert.equal(replay.recoverCalls,0);
});

test('38.2: restart after durable intent recovers proof or records uncertainty and never repeats effect',async()=>{
 const seed=fixture(),first=await seed.council.consider(issue());applied(first);const saved=seed.records.get(first.decisionId)!;assert.equal(saved.state,'applied');const {state:_state,receipt:_receipt,...base}=saved as Extract<AutopilotDecisionEntry,{state:'applied'}>;const intent:AutopilotDecisionEntry={...(base as AutopilotDecisionBase),state:'intent'};
 const receipt={result:{ok:true,seq:42},effectVersion:'reply:42'},recover=fixture({decision:intent,recovered:receipt}),yes=await recover.council.consider(issue());applied(yes);assert.equal(yes.replayed,true);assert.equal(recover.recoverCalls,1);assert.equal(recover.applyCalls,0);
 const unknown=fixture({decision:intent,recovered:null}),no=await unknown.council.consider(issue());owner(no,'effect_uncertain');assert.equal(unknown.recoverCalls,1);assert.equal(unknown.applyCalls,0);assert.equal(unknown.records.get(first.decisionId)?.state,'uncertain');
});

test('38.2: permission snapshot and exact proposal bind revision, operation and decision id',async()=>{
 const bad={...permission,conditions:{...permission.conditions,operations:['deny'] as const}},outside=fixture(),a=await outside.council.consider(issue({permission:bad}));owner(a,'operation_denied');
 const changed=fixture({state:{...permission,revision:4}}),b=await changed.council.consider(issue());owner(b,'stop_checks_missing');assert.equal(changed.applyCalls,0);
 const one=fixture(),two=fixture(),left=await one.council.consider(issue()),right=await two.council.consider(issue({source:{id:'channel:42:record',kind:'question',text:'Как продолжить?'}}));applied(left);applied(right);assert.notEqual(left.decisionId,right.decisionId);
});
