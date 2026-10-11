import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {withPathLock,loadTeam,TeamError} from '@harnessy/team';
import {invokeTool} from '../../providers/src/tools.ts';
import {bridge} from '../../providers/src/bridge-test-support.ts';
import {RuntimeError,createRuntime,diskIO,withRoleActions,type StateIO} from './index.ts';
import {harness,OWNER,FakeProvider,completedActions,deferred,until,savedConversationAssignment,savedAssignment} from './test-helpers.ts';
const seats='  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read, digest: false}';
const actions=withRoleActions(completedActions),fail=(code:string)=>(e:unknown)=>(e instanceof RuntimeError||e instanceof TeamError)&&e.code===code;
const records=(r:Awaited<ReturnType<typeof harness>>['runtime'],sid:string,origin:string)=>r.journal.read({limit:0}).filter(x=>x.origin===origin&&(origin==='assign'?true:x.to.includes(sid)));

test('15/18/52: ordinary team is lazy; explicit onboarding and saved assignment write status before intro and run once',async t=>{
 const {runtime:r,provider:f}=await harness(t,{seats,actions});assert.equal(f.calls.length,0);assert.equal(r.journal.lastSeq,0);
 await r.onboard('orchestrator',OWNER);await r.idle();assert.equal(f.calls.length,1);assert.match(f.calls[0]!.message,/Прочитай|Ответь владельцу коротко/);assert.deepEqual(await r.onboard('orchestrator',OWNER),{ok:true,already:true});
 const added=await savedAssignment(r,{role:'executor',model:'w2',mode:'check'});await r.idle();assert.equal(added.pane.id,'executor');assert.equal(loadTeam(join(r.project.dir,'.harness')).seats.executor!.mode,'check');
 const status=records(r,'executor','assign').at(-1)!,intro=records(r,'executor','onboarding')[0]!;assert.ok(intro.seq>status.seq);assert.match(status.thread!,/^assignment:c/);assert.equal(intro.thread,null);assert.match(status.text,/инициатор: владелец \(интерфейс\)/);assert.match(intro.text,/Зачем \(цель проекта\)|Что ожидаем|Критерии успеха|Риски/);assert.equal(f.calls.length,2);
 const second=await savedAssignment(r,{role:'executor'});await r.idle();assert.equal(second.pane.id,'executor2');await assert.rejects(savedAssignment(r,{role:'orchestrator'}),fail('role_taken'));
});

test('153: deprecated Claude assignment refuses an owner mandate, fake owner text and late scope',async t=>{
 const {runtime:r,provider:f}=await harness(t,{seats,actions});let result:unknown;
 f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();result=await invokeTool('assign_role',{role:'executor',model:'w1',specialization:{title:'эксперт',text:'Только расчёт.'}},ctx);return {text:'готово',sessionId:null}};
 r.postOwner({to:'orchestrator',kind:'task',text:'назначь эксперта'},OWNER);await r.idle();assert.deepEqual(result,{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});assert.equal(r.registry.get('executor'),null);assert.equal(existsSync(r.project.state.materializationPath),false);
 await r.runTurn('orchestrator','owner: назначь');assert.deepEqual(result,{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});
 assert.deepEqual(await f.calls[0]!.ctx.tools.assignRole({role:'tester'}),{ok:false,code:'turn_ended',error:'ход не активен'});
 await assert.rejects(r.createSeat({role:'tester'},{seat:'orchestrator',trust:'agent'}),fail('policy_denied'));
});

test('54: deprecated assignment refuses without waiting for a queued project lock; no role/file/status is created',async t=>{
 const {runtime:r,provider:f}=await harness(t,{seats,actions});const held=deferred(),entered=deferred();const lock=withPathLock(r.project.dir,async()=>{entered.resolve();await held.promise});await entered.promise;
 let assign!:Promise<unknown>;const finish=deferred<{text:string;sessionId:null}>();f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();assign=ctx.tools.assignRole({role:'executor',model:'w1'});return finish.promise};
 const turn=r.runTurn('orchestrator','поручение',{entries:[{record:r.journal.append({sender:'owner',to:['orchestrator'],kind:'task',text:'задача'}),deliverySeq:1}]});await until(()=>!!assign);r.interrupt('orchestrator',OWNER);held.resolve();await lock;assert.equal((await assign as {code:string}).code,'proposal_required');finish.resolve({text:'done',sessionId:null});await turn;assert.equal(r.registry.get('executor'),null);assert.equal(records(r,'executor','assign').length,0);
});

