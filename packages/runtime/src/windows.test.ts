import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderError,type TurnContext} from '@harnessy/providers';
import {createRuntime,RuntimeError,Runtime,diskIO,type RuntimeActions,type StateIO} from './index.ts';
import {harness,OWNER,until,deferred,completedActions,collect,FakeProvider} from './test-helpers.ts';

test('44: late callbacks from failed attempt cannot alter retry, session or terminal',async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred<{text:string;sessionId:string}>();let old!:TurnContext;r.registry.get('worker')!.sessionId='old';const {events}=collect(r);
 f.onRun=async(_seat,_text,ctx)=>{if(f.calls.length===1){old=ctx;ctx.publish({type:'error',text:'нет сессии'});throw new ProviderError('session_missing','нет сессии')}ctx.modelStarted?.();ctx.session('new');return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>f.calls.length===2);old.publish({type:'delta',text:'поздняя дельта'});old.publish({type:'error',text:'поздняя ошибка'});old.session('wrong');old.setHandle({async interrupt(){throw Error('wrong')},async steer(){}});assert.equal(r.registry.get('worker')!.sessionId,'new');gate.resolve({text:'ответ',sessionId:'new'});await r.idle();assert.equal(events.some(e=>e.text==='поздняя дельта'||e.message==='поздняя ошибка'),false);assert.equal(events.filter(e=>e.pane==='worker'&&['done','error'].includes(e.type)).length,1)
});

test('44/47: cancellation during persisted session clear prevents retry and keeps queue',async t=>{
 let runtime!:Runtime,armed=false;const io:StateIO={read:diskIO.read,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('chats.json')&&Object.values(JSON.parse(text).chats as Record<string,{sessionId:string|null}>).some(c=>c.sessionId===null)){armed=false;runtime.interrupt('worker',OWNER)}}};
 const h=await harness(t,{deps:{stateIO:io}});runtime=h.runtime;runtime.registry.get('worker')!.sessionId='old';armed=true;h.provider.onRun=async()=>{throw new ProviderError('session_missing','нет сессии')};const {events}=collect(runtime);runtime.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await runtime.idle();assert.equal(h.provider.calls.length,1);assert.equal(runtime.journal.pendingFor('worker').length,1);assert.equal(events.filter(e=>e.pane==='worker'&&['done','error'].includes(e.type)).length,1);assert.equal(events.find(e=>e.type==='error')!.message,'ход отменён')
});

test('26/49: idle process token reused for next scope; vendor switch and project close invalidate it',async t=>{
 const codex=new FakeProvider('codex'),claude=new FakeProvider(),{runtime:r}=await harness(t,{deps:{providers:{claude,codex},models:{claude:[{id:'w1'},{id:'w2'}],codex:[{id:'c1'},{id:'c2'}]}}});const gates=[deferred<{text:string;sessionId:string}>(),deferred<{text:string;sessionId:string}>()];
 claude.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();if(claude.calls.length===1)ctx.registerProcessToken('same-process');return gates[claude.calls.length-1]!.promise};
 r.postOwner({to:'worker',kind:'task',text:'один'},OWNER);await until(()=>claude.calls.length===1);const first=r.validateBridge('worker','same-process');gates[0]!.resolve({text:'ответ',sessionId:'s1'});await r.idle();assert.throws(()=>r.validateBridge('worker','same-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='turn_ended');r.postOwner({to:'worker',kind:'task',text:'два'},OWNER);await until(()=>claude.calls.length===2);assert.notEqual(r.validateBridge('worker','same-process'),first);gates[1]!.resolve({text:'ответ',sessionId:'s1'});await r.idle();r.paneSet('worker',{model:'c2'},OWNER);await r.idle();assert.throws(()=>r.validateBridge('worker','same-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid');await r.close();assert.throws(()=>r.validateBridge('worker','same-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid')
});

test('1: policy reload record precedes owner task and thread uses actual task seq',async t=>{
 const {runtime:r,dir}=await harness(t);writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 8\nroutes: []\nobserve: {}\n');const task=r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);assert.equal(task.thread,'T'+task.seq);assert.equal(r.journal.get(task.seq-1)!.kind,'policy');await r.idle();assert.equal(r.journal.read({limit:0,kinds:['policy']}).length,1)
});

test('12/32: failed halt persistence still stops live turn and blocks launches',async t=>{
 const io:StateIO={read:diskIO.read,write(path,text){if(path.endsWith('halt.json'))throw Error('диск недоступен');diskIO.write(path,text)}};const h=await harness(t,{deps:{stateIO:io}}),{runtime:r,provider:f}=h,gate=deferred<{text:string;sessionId:string}>();let signal!:AbortSignal;
 f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();signal=ctx.signal;return gate.promise};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>f.calls.length===1);await assert.rejects(r.halt(true,OWNER),/диск недоступен/);assert.equal(r.halted,true);assert.equal(signal.aborted,true);gate.resolve({text:'часть',sessionId:'s1'});await r.idle();r.postOwner({to:'worker',kind:'task',text:'следующее'},OWNER);await r.idle();assert.equal(f.calls.length,1)
});

