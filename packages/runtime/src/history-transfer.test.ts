import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRuntime,diskIO,withRoleActions,type Runtime,type StateIO} from './index.ts';
import {jsonClone,type TranscriptMessage} from './state.ts';
import {harness,OWNER,FakeProvider,completedActions} from './test-helpers.ts';
const seats='  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read, digest: false}';
const actions=withRoleActions(completedActions);
type Harness=Awaited<ReturnType<typeof harness>>;
async function reopen(t:TestContext,h:Harness,dir=h.dir){
 const provider=new FakeProvider(),runtime=await createRuntime({...h.deps,projectDir:dir,providers:{claude:provider}},actions);
 t.after(()=>runtime.close());await runtime.idle();return {runtime,provider};
}
function answer(r:Runtime,sid:string):TranscriptMessage {
 const result=r.registry.get(sid)!.transcript.find(m=>m.role==='ai')!;assert.ok(result);assert.ok(Object.hasOwn(result,'runtime'));assert.ok(Object.hasOwn(result,'deliverySeq'));return result;
}
function copiedAnswer(r:Runtime,sid:string,source:TranscriptMessage){
 const result=r.registry.get(sid)!.transcript.find(m=>m.role==='ai'&&m.text===source.text)!;assert.ok(result);
 assert.equal(result.ts,source.ts);assert.deepEqual(result.usage,source.usage);assert.equal(result.durationMs,source.durationMs);
 for(const key of ['runtime','deliverySeq','sourceOnly'])assert.equal(Object.hasOwn(result,key),false,key+' must remain in the source');
}

test('TS-04b r2: chat(room) → new executor preserves conversation but cannot recover the room receipt',async t=>{
 const h=await harness(t,{seats,actions}),r=h.runtime;h.clock.advance(875);r.roomSet({model:'w1'},OWNER);
 const sent=r.chat({pane:'room',message:'История комнаты 🧠'},OWNER);await r.idle();assert.equal(sent.seq,1);
 const source=answer(r,'room'),sourceChat=r.project.state.chats.active.room!;source.sourceOnly={privateReceipt:'room'};r.project.state.savePanes(r.registry,r.journal);
 await r.halt(true,OWNER);const assigned=await r.assignRoomRole({role:'executor'},OWNER);await r.idle();
 copiedAnswer(r,'executor',source);assert.equal(r.registry.get('executor')!.status,'idle');assert.equal(r.journal.pendingFor('executor').length,1);assert.equal(r.project.state.results(r.registry.get('executor')!).length,0);
 const snapshot=JSON.parse(readFileSync(r.project.state.materializationPath,'utf8'))[0].source.chat.transcript.find((m:TranscriptMessage)=>m.role==='ai');assert.equal(Object.hasOwn(snapshot,'runtime'),false);assert.equal(Object.hasOwn(snapshot,'deliverySeq'),false);
 assert.equal(Object.hasOwn(r.project.state.chats.chats[sourceChat]!.transcript[1]!,'runtime'),true);assert.match(readFileSync(r.project.state.chatsPath,'utf8'),/"ts": 1791500001\.0/);
 await r.close();const {runtime:next,provider:f}=await reopen(t,h);assert.equal(f.calls.length,0);assert.equal(next.registry.get('executor')!.status,'idle');copiedAnswer(next,'executor',source);
 await next.halt(false,OWNER);await next.idle();assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.seat.id,'executor');assert.match(f.calls[0]!.message,/Прочитай|Ответь владельцу коротко/);assert.equal(next.journal.pendingFor('executor').length,0);
 next.chat({pane:'executor',message:'Новая задача исполнителю',direct:true},OWNER);await next.idle();assert.equal(f.calls.length,2);assert.match(f.calls[1]!.message,/Новая задача исполнителю/);assert.equal(next.registry.get('executor')!.status,'idle');assert.equal(next.project.state.chats.active.executor,assigned.chat.id);
});

