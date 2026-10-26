import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync,fsyncSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Journal,type Initiator} from '@harnessy/journal';
import {ProviderError} from '@harnessy/providers';
import {withPathLock} from '@harnessy/team';
import {createRuntime,diskIO,RuntimeError,withRoleActions,type StateIO} from './index.ts';
import {savedAssignment,completedActions,collect,deferred,FakeProvider,harness,promotionInput,OWNER,until} from './test-helpers.ts';

const error=(code:string)=>(e:unknown)=>e instanceof RuntimeError&&e.code===code;
function seed(dir:string,id='old-turn',pane='worker',delivery=true){
 const j=new Journal(dir),record=j.append({sender:'owner',to:[pane],kind:'task',text:'прежнее задание'});
 writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({[pane]:{turnInstanceId:id,recordSeqs:[record.seq],startedAt:1,...(delivery?{deliverySeq:record.seq}:{})}}));
}
const decision=(r:Awaited<ReturnType<typeof harness>>['runtime'],action='skip',id=r.waiting('worker')!.turnInstanceId)=>r.attempt('worker',{project:r.project.dir,turnInstanceId:id,action},OWNER);

test('73/93/97: queued owner message, settings and unhalt preserve the exact attempt; openSession reads nothing',async t=>{
 const h=await harness(t,{noRepository:true,before:seed}),r=h.runtime,p=r.registry.get('worker')!,saved=readFileSync(r.project.state.attemptsPath,'utf8'),{events}=collect(r);
 const reply=r.chat({pane:'worker',message:'более позднее задание'},OWNER);assert.equal(reply.queued,true);assert.deepEqual(reply.waiting,{queuedSeqs:[reply.seq],status:'uncertain',recordSeqs:[1],startedAt:1,turnInstanceId:'old-turn',actions:['retry','skip']});
 const settings=r.paneSet('worker',{model:'w2'},OWNER);assert.equal(settings.pane.model,'w2');assert.deepEqual(settings.waiting,reply.waiting);
 await r.halt(false,OWNER);await r.idle();assert.equal(h.provider.calls.length,0);assert.equal(p.status,'uncertain');assert.equal(readFileSync(r.project.state.attemptsPath,'utf8'),saved);
 await assert.rejects(r.openSession('worker','old',OWNER),error('uncertain'));assert.equal(h.provider.messageCalls,0);assert.equal(r.journal.pendingFor('worker').length,2);
 assert.ok(events.some(e=>e.type==='state'&&e.pane==='worker'&&(e.waiting as {turnInstanceId:string})?.turnInstanceId==='old-turn'));
});

test('93: openSession rechecks uncertain after provider await and preserves chat/session',async t=>{
 const h=await harness(t,{noRepository:true}),r=h.runtime,p=r.registry.get('worker')!,gate=deferred<{role:'ai';text:string}[]>();h.provider.onMessages=()=>gate.promise;
 const reading=r.openSession('worker','external',OWNER);await until(()=>h.provider.messageCalls===1);
 const record=r.journal.append({sender:'owner',to:['worker'],kind:'task',text:'неизвестный исход'});r.project.state.startAttempt(p,{turnInstanceId:'during-read',recordSeqs:[record.seq],deliverySeq:record.seq,startedAt:1});r.project.state.uncertain('worker');p.status='uncertain';
 gate.resolve([{role:'ai',text:'старый ответ'}]);await assert.rejects(reading,error('uncertain'));assert.equal(p.sessionId,null);assert.equal(p.transcript.length,0);
});

for(const operation of ['set','create'] as const)for(const status of ['uncertain','recovering','restoreFailed'] as const)test('72: project '+operation+' escapes '+status+' and reopening never repeats a saved model action',async t=>{
 let failing=status==='recovering';const h=await harness(t,{...(status==='uncertain'?{before:seed}:{}),actions:{...completedActions,async afterTurn(){if(failing)throw Error('местные эффекты');return 'completed'}}}),r=h.runtime,original=r.project;
 if(status==='recovering'){r.chat({pane:'worker',message:'ответ сохранится'},OWNER);await r.idle();assert.equal(original.state.attempts.worker,undefined);assert.equal(original.registry.get('worker')!.status,'recovering')}
 if(status==='restoreFailed')original.restoreFailed.set('worker','назначение не восстановлено');
 const calls=h.provider.calls.length,path=join(h.dir,'destination');if(operation==='set')mkdirSync(path);
 const result=operation==='set'?await r.projectSet(path,{},OWNER):await r.projectCreate({path,git:false,model:'w1'},OWNER);assert.equal(result.ok,true);assert.equal(original.closed,true);
 failing=false;await r.projectSet(h.dir,{},OWNER);await r.idle();assert.equal(h.provider.calls.length,calls);
 if(status==='uncertain'){assert.equal(r.registry.get('worker')!.status,'uncertain');assert.equal(r.waiting('worker')!.turnInstanceId,'old-turn')}
 if(status==='recovering'){assert.equal(r.registry.get('worker')!.status,'idle');assert.equal(r.registry.get('worker')!.transcript.filter(m=>m.role==='ai').length,1)}
});

