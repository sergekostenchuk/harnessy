import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {fixture as apiFixture,call,OWNER,deferred} from './test-helpers.ts';
import {CLAUDE_MODELS} from './catalog.ts';
const fixture=(t:Parameters<typeof apiFixture>[0],options:Parameters<typeof apiFixture>[1]={})=>apiFixture(t,{...options,deps:{models:{claude:[...CLAUDE_MODELS,{id:'w1'},{id:'w2'}],codex:[{id:'gpt-test'}]},...options.deps}});
import {dom} from './ui-dom-test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const sketch=readFileSync(new URL('../../../ui/sketches/disarto/19-first-run.html',import.meta.url),'utf8');
const part=(a:string,b:string)=>{const start=live.indexOf(a),end=live.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return live.slice(start,end)};
async function ui(h:Awaited<ReturnType<typeof fixture>>,pause?:(path:string,body:any)=>Promise<void>,saved:Record<string,any>={}){
 const d=dom(sketch.slice(sketch.indexOf('<div class="frame"'),sketch.indexOf('<script>')));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','first');d.document.querySelector('.frame')!.classList.add('cur');
 const H:any={on:true,panes:[],active:{},project:h.dir},S:any={ui:{pane:'room'},chat:[],cx:{noFolder:false},...saved},requests:any[]=[],toasts:string[]=[],pending=new Set<Promise<any>>();
 const c:any={H,S,PAGE:'first',document:d.document,window:null,location:{href:'',pathname:'/19-first-run.html'},save(){},log(){},now:Date.now,setTimeout(){},clearTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),removeEventListener:d.window.removeEventListener.bind(d.window),
  esc:(v:any)=>String(v??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]!)),toast:(v:string)=>toasts.push(v),paneName:(p:any)=>p.label,modelName:(id:string)=>id||'модель не выбрана',knowledgeReset(){},hStatus(){},render(){},drawLive(){},scrollEnd(){},cols:()=>d.document.querySelectorAll('.feed .col'),
  pickPane(){H.pane=H.panes.find((p:any)=>p.id===S.ui.pane)||null},async loadChat(){},
  api(path:string,body?:any){requests.push({path,body});const job=(async()=>{await pause?.(path,body);return (await call(h.api,path,body?{body}:{})).body})();pending.add(job);job.finally(()=>pending.delete(job));return job},
  async refreshStatus(){const status=await c.api('/api/status');if(H.project!==status.project)H.confirmedProjectGeneration=(H.confirmedProjectGeneration||0)+1;Object.assign(H,{project:status.project,panes:status.panes,models:status.models,active:status.activeChats,liveStatus:status,noProject:status.noProject});const list=h.runtime.chatsList(OWNER);H.chatList=list.chats;c.pickPane();return status},laMenu(){},KN:{data:null}
 };
 c.window=c;await c.refreshStatus();const vm=createContext(c);
 runInContext(part('  function captureProjectOperation','  // TS-07: waiting controls')+part('  let bindingGeneration','  function md(')+part('  const isDirect=','  function rememberLive(')+part('  // TS-09b4: one progress view','  // TS-09b2:')+part('  // TS-09b2:','  // End TS-09b2 promotion.')+part('  function reply(','  function composer(')+part('  // TS-09b3: proposal cards','  // End TS-09b3 proposals.')+part('  // TS-15f:','  // End TS-15f first run.')+'globalThis.first={draw:firstDraw,next:firstNext,send:firstSend,state:FIRST,go:firstGo,binding:sendBinding,invalidate:invalidateBinding,proposals:proposalsFetch,proposalsReset,TP};',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 const settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};
 return {...d,H,S,c,vm,find,requests,toasts,settle,f:c.first};
}
async function promote(v:Awaited<ReturnType<typeof ui>>){await v.find('.st[data-s="1"] [data-go="2"]').emit('click');await v.find('.st[data-s="2"] [data-go="3"]').emit('click');await v.find('[data-first-promote]').emit('click');await v.settle();assert.ok(v.H.panes.some((p:any)=>p.kind==='orchestrator'),v.toasts.join(' | '))}

