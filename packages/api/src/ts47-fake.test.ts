import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderError} from '@harnessy/providers';
import {ScenarioProvider,fakeScenario} from '../tools/ts47-fake.ts';
import type {} from '../tools/ts47-stand.ts';
import {fakeContext,seat} from './ts47-stand-test-helper.ts';
import {call,fixture,sse,until} from './test-helpers.ts';

test('TS-47.F: scenario validation rejects typos instead of silently changing the audit',()=>{
 assert.deepEqual(fakeScenario({}),{ttftMs:0,outcome:'ok',tools:0});
 assert.deepEqual(fakeScenario({HARNESS_FAKE_TTFT_MS:'15000',HARNESS_FAKE_OUTCOME:'retry',HARNESS_FAKE_TOOLS:'50'}),{ttftMs:15000,outcome:'retry',tools:50});
 for(const env of [{HARNESS_FAKE_TTFT_MS:'2'},{HARNESS_FAKE_OUTCOME:'OK'},{HARNESS_FAKE_TOOLS:'-1'},{HARNESS_FAKE_TOOLS:'51'},{HARNESS_FAKE_TOOLS:'1.5'}])assert.throws(()=>fakeScenario(env));
});
test('TS-47.F: no provider event before TTFT; consecutive tools precede streamed answer and terminal event',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),waits:number[]=[];
 const provider=new ScenarioProvider('claude',{ttftMs:15000,outcome:'ok',tools:3},async ms=>{waits.push(ms);await gate});
 const h=fakeContext(),work=provider.runTurn(seat,'ignored',h.ctx);assert.deepEqual(waits,[15000]);assert.equal(h.events.length,0);release();const result=await work;
 assert.deepEqual(h.events.map(e=>e.type),['tool','tool','tool','delta','delta','done']);assert.match(result.text,/тестового провайдера/);
});
test('TS-47.F: errors and lost transport are distinct; retry succeeds only on next attempt',async()=>{
 for(const [outcome,code] of [['error','turn_failed'],['lost','transport_lost']] as const){
  const provider=new ScenarioProvider('claude',{ttftMs:0,outcome,tools:0}),h=fakeContext();
  await assert.rejects(provider.runTurn(seat,'ignored',h.ctx),e=>(e as {code?:string}).code===code);assert.deepEqual(h.events,[]);
 }
 const provider=new ScenarioProvider('claude',{ttftMs:0,outcome:'retry',tools:0});
 await assert.rejects(provider.runTurn(seat,'ignored',fakeContext().ctx),e=>(e as {code?:string}).code==='turn_failed');
 assert.match((await provider.runTurn(seat,'ignored',fakeContext().ctx)).text,/тестового провайдера/);
 await assert.rejects(provider.runTurn(seat,'ignored',fakeContext().ctx),e=>(e as {code?:string}).code==='turn_failed');
});
test('TS-50.A: partial failure emits text and one tool before failure; manual retry is a separate successful response',async()=>{
 const provider=new ScenarioProvider('claude',fakeScenario({HARNESS_FAKE_OUTCOME:'partial-retry'})),first=fakeContext(),second=fakeContext();
 await assert.rejects(provider.runTurn(seat,'ignored',first.ctx),e=>(e as {code?:string}).code==='turn_failed');
 assert.deepEqual(first.events.map(e=>e.type),['delta','tool']);
 const firstEvent=first.events[0]!;assert.equal(firstEvent.type,'delta');if(firstEvent.type!=='delta')throw Error('expected delta');assert.match(firstEvent.text,/Незавершённый фрагмент/);
 const response=await provider.runTurn(seat,'ignored',second.ctx);
 assert.deepEqual(second.events.map(e=>e.type),['delta','done']);
 assert.equal(response.text,'Завершённый ответ второй попытки.');
});
test('TS-47.F: interrupt during TTFT emits no later tool or answer',async()=>{
 const controller=new AbortController(),provider=new ScenarioProvider('codex',{ttftMs:15000,outcome:'ok',tools:2}),h=fakeContext(controller.signal);
 const work=provider.runTurn({...seat,vendor:'codex'},'ignored',h.ctx);controller.abort();
 await assert.rejects(work,e=>(e as {code?:string}).code==='cancelled');assert.deepEqual(h.events,[]);
});

