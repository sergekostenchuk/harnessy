import {promotionInput} from '../../runtime/src/test-helpers.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {createActions} from '@harnessy/runtime';
import {GitOps,execute} from '@harnessy/projects';
import {ProviderError} from '@harnessy/providers';
import {MODES as PROVIDER_MODES} from '../../providers/src/modes.ts';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';
const seats='  orch: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read}\n  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}';
const keys=(object:object)=>Object.keys(object).sort();

test('1/19: golden pins/settings/project/dir/halt/room forms via actual HTTP ports',async t=>{
 const h=await fixture(t);assert.deepEqual((await call(h.api,'/api/pins')).body,{pins:[]});
 const pin=await call(h.api,'/api/pins',{body:{kind:'folder',path:h.dir}});assert.deepEqual(keys(pin.body),['ok','on','pins']);assert.equal(pin.body.on,true);assert.equal(pin.body.pins[0].current,undefined);assert.equal((await call(h.api,'/api/pins')).body.pins[0].current,true);
 assert.deepEqual((await call(h.api,'/api/pins',{body:{}})).body,{ok:false,error:'kind: folder или chat; path обязателен'});
 const before=await call(h.api,'/api/settings');assert.deepEqual(before.body,{ok:true,owner:{},project:{},effective:{},applies:{defaultMode:'режим прав новой роли, если владелец не выбрал',projectsRoot:'куда создаётся проект из разговора без проекта'}});
 assert.deepEqual((await call(h.api,'/api/settings',{body:{scope:'bad',patch:{a:1}}})).body,{ok:false,error:'scope: owner или project; patch — объект ключ → значение'});
 const setting=await call(h.api,'/api/settings',{raw:'{"scope":"project","patch":{"defaultMode":"ask","float":1.0}}'});assert.equal(setting.status,200);assert.deepEqual(setting.body.saved,{defaultMode:'ask',float:1});assert.equal(setting.body.effective.defaultMode,'ask');assert.deepEqual(keys(setting.body),['applies','effective','ok','saved','scope','ts']);
 assert.deepEqual((await call(h.api,'/api/dir?cwd='+encodeURIComponent(h.dir))).body,{ok:true,cwd:h.dir,hasHarness:true});assert.equal((await call(h.api,'/api/dir')).status,400);
 assert.deepEqual((await call(h.api,'/api/project',{body:{path:h.dir}})).body,{ok:true,project:h.dir,changed:false});
 const halt=await call(h.api,'/api/halt',{body:{on:true}});assert.deepEqual(halt.body,{ok:true,halted:true,interrupted:[],pending:{}});
 const room=await call(h.api,'/api/room',{body:{model:'w1',folder:h.dir}});assert.equal(room.status,200);assert.deepEqual(keys(room.body),['ok','pane','previousModel']);assert.equal(room.body.pane.id,'room');assert.deepEqual(room.body.pane.settingsBinding,h.runtime.paneBinding('room'));
 const projects=await call(h.api,'/api/projects');assert.equal(projects.body.current,h.dir);assert.equal(projects.body.projects[0].seats,1);assert.equal(projects.body.projects[0].hasTeam,true);
 const unknown=await call(h.api,'/api/context/nope');assert.deepEqual(unknown.body,{ok:false,error:'нет такого места'});assert.equal(unknown.status,404);
 assert.equal((await call(h.api,'/api/context/worker')).body.ok,true);
});

