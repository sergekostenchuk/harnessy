import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderError} from '@harnessy/providers';
import {createRuntime} from './index.ts';
import {harness,OWNER,FakeProvider,completedActions,collect,deferred,until} from './test-helpers.ts';

async function failed(t:Parameters<typeof harness>[0],code:'transport_lost'|'not_logged_in'|'no_binary'|'network_unavailable'='transport_lost'){
 const h=await harness(t);h.provider.onRun=async()=>{throw new ProviderError(code,'Проверка входа не ответила')};
 const sent=h.runtime.chat({pane:'worker',message:'старое задание'},OWNER);await h.runtime.idle();return {...h,sent};
}
for(const code of ['transport_lost','not_logged_in','no_binary','network_unavailable'] as const)test('TS-26: failure before model persists unsent '+code,async t=>{
 const h=await failed(t,code),r=h.runtime,info=r.waiting('worker')!;assert.equal(info.status,'unsent');assert.deepEqual(info.recordSeqs,[h.sent.seq]);assert.equal(info.failure?.code,code);assert.equal(r.journal.pendingFor('worker').length,1);
 const ev=collect(r);await r.close();const provider=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>next.close());await next.idle();assert.equal(next.waiting('worker')!.status,'unsent');assert.equal(next.waiting('worker')!.failure?.code,code);assert.equal(provider.calls.length,0);ev.sub.close();
});
test('TS-26: retry sends only the failed records; later queued work gets a separate turn',async t=>{
 const h=await failed(t),r=h.runtime,info=r.waiting('worker')!;await r.halt(true,OWNER);r.chat({pane:'worker',message:'новое задание'},OWNER);await r.idle();h.provider.onRun=null;
 const input={project:h.dir,turnInstanceId:info.turnInstanceId,action:'retry'};await r.attempt('worker',input,OWNER);await r.halt(false,OWNER);await r.idle();
 assert.equal(h.provider.calls.length,3);assert.match(h.provider.calls[1]!.message,/старое задание/);assert.doesNotMatch(h.provider.calls[1]!.message,/новое задание/);assert.match(h.provider.calls[2]!.message,/новое задание/);assert.equal(r.journal.pendingFor('worker').length,0);
 await r.attempt('worker',input,OWNER);await r.idle();assert.equal(h.provider.calls.length,3);
});
test('TS-26: removing an unsent record invokes no model; only the next message is delivered',async t=>{
 const h=await failed(t),r=h.runtime,info=r.waiting('worker')!;await r.attempt('worker',{project:h.dir,turnInstanceId:info.turnInstanceId,action:'skip'},OWNER);await r.idle();assert.equal(h.provider.calls.length,1);h.provider.onRun=null;
 r.chat({pane:'worker',message:'только новое'},OWNER);await r.idle();assert.equal(h.provider.calls.length,2);assert.doesNotMatch(h.provider.calls[1]!.message,/старое задание/);assert.match(h.provider.calls[1]!.message,/только новое/);
});
test('TS-26: new owner message combines the unsent record once and saves an explanation in history',async t=>{
 const h=await failed(t),r=h.runtime;h.provider.onRun=null;r.chat({pane:'worker',kind:'question',message:'новое задание'},OWNER);await r.idle();assert.equal(h.provider.calls.length,2);assert.match(h.provider.calls[1]!.message,/старое задание/);assert.match(h.provider.calls[1]!.message,/новое задание/);assert.equal(r.waiting('worker'),null);
 assert.equal(r.registry.get('worker')!.transcript.filter(m=>m.text.includes('Отправлено вместе')).length,1);
 await r.close();const provider=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>next.close());await next.idle();assert.equal(provider.calls.length,0);assert.equal(next.registry.get('worker')!.transcript.filter(m=>m.text.includes('Отправлено вместе')).length,1);
});
test('TS-26: a message queued before failure cannot silently resume the unsent attempt',async t=>{
 const h=await harness(t),r=h.runtime,gate=deferred();h.provider.onRun=async()=>{await gate.promise;throw new ProviderError('transport_lost','нет ответа')};r.chat({pane:'worker',message:'первое'},OWNER);await until(()=>h.provider.calls.length===1);r.chat({pane:'worker',message:'второе'},OWNER);gate.resolve();await r.idle();assert.equal(h.provider.calls.length,1);assert.equal(r.waiting('worker')!.status,'unsent');await r.kick('worker');assert.equal(h.provider.calls.length,1);
});
test('TS-26: retry selection survives engine restart while paused',async t=>{
 const h=await failed(t),r=h.runtime,info=r.waiting('worker')!;await r.halt(true,OWNER);r.chat({pane:'worker',message:'позже'},OWNER);await r.idle();await r.attempt('worker',{project:h.dir,turnInstanceId:info.turnInstanceId,action:'retry'},OWNER);await r.close();const provider=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>next.close());await next.halt(false,OWNER);await next.idle();assert.equal(provider.calls.length,2);assert.doesNotMatch(provider.calls[0]!.message,/позже/);assert.match(provider.calls[1]!.message,/позже/);
});
test('TS-26: post-start uncertainty still blocks new messages and requires an owner decision',async t=>{
 const h=await harness(t),r=h.runtime;h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','после старта')};r.chat({pane:'worker',message:'первое'},OWNER);await r.idle();assert.equal(r.waiting('worker')!.status,'uncertain');r.chat({pane:'worker',message:'второе'},OWNER);await r.idle();assert.equal(h.provider.calls.length,1);assert.deepEqual(r.waiting('worker')!.recordSeqs,[1]);
});
