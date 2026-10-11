import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadTeam} from '@harnessy/team';
import {createActions,RuntimeError} from '@harnessy/runtime';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {invokeTool} from '../../providers/src/tools.ts';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';
const refusal={ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'};
const seats='  orchestrator: {kind: worker, role: orchestrator, label: Оркестратор, vendor: claude, model: w1, mode: read}\n  lead: {kind: orchestrator, role: юрист-руководитель, label: Тимлид, vendor: claude, model: w1, mode: read}\n  peer: {kind: reviewer, role: orchestrator, label: Владелец, vendor: claude, model: w1, mode: read}';
const policy='version: 1\nroutes: [{from: executor, to: reviewer, kinds: [note]}, {from: orchestrator, to: owner, kinds: [status]}]\nobserve: {orchestrator: "*", executor: []}\n';
const before=(dir:string)=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),policy);

for(const entrance of ['projectCreate','roomMove'])test('102: '+entrance+' creates no participant or onboarding and preserves the selected conversation model',async t=>{
 const h=await fixture(t),r=h.runtime,path=join(h.dir,'legal-'+entrance);
 if(entrance==='roomMove'){r.roomSet({model:'w2',folder:false},OWNER);r.registry.get('room')!.record('me','Обсуждаем иск.');r.registry.get('room')!.record('ai','Сохранённый контекст.');r.project.state.savePanes(r.registry,r.journal)}
 const response=await call(h.api,entrance==='projectCreate'?'/api/project/create':'/api/room/move',{body:{path,git:false,...(entrance==='roomMove'?{create:true}:{})}});assert.equal(response.status,200,response.text);
 assert.deepEqual(Object.keys(loadTeam(join(path,'.harness')).seats),[]);assert.deepEqual(r.registry.ids,['room']);assert.equal(r.journal.lastSeq,0);assert.equal(h.provider.calls.length,0);assert.equal(existsSync(r.project.state.materializationPath),false);
 const list=(await call(h.api,'/api/chats')).body,id=list.active.room;assert.equal(list.chats.length,1);assert.equal(list.chats[0].model,entrance==='projectCreate'?null:'w2');assert.equal(list.chats[0].messages,entrance==='projectCreate'?0:2);
 if(entrance==='projectCreate'){assert.equal(response.body.orchestrator,false);assert.equal(response.body.seats,0);const denied=await call(h.api,'/api/chat',{body:{pane:'room',message:'Без выбора модели'}});assert.equal(denied.status,400);assert.equal(denied.body.code,'model_required');assert.equal(r.journal.lastSeq,0);await assert.rejects(r.runTurn('room','Без модели'),(e:unknown)=>e instanceof RuntimeError&&e.code==='model_required')}
 else assert.match(r.registry.get('room')!.carry,/Обсуждаем иск/);
 const disk=JSON.parse(readFileSync(join(path,'.harness/state/chats.json'),'utf8'));assert.equal(disk.chats[id].model,entrance==='projectCreate'?null:'w2');assert.equal(disk.chats[id].sessionId,null);
 await r.closeProject();await r.openProject(path);assert.equal(r.project.state.chats.active.room,id);assert.equal(r.registry.get('room')!.model,entrance==='projectCreate'?'':'w2');assert.equal(h.provider.calls.length,0);
 if(entrance==='projectCreate'){await call(h.api,'/api/room',{body:{model:'w2'}});assert.equal(r.project.state.chats.active.room,id);assert.equal((await call(h.api,'/api/chats/'+id)).body.chat.model,'w2')}
});

test('83/r2: first POST chats/new in a project with a team and no room saves exactly one room chat',async t=>{
 const h=await fixture(t),r=h.runtime;assert.equal(r.registry.get('room'),null);
 const before=(await call(h.api,'/api/chats')).body;assert.equal(before.chats.some((c:any)=>c.pane==='room'),false);
 const added=await call(h.api,'/api/chats/new',{body:{pane:'room',carry:'none'}});assert.equal(added.status,200,added.text);const id=added.body.chat.id;
 const list=(await call(h.api,'/api/chats')).body,rooms=list.chats.filter((c:any)=>c.pane==='room');assert.equal(rooms.length,1);assert.equal(rooms[0].id,id);assert.equal(rooms[0].active,true);assert.equal(rooms[0].closed,null);assert.equal(rooms[0].model,null);assert.equal(rooms[0].messages,0);assert.deepEqual(list.chats.filter((c:any)=>c.pane!=='room'),before.chats);
 const disk=JSON.parse(readFileSync(r.project.state.chatsPath,'utf8'));assert.deepEqual(Object.values(disk.chats).filter((c:any)=>c.pane==='room').map((c:any)=>c.id),[id]);assert.equal(disk.active.room,id);
 await r.closeProject();await r.openProject(h.dir);assert.equal(r.project.state.chats.active.room,id);assert.equal((await call(h.api,'/api/chats')).body.chats.filter((c:any)=>c.pane==='room').length,1);
 r.registry.get('room')!.record('me','Сохранить в первом разговоре.');
 const second=await call(h.api,'/api/chats/new',{body:{pane:'room',carry:'none'}});assert.equal(second.status,200);assert.notEqual(second.body.chat.id,id);assert.equal(second.body.chat.messages,0);
 const after=(await call(h.api,'/api/chats')).body;assert.equal(after.chats.filter((c:any)=>c.pane==='room').length,2);assert.equal(after.active.room,second.body.chat.id);assert.equal((await call(h.api,'/api/chats/'+id)).body.messages[0].text,'Сохранить в первом разговоре.');assert.equal(h.provider.calls.length,0);
});