for(const blocked of ['editing','materializing'] as const)for(const operation of ['set','create'] as const)test('72: project '+operation+' still blocks '+blocked+' before changing files',async t=>{
 const h=await harness(t),r=h.runtime,path=join(h.dir,'destination');mkdirSync(path);const original=r.project;
 if(blocked==='editing')original.editing.set('worker',Symbol());else original.materializing.add('worker');
 await assert.rejects(operation==='set'?r.projectSet(path,{},OWNER):r.projectCreate({path:join(path,'new')},OWNER),error('busy'));assert.equal(r.project,original);assert.equal(original.closed,false);
 original.editing.clear();original.materializing.clear();
});

for(const failSave of [false,true])test('72: undurable result gets one save before close; save failure='+failSave+' keeps project open with 409/path',async t=>{
 let armed=false,writes=0;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('chats.json')&&text.includes('"runtime"')){writes++;throw Error('disk unavailable')}diskIO.write(path,text)}};
 const h=await harness(t,{deps:{stateIO:io}}),r=h.runtime,old=r.project,destination=join(h.dir,'destination');mkdirSync(destination);armed=true;
 r.chat({pane:'worker',message:'сохранить ответ'},OWNER);await r.idle();assert.equal(old.state.undurable.size,1);const baseline=writes;armed=failSave;
 if(failSave){await assert.rejects(r.projectSet(destination,{},OWNER),(e:unknown)=>e instanceof RuntimeError&&e.code==='write_failed'&&e.status===409&&e.fields.path===old.state.chatsPath&&e.message.includes(old.state.chatsPath));assert.equal(writes-baseline,1);assert.equal(r.project,old);assert.equal(old.closed,false);assert.equal(old.state.undurable.size,1)}
 else {await r.projectSet(destination,{},OWNER);assert.equal(old.closed,true);assert.equal(old.state.undurable.size,0);const disk=JSON.parse(readFileSync(old.state.chatsPath,'utf8'));assert.equal(Object.values(disk.chats as Record<string,{transcript:{role:string}[]}>)[0]!.transcript.filter(m=>m.role==='ai').length,1)}
 armed=false;
});

test('72/96/101: uncertain room can move or become an orchestrator without discarding its source attempt',async t=>{
 const h=await harness(t,{actions:withRoleActions(completedActions)}),r=h.runtime;await r.settingsPatch('owner',{projectsRoot:join(h.dir,'projects')},OWNER);
 r.roomSet({model:'w1',folder:false},OWNER);h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','после эффекта')};r.chat({pane:'room',message:'Хочу проект для заявления'},OWNER);await r.idle();const sourceId=r.waiting('room')!.turnInstanceId;h.provider.onRun=null;
 const moved=join(h.dir,'moved');mkdirSync(moved);await r.roomMove({path:moved},OWNER);assert.equal(r.project.dir,moved);await r.projectSet(h.dir,{},OWNER);assert.equal(r.waiting('room')!.turnInstanceId,sourceId);
 const assigned=await r.assignRoomRole({...promotionInput(r),role:'orchestrator'},OWNER);await r.idle();assert.equal(assigned.created,true);assert.equal(assigned.pane.role,'orchestrator');assert.equal(JSON.parse(readFileSync(join(h.dir,'.harness','state','attempts.json'),'utf8')).room.turnInstanceId,sourceId);
});