test('TS-49.2 r3: room receipt binds the previous model and saved model to the active chat and project instance',async t=>{
 const h=await fixture(t);const first=await call(h.api,'/api/room',{body:{model:'w1',vendor:'claude',folder:true}});assert.equal(first.status,200,first.text);
 const original=h.runtime.chatsList(OWNER).active.room!;const next=await h.runtime.chatsNew({pane:'room',carry:'none'},OWNER);
 const changed=await call(h.api,'/api/room',{body:{model:'w2',vendor:'claude',folder:true}});assert.equal(changed.status,200,changed.text);
 assert.deepEqual(changed.body.previousModel,{model:'w1',vendor:'claude'});assert.deepEqual(changed.body.pane.settingsBinding,h.runtime.paneBinding('room'));assert.equal(changed.body.pane.settingsBinding.project,h.dir);assert.equal(changed.body.pane.settingsBinding.chat,next.chat.id);assert.ok(changed.body.pane.settingsBinding.instanceId);
 assert.equal((await call(h.api,'/api/chats/'+original)).body.chat.model,'w1');assert.equal((await call(h.api,'/api/chats/'+next.chat.id)).body.chat.model,'w2');
});

test('TS-43: project chat metadata is owner-only before any registered project is read',async t=>{
 const h=await fixture(t),other=join(h.dir,'foreign-project');mkdirSync(join(other,'.harness/state'),{recursive:true});
 writeFileSync(join(other,'.harness/state/chats.json'),JSON.stringify({chats:{foreign:{id:'foreign',pane:'reviewer',title:'Чужой закрытый разговор',created:1}},active:{}}));
 writeFileSync(join(h.dir,'projects.json'),JSON.stringify([h.dir,other]));
 const list=h.runtime.projectRegistry.listProjects.bind(h.runtime.projectRegistry);let reads=0;
 h.runtime.projectRegistry.listProjects=async current=>{reads++;return list(current)};
 for(const headers of [{'X-Harness-Pane':'worker'},{'X-Pane-Token':'worker-token'},{'X-Harness-Pane':'worker','X-Pane-Token':'worker-token'}]){
  const response=await call(h.api,'/api/projects',{headers});assert.equal(response.status,403);assert.equal(response.body.code,'owner_only');assert.equal(reads,0);assert.equal(response.body.projects,undefined);assert.doesNotMatch(JSON.stringify(response.body),/Чужой закрытый разговор/);
 }
 const owner=await call(h.api,'/api/projects');assert.equal(owner.status,200);assert.equal(reads,1);assert.equal(owner.body.projects.find((p:{path:string})=>p.path===other).chats[0].title,'Чужой закрытый разговор');
});

test('TS-30 r3: agent identities cannot write owner or project settings',async t=>{
 const h=await fixture(t);
 for(const headers of [{'x-pane-token':'forged'},{'x-harness-pane':'worker'}])for(const scope of ['owner','project']){
  const response=await call(h.api,'/api/settings',{headers,body:{scope,patch:{releaseUnderstood_0_1_0_alpha:true}}});
  assert.equal(response.status,403);assert.equal(response.body.code,'owner_only');
 }
 const settings=(await call(h.api,'/api/settings')).body;assert.deepEqual(settings.owner,{});assert.deepEqual(settings.project,{});
});

test('TS-36E: owner profile name is validated, scoped to owner and returned by status',async t=>{
 const h=await fixture(t);assert.deepEqual((await call(h.api,'/api/status')).body.profile,{name:null});
 const saved=await call(h.api,'/api/settings',{body:{scope:'owner',patch:{profileName:'  Мария Ветрова  '}}});assert.equal(saved.status,200);assert.equal(saved.body.saved.profileName,'Мария Ветрова');assert.deepEqual((await call(h.api,'/api/status')).body.profile,{name:'Мария Ветрова'});
 for(const value of ['', ' '.repeat(3),'a'.repeat(81),'подмена\nстроки',7]){const rejected=await call(h.api,'/api/settings',{body:{scope:'owner',patch:{profileName:value}}});assert.equal(rejected.status,400);assert.equal(rejected.body.ok,false);assert.match(rejected.body.error,/Имя:/)}
 assert.equal((await call(h.api,'/api/settings',{body:{scope:'project',patch:{profileName:'Чужое имя'}}})).status,400);assert.deepEqual((await call(h.api,'/api/status')).body.profile,{name:'Мария Ветрова'});
 assert.equal((await call(h.api,'/api/settings',{body:{scope:'owner',patch:{profileName:null}}})).status,200);assert.deepEqual((await call(h.api,'/api/status')).body.profile,{name:null});
});

