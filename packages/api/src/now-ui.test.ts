import test from 'node:test';
import assert from 'node:assert/strict';
import {Approval,createRuntime} from '@harnessy/runtime';
import {ProviderError} from '@harnessy/providers';
import {rmSync} from 'node:fs';
import {createApi} from './server.ts';
import {fixture,call,deferred,until,FakeProvider} from './test-helpers.ts';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {nowUI,status,journal,record} from './now-ui-test-helpers.ts';

const approval={pane:'worker',id:'abc',title:'Разрешить команду?',detail:'pwd'};
const settled=async(v:ReturnType<typeof nowUI>)=>{for(let i=0;i<10&&v.functions.state.job;i++)await v.functions.state.job};

test('167/185: cold HTTP snapshot includes ordinary and durable owner confirmations; real sketch controls decide once',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!;void pane.askApproval('Обычный вопрос','<script>untrusted</script>');h.clock.time=Date.now()-3600000;
 const seq=h.runtime.journal.append({sender:'worker',to:'owner',kind:'question',text:'Подтвердить работу'}).seq;
 const ack=new Approval('ack:'+seq,h.runtime.project.owner,'Подтверждение записи','Сохранённая запись',900000,h.clock);h.runtime.project.owner.approvals.set(ack.id,ack);
 const v=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);v.H.project=h.dir;
 const originals=['#v-turn .nums','#v-turn .lst','#v-week .filters','#v-week .lst','#v-away .nums','#v-away .lst','#idle'].map(s=>v.find(s));await v.start();
 for(const n of originals)assert.ok(v.document.contains(n));v.functions.oldRefresh();assert.equal(v.functions.items().pending.length,2);assert.match(v.find('#v-turn .lst').textContent,/время начала неизвестно/);assert.match(v.find('#v-turn .lst').textContent,/60 мин/);
 assert.doesNotMatch(v.find('.views').textContent,/H1\.5|18:40|6 ч 12 мин/);assert.match(v.find('#v-away .lst').textContent,/События|события/);assert.match(v.find('#idle').textContent,/Нет данных о времени завершения/);
 const age=v.functions.items().pending.find((p:any)=>p.approval?.id===ack.id).ts;await v.functions.fetch();assert.equal(v.functions.items().pending.find((p:any)=>p.approval?.id===ack.id).ts,age);assert.equal(h.provider.calls.length,0);
});

test('167: real overlay approval passes project/pane/id, double click is coalesced, old sketch handlers never run',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!,answer=pane.askApproval('Выполнить pwd','<script>bad</script>'),gate=deferred(),captured=deferred();let writes=0;
 const v=nowUI(async(path,body)=>{if(path==='/api/approve'){writes++;captured.resolve();await gate.promise}return (await call(h.api,path,{body})).body});v.H.project=h.dir;await v.start();
 await v.find('[data-now-open]').emit('click');assert.equal(v.document.querySelector('.ovl script'),null);assert.match(v.find('.ovl').textContent,/Выполнить pwd/);
 const button=v.find('[data-ap-decision="allow"]'),first=button.emit('click');await captured.promise;assert.equal(button.disabled,true);await button.emit('click');gate.resolve();await first;assert.equal(writes,1);assert.equal(await answer,true);
 const sent=v.requests.find(r=>r.path==='/api/approve')!;assert.equal(sent.body.project,h.dir);assert.equal(sent.body.pane,'worker');assert.equal(v.functions.items().pending.length,0);
 await v.find('#idle').emit('click');assert.doesNotMatch(v.find('.ovl').textContent,/18:40|Подпись M0/);await v.find('[data-passport]').emit('click');assert.doesNotMatch(v.find('.ovl').textContent,/18:40|15 мин/);
 await v.find('[data-v="week"]').emit('click');assert.equal(v.find('#v-week').classList.contains('on'),true);await v.window.emit('keydown',{key:'3',target:v.body});assert.equal(v.find('#v-away').classList.contains('on'),true);
});

