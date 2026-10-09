import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setImmediate as tick} from 'node:timers/promises';
import {createActions,createRuntime,type TurnScope,type AskResult} from './index.ts';
import {ASK_TIMEOUT_MS} from './ask.ts';
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
 gate.resolve({text:'готово',sessionId:null});await r.idle();assert.equal(r.registry.get('peer')!.relayDepth,0);
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
 f.onRun=async(s,m,c)=>{c.modelStarted?.();if(s.id==='worker'&&m.startsWith('depth ')){const scope=r.project.active.get('worker')!.scope;results.push(await r.ask(scope,{to:'peer',text:'вопрос'}));assert.equal((await r.ask(scope,{to:'worker',text:'себе'})).ok,false);assert.equal((await r.ask(scope,{to:'absent',text:'нет'})).ok,false)}return {text:'ответ',sessionId:null}};
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
