import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {RuntimeError,createRuntime} from './index.ts';
import {SUMMARY_PROMPT} from './chats.ts';
import {jsonClone} from './state.ts';
import {harness,OWNER,deferred,until,completedActions,FakeProvider} from './test-helpers.ts';
const error=(code:string,text?:string)=>(e:unknown)=>e instanceof RuntimeError&&e.code===code&&(!text||e.message===text);

function history(r:Awaited<ReturnType<typeof harness>>['runtime']) {
 const p=r.registry.get('worker')!;p.record('me','Первая строка\nещё');p.record('ai','Ответ 🧠');p.transcript[1]!.extra='сохранить';r.project.state.savePanes(r.registry,r.journal);return r.project.state.activeChat(p,false)!;
}

test('20/51: role new text/none closes old, open only text carries; extra message fields survive',async t=>{
 const {runtime:r}=await harness(t),first=history(r),newer=await r.chatsNew({pane:'worker'},OWNER);
 assert.notEqual(newer.chat.id,first.id);assert.equal(first.closed!==null,true);assert.equal(newer.carried,true);assert.equal(newer.pane.sessionId,null);assert.match(r.registry.get('worker')!.carry,/Контекст прежнего чата «воркер» \(Первая строка\)/);
 r.registry.get('worker')!.record('me','Новая реплика');r.project.state.savePanes(r.registry,r.journal);
 const opened=await r.chatsOpen({chat:first.id,carry:'summary'},OWNER);assert.equal('carried' in opened&&opened.carried,false);assert.equal(first.closed,null);assert.equal(r.chatGet(first.id,OWNER).messages[1]!.extra,'сохранить');assert.deepEqual(r.registry.get('worker')!.seen,{});
 const again=await r.chatsOpen({chat:first.id},OWNER);assert.equal('already' in again&&again.already,true);
 await r.chatsNew({pane:'worker',carry:'none'},OWNER);assert.equal(r.registry.get('worker')!.carry,'');assert.equal(first.closed!==null,true);assert.equal(r.chatsList(OWNER).chats.length,3);
});

test('20/28: summary uses exact prompt, belongs to old chat, and does not consume pending input',async t=>{
 const {runtime:r,provider:f}=await harness(t),old=history(r);await r.halt(true,OWNER);r.postOwner({to:'worker',kind:'task',text:'очередь'},OWNER);await r.idle();
 // Keep the pending input; enable launches without kicking the queue during this diagnostic scenario.
 r.project.halted=false;f.onRun=async(_s,prompt,ctx)=>{ctx.modelStarted?.();return {text:prompt===SUMMARY_PROMPT?' Решено: один шаг. ':'ответ очереди',sessionId:'summary-session'}};
 const result=await r.chatsNew({pane:'worker',carry:'summary'},OWNER);assert.equal(result.carried,true);assert.match(r.registry.get('worker')!.carry,/Выжимка прежнего чата/);assert.equal(old.transcript.at(-1)!.text,' Решено: один шаг. ');assert.equal(old.closed!==null,true);
 // The summary's durable receipt has deliverySeq zero: it did not claim the queued task.
 assert.equal(old.transcript.at(-1)!.deliverySeq,0);assert.deepEqual((old.transcript.at(-1)!.runtime as {recordSeqs:number[]}).recordSeqs,[]);
 f.onRun=null;await r.idle();assert.equal(f.calls[0]!.message,SUMMARY_PROMPT);assert.equal(r.journal.cursors.worker,r.journal.lastSeq);
});