test('167: denial and HTTP errors retain the decision and offer a working retry',async()=>{
 let fail=true,open=true;const v=nowUI(async(path,body)=>path==='/api/status'?status('/a',open?[approval]:[]):path.startsWith('/api/journal')?journal('/a',[]):fail?{ok:false,error:'запись не выполнена'}:(open=false,{ok:true}));await v.start();
 await v.find('[data-now-open]').emit('click');await v.find('[data-ap-decision="deny"]').emit('click');assert.match(v.find('[data-now-action-error]').textContent,/запись не выполнена/);assert.equal(v.find('[data-ap-decision="deny"]').disabled,false);assert.equal(v.functions.items().pending.length,1);
 fail=false;await v.find('[data-ap-decision="deny"]').emit('click');assert.equal(v.functions.items().pending.length,0);
});

test('167/185: journal questions, linked answers and attempt notes feed decisions; filters and original blocks survive',async t=>{
 const h=await fixture(t),j=h.runtime.journal;h.clock.time=Date.now();
 const q=j.append({sender:'worker',to:'owner',kind:'question',text:'Вопрос в журнале'});j.append({sender:'owner',to:'worker',kind:'answer',text:'Решение владельца',reply_to:q.seq});
 j.append({sender:'worker',to:'owner',kind:'question',text:'Ещё открыт'});j.append({sender:'owner',to:'worker',kind:'decision',text:'Отдельное решение'});
 const v=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);v.H.project=h.dir;await v.start();assert.equal(v.functions.items().pending.length,1);assert.equal(v.functions.items().resolved.length,2);
 await v.find('[data-now-filter="resolved"]').emit('click');assert.match(v.find('#v-week .lst').textContent,/Вопрос в журнале/);assert.doesNotMatch(v.find('#v-week .lst').textContent,/Ещё открыт/);
 await v.find('#v-week [data-now-open="record:'+q.seq+'"]').emit('click');assert.match(v.find('.ovl').textContent,/Ответ · №2/);assert.match(v.find('.ovl').textContent,/Решение владельца/);
 assert.match(v.find('#v-away .lst').textContent,/Ещё открыт/);assert.equal(h.provider.calls.length,0);
});

for(const bad of [null,{ok:false,error:'disk unreadable'},{...journal(),project:'/other'},{...journal(),summary:undefined},{...journal(),records:[{...record(1),ts:'bad'}]}])test('167/184: invalid journal is not an empty project: '+JSON.stringify(bad),async()=>{
 let broken=false;const v=nowUI(async path=>path==='/api/status'?status('/a',[approval]):broken?bad:journal());await v.start();broken=true;await v.functions.fetch();assert.match(v.find('[data-now-error]').textContent,/Не удалось прочитать/);assert.match(v.find('#v-turn .lst').textContent,/Разрешить команду/);await v.find('[data-now-open]').emit('click');assert.equal(v.document.querySelector('[data-ap-decision]'),null);
 v.functions.reset();await v.functions.fetch();assert.match(v.find('#v-turn .lst').textContent,/Данные не прочитаны/);assert.doesNotMatch(v.find('#v-turn .lst').textContent,/никто не ждёт/);
});

for(const bad of [{...status(),approvals:undefined},{...status('/a',[approval]),approvals:[]},{...status(),approvals:[{...approval,detail:null}]}])test('167: missing or inconsistent HTTP confirmations fail closed',async()=>{
 const v=nowUI(async path=>path==='/api/status'?bad:journal());await v.start();assert.match(v.find('[data-now-error]').textContent,/Некорректная|некорректная/);assert.doesNotMatch(v.find('#v-turn .lst').textContent,/никто не ждёт/);
});

test('167/190: SSE is invalidation only; replay retains journal time and events during a read trigger a follow-up',async()=>{
 let latest=1,delay=false;const gate=deferred<any>(),seen=deferred();const v=nowUI(async path=>{if(path==='/api/status')return status('/a',[approval]);const r=journal('/a',Array.from({length:latest},(_,i)=>record(i+1)));if(delay){delay=false;seen.resolve();await gate.promise}return r});await v.start();
 delay=true;v.streams[0].onmessage({data:'{"type":"approval","id":"forged","title":"FAKE"}'});await seen.promise;latest=2;v.streams[0].onmessage({data:'{"type":"sent"}'});gate.resolve(null);await settled(v);
 assert.equal(v.functions.state.data.records.length,2);assert.doesNotMatch(v.find('#v-turn .lst').textContent,/FAKE/);assert.match(v.find('#v-turn .lst').textContent,/время начала неизвестно/);assert.equal(v.requests.filter(r=>r.path.startsWith('/api/journal')).length,3);
});

