import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {Journal} from '@harnessy/journal';
import {ProviderError,type TurnContext} from '@harnessy/providers';
import {createRuntime,RuntimeError,type RuntimeActions} from './index.ts';
import {harness,OWNER,collect,until,deferred,completedActions,FakeProvider} from './test-helpers.ts';
import {failedActions} from './test-helpers.ts';
const terminals=(events:{type:string;[k:string]:unknown}[])=>events.filter(e=>['done','error'].includes(e.type)&&e.pane==='worker');

test('1/2: owner task gets Tseq; busy queue is batched; one terminal per turn',async t=>{
 const h=await harness(t),{runtime:r,provider:f}=h,gate=deferred<{text:string;sessionId:string}>(),started=deferred();
 f.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();if(f.calls.length===1){started.resolve();return gate.promise}return {text:'следующий',sessionId:'s1'}};
 const {events}=collect(r);const first=r.postOwner({to:'worker',kind:'task',text:'первое'},OWNER);assert.equal(first.thread,'T1');await started.promise;
 r.postOwner({to:'worker',kind:'task',text:'второе'},OWNER);r.postOwner({to:'worker',kind:'question',text:'третье'},OWNER);assert.equal(f.calls.length,1);assert.equal(r.journal.pendingFor('worker').length,3);
 gate.resolve({text:'ответ',sessionId:'s1'});await r.idle();assert.equal(f.calls.length,2);assert.match(f.calls[1]!.message,/Входящие записи: 2/);assert.match(f.calls[1]!.message,/второе/);assert.match(f.calls[1]!.message,/третье/);
 assert.equal(r.journal.cursors.worker,3);assert.equal(r.registry.get('worker')!.busy,false);assert.equal(terminals(events).length,2);assert.equal(r.registry.get('worker')!.transcript.filter(m=>m.role==='ai').length,2);assert.equal(existsSync(join(h.dir,'projects.json')),false)
});

test('11/29/37: failed turn rolls back only inbox; carry and digest remain for retry; one normalized error',async t=>{
 const h=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: true}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}'}),{runtime:r,provider:f}=h;
 const p=r.registry.get('worker')!;p.carry='старый разговор';p.transcript.push({role:'ai',text:'раньше',ts:0});r.registry.get('peer')!.record('ai','соседнее');
 const policy=join(h.dir,'.harness','comms-policy.yaml');writeFileSync(policy,'version: 2\nroutes: []\nobserve: {executor: "*"}\n');
 f.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();p.record('me','вмешательство, сохранить');ctx.publish({type:'error',text:'ошибка модели'});throw new ProviderError('turn_failed','ошибка модели')};
 const {events}=collect(r);r.postOwner({to:'worker',kind:'task',text:'задание'},OWNER);await r.idle();assert.deepEqual(p.transcript.map(m=>m.text),['раньше','вмешательство, сохранить']);assert.equal(p.carry,'старый разговор');assert.deepEqual(p.seen,{});assert.equal(r.journal.pendingFor('worker').length,1);assert.equal(terminals(events).length,1);assert.equal(terminals(events)[0]!.message,'ошибка модели');assert.ok(events.some(e=>e.type==='note'&&String(e.text).startsWith('1 запись остались')));
 // TS-07: сообщение пополняет очередь; повтор — только по отдельному решению владельца.
 f.onRun=null;assert.equal(p.status,'uncertain');await r.kick('worker');assert.equal(f.calls.length,1);
 r.postOwner({to:'worker',kind:'task',text:'повтори'},OWNER);await r.idle();assert.equal(f.calls.length,1);await r.attempt('worker',{project:h.dir,turnInstanceId:r.waiting('worker')!.turnInstanceId,action:'retry'},OWNER);await r.idle();assert.equal(f.calls.length,2);assert.match(f.calls[1]!.message,/старый разговор/);assert.match(f.calls[1]!.message,/соседнее/);assert.match(f.calls[1]!.message,/задание/);assert.equal(p.carry,'');assert.equal(p.seen.peer,1);assert.equal(r.journal.pendingFor('worker').length,0)
});

test('38: missing provider is typed, leaves queue and releases pane',async t=>{
 const {runtime:r}=await harness(t,{deps:{providers:{}}}),{events}=collect(r);r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.equal(r.journal.pendingFor('worker').length,1);assert.equal(r.registry.get('worker')!.busy,false);assert.equal(terminals(events).length,1);assert.equal(terminals(events)[0]!.message,'нет провайдера: claude');assert.equal(terminals(events)[0]!.code,'no_provider')
});