test('28: halted/failed summary leaves the active chat; post-launch stop cannot switch it',async t=>{
 const {runtime:r,provider:f}=await harness(t),old=history(r);await r.halt(true,OWNER);await assert.rejects(r.chatsNew({pane:'worker',carry:'summary'},OWNER),error('summary_failed'));assert.equal(f.calls.length,0);assert.equal(old.closed,null);
 r.project.halted=false;f.onRun=async()=>{throw Error('нет транспорта до запуска')};await assert.rejects(r.chatsNew({pane:'worker',carry:'summary'},OWNER),/выжимка не получилась: нет транспорта/);assert.equal(r.project.state.chats.active.worker,old.id);assert.equal(old.closed,null);
 const gate=deferred<{text:string;sessionId:string}>();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};const next=r.chatsNew({pane:'worker',carry:'summary'},OWNER);await until(()=>r.registry.get('worker')!.busy);r.interrupt('worker',OWNER);gate.resolve({text:'частичная выжимка',sessionId:'s'});await assert.rejects(next,/выжимка не получилась: ход отменён/);assert.equal(r.project.state.chats.active.worker,old.id);assert.equal(old.closed,null);
});

test('20: reservation prevents settings/new/open/session races while summary awaits',async t=>{
 const {runtime:r,provider:f}=await harness(t);const old=history(r),gate=deferred<{text:string;sessionId:string}>();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};
 const next=r.chatsNew({pane:'worker',carry:'summary'},OWNER);await until(()=>r.registry.get('worker')!.busy);
 await assert.rejects(r.chatsNew({pane:'worker'},OWNER),error('busy'));await assert.rejects(r.chatsOpen({chat:old.id},OWNER),error('busy'));assert.throws(()=>r.paneSet('worker',{model:'w2'},OWNER));await assert.rejects(r.openSession('worker','x',OWNER));assert.equal(f.messageCalls,0);
 gate.resolve({text:'готово',sessionId:'s'});await next;
});

test('20/51: missing pane/chat, carry, removed seat and forged initiator are typed failures',async t=>{
 const {runtime:r}=await harness(t),old=history(r),agent={seat:'worker',trust:'agent'} as const;
 await assert.rejects(r.chatsNew({pane:'missing'},OWNER),error('pane_unknown','нет такого места'));await assert.rejects(r.chatsNew({pane:'worker',carry:'bad'},OWNER),error('carry_invalid'));
 await assert.rejects(r.chatsOpen({chat:'missing'},OWNER),error('chat_unknown'));assert.throws(()=>r.chatGet('missing',OWNER),error('chat_unknown'));
 for(const fn of [()=>r.chatsList(agent),()=>r.chatGet(old.id,agent)])assert.throws(fn,error('policy_denied'));await assert.rejects(r.chatsNew({pane:'worker'},agent),error('policy_denied'));await assert.rejects(r.chatsOpen({chat:old.id},agent),error('policy_denied'));
 r.registry.panes.delete('worker');await assert.rejects(r.chatsOpen({chat:old.id},OWNER),error('pane_unknown','место этого чата больше не существует'));assert.equal(r.chatsList(OWNER).chats[0]!.role,null);
});

test('55: pins derive real chat metadata; title and unknown transcript fields round-trip after restart',async t=>{
 const h=await harness(t),{runtime:r}=h,old=history(r);await r.pinSet({kind:'chat',path:h.dir,chat:old.id,on:true},OWNER);assert.equal(r.pinsGet(OWNER).pins[0]!.title,'Первая строка');
 const source=jsonClone(r.project.state.chats);await r.close();const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},completedActions);t.after(()=>next.close());assert.equal(next.chatGet(old.id,OWNER).messages[1]!.extra,'сохранить');assert.equal(next.chatGet(old.id,OWNER).chat.title,'Первая строка');assert.deepEqual(next.project.state.chats,source);
});