test('72: saved materialization failure differs from active materialization and reload/switch stays available',async t=>{
 let fail=true;const io:StateIO={read:diskIO.read,write(path,text){if(fail&&path.endsWith('seat-materialization.json')&&text.includes('"team": true'))throw Error('manifest stage write');diskIO.write(path,text)}};
 const h=await harness(t,{seats:'  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read}',deps:{stateIO:io},actions:withRoleActions(completedActions)}),r=h.runtime;await assert.rejects(savedAssignment(r,{role:'assistant'}),/manifest stage write/);await r.close();
 const reopened=await createRuntime(h.deps,withRoleActions(completedActions));t.after(()=>reopened.close());assert.equal(reopened.project.materializing.size,0);assert.ok(reopened.project.restoreFailed.size>0);
 const sid=[...reopened.project.restoreFailed.keys()][0]!;assert.throws(()=>reopened.chat({pane:sid,message:'не запускать'},OWNER),error('restore_failed'));assert.throws(()=>reopened.paneSet(sid,{model:'w2'},OWNER),error('restore_failed'));await assert.rejects(reopened.runTurn(sid,'не запускать'),error('restore_failed'));await assert.rejects(reopened.onboard(sid,OWNER),error('restore_failed'));await assert.rejects(reopened.ensureSeatMaterialized(sid,OWNER),error('restore_failed'));
 const destination=join(h.dir,'other');mkdirSync(destination);await reopened.projectSet(destination,{},OWNER);fail=false;await reopened.projectSet(h.dir,{},OWNER);await reopened.idle();assert.equal(reopened.project.restoreFailed.size,0);
});

test('74/98: authorization, required binding, unavailable action and repeated decisions never mutate another attempt',async t=>{
 const h=await harness(t,{noRepository:true,before:seed}),r=h.runtime,input={project:h.dir,turnInstanceId:'old-turn',action:'skip'},before=readFileSync(r.project.state.attemptsPath,'utf8');
 for(const initiator of [{seat:'worker',trust:'agent'},{seat:'owner',trust:'agent'},{seat:'harness',trust:'harness'}] as Initiator[])await assert.rejects(r.attempt('worker',input,initiator),error('policy_denied'));
 for(const key of ['project','turnInstanceId','action'])for(const value of [undefined,null,42,'']){const bad={...input,[key]:value};await assert.rejects(r.attempt('worker',bad,OWNER),error(key==='project'&&value===''?'project_changed':'attempt_invalid'))}
 await assert.rejects(r.attempt('worker',{...input,project:h.dir+'/other'},OWNER),error('project_changed'));await assert.rejects(r.attempt('worker',{...input,turnInstanceId:'other'},OWNER),error('stale_attempt'));await assert.rejects(r.attempt('worker',{...input,action:'finish'},OWNER),error('attempt_invalid'));
 assert.equal(readFileSync(r.project.state.attemptsPath,'utf8'),before);assert.equal(r.journal.lastSeq,1);
 const first=await r.attempt('worker',input,OWNER);await r.idle();assert.deepEqual(await r.attempt('worker',input,OWNER),first);await assert.rejects(r.attempt('worker',{...input,action:'retry'},OWNER),error('decision_exists'));await assert.rejects(r.attempt('worker',{...input,turnInstanceId:'new'},OWNER),error('not_waiting'));assert.equal(h.provider.calls.length,0);
 const records=r.journal.read({limit:0}).filter(rec=>rec.origin==='attempt');assert.equal(records.length,2);assert.equal(records[1]!.reply_to,records[0]!.seq);assert.equal(records[1]!.attempt!.done,true);assert.equal(records[1]!.text,'пропущено владельцем: #1–#1');assert.deepEqual(r.journal.pendingFor('worker'),[]);
});

test('74: owner authority and project are rechecked after waiting for the lock',async t=>{
 const h=await harness(t,{noRepository:true,before:seed}),r=h.runtime,held=deferred(),entered=deferred(),who:Initiator={seat:'owner',trust:'owner'};
 const lock=withPathLock(h.dir,async()=>{entered.resolve();await held.promise});await entered.promise;const pending=r.attempt('worker',{project:h.dir,turnInstanceId:'old-turn',action:'skip'},who);who.trust='agent';held.resolve();await lock;await assert.rejects(pending,error('policy_denied'));assert.equal(r.journal.lastSeq,1);assert.ok(r.project.state.attempts.worker);
});

