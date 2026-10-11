import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as tick} from 'node:timers/promises';
import {createActions,createRuntime,Runtime,RuntimeError,diskIO,type StateIO,type TurnScope,type AskResult} from './index.ts';
import {ASK_TIMEOUT_MS} from './ask.ts';
import {ACK_TIMEOUT_MS} from './owner-acks.ts';
import {harness,OWNER,deferred,until,collect,FakeProvider} from './test-helpers.ts';
const seats='  worker: {role: assistant, vendor: claude, label: A, model: w1, mode: read}\n  peer: {role: assistant, vendor: claude, label: B, model: w1, mode: read}\n  third: {role: assistant, vendor: claude, label: C, model: w1, mode: read}';
const policy='version: 1\nroutes: [{from: "*", to: "*", kinds: "*"}]\nobserve: {}\n';
const setup=(t:Parameters<typeof harness>[0],ack=false)=>harness(t,{seats,actions:createActions(),before:dir=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),ack?'version: 1\nroutes: [{from: "*", to: "*", kinds: [answer], trigger: owner-ack}, {from: "*", to: "*", kinds: "*"}]\nobserve: {}\n':policy)});

test('4/34/58: ask matches reply_to/from/answer/addressee, waits for ack delivery, peerReply uses codepoints',async t=>{
 const {runtime:r,provider:f}=await setup(t,true),gate=deferred<{text:string;sessionId:string|null}>(),{events}=collect(r);f.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>f.calls.length===1);const scope=r.project.active.get('worker')!.scope;let finished=false;
 const waiting=r.ask(scope,{to:'peer',text:'вопрос',thread:'T'}).then(v=>{finished=true;return v});const q=r.journal.read({limit:0}).find(r=>r.origin==='ask')!;
 assert.equal(q.from,'worker');assert.equal(q.thread,'T');
 r.channel.post({to:'worker',kind:'answer',text:'не тот автор',reply_to:q.seq},{seat:'third',trust:'agent'});
 r.channel.post({to:'worker',kind:'note',text:'не ответ',reply_to:q.seq},{seat:'peer',trust:'agent'});
 r.channel.post({to:'third',kind:'answer',text:'не тому',reply_to:q.seq},{seat:'peer',trust:'agent'});
 const answer=r.channel.post({to:'worker',kind:'answer',text:'🦊'.repeat(4100),reply_to:q.seq},{seat:'peer',trust:'agent'});await tick();assert.equal(finished,false);
 assert.deepEqual(r.approve('peer','ack:'+answer.seq,'allow',OWNER),{ok:true,error:null});assert.deepEqual(await waiting,{ok:true,reply:answer.text,seq:answer.seq});
 await tick();assert.equal(events.filter(e=>e.type==='peerReply').length,1);assert.equal([...String(events.find(e=>e.type==='peerReply')!.text)].length,4000);
 gate.resolve({text:'готово',sessionId:null});await r.idle();assert.equal(f.calls.filter(c=>c.seat.id==='peer').at(-1)!.ctx.relayDepth,1);
});

test('4/34/62: A→B→C→A refuses transitive cycle; relayDepth reaches 0,1,2 and resumes ordinary delivery',async t=>{
 const {runtime:r,provider:f}=await setup(t);const depths:number[]=[],failures:AskResult[]=[];
 f.onRun=async(s,_m,c)=>{c.modelStarted?.();const turn=r.project.active.get(s.id)!;
 if(s.id==='worker'&&turn.records.some(r=>r.from==='owner')){depths.push(c.relayDepth);const a=await r.ask(turn.scope,{to:'peer',text:'A→B'});assert.equal(a.ok,true)}
 if(s.id==='peer'&&turn.records.some(r=>r.kind==='question')){depths.push(c.relayDepth);const a=await r.ask(turn.scope,{to:'third',text:'B→C'});assert.equal(a.ok,true)}
 if(s.id==='third'&&turn.records.some(r=>r.kind==='question')){depths.push(c.relayDepth);failures.push(await r.ask(turn.scope,{to:'worker',text:'C→A'}))}
 return {text:s.id,sessionId:null}};
 r.postOwner({to:'worker',kind:'task',text:'начать цепочку'},OWNER);await r.idle();assert.deepEqual(depths,[0,1,2]);assert.deepEqual(failures,[{ok:false,code:'ask_failed',error:'A само ждёт ответа от тебя; ответь ему записью send, а не встречным вопросом'}]);
 assert.equal(r.journal.read({limit:0}).filter(r=>r.origin==='ask').length,2);assert.equal(r.journal.read({limit:0}).filter(r=>r.origin==='auto'&&r.kind==='answer').length,2);
});