test('167/190: delayed A→B→A snapshots and late action replies cannot change the confirmed project',async()=>{
 const gates:Array<ReturnType<typeof deferred<any>>>=[];let delay=false;const v=nowUI(async path=>{if(path==='/api/status')return status(v.H.project,[approval]);if(delay){const gate=deferred<any>();gates.push(gate);return gate.promise}return journal(v.H.project)});await v.start();delay=true;
 const old=v.functions.fetch();await until(()=>gates.length===1);await v.switchProject('/b');await until(()=>gates.length===2);await v.switchProject('/a');await until(()=>gates.length===3);
 gates[2]!.resolve(journal('/a',[record(3,'new A')]));await settled(v);gates[1]!.resolve(journal('/b',[record(2,'old B')]));gates[0]!.resolve(journal('/a',[record(1,'old A')]));await old;
 assert.match(v.find('#v-away .lst').textContent,/new A/);assert.doesNotMatch(v.find('#v-away .lst').textContent,/old A|old B/);
});

test('167/190: cached page returns only after confirmed status, discards stale snapshots and replays no commands',async()=>{
 const gate=deferred<any>(),seen=deferred();let delay=false;const v=nowUI(async path=>{if(path==='/api/status')return status(v.H.project);if(delay){delay=false;seen.resolve();return gate.promise}return journal(v.H.project,[record(1,v.H.project+' history')])});await v.start();delay=true;const old=v.functions.fetch();await seen.promise;await v.window.emit('pagehide');assert.equal(v.streams[0].closed,true);assert.doesNotMatch(v.find('#v-away .lst').textContent,/a history/);
 v.H.project='/b';v.H.snapshotOnly=true;await v.window.emit('pageshow',{persisted:true});await v.window.emit('live:status');const reads=v.requests.length;v.H.liveStatus=status('/b');v.H.snapshotOnly=false;await v.window.emit('live:status');await settled(v);assert.ok(v.requests.length>reads);gate.resolve(journal('/a',[record(1,'stale')]));await old;
 assert.match(v.find('#v-away .lst').textContent,/b history/);assert.doesNotMatch(v.find('#v-away .lst').textContent,/stale/);assert.equal(v.requests.some(r=>r.body),false);
});

test('167: approval HTTP project guard is checked before resolving even when another project has the same id',async t=>{
 const h=await fixture(t),p=h.runtime.registry.get('worker')!,answer=p.askApproval('Keep','detail'),id=[...p.approvals.keys()][0];
 const denied=await call(h.api,'/api/approve',{body:{project:'/previous',pane:'worker',id,decision:'allow'}});assert.equal(denied.status,409);assert.equal(p.approvals.size,1);
 assert.equal((await call(h.api,'/api/approve',{body:{project:h.dir,pane:'worker',id,decision:'deny'}})).body.ok,true);assert.equal(await answer,false);
});

for(const legacy of [false,true])for(const action of ['retry','skip'])test('134/167: cold Now reads unknown room attempt through HTTP, same card resolves '+action+' and journal retains decision (legacy='+legacy+')',async t=>{
 const h=await fixture(t,{seats:'{}'});h.clock.time=Date.now();await call(h.api,'/api/room',{body:{model:'w1',folder:false}});h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','unknown result')};
 await call(h.api,'/api/chat',{body:{pane:'room',message:'question'}});await h.runtime.idle();const chatsPath=h.runtime.project.state.chatsPath;await h.api.close();if(legacy)rmSync(chatsPath);
 const provider=new FakeProvider(),runtime=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>runtime.close());const api=createApi({runtime,siteDir:h.siteDir,port:0});await api.listen();t.after(()=>api.close());
 const v=nowUI(async(path,body)=>(await call(api,path,{body})).body);v.H.project=h.dir;await v.start();const p=v.functions.state.data.status.panes.find((p:any)=>p.id==='room');assert.ok(p.waiting);
 assert.ok(v.find('#v-week .lst').innerHTML.includes(v.functions.waitingControls(p,p.waiting,h.dir)));assert.equal(provider.calls.length,0);
 await v.find('#v-week [data-attempt-action="'+action+'"]').emit('click');await runtime.idle();await v.functions.fetch();assert.equal(runtime.waiting('room'),null);assert.equal(provider.calls.length,action==='retry'?1:0);assert.equal(v.document.querySelector('#v-week [data-attempt-action]'),null);assert.match(v.find('#v-week .lst').textContent,/владельц/);
});