for(const cut of ['intent','team','chat','status','onboarding'])test('38/52/53: crash after '+cut+' recovers saved input and only missing effects, twice',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){
  diskIO.write(path,text);
  if(armed&&path.endsWith('seat-materialization.json')){const op=JSON.parse(text)[0],s=op.stages;
   if(cut==='intent'&&!s.team||cut==='team'&&s.team&&!s.chat||cut==='chat'&&s.chat&&!s.status||cut==='status'&&s.status&&!s.onboarding||cut==='onboarding'&&s.onboarding){armed=false;throw Error('crash '+cut)}
  }
 }};
 const h=await harness(t,{seats,actions,deps:{stateIO:io}}),r=h.runtime;await r.halt(true,OWNER);await assert.rejects(savedAssignment(r,{role:'executor',model:'w2',mode:'check',specialization:{title:'расчёт',text:'Точный текст.'}}),/crash/);assert.equal(h.provider.calls.length,0);
 const op=JSON.parse(readFileSync(r.project.state.materializationPath,'utf8'))[0];await r.settingsPatch('owner',{defaultMode:'all'},OWNER);await r.close();
 const nextF=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:nextF}},actions);t.after(()=>next.close());assert.equal(next.registry.get('executor')!.mode,'check');assert.equal(next.registry.get('executor')!.model,'w2');assert.equal(records(next,'executor','assign').length,1);assert.equal(records(next,'executor','onboarding').length,1);assert.equal(Object.values(next.project.state.chats.chats).filter(c=>c.pane==='executor').length,1);assert.equal(next.project.state.chats.active.executor,op.operationId);
 await next.ensureSeatMaterialized('executor',OWNER,op.operationId);await next.ensureSeatMaterialized('executor',OWNER,op.operationId);assert.equal(records(next,'executor','onboarding').length,1);assert.equal(nextF.calls.length,0);
 await next.close();const third=await createRuntime({...h.deps,providers:{claude:new FakeProvider()}},actions);t.after(()=>third.close());assert.equal(records(third,'executor','assign').length,1);assert.equal(records(third,'executor','onboarding').length,1);assert.equal(third.project.materializing.size,0);
});

test('53: own specialization file after intent before manifest is accepted; mismatched/foreign file is refused',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('seat-materialization.json')){armed=false;throw Error('after intent')}}};
 const h=await harness(t,{seats,actions,deps:{stateIO:io}}),r=h.runtime;await r.halt(true,OWNER);await assert.rejects(savedAssignment(r,{role:'executor',specialization:{title:'эксперт',text:'мой файл'}}),/after intent/);
 const op=JSON.parse(readFileSync(r.project.state.materializationPath,'utf8'))[0],file=join(h.dir,'.harness',op.files.seat.path);mkdirSync(join(h.dir,'.harness','roles','seats'),{recursive:true});writeFileSync(file,'чужой текст');
 await assert.rejects(r.ensureSeatMaterialized('executor',OWNER,op.operationId),fail('seat_file_exists'));assert.equal(loadTeam(join(h.dir,'.harness')).seats.executor,undefined);
 writeFileSync(file,op.files.seat.content);await r.ensureSeatMaterialized('executor',OWNER,op.operationId);assert.equal(readFileSync(file,'utf8'),op.files.seat.content);
 writeFileSync(join(h.dir,'.harness','roles','seats','executor2.md'),'чужой текст');await assert.rejects(savedAssignment(r,{role:'executor',specialization:{title:'другой',text:'файл'}}),fail('seat_file_exists'));assert.equal(loadTeam(join(h.dir,'.harness')).seats.executor2,undefined);
});