test('TS-04b r2: chat without project → orchestrator runs onboarding and remains usable after restart',async t=>{
 const h=await harness(t,{seats,actions}),r=h.runtime,root=join(h.dir,'projects');mkdirSync(root);await r.settingsPatch('owner',{projectsRoot:root},OWNER);
 r.roomSet({model:'w1',folder:false},OWNER);const old=r.chat({pane:'room',message:'Проект из разговора'},OWNER);await r.idle();const source=answer(r,'room');assert.equal(old.seq,1);
 const assigned=await r.assignRoomRole({role:'orchestrator'},OWNER);await r.idle();assert.equal(assigned.created,true);assert.equal(r.journal.get(1)!.kind,'status');assert.equal(h.provider.calls.length,2);assert.equal(h.provider.calls[1]!.seat.id,'orchestrator');assert.match(h.provider.calls[1]!.message,/Владелец: Проект из разговора/);
 copiedAnswer(r,'orchestrator',source);assert.equal(r.registry.get('orchestrator')!.status,'idle');assert.equal(r.journal.pendingFor('orchestrator').length,0);assert.equal(r.project.state.results(r.registry.get('orchestrator')!).length,1);
 await r.close();const {runtime:next,provider:f}=await reopen(t,h,assigned.project);assert.equal(f.calls.length,0);copiedAnswer(next,'orchestrator',source);
 next.chat({pane:'orchestrator',message:'После перезапуска проекта'},OWNER);await next.idle();assert.equal(f.calls.length,1);assert.match(f.calls[0]!.message,/После перезапуска проекта/);assert.equal(next.registry.get('orchestrator')!.status,'idle');assert.equal(next.journal.pendingFor('orchestrator').length,0);
});

test('TS-04b r2: roomMove cannot claim matching seq in a different journal, before or after restart',async t=>{
 const h=await harness(t,{seats,actions}),r=h.runtime,destination=join(h.dir,'destination');r.roomSet({model:'w1'},OWNER);
 const old=r.chat({pane:'room',message:'Старое сообщение в исходной папке'},OWNER);await r.idle();const source=answer(r,'room');assert.equal(old.seq,1);
 r.roomSet({model:'w2'},OWNER);assert.equal(Object.hasOwn(r.registry.get('room')!.transcript[1]!,'runtime'),true);
 await r.roomMove({path:destination,create:true},OWNER);await r.idle();assert.equal(h.provider.calls.length,1);copiedAnswer(r,'room',source);assert.equal(r.registry.get('room')!.status,'idle');assert.equal(r.journal.cursors.room??0,0);assert.equal(r.journal.lastSeq,0);
 await r.close();const {runtime:next,provider:f}=await reopen(t,h,destination);assert.equal(f.calls.length,0);assert.equal(next.journal.cursors.room??0,0);copiedAnswer(next,'room',source);
 const fresh=next.chat({pane:'room',message:'Новое сообщение в другой папке'},OWNER);assert.equal(fresh.seq,old.seq);await next.idle();assert.equal(f.calls.length,1);assert.match(f.calls[0]!.message,/Новое сообщение в другой папке/);assert.match(f.calls[0]!.message,/Владелец: Старое сообщение в исходной папке/);
 assert.ok(next.registry.get('room')!.transcript.some(m=>m.role==='me'&&m.text==='Новое сообщение в другой папке'));assert.equal(next.registry.get('room')!.carry,'');assert.equal(next.journal.cursors.room,fresh.seq);assert.equal(next.journal.pendingFor('room').length,0);assert.equal(next.project.state.results(next.registry.get('room')!).length,1);
 await next.close();const again=await reopen(t,h,destination);assert.equal(again.provider.calls.length,0);again.runtime.chat({pane:'room',message:'Ещё одно после восстановления'},OWNER);await again.runtime.idle();assert.equal(again.provider.calls.length,1);assert.match(again.provider.calls[0]!.message,/Ещё одно после восстановления/);assert.equal(again.runtime.journal.cursors.room,2);
 const original=JSON.parse(readFileSync(join(h.dir,'.harness','state','chats.json'),'utf8'));assert.ok(original.chats[original.active.room].transcript[1].runtime);assert.equal(original.chats[original.active.room].transcript[1].deliverySeq,1);
});