test('TS-36E: a discussion turn has no program tools and keeps its mode on the saved reply',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!;assert.deepEqual(PROVIDER_MODES.chat.tools,[]);
 const mode=await call(h.api,'/api/panes/worker',{body:{mode:'chat',binding:h.runtime.paneBinding('worker')}});assert.equal(mode.status,200);assert.equal(pane.mode,'chat');
 const sent=await call(h.api,'/api/chat',{body:{pane:'worker',message:'Давай обсудим',direct:true}});assert.equal(sent.status,200);await h.runtime.idle();
 assert.equal(h.provider.calls[0]!.seat.mode,'chat');const id=h.runtime.chatsList(OWNER).active.worker;const messages=(await call(h.api,'/api/chats/'+id)).body.messages;assert.equal(messages.find((m:{role:string})=>m.role==='ai').mode,'chat');
});

test('TS-36E: discussion rights do not change whether the room has a project',async t=>{
 const h=await fixture(t);
 assert.equal((await call(h.api,'/api/room',{body:{model:'w1',folder:h.dir}})).status,200);
 const projectRoom=await call(h.api,'/api/panes/room',{body:{mode:'chat',binding:h.runtime.paneBinding('room')}});
 assert.equal(projectRoom.status,200);assert.equal((await call(h.api,'/api/status')).body.noProject,false);
 assert.equal((await call(h.api,'/api/room',{body:{model:'w1',folder:false}})).status,200);
 const folderlessRoom=await call(h.api,'/api/panes/room',{body:{mode:'read',binding:h.runtime.paneBinding('room')}});
 assert.equal(folderlessRoom.status,200);assert.equal((await call(h.api,'/api/status')).body.noProject,true);
});

test('1/19/68: chat direct and handoff selection forms, journal, chats and transcript use real delivered histories',async t=>{
 const h=await fixture(t,{seats});
 const direct=await call(h.api,'/api/chat',{body:{pane:'worker',message:'задача'}});assert.equal(direct.status,409);assert.deepEqual(direct.body,{ok:false,needDirect:true,error:'«воркер» — не оркестратор: обращение напрямую требует явного подтверждения'});
 for(const message of ['первый','второй']){const chat=await call(h.api,'/api/chat',{body:{pane:'worker',message,direct:true}});assert.equal(chat.status,200);assert.deepEqual(keys(chat.body),['ok','queued','seq','thread']);await h.runtime.idle()}
 const selection=await call(h.api,'/api/handoff',{body:{from:'worker',to:'orch'}});assert.equal(selection.status,400);assert.equal(selection.body.ok,false);
 const selected=h.runtime.chatGet(h.runtime.chatsList(OWNER).active.worker!,OWNER).messages.find(m=>m.role==='me')!;
 const transfer=await call(h.api,'/api/handoff',{body:{from:'worker',to:['orch','orch'],chat:h.runtime.chatsList(OWNER).active.worker,seqs:[selected.seq],kind:'note'}});assert.equal(transfer.status,200);assert.deepEqual(keys(transfer.body),['answers','chars','names','ok','seq','to']);assert.equal(transfer.body.to.length,1);assert.match(h.runtime.journal.get(transfer.body.seq)!.text,/Владелец: первый/);assert.doesNotMatch(h.runtime.journal.get(transfer.body.seq)!.text,/второй/);await h.runtime.idle();
 const log=await call(h.api,'/api/journal?since=bad&limit=0');assert.equal(log.body.records.length,h.runtime.journal.lastSeq);assert.deepEqual(keys(log.body),['cursors','lastSeq','project','records','summary','threads']);assert.equal(log.body.records.at(-1).origin,'handoff');assert.equal((await call(h.api,'/api/journal?since=0&limit=0')).body.records.length,log.body.records.length);
 const list=await call(h.api,'/api/chats');assert.deepEqual(keys(list.body),['active','chats']);const id=list.body.active.worker;const chat=await call(h.api,'/api/chats/'+id);assert.deepEqual(keys(chat.body),['chat','messages']);assert.equal(chat.body.messages.filter((m:any)=>m.role==='ai').length,2);
 assert.deepEqual(keys(chat.body.chat),['active','closed','created','documents','id','label','last','messages','model','pane','revision','role','title','vendor']);
 const opened=await call(h.api,'/api/chats/open',{body:{chat:id}});assert.deepEqual(keys(opened.body),['already','chat','ok','pane']);
 const fresh=await call(h.api,'/api/chats/new',{body:{pane:'worker',carry:'text'}});assert.equal(fresh.status,200);assert.deepEqual(keys(fresh.body),['carried','chat','ok','pane']);assert.equal(fresh.body.carried,true);
 assert.equal((await call(h.api,'/api/chats/missing')).status,404);assert.deepEqual((await call(h.api,'/api/interrupt',{body:{pane:'worker'}})).body,{ok:false,error:'нечего прерывать'});
 const steer=await call(h.api,'/api/steer',{body:{pane:'worker',message:'вмешательство'}});assert.equal(steer.status,409);assert.equal(steer.body.code,'steer_failed');assert.equal(h.runtime.journal.pendingFor('worker').length,0)
});