test('42: synchronous interrupt failure still arms 30s reset and frees busy after cleanup',async t=>{
 const {runtime:r,provider:f,clock}=await harness(t);f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();ctx.setHandle({interrupt(){throw Error('сломанный handle')},async steer(){}});return new Promise(()=>{})};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>f.calls.length===1);assert.deepEqual(r.interrupt('worker',OWNER),{ok:true});clock.advance(30_000);await r.idle();assert.equal(f.resets,1);assert.equal(r.registry.get('worker')!.busy,false)
});

test('48: missing each mandatory action port is typed failure before project mutation',async t=>{
 const h=await harness(t);for(const key of ['ask','merge','assignRole','afterTurn','restorePendingAcks','cancelAsks'] as const){const actions={...completedActions};delete (actions as Partial<RuntimeActions>)[key];await assert.rejects(createRuntime(h.deps,actions),(e:unknown)=>e instanceof RuntimeError&&e.code==='actions_required')}
});

test('33: all owner entry points reject agent initiator before protected effect',async t=>{
 const {runtime:r,provider:f}=await harness(t),agent={seat:'worker',trust:'agent'} as const;
 assert.throws(()=>r.postOwner({to:'worker',kind:'task',text:'подделка'},agent));assert.throws(()=>r.interrupt('worker',agent));assert.throws(()=>r.approve('worker','x','allow',agent));assert.throws(()=>r.paneSet('worker',{mode:'all'},agent));await assert.rejects(r.halt(false,agent));await assert.rejects(r.steer('worker','подделка',agent));await assert.rejects(r.openSession('worker','x',agent));await assert.rejects(r.setRoute('claude',{route:'direct'},agent));assert.equal(r.journal.lastSeq,0);assert.equal(f.calls.length,0);assert.equal(r.registry.get('worker')!.mode,'read')
});

for(const started of [false,true])test('10/32/46: project close waits runtime cleanup; prelaunch marker cleared, possible launch retained: '+started,async t=>{
 const h=await harness(t),{runtime:r,provider:f}=h;f.onRun=async(_s,_m,ctx)=>{if(started)ctx.modelStarted?.();return new Promise(()=>{})};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>f.calls.length===1);await r.close();const attempts=JSON.parse(readFileSync(join(h.dir,'.harness','state','attempts.json'),'utf8'));assert.equal(!!attempts.worker,started);f.onRun=null;await r.openProject(h.dir);await r.idle();assert.equal(f.calls.length,started?1:2);assert.equal(r.registry.get('worker')!.status,started?'uncertain':'idle')
});

test('10/23: persisted cwd is not a restoration capability; legacy missing digest becomes false',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os');const outside=mkdtempSync(join(tmpdir(),'harnessy-forged-cwd-'));t.after(()=>rmSync(outside,{recursive:true,force:true}));const h=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: true}',before:dir=>writeFileSync(join(dir,'.harness','state','panes.json'),JSON.stringify({worker:{model:'w1',cwd:outside,mode:'read'}}))});assert.equal(h.runtime.registry.get('worker')!.cwd,h.dir);assert.equal(h.runtime.registry.get('worker')!.digest,false)
});

test('48: active relayDepth snapshot does not change when a port stages depth of the next batch',async t=>{let depth=-1;const actions:RuntimeActions={...completedActions,async ask(_a,ctx){depth=ctx.relayDepth;return {ok:true,reply:'ответ',seq:1}}};const {runtime:r,provider:f}=await harness(t,{actions});const p=r.registry.get('worker')!;p.relayDepth=2;f.onRun=async(_s,_m,ctx)=>{assert.equal(ctx.relayDepth,2);p.relayDepth=3;await ctx.tools.ask({to:'peer',text:'вопрос'});return {text:'готово',sessionId:null}};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.equal(depth,2);assert.equal(p.relayDepth,3)});

test('37: runtime itself loads default catalog metadata when no catalog injected',async t=>{const h=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: "", mode: read}'});await h.runtime.close();const {models:_,...deps}=h.deps,f=new FakeProvider(),r=await createRuntime({...deps,providers:{claude:f}},completedActions);t.after(()=>r.close());assert.equal(f.modelCalls,1);assert.equal(f.calls.length,0);assert.equal(r.registry.get('worker')!.model,'w1')});