test('134/167: role uncertain and room recovering use the shared decision card, with no model calls for display',async()=>{
 const waiting={status:'uncertain',turnInstanceId:'episode',recordSeqs:[36],startedAt:Date.now()-60000,actions:['retry','skip']},panes=[{id:'worker',label:'воркер',pendingApprovals:0,waiting},{id:'room',label:'без роли',pendingApprovals:0,waiting:{...waiting,status:'recovering',turnInstanceId:'recovering:room',recordSeqs:[],actions:['finish']}}];
 const v=nowUI(async path=>path==='/api/status'?status('/a',[],panes):journal('/a',[]));await v.start();assert.equal(v.find('.top .st').textContent,'2 ждут вас · журнал и статус');
 for(const p of panes)assert.ok(v.find('#v-week .lst').innerHTML.includes(v.functions.waitingControls(p,p.waiting,'/a')));
 assert.equal(v.document.querySelectorAll('#v-week [data-attempt-action="retry"]').length,1);assert.equal(v.document.querySelectorAll('#v-week [data-attempt-action="skip"]').length,1);assert.equal(v.document.querySelectorAll('#v-week [data-attempt-action="finish"]').length,1);
 await v.find('[data-now-open="waiting:worker:episode"]').emit('click');assert.match(v.find('.ovl').textContent,/Итог хода по записи №36 неизвестен/);assert.match(v.find('.ovl').textContent,/Повторить — отправить записи №36/);assert.match(v.find('.ovl').textContent,/Пропустить — не отправлять/);
 panes[0]!.waiting=null as any;await v.functions.fetch();assert.equal(v.document.querySelector('#v-week [data-attempt-pane="worker"]'),null);assert.ok(v.document.querySelector('#v-week [data-attempt-pane="room"]'));assert.equal(v.find('.ovl').classList.contains('on'),false);
});

test('167/190: late successful HTTP decision cannot close another project overlay or alter its history',async t=>{
 const h=await fixture(t),p=h.runtime.registry.get('worker')!;void p.askApproval('A confirmation','A detail');const gate=deferred(),seen=deferred();let other=false;
 const v=nowUI(async(path,body)=>{if(path==='/api/approve'){const result=(await call(h.api,path,{body})).body;seen.resolve();await gate.promise;return result}if(other)return path==='/api/status'?status('/b',[{...approval,title:'B confirmation'}]):journal('/b',[record(1,'B history')]);return (await call(h.api,path)).body});v.H.project=h.dir;await v.start();await v.find('[data-now-open]').emit('click');const deciding=v.find('[data-ap-decision="allow"]').emit('click');await seen.promise;
 other=true;v.H.liveStatus=status('/b',[{...approval,title:'B confirmation'}]);v.H.project='/b';v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await settled(v);await v.find('[data-now-open]').emit('click');gate.resolve();await deciding;
 assert.equal(v.H.project,'/b');assert.match(v.find('.ovl').textContent,/B confirmation/);assert.match(v.find('#v-away .lst').textContent,/B history/);assert.equal(v.find('.ovl').classList.contains('on'),true);assert.equal(v.toasts.length,0);
});

test('167: empty read is explicit, long history loads more, all three views keep their sketch containers',async()=>{
 let records:any[]=[];const v=nowUI(async path=>path==='/api/status'?status():journal('/a',records));await v.start();assert.match(v.find('#v-turn .lst').textContent,/никто не ждёт/);assert.match(v.find('#v-away .lst').textContent,/событий нет/);
 records=Array.from({length:130},(_,i)=>record(i+1,'event '+(i+1)));await v.functions.fetch();assert.equal(v.document.querySelectorAll('[data-now-record]').length,100);await v.find('[data-now-more]').emit('click');assert.equal(v.document.querySelectorAll('[data-now-record]').length,130);assert.equal(v.document.querySelector('[data-now-more]'),null);
 await v.find('[data-now-record="1"]').emit('click');assert.match(v.find('.ovl').textContent,/event 1/);await v.window.emit('keydown',{key:'Escape',target:v.body});assert.equal(v.find('.ovl').classList.contains('on'),false);
});