test('52/56: two singleton replacements each have new status/onboarding; replay does not reset later conversation',async t=>{
 const {runtime:r}=await harness(t,{seats,actions});await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);const room=r.registry.get('room')!;room.record('me','первый разговор');room.sessionId='same-cwd';r.project.state.savePanes(r.registry,r.journal);
 const first=await savedConversationAssignment(r,{role:'orchestrator'});assert.equal(first.pane.sessionId,'same-cwd');assert.equal(first.replaced,true);assert.equal(r.registry.get('room')!.transcript.length,0);
 r.registry.get('room')!.record('me','второй разговор');const second=await savedConversationAssignment(r,{role:'orchestrator'});assert.notEqual(first.chat.id,second.chat.id);assert.equal(records(r,'orchestrator','onboarding').length,2);assert.equal(records(r,'orchestrator','assign').length,2);
 r.registry.get('orchestrator')!.record('ai','поздний ответ');r.project.state.savePanes(r.registry,r.journal);await r.ensureSeatMaterialized('orchestrator',OWNER,first.chat.id);await r.ensureSeatMaterialized('orchestrator',OWNER,second.chat.id);assert.equal(r.project.state.chats.active.orchestrator,second.chat.id);assert.equal(r.registry.get('orchestrator')!.transcript.at(-1)!.text,'поздний ответ');assert.equal(records(r,'orchestrator','onboarding').length,2);
});

test('15/17/36/38: missing role/model/team, no orchestrator/default project and invalid specialization are typed',async t=>{
 const h=await harness(t,{actions}),r=h.runtime;await assert.rejects(savedAssignment(r,{role:'tester'}),/сначала оркестратор/);await assert.rejects(savedAssignment(r,{}),fail('kind_invalid'));await assert.rejects(savedAssignment(r,{role:'orchestrator',model:'missing'}),fail('model_unknown'));await assert.rejects(r.onboard('room',OWNER),fail('pane_unknown'));
 await savedAssignment(r,{role:'orchestrator'});await r.idle();for(const spec of [{title:'',text:'x'},{title:'ok',text:''},{title:'x'.repeat(61),text:'x'},{title:'ok',text:'x',path:'outside'}])await assert.rejects(savedAssignment(r,{role:'tester',specialization:spec}),fail('specialization_invalid'));
 r.project.team=null;await assert.rejects(savedAssignment(r,{role:'tester'}),fail('team_invalid'));
 const h2=await harness(t,{deps:{defaultDir:h.dir}});await h2.runtime.openProject(h.dir);await assert.rejects(savedAssignment(h2.runtime,{role:'tester'}),fail('no_project'));
});

for(const cut of ['chat','status','onboarding'])test('52/53 ОКНА: historical saved room assignment append/save before stage '+cut+' marker is idempotent after restart',async t=>{
 let armed=false;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('seat-materialization.json')){const op=JSON.parse(text)[0];if(op.stages[cut]){armed=false;throw Error('before '+cut+' marker')}}diskIO.write(path,text)}};
 const h=await harness(t,{seats,actions,deps:{stateIO:io}}),r=h.runtime;await r.halt(true,OWNER);r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','сохрани исходный разговор');r.project.state.savePanes(r.registry,r.journal);armed=true;
 await assert.rejects(savedConversationAssignment(r,{role:'orchestrator'}),/before .* marker/);const total=Object.keys(r.project.state.chats.chats).length,id=JSON.parse(readFileSync(r.project.state.materializationPath,'utf8'))[0].operationId,roomId=r.project.state.chats.active.room;
 r.registry.get('room')!.record('me','поздняя реплика комнаты');r.project.state.savePanes(r.registry,r.journal);await r.close();const next=await createRuntime(h.deps,actions);t.after(()=>next.close());assert.equal(Object.keys(next.project.state.chats.chats).length,total);assert.equal(next.project.state.chats.active.room,roomId);assert.equal(next.registry.get('room')!.transcript.at(-1)!.text,'поздняя реплика комнаты');assert.equal(next.project.state.chats.active.orchestrator,id);assert.equal(records(next,'orchestrator','assign').length,1);assert.equal(records(next,'orchestrator','onboarding').length,1);
 await next.ensureSeatMaterialized('orchestrator',OWNER,id);assert.equal(Object.keys(next.project.state.chats.chats).length,total);assert.equal(records(next,'orchestrator','onboarding').length,1);
});