test('4/62: depths 0/1/2 allowed; depth 3 refuses before question is written, unknown/self refuse',async t=>{
 const {runtime:r,provider:f}=await setup(t);const results:AskResult[]=[];
 // TS-19: this double returns no session; later turns prepend quoted history.
 f.onRun=async(s,m,c)=>{c.modelStarted?.();if(s.id==='worker'&&/(?:^|\nНовое сообщение:\n)depth [0-3]$/.test(m)){const scope=r.project.active.get('worker')!.scope;results.push(await r.ask(scope,{to:'peer',text:'вопрос'}));assert.equal((await r.ask(scope,{to:'worker',text:'себе'})).ok,false);assert.equal((await r.ask(scope,{to:'absent',text:'нет'})).ok,false)}return {text:'ответ',sessionId:null}};
 for(let depth=0;depth<=3;depth++){await r.runTurn('worker','depth '+depth,{relayDepth:depth});await r.idle()}
 assert.deepEqual(results.map(r=>r.ok),[true,true,true,false]);assert.deepEqual(results[3],{ok:false,code:'ask_failed',error:'цепочка вопросов длиннее 3'});assert.equal(r.journal.read({limit:0}).filter(r=>r.origin==='ask').length,3);
});

test('4/34: 1800s timeout removes wait; late answer does not create peerReply or finish a later ask',async t=>{
 const {runtime:r,provider:f,clock}=await setup(t),gate=deferred<{text:string;sessionId:string|null}>(),{events}=collect(r);f.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'начать'},OWNER);await until(()=>f.calls.length===1);const scope=r.project.active.get('worker')!.scope;
 const first=r.ask(scope,{to:'peer',text:'первый'});const old=r.journal.read({limit:0}).find(r=>r.origin==='ask')!;clock.advance(ASK_TIMEOUT_MS);assert.deepEqual(await first,{ok:false,code:'ask_failed',error:'адресат не ответил за отведённое время'});
 let ended=false;const second=r.ask(scope,{to:'peer',text:'второй'}).then(v=>{ended=true;return v}),q=r.journal.read({limit:0}).filter(r=>r.origin==='ask').at(-1)!;
 r.channel.post({to:'worker',kind:'answer',text:'поздно',reply_to:old.seq},{seat:'peer',trust:'agent'});await tick();assert.equal(ended,false);assert.equal(events.filter(e=>e.type==='peerReply').length,0);
 const answer=r.channel.post({to:'worker',kind:'answer',text:'вовремя',reply_to:q.seq},{seat:'peer',trust:'agent'});assert.deepEqual(await second,{ok:true,reply:'вовремя',seq:answer.seq});gate.resolve({text:'готово',sessionId:null});await r.idle();
});

