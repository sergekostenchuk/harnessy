import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {withPathLock} from '@harnessy/team';
import {initProject} from '@harnessy/projects';
import {RuntimeError,createRuntime,withRoleActions} from './index.ts';
import {harness,promotionInput,OWNER,FakeProvider,completedActions,deferred,until} from './test-helpers.ts';
const actions=withRoleActions(completedActions),error=(code:string)=>(e:unknown)=>e instanceof RuntimeError&&e.code===code;

for(const path of ['assign','move','project'] as const)test('81: actual reply model survives '+path+' and restart without copying execution receipts',async t=>{
 const h=await harness(t,{actions}),r=h.runtime;
 h.provider.onRun=async(_seat,text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',model:'w2',sessionId:'s1',durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:text.includes('original question')?'source answer':'onboarding',sessionId:'s1'}};
 r.roomSet({model:'w1',folder:path!=='project'},OWNER);r.chat({pane:'room',message:'original question'},OWNER);await r.idle();assert.equal(r.registry.get('room')!.transcript.at(-1)!.model,'w2');
 let target='room';if(path==='move')await r.roomMove({path:join(h.dir,'destination'),create:true,git:false},OWNER);
 else {if(path==='project')await r.settingsPatch('owner',{projectsRoot:join(h.dir,'projects')},OWNER);const assigned=await r.assignRoomRole({...promotionInput(r),role:'orchestrator'},OWNER);target=assigned.pane.id}
 await r.idle();const original=r.registry.get(target)!.transcript.find(m=>m.role==='ai'&&m.text==='source answer')!;assert.ok(original);assert.equal(original.model,'w2');assert.equal(Object.hasOwn(original,'runtime'),path==='assign');assert.equal(Object.hasOwn(original,'deliverySeq'),path==='assign');if(path==='assign')assert.equal((original.provenance as any).pane,'room');
 const nextDir=r.project.dir;await r.close();const next=await createRuntime({...h.deps,projectDir:nextDir,providers:{claude:new FakeProvider()}},actions);t.after(()=>next.close());assert.equal(next.registry.get(target)!.transcript.find(m=>m.text==='source answer')!.model,'w2');
});

test('17/55: role catalogue, exact refusals, owner privilege and room history survive settings and restart',async t=>{
 const h=await harness(t),r=h.runtime;assert.equal(r.roleCatalog().find(x=>x.role==='executor')!.reason,'участников создаёт оркестратор по подтверждённому предложению');
 assert.throws(()=>r.roomSet({model:'missing'},OWNER),error('model_unknown'));await assert.rejects(r.assignRoomRole({role:'tester'},OWNER),error('proposal_required'));assert.throws(()=>r.roomSet({model:'w1'},{seat:'worker',trust:'agent'}),error('policy_denied'));
 r.roomSet({model:'w1',folder:false},OWNER);assert.equal(r.roleCatalog().find(x=>x.role==='executor')!.reason,'участников создаёт оркестратор по подтверждённому предложению');
 const room=r.registry.get('room')!;room.record('me','история');room.sessionId='session';r.roomSet({model:'w1'},OWNER);assert.equal(r.registry.get('room')!.sessionId,'session');r.roomSet({model:'w2'},OWNER);assert.equal(r.registry.get('room')!.sessionId,null);assert.equal(r.registry.get('room')!.transcript[0]!.text,'история');
 const old=await r.chatsNew({pane:'room',carry:'summary'},OWNER);assert.equal(old.carried,false);assert.equal(h.provider.calls.length,0);r.registry.get('room')!.record('ai','параллельный');const second=await r.chatsNew({pane:'room',carry:'none'},OWNER);assert.equal(r.project.state.chats.chats[old.chat.id]!.closed,null);assert.notEqual(second.chat.id,old.chat.id);
 await r.close();const next=await createRuntime(h.deps,actions);t.after(()=>next.close());assert.equal(next.registry.get('room')!.model,'w2');assert.equal(next.project.state.chats.active.room,second.chat.id);assert.equal(next.chatsList(OWNER).chats.filter(c=>c.pane==='room').length,3);
});

test('17/52/56: project from conversation has unique slug, real git, no seed model, transfers text once to real prompt',async t=>{
 const h=await harness(t,{actions}),r=h.runtime,root=join(h.dir,'projects');mkdirSync(join(root,'bystryy-poisk'),{recursive:true});await r.settingsPatch('owner',{projectsRoot:root},OWNER);r.roomSet({model:'w2',folder:false},OWNER);r.registry.get('room')!.record('me','Хочу быстрый поиск');r.registry.get('room')!.record('ai','Подготовим индекс');r.registry.get('room')!.sessionId='old-folder';r.registry.get('room')!.carry='ранние решения';r.project.state.savePanes(r.registry,r.journal);
 await assert.rejects(r.assignRoomRole({role:'executor'},OWNER),/участников создаёт оркестратор/);const out=await r.assignRoomRole({...promotionInput(r),role:'orchestrator'},OWNER);await r.idle();assert.equal(out.created,true);assert.match(out.project,/bystryy-poisk-[0-9a-f]+$/);assert.equal(out.pane.sessionId,null);assert.equal(existsSync(join(out.project,'.git')),true);assert.equal(existsSync(join(out.project,'.harness','MEMORY.md')),true);
 assert.equal(h.provider.calls.length,1);const actual=h.provider.calls[0]!;assert.equal(actual.seat.sessionId,null);assert.equal(actual.message.split('Владелец: Хочу быстрый поиск').length-1,1);assert.match(actual.message,/ранние решения/);assert.match(actual.message,/Папка проекта:/);assert.equal(r.registry.get('room')!.transcript.length,0);assert.equal(r.registry.get('orchestrator')!.carry,'');assert.equal(r.journal.read({limit:0}).filter(x=>x.origin==='onboarding').length,1);
});

test('56: roomMove uses snapshot and transfers old carry/history only once; project has no automatic orchestrator (102 cancels the seed invariant)',async t=>{
 const h=await harness(t,{actions}),r=h.runtime,destination=join(h.dir,'destination');r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','текст переезда');room.sessionId='source-session';room.carry='старый перенос';r.project.state.savePanes(r.registry,r.journal);
 const before=r.project.state.chats.active.room;const result=await r.roomMove({path:destination,create:true},OWNER);await r.idle();assert.equal(result.carried,true);assert.equal(result.pane.sessionId,null);assert.equal(h.provider.calls.length,0);assert.equal(r.registry.get('orchestrator'),null);assert.equal(r.journal.lastSeq,0);assert.equal(JSON.parse(readFileSync(join(h.dir,'.harness','state','chats.json'),'utf8')).active.room,before);
 r.chat({pane:'room',message:'после переезда'},OWNER);await r.idle();assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.message.split('Владелец: текст переезда').length-1,1);assert.match(h.provider.calls[0]!.message,/старый перенос/);assert.equal(r.registry.get('room')!.carry,'');
 await assert.rejects(r.onboard('orchestrator',OWNER),error('pane_unknown'));assert.equal(h.provider.calls.length,1);
});

