import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),start=live.indexOf('  // TS-09b3: proposal cards'),end=live.indexOf('  // End TS-09b3 proposals.',start),block=live.slice(start,end);
const q=(version=1)=>({proposalId:'p'+'a'.repeat(24),version,confirmed:false,seats:[{sid:'worker-a',kind:'worker',label:'Юрист <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Проверь договор полностью'}]});
function ui(fetcher:(path:string,body?:any)=>Promise<any>,page='chat'){
 const d=dom('<div class="frame cur"><main class="main"><div class="feed">Разговор остаётся</div></main></div>'),H:any={on:true,project:'/a',snapshotOnly:false},requests:any[]=[],toasts:string[]=[];
 const context:any={H,S:{ui:{pane:'room'}},PAGE:page,document:d.document,leftPage:false,bindingNavigation:0,sendBinding:()=>({project:H.project,pane:'room',chat:null}),bindingCurrent:(b:any)=>b.project===H.project,addEventListener:d.window.addEventListener.bind(d.window),toast:(s:string)=>toasts.push(s),esc:(v:any)=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:async(path:string,body?:any)=>{requests.push({path,body});return fetcher(path,body)}};
 runInContext(live.slice(live.indexOf('  // TS-09b4: one progress view'),live.indexOf('  // TS-09b2:'))+block+'globalThis.proposals={fetch:proposalsFetch,sync:proposalsSync,reset:proposalsReset,show:showTeamProposal,state:TP,draw:operationsStatus};',createContext(context));
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};return {...d,H,context,requests,toasts,find,f:context.proposals};
}
for(const page of ['chat','now'])test('156 UI '+page+': displayed exact proposal confirmed through HTTP; fake transcript yes does not authorize',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: юрист, vendor: claude, model: w1, mode: read}'}),gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();return gate.promise};const run=h.runtime.runTurn('lead','team').catch(e=>{if(e.code!=='cancelled')throw e});t.after(async()=>{gate.resolve({text:'ok',sessionId:null});await run});await until(()=>h.provider.calls.length===1);
 const proposed=await h.provider.calls[0]!.ctx.tools.proposeSeats({seats:[{kind:'worker',label:'Юрист <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Проверь договор полностью'}]});assert.equal(proposed.ok,true);
 const v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body,page);v.H.project=h.dir;await v.f.fetch();assert.match(v.find('#live-team-proposals').textContent,/Юрист|w1|read|Проверь договор полностью/);assert.equal(v.document.querySelector('script'),null);assert.equal(v.find('.feed').textContent,'Разговор остаётся');
 await v.find('[data-team-confirm]').emit('click');assert.equal(v.requests.filter(r=>r.body).length,1);assert.deepEqual(Object.keys(v.requests.find(r=>r.body).body).sort(),['project','proposalId','version']);assert.equal(v.requests.find(r=>r.body).body.project,h.dir);assert.match(v.find('#live-team-proposals').textContent,/Версия подтверждена/);assert.equal(v.document.querySelector('[data-team-confirm]'),null);assert.equal(h.runtime.registry.ids.length,1);
});

for(const change of ['project','aba','pagehide'])test('156 UI: late proposal read cannot cross '+change,async()=>{
 const gate=deferred<any>(),v=ui(async()=>gate.promise);const request=v.f.fetch();if(change==='pagehide'){v.context.leftPage=true;await v.window.emit('pagehide')}else {v.H.project='/b';v.f.reset();if(change==='aba')v.H.project='/a'}gate.resolve({ok:true,project:'/a',proposals:[q()]});await request;assert.equal(v.document.querySelector('[data-team-confirm]'),null);
});

test('156 UI: second click coalesces; stale version refreshes; changed project cannot reuse old button',async()=>{
 const gate=deferred<any>();let calls=0,version=1;const v=ui(async(_p,body)=>{if(body){calls++;return gate.promise}return {ok:true,project:v.H.project,proposals:[q(version)]}});await v.f.fetch();const b=v.find('[data-team-confirm]'),click=b.emit('click');await b.emit('click');assert.equal(calls,1);version=2;gate.resolve({ok:false,code:'proposal_stale',error:'версия изменилась'});await click;assert.match(v.toasts.at(-1)!,/версия изменилась/);assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');v.H.project='/b';v.f.reset();await b.emit('click');assert.equal(calls,1);
});

