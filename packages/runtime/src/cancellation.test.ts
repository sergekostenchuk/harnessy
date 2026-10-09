import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProviderError} from '@harnessy/providers';
import {RuntimeError} from './index.ts';
import {harness,collect,until,deferred,OWNER,completedActions} from './test-helpers.ts';

for(const reason of ['interrupt','halt','stop','reset','close','switch'])test('12/13/32/42/47: early cancellation via '+reason+' revokes scope, denies approval, keeps busy until cleanup',async t=>{
 const cleanup=deferred(),begun=deferred(),aborted=deferred();let asksCancelled=0,interrupted=0,approval!:Promise<boolean>;
 const h=await harness(t,{actions:{...completedActions,cancelAsks(){asksCancelled++}}}),{runtime:r,provider:f}=h;const p=r.registry.get('worker')!,{events}=collect(r);
 f.onReset=async()=>{cleanup.resolve()};
 f.onRun=async(_seat,_text,ctx)=>{ctx.registerProcessToken('token');ctx.session('preparing');ctx.setHandle({async interrupt(){assert.equal(p.approvals.size,0);assert.equal(ctx.signal.aborted,true);interrupted++},async steer(){}});approval=ctx.askApproval('разрешить?','команда');ctx.signal.addEventListener('abort',()=>aborted.resolve(),{once:true});begun.resolve();await aborted.promise;await cleanup.promise;throw new ProviderError('cancelled','aborted')};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await begun.promise;const id=[...p.approvals.keys()][0]!;const oldScope=r.validateBridge('worker','token');
 if(reason==='interrupt')r.interrupt('worker',OWNER);
 if(reason==='halt')await r.halt(true,OWNER);
 if(reason==='stop')r.postOwner({to:'worker',kind:'stop',text:'стоп'},OWNER);
 if(reason==='reset')await r.resetVendor('claude');
 if(reason==='close')await r.close();
 if(reason==='switch'){const dir=mkdtempSync(join(tmpdir(),'harnessy-switch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));await r.openProject(dir)}
 assert.equal(await approval,false);assert.equal(asksCancelled,1);assert.equal(interrupted,1);assert.throws(()=>r.scopes.assert(oldScope),(e:unknown)=>e instanceof RuntimeError&&e.code==='turn_ended');
 if(!['reset','close','switch'].includes(reason)){assert.equal(p.busy,true);assert.deepEqual(r.approve('worker',id,'allow',OWNER),{ok:false,error:'вопрос уже закрыт'});cleanup.resolve();await r.idle();assert.equal(p.busy,false);assert.equal(r.journal.cursors.worker??0,0);assert.equal(events.filter(e=>e.pane==='worker'&&['error','done'].includes(e.type)).length,1);assert.equal(events.find(e=>e.type==='error')!.message,'ход отменён')}
 else cleanup.resolve()
});

for(const outcome of ['cancelled','interrupted','done'])test('42/47: stop after modelStarted accounts for '+outcome+' once and advances delivery',async t=>{
 const {runtime:r,provider:f}=await harness(t),release=deferred(),begun=deferred(),{events}=collect(r);
 f.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.setHandle({async interrupt(){},async steer(){}});begun.resolve();await release.promise;if(outcome==='cancelled')throw new ProviderError('cancelled','cancel');ctx.publish({type:'done',model:seat.model,sessionId:'s1',durationMs:8,usage:{input:2,output:1,cacheRead:null}});return {text:outcome==='done'?'частичный ответ':'',sessionId:'s1',...(outcome==='interrupted'?{interrupted:true}:{})}};
 const rec=r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await begun.promise;r.interrupt('worker',OWNER);release.resolve();await r.idle();const terminal=events.filter(e=>e.pane==='worker'&&['done','error'].includes(e.type));assert.equal(terminal.length,1);assert.equal(terminal[0]!.type,'done');assert.equal(terminal[0]!.interrupted,true);assert.equal(r.journal.cursors.worker,rec.seq);assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.runtime.interrupted,true);assert.ok(r.journal.read({limit:0}).some(v=>v.text==='ход прерван владельцем после записи #'+rec.seq));await r.kick('worker');assert.equal(f.calls.length,1)
});

test('47: direct turn without incoming records gets exact interrupted note and durable empty ai',async t=>{
 const {runtime:r,provider:f}=await harness(t),started=deferred(),release=deferred();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();started.resolve();await release.promise;return {text:'',sessionId:null}};
 const work=r.runTurn('worker','вводная');await started.promise;r.interrupt('worker',OWNER);release.resolve();await work;await r.idle();assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.text,'');assert.ok(r.journal.read({limit:0}).some(v=>v.text==='ход прерван владельцем'))
});

test('42/49: controllable 30s deadline resets vendor once; late old finally cannot clear new turn',async t=>{
 const h=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}'}),{runtime:r,provider:f,clock}=h;
 const old=[deferred<{text:string;sessionId:string}>(),deferred<{text:string;sessionId:string}>()],resetCleanup=deferred(),fresh=deferred<{text:string;sessionId:string}>();
 f.onRun=async(seat,_m,ctx)=>{ctx.modelStarted?.();ctx.registerProcessToken('token-'+f.calls.length);ctx.setHandle({async interrupt(){},async steer(){}});return f.calls.length<=2?old[seat.id==='worker'?0:1]!.promise:fresh.promise};f.onReset=()=>resetCleanup.promise;
 r.postOwner({to:'worker',kind:'task',text:'один'},OWNER);r.postOwner({to:'peer',kind:'task',text:'два'},OWNER);await until(()=>f.calls.length===2);r.interrupt('worker',OWNER);r.interrupt('peer',OWNER);clock.advance(29_999);assert.equal(f.resets,0);clock.advance(1);assert.equal(f.resets,1);
 const a=r.resetVendor('claude'),b=r.resetVendor('claude');assert.equal(a,b);assert.throws(()=>r.validateBridge('worker','token-1'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid');assert.equal(r.registry.get('worker')!.busy,true);
 resetCleanup.resolve();await a;await r.idle();assert.equal(f.resets,1);assert.equal(r.registry.get('worker')!.busy,false);
 r.postOwner({to:'worker',kind:'task',text:'новый'},OWNER);await until(()=>f.calls.length===3);const scope=r.validateBridge('worker','token-3');old[0]!.resolve({text:'поздний старый',sessionId:'old'});old[1]!.resolve({text:'старый сосед',sessionId:'old'});await until(()=>r.registry.get('worker')!.busy);assert.equal(r.validateBridge('worker','token-3'),scope);assert.notEqual(r.registry.get('worker')!.sessionId,'old');fresh.resolve({text:'новый ответ',sessionId:'new'});await r.idle();assert.equal(r.registry.get('worker')!.sessionId,'new')
});

test('12: halt prevents all launch paths; unhalt resumes queue and persists exact on/ts/by',async t=>{
 const {runtime:r,provider:f,dir,clock}=await harness(t);await r.halt(true,OWNER);r.postOwner({to:'worker',kind:'task',text:'ждёт'},OWNER);await r.idle();assert.equal(f.calls.length,0);await assert.rejects(r.runTurn('worker','выжимка'),(e:unknown)=>e instanceof RuntimeError&&e.code==='halted');
 const {readFileSync}=await import('node:fs');assert.equal(readFileSync(join(dir,'.harness','state','halt.json'),'utf8'),'{"on": true, "ts": '+Math.floor(clock.now()/1000)+', "by": "владелец"}');await r.halt(false,OWNER);await r.idle();assert.equal(f.calls.length,1)
});