test('154 cancels replacement: existing orchestrator keeps its session, vendor, cwd and history',async t=>{
 const codex=new FakeProvider('codex'),h=await harness(t,{actions,seats:'  orchestrator: {role: orchestrator, vendor: codex, model: c1, mode: read}',deps:{providers:{claude:new FakeProvider(),codex}}}),r=h.runtime;
 const target=r.registry.get('orchestrator')!,cwd=join(h.dir,'work');mkdirSync(cwd);target.cwd=cwd;target.record('ai','старый ответ роли');target.sessionId='existing';r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','новый разговор');
 await assert.rejects(r.assignRoomRole({...promotionInput(r),role:'orchestrator'},OWNER),error('orchestrator_exists'));assert.equal(target.cwd,cwd);assert.equal(target.sessionId,'existing');assert.equal(target.vendor,'codex');assert.equal(target.transcript[0]!.text,'старый ответ роли');assert.equal(codex.calls.length,0);
});

test('17/56: absent path, relative create and busy/reserved room refuse without changing active source',async t=>{
 const h=await harness(t),r=h.runtime;await assert.rejects(r.roomMove({path:h.dir},OWNER),error('room_missing'));r.roomSet({model:'w1'},OWNER);await assert.rejects(r.roomMove({path:'relative',create:true},OWNER),/нужен абсолютный путь папки/);await assert.rejects(r.roomMove({path:join(h.dir,'missing')},OWNER),/папки нет/);
 const gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};const turn=r.runTurn('room','вопрос');await until(()=>r.registry.get('room')!.busy);assert.throws(()=>r.roomSet({model:'w2'},OWNER),/разговор без роли сейчас отвечает/);await assert.rejects(r.assignRoomRole({...promotionInput(r),role:'orchestrator'},OWNER),error('busy'));await assert.rejects(r.roomMove({path:h.dir},OWNER),/идёт ход: переезд/);gate.resolve({text:'ответ',sessionId:null});await turn;
});