test('TS-36B r2: owner answers an exact open question through chat without reusing a closed answer',async t=>{
 const h=await fixture(t,{seats});await call(h.api,'/api/halt',{body:{on:true}});
 const question=h.runtime.channel.post({to:'owner',kind:'question',text:'Как продолжать?'},{seat:'worker',trust:'agent'});
 const body={pane:'worker',kind:'decision',message:'Продолжить проверку',reply_to:question.seq,direct:true};
 const saved=await call(h.api,'/api/chat',{body});assert.equal(saved.status,200,saved.text);
 const record=h.runtime.journal.get(saved.body.seq)!;assert.equal(record.reply_to,question.seq);assert.equal(record.thread,question.thread);assert.equal(record.kind,'decision');
 const duplicate=await call(h.api,'/api/chat',{body});assert.equal(duplicate.status,409);assert.match(duplicate.body.error,/уже ответили/);
 const wrong=await call(h.api,'/api/chat',{body:{...body,reply_to:999999}});assert.equal(wrong.status,409);assert.match(wrong.body.error,/не найден/);
});

for(const kind of ['question','blocker','escalation'] as const)test('TS-36B r3: owner answers an open '+kind+' only for its addressee',async t=>{
 const h=await fixture(t,{seats});await call(h.api,'/api/halt',{body:{on:true}});
 const item=h.runtime.journal.append({sender:'worker',to:'owner',kind,text:'Нужно решение'});
 const body={pane:'worker',kind:'decision',message:'Продолжить проверку',reply_to:item.seq,direct:true};
 const saved=await call(h.api,'/api/chat',{body});assert.equal(saved.status,200,saved.text);
 const reply=h.runtime.journal.get(saved.body.seq)!;assert.equal(reply.reply_to,item.seq);assert.equal(reply.thread,item.thread);
 const closed=await call(h.api,'/api/chat',{body});assert.equal(closed.status,409);assert.match(closed.body.error,/уже ответили/);
 const otherRecipient=h.runtime.journal.append({sender:'worker',to:'orch',kind,text:'Не для владельца'});
 const wrongRecipient=await call(h.api,'/api/chat',{body:{...body,reply_to:otherRecipient.seq}});assert.equal(wrongRecipient.status,409);assert.match(wrongRecipient.body.error,/не найден/);
 const otherPane=h.runtime.journal.append({sender:'orch',to:'owner',kind,text:'Вопрос другого места'});
 const wrongPane=await call(h.api,'/api/chat',{body:{...body,reply_to:otherPane.seq}});assert.equal(wrongPane.status,409);assert.match(wrongPane.body.error,/не найден/);
 assert.equal(h.runtime.journal.repliesTo(item.seq).filter(r=>r.from==='owner').length,1);
});

