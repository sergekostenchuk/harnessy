import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),start=live.indexOf('  // TS-09b3: proposal cards'),end=live.indexOf('  // End TS-09b3 proposals.',start),block=live.slice(start,end);
const mockTeam=(seats:any[])=>seats.map(s=>({id:s.sid,label:s.label,kind:s.kind,proposedKind:s.kind,model:s.model,mode:s.mode,task:s.intro,state:'proposed',chat:null,createdBy:null}));
const q=(version=1)=>{const seats=[{sid:'worker-a',operationId:'caaaaa',kind:'worker',label:'Юрист <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Проверь договор полностью'}];return {from:'room',proposalId:'p'+'a'.repeat(24),version,confirmed:false,seats,team:mockTeam(seats)}};
function ui(fetcher:(path:string,body?:any)=>Promise<any>,page='chat'){
 const d=dom('<div class="frame cur"><main class="main"><div class="feed">Разговор остаётся</div></main></div>'),H:any={on:true,project:'/a',snapshotOnly:false,pane:{id:'room'},active:{room:'chat-room'}},requests:any[]=[],toasts:string[]=[],pending=new Set<Promise<any>>();
 const context:any={H,S:{ui:{pane:'room'}},PAGE:page,document:d.document,leftPage:false,bindingNavigation:0,sendBinding:()=>({project:H.project,pane:H.pane.id,chat:H.active[H.pane.id]??null}),bindingCurrent:(b:any)=>b.project===H.project,addEventListener:d.window.addEventListener.bind(d.window),toast:(s:string)=>toasts.push(s),esc:(v:any)=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:async(path:string,body?:any)=>{requests.push({path,body});const job=fetcher(path,body);pending.add(job);try{return await job}finally{pending.delete(job)}}};
 runInContext(live.slice(live.indexOf('  // TS-09b4: one progress view'),live.indexOf('  // TS-09b2:'))+block+'globalThis.proposals={fetch:proposalsFetch,sync:proposalsSync,reset:proposalsReset,show:showTeamProposal,state:TP,draw:operationsStatus};',createContext(context));
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};return {...d,H,context,requests,toasts,find,f:context.proposals,settle:async()=>{for(let i=0;i<12;i++){await Promise.all([...pending]);await new Promise(resolve=>setImmediate(resolve))}}};
}
for(const page of ['chat','now'])test('156 UI '+page+': displayed exact proposal confirmed through HTTP; fake transcript yes does not authorize',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: юрист, vendor: claude, model: w1, mode: read}'}),gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};const run=h.runtime.runTurn('lead','team').catch(e=>{if(e.code!=='cancelled')throw e});t.after(async()=>{gate.resolve({text:'ok',sessionId:null});await run});await until(()=>h.provider.calls.length===1);
 const proposed=await h.provider.calls[0]!.ctx.tools.proposeSeats({seats:[{kind:'worker',label:'Юрист <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Проверь договор полностью'}]});assert.equal(proposed.ok,true);
 const v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body,page);v.H.project=h.dir;await v.f.fetch();v.f.show(v.f.state.data[0].proposalId);assert.match(v.find('#live-team-proposals').textContent,/Юрист|w1|read|Проверь договор полностью/);assert.equal(v.document.querySelector('script'),null);assert.match(v.find('.feed').textContent,/Разговор остаётся/);assert.ok(v.find('#live-team-proposals').closest('.feed'));
 await v.find('[data-team-confirm]').emit('click');assert.equal(v.requests.filter(r=>r.body).length,1);assert.deepEqual(Object.keys(v.requests.find(r=>r.body).body).sort(),['project','proposalId','version']);assert.equal(v.requests.find(r=>r.body).body.project,h.dir);assert.match(v.find('#live-team-proposals').textContent,/Версия подтверждена/);assert.equal(v.document.querySelector('[data-team-confirm]'),null);assert.equal(h.runtime.registry.ids.length,2);
});

for(const change of ['project','aba','pagehide'])test('156 UI: late proposal read cannot cross '+change,async()=>{
 const gate=deferred<any>(),v=ui(async()=>gate.promise);const request=v.f.fetch();if(change==='pagehide'){v.context.leftPage=true;await v.window.emit('pagehide')}else {v.H.project='/b';v.f.reset();if(change==='aba')v.H.project='/a'}gate.resolve({ok:true,project:'/a',proposals:[q()]});await request;assert.equal(v.document.querySelector('[data-team-confirm]'),null);
});