for(const how of ['interrupt','halt','stop','reset','close','project'])test('32/34/41/62: '+how+' cancels waiting ask and prevents late peerReply',async t=>{
 const h=await setup(t),{runtime:r,provider:f}=h,gate=deferred<{text:string;sessionId:string|null}>(),{events}=collect(r);f.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'начать'},OWNER);await until(()=>f.calls.length===1);const scope:TurnScope=r.project.active.get('worker')!.scope,wait=r.ask(scope,{to:'peer',text:'жду'}),p=r.project;
 if(how==='interrupt')r.interrupt('worker',OWNER);if(how==='halt')await r.halt(true,OWNER);if(how==='stop')r.postOwner({to:'worker',kind:'stop',text:'стоп'},OWNER);if(how==='reset')await r.resetVendor('claude');if(how==='close')await r.close();
 if(how==='project'){const dir=mkdtempSync(join(tmpdir(),'harnessy-ask-switch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));await r.openProject(dir)}
 assert.deepEqual(await wait,{ok:false,code:'cancelled',error:'ход отменён'});const q=p.journal.read({limit:0}).find(r=>r.origin==='ask')!;p.channel.post({to:'worker',kind:'answer',text:'поздно',reply_to:q.seq},{seat:'peer',trust:'agent'});await tick();assert.equal(events.filter(e=>e.type==='peerReply').length,0);gate.resolve({text:'готово',sessionId:null});if(!p.closed)await r.idle();
 if(how==='close'){const nextF=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:nextF}},createActions());t.after(()=>next.close());await next.kick('worker');assert.equal(nextF.calls.filter(c=>c.seat.id==='worker').length,0);assert.equal(next.registry.get('worker')!.status,'uncertain')}
});

const questionAckPolicy='version: 1\nroutes: [{from: "*", to: "*", kinds: [question], trigger: owner-ack}, {from: "*", to: "*", kinds: "*"}]\nobserve: {}\n';

test('R2/1: pending ask does not lend depth to owner turn; allow delivers the question at depth 3',async t=>{
 const {runtime:r,provider:f,dir}=await setup(t),gate=deferred<{text:string;sessionId:null}>(),depths:number[]=[],failures:AskResult[]=[];
 writeFileSync(join(dir,'.harness','comms-policy.yaml'),questionAckPolicy);
 f.onRun=async(s,m,c)=>{c.modelStarted?.();if(s.id==='worker'&&m==='source')return gate.promise;
 if(s.id==='peer'){depths.push(c.relayDepth);if(r.project.active.get(s.id)!.records.some(q=>q.origin==='ask'))failures.push(await r.ask(r.project.active.get(s.id)!.scope,{to:'third',text:'не продлевать'}))}
 return {text:'ответ B',sessionId:null}};
 const turn=r.runTurn('worker','source',{relayDepth:2});void turn.catch(()=>{});await until(()=>f.calls.length===1);
 const wait=r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'глубокий вопрос'}),q=r.journal.read({limit:0}).find(q=>q.origin==='ask')!;
 await until(()=>r.registry.get(q.from)!.approvals.has('ack:'+q.seq));
 r.postOwner({to:'peer',kind:'task',text:'обычное поручение'},OWNER);await r.idle();assert.deepEqual(depths,[0]);
 assert.deepEqual(r.approve(q.from,'ack:'+q.seq,'allow',OWNER),{ok:true,error:null});assert.equal((await wait).ok,true);await r.idle();
 assert.deepEqual(depths,[0,3]);assert.deepEqual(failures,[{ok:false,code:'ask_failed',error:'цепочка вопросов длиннее 3'}]);assert.equal(f.calls.some(c=>c.seat.id==='third'),false);
 gate.resolve({text:'готово',sessionId:null});await turn;await r.idle();
});

for(const decision of ['deny','timeout'])test('R2/1: '+decision+' of pending question leaves ordinary delivery at depth zero',async t=>{
 const {runtime:r,provider:f,clock,dir}=await setup(t),gate=deferred<{text:string;sessionId:null}>();writeFileSync(join(dir,'.harness','comms-policy.yaml'),questionAckPolicy);
 f.onRun=async(s,m,c)=>{c.modelStarted?.();return s.id==='worker'&&m==='source'?gate.promise:{text:'ответ',sessionId:null}};
 const turn=r.runTurn('worker','source',{relayDepth:2});void turn.catch(()=>{});await until(()=>f.calls.length===1);
 const wait=r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'не доставлен'}),q=r.journal.read({limit:0}).find(q=>q.origin==='ask')!;await until(()=>r.registry.get(q.from)!.approvals.has('ack:'+q.seq));
 if(decision==='deny'){assert.equal(r.approve(q.from,'ack:'+q.seq,'deny',OWNER).ok,true);clock.advance(ASK_TIMEOUT_MS)}else clock.advance(ACK_TIMEOUT_MS);
 assert.equal((await wait).ok,false);await until(()=>!r.registry.get(q.from)!.approvals.has('ack:'+q.seq));
 assert.equal(r.channel.ackDecision(q.seq)?.kind,'rejected');assert.equal(r.journal.pendingFor('peer').some(e=>e.record.seq===q.seq),false);
 r.postOwner({to:'peer',kind:'task',text:'обычная работа'},OWNER);await r.idle();assert.deepEqual(f.calls.filter(c=>c.seat.id==='peer').map(c=>c.ctx.relayDepth),[0]);
 gate.resolve({text:'готово',sessionId:null});await turn;await r.idle();
});