for(const [name,error,code] of [
 ['ordinary Error',new Error('сбой записи'),'internal'],
 ['provider error',new ProviderError('transport_lost','транспорт потерян'),'internal'],
 ['RuntimeError',new RuntimeError('recovering','местные действия не завершены'),'recovering']
] as const)test('75: report keeps a string code for '+name,async t=>{
 const {runtime:r,provider:f}=await harness(t),{events}=collect(r);f.onRun=async()=>{throw error};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();
 const failures=terminals(events);assert.equal(failures.length,1);assert.equal(failures[0]!.code,code);assert.equal(failures[0]!.message,error.message)
});

for(const bothFail of [false,true])test('38/44: session_missing retries once, one final terminal; bothFail='+bothFail,async t=>{
 const {runtime:r,provider:f,dir}=await harness(t),p=r.registry.get('worker')!;p.sessionId='old';p.carry='перенос';p.seen={x:2};
 f.onRun=async(seat,_text,ctx)=>{if(f.calls.length===1){assert.equal(seat.sessionId,'old');ctx.publish({type:'error',text:'нет сессии'});throw new ProviderError('session_missing','нет сессии','old')}
 assert.equal(seat.sessionId,null);assert.equal(JSON.parse(readFileSync(join(dir,'.harness','state','panes.json'),'utf8')).worker.sessionId,null);if(bothFail){ctx.publish({type:'error',text:'другая ошибка'});throw new ProviderError('turn_failed','другая ошибка')}ctx.modelStarted?.();ctx.publish({type:'done',sessionId:'new',model:seat.model,durationMs:2,usage:{input:null,output:null,cacheRead:null}});return {text:'готово',sessionId:'new'}};
 const {events}=collect(r);r.postOwner({to:'worker',kind:'task',text:'задание'},OWNER);await r.idle();assert.equal(f.calls.length,2);assert.equal(f.calls[0]!.message,f.calls[1]!.message);assert.equal(terminals(events).length,1);assert.equal(terminals(events)[0]!.type,bothFail?'error':'done');assert.equal(r.journal.pendingFor('worker').length,bothFail?1:0);assert.ok(events.some(e=>e.type==='note'&&e.text==='сессия модели не найдена — начат новый разговор'))
});

test('48: unavailable port leaves effects durable; real port completes once after restart without model',async t=>{
 const {runtime:r,deps,dir}=await harness(t,{actions:failedActions});r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.equal(r.journal.pendingFor('worker').length,0);assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.runtime.effectsPending,true);
 await r.close();const provider=new FakeProvider();let effects=0;const actions={...completedActions,async afterTurn(){effects++;return 'completed' as const}};const resumed=await createRuntime({...deps,providers:{claude:provider}},actions);t.after(()=>resumed.close());await resumed.idle();await resumed.kick('worker');assert.equal(provider.calls.length,0);assert.equal(effects,1);assert.equal(resumed.project.state.results(resumed.registry.get('worker')!)[0]!.runtime.effectsPending,false);assert.equal(JSON.parse(readFileSync(join(dir,'.harness','state','attempts.json'),'utf8')).worker,undefined)
});