test('170/189: first run keeps sketch blocks; model selection and navigation never start a turn before the bound owner door',async t=>{
 const h=await fixture(t,{seats:'  {}'}),v=await ui(h);assert.equal(v.document.querySelectorAll('.fr .st[data-s]').length,3);assert.equal(v.document.querySelectorAll('.st[data-s="2"] .pick').length,4);assert.equal(v.document.querySelectorAll('.st[data-s="3"] .kv b').length,4);
 await v.find('.st[data-s="1"] [data-go="2"]').emit('click');const select=v.find('[data-first-vendor="1"] select');select.value='gpt-test';await select.emit('change');await v.find('.st[data-s="2"] [data-go="3"]').emit('click');assert.match(v.find('[data-first-door]').textContent,/gpt-test/);assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.provider.calls.length+h.codex.calls.length,0);
 await v.find('[data-first-cancel]').emit('click');assert.equal(v.document.querySelector('[data-first-promote]'),null);await v.find('.st[data-s="2"] [data-go="3"]').emit('click');await v.find('[data-first-promote]').emit('click');await v.settle();await h.runtime.idle();
 assert.equal(v.requests.filter(r=>r.path.endsWith('/orchestrator')).length,1);assert.equal(h.runtime.registry.get('orchestrator')!.settings().model,'gpt-test');assert.equal(v.find('.st[data-s="3"]').classList.contains('on'),true);assert.match(v.find('.done .kv').textContent,/макет/);assert.equal(v.S.first,undefined);assert.equal(v.S.pending,undefined);assert.equal(v.c.location.href,'');
});

test('170: promotion preserves the saved conversation, coalesces double clicks and shows its operation',async t=>{
 const h=await fixture(t);h.runtime.roomSet({model:'w1'},OWNER);h.runtime.registry.get('room')!.record('me','Проект для моей команды');const id=h.runtime.chatsList(OWNER).active.room;
 const entered=deferred(),gate=deferred();const v=await ui(h,async path=>{if(path.endsWith('/orchestrator')){entered.resolve();await gate.promise}});
 await v.find('.st[data-s="1"] [data-go="2"]').emit('click');await v.find('.st[data-s="2"] [data-go="3"]').emit('click');const button=v.find('[data-first-promote]'),work=button.emit('click');await entered.promise;await button.emit('click');assert.equal(v.requests.filter(r=>r.path.endsWith('/orchestrator')).length,1);assert.match(v.find('.st[data-s="2"] [data-live-operations]').textContent,/Harnessy создаёт оркестратора/);gate.resolve();await work;await v.settle();await h.runtime.idle();
 assert.equal(h.runtime.chatsList(OWNER).active.orchestrator,id);assert.equal(h.runtime.registry.get('orchestrator')!.transcript[0]!.text,'Проект для моей команды');assert.deepEqual(v.requests.find(r=>r.path.endsWith('/orchestrator')).body.documents,[]);
});

for(const change of ['project','aba','chat','pagehide','model'])test('170: stale owner door cannot promote after '+change,async t=>{
 const h=await fixture(t),v=await ui(h);await v.find('.st[data-s="1"] [data-go="2"]').emit('click');await v.f.next();const button=v.find('[data-first-promote]');
 if(change==='project')v.H.project='/other';else if(change==='aba'){v.H.project='/other';v.f.invalidate();v.H.project=h.dir}else if(change==='chat')v.H.active.room='other';else if(change==='model')v.f.state.model='c1';else await v.window.emit('pagehide');
 await button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.runtime.registry.get('orchestrator'),null);
});

for(const change of ['project','pagehide'])test('170: delayed room response does not promote or advance a replacement '+change,async t=>{
 const h=await fixture(t),entered=deferred(),gate=deferred();const v=await ui(h,async path=>{if(path==='/api/room'){entered.resolve();await gate.promise}});await v.f.next();const work=v.find('[data-first-promote]').emit('click');await entered.promise;
 if(change==='project')v.H.project='/other';else await v.window.emit('pagehide');gate.resolve();await work;await v.settle();assert.equal(v.requests.filter(r=>r.path.endsWith('/orchestrator')).length,0);assert.equal(v.find('.st[data-s="3"]').classList.contains('on'),false);
});

