import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutopilotDecisionLedger,autopilotDecisionHash,autopilotDecisionId,type AutopilotDecisionBase} from '@harnessy/runtime';
import {call,fixture,sse,until} from './test-helpers.ts';

const question={id:'journal:14',kind:'question',text:'Продолжать проверку?'};
const council={orchestrator:{seat:'lead',model:'claude-1',role:'orchestrator' as const},reviewer:{seat:'review',model:'codex-1',role:'reviewer' as const}};
function decision(project:string):AutopilotDecisionBase {
 const issueHash=autopilotDecisionHash({project,source:question,generation:3,revision:1}),parameters={pane:'worker',replyTo:14},capability={id:autopilotDecisionHash({operation:'answer_question',parameters}),operation:'answer_question',parameters};
 const proposal={requestHash:issueHash,capability:capability.id,answer:'Да, после проверки',reason:'Оба места подтвердили обратимость ответа'};
 return {decisionId:autopilotDecisionId(project,question,proposal,3),issueHash,proposalHash:autopilotDecisionHash(proposal),generation:3,operation:'answer_question',capability,proposal,round:1,question,council};
}
const unknownCost={currency:'USD' as const,amount:null,status:'unavailable' as const};

test('TS-38.3: intent precedes effect, receipt appends once, persists across restart and publishes owner event',async t=>{
 const h=await fixture(t),ledger=h.runtime.autopilotDecisionLedger(),base=decision(h.dir),stream=await sse(h.api,'owner');t.after(()=>stream.close());
 await assert.rejects(ledger.applied({...base,cost:unknownCost,receipt:{result:{ok:true},effectVersion:'v1'}}),{code:'decision_invalid'});
 await Promise.all([ledger.intent({...base,cost:unknownCost}),ledger.intent({...base,cost:unknownCost})]);
 await ledger.applied({...base,cost:{currency:'USD',amount:0.04,status:'measured'},receipt:{result:{ok:true},effectVersion:'v1'}});
 await ledger.applied({...base,cost:{currency:'USD',amount:0.04,status:'measured'},receipt:{result:{ok:true},effectVersion:'v1'}});
 const lines=readFileSync(ledger.path,'utf8').trim().split('\n');assert.equal(lines.length,2,'duplicate attempts do not append');
 const response=await call(h.api,'/api/autopilot/decisions');assert.equal(response.status,200);assert.equal(response.body.project,h.dir);assert.equal(response.body.decisions.length,1);assert.equal(response.body.decisions[0].entry.state,'applied');assert.equal(response.body.decisions[0].entry.question.id,question.id);assert.equal(response.body.decisions[0].entry.cost.amount,0.04);
 await until(()=>stream.frames.some(frame=>frame.type==='autopilotDecision'&&frame.state==='applied'&&frame.decisionId===base.decisionId));
 await h.runtime.openProject(h.dir);assert.equal(h.runtime.autopilotDecisionLedger().get(base.decisionId)?.state,'applied');
 await assert.rejects(h.runtime.autopilotDecisionLedger().applied({...base,cost:{currency:'USD',amount:1,status:'measured'},receipt:{result:{ok:true},effectVersion:'v2'}}),{code:'decision_invalid'});
});

test('TS-38.3: owner-only read and typed cancel refusal leave the immutable decision untouched',async t=>{
 const h=await fixture(t),ledger=h.runtime.autopilotDecisionLedger(),base=decision(h.dir);
 await ledger.intent({...base,cost:unknownCost});await ledger.applied({...base,cost:unknownCost,receipt:{result:{ok:true},effectVersion:'v1'}});
 const before=readFileSync(ledger.path,'utf8');
 const forged=await call(h.api,'/api/autopilot/decisions',{headers:{'X-Pane-Token':'a'.repeat(64)}});assert.equal(forged.status,403);
 const wrong=await call(h.api,'/api/autopilot/decisions/'+base.decisionId+'/cancel',{body:{project:'/foreign'}});assert.equal(wrong.status,409);assert.equal(wrong.body.code,'project_changed');
 const refused=await call(h.api,'/api/autopilot/decisions/'+base.decisionId+'/cancel',{body:{project:h.dir}});assert.equal(refused.status,501);assert.equal(refused.body.code,'cancel_unavailable');
 assert.equal(readFileSync(ledger.path,'utf8'),before);
});

test('TS-38.3: forged id and edited journal line fail closed',async t=>{
 const h=await fixture(t),ledger=h.runtime.autopilotDecisionLedger(),base=decision(h.dir);
 await assert.rejects(ledger.intent({...base,decisionId:'b'.repeat(64),cost:unknownCost}),{code:'decision_invalid'});
 await ledger.intent({...base,cost:unknownCost});
 const raw=readFileSync(ledger.path,'utf8');writeFileSync(ledger.path,raw.replace('Продолжать проверку?','Подменённый вопрос'));
 const response=await call(h.api,'/api/autopilot/decisions');assert.equal(response.status,409);assert.equal(response.body.code,'decision_invalid');
});

test('TS-38.3 r2: parallel different proposals for one issue leave one readable intent',async t=>{
 const h=await fixture(t),ledger=h.runtime.autopilotDecisionLedger(),first=decision(h.dir),secondProposal={...first.proposal,answer:'Нет, остановить до утра'},second={...first,proposal:secondProposal,proposalHash:autopilotDecisionHash(secondProposal),decisionId:autopilotDecisionId(h.dir,question,secondProposal,first.generation)};
 const results=await Promise.allSettled([ledger.intent({...first,cost:unknownCost}),ledger.intent({...second,cost:unknownCost})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const rejected=results.find(result=>result.status==='rejected');assert.equal(rejected?.status,'rejected');assert.equal((rejected as PromiseRejectedResult).reason.code,'decision_conflict');
 const listed=await call(h.api,'/api/autopilot/decisions');assert.equal(listed.status,200,listed.text);assert.equal(listed.body.decisions.length,1);assert.equal(listed.body.decisions[0].entry.state,'intent');
 assert.equal(readFileSync(ledger.path,'utf8').trim().split('\n').length,1);
});

test('TS-38.3: missing cost and linked project state cannot masquerade as a decision journal',async t=>{
 const project=mkdtempSync(join(tmpdir(),'harnessy-decisions-')),outside=mkdtempSync(join(tmpdir(),'harnessy-decisions-outside-'));t.after(()=>{rmSync(project,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true})});
 const base=decision(project),ledger=new AutopilotDecisionLedger(project);
 await assert.rejects(ledger.intent({...base,cost:undefined as never}),{code:'decision_invalid'});
 symlinkSync(outside,join(project,'.harness'));
 await assert.rejects(ledger.intent({...base,cost:unknownCost}),{code:'decision_invalid'});
 assert.equal(existsSync(join(outside,'state','autopilot-decisions.ndjson')),false);
});
