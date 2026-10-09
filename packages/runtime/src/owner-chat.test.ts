import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeError} from './index.ts';
import {harness,OWNER,deferred,until} from './test-helpers.ts';
const seats='  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read, digest: false}\n  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: false}';
test('27/50/55: trusted owner chat needs explicit direct; room/orchestrator/no orchestrator are exceptions',async t=>{
 const {runtime:r,provider:f}=await harness(t,{seats});await r.halt(true,OWNER);
 assert.throws(()=>r.chat({pane:'worker',message:'напрямую',from:'owner',by:'owner',mandate:1},OWNER),e=>e instanceof RuntimeError&&e.code==='direct_required'&&e.fields.needDirect===true&&e.message==='«воркер» — не оркестратор: обращение напрямую требует явного подтверждения');
 const direct=r.chat({pane:'worker',message:'  задача  ',direct:true,cwd:'/somewhere',from:'harness',kind:'task'},OWNER);const record=r.journal.get(direct.seq)!;assert.equal(record.from,'owner');assert.equal(record.origin,'direct');assert.equal(record.text,'задача');assert.equal(record.thread,'T1');assert.equal(r.registry.get('worker')!.cwd,r.project.dir);
 r.chat({pane:'orchestrator',message:'обычный'},OWNER);r.roomSet({model:'w1'},OWNER);r.chat({pane:'room',message:'без роли'},OWNER);assert.equal(r.journal.read({limit:0}).length,3);assert.equal(f.calls.length,0);
 assert.throws(()=>r.chat({pane:'worker',message:'подмена',direct:true,from:'owner',mandate:99},{seat:'worker',trust:'agent'}),e=>e instanceof RuntimeError&&e.code==='policy_denied');
 const h2=await harness(t);h2.runtime.chat({pane:'worker',message:'нет оркестратора'},OWNER);await h2.runtime.idle();assert.equal(h2.provider.calls.length,1);
});
test('50: owner kind/text/pane errors exact; stop uses common cancellation and consumes queue once',async t=>{
 const {runtime:r,provider:f}=await harness(t);for(const [input,text] of [[{pane:'missing',message:'x'},'нет окна'],[{pane:'worker',message:''},'пустое сообщение'],[{pane:'worker',message:'x',kind:'report'},'владелец пишет виды task, question, note, stop, resume, decision; получено report']] as const)assert.throws(()=>r.chat(input,OWNER),e=>e instanceof RuntimeError&&e.message===text);
 const gate=deferred<{text:string;sessionId:null}>();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};r.chat({pane:'worker',message:'начать'},OWNER);await until(()=>r.registry.get('worker')!.busy);const stopped=r.chat({pane:'worker',message:'стоп',kind:'stop'},OWNER);assert.equal(stopped.queued,true);assert.equal(f.calls[0]!.ctx.signal.aborted,true);gate.resolve({text:'остановлено',sessionId:null});await r.idle();assert.equal(f.calls.length,1);assert.equal(r.journal.cursors.worker,stopped.seq);assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.runtime.interrupted,true);
});