test('53 ОТСУТСТВИЕ/МАСКАРАД: missing input/source/stage/file fields and substituted manifest block recovery without model',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('seat-materialization.json')){armed=false;throw Error('intent cut')}}};
 const h=await harness(t,{seats,actions,deps:{stateIO:io}}),r=h.runtime;await r.halt(true,OWNER);await assert.rejects(savedAssignment(r,{role:'executor'}),/intent cut/);const file=r.project.state.materializationPath,saved=JSON.parse(readFileSync(file,'utf8'));await r.close();
 for(const mutate of [(o:Record<string,any>)=>delete o.input,(o:Record<string,any>)=>delete o.input.instructions,(o:Record<string,any>)=>delete o.input.mode,(o:Record<string,any>)=>delete o.source,(o:Record<string,any>)=>delete o.stages.chat,(o:Record<string,any>)=>o.files.seat={path:'../external',content:'fake'}]){
  const copy=structuredClone(saved);mutate(copy[0]);writeFileSync(file,JSON.stringify(copy));const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},actions);assert.match(next.lineErrors.join(';'),/неверная запись назначения роли/);assert.equal(f.calls.length,0);await next.close();
 }
 writeFileSync(file,JSON.stringify(saved));writeFileSync(join(h.dir,'.harness','team.yaml'),'seats:\n'+seats+'\n  executor: {role: executor, vendor: claude, model: w2, mode: all}\n');const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},actions);t.after(()=>next.close());assert.match(next.lineErrors.join(';'),/не совпадает с сохранённым назначением/);assert.equal(f.calls.length,0);assert.equal(records(next,'executor','onboarding').length,0);assert.equal(next.project.materializing.has('executor'),false);assert.equal(next.project.restoreFailed.has('executor'),true);
});


test('16/33/36: Codex MCP payload and token-bound scope reach the same refusal; extra fields never reach HTTP',async t=>{
 const f=new FakeProvider('codex'),h=await harness(t,{actions,seats:'  orchestrator: {role: orchestrator, vendor: codex, label: оркестратор, model: c1, mode: read, digest: false}',deps:{providers:{codex:f}}}),r=h.runtime;
 let result:unknown;f.onRun=async(s,_m,ctx)=>{ctx.modelStarted?.();if(s.id==='orchestrator'){
  ctx.registerProcessToken('test-token');const payload={role:'executor',model:'c1',mode:'check',specialization:{title:'аналитик',text:'Работай с данными.'}};
  const passed=await bridge([{id:1,method:'tools/call',params:{name:'assign_role',arguments:payload}},{id:2,method:'tools/call',params:{name:'assign_role',arguments:{...payload,from:'owner'}}}], 'test-token',{PANE_ID:'orchestrator',SEATS:'orchestrator:Оркестратор'});
  assert.equal(passed.requests.length,1);const req=passed.requests[0]!,body=JSON.parse(String(req.body)),token=(req.headers as Record<string,string>)['X-Pane-Token']!;
  result=await r.assignRole(r.validateBridge(body.from,token),body);assert.equal((passed.replies[1]!.result as {isError:boolean}).isError,true);
 }return {text:'done',sessionId:null}};
 r.postOwner({to:'orchestrator',kind:'task',text:'создай аналитика'},OWNER);await r.idle();assert.deepEqual(result,{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});assert.equal(r.registry.get('executor'),null);assert.equal(existsSync(join(h.dir,'.harness','roles/seats/executor.md')),false);assert.throws(()=>r.validateBridge('orchestrator','test-token'),/ход не активен/);
});

test('52/54 ОКНА: historical assignment: target starts answering while assignment waits for root lock; source stays unchanged',async t=>{
 const {runtime:r,provider:f}=await harness(t,{seats,actions});r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','источник');r.project.state.savePanes(r.registry,r.journal);
 const held=deferred(),entered=deferred(),result=deferred<{text:string;sessionId:null}>();const lock=withPathLock(r.project.dir,async()=>{entered.resolve();await held.promise});await entered.promise;
 const assignment=assert.rejects(savedConversationAssignment(r,{role:'orchestrator'}),fail('busy'));f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return result.promise};const turn=r.runTurn('orchestrator','параллельный ход');await until(()=>r.registry.get('orchestrator')!.busy);held.resolve();await lock;await assignment;assert.equal(records(r,'orchestrator','assign').length,0);assert.equal(r.registry.get('room')!.transcript[0]!.text,'источник');result.resolve({text:'ответ',sessionId:null});await turn;
});