test('R2/1: one delivery batch takes max depth of independently acknowledged questions',async t=>{
 const {runtime:r,provider:f,dir}=await setup(t),a=deferred<{text:string;sessionId:null}>(),c=deferred<{text:string;sessionId:null}>(),ordinary=deferred<{text:string;sessionId:null}>(),batches:{depth:number;seqs:number[]}[]=[],failures:AskResult[]=[];
 writeFileSync(join(dir,'.harness','comms-policy.yaml'),questionAckPolicy);
 f.onRun=async(s,m,ctx)=>{ctx.modelStarted?.();if(m==='low')return a.promise;if(m==='high')return c.promise;
 if(s.id==='peer'){const turn=r.project.active.get('peer')!,qs=turn.records.filter(q=>q.origin==='ask');if(!qs.length)return ordinary.promise;
 batches.push({depth:ctx.relayDepth,seqs:qs.map(q=>q.seq)});failures.push(await r.ask(turn.scope,{to:'worker',text:'не продлевать'}))}
 return {text:'общий ответ',sessionId:null}};
 const low=r.runTurn('worker','low',{relayDepth:0}),high=r.runTurn('third','high',{relayDepth:2});void low.catch(()=>{});void high.catch(()=>{});await until(()=>f.calls.length===2);
 const x=r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'малый'}),y=r.ask(r.project.active.get('third')!.scope,{to:'peer',text:'большой'}),qs=r.journal.read({limit:0}).filter(q=>q.origin==='ask');
 await until(()=>qs.every(q=>r.registry.get(q.from)!.approvals.has('ack:'+q.seq)));r.postOwner({to:'peer',kind:'task',text:'промежуточный'},OWNER);await until(()=>f.calls.some(c=>c.seat.id==='peer'));assert.equal(f.calls.find(c=>c.seat.id==='peer')!.ctx.relayDepth,0);
 for(const q of qs)assert.equal(r.approve(q.from,'ack:'+q.seq,'allow',OWNER).ok,true);
 ordinary.resolve({text:'обычный ответ',sessionId:null});assert.equal((await x).ok,true);assert.equal((await y).ok,true);await r.idle();assert.deepEqual(batches,[{depth:3,seqs:qs.map(q=>q.seq)}]);assert.deepEqual(failures,[{ok:false,code:'ask_failed',error:'цепочка вопросов длиннее 3'}]);
 a.resolve({text:'A',sessionId:null});c.resolve({text:'C',sessionId:null});await Promise.all([low,high]);await r.idle();
});