for(const legacy of [false,true])test('99: skip uses actual late owner-ack delivery boundary, legacy='+legacy+', and keeps later work',async t=>{
 const h=await harness(t,{noRepository:true,before:dir=>{const j=new Journal(dir),q=j.append({sender:'peer',to:['worker'],kind:'question',text:'не повторять прежний вопрос',ack:'pending'});j.append({sender:'owner',to:['owner'],kind:'note',text:'между вопросом и решением'});const ack=j.append({sender:'owner',to:['harness'],kind:'ack',text:'allow',reply_to:q.seq});writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({worker:{turnInstanceId:'acked-turn',recordSeqs:[q.seq],startedAt:1,...(legacy?{}:{deliverySeq:ack.seq})}}))}}),r=h.runtime,gate=deferred<{text:string;sessionId:null}>();
 const later=r.chat({pane:'worker',message:'выполнить новое задание'},OWNER);assert.deepEqual(r.waiting('worker')!.actions,['retry','skip']);h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};
 await decision(r);await until(()=>h.provider.calls.length===1);assert.equal(r.journal.cursors.worker,3);assert.deepEqual(r.journal.pendingFor('worker').map(e=>e.record.seq),[later.seq]);assert.match(h.provider.calls[0]!.message,/выполнить новое задание/);assert.doesNotMatch(h.provider.calls[0]!.message,/не повторять прежний вопрос/);assert.equal(r.project.state.attempts.worker!.deliverySeq,later.seq);
 gate.resolve({text:'новый ответ',sessionId:null});await r.idle();assert.equal(r.journal.cursors.worker,later.seq);
});

for(const invalid of ['missing','foreign','unapproved','wrong-boundary'])test('99: unverifiable '+invalid+' delivery offers retry only',async t=>{
 const h=await harness(t,{noRepository:true,before:dir=>{const j=new Journal(dir),q=j.append({sender:'owner',to:[invalid==='foreign'?'owner':'worker'],kind:'task',text:'неизвестная граница',...(invalid==='unapproved'?{ack:'pending' as const}:{})});writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({worker:{turnInstanceId:'bad-boundary',recordSeqs:[invalid==='missing'?999:q.seq],startedAt:1,...(invalid==='wrong-boundary'?{deliverySeq:55}:{})}}))}}),r=h.runtime;
 assert.deepEqual(r.waiting('worker')!.actions,['retry']);await assert.rejects(decision(r),error('attempt_invalid'));assert.equal(h.provider.calls.length,0);assert.equal(r.journal.cursors.worker??0,0);
});

for(const cut of ['decision-before','decision-fsync','advance','clear-before','clear-after','done-before','done-fsync'])test('98: skip survives '+cut+' and two restarts without duplicate decision/model call',async t=>{
 let armed=false,fsyncCut=false;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('attempts.json')&&!JSON.parse(text).worker&&cut.startsWith('clear-')){armed=false;if(cut==='clear-after')diskIO.write(path,text);throw Error(cut)}diskIO.write(path,text)}};
 const h=await harness(t,{noRepository:true,before:seed,deps:{stateIO:io,journalOptions:{fs:{appendFileSync(fd,line,encoding){const data=JSON.parse(String(line));if(armed&&(cut.startsWith('decision-')||cut.startsWith('done-'))&&data.origin==='attempt'&&data.attempt.done===cut.startsWith('done-')){if(cut.endsWith('-before')){armed=false;throw Error(cut)}if(cut.endsWith('-fsync')){armed=false;fsyncCut=true}}appendFileSync(fd,line,encoding)},fsyncSync(fd){fsyncSync(fd);if(fsyncCut){fsyncCut=false;throw Error(cut)}},renameSync(from,to){if(armed&&cut==='advance'&&String(to).endsWith('cursors.json')){armed=false;throw Error(cut)}renameSync(from,to)}}}}}),r=h.runtime;
 armed=true;await assert.rejects(decision(r));assert.equal(armed,false);assert.equal(h.provider.calls.length,0);await r.close();
 const next=new FakeProvider(),second=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>second.close());await second.idle();assert.equal(next.calls.length,0);
 if(cut==='decision-before'){assert.equal(second.registry.get('worker')!.status,'uncertain');await decision(second);await second.idle()}
 assert.equal(second.project.state.attempts.worker,undefined);assert.equal(second.journal.cursors.worker,1);await second.close();
 const thirdProvider=new FakeProvider(),third=await createRuntime({...h.deps,providers:{claude:thirdProvider}},completedActions);t.after(()=>third.close());await third.idle();assert.equal(thirdProvider.calls.length,0);const entries=third.journal.read({limit:0}).filter(rec=>rec.origin==='attempt');assert.equal(entries.length,2);assert.equal(entries.filter(rec=>rec.attempt!.done).length,1);assert.equal(third.journal.pendingFor('worker').length,0);
});