test('TS-47.F: real HTTP and SSE deliver the configured tools, answer and durable usage',async t=>{
 const fake=new ScenarioProvider('claude',{ttftMs:0,outcome:'ok',tools:3});
 const h=await fixture(t,{deps:{providers:{claude:fake}}}),stream=await sse(h.api);t.after(()=>stream.close());
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'сценарий'}})).status,200);
 await h.runtime.idle();await until(()=>stream.frames.some(e=>e.type==='done'));
 const shown=stream.frames.filter(e=>['tool','delta','done'].includes(e.type)).map(e=>e.type);
 assert.deepEqual(shown,['tool','tool','tool','delta','delta','done']);
 const chat=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 const messages=(await call(h.api,'/api/chats/'+chat)).body.messages;
 assert.match(messages.at(-1).text,/тестового провайдера/);assert.equal(messages.at(-1).usage.toolCalls,3);
 assert.deepEqual(messages.at(-1).toolEvents.map((e:any)=>[e.type,e.name,e.status,e.offset]),[['tool','Проверка 1','unknown',0],['tool','Проверка 2','unknown',0],['tool','Проверка 3','unknown',0]]);
 assert.deepEqual(messages.at(-1).toolResults.map((e:any)=>[e.name,e.status]),[['Проверка 1','ok'],['Проверка 2','ok'],['Проверка 3','ok']]);
});
for(const [outcome,code] of [['error','turn_failed'],['lost','transport_lost']] as const)test('TS-47.F: '+outcome+' reaches the window as the correct engine error',async t=>{
 const fake=new ScenarioProvider('claude',{ttftMs:0,outcome,tools:0}),h=await fixture(t,{deps:{providers:{claude:fake}}}),stream=await sse(h.api);t.after(()=>stream.close());
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'отказ'}})).status,200);await h.runtime.idle();
 await until(()=>stream.frames.some(e=>e.type==='error'));assert.equal(stream.frames.find(e=>e.type==='error').code,code);
 assert.ok(h.runtime.waiting('worker'));
});
test('TS-47.F: retry goes through the real owner retry API after a failed attempt',async t=>{
 const fake=new ScenarioProvider('claude',{ttftMs:0,outcome:'retry',tools:1}),h=await fixture(t,{deps:{providers:{claude:fake}}});
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'повтор'}})).status,200);await h.runtime.idle();
 const failure=h.runtime.waiting('worker');assert.ok(failure);assert.ok(failure.actions.includes('retry'));
 const retried=await call(h.api,'/api/panes/worker/attempt',{body:{project:h.dir,turnInstanceId:failure.turnInstanceId,action:'retry'}});
 assert.equal(retried.status,200,retried.text);await h.runtime.idle();assert.equal(h.runtime.waiting('worker'),null);
 assert.match(h.runtime.registry.get('worker')!.transcript.at(-1)!.text,/тестового провайдера/);
});
test('TS-50.B: failed fragment and tools stay in their attempt, and only the completed retry enters carried context',async t=>{
 const fake=new ScenarioProvider('claude',{ttftMs:0,outcome:'partial-retry',tools:0}),h=await fixture(t,{deps:{providers:{claude:fake}}}),owner={seat:'owner',trust:'owner'} as const;
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'повтор'}})).status,200);await h.runtime.idle();
 const waiting=h.runtime.waiting('worker');assert.ok(waiting);const chat=h.runtime.chatsList(owner).active.worker!;
 const before=(await call(h.api,'/api/chats/'+chat)).body,failed=before.turns.at(-1);
 assert.equal(failed.turnInstanceId,waiting.turnInstanceId);assert.equal(failed.partialText,'Незавершённый фрагмент первой попытки.');assert.equal(failed.toolEvents.length,1);
 assert.equal((await call(h.api,'/api/panes/worker/attempt',{body:{project:h.dir,turnInstanceId:waiting.turnInstanceId,action:'retry'}})).status,200);await h.runtime.idle();
 const after=(await call(h.api,'/api/chats/'+chat)).body,answer=after.messages.find((m:any)=>m.role==='ai'),question=after.messages.find((m:any)=>m.role==='me');
 assert.equal(answer.text,'Завершённый ответ второй попытки.');assert.notEqual(answer.runtime.turnInstanceId,failed.turnInstanceId);assert.equal(answer.toolEvents,undefined);assert.equal(after.turns.at(-1).partialText,failed.partialText);
 assert.deepEqual(failed.recordSeqs,[question.journalSeq]);assert.ok(Number.isFinite(question.journalTs));assert.ok(question.journalTs<=failed.ts);
 await h.runtime.chatsNew({pane:'worker',carry:'text'},owner);const carry=h.runtime.registry.get('worker')!.carry;assert.match(carry,/Завершённый ответ второй попытки/);assert.doesNotMatch(carry,/Незавершённый фрагмент первой попытки/);
});

test('TS-50.B r2: repeated failures retain the original peer task identity through retry and restart',async t=>{
 const seats='  worker: {role: executor, vendor: claude, model: w1, mode: read}\n  peer: {role: orchestrator, vendor: claude, model: w1, mode: read}';
 const h=await fixture(t,{seats,before:dir=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: "*", to: "*", kinds: "*"}]\nobserve: {}\n')});let attempt=0;
 h.provider.onRun=async(seat,_prompt,ctx)=>{assert.equal(seat.id,'worker');h.clock.advance(1000);ctx.modelStarted?.();attempt++;const text=attempt<3?'Фрагмент '+attempt:'Итог';ctx.publish({type:'delta',text});if(attempt<3)throw new ProviderError('turn_failed','Сбой '+attempt);ctx.publish({type:'done',sessionId:'peer-retry',model:seat.model,durationMs:1,usage:{input:0,output:0,cacheRead:0}});return {text,sessionId:'peer-retry'}};
 const task=h.runtime.channel.post({to:'worker',kind:'task',text:'Поручение от руководителя'},{seat:'peer',trust:'agent'});await h.runtime.idle();const chat=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 for(let n=0;n<2;n++){const waiting=h.runtime.waiting('worker');assert.ok(waiting);const response=await call(h.api,'/api/panes/worker/attempt',{body:{project:h.dir,turnInstanceId:waiting.turnInstanceId,action:'retry'}});assert.equal(response.status,200,response.text);await h.runtime.idle()}
 await h.runtime.openProject(h.dir);const history=(await call(h.api,'/api/chats/'+chat)).body,peer=history.messages.find((m:any)=>m.role==='peer'&&m.text.includes('Поручение от руководителя')),answer=history.messages.find((m:any)=>m.role==='ai'&&m.text==='Итог');
 assert.ok(peer);assert.ok(answer);assert.equal(peer.journalSeq,task.seq);assert.ok(Number.isFinite(peer.journalTs));assert.deepEqual(history.turns.map((turn:any)=>turn.partialText),['Фрагмент 1','Фрагмент 2']);assert.ok(history.turns.every((turn:any)=>turn.recordSeqs.includes(task.seq)&&turn.ts>=peer.journalTs));assert.ok(peer.ts>=history.turns[1].ts);assert.ok(answer.ts>=peer.ts);
});