for(const state of ['offline','empty','unknown-model','snapshot'])test('170: '+state+' has an honest reason and cannot run the model',async t=>{
 const h=await fixture(t,{seats:'  {}'}),v=await ui(h);if(state==='offline')v.H.on=false;else if(state==='snapshot')v.H.snapshotOnly=true;else v.H.models={};v.f.draw();if(state==='unknown-model')v.f.state.model='injected <script>';
 await v.f.next();await v.f.send();assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.provider.calls.length,0);assert.match(v.find('[data-first-vendor="0"] small').textContent,state==='offline'||state==='snapshot'?/макет/:/нет данных/);assert.equal(v.document.querySelector('script'),null);
});

test('170: explicit first question, proposal registration, exact confirmation and role chat share the actual HTTP operations',async t=>{
 const h=await fixture(t,{seats:'  {}'}),v=await ui(h);await promote(v);await h.runtime.idle();let proposed=false;
 h.provider.onRun=async(_s,text,ctx)=>{ctx.modelStarted?.();if(text.endsWith('зарегистрируй предложение')){const result=await ctx.tools.proposeSeats({seats:[{kind:'worker',label:'Исследователь <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Собери данные для первого запуска'}]});assert.equal(result.ok,true);proposed=true}return {text:'ответ',sessionId:'s1'}};
 const input=v.find('.live-in');input.value='Первый вопрос';await v.find('.st[data-s="3"] .btn.p').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.at(-1)!.message,'Первый вопрос');assert.equal(v.c.location.href,'');
 await v.find('[data-first-team-request]').emit('click');await v.settle();await h.runtime.idle();assert.equal(proposed,true,JSON.stringify({calls:h.provider.calls.map(c=>c.message),requests:v.requests.filter(r=>r.body),toasts:v.toasts}));await v.f.proposals();assert.match(v.find('[data-first-state]').textContent,/Предложено в разговоре/);assert.match(v.find('#live-team-proposals').textContent,/Исследователь|Собери данные/);assert.equal(v.document.querySelector('script'),null);const before=h.runtime.registry.ids.length;
 await v.find('[data-team-confirm]').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.runtime.registry.ids.length,before+1);assert.equal(v.requests.filter(r=>r.path==='/api/seats/confirm').length,1);assert.match(v.find('#live-team-proposals').textContent,/Все участники созданы/);
 const row=v.find('[data-team-create]');await row.emit('click');await v.settle();assert.equal(v.c.location.href,'01-chat.html');assert.notEqual(v.S.ui.pane,'orchestrator');
});

test('170: reopening an existing orchestrator reads its proposal without another promotion or introductory turn',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, model: w1, vendor: claude, mode: read}'}),v=await ui(h);await v.f.next();await v.f.proposals();assert.equal(v.S.ui.pane,'lead');assert.equal(v.find('.st[data-s="3"]').classList.contains('on'),true);assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.provider.calls.length,0);
});

test('170/189: an old pending send becomes a draft; entering first run does not replay it',async t=>{
 const h=await fixture(t),v=await ui(h,undefined,{pending:{text:'старый запрос'},first:{place:'HARNESS',model:'выдуманная модель'}});assert.equal(v.S.pending,null);assert.equal(v.S.draft,'старый запрос');assert.equal(v.S.first,undefined);assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.provider.calls.length,0);
});

test('170: first-page stream registers before a slow chat read; replay approvals and proposal changes arrive, pagehide closes it',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, model: w1, vendor: claude, mode: read}'}),v=await ui(h),entered=deferred(),gate=deferred(),streams:any[]=[],events:any[]=[];
 Object.assign(v.c,{EventSource:class{onmessage:any;onopen:any;onerror:any;closed=false;constructor(){streams.push(this)}close(){this.closed=true}},applyStatus:()=>true,refreshChats:async()=>{entered.resolve();await gate.promise},hEvent:(e:any)=>events.push(e),consumeState(){},journalLive(){}});
 runInContext(part('  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part('  async function hConnect(){','  // ── чат: настоящее поле ввода')+'globalThis.connect=hConnect;',v.vm);
 const connecting=v.c.connect();await entered.promise;assert.equal(streams.length,1);await streams[0].onmessage({data:JSON.stringify({type:'approval',pane:'lead',id:'a1',title:'Подтвердите действие'})});assert.equal(events[0]?.id,'a1');const before=v.requests.filter(r=>r.path==='/api/seats/proposals').length;
 streams[0].onmessage({data:JSON.stringify({type:'teamProposals',project:h.dir})});await v.settle();assert.ok(v.requests.filter(r=>r.path==='/api/seats/proposals').length>before);gate.resolve();await connecting;await v.window.emit('pagehide');assert.equal(streams[0].closed,true);assert.equal(v.requests.filter(r=>r.body).length,0);
});

for(const change of ['project','pagehide'])test('170: existing conversation loading cannot advance after '+change,async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, model: w1, vendor: claude, mode: read}'}),v=await ui(h),entered=deferred(),gate=deferred();v.c.loadChat=async()=>{entered.resolve();await gate.promise};const work=v.f.next();await entered.promise;if(change==='project'){v.H.project='/other';v.f.draw()}else await v.window.emit('pagehide');gate.resolve();await work;assert.equal(v.find('.st[data-s="3"]').classList.contains('on'),false);assert.equal(v.requests.filter(r=>r.body).length,0);
});