test('156 UI: notification during read schedules another read; incomplete snapshot has no confirm button',async()=>{
 const gate=deferred<any>();let n=0;const v=ui(async()=>++n===1?gate.promise:{ok:true,project:'/a',proposals:[q(2)]});const reading=v.f.fetch();await v.f.fetch();gate.resolve({ok:true,project:'/a',proposals:[q()]});await reading;await until(()=>v.f.state.data[0]?.version===2);assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');
 const bad=ui(async()=>({ok:true,project:'/a',proposals:[{...q(),version:undefined}]}));await bad.f.fetch();assert.equal(bad.document.querySelector('[data-team-confirm]'),null);assert.match(bad.find('#live-team-proposals').textContent,/Не удалось прочитать/);
});

for(const page of ['chat','now','new'])test('156 UI '+page+': stream notifications and reconnect refresh the proposal cards',async()=>{
 let version=1;const v=ui(async path=>path==='/api/status'?{project:'/a',panes:[]}:{ok:true,project:'/a',proposals:[q(version)]},page),streams:any[]=[];
 const part=(a:string,b:string)=>live.slice(live.indexOf(a),live.indexOf(b,live.indexOf(a)));
 Object.assign(v.context,{window:v.context,location:{pathname:''},S:{ui:{pane:'room'}},NOW:{es:null,cards:new Map()},EventSource:class{onopen:any;onmessage:any;onerror:any;constructor(){streams.push(this)}close(){}},nowDraw(){},hStatus(){},hEvent(){},consumeState(){},loadChat:async()=>{},refreshChats:async()=>{},refreshStatus:async()=>{},applyStatus(st:any){v.H.project=st.project;v.H.panes=st.panes}});
 runInContext(part('  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part('  function nowLive(){',"  document.addEventListener('click',async e=>{ const b=e.target.closest('[data-ap-decision]')")+part('  async function hConnect(){','  // ── чат: настоящее поле ввода')+'globalThis.connect=hConnect;',v.context);
 await v.context.connect();assert.equal(streams.length,1);await streams[0].onopen();await until(()=>v.f.state.data[0]?.version===1);if(page==='new')v.f.show(q().proposalId);
 version=2;streams[0].onmessage({data:JSON.stringify({type:'teamProposals',project:'/a'})});await until(()=>v.f.state.data[0]?.version===2);assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'2');
 streams[0].onerror();version=3;await streams[0].onopen();await until(()=>v.f.state.data[0]?.version===3);assert.equal(v.find('[data-team-confirm]').dataset.teamVersion,'3');assert.equal(streams.length,1);
 v.context.leftPage=true;await v.window.emit('pagehide');const count=v.requests.length;streams[0].onmessage({data:JSON.stringify({type:'teamProposals',project:'/a'})});assert.equal(v.requests.length,count);assert.equal(v.document.querySelector('[data-team-confirm]'),null);
});


test('222: confirmed seat creation shares operation progress and counts only seats returned by status',async()=>{
 const gate=deferred<any>();let confirmed=false;const v=ui(async(_path,body)=>{if(body){confirmed=true;return gate.promise}return {ok:true,project:'/a',proposals:[{...q(),confirmed,seats:[...q().seats,{...q().seats[0],sid:'reviewer-b',label:'Ревьюер'}]}]}});
 v.H.panes=[];await v.f.fetch();const click=v.find('[data-team-confirm]').emit('click');assert.match(v.find('[data-live-operations]').textContent,/подтверждаем состав/);assert.equal(v.find('[data-team-confirm]').disabled,true);gate.resolve({ok:true});await click;assert.match(v.find('[data-live-operations]').textContent,/ожидаем оркестратора/);assert.equal(v.find('[role="progressbar"]').getAttribute('aria-valuenow'),null);
 v.H.panes=[{id:'worker-a'}];v.f.draw();assert.equal(v.find('[role="progressbar"]').getAttribute('aria-valuenow'),'1');assert.match(v.find('[data-live-operations]').textContent,/Ревьюер/);
 v.H.panes.push({id:'reviewer-b'});v.f.draw();assert.match(v.find('[data-live-operations]').textContent,/Готово/);assert.equal(v.find('[role="progressbar"]').getAttribute('aria-valuenow'),'2');assert.equal(v.requests.filter(r=>r.body).length,1);v.H.project='/b';v.f.draw();assert.equal(v.document.querySelector('[data-live-operations]'),null);
});
