import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeError,createRuntime} from './index.ts';
import {harness,OWNER,completedActions} from './test-helpers.ts';
const seats='  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: false}\n  reviewer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read, digest: false}';
test('19: zero/one answer sends one record to deduplicated targets; source remains active after restart',async t=>{
 const h=await harness(t,{seats}),r=h.runtime;await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','Разговор владельца');r.project.state.savePanes(r.registry,r.journal);const before=r.project.state.chats.active.room;
 const one=r.handoff({to:[' worker ','reviewer','worker']},OWNER);assert.equal(one.answers,0);assert.equal(one.names,'воркер, ревьюер');const rec=r.journal.get(one.seq)!;assert.deepEqual(rec.to,['worker','reviewer']);assert.equal(rec.origin,'handoff');assert.equal(rec.text,'Прочитай контекст чата от разговора без роли и жди команду.\n\n--- контекст чата ---\nВладелец: Разговор владельца');assert.equal(room.sessionId,null);assert.equal(r.project.state.chats.active.room,before);assert.match(room.transcript.at(-1)!.text,/контекст передан: воркер, ревьюер · запись №1/);
 room.record('ai','Ответ');const second=r.handoff({to:'worker',kind:'task'},OWNER);assert.equal(second.answers,1);assert.equal(r.journal.get(second.seq)!.thread,'T2');assert.equal(h.provider.calls.length,0);
 await r.close();const next=await createRuntime(h.deps,completedActions);t.after(()=>next.close());assert.equal(next.project.state.chats.active.room,before);assert.equal(next.registry.get('room')!.transcript[0]!.text,'Разговор владельца');assert.equal(next.registry.get('room')!.transcript.filter(x=>x.text.startsWith('[от харнесс] контекст передан')).length,2);
});
test('19: two answers require selection; explicit text limit and default transcript limit count Unicode points',async t=>{
 const {runtime:r}=await harness(t,{seats});await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','Начало');room.record('ai','один');room.record('ai','два');assert.throws(()=>r.handoff({to:'worker'},OWNER),e=>e instanceof RuntimeError&&e.code==='selection_required'&&e.fields.needSelection===true&&e.fields.answers===2);assert.equal(r.journal.lastSeq,0);
 const out=r.handoff({to:'worker',text:'🧠'.repeat(60001)},OWNER);assert.equal(r.journal.get(out.seq)!.text,'🧠'.repeat(60000)+'\n…(обрезано)');assert.equal(out.chars,60000+[...'\n…(обрезано)'].length);
 room.transcript=[];room.record('me','🧠'.repeat(20000));const limited=r.handoff({to:'worker'},OWNER);const text=r.journal.get(limited.seq)!.text;assert.ok([...text].length<12150);assert.ok(text.endsWith('🧠'.repeat(12000)));assert.match(text,/контекст чата ---\n…/);
});
test('19/55: absent source/targets, self, invalid kind and forged owner refuse whole handoff',async t=>{
 const {runtime:r}=await harness(t,{seats});await r.halt(true,OWNER);for(const input of [{to:[]},{to:'missing'},{to:'worker'}])assert.throws(()=>r.handoff(input,OWNER),e=>e instanceof RuntimeError);r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','не терять');
 for(const [input,code] of [[{to:['worker','missing']},'pane_unknown'],[{to:'room'},'self_addressed'],[{to:'worker',kind:'report'},'kind_unknown']] as const)assert.throws(()=>r.handoff(input,OWNER),e=>e instanceof RuntimeError&&e.code===code);assert.throws(()=>r.handoff({to:'worker',text:'готово'},{seat:'worker',trust:'agent'}),e=>e instanceof RuntimeError&&e.code==='policy_denied');assert.equal(r.journal.lastSeq,0);assert.equal(r.registry.get('room')!.transcript.length,1);
});