test('170: the sketch folder control opens the existing project form and creates the chosen real project without a turn',async t=>{
 const h=await fixture(t,{seats:'  {}'}),v=await ui(h);runInContext('globalThis.LIVE={H,S,save,api,esc,toast,log,paneName,hStatus,pickPane,refreshStatus,loadChat,sendBinding,bindingCurrent,invalidateBinding,operationsDraw};',v.vm);runInContext(readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8'),v.vm);
 await v.find('[data-cx="folder"]').emit('click');await v.settle();await v.find('[data-cx-nav="mkdir"]').emit('click');v.find('input.cx-path').value=h.dir+'/first-project';await v.find('[data-cx-mkdir]').emit('click');await v.settle();v.f.draw();assert.equal(h.runtime.project.dir,h.dir+'/first-project');assert.equal(v.H.project,h.dir+'/first-project');assert.match(v.find('.st[data-s="1"] .pick small').textContent,/first-project/);assert.equal(h.provider.calls.length,0);
});

test('170: choosing a room promotes through createProject and retains the selected model in the new project',async t=>{
 const h=await fixture(t,{seats:'  {}'});await h.runtime.settingsPatch('owner',{projectsRoot:h.dir+'/projects'},OWNER);const v=await ui(h);await v.find('.st[data-s="1"] .pick:not([data-cx])').emit('click');assert.equal(v.f.state.folder,false);await promote(v);await h.runtime.idle();assert.notEqual(h.runtime.project.dir,h.dir);assert.ok(h.runtime.project.dir.startsWith(h.dir+'/projects/'));assert.equal(v.requests.find(r=>r.path.endsWith('/orchestrator')).body.createProject,true);assert.equal(v.find('.st[data-s="3"]').classList.contains('on'),true);assert.equal(h.runtime.registry.get('orchestrator')!.settings().model,v.f.state.model);
});

test('170: readonly snapshot rendering cannot invalidate the initial status request by switching to the cached orchestrator',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, model: w1, vendor: claude, mode: read}'}),v=await ui(h);v.S.ui.pane='room';v.c.pickPane();v.H.snapshotOnly=true;v.f.state.project=null;runInContext("globalThis.statusRequest=captureProjectOperation('/api/status');",v.vm);v.f.draw();assert.equal(v.S.ui.pane,'room');assert.equal(runInContext('projectOperationCurrent(statusRequest)',v.vm),true);assert.equal(v.requests.filter(r=>r.body).length,0);
});

test('170: interrupted first turn retains the shared bound recovery controls on step three',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, model: w1, vendor: claude, mode: read}'}),v=await ui(h);await v.f.next();v.H.pane.waiting={turnInstanceId:'known-turn',recordSeqs:[4],status:'unknown',actions:['retry','skip']};
 runInContext(part('  function waitingControls(','  const attemptRequests=')+'renderWaiting();',v.vm);assert.equal(v.find('[data-attempt-action="retry"]').dataset.attemptProject,h.dir);assert.equal(v.find('[data-attempt-action="retry"]').dataset.attemptPane,'lead');assert.equal(v.find('[data-attempt-action="skip"]').dataset.attemptId,'known-turn');assert.equal(v.requests.filter(r=>r.body).length,0);
});