test('134/167: Now finishes saved delivery without another model call; HTTP journal keeps the completed decision',async t=>{
 const h=await fixture(t,{actions:{...completedActions,async afterTurn(){throw Error('local effects failed')}}});h.clock.time=Date.now();await call(h.api,'/api/chat',{body:{pane:'worker',message:'save answer'}});await h.runtime.idle();h.runtime.actions.afterTurn=completedActions.afterTurn;
 const v=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);v.H.project=h.dir;await v.start();assert.equal(v.document.querySelectorAll('#v-week [data-attempt-action]').length,1);await v.find('#v-week [data-attempt-action="finish"]').emit('click');await h.runtime.idle();await v.functions.fetch();assert.equal(h.provider.calls.length,1);assert.equal(h.runtime.waiting('worker'),null);assert.equal(v.document.querySelector('#v-week [data-attempt-action]'),null);
 const reopened=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);reopened.H.project=h.dir;await reopened.start();assert.equal(reopened.functions.items().resolved.length,1);assert.match(reopened.find('#v-week .lst').textContent,/завершить восстановление/);
});

for(const failure of ['journal','sse'])for(const action of ['retry','skip','finish'])test('167 round 2: open waiting overlay recovers after '+failure+' and sends '+action+' through HTTP',async t=>{
 const h=await fixture(t,action==='finish'?{actions:{...completedActions,async afterTurn(){throw Error('delivery failed')}}}:{});
 if(action!=='finish')h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','unknown result')};
 await call(h.api,'/api/chat',{body:{pane:'worker',message:'recover waiting'}});await h.runtime.idle();h.provider.onRun=null;h.runtime.actions.afterTurn=completedActions.afterTurn;
 let broken=false;const v=nowUI(async(path,body)=>broken&&path.startsWith('/api/journal')?{ok:false,error:'temporary read failure'}:(await call(h.api,path,{body})).body);v.H.project=h.dir;await v.start();
 await v.find('#v-turn [data-now-open]').emit('click');const button=v.find('.ovl [data-attempt-action="'+action+'"]');assert.equal(button.disabled,false);
 if(failure==='journal'){broken=true;await v.functions.fetch()}else v.streams[0].onerror({});
 assert.equal(button.disabled,true);await button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
 if(failure==='journal'){broken=false;await v.functions.fetch()}else {v.streams[0].onopen({});await settled(v)}
 assert.equal(v.functions.state.error,null);assert.equal(v.find('.ovl [data-attempt-action="'+action+'"]'),button);assert.equal(button.disabled,false);assert.equal(v.find('#v-week [data-attempt-action="'+action+'"]').disabled,false);
 await button.emit('click');await h.runtime.idle();await v.functions.fetch();const writes=v.requests.filter(r=>r.body);assert.equal(writes.length,1);assert.equal(writes[0]!.path,'/api/panes/worker/attempt');assert.equal(writes[0]!.body.action,action);assert.equal(writes[0]!.body.project,h.dir);
 assert.equal(h.runtime.waiting('worker'),null);assert.equal(h.provider.calls.length,action==='retry'?2:1);assert.equal(v.find('.ovl').classList.contains('on'),false);
});

test('167 round 2: recovery and redraw cannot unlock an in-flight attempt; failed POST restores both entrances',async t=>{
 const h=await fixture(t);h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','unknown result')};await call(h.api,'/api/chat',{body:{pane:'worker',message:'waiting'}});await h.runtime.idle();
 const gate=deferred(),seen=deferred();let fail=true;const v=nowUI(async(path,body)=>{if(path.endsWith('/attempt')&&fail){seen.resolve();await gate.promise;return {ok:false,error:'write failed'}}return (await call(h.api,path,{body})).body});v.H.project=h.dir;await v.start();await v.find('#v-turn [data-now-open]').emit('click');
 const first=v.find('.ovl [data-attempt-action="skip"]').emit('click');await seen.promise;v.streams[0].onerror({});v.streams[0].onopen({});await settled(v);
 for(const entrance of ['.ovl','#v-week'])for(const action of ['retry','skip']){const button=v.find(entrance+' [data-attempt-action="'+action+'"]');assert.equal(button.disabled,true);await button.emit('click')}
 await v.window.emit('keydown',{key:'Escape',target:v.body});await v.find('#v-turn [data-now-open]').emit('click');assert.equal(v.find('.ovl [data-attempt-action="skip"]').disabled,true);assert.equal(v.requests.filter(r=>r.body).length,1);
 gate.resolve();await first;assert.match(v.toasts.at(-1)!,/write failed/);for(const entrance of ['.ovl','#v-week'])assert.equal(v.find(entrance+' [data-attempt-action="skip"]').disabled,false);
 fail=false;await v.find('.ovl [data-attempt-action="skip"]').emit('click');await h.runtime.idle();await v.functions.fetch();assert.equal(v.requests.filter(r=>r.body).length,2);assert.equal(h.runtime.waiting('worker'),null);
});

