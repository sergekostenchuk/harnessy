import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {ProviderError} from '@harnessy/providers';
import {harness,OWNER,deferred,completedActions} from './test-helpers.ts';
import {conversationHistory} from './state.ts';
const saved=(h:Awaited<ReturnType<typeof harness>>)=>existsSync(h.runtime.project.state.chatsPath)?JSON.parse(readFileSync(h.runtime.project.state.chatsPath,'utf8')):{chats:{}};
const chats=(h:Awaited<ReturnType<typeof harness>>)=>Object.values(saved(h).chats) as any[];

for(const interrupted of [false,true])test('115/124: saved model result has '+(interrupted?'interrupted':'ok')+' outcome and launch model',async t=>{
 const h=await harness(t);h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',model:seat.model,sessionId:null,usage:{input:0,output:0,cacheRead:0},durationMs:0});return {text:'answer',sessionId:null,interrupted}};
 await h.runtime.runTurn('worker','question');const reply=chats(h)[0].transcript.find((m:any)=>m.role==='ai');assert.equal(reply.outcome,interrupted?'interrupted':'ok');assert.equal(reply.model,'w1');assert.equal(reply.errorCode,undefined);assert.equal(reply.durationMs,0);assert.equal(chats(h)[0].turns,undefined);
});

test('115/124/125: failure after start has one analytic turn; uncertain, pending and cursor survive restart',async t=>{
 const h=await harness(t),r=h.runtime,entered=deferred(),gate=deferred();t.after(()=>gate.resolve());
 h.provider.onRun=async(_seat,_message,ctx)=>{ctx.modelStarted?.();entered.resolve();await gate.promise;throw new ProviderError('transport_lost','transport lost')};
 r.postOwner({to:'worker',kind:'task',text:'task'},OWNER);await entered.promise;r.paneSet('worker',{model:'w2'},OWNER);gate.resolve();await r.idle();
 const original=chats(h)[0].turns[0];assert.equal(original.model,'w1');assert.equal(original.outcome,'error');assert.equal(original.errorCode,'transport_lost');assert.equal(r.registry.get('worker')!.status,'uncertain');assert.equal(r.journal.cursors.worker??0,0);assert.equal(r.journal.pendingFor('worker').length,1);assert.equal(chats(h)[0].transcript.filter((m:any)=>m.role==='ai').length,0);
 for(let i=0;i<2;i++){await r.openProject(h.dir);await r.idle();assert.equal(h.provider.calls.length,1);assert.equal(chats(h)[0].turns.length,1);assert.deepEqual(chats(h)[0].turns[0],original);assert.equal(r.registry.get('worker')!.status,'uncertain')}
 const p=r.registry.get('worker')!;r.project.state.recordFailedTurn(p,r.registry,original);assert.equal(chats(h)[0].turns.length,1);
});

test('115/124: failure before modelStarted is not a model turn',async t=>{
 const h=await harness(t);h.provider.onRun=async()=>{throw new ProviderError('not_logged_in','not authenticated')};await assert.rejects(h.runtime.runTurn('worker','question'));
 assert.ok(chats(h).every(chat=>!chat.turns?.length));assert.equal(h.runtime.registry.get('worker')!.status,'idle');assert.equal(h.runtime.project.state.attempts.worker,undefined);
});

test('115/124: session_missing retry shares one result and turnInstanceId',async t=>{
 const h=await harness(t),pane=h.runtime.registry.get('worker')!;pane.sessionId='missing';
 h.provider.onRun=async(seat,_text,ctx)=>{if(h.provider.calls.length===1)throw new ProviderError('session_missing','missing');ctx.modelStarted?.();ctx.publish({type:'done',model:seat.model,sessionId:'new',durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'answer',sessionId:'new'}};
 await h.runtime.runTurn('worker','question');assert.equal(h.provider.calls.length,2);const replies=chats(h).flatMap(chat=>chat.transcript).filter(m=>m.role==='ai');assert.equal(replies.length,1);assert.equal(replies[0].outcome,'ok');assert.ok(chats(h).every(chat=>!chat.turns?.length));
});

test('115/124: delivery recovery failure cannot relabel a saved model result as error',async t=>{
 let fail=true;const h=await harness(t,{actions:{...completedActions,async afterTurn(){if(fail)throw Error('effect failed');return 'completed'}}});
 await assert.rejects(h.runtime.runTurn('worker','question'));assert.equal(h.runtime.registry.get('worker')!.status,'recovering');assert.equal(chats(h)[0].transcript[0].outcome,'ok');assert.equal(chats(h)[0].turns,undefined);
 fail=false;await h.runtime.openProject(h.dir);await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.equal(chats(h)[0].transcript.filter((m:any)=>m.role==='ai').length,1);assert.equal(chats(h)[0].transcript[0].outcome,'ok');
});

test('125: transferred answers are explicitly marked, execution receipts and model outcomes remain local',()=>{
 const input={role:'ai',text:'answer',ts:1,model:'w1',usage:{input:1,output:2,cacheRead:0},durationMs:3,deliverySeq:4,runtime:{turnInstanceId:'local'},outcome:'error' as const,errorCode:'bad'};
 const copy=conversationHistory([input])[0]!;assert.equal(copy.origin,'transferred');assert.equal(copy.deliverySeq,undefined);assert.equal(copy.runtime,undefined);assert.equal(copy.outcome,undefined);assert.deepEqual(copy.usage,input.usage);assert.equal(input.deliverySeq,4);
});