test('94/101: finish uses saved result id without an attempt, refuses mutation and completes effects without a model',async t=>{
 let fail=true,effects=0;const h=await harness(t,{noRepository:true,actions:{...completedActions,async afterTurn(){effects++;if(fail)throw Error('effect unavailable');return 'completed'}}}),r=h.runtime;
 r.chat({pane:'worker',message:'получить ответ'},OWNER);await r.idle();const pane=r.registry.get('worker')!,result=r.project.state.results(pane)[0]!;assert.equal(r.project.state.attempts.worker,undefined);assert.deepEqual(r.waiting('worker'),{status:'recovering',recordSeqs:[1],startedAt:null,turnInstanceId:result.runtime.turnInstanceId,actions:['finish']});
 assert.throws(()=>r.chat({pane:'worker',message:'не перезаписать'},OWNER),error('recovering'));assert.throws(()=>r.paneSet('worker',{model:'w2'},OWNER),error('recovering'));await assert.rejects(r.openSession('worker','old',OWNER),error('recovering'));assert.equal(h.provider.messageCalls,0);await assert.rejects(decision(r,'skip',result.runtime.turnInstanceId),error('attempt_invalid'));
 fail=false;const completed=await decision(r,'finish',result.runtime.turnInstanceId);await r.idle();assert.equal(h.provider.calls.length,1);assert.equal(pane.status,'idle');assert.equal(result.runtime.effectsPending,false);assert.equal(pane.transcript.filter(m=>m.role==='ai').length,1);assert.deepEqual(await decision(r,'finish',result.runtime.turnInstanceId),completed);assert.equal(effects,2);
});

for(const cut of ['archive','promote'])test('100: damaged file keeps per-seat episodes and exact backup; crash at '+cut+' does not release neighbors',async t=>{
 let armed=false;const io:StateIO={read:diskIO.read,write:diskIO.write,rename(from,to){if(armed&&(cut==='archive'?to.includes('.damaged-'):from.endsWith('.repair'))){armed=false;throw Error('rename cut')}renameSync(from,to)}};
 const h=await harness(t,{noRepository:true,seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',before:dir=>{writeFileSync(join(dir,'.harness','state','attempts.json'),'{broken bytes');new Journal(dir).append({sender:'owner',to:['worker'],kind:'task',text:'повтор только по решению'})},deps:{stateIO:io}}),r=h.runtime,first=r.waiting('worker')!,neighbor=r.waiting('peer')!;
 assert.notEqual(first.turnInstanceId,neighbor.turnInstanceId);assert.deepEqual(first.actions,['retry']);assert.deepEqual(neighbor.actions,['retry']);assert.equal(readFileSync(r.project.state.attemptsPath,'utf8'),'{broken bytes');await assert.rejects(decision(r,'skip'),error('attempt_invalid'));
 armed=true;await assert.rejects(decision(r,'retry'));assert.equal(h.provider.calls.length,0);await r.close();const next=new FakeProvider(),second=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>second.close());await second.idle();assert.equal(next.calls.length,1);assert.equal(next.calls[0]!.seat.id,'worker');assert.equal(second.waiting('peer')!.turnInstanceId,neighbor.turnInstanceId);assert.equal(second.registry.get('peer')!.status,'uncertain');
 const backup=readdirSync(join(h.dir,'.harness','state')).find(path=>path.startsWith('attempts.json.damaged-'))!;assert.ok(backup);assert.equal(readFileSync(join(h.dir,'.harness','state',backup),'utf8'),'{broken bytes');
});

test('100: old click after fresh damage is stale, cannot erase the new damaged file',async t=>{
 const h=await harness(t,{noRepository:true,before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),'first bad')}),r=h.runtime,id=r.waiting('worker')!.turnInstanceId;writeFileSync(r.project.state.attemptsPath,'second bad');
 await assert.rejects(decision(r,'retry',id),error('stale_attempt'));assert.notEqual(r.waiting('worker')!.turnInstanceId,id);assert.equal(readFileSync(r.project.state.attemptsPath,'utf8'),'second bad');assert.equal(h.provider.calls.length,0);assert.equal(r.journal.read({limit:0}).filter(rec=>rec.origin==='attempt').length,0);
});

test('100: retry after archive/promotion failure can finish in the same process, without losing neighboring waits',async t=>{
 let cut=false;const io:StateIO={read:diskIO.read,write:diskIO.write,rename(from,to){if(cut&&from.endsWith('.repair')){cut=false;throw Error('promotion failed')}renameSync(from,to)}};
 const h=await harness(t,{noRepository:true,seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),'invalid'),deps:{stateIO:io}}),r=h.runtime,id=r.waiting('worker')!.turnInstanceId,neighbor=r.waiting('peer')!.turnInstanceId;
 cut=true;await assert.rejects(decision(r,'retry',id));const result=await decision(r,'retry',id);await r.idle();assert.equal(result.ok,true);assert.equal(r.waiting('peer')!.turnInstanceId,neighbor);assert.equal(r.journal.read({limit:0}).filter(rec=>rec.origin==='attempt').length,2);
});

