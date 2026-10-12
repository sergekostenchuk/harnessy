import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeError,createRuntime} from './index.ts';
import {harness,OWNER,completedActions} from './test-helpers.ts';
const seats='  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: false}\n  reviewer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read, digest: false}';
test('19: explicit selection sends one record to deduplicated targets; source remains active after restart',async t=>{
 const h=await harness(t,{seats}),r=h.runtime;await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','Разговор владельца');r.project.state.savePanes(r.registry,r.journal);const before=r.project.state.chats.active.room;
 const one=r.handoff({to:[' worker ','reviewer','worker'],chat:before,seqs:[room.transcript[0]!.seq]},OWNER);assert.equal(one.answers,0);assert.equal(one.names,'воркер, ревьюер');const rec=r.journal.get(one.seq)!;assert.deepEqual(rec.to,['worker','reviewer']);assert.equal(rec.origin,'handoff');assert.equal(rec.text,'Прочитай контекст чата от разговора без роли и жди команду.\n\n--- контекст чата ---\nВладелец: Разговор владельца');assert.equal(room.sessionId,null);assert.equal(r.project.state.chats.active.room,before);assert.match(room.transcript.at(-1)!.text,/контекст передан: воркер, ревьюер · запись №1/);
 room.record('ai','Ответ');const second=r.handoff({to:'worker',kind:'task',chat:before,seqs:[room.transcript.at(-1)!.seq]},OWNER);assert.equal(second.answers,1);assert.equal(r.journal.get(second.seq)!.thread,'T2');assert.equal(h.provider.calls.length,0);
 await r.close();const next=await createRuntime(h.deps,completedActions);t.after(()=>next.close());assert.equal(next.project.state.chats.active.room,before);assert.equal(next.registry.get('room')!.transcript[0]!.text,'Разговор владельца');assert.equal(next.registry.get('room')!.transcript.filter(x=>x.text.startsWith('[от харнесс] контекст передан')).length,2);
});
test('260: selection is required for any history; selected text limit counts Unicode points',async t=>{
 const {runtime:r}=await harness(t,{seats});await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','Начало');const chat=r.chatsList(OWNER).active.room;
 for(const seqs of [undefined,[]])assert.throws(()=>r.handoff({to:'worker',chat,seqs},OWNER),e=>e instanceof RuntimeError&&e.code==='selection_invalid'&&e.status===400);assert.equal(r.journal.lastSeq,0);
 room.record('ai','🧠'.repeat(60001));const out=r.handoff({to:'worker',chat,seqs:[room.transcript.at(-1)!.seq],prompt:''},OWNER);const text=r.journal.get(out.seq)!.text;
 assert.equal([...text].length,60000+[...'\n…(обрезано)'].length);assert.ok(text.endsWith('🧠\n…(обрезано)'));assert.doesNotMatch(text,/Начало/);
});
test('19/55: absent source/targets, self, invalid kind and forged owner refuse whole handoff',async t=>{
 const {runtime:r}=await harness(t,{seats});await r.halt(true,OWNER);for(const input of [{to:[]},{to:'missing'},{to:'worker'}])assert.throws(()=>r.handoff(input,OWNER),e=>e instanceof RuntimeError);r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','не терять');
 for(const [input,code] of [[{to:['worker','missing']},'pane_unknown'],[{to:'room'},'self_addressed'],[{to:'worker',kind:'report'},'kind_unknown']] as const)assert.throws(()=>r.handoff(input,OWNER),e=>e instanceof RuntimeError&&e.code===code);assert.throws(()=>r.handoff({to:'worker',text:'готово'},{seat:'worker',trust:'agent'}),e=>e instanceof RuntimeError&&e.code==='policy_denied');assert.equal(r.journal.lastSeq,0);assert.equal(r.registry.get('room')!.transcript.length,1);
});