test('156 UI: second click coalesces; stale version refreshes; changed project cannot reuse old button',async()=>{
 const gate=deferred<any>();let calls=0,version=1;const v=ui(async(_p,body)=>{if(body){calls++;return gate.promise}return {ok:true,project:v.H.project,proposals:[q(version)]}});await v.f.fetch();const b=v.find('[data-team-confirm]'),click=b.emit('click');await b.emit('click');assert.equal(calls,1);version=2;gate.resolve({ok:false,code:'proposal_stale',error:'версия изменилась'});await click;assert.match(v.toasts.at(-1)!,/версия изменилась/);assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');v.H.project='/b';v.f.reset();await b.emit('click');assert.equal(calls,1);
});

test('156 UI: notification during read schedules another read; incomplete snapshot has no confirm button',async()=>{
 const gate=deferred<any>();let n=0;const v=ui(async()=>++n===1?gate.promise:{ok:true,project:'/a',proposals:[q(2)]});const reading=v.f.fetch();await v.f.fetch();gate.resolve({ok:true,project:'/a',proposals:[q()]});await reading;await v.settle();assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');
 const bad=ui(async()=>({ok:true,project:'/a',proposals:[{...q(),version:undefined}]}));await bad.f.fetch();assert.equal(bad.document.querySelector('[data-team-confirm]'),null);assert.match(bad.find('#live-team-proposals').textContent,/Не удалось прочитать/);
});

