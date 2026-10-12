import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRuntime} from './index.ts';
import {harness,OWNER,completedActions,collect} from './test-helpers.ts';

test('261: legacy transcript gets stable 1..N, the next message N+1; deletion never reuses ids after restart',async t=>{
 const old=[{role:'me',text:'личное',ts:1},{role:'ai',text:'ответ',ts:2}];
 const h=await harness(t,{before(dir){writeFileSync(join(dir,'.harness/state/chats.json'),JSON.stringify({active:{worker:'c1'},chats:{c1:{id:'c1',pane:'worker',title:'старый',created:1,closed:null,model:'w1',vendor:'claude',sessionId:null,transcript:old,carry:''}}}))}}),r=h.runtime;
 const first=r.chatGet('c1',OWNER).messages;assert.deepEqual(first,old.map((m,i)=>({...m,seq:i+1})));assert.deepEqual(r.chatGet('c1',OWNER).messages,first);
 const pane=r.registry.get('worker')!;pane.record('me','новая');assert.equal(pane.transcript.at(-1)!.seq,3);pane.transcript.pop();pane.transcript.shift();r.project.state.saveChats(r.registry);
 assert.equal(JSON.parse(readFileSync(r.project.state.chatsPath,'utf8')).chats.c1.transcriptSeq,3);
 await r.close();const next=await createRuntime(h.deps,completedActions);t.after(()=>next.close());const restored=next.registry.get('worker')!;restored.record('me','после удаления');
 assert.deepEqual(next.chatGet('c1',OWNER).messages.map(m=>m.seq),[2,4]);assert.equal(restored.transcript[0]!.text,'ответ');
 const fresh=await next.chatsNew({pane:'worker',carry:'none'},OWNER);restored.record('me','новый чат');assert.equal(restored.transcript[0]!.seq,1);
 await next.chatsOpen({chat:'c1',carry:'none'},OWNER);restored.record('me','вернулись');assert.deepEqual(next.chatGet('c1',OWNER).messages.map(m=>m.seq),[2,4,5]);assert.equal(next.chatGet(fresh.chat.id,OWNER).messages[0]!.seq,1);
});

test('261: live turn inputs and committed result carry the same chat-local ids in SSE and API',async t=>{
 const h=await harness(t),r=h.runtime,{events,sub}=collect(r);t.after(()=>sub.close());
 r.chat({pane:'worker',message:'вопрос'},OWNER);await r.idle();
 const chat=r.chatsList(OWNER).active.worker!,messages=r.chatGet(chat,OWNER).messages,done=events.find(e=>e.type==='done'&&e.pane==='worker')!;
 assert.ok(done);assert.equal(done.chat,chat);assert.equal(done.seq,messages.find(m=>m.role==='ai')!.seq);
 assert.deepEqual(done.messages,messages.filter(m=>m.role==='me').map(({seq,role,text,ts})=>({seq,role,text,ts})));
 assert.equal(new Set(messages.map(m=>m.seq)).size,messages.length);assert.ok(messages.every(m=>Number.isSafeInteger(m.seq)&&m.seq!>0));
});