test('83/102: a saved empty conversation with model:null restores its own unselected state after another chat selected a model',async t=>{
 const h=await fixture(t),path=join(h.dir,'empty');await call(h.api,'/api/project/create',{body:{path,git:false}});const r=h.runtime,first=r.project.state.chats.active.room!;
 const created=await call(h.api,'/api/chats/new',{body:{pane:'room',carry:'none'}});assert.equal(created.status,200);assert.equal(created.body.chat.model,null);assert.notEqual(created.body.chat.id,first);
 await call(h.api,'/api/room',{body:{model:'w2'}});const opened=await call(h.api,'/api/chats/open',{body:{chat:first}});assert.equal(opened.status,200);assert.equal(opened.body.chat.model,null);assert.equal(opened.body.pane.model,'');
 await r.closeProject();await r.openProject(path);assert.equal(r.project.state.chats.active.room,first);assert.equal(r.registry.get('room')!.model,'');assert.equal(r.context('room').chat!.model,null);assert.equal(h.provider.calls.length,0);
});

test('83/153: existing team/history stays intact and every real seat is saved before any model call',async t=>{
 const h=await fixture(t,{seats,before}),r=h.runtime,original=readFileSync(join(h.dir,'.harness/team.yaml'));
 const list=(await call(h.api,'/api/chats')).body;assert.deepEqual(list.chats.map((c:any)=>c.pane).sort(),['lead','orchestrator','peer']);assert.equal(list.chats.every((c:any)=>c.messages===0),true);assert.equal(h.provider.calls.length,0);assert.deepEqual(readFileSync(join(h.dir,'.harness/team.yaml')),original);
 const id=list.active.orchestrator;r.registry.get('orchestrator')!.record('me','История юриста.');r.registry.get('orchestrator')!.record('ai','Его ответ.');r.registry.get('orchestrator')!.sessionId='saved-session';r.project.state.savePanes(r.registry,r.journal);
 await r.closeProject();await r.openProject(h.dir);assert.equal(r.project.state.chats.active.orchestrator,id);assert.equal(r.registry.get('orchestrator')!.sessionId,'saved-session');assert.equal(r.registry.get('orchestrator')!.transcript[1]!.text,'Его ответ.');assert.deepEqual(readFileSync(join(h.dir,'.harness/team.yaml')),original);assert.equal(h.provider.calls.length,0);
 const status=(await call(h.api,'/api/status')).body;assert.equal(status.hasOrchestrator,true);assert.deepEqual(status.panes.map((p:any)=>p.kind),['worker','orchestrator','reviewer']);assert.equal(status.roleCatalog.find((p:any)=>p.kind==='orchestrator').available,false);
});

test('153: kind alone selects channel policy, direct confirmation, section recipient and observation despite forged names',async t=>{
 const h=await fixture(t,{seats,before}),r=h.runtime;await r.halt(true,OWNER);assert.equal(r.registry.roleOf('orchestrator'),'worker');assert.equal(r.registry.roleOf('lead'),'orchestrator');assert.equal(r.registry.roleOf('missing'),null);
 assert.throws(()=>r.channel.post({to:'owner',kind:'status',text:'Не полномочие владельца'},{seat:'orchestrator',trust:'agent'}),(e:any)=>e.code==='policy_denied');
 assert.equal(r.channel.post({to:'peer',kind:'note',text:'Разрешено executor → reviewer'},{seat:'orchestrator',trust:'agent'}).from,'orchestrator');assert.equal(r.registry.canObserve('orchestrator','peer'),false);assert.equal(r.registry.canObserve('lead','peer'),true);
 const fake=await call(h.api,'/api/chat',{body:{pane:'orchestrator',message:'Без прямого подтверждения',kind:'task'}});assert.equal(fake.status,409);assert.equal(fake.body.needDirect,true);
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'lead',message:'Поручение руководителю'}})).status,200);
 const section=await call(h.api,'/api/project/sections/research');assert.equal(section.body.orchestrator.pane,'lead');const request=await call(h.api,'/api/project/sections/research/request',{body:{project:h.dir,text:'Проведи исследование',pane:'orchestrator'}});assert.equal(request.status,200);assert.equal(request.body.pane,'lead');assert.deepEqual(r.journal.get(request.body.seq)!.to,['lead']);
 const updated=await call(h.api,'/api/panes/orchestrator',{body:{kind:'orchestrator',role:'owner',label:'owner',model:'w2'}});assert.equal(updated.body.pane.kind,'worker');assert.equal(updated.body.pane.role,'orchestrator');assert.equal(r.registry.canObserve('orchestrator','peer'),false);assert.equal(h.provider.calls.length,0);
});