test('ОКНА/56: queued room move cannot close a project selected in the meantime',async t=>{
 const h=await harness(t,{actions}),r=h.runtime;const destination=join(h.dir,'destination'),other=join(h.dir,'other');await initProject(other,{git:false,orchestrator:false});r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','снимок');
 const held=deferred(),entered=deferred();const lock=withPathLock(destination,async()=>{entered.resolve();await held.promise});await entered.promise;const move=r.roomMove({path:destination,create:true},OWNER);await Promise.resolve();await r.openProject(other);held.resolve();await lock;await assert.rejects(move,error('project_changed'));assert.equal(r.project.dir,other);assert.equal(r.registry.get('room')!.model,'w1');assert.equal(r.registry.get('room')!.sessionId,null);assert.deepEqual(r.registry.get('room')!.transcript,[]); // 128: only the room model follows project selection; the queued move cannot transfer its conversation.
});

test('38/56: saved room with unavailable provider remains readable and queues input with typed no_provider',async t=>{
 const h=await harness(t),r=h.runtime;r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','сохранённое');r.project.state.savePanes(r.registry,r.journal);const id=r.project.state.chats.active.room;await r.close();const next=await createRuntime({...h.deps,providers:{}},completedActions);t.after(()=>next.close());assert.equal(next.project.state.chats.active.room,id);assert.equal(next.registry.get('room')!.transcript[0]!.text,'сохранённое');next.chat({pane:'room',message:'в очереди'},OWNER);await next.idle();assert.equal(next.journal.pendingFor('room').length,1);assert.equal(next.waiting('room')!.status,'unsent');assert.equal(next.waiting('room')!.failure?.code,'no_provider');await assert.rejects(next.runTurn('room','проверка'),error('uncertain'));
});

test('TS-36E: room project boundary survives rights changes and restart',async t=>{
 const h=await harness(t),r=h.runtime;
 r.roomSet({model:'w1',folder:h.dir},OWNER);const room=r.registry.get('room')!;
 r.paneSet('room',{mode:'chat',binding:r.paneBinding('room')},OWNER);
 assert.equal(room.mode,'chat');assert.equal(room.folderless,false);
 await r.close();const next=await createRuntime(h.deps,actions);t.after(()=>next.close());
 assert.equal(next.registry.get('room')!.mode,'chat');assert.equal(next.registry.get('room')!.folderless,false);
 next.roomSet({model:'w1',folder:false},OWNER);next.paneSet('room',{mode:'read',binding:next.paneBinding('room')},OWNER);
 assert.equal(next.registry.get('room')!.mode,'read');assert.equal(next.registry.get('room')!.folderless,true);
});