test('1: 154: project creation and bound assign alias; replacement is refused',async t=>{
 const h=await fixture(t);const path=join(h.dir,'project');const created=await call(h.api,'/api/project/create',{body:{path,model:'w1',git:true}});
 assert.equal(created.status,200);assert.deepEqual(keys(created.body),['created','git','memory','ok','orchestrator','project','seats']);assert.equal(created.body.created,true);assert.equal(created.body.git,true);assert.equal(created.body.seats,0);
 await h.runtime.idle();await call(h.api,'/api/halt',{body:{on:true}});
 assert.equal((await call(h.api,'/api/room',{body:{model:'w1',folder:path}})).status,200);
 const input=promotionInput(h.runtime),assigned=await call(h.api,'/api/assign',{body:{...input,role:'orchestrator'}});assert.equal(assigned.status,200);assert.deepEqual(keys(assigned.body),['already','chat','created','ok','pane','project','promotion','team']);assert.equal(assigned.body.created,false);
 assert.deepEqual(assigned.body.promotion,{operationId:assigned.body.promotion.operationId,chat:assigned.body.chat.id,sourceProject:input.project,sourceRevision:input.revision,target:path,pane:assigned.body.pane.id,step:4,stepCount:4,stepLabel:'первое поручение',completed:4,error:null});assert.equal(typeof assigned.body.promotion.operationId,'string');
 const replacement=await call(h.api,'/api/assign',{body:{...promotionInput(h.runtime),role:'orchestrator'}});assert.equal(replacement.status,409);assert.equal(replacement.body.code,'orchestrator_exists');assert.equal(replacement.body.chat,assigned.body.chat.id);
 const seat=await call(h.api,'/api/seats',{body:{role:'executor',model:'w1'}});assert.equal(seat.status,409);assert.deepEqual(seat.body,{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});
 assert.equal((await call(h.api,'/api/seats',{body:{role:'assistant',model:'w1'}})).status,409);
 const onboard=await call(h.api,'/api/onboard',{body:{pane:assigned.body.pane.id}});assert.deepEqual(onboard.body,{ok:true,already:true});assert.equal((await call(h.api,'/api/onboard',{body:{pane:'room'}})).status,404);
});

test('11/25/66/68: POST open sessions preserves forms and rejects stale read after turn/project, GET and HEAD never invoke provider',async t=>{
 const h=await fixture(t);assert.deepEqual((await call(h.api,'/api/sessions?pane=worker')).body,{sessions:[{id:'old',title:'прежний',updated:1}]});assert.equal((await call(h.api,'/api/sessions')).status,400);
 const opened=await call(h.api,'/api/sessions/open',{body:{pane:'worker',id:'old'}});assert.deepEqual(opened.body,{id:'old',messages:[{role:'ai',text:'прежний ответ'}]});assert.equal(h.runtime.registry.get('worker')!.sessionId,'old');
 const gate=deferred<{role:'ai';text:string}[]>();h.provider.onMessages=()=>gate.promise;const read=call(h.api,'/api/sessions/open',{body:{pane:'worker',id:'other'}});await until(()=>h.provider.messageCalls===2);await h.runtime.runTurn('worker','новый ход');gate.resolve([{role:'ai',text:'старый результат'}]);const stale=await read;assert.equal(stale.status,409);assert.equal(stale.body.code,'stale_session');assert.notEqual(h.runtime.registry.get('worker')!.sessionId,'other');
 const gate2=deferred<{role:'ai';text:string}[]>();h.provider.onMessages=()=>gate2.promise;const read2=call(h.api,'/api/sessions/open',{body:{pane:'worker',id:'foreign'}});await until(()=>h.provider.messageCalls===3);const dir=join(h.dir,'next');mkdirSync(dir);await h.runtime.projectSet(dir,{},OWNER);gate2.resolve([{role:'ai',text:'чужой проект'}]);assert.equal((await read2).body.code,'project_changed');assert.deepEqual(h.runtime.registry.ids,['room']);
});