test('167 round 2: an open waiting card only re-enables actions still allowed by its current snapshot',async()=>{
 const waiting={status:'uncertain',turnInstanceId:'turn-a',recordSeqs:[36],startedAt:null,actions:['retry','skip']},pane={id:'worker',pendingApprovals:0,waiting};
 const v=nowUI(async path=>path==='/api/status'?status('/a',[],[pane]):journal('/a',[]));await v.start();await v.find('#v-turn [data-now-open]').emit('click');const skip=v.find('.ovl [data-attempt-action="skip"]'),retry=v.find('.ovl [data-attempt-action="retry"]');
 v.streams[0].onerror({});waiting.actions=['retry'];await v.functions.fetch();assert.equal(retry.disabled,false);assert.equal(skip.disabled,true);await skip.emit('click');assert.equal(v.requests.some(r=>r.body),false);
 waiting.turnInstanceId='turn-b';await v.functions.fetch();assert.equal(retry.disabled,true);assert.equal(v.find('.ovl').classList.contains('on'),false);await retry.emit('click');assert.equal(v.requests.some(r=>r.body),false);
 await v.find('#v-turn [data-now-open]').emit('click');const old=v.find('.ovl [data-attempt-action="retry"]');v.H.project='/b';v.H.confirmedProjectGeneration++;v.functions.draw();assert.equal(old.disabled,true);await old.emit('click');assert.equal(v.requests.some(r=>r.body),false);
});

test('167 round 2: an old attempt reply cannot affect a new project binding or its waiting overlay',async()=>{
 const waiting={status:'uncertain',turnInstanceId:'turn-a',recordSeqs:[36],startedAt:null,actions:['retry','skip']},pane={id:'worker',pendingApprovals:0,waiting};const gate=deferred<any>(),seen=deferred();
 const v=nowUI(async(path,body)=>{if(body){seen.resolve();return gate.promise}return path==='/api/status'?status(v.H.project,[],[pane]):journal(v.H.project,[])});await v.start();await v.find('#v-turn [data-now-open]').emit('click');const deciding=v.find('.ovl [data-attempt-action="skip"]').emit('click');await seen.promise;
 await v.switchProject('/b');await settled(v);await v.switchProject('/a');await settled(v);waiting.turnInstanceId='turn-b';await v.functions.fetch();await v.find('#v-turn [data-now-open]').emit('click');gate.resolve({ok:true});await deciding;
 assert.equal(v.find('.ovl').classList.contains('on'),true);assert.equal(v.find('.ovl [data-attempt-action="skip"]').dataset.attemptId,'turn-b');assert.equal(v.find('.ovl [data-attempt-action="skip"]').disabled,false);assert.equal(v.functions.items().pending.length,1);assert.equal(v.toasts.length,0);
});