test('100: non-UTF8 attempts are archived exactly; unknown queue is never silently skipped',async t=>{
 const bytes=Buffer.from([0xff,0x80,0x00,0x42]);const h=await harness(t,{noRepository:true,before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),bytes)}),r=h.runtime;assert.deepEqual(r.waiting('worker')!.actions,['retry']);await decision(r,'retry');await r.idle();
 const backup=readdirSync(join(h.dir,'.harness','state')).find(path=>path.startsWith('attempts.json.damaged-'))!;assert.deepEqual(readFileSync(join(h.dir,'.harness','state',backup)),bytes);assert.equal(r.waiting('worker'),null);
});

for(const bytes of [Buffer.from('{original damaged bytes'),Buffer.from([0xff,0x80,0x00,0x42])])for(const outcome of ['done','cancelled','uncertain'])test('TS-07 r2/1: unrelated room '+outcome+' archives damaged attempts before the provider starts ('+bytes.toString('hex')+')',async t=>{
 const h=await harness(t,{noRepository:true,before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),bytes)}),r=h.runtime,worker=r.waiting('worker')!;
 const backups=()=>readdirSync(join(h.dir,'.harness','state')).filter(name=>name.startsWith('attempts.json.damaged-')).map(name=>readFileSync(join(h.dir,'.harness','state',name)));
 h.provider.onRun=async(seat,_text,ctx)=>{
  assert.equal(seat.id,'room');assert.equal(backups().length,1);assert.deepEqual(backups()[0],bytes);
  if(outcome==='cancelled')throw new ProviderError('cancelled','cancelled before model start');
  ctx.modelStarted?.();if(outcome==='uncertain')throw new ProviderError('transport_lost','possible external effect');
  ctx.publish({type:'done',model:seat.model,sessionId:'room-session',durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'room result',sessionId:'room-session'};
 };
 r.roomSet({model:'w1',folder:false},OWNER);r.chat({pane:'room',message:'unrelated room turn'},OWNER);await r.idle();
 assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.seat.id,'room');assert.deepEqual(backups(),[bytes]);assert.equal(r.waiting('worker')!.turnInstanceId,worker.turnInstanceId);assert.equal(r.registry.get('worker')!.status,'uncertain');
 const saved=JSON.parse(readFileSync(r.project.state.attemptsPath,'utf8'));assert.equal(saved.worker.turnInstanceId,worker.turnInstanceId);assert.equal(saved.room?.status,outcome==='done'?undefined:'uncertain');
 // TS-26 keeps cancellation before model start as unsent; damaged neighbors are unchanged.
 if(outcome==='cancelled')assert.equal(r.waiting('room')?.status,'unsent');else if(outcome==='uncertain')assert.ok(r.waiting('room'));else assert.equal(saved.room,undefined);
 if(outcome!=='cancelled'){
  await r.close();const provider=new FakeProvider(),restored=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>restored.close());await restored.idle();
  assert.equal(provider.calls.length,0);assert.equal(restored.waiting('worker')!.turnInstanceId,worker.turnInstanceId);assert.deepEqual(backups(),[bytes]);
 }
});

for(const cut of ['archive','promote'])test('TS-07 r2/1: unrelated room cannot start through a failed '+cut+'; retry preserves its neighbors',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write:diskIO.write,rename(from,to){if(armed&&(cut==='archive'?to.includes('.damaged-'):from.endsWith('.repair'))){armed=false;throw Error('archive/promotion unavailable')}diskIO.rename!(from,to)}};
 const bytes=Buffer.from('{original bytes before unrelated room');
 const h=await harness(t,{noRepository:true,before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),bytes),deps:{stateIO:io}}),r=h.runtime,worker=r.waiting('worker')!;
 r.roomSet({model:'w1',folder:false},OWNER);r.chat({pane:'room',message:'first room message'},OWNER);await r.idle();assert.equal(h.provider.calls.length,0);assert.equal(r.waiting('worker')!.turnInstanceId,worker.turnInstanceId);
 const originalOrBackup=readdirSync(join(h.dir,'.harness','state')).filter(name=>name==='attempts.json'||name.startsWith('attempts.json.damaged-')).map(name=>readFileSync(join(h.dir,'.harness','state',name)));assert.ok(originalOrBackup.some(raw=>raw.equals(bytes)));
 r.chat({pane:'room',message:'owner retries room'},OWNER);await r.idle();assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.seat.id,'room');assert.equal(r.waiting('worker')!.turnInstanceId,worker.turnInstanceId);
 const backup=readdirSync(join(h.dir,'.harness','state')).find(name=>name.startsWith('attempts.json.damaged-'))!;assert.deepEqual(readFileSync(join(h.dir,'.harness','state',backup)),bytes);
});