test('8/19/68: owner-ack append failure is 500 J with card retained, retry succeeds and late approve has legacy form',async t=>{
 let armed=false;const h=await fixture(t,{seats:'  worker: {role: executor, vendor: claude, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, model: w1, mode: read}',actions:createActions(),before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),'version: 1\nroutes: [{from: executor, to: reviewer, kinds: [note], trigger: owner-ack}]\nobserve: {}\n'),deps:{journalOptions:{fs:{appendFileSync(path,data,options){if(armed&&String(data).includes('"kind": "ack"')){armed=false;throw Error('disk failed')}appendFileSync(path,data,options)}}}}});
 await h.runtime.halt(true,OWNER);const rec=h.runtime.channel.post({to:'peer',kind:'note',text:'ожидает'},{seat:'worker',trust:'agent'});await until(()=>h.runtime.registry.get('worker')!.approvals.size===1);armed=true;
 const bad=await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+rec.seq,decision:'allow'}});assert.equal(bad.status,500);assert.equal(bad.body.code,'write_failed');assert.equal(h.runtime.registry.get('worker')!.approvals.size,1);
 assert.deepEqual((await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+rec.seq,decision:'allow'}})).body,{ok:true,error:null});assert.deepEqual((await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+rec.seq,decision:'allow'}})).body,{ok:false,error:'вопрос уже закрыт'});
});


test('68: saved opposite owner-ack decision remains deny and returns 409 ack_closed after partial failure',async t=>{
 let failNote=false;const h=await fixture(t,{seats:'  worker: {role: executor, vendor: claude, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, model: w1, mode: read}',actions:createActions(),before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),'version: 1\nroutes: [{from: executor, to: reviewer, kinds: [note], trigger: owner-ack}]\nobserve: {}\n'),deps:{journalOptions:{fs:{appendFileSync(path,data,options){if(failNote&&String(data).includes('"origin": "ack"'))throw Error('note failed');appendFileSync(path,data,options)}}}}});
 await h.runtime.halt(true,OWNER);const rec=h.runtime.channel.post({to:'peer',kind:'note',text:'ожидает'},{seat:'worker',trust:'agent'});await until(()=>h.runtime.registry.get('worker')!.approvals.size===1);failNote=true;
 const denied=await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+rec.seq,decision:'deny'}});assert.equal(denied.status,500);assert.equal(denied.body.code,'write_failed');assert.equal(h.runtime.registry.get('worker')!.approvals.size,1);
 failNote=false;const opposite=await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+rec.seq,decision:'allow'}});assert.equal(opposite.status,409);assert.equal(opposite.body.code,'ack_closed');assert.equal(h.runtime.registry.get('worker')!.approvals.size,0);assert.equal(h.runtime.journal.repliesTo(rec.seq).some(r=>r.kind==='ack'),false)
});

test('68: recovering and uncertain owner edits return 409 J without moving cursor or invoking model',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!;for(const status of ['recovering','uncertain'] as const){pane.status=status;const reply=await call(h.api,'/api/chats/new',{body:{pane:'worker'}});assert.equal(reply.status,409);assert.equal(reply.body.code,status);assert.equal(reply.body.ok,false)}
 assert.equal(h.provider.calls.length,0);assert.deepEqual(h.runtime.journal.cursors,{})
});