for(const page of ['chat','now','new'])test('156 UI '+page+': stream notifications and reconnect refresh the proposal cards',async()=>{
 let version=1;const v=ui(async path=>path==='/api/status'?{project:'/a',panes:[]}:{ok:true,project:'/a',proposals:[q(version)]},page),streams:any[]=[];
 const part=(a:string,b:string)=>live.slice(live.indexOf(a),live.indexOf(b,live.indexOf(a)));
 Object.assign(v.context,{window:v.context,location:{pathname:''},S:{ui:{pane:'room'}},NOW:{es:null,alive:true},nowFetch:async()=>true,EventSource:class{onopen:any;onmessage:any;onerror:any;constructor(){streams.push(this)}close(){}},nowDraw(){},hStatus(){},render(){},liveFirstPaint(){},hEvent(){},consumeState(){},loadChat:async()=>{},refreshChats:async()=>{},refreshStatus:async()=>{},applyStatus(st:any){v.H.project=st.project;v.H.panes=st.panes}});
 runInContext(part('  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part('  function nowLive(){','  // TS-15c Now lifecycle.')+part('  async function hConnect(){','  // ── чат: настоящее поле ввода')+'globalThis.connect=hConnect;',v.context);
 await v.context.connect();assert.equal(streams.length,1);await streams[0].onopen();await until(()=>v.f.state.data[0]?.version===1);if(page==='new')v.f.show(q().proposalId);
 version=2;streams[0].onmessage({data:JSON.stringify({type:'teamProposals',project:'/a'})});await v.settle();assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');
 streams[0].onerror();version=3;await streams[0].onopen();await v.settle();assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'3');assert.equal(streams.length,1);
 v.context.leftPage=true;await v.window.emit('pagehide');const count=v.requests.length;streams[0].onmessage({data:JSON.stringify({type:'teamProposals',project:'/a'})});assert.equal(v.requests.length,count);assert.equal(v.document.querySelector('[data-team-confirm]'),null);
});


const materialization=(s:any,state='complete',error:string|null=null)=>({sid:s.sid,operationId:s.operationId,state,error,stages:state==='pending'?null:{team:true,seatFile:true,chat:state==='complete',status:state==='complete',onboarding:state==='complete'}});
test('222: confirmed seat progress follows matching saved stages, never mere pane existence',async()=>{
 const gate=deferred<any>();let confirmed=false;const seats=[...q().seats,{...q().seats[0]!,sid:'reviewer-b',operationId:'cbbbbb',label:'Ревьюер'}],rows=seats.map(s=>materialization(s,'pending')),v=ui(async(_path,body)=>{if(body){confirmed=true;return gate.promise}return {ok:true,project:'/a',proposals:[{...q(),confirmed,seats,team:mockTeam(seats),materializations:rows}]}});
 v.H.panes=[];await v.f.fetch();const click=v.find('[data-team-confirm]').emit('click');assert.match(v.find('[data-live-operations]').textContent,/подтверждаем состав/);assert.equal(v.find('[data-team-confirm]').disabled,true);gate.resolve({ok:true});await click;assert.match(v.find('[data-live-operations]').textContent,/ожидаем оркестратора/);
 v.H.panes=[{id:'worker-a'},{id:'reviewer-b'}];v.f.draw();assert.doesNotMatch(v.find('[data-live-operations]').textContent,/Готово/);
 rows[0]=materialization(seats[0]);v.f.draw();assert.equal(v.find('[role="progressbar"]').getAttribute('aria-valuenow'),'1');assert.match(v.find('[data-live-operations]').textContent,/Ревьюер/);
 rows[1]=materialization(seats[1]);v.f.draw();assert.match(v.find('[data-live-operations]').textContent,/Готово/);assert.equal(v.find('[role="progressbar"]').getAttribute('aria-valuenow'),'2');assert.equal(v.requests.filter(r=>r.body).length,1);v.H.project='/b';v.f.draw();assert.equal(v.document.querySelector('[data-live-operations]'),null);
});
for(const invalid of ['missing','foreign-operation','duplicate','incomplete-complete'])test('222: '+invalid+' materialization cannot complete a proposal',async()=>{
 const proposal:any={...q(),confirmed:true,materializations:[materialization(q().seats[0])]};if(invalid==='missing')delete proposal.materializations;if(invalid==='foreign-operation')proposal.materializations[0].operationId='cfffff';if(invalid==='duplicate')proposal.materializations.push({...proposal.materializations[0]});if(invalid==='incomplete-complete')proposal.materializations[0].stages.chat=false;
 const v=ui(async()=>({ok:true,project:'/a',proposals:[proposal]}));v.H.panes=[{id:q().seats[0]!.sid}];await v.f.fetch();assert.match(v.find('[data-live-operations]').textContent,/Состояние создания мест не получено/);assert.doesNotMatch(v.find('[data-live-operations]').textContent,/Готово/);assert.equal(v.find('[data-operation-retry]').textContent,'Повторить чтение');
});

import {diskIO} from '../../runtime/src/state.ts';
import {createRuntime} from '../../runtime/src/runtime.ts';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {createApi} from './server.ts';
for(const restart of [false,true,'healthy'])test('222: failure after team preserves reason and retry'+(restart?' across '+restart+' restart':''),async t=>{
 let armed=false,targetChat='';const io={...diskIO,write(path:string,text:string){diskIO.write(path,text);if(armed&&(path.endsWith('seat-materialization.json')&&JSON.parse(text).some((op:any)=>op.stages.team&&!op.stages.chat&&!op.error)||path.endsWith('chats.json')&&targetChat&&JSON.parse(text).chats?.[targetChat])){armed=false;throw Error('fixture: team saved, chat missing')}}};
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, vendor: claude, model: w1, mode: read}',deps:{stateIO:io}}),gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();return s.id==='lead'?gate.promise:{text:'child done',sessionId:null}};
 const run=h.runtime.runTurn('lead','propose').catch(e=>{if(e.code!=='cancelled')throw e});t.after(async()=>{gate.resolve({text:'done',sessionId:null});await run});await until(()=>h.provider.calls.length===1);
 const tools=h.provider.calls[0]!.ctx.tools,proposed=await tools.proposeSeats({seats:[{kind:'worker',label:'Аналитик',vendor:'claude',model:'w1',mode:'read',intro:'Проверь документы'}]});assert.equal(proposed.ok,true);const receipt=JSON.parse((proposed as any).text);targetChat=receipt.proposal.seats[0].operationId;
 armed=true;const failed=await call(h.api,'/api/seats/confirm',{body:{project:h.dir,proposalId:receipt.proposalId,version:1}});assert.equal(failed.body.ok,false);
 let api=h.api,runtime=h.runtime;
 if(restart){gate.resolve({text:'done',sessionId:null});await run;await h.runtime.close();armed=restart===true;runtime=await createRuntime(h.deps,completedActions);api=createApi({runtime,siteDir:h.siteDir,port:0});await api.listen();t.after(()=>api.close())}
 const v=ui(async(path,body)=>(await call(api,path,body?{body}:{})).body);v.H.project=h.dir;v.context.refreshStatus=async()=>{v.H.panes=(await call(api,'/api/status')).body.panes};await v.f.fetch();
 const row=v.f.state.data[0].materializations[0],stored=runtime.project.state.readMaterializations() as any[];if(restart==='healthy'){assert.equal(row.state,'complete');assert.equal(row.error,null);assert.equal(stored[0].error,undefined);assert.equal(v.document.querySelector('[data-operation-retry]'),null);assert.equal(runtime.journal.read({limit:0}).filter(r=>r.origin==='onboarding'&&r.to.includes(receipt.proposal.seats[0].sid)).length,1);return}assert.equal(row.operationId,receipt.proposal.seats[0].operationId);assert.equal(row.stages.team,true);assert.equal(row.stages.chat,false);assert.equal(row.state,'failed');assert.match(stored[0].error,/team saved, chat missing/);
 assert.ok(v.H.panes.some((p:any)=>p.id===receipt.proposal.seats[0].sid));assert.match(v.find('[data-live-operations]').textContent,/team saved, chat missing/);assert.doesNotMatch(v.find('[data-live-operations]').textContent,/Готово/);assert.equal(v.find('[data-operation-retry]').textContent,'Повторить');
 await v.context.refreshStatus();v.f.draw();assert.match(v.find('[data-live-operations]').textContent,/team saved, chat missing/);await v.find('[data-operation-retry]').emit('click');await v.settle();assert.match(v.find('[data-live-operations]').textContent,/Готово/);assert.equal(v.document.querySelector('[data-operation-retry]'),null);
 const out=runtime.project.state.readMaterializations() as any[];assert.ok(Object.values(out[0].stages).every(Boolean));assert.equal(out[0].error,undefined);assert.equal(runtime.journal.read({limit:0}).filter(r=>r.origin==='onboarding'&&r.to.includes(receipt.proposal.seats[0].sid)).length,1);
 const write=v.requests.find(r=>r.path==='/api/seats/owner');assert.deepEqual(JSON.parse(JSON.stringify(write.body)),{project:h.dir,proposalId:receipt.proposalId,version:1,seatIndex:0,kind:'worker'});
});

for(const change of ['refresh','project','pagehide'])test('222: retry holds its operation across '+change,async()=>{
 const gate=deferred<any>(),proposal={...q(),confirmed:true,materializations:[materialization(q().seats[0],'failed','fixture failure')]},v=ui(async(path,body)=>body?gate.promise:{ok:true,project:'/a',proposals:[proposal]});await v.f.fetch();const click=v.find('[data-operation-retry]').emit('click');await v.f.fetch();v.f.draw();assert.equal(v.find('[data-operation-retry]').disabled,true);await v.find('[data-operation-retry]').emit('click');assert.equal(v.requests.filter(r=>r.body).length,1);
 if(change==='project'){v.H.project='/b';v.f.reset()}if(change==='pagehide'){v.context.leftPage=true;await v.window.emit('pagehide')}
 proposal.materializations[0]=materialization(q().seats[0]);gate.resolve({ok:true});await click;await v.settle();if(change==='refresh')assert.match(v.find('[data-live-operations]').textContent,/Готово/);else assert.equal(v.document.querySelector('[data-live-operations]'),null);
});

for(const page of ['chat','new'])test('TS-41: '+page+' proposals are collapsed in the feed, anchored to the matching answer and keep their displayed version',async()=>{
 const proposal={...q(),from:'lead',turnInstanceId:'turn-team'},v=ui(async()=>({ok:true,project:'/a',proposals:[proposal]}),page);
 v.H.pane={id:'lead'};v.H.active.lead='lead-chat';v.context.S.chat=[{role:'ai',pane:'lead',turnInstanceId:'turn-team'},{role:'ai',pane:'lead',turnInstanceId:'later'}];
 v.find('.feed').innerHTML='<div class="col"><div class="live-msg" data-message-index="0">Предлагаю команду</div><div class="live-msg" data-message-index="1">Следующий ответ</div></div>';
 await v.f.fetch();if(page==='new'){v.f.state.focus=proposal.proposalId;v.f.state.focusBinding=v.context.sendBinding();v.f.sync()}
 assert.ok(v.find('[data-team-proposal]').closest('.feed .col'));
 assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'false');assert.ok(v.find('.proposal-body').hasAttribute('hidden'));
 const children=v.find('.feed .col').children;assert.equal(children[1],v.find('[data-team-proposal]'));assert.equal(children[2]!.dataset.messageIndex,'1');
 await v.find('[data-team-toggle]').emit('click');assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'true');assert.equal(v.find('.proposal-body').hasAttribute('hidden'),false);
 assert.equal(v.find('.proposal-intro').hasAttribute('open'),false);await v.f.fetch();assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'true');
 proposal.version=2;await v.f.fetch();assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'false');
 v.H.project='/b';v.f.reset();assert.equal(v.document.querySelector('[data-team-proposal]'),null);
});