for(const bytes of [Buffer.from('{damaged original'),Buffer.from([0xff,0x80,0,0x42])])for(const cut of ['archive','promote'])test('110: failure after '+cut+' rename with fixed clocks never replaces the original archive ('+bytes.toString('hex')+')',async t=>{
 let armed=true;const io:StateIO={...diskIO,rename(from,to){diskIO.rename!(from,to);if(armed&&(cut==='archive'?to.includes('.damaged-'):from.endsWith('attempts.json.repair'))){armed=false;throw Object.assign(new Error('directory fsync failed after rename'),{code:'EIO'})}}};
 const h=await harness(t,{noRepository:true,before:dir=>writeFileSync(join(dir,'.harness','state','attempts.json'),bytes),deps:{stateIO:io}}),r=h.runtime,clock=h.clock.now(),neighbor=r.waiting('worker')!.turnInstanceId;
 const archives=()=>Object.fromEntries(readdirSync(join(h.dir,'.harness','state')).filter(name=>name.startsWith('attempts.json.damaged-')).map(name=>[name,readFileSync(join(h.dir,'.harness','state',name))]));
 r.roomSet({model:'w1',folder:false},OWNER);r.chat({pane:'room',message:'first room message'},OWNER);await r.idle();assert.equal(h.provider.calls.length,0);const before=archives();assert.equal(Object.keys(before).length,1);assert.deepEqual(Object.values(before),[bytes]);
 r.chat({pane:'room',message:'retry at the same timestamp'},OWNER);await r.idle();assert.equal(h.clock.now(),clock);assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.seat.id,'room');const after=archives();for(const [name,raw]of Object.entries(before))assert.deepEqual(after[name],raw);assert.ok(Object.values(after).some(raw=>raw.equals(bytes)));assert.equal(r.waiting('worker')!.turnInstanceId,neighbor);
 await r.close();const provider=new FakeProvider(),restored=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>restored.close());await restored.idle();assert.equal(provider.calls.length,0);assert.equal(restored.waiting('worker')!.turnInstanceId,neighbor);for(const [name,raw]of Object.entries(before))assert.deepEqual(archives()[name],raw);
});

for(const cut of ['clear-after','done-before','done-fsync'])test('98: durable retry intent at '+cut+' delivers once across two restarts',async t=>{
 let armed=false,fsyncCut=false;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&cut==='clear-after'&&path.endsWith('attempts.json')&&!JSON.parse(text).worker){armed=false;diskIO.write(path,text);throw Error(cut)}diskIO.write(path,text)}};
 const h=await harness(t,{noRepository:true,before:seed,deps:{stateIO:io,journalOptions:{fs:{appendFileSync(fd,line,encoding){const data=JSON.parse(String(line));if(armed&&cut.startsWith('done-')&&data.attempt?.done){armed=false;if(cut==='done-before')throw Error(cut);fsyncCut=true}appendFileSync(fd,line,encoding)},fsyncSync(fd){fsyncSync(fd);if(fsyncCut){fsyncCut=false;throw Error(cut)}}}}}}),r=h.runtime;armed=true;await assert.rejects(decision(r,'retry'));await r.close();
 const next=new FakeProvider(),second=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>second.close());await second.idle();assert.equal(next.calls.length,1);assert.match(next.calls[0]!.message,/прежнее задание/);assert.equal(second.journal.pendingFor('worker').length,0);await second.close();const last=new FakeProvider(),third=await createRuntime({...h.deps,providers:{claude:last}},completedActions);t.after(()=>third.close());await third.idle();assert.equal(last.calls.length,0);assert.equal(third.journal.read({limit:0}).filter(rec=>rec.origin==='attempt').length,2);
});

