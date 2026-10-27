import assert from 'node:assert/strict';
import test from 'node:test';
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