for(const legacy of [false,true])test('TS-41 r2: '+(legacy?'legacy':'turn-bound')+' proposal never appears automatically in another role feed',async()=>{
 const proposal={...q(),from:'lead',...(legacy?{}:{turnInstanceId:'author-turn'})},v=ui(async()=>({ok:true,project:'/a',proposals:[proposal]}));
 v.H.pane={id:'analyst'};v.H.active.analyst='analyst-chat';v.context.S.chat=[];await v.f.fetch();assert.equal(v.document.querySelector('[data-team-proposal]'),null);
 v.H.pane={id:'lead'};v.H.active.lead='lead-chat';v.f.sync();assert.equal(!!v.document.querySelector('[data-team-proposal]'),legacy,'a turn-bound card needs its answer even in the author feed');
 v.context.S.chat=[{role:'ai',pane:'lead',turnInstanceId:'author-turn'}];v.find('.feed').innerHTML='<div class="col"><div data-message-index="0">Ответ автора</div></div>';v.f.sync();assert.ok(v.document.querySelector('[data-team-proposal]'));
 v.H.pane={id:'analyst'};v.f.sync();assert.equal(v.document.querySelector('[data-team-proposal]'),null,'stale author messages cannot masquerade as the current feed');
 v.context.S.chat=[];v.f.show(proposal.proposalId);assert.ok(v.document.querySelector('[data-team-proposal]'),'explicit preview is allowed');
 v.H.active.analyst='another-chat';v.f.sync();assert.equal(v.document.querySelector('[data-team-proposal]'),null,'focused preview is bound to its chat');
});