test('TS-04b r2: singleton replacement keeps old role receipts local and drops imported room receipts',async t=>{
 const h=await harness(t,{seats,actions}),r=h.runtime;r.chat({pane:'orchestrator',message:'Прежняя задача роли'},OWNER);await r.idle();const originalChat=r.project.state.chats.active.orchestrator!,local=answer(r,'orchestrator');
 r.roomSet({model:'w1'},OWNER);r.chat({pane:'room',message:'Разговор для замены роли'},OWNER);await r.idle();const source=answer(r,'room');await r.halt(true,OWNER);
 const assigned=await r.assignRoomRole({role:'orchestrator'},OWNER);await r.idle();assert.equal(assigned.replaced,true);assert.notEqual(assigned.chat.id,originalChat);copiedAnswer(r,'orchestrator',source);assert.equal(r.registry.get('orchestrator')!.status,'idle');assert.equal(r.project.state.results(r.registry.get('orchestrator')!).length,1);assert.deepEqual(r.project.state.chats.chats[originalChat]!.transcript[1]!.runtime,local.runtime);
 await r.close();const {runtime:next,provider:f}=await reopen(t,h);assert.equal(f.calls.length,0);assert.equal(next.registry.get('orchestrator')!.status,'idle');assert.equal(next.journal.pendingFor('orchestrator').length,1);
 await next.halt(false,OWNER);await next.idle();assert.equal(f.calls.length,1);assert.match(f.calls[0]!.message,/Прежняя задача роли/);assert.equal(next.project.state.results(next.registry.get('orchestrator')!).length,2);
 next.chat({pane:'orchestrator',message:'Задача новой роли'},OWNER);await next.idle();assert.equal(f.calls.length,2);assert.match(f.calls[1]!.message,/Задача новой роли/);assert.equal(next.journal.pendingFor('orchestrator').length,0);
});

test('TS-04b r2: chatsOpen text carry keeps genuine local receipts, never copies receipt objects into the opened chat',async t=>{
 const h=await harness(t,{actions}),r=h.runtime;r.chat({pane:'worker',message:'Первый локальный чат'},OWNER);await r.idle();const first=r.project.state.chats.active.worker!,local=jsonClone(answer(r,'worker'));
 await r.chatsNew({pane:'worker',carry:'text'},OWNER);r.chat({pane:'worker',message:'Второй локальный чат'},OWNER);await r.idle();await r.chatsOpen({chat:first,carry:'text'},OWNER);await r.idle();
 assert.equal(h.provider.calls.length,2);assert.deepEqual(r.registry.get('worker')!.transcript[1]!.runtime,local.runtime);assert.equal(r.registry.get('worker')!.transcript[1]!.deliverySeq,1);assert.equal(r.registry.get('worker')!.transcript.filter(m=>Object.hasOwn(m,'runtime')).length,1);assert.match(r.registry.get('worker')!.carry,/Второй локальный чат/);
 r.chat({pane:'worker',message:'После открытия прежнего чата'},OWNER);await r.idle();assert.equal(h.provider.calls.length,3);assert.match(h.provider.calls[2]!.message,/Второй локальный чат/);assert.match(h.provider.calls[2]!.message,/После открытия прежнего чата/);assert.equal(r.project.state.results(r.registry.get('worker')!).length,3);
 await r.close();const {runtime:next,provider:f}=await reopen(t,h);assert.equal(f.calls.length,0);assert.equal(next.registry.get('worker')!.status,'idle');assert.equal(next.journal.cursors.worker,3);assert.equal(next.project.state.results(next.registry.get('worker')!).length,3);
 next.chat({pane:'worker',message:'Новая запись после перезапуска'},OWNER);await next.idle();assert.equal(f.calls.length,1);assert.match(f.calls[0]!.message,/Новая запись после перезапуска/);
});

test('TS-04b r2: replay of an older assignment intent strips source receipts and preserves zero/null final metadata',async t=>{
 let armed=false;const io:StateIO={read:diskIO.read,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('seat-materialization.json')){armed=false;throw Error('after intent')}}};
 const h=await harness(t,{seats,actions,deps:{stateIO:io}}),r=h.runtime;r.roomSet({model:'w1'},OWNER);
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:0,usage:{input:null,output:0,cacheRead:0}});return {text:'Ответ без расхода',sessionId:null}};
 r.chat({pane:'room',message:'Исходный разговор до сбоя'},OWNER);await r.idle();const source=answer(r,'room');await r.halt(true,OWNER);armed=true;await assert.rejects(r.assignRoomRole({role:'executor'},OWNER),/after intent/);
 // Emulate an older saved intent containing an actual source turn receipt.
 const intents=JSON.parse(readFileSync(r.project.state.materializationPath,'utf8'));intents[0].source.chat.transcript[1]=jsonClone(source);writeFileSync(r.project.state.materializationPath,JSON.stringify(intents));
 await r.close();const {runtime:next,provider:f}=await reopen(t,h);assert.equal(f.calls.length,0);copiedAnswer(next,'executor',source);assert.equal(next.registry.get('executor')!.status,'idle');assert.equal(next.journal.pendingFor('executor').length,1);assert.equal(next.project.state.results(next.registry.get('executor')!).length,0);
 await next.halt(false,OWNER);await next.idle();assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.seat.id,'executor');assert.equal(next.journal.pendingFor('executor').length,0);assert.equal(next.registry.get('executor')!.status,'idle');
});