test('1: room move preserves conversation while destination message uses its own journal via HTTP',async t=>{
 const h=await fixture(t);await call(h.api,'/api/room',{body:{model:'w1',folder:h.dir}});await call(h.api,'/api/chat',{body:{pane:'room',message:'исходный разговор'}});await h.runtime.idle();const before=h.provider.calls.length;
 const path=join(h.dir,'moved');mkdirSync(path);const moved=await call(h.api,'/api/room/move',{body:{path}});assert.equal(moved.status,200);assert.deepEqual(keys(moved.body),['carried','ok','pane','project']);assert.equal(moved.body.carried,true);assert.equal(moved.body.project,path);
 const next=await call(h.api,'/api/chat',{body:{pane:'room',message:'новая запись'}});assert.equal(next.status,200);assert.equal(next.body.seq,1);await h.runtime.idle();assert.equal(h.provider.calls.length,before+1);assert.match(h.provider.calls.at(-1)!.message,/новая запись/);assert.equal(h.runtime.registry.get('room')!.carry,'')
});

test('19: sessions failures keep provider 200/404 forms and truncate by Unicode codepoints',async t=>{
 const h=await fixture(t);h.provider.listSessions=async()=>{throw Error('🦊'.repeat(301))};h.provider.onMessages=async()=>{throw Error('🦊'.repeat(301))};
 const list=await call(h.api,'/api/sessions?pane=worker');assert.equal(list.status,200);assert.deepEqual(list.body,{sessions:[],error:'🦊'.repeat(300)});
 const open=await call(h.api,'/api/sessions/open',{body:{pane:'worker',id:'missing'}});assert.equal(open.status,404);assert.deepEqual(open.body,{error:'🦊'.repeat(300)});assert.equal(h.runtime.registry.get('worker')!.sessionId,null)
});


function delayedInit(fail=false){
 const entered=deferred(),release=deferred();
 const gitops=new GitOps(async(args,cwd,timeout=60)=>{
 if(args[0]==='init'){entered.resolve();await release.promise;if(fail)return {code:1,stdout:'',stderr:'forced init failure'}}
 const result=await execute('git',args,cwd,timeout*1000);return {...result,stdout:result.stdout.trim(),stderr:result.stderr.trim()}
 });
 return {gitops,entered,release}
}

test('65/r2-1: a new room starts during init; project/create returns 409 without closing or cancelling it',{timeout:10_000},async t=>{
 const gate=delayedInit(),started=deferred<AbortSignal>(),finish=deferred<{text:string;sessionId:null}>();t.after(()=>{gate.release.resolve();finish.resolve({text:'готово',sessionId:null})});
 const h=await fixture(t,{deps:{gitops:gate.gitops}}),original=h.runtime.project;
 h.provider.onRun=async(_seat,_message,ctx)=>{ctx.modelStarted?.();ctx.signal.addEventListener('abort',()=>finish.resolve({text:'',sessionId:null}),{once:true});started.resolve(ctx.signal);return finish.promise};
 const creating=call(h.api,'/api/project/create',{body:{path:join(h.dir,'new-project'),git:true,model:'w1'}});await gate.entered.promise;
 assert.equal((await call(h.api,'/api/room',{body:{model:'w1',folder:h.dir}})).status,200);
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'room',message:'ход нового места'}})).status,200);const signal=await started.promise;
 assert.equal(signal.aborted,false);assert.equal(h.runtime.registry.get('room')!.busy,true);gate.release.resolve();
 const created=await creating;assert.equal(created.status,409);assert.deepEqual(created.body,{ok:false,error:'идёт ход: создай папку, когда все окна свободны'});
 assert.equal(h.runtime.project,original);assert.equal(original.closed,false);assert.equal(signal.aborted,false);assert.equal(h.runtime.registry.get('room')!.busy,true);assert.equal(original.editing.size,0);assert.equal(h.provider.closes,0);
 finish.resolve({text:'готово',sessionId:null});await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.equal(h.runtime.journal.pendingFor('room').length,0)
});