test('R2/1: acknowledged question retains its own depth after restart without its old SDK wait',async t=>{
 const h=await setup(t),r=h.runtime,gate=deferred<{text:string;sessionId:null}>();writeFileSync(join(h.dir,'.harness','comms-policy.yaml'),questionAckPolicy);
 h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};const source=r.runTurn('worker','source',{relayDepth:2});void source.catch(()=>{});await until(()=>h.provider.calls.length===1);
 const wait=r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'после перезапуска'}),q=r.journal.read({limit:0}).find(q=>q.origin==='ask')!;await until(()=>r.registry.get(q.from)!.approvals.has('ack:'+q.seq));
 r.project.halted=true;r.project.state.saveHalt(true);assert.equal(r.approve(q.from,'ack:'+q.seq,'allow',OWNER).ok,true);gate.resolve({text:'часть',sessionId:null});await source;assert.equal((await wait).ok,false);await r.close();
 const f=new FakeProvider(),failures:AskResult[]=[],next=await createRuntime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());
 f.onRun=async(s,_m,c)=>{c.modelStarted?.();if(s.id==='peer')failures.push(await next.ask(next.project.active.get('peer')!.scope,{to:'third',text:'слишком глубоко'}));return {text:'ответ',sessionId:null}};
 await next.halt(false,OWNER);await next.idle();assert.equal(f.calls.find(c=>c.seat.id==='peer')!.ctx.relayDepth,3);assert.deepEqual(failures,[{ok:false,code:'ask_failed',error:'цепочка вопросов длиннее 3'}]);
});

for(const cut of ['before-question','after-question'])test('R2/1: depth state '+cut+' failure never launches a question at depth zero, including restart',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('actions.json')){const raw=JSON.parse(text);if(raw.askDepths&&(cut==='before-question'||raw.askDepths.questions.length)){armed=false;throw Error('depth not saved')}}diskIO.write(path,text)}};
 const h=await harness(t,{seats,actions:createActions(),deps:{stateIO:io},before:dir=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),questionAckPolicy)}),r=h.runtime,gate=deferred<{text:string;sessionId:null}>();
 h.provider.onRun=async(s,m,c)=>{c.modelStarted?.();return s.id==='worker'&&m==='source'?gate.promise:{text:'ответ',sessionId:null}};
 const source=r.runTurn('worker','source',{relayDepth:2});void source.catch(()=>{});await until(()=>h.provider.calls.length===1);const failure=await r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'хранение глубины'});assert.equal(!failure.ok&&failure.code,'write_failed');
 const qs=r.journal.read({limit:0}).filter(q=>q.origin==='ask');assert.equal(qs.length,cut==='before-question'?0:1);
 if(qs.length){const q=qs[0]!;await until(()=>r.registry.get(q.from)!.approvals.has('ack:'+q.seq));assert.equal(r.approve(q.from,'ack:'+q.seq,'allow',OWNER).ok,true);await r.idle();assert.equal(h.provider.calls.some(c=>c.seat.id==='peer'),false)}
 gate.resolve({text:'завершено',sessionId:null});await source;await r.idle();await r.close();
 const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());await next.idle();assert.equal(f.calls.length,0);
 if(qs.length)assert.equal(next.journal.pendingFor('peer').some(e=>e.record.seq===qs[0]!.seq),true);
});


for(const corrupt of ['missing-depth','zero-depth','unrelated-record'])test('R2/1: '+corrupt+' refuses depth state before model on restart',async t=>{
 const h=await setup(t),r=h.runtime,gate=deferred<{text:string;sessionId:null}>();writeFileSync(join(h.dir,'.harness','comms-policy.yaml'),questionAckPolicy);
 h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};const source=r.runTurn('worker','source',{relayDepth:2});void source.catch(()=>{});await until(()=>h.provider.calls.length===1);
 const wait=r.ask(r.project.active.get('worker')!.scope,{to:'peer',text:'сохранённая глубина'});await until(()=>r.journal.read({limit:0}).some(q=>q.origin==='ask'));await r.close();assert.equal((await wait).ok,false);await assert.rejects(source);
 const path=join(h.dir,'.harness','state','actions.json'),raw=JSON.parse(readFileSync(path,'utf8'));
 if(corrupt==='missing-depth')delete raw.askDepths.questions[0].depth;if(corrupt==='zero-depth')raw.askDepths.questions[0].depth=0;
 if(corrupt==='unrelated-record')raw.askDepths.questions[0].seq=999999;
 writeFileSync(path,JSON.stringify(raw));const f=new FakeProvider(),next=new Runtime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());await assert.rejects(next.openProject(h.dir),(e:unknown)=>e instanceof RuntimeError&&e.code==='actions_invalid');assert.equal(f.calls.length,0);
});