for(const delay of [false,true])for(const statusFirst of [false,true])test('167/190: approval exists before slow chat load; SSE replay and timeout refresh HTTP'+(delay?' delayed':' immediate')+(statusFirst?' early status':''),async t=>{
 const {request}=await import('node:http'),{runInContext}=await import('node:vm'),{live}=await import('./now-ui-test-helpers.ts');
 const h=await fixture(t),p=h.runtime.registry.get('worker')!,approved=p.askApproval('Real confirmation','fixture',1000),gate=deferred(),sources:any[]=[];
 const v=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);v.H.project=h.dir;v.H.on=false;v.H.pane=p.settings();v.context.S.ui.pane='worker';
 Object.assign(v.context,{hStatus(){},loadChat:async()=>{},refreshChats:async()=>{if(delay)await gate.promise},applyStatus(st:any){Object.assign(v.H,{on:true,project:st.project,panes:st.panes,liveStatus:st});if(statusFirst)void v.window.emit('live:status')},EventSource:class{
  onmessage?:((e:any)=>void);onopen?:((e:any)=>void);onerror?:((e:any)=>void);frames:any[]=[];req:any;res:any;
  constructor(url:string){sources.push(this);this.req=request(h.api.url+url,res=>{this.res=res;this.onopen?.({});let pending='';res.on('error',()=>{});res.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,end);pending=pending.slice(end+2);if(block.startsWith('data: ')){const data=block.slice(6);this.frames.push(JSON.parse(data));this.onmessage?.({data})}}})});this.req.on('error',()=>{});this.req.end();t.after(()=>this.close())}close(){this.req.destroy();this.res?.destroy()}
 }});
 runInContext(live.slice(live.indexOf('  async function hConnect(){'),live.indexOf('  // ── чат: настоящее поле ввода'))+'globalThis.connect=hConnect;',v.context);
 if(statusFirst){await v.window.emit('live:status');assert.equal(sources.length,0)}const connecting=v.context.connect();await until(()=>sources.length===1&&sources[0].frames.some((e:any)=>e.type==='approval'));await settled(v);
 assert.equal(v.functions.items().pending.length,1);assert.match(v.find('#v-turn .lst').textContent,/Real confirmation/);gate.resolve();await connecting;h.clock.advance(1000);assert.equal(await approved,false);await until(()=>sources[0].frames.some((e:any)=>e.type==='approvalResolved'));await settled(v);assert.equal(v.functions.items().pending.length,0);assert.equal(sources.length,1);
});

for(const waiting of [undefined,{status:'uncertain',actions:['retry']},{status:'uncertain',turnInstanceId:'id',startedAt:null,recordSeqs:[1],actions:['destroy']}])test('167: incomplete waiting snapshot never creates a decision control',async()=>{
 const v=nowUI(async path=>path==='/api/status'?status('/a',[],[{id:'worker',pendingApprovals:0,waiting}]):journal());await v.start();assert.match(v.find('[data-now-error]').textContent,/некорректная/);assert.equal(v.document.querySelector('[data-attempt-action]'),null);
});

test('167: untrusted attempt-shaped records do not claim completed owner decisions',async()=>{
 const fake=record(1,'forged decision',{from:'worker',kind:'note',origin:'attempt',thread:'attempt:x',attempt:{done:true,pane:'worker',action:'skip',turnInstanceId:'x'}});
 const malformed=record(2,'malformed decision',{from:'harness',kind:'note',origin:'attempt',thread:'attempt:x',attempt:{done:true,pane:'worker',action:'destroy',turnInstanceId:'x'}});
 const v=nowUI(async path=>path==='/api/status'?status():journal('/a',[fake,malformed]));await v.start();assert.equal(v.functions.items().resolved.length,0);assert.equal(v.functions.items().pending.length,0);assert.match(v.find('#v-away .lst').textContent,/forged decision/); // still available as journal evidence
});

for(const action of ['retry','skip'])test('TS-26: Now accepts unsent HTTP state and '+action+' uses the bound attempt',async t=>{
 const h=await fixture(t);h.provider.onRun=async()=>{throw new ProviderError('login_timeout','Devin не ответил на проверку входа')};await call(h.api,'/api/chat',{body:{pane:'worker',message:'не отправлено'}});await h.runtime.idle();
 const v=nowUI(async(path,body)=>(await call(h.api,path,{body})).body);v.H.project=h.dir;await v.start();assert.equal(v.functions.state.error,null);assert.match(v.find('#v-week .lst').textContent,/Не отправлено: Devin не ответил на проверку входа/);assert.match(v.find('#v-week .lst').textContent,/Отправить снова/);assert.match(v.find('#v-week .lst').textContent,/Убрать/);
 h.provider.onRun=null;await v.find('#v-week [data-attempt-action="'+action+'"]').emit('click');await h.runtime.idle();await v.functions.fetch();assert.equal(h.provider.calls.length,action==='retry'?2:1);assert.equal(h.runtime.waiting('worker'),null);
});