test('26/33/48: immutable scope/records, process token survives idle, stale tools and foreign token refuse',async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred<{text:string;sessionId:string}>(),begun=deferred();let ctx!:TurnContext;
 f.onRun=async(_seat,_text,c)=>{ctx=c;c.modelStarted?.();c.registerProcessToken('secret-process');begun.resolve();return gate.promise};r.postOwner({to:'worker',kind:'task',text:'поручение'},OWNER);await begun.promise;
 const scope=r.validateBridge('worker','secret-process');assert.equal(Object.isFrozen(scope),true);assert.throws(()=>r.validateBridge('other','secret-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid');assert.throws(()=>r.validateBridge('worker','x'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid');
 const forged={...scope};assert.throws(()=>r.toolsFor(forged),(e:unknown)=>e instanceof RuntimeError&&e.code==='turn_ended');
 gate.resolve({text:'ответ',sessionId:'s1'});await r.idle();assert.throws(()=>r.validateBridge('worker','secret-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='turn_ended');const late=await ctx.tools.send({to:'owner',kind:'status',text:'поздно'});assert.equal(late.ok,false);assert.equal(!late.ok&&late.code,'turn_ended');ctx.revokeProcessToken('secret-process');assert.throws(()=>r.validateBridge('worker','secret-process'),(e:unknown)=>e instanceof RuntimeError&&e.code==='token_invalid')
});

test('33: ask action receives a frozen scope and rechecks it after await',async t=>{
 const gate=deferred(),inAction=deferred();let effect=0;
 const actions:RuntimeActions={...completedActions,async ask(_args,ctx){assert.equal(Object.isFrozen(ctx.turnRecords),true);assert.equal(Object.isFrozen(ctx.turnRecords[0]!.to),true);assert.throws(()=>{(ctx.turnRecords as unknown as unknown[]).push({from:'owner'})});inAction.resolve();await gate.promise;ctx.assertActive();effect++;return {ok:true,reply:'ответ',seq:1}}};
 const {runtime:r,provider:f}=await harness(t,{actions});let result:unknown;
 f.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();result=await ctx.tools.ask({to:'peer',text:'вопрос'});return {text:'ответ',sessionId:'s1'}};
 r.postOwner({to:'worker',kind:'task',text:'поручение'},OWNER);await inAction.promise;r.interrupt('worker',OWNER);gate.resolve();await r.idle();assert.equal(effect,0);assert.deepEqual(result,{ok:false,code:'turn_ended',error:'Ответа нет: ход не активен'})
});

test('48: PeerTools send normalizes reply_to=0, forbids owner answer; read is policy bound even after YAML breaks',async t=>{
 const {runtime:r,provider:f,dir}=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}'});let checked=false;
 f.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();if(seat.id==='worker'){
 const answer=await ctx.tools.send({to:'owner',kind:'answer',text:'ответ'});assert.equal(!answer.ok&&answer.code,'answer_is_text');
 const sent=await ctx.tools.send({to:'owner',kind:'status',text:'идёт',reply_to:0});assert.equal(sent.ok,true);assert.equal(r.journal.read({limit:0}).find(v=>v.text==='идёт')!.reply_to,null);
 assert.equal((await ctx.tools.readPane({pane:'peer'})).ok,false);
 const path=join(dir,'.harness','comms-policy.yaml');writeFileSync(path,'version: 3\nroutes: []\nobserve: {executor: "*"}\n');assert.equal((await ctx.tools.readPane({pane:'peer'})).ok,true);
 writeFileSync(path,'routes: [');const refused=await ctx.tools.readPane({pane:'peer'});assert.equal(!refused.ok&&refused.code,'policy_denied');assert.equal(r.registry.canObserve('owner','peer'),true);checked=true}
 return {text:'готово',sessionId:'s1'}};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.equal(checked,true)
});

test('38/49: bad chats/halt and removed active seat have diagnostics and safe defaults',async t=>{
 const h=await harness(t,{before:dir=>{writeFileSync(join(dir,'.harness','state','chats.json'),'{bad');writeFileSync(join(dir,'.harness','state','halt.json'),'[]')}});assert.equal(h.runtime.halted,false);assert.ok(h.runtime.lineErrors.some(s=>s.startsWith('chats.json не читается: ')));assert.ok(h.runtime.lineErrors.some(s=>s.startsWith('halt.json не читается: ')));
 await h.runtime.close();writeFileSync(join(h.dir,'.harness','state','chats.json'),JSON.stringify({chats:{c1:{id:'c1',pane:'gone',transcript:[]}},active:{gone:'c1'}}));const r=await createRuntime(h.deps,completedActions);t.after(()=>r.close());assert.equal(r.project.state.chats.chats.c1!.pane,'gone');assert.equal(r.project.state.chats.active.gone,undefined);assert.ok(r.project.state.chats.active.worker)
});

test('48: unavailable pending ack is visible in errors, not silently dropped',async t=>{
 const h=await harness(t,{actions:failedActions,seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',before:dir=>{
 writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: executor, to: reviewer, kinds: [note], trigger: owner-ack}]\nobserve: {}\n')
 }});h.runtime.channel.post({to:'peer',kind:'note',text:'подтверди'},{seat:'worker',trust:'agent'});await until(()=>h.runtime.lineErrors.some(e=>e==='восстановление карточек подтверждения недоступно в этой сборке'));assert.equal(h.runtime.channel.pendingAcks().length,1);await h.runtime.close();const r=await createRuntime(h.deps,failedActions);t.after(()=>r.close());assert.ok(r.lineErrors.includes('восстановление карточек подтверждения недоступно в этой сборке'))
});

test('48/49: unavailable effects remain visible to subscription opened after restart',async t=>{const h=await harness(t,{actions:failedActions});h.runtime.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await h.runtime.idle();await h.runtime.close();const provider=new FakeProvider(),r=await createRuntime({...h.deps,providers:{claude:provider}},failedActions);t.after(()=>r.close());const sub=r.subscribe({pane:'worker'}),event=await sub.events[Symbol.asyncIterator]().next();assert.equal(event.value.text,'обработка после хода недоступна в этой сборке');assert.equal(provider.calls.length,0);sub.close()});