for(const halted of [false,true])test('65/r2-2: failed init releases owner-ack delivery'+(halted?' while respecting halt':' and resumes it without another kick'),{timeout:10_000},async t=>{
 const gate=delayedInit(true);t.after(()=>gate.release.resolve());
 const h=await fixture(t,{deps:{gitops:gate.gitops},actions:createActions(),seats:'  worker: {role: executor, vendor: claude, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, model: w1, mode: read}',before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),'version: 1\nroutes:\n  - {from: executor, to: reviewer, kinds: [question], trigger: owner-ack}\n  - {from: reviewer, to: executor, kinds: [answer]}\nobserve: {}\n')}),original=h.runtime.project;
 const question=h.runtime.channel.post({to:'peer',kind:'question',text:'вопрос, ожидающий владельца'},{seat:'worker',trust:'agent'});await until(()=>h.runtime.registry.get('worker')!.approvals.has('ack:'+question.seq));
 const creating=call(h.api,'/api/project/create',{body:{path:join(h.dir,'new-project'),git:true}});await gate.entered.promise;
 const allowed=await call(h.api,'/api/approve',{body:{pane:'worker',id:'ack:'+question.seq,decision:'allow'}});assert.deepEqual(allowed.body,{ok:true,error:null});assert.equal(allowed.status,200);
 await h.runtime.idle();assert.equal(original.pumps.size,0);assert.equal(h.runtime.journal.pendingFor('peer').length,1);assert.equal(h.provider.calls.length,0);
 if(halted)assert.equal((await call(h.api,'/api/halt',{body:{on:true}})).status,200);
 gate.release.resolve();const failed=await creating;assert.equal(failed.status,400);assert.deepEqual(Object.keys(failed.body).sort(),['error','ok']);assert.equal(failed.body.ok,false);assert.match(failed.body.error,/^проект не создан: .*forced init failure/);
 await h.runtime.idle();assert.equal(h.runtime.project,original);assert.equal(original.closed,false);assert.equal(original.editing.size,0);assert.equal(original.halted,halted);
 if(halted){assert.equal(h.provider.calls.length,0);assert.equal(h.runtime.journal.pendingFor('peer').length,1)}
 else {const calls=h.provider.calls.filter(c=>c.seat.id==='peer');assert.equal(calls.length,1);assert.match(calls[0]!.message,/вопрос, ожидающий владельца/);assert.equal(h.runtime.journal.pendingFor('peer').length,0);assert.equal(h.runtime.registry.get('peer')!.status,'idle')}
});

test('65/r2-2: resuming queues after failed init does not repeat a new room turn with an uncertain effect',{timeout:10_000},async t=>{
 const gate=delayedInit(true);t.after(()=>gate.release.resolve());const h=await fixture(t,{deps:{gitops:gate.gitops}}),original=h.runtime.project;
 h.provider.onRun=async(_seat,_message,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','connection lost after effect')};
 const creating=call(h.api,'/api/project/create',{body:{path:join(h.dir,'new-project'),git:true}});await gate.entered.promise;
 assert.equal((await call(h.api,'/api/room',{body:{model:'w1',folder:h.dir}})).status,200);assert.equal((await call(h.api,'/api/chat',{body:{pane:'room',message:'возможный внешний эффект'}})).status,200);await h.runtime.idle();
 const pane=h.runtime.registry.get('room')!;assert.equal(pane.status,'uncertain');assert.equal(original.state.attempts.room!.status,'uncertain');assert.equal(h.provider.calls.length,1);
 gate.release.resolve();assert.equal((await creating).status,400);await h.runtime.idle();assert.equal(h.runtime.project,original);assert.equal(original.closed,false);assert.equal(original.editing.size,0);assert.equal(pane.status,'uncertain');assert.equal(original.state.attempts.room!.status,'uncertain');assert.equal(h.provider.calls.length,1);assert.equal(h.runtime.journal.pendingFor('room').length,1)
});
