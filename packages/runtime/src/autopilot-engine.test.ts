import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {harness,OWNER,deferred,until} from './test-helpers.ts';
import {AutopilotSpendBudget} from './autopilot-budget.ts';
import {RuntimeAutopilotSafety,autopilotAssignmentSource} from './autopilot-runtime.ts';
const seats='  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: chat, digest: false}\n  reviewer: {role: reviewer, vendor: claude, label: ревьюер, model: w2, mode: chat, digest: false}\n  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: chat, digest: false}';
const policy=(dir:string)=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),readFileSync(new URL('../../team/templates/comms-policy.yaml',import.meta.url)));
const quotes=async(calls:readonly unknown[])=>calls.map(()=>({window:'claude:weekly:1',percentUsed:20,upperPercent:0.01,basis:'stub verified weekly upper bound'}));
const line=(s:string,p:string)=>s.split('\n').find(l=>l.startsWith(p))!.slice(p.length);
async function setup(t:Parameters<typeof harness>[0],options:{quoted?:boolean;review?:'agree'|'objection';operations?:string[]}={}){
 const h=await harness(t,{seats,before:policy,deps:options.quoted===false?{}:{autopilotSpendQuotes:quotes}});
 h.provider.onRun=async(seat,prompt,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:1,usage:{input:10,output:5,cacheRead:0}});if(prompt.includes('requestHash: ')){const caps=JSON.parse(line(prompt,'Разрешённые операции: '));return {text:JSON.stringify({requestHash:line(prompt,'requestHash: '),capability:caps[0].id,answer:caps[0].operation.startsWith('answer_')?'Внутренний ответ':null,reason:'внутренняя операция'}),sessionId:null}}if(prompt.includes('proposalHash: '))return {text:JSON.stringify({proposalHash:line(prompt,'proposalHash: '),verdict:options.review??'agree',reason:'проверено'}),sessionId:null};return {text:'получено',sessionId:null}};
 await h.runtime.autopilotSet({project:h.dir,instance:h.runtime.project.trace.instanceId,on:true,until:'morning',revision:0,conditions:{operations:options.operations??['answer_question'],maxSpendPercent:5}},OWNER);
 await h.runtime.idle();return h;
}
function question(h:Awaited<ReturnType<typeof setup>>){return h.runtime.channel.post({to:'owner',kind:'question',text:'Как продолжить?',thread:'Q'},{seat:'worker',trust:'agent'})}
test('38.2 runtime: real channel → two model seats → same owner API → durable 38.3 receipt; duplicate wake is harmless',async t=>{
 const h=await setup(t),q=question(h);await h.runtime.idle();const replies=h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner');assert.equal(replies.length,1);assert.equal(replies[0]!.text,'Внутренний ответ');const rows=h.runtime.autopilotDecisionLedger().list();assert.equal(rows.length,1);assert.equal(rows[0]!.entry.state,'applied');assert.equal(h.provider.calls.filter(c=>c.message.includes('requestHash: ')).length,1);assert.equal(h.provider.calls.filter(c=>c.message.includes('proposalHash: ')).length,1);assert.equal(h.runtime.settings.autopilot().on,true);h.runtime.publishState('worker');await h.runtime.idle();assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,1);assert.ok(h.runtime.registry.get('orchestrator')!.transcript.some(m=>m.usage));
});
test('38.2 runtime: two objections leave owner question open; outside conditions never calls model',async t=>{
 const h=await setup(t,{review:'objection'}),q=question(h);await h.runtime.idle();assert.equal(h.provider.calls.length,4);assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,0);assert.equal(h.runtime.autopilotDecisionLedger().list().length,0);
 const other=await setup(t,{operations:['deny']});question(other);await other.runtime.idle();assert.equal(other.provider.calls.length,0);
});
test('38.2 runtime: no verified budget means no model; exhausted budget turns autopilot off durably',async t=>{
 const h=await setup(t,{quoted:false});question(h);await h.runtime.idle();assert.equal(h.provider.calls.length,0);assert.ok(h.runtime.journal.read({limit:0}).some(r=>r.origin==='autopilot-owner'&&r.text.includes('spend_unknown')));
 const low=await setup(t);await low.runtime.autopilotSet({project:low.dir,instance:low.runtime.project.trace.instanceId,on:true,until:'morning',revision:1,conditions:{operations:['answer_question'],maxSpendPercent:0}},OWNER);question(low);await low.runtime.idle();assert.equal(low.provider.calls.length,0);assert.equal(low.runtime.settings.autopilot().on,false);assert.ok(low.runtime.journal.read({limit:0}).some(r=>r.text.includes('spend_over_cap')));
});
test('38.2 budget: parallel reservations and restart count the cancelled upper bounds; absent quote fails closed',async t=>{
 const h=await harness(t),b=new AutopilotSpendBudget(h.dir,quotes),input={project:h.dir,generation:1,maxSpendPercent:0.015,calls:[{seat:'o',model:'m',purpose:'proposal' as const,round:1 as const}]};
 const outcomes=await Promise.allSettled([b.reserve(input),b.reserve(input)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);const one=outcomes.find(r=>r.status==='fulfilled');if(one?.status==='fulfilled')await one.value.close('owner');await assert.rejects(new AutopilotSpendBudget(h.dir,quotes).reserve(input),{code:'spend_over_cap'});await assert.rejects(new AutopilotSpendBudget(h.dir,async()=>[]).reserve({...input,generation:2}),{code:'spend_unknown'});
});
test('38.2 runtime: turning off while reviewer is answering rejects late agreement before owner API',async t=>{
 const h=await setup(t),gate=deferred<{text:string;sessionId:null}>(),old=h.provider.onRun!;
 h.provider.onRun=async(seat,prompt,ctx)=>prompt.includes('proposalHash: ')?gate.promise:old(seat,prompt,ctx);
 const q=question(h);await until(()=>h.provider.calls.some(c=>c.message.includes('proposalHash: ')));
 await h.runtime.autopilotSet({project:h.dir,instance:h.runtime.project.trace.instanceId,on:false,revision:1},OWNER);
 const request=h.provider.calls.find(c=>c.message.includes('proposalHash: '))!;
 gate.resolve({text:JSON.stringify({proposalHash:line(request.message,'proposalHash: '),verdict:'agree',reason:'поздно'}),sessionId:null});await h.runtime.idle();assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,0);assert.equal(h.runtime.autopilotDecisionLedger().list().length,0);
});
test('38.2 runtime: real approval deny uses same owner API and preserves until:reply; approve lacks typed effects and refuses',async t=>{
 const h=await setup(t,{operations:['deny']});const future=h.runtime.registry.get('worker')!.askApproval('Разрешить?','описание не полномочие');await h.runtime.idle();assert.equal(await future,false);assert.equal(h.runtime.autopilotDecisionLedger().list()[0]!.entry.operation,'deny');
 const other=await setup(t,{operations:['approve']});const pane=other.runtime.registry.get('worker')!;const pending=pane.askApproval('Безопасно','согласен');await other.runtime.idle();assert.equal(pane.approvals.size,1);assert.equal(other.runtime.autopilotDecisionLedger().list().length,0);assert.ok(other.runtime.journal.read({limit:0}).some(r=>r.text.includes('stop_checks_missing')));pane.denyApprovals();await pending;
});
test('38.2 runtime: unknown tooling refuses answer to an all-mode place; explanation cannot authorize external effects',async t=>{
 const h=await setup(t);h.runtime.registry.get('worker')!.mode='all';const q=question(h);await h.runtime.idle();assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,0);assert.equal(h.provider.calls.filter(c=>c.seat.id==='worker').length,0);assert.ok(h.runtime.journal.read({limit:0}).some(r=>r.text.includes('stop_checks_missing')));
});
test('38.2 runtime: waiting turn uses owner attempt API once, with the original instance in receipt',async t=>{
 const h=await setup(t,{operations:['stop_pane']});const old=h.provider.onRun!;h.provider.onRun=async(seat,prompt,ctx)=>{if(seat.id==='worker')throw new Error('stub transport failed');return old(seat,prompt,ctx)};
 h.runtime.chat({pane:'worker',message:'пробный ход',direct:true},OWNER);await h.runtime.idle();const row=h.runtime.autopilotDecisionLedger().list()[0]?.entry;assert.ok(row);assert.equal(row.state,'applied');assert.equal(row.operation,'stop_pane');if(row.state==='applied'){assert.equal(row.receipt.result.action,'skip');assert.equal(typeof row.receipt.result.turnInstanceId,'string');assert.equal(row.receipt.result.startedTurnInstanceId,undefined);assert.match(row.receipt.effectVersion,/^attempt:\d+$/)}assert.equal(h.runtime.waiting('worker'),null);assert.equal(h.provider.calls.filter(c=>c.seat.id==='worker').length,1);
});
test('38.2 runtime: model change while reviewer responds cannot start an unreserved model',async t=>{
 const h=await setup(t),gate=deferred<{text:string;sessionId:null}>(),old=h.provider.onRun!;h.provider.onRun=async(seat,prompt,ctx)=>prompt.includes('proposalHash: ')?gate.promise:old(seat,prompt,ctx);const q=question(h);await until(()=>h.provider.calls.some(c=>c.message.includes('proposalHash: ')));h.runtime.registry.get('worker')!.model='w2';const request=h.provider.calls.find(c=>c.message.includes('proposalHash: '))!;gate.resolve({text:JSON.stringify({proposalHash:line(request.message,'proposalHash: '),verdict:'agree',reason:'да'}),sessionId:null});await h.runtime.idle();assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,0);assert.ok(h.runtime.journal.read({limit:0}).some(r=>r.text.includes('spend_check_missing')));
});
test('38.2 runtime: applied receipt survives reopening the project without another model call or effect',async t=>{
 const h=await setup(t),q=question(h);await h.runtime.idle();const first=h.runtime.autopilotDecisionLedger().list()[0]!.entry,calls=h.provider.calls.length;await h.runtime.openProject(h.dir);await h.runtime.idle();const after=h.runtime.autopilotDecisionLedger().list();assert.equal(after.length,1);assert.deepEqual(after[0]!.entry,first);assert.equal(h.provider.calls.length,calls);assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,1);
});
test('38.2 runtime: closing a project cancels a council request without an owner effect',async t=>{
 const h=await setup(t),gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_seat,_prompt,ctx)=>{ctx.signal.addEventListener('abort',()=>gate.resolve({text:'поздний ответ',sessionId:null}),{once:true});return gate.promise};const q=question(h);await until(()=>h.provider.calls.length===1);const p=h.runtime.project;await h.runtime.closeProject();assert.equal(h.provider.calls[0]!.ctx.signal.aborted,true);assert.equal(p.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,0);
});
test('38.2 runtime: automatic retry preserves model binding and cannot call peer tools',async t=>{
 const h=await setup(t,{operations:['continue_pane']}),old=h.provider.onRun!;let attempts=0;
 h.provider.onRun=async(seat,prompt,ctx)=>{if(seat.id!=='worker')return old(seat,prompt,ctx);if(++attempts===1)throw Error('stub connection failed');assert.equal(seat.mode,'chat');assert.deepEqual(await ctx.tools.send({to:'reviewer',text:'forbidden'} as never),{ok:false,code:'autopilot_denied',error:'Консилиум может только вернуть решение'});assert.equal(await ctx.askApproval('разрешить','нет'),false);return {text:'повтор завершён',sessionId:null}};
 h.runtime.chat({pane:'worker',message:'повтори',direct:true},OWNER);await h.runtime.idle();assert.equal(attempts,2);assert.equal(h.runtime.autopilotDecisionLedger().list()[0]!.entry.state,'applied');assert.equal(h.runtime.waiting('worker'),null);
});
test('38.2 runtime: lost receipt is recovered after restart without repeating council or owner effect',async t=>{
 const h=await setup(t),ledger=h.runtime.autopilotDecisionLedger(),save=ledger.applied.bind(ledger);ledger.applied=async()=>{throw Error('stub lost receipt')};const q=question(h);await h.runtime.idle();assert.equal(ledger.list()[0]!.entry.state,'intent');assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,1);const calls=h.provider.calls.length;ledger.applied=save;await h.runtime.openProject(h.dir);await h.runtime.idle();assert.equal(h.runtime.autopilotDecisionLedger().list()[0]!.entry.state,'applied');assert.equal(h.provider.calls.length,calls);assert.equal(h.runtime.journal.repliesTo(q.seq).filter(r=>r.from==='owner').length,1);
});
test('38.2 budget: measured weekly points crossing cap are reported after the call; unknown estimates refuse',async t=>{
 const h=await harness(t);let percentUsed=20;const b=new AutopilotSpendBudget(h.dir,async calls=>calls.map(()=>({window:'claude:weekly:1',percentUsed,upperPercent:0.01,basis:'verified fixture'}))),call={seat:'o',model:'m',vendor:'claude',purpose:'proposal' as const,round:1 as const},lease=await b.reserve({project:h.dir,generation:1,maxSpendPercent:1,calls:[call]});await lease.use(call);percentUsed=22;await assert.rejects(lease.close('owner'),{code:'spend_over_cap'});await assert.rejects(new AutopilotSpendBudget(h.dir,async calls=>calls.map(()=>({window:'claude:weekly:1',percentUsed:20,upperPercent:0,basis:'unknown'}))).reserve({project:h.dir,generation:2,maxSpendPercent:5,calls:[call]}),{code:'spend_unknown'});
});

test('38.2 runtime: role promotion cannot bypass effect budget and typed tool checks',async t=>{
 const h=await setup(t),parameters={role:'orchestrator',chat:'room',project:h.dir,revision:0,documents:[],createProject:false},source=autopilotAssignmentSource(parameters),state=await h.runtime.autopilotStatus(),capability={id:'bound',operation:'assign_role' as const,parameters};
 assert.throws(()=>new RuntimeAutopilotSafety(h.runtime).check({issue:{project:h.dir,generation:state.generation,permission:{generation:state.generation,revision:state.revision,conditions:state.conditions,stopCodes:state.conditions.stopCases},source,capabilities:[capability]},capability,proposal:{requestHash:'x',capability:'bound',answer:null,reason:'safe description'},snapshot:{generation:state.generation,revision:state.revision,conditions:state.conditions,stopCodes:state.conditions.stopCases}}),{code:'stop_checks_missing'});assert.equal(h.provider.calls.length,0);
});