test('57: durable final result stores current usage/duration, absent terminal never borrows previous usage',async t=>{
 const h=await harness(t),{runtime:r,provider:f}=h;await r.runTurn('worker','один');const first=r.registry.get('worker')!.transcript.at(-1)!;assert.deepEqual(first.usage,{input:20,output:3,cacheRead:7});assert.equal(first.durationMs,5);
 f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return {text:'два',sessionId:null}};await r.runTurn('worker','два');const second=r.registry.get('worker')!.transcript.at(-1)!;assert.equal(Object.hasOwn(second,'usage'),false);assert.equal(Object.hasOwn(second,'durationMs'),false);
 f.onRun=async(seat,_m,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:0,usage:{input:0,output:0,cacheRead:null}});return {text:'три',sessionId:null}};await r.runTurn('worker','три');const third=r.registry.get('worker')!.transcript.at(-1)!;assert.deepEqual(third.usage,{input:0,output:0,cacheRead:null});assert.equal(third.durationMs,0);
 const disk=JSON.parse(readFileSync(join(h.dir,'.harness','state','chats.json'),'utf8'));assert.deepEqual(disk.chats[disk.active.worker].transcript[0].usage,first.usage);
});

test('20/55/57: Python chats golden round-trips byte for byte with floats, metadata and null/zero usage',async t=>{
 const golden=readFileSync(new URL('../fixtures/chats-ts04b-python.json',import.meta.url),'utf8'),h=await harness(t,{before:dir=>writeFileSync(join(dir,'.harness','state','chats.json'),golden)}),r=h.runtime;
 const listed=r.chatsList(OWNER);assert.equal(listed.chats[0]!.title,'Тема 🧠');assert.equal(listed.chats[0]!.last,1791500001);r.chatGet(listed.chats[0]!.id,OWNER);assert.equal(readFileSync(r.project.state.chatsPath,'utf8'),golden);assert.equal(r.registry.get('worker')!.sessionId,'old-session');
});

test('57: session retry only copies final done and an interrupted result never borrows earlier turn usage',async t=>{
 const {ProviderError}=await import('@harnessy/providers'),{runtime:r,provider:f}=await harness(t);r.registry.get('worker')!.sessionId='missing';let tries=0;
 f.onRun=async(s,_m,ctx)=>{tries++;ctx.modelStarted?.();if(s.sessionId){ctx.publish({type:'done',sessionId:s.sessionId,model:s.model,durationMs:99,usage:{input:99,output:99,cacheRead:99}});throw new ProviderError('session_missing','missing')}
 ctx.publish({type:'done',sessionId:null,model:s.model,durationMs:0,usage:{input:null,output:0,cacheRead:0}});return {text:'повтор',sessionId:null}};
 await r.runTurn('worker','повтор');assert.equal(tries,2);assert.deepEqual(r.registry.get('worker')!.transcript.at(-1)!.usage,{input:null,output:0,cacheRead:0});assert.equal(r.registry.get('worker')!.transcript.at(-1)!.durationMs,0);
 const gate=deferred<{text:string;sessionId:null}>();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};const turn=r.runTurn('worker','стоп');await until(()=>r.registry.get('worker')!.busy);r.interrupt('worker',OWNER);gate.resolve({text:'часть',sessionId:null});await turn;const result=r.registry.get('worker')!.transcript.at(-1)!;assert.equal(Object.hasOwn(result,'usage'),false);assert.equal(Object.hasOwn(result,'durationMs'),false);assert.equal((result.runtime as {interrupted:boolean}).interrupted,true);
});

test('20 ОКНА: in-flight session read cannot overwrite a chat reserved by a later new-chat operation',async t=>{
 const {withPathLock}=await import('@harnessy/team'),{runtime:r,provider:f}=await harness(t);history(r);const msgs=deferred<{role:'ai';text:string}[]>(),held=deferred(),entered=deferred();f.onMessages=()=>msgs.promise;
 const read=r.openSession('worker','external',OWNER),lock=withPathLock(r.project.dir,async()=>{entered.resolve();await held.promise});await entered.promise;
 const next=r.chatsNew({pane:'worker',carry:'none'},OWNER);msgs.resolve([{role:'ai',text:'чужая сессия'}]);await assert.rejects(read,error('stale_session'));held.resolve();await lock;await next;assert.equal(r.registry.get('worker')!.sessionId,null);assert.equal(r.registry.get('worker')!.transcript.length,0);
});