test('94/98: finish decision survives failure after effects, and two restarts repeat neither model nor effect',async t=>{
 let failEffect=true,cut=false,effects=0;const io:StateIO={read:diskIO.read,write(path,text){if(cut&&path.endsWith('chats.json')&&text.includes('"effectsPending": false')){cut=false;throw Error('completion marker failed')}diskIO.write(path,text)}};
 const actions={...completedActions,async afterTurn({project,turnInstanceId}:Parameters<typeof completedActions.afterTurn>[0]){if(failEffect)throw Error('effect unavailable');if(!project.journal.read({thread:turnInstanceId,limit:0}).some(rec=>rec.origin==='finish-effect')){project.journal.append({sender:'harness',to:['owner'],kind:'note',thread:turnInstanceId,origin:'finish-effect',text:'effect once'});effects++}return 'completed' as const}};
 const h=await harness(t,{noRepository:true,deps:{stateIO:io},actions}),r=h.runtime;r.chat({pane:'worker',message:'ответить'},OWNER);await r.idle();const id=r.waiting('worker')!.turnInstanceId;failEffect=false;cut=true;await assert.rejects(decision(r,'finish',id));assert.equal(effects,1);assert.equal(r.project.state.attempts.worker,undefined);await r.close();
 const next=new FakeProvider(),second=await createRuntime({...h.deps,providers:{claude:next}},actions);t.after(()=>second.close());await second.idle();assert.equal(next.calls.length,0);assert.equal(effects,1);assert.equal(second.waiting('worker'),null);await second.close();const last=new FakeProvider(),third=await createRuntime({...h.deps,providers:{claude:last}},actions);t.after(()=>third.close());await third.idle();assert.equal(last.calls.length,0);assert.equal(effects,1);assert.equal(third.journal.read({limit:0}).filter(rec=>rec.origin==='attempt').length,2);
});

test('77: repeated subscriptions replay the same warning id; resolving and a new attempt yield a new id',async t=>{
 const h=await harness(t,{noRepository:true,before:seed}),r=h.runtime;const first=r.subscribe({all:true}),second=r.subscribe({all:true}),one=(await first.events[Symbol.asyncIterator]().next()).value,two=(await second.events[Symbol.asyncIterator]().next()).value;
 assert.equal(one.warning,'worker:old-turn:uncertain');assert.equal(two.warning,one.warning);assert.equal(one.replay,true);assert.equal(two.replay,true);first.close();second.close();
 const {events}=collect(r);await decision(r);await r.idle();assert.ok(events.some(e=>e.type==='state'&&e.pane==='worker'&&e.status==='idle'&&e.waiting===null));assert.equal(r.registry.get('worker')!.uncertainNote,null);
 h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','same error')};r.chat({pane:'worker',message:'следующий ход'},OWNER);await r.idle();const replay=r.subscribe({all:true}),next=(await replay.events[Symbol.asyncIterator]().next()).value;assert.equal(next.replay,true);assert.notEqual(next.warning,one.warning);assert.match(String(next.warning),/:uncertain$/);replay.close();
});

for(const missing of ['pane','turnInstanceId','action','deliverySeq','done','thread'])test('98: incomplete trusted decision '+missing+' cannot run the model or trap the project switch',async t=>{
 const h=await harness(t,{before:dir=>{seed(dir);const a:Record<string,unknown>={pane:'worker',turnInstanceId:'old-turn',action:'skip',deliverySeq:1,done:false};if(missing!=='thread')delete a[missing];new Journal(dir).append({sender:'harness',to:['owner'],kind:'note',origin:'attempt',thread:missing==='thread'?'unrelated':'attempt:old-turn',text:'решение',attempt:a as never})}}),r=h.runtime;
 assert.ok(r.project.restoreFailed.has('worker'));assert.equal(h.provider.calls.length,0);await assert.rejects(r.attempt('worker',{project:h.dir,turnInstanceId:'old-turn',action:'skip'},OWNER),error('decision_invalid'));const target=join(h.dir,'safe-other');mkdirSync(target);await r.projectSet(target,{},OWNER);assert.equal(r.project.dir,target);
});

test('98: metadata from another sender or origin is not treated as an owner decision',async t=>{
 const h=await harness(t,{before:dir=>{seed(dir);const j=new Journal(dir),a={pane:'worker',turnInstanceId:'old-turn',action:'skip' as const,deliverySeq:1,done:false};j.append({sender:'peer',to:['owner'],kind:'note',origin:'attempt',thread:'attempt:old-turn',text:'имитация',attempt:a});j.append({sender:'harness',to:['owner'],kind:'note',origin:'other',thread:'attempt:old-turn',text:'другой источник',attempt:a})}}),r=h.runtime;
 assert.equal(r.registry.get('worker')!.status,'uncertain');assert.equal(r.journal.cursors.worker??0,0);assert.equal(h.provider.calls.length,0);assert.equal(r.waiting('worker')!.turnInstanceId,'old-turn');
});