for(const action of ['collapse','switch'] as const)test('TS-44 r2: inbox deep link is consumed once and preserves '+action,async()=>{
 const proposal={...q(),turnInstanceId:'proposal-turn'},v=ui(async()=>({ok:true,project:'/a',proposals:[proposal]}));v.context.location={hash:'#team='+proposal.proposalId};await v.f.fetch();assert.equal(v.context.location.hash,'');assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'true');
 if(action==='collapse')await v.find('[data-team-toggle]').emit('click');else {v.H.active.room='different-chat';v.context.S.chat=[];v.f.sync()}
 await v.f.fetch();if(action==='collapse')assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'false');else assert.equal(v.document.querySelector('[data-team-proposal]'),null);
});

test('TS-44 r2: a deep link binds before HTTP, and cannot apply to a chat selected during the read',async()=>{
 const gate=deferred<any>(),proposal={...q(),turnInstanceId:'proposal-turn'},v=ui(async()=>gate.promise);v.context.location={hash:'#team='+proposal.proposalId};const read=v.f.fetch();v.H.active.room='other-chat';gate.resolve({ok:true,project:'/a',proposals:[proposal]});await read;assert.equal(v.document.querySelector('[data-team-proposal]'),null);assert.equal(v.context.location.hash,'');await v.f.fetch();assert.equal(v.document.querySelector('[data-team-proposal]'),null);
});

test('TS-44 r2: a failed read can retry the pending deep link in its original chat',async()=>{
 let failed=true;const proposal={...q(),turnInstanceId:'proposal-turn'},v=ui(async()=>failed?{ok:false,error:'Нет связи'}:{ok:true,project:'/a',proposals:[proposal]});v.context.location={hash:'#team='+proposal.proposalId};await v.f.fetch();assert.equal(v.context.location.hash,'#team='+proposal.proposalId);failed=false;await v.f.fetch();assert.equal(v.context.location.hash,'');assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'true');
});