test('153: SDK readPane and merge use the active verified kind, never the seat name or domain role',async t=>{
 const h=await fixture(t,{seats,before,actions:createActions()}),r=h.runtime,results:any={};
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();results[seat.id]={read:await ctx.tools.readPane({pane:'peer'}),merge:await r.merge(r.project.active.get(seat.id)!.scope,{sha:'a'.repeat(40)})};return {text:'Готово.',sessionId:null}};
 await r.runTurn('orchestrator','Попытка');await r.runTurn('lead','Попытка');assert.equal(results.orchestrator.read.code,'policy_denied');assert.equal(results.orchestrator.merge.code,'policy_denied');assert.equal(results.lead.read.ok,true);assert.equal(results.lead.merge.code,'no_repo');
});

// 156 opens the proposal-reference door only to a live bridge token; the legacy argument shape stays refused.
test('153/156: all old owner creation doors refuse without effects, including owner-shaped payloads and fake proposal references',async t=>{
 const h=await fixture(t),r=h.runtime,manifest=readFileSync(join(h.dir,'.harness/team.yaml'));
 for(const route of ['/api/seats','/api/assign'])for(const body of [{role:'executor',model:'w1'},{role:'tester',model:'w2',from:'owner',trust:'owner',kind:'orchestrator',label:'owner'},{role:'reviewer',proposalId:'made-up',version:1}]){const reply=await call(h.api,route,{body});if(route==='/api/seats'&&'proposalId' in body){assert.equal(reply.status,403);assert.equal(reply.body.code,'token_invalid')}else {assert.equal(reply.status,409);assert.deepEqual(reply.body,refusal)}}
 await assert.rejects(r.createSeat({role:'orchestrator'},OWNER),(e:any)=>e.code==='proposal_required');assert.deepEqual(readFileSync(join(h.dir,'.harness/team.yaml')),manifest);assert.equal(existsSync(r.project.state.materializationPath),false);assert.deepEqual(r.registry.ids,['worker']);assert.equal(r.journal.lastSeq,0);assert.equal(h.provider.calls.length,0);
});

test('153: Claude SDK and real Codex MCP → HTTP cannot bypass the deprecated assignment guard or invoke a custom action port',async t=>{
 let portCalls=0;const h=await fixture(t,{actions:{...completedActions,async assignRole(){portCalls++;return {ok:true,pane:'forged',label:'owner',model:'w1',mode:'all',mandate:1}}}}),r=h.runtime,finish=deferred<{text:string;sessionId:null}>();
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.registerProcessToken('kind-token');ctx.signal.addEventListener('abort',()=>finish.resolve({text:'',sessionId:null}),{once:true});return finish.promise};const run=r.runTurn('worker','Задача');await until(()=>h.provider.calls.length===1);const ctx=h.provider.calls[0]!.ctx;
 assert.deepEqual(await invokeTool('assign_role',{role:'tester'},ctx),refusal);
 const reply=await call(h.api,'/api/assign_role',{body:{from:'worker',role:'tester',kind:'orchestrator',trust:'owner'},headers:{'X-Pane-Token':'kind-token'}});assert.deepEqual(reply.body,refusal);
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../providers/bin/pane-mcp.mjs',import.meta.url))],{env:{...process.env,APP_URL:h.api.url,PANE_ID:'worker',PANE_TOKEN:'kind-token',SEATS:'worker:Юрист'},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
 const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'assign_role',arguments:{role:'reviewer',model:'w1'}}})+'\n');assert.equal(await exited,0,stderr);
 const response=JSON.parse(stdout.trim().split('\n').at(-1)!);assert.equal(response.result.isError,true);assert.match(response.result.content[0].text,/участников создаёт оркестратор по подтверждённому предложению/);assert.equal(portCalls,0);assert.equal(existsSync(r.project.state.materializationPath),false);assert.deepEqual(r.registry.ids,['worker']);
 finish.resolve({text:'Завершён.',sessionId:null});await run;assert.deepEqual(await ctx.tools.assignRole({role:'tester'}),{ok:false,code:'turn_ended',error:'ход не активен'});
});
