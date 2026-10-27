import {fixtureSource,fixtureGroups} from './live-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,OWNER,until} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
async function setup(t:Parameters<typeof fixture>[0]){
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: orchestrator, label: Ведущий, vendor: claude, model: w1, mode: read}'});
 writeFileSync(join(h.dir,'.harness/MEMORY.md'),'Цель: изучить договор');
 h.provider.onRun=async(s,_text,c)=>{c.modelStarted?.();if(s.id==='lead')assert.equal((await c.tools.proposeSeats({seats:[{kind:'worker',label:'Юрист',vendor:'claude',model:'w1',mode:'read',intro:'Изучи договор'},{kind:'reviewer',label:'Рецензент',vendor:'claude',model:'w1',mode:'read',intro:'Проверь выводы'}]})).ok,true);return {text:'готово',sessionId:'s'}};
 await h.runtime.runTurn('lead','Состав');const q=(await h.runtime.teamProposals(OWNER)).proposals[0]!;return {...h,q};
}
function ui(h:Awaited<ReturnType<typeof setup>>,pause?:(path:string,body:any,response:any)=>Promise<void>){
 const d=dom('<div class="frame cur"><main class="main"><div class="top"></div><span data-cx="role">Роль</span><div class="feed"><div class="col"></div></div></main></div><div id="toast"></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','chat');
 const list=h.runtime.chatsList(OWNER),panes=h.runtime.registry.ids.map(id=>h.runtime.registry.get(id)!.settings()),H:any={on:true,project:h.dir,active:list.active,chatList:list.chats,panes,pane:panes[0],roleCatalog:h.runtime.roleCatalog(),models:{claude:[{id:'w1'}]},asks:{}},S:any={ui:{pane:panes[0]!.id},chat:[],cx:{noFolder:false,modes:{},att:[],conn:{}}},requests:any[]=[],pending=new Set<Promise<any>>(),painted:string[]=[];
 const box:any={H,S,PAGE:'chat',leftPage:false,document:d.document,window:null,location:{href:''},setTimeout(){},clearTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),save(){},log(){},LOADED:null,onboardOnce:async()=>{},loadAttemptNotes:async()=>{},showWaiting(){},showRestore(){},renderWaiting(){},md:(s:string)=>s,mdMessageArtifacts:()=>'',transferHTML:()=>'',cols:()=>d.document.querySelectorAll('.feed .col'),
 requestAnimationFrame(fn:()=>void){void immediate().then(()=>{painted.push(d.document.querySelector('#live-role-knowledge')?.textContent||'');fn()})},
 render(){d.document.querySelector('.col')!.textContent=S.chat.map((m:any)=>m.text).join('\n')},
 esc:(v:any)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),toast(s:string){d.document.querySelector('#toast')!.innerHTML=s},paneName:(p:any)=>p.label,hStatus(){},pickPane(){H.pane=H.panes.find((p:any)=>p.id===S.ui.pane)},
 api(path:string,body?:any){requests.push({path,body});const job=(async()=>{const response=(await call(h.api,path,body?{body}:{})).body;await pause?.(path,body,response);return response})();pending.add(job);job.finally(()=>pending.delete(job));return job},
 async refreshStatus(){const status=await box.api('/api/status');H.project=status.project;H.panes=status.panes;H.active=status.activeChats;box.pickPane()}};
 box.window=box;const vm=createContext(box);
 runInContext(fixtureSource(live,fixtureGroups.live_fmtN_to_document,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_bindingGeneration_to_settingsReady,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_loadChat_to_recoverStoppedTurn,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_OPS_to_moveConversation,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_TP_to_addEventListener,{filename:'live.js',wrapper:0})+'globalThis.LIVE={H,S,save,api,esc,toast,log,paneName,hStatus,pickPane,refreshStatus,loadChat,sendBinding,bindingCurrent,invalidateBinding,get teamProposals(){return TP},proposalsFetch,showTeamProposal,requestTeamProposal,createTeamRole,proposalStateText,proposalMember};globalThis.knowledgeFetch=knowledgeFetch;globalThis.resetProposals=proposalsReset;',vm);
 runInContext(cx,vm);const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};const settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};
 return {...d,H,S,requests,box,painted,find,settle,L:box.LIVE};
}
test('250/251/254 DOM+HTTP: real role menu click creates and opens chat; card paints before one model turn, repeat just opens',async t=>{
 const h=await setup(t),gate=deferred(),entered=deferred();let hold=true;const v=ui(h,async(path,body)=>{if(hold&&body&&path==='/api/seats/owner'){hold=false;entered.resolve();await gate.promise}});
 h.provider.onRun=async(_s,text,c)=>{assert.ok(v.painted.length>=2);assert.ok(v.painted.every(s=>s.includes('Что знает эта роль')));assert.ok(text.includes(v.find('#live-role-knowledge pre').textContent));c.modelStarted?.();return {text:'Изучаю',sessionId:'s'}};
 await v.find('[data-cx="role"]').emit('click');await v.settle();const row=v.find('[data-cx-team-create]'),click=row.emit('click');await entered.promise;
 assert.equal(h.provider.calls.length,1);assert.match(v.find('[data-live-operations]').textContent,/Harnessy создаёт роль/);await row.emit('click');assert.equal(v.requests.filter(r=>r.path==='/api/seats/owner').length,1);gate.resolve();await click;await h.runtime.idle();await v.settle();
 assert.equal(v.S.ui.pane,h.q.seats[0]!.sid);assert.equal(v.H.active[v.S.ui.pane],h.q.seats[0]!.operationId);assert.match(v.find('#live-role-knowledge').textContent,/Цель: изучить договор/);assert.match(v.find('#live-role-knowledge').textContent,/предложена · чата ещё нет/);assert.equal(h.provider.calls.length,2);
 await v.find('[data-cx="role"]').emit('click');await v.settle();assert.match(v.find('.cx-pop').textContent,/чат открыт/);await v.find('[data-cx-team-create]').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.length,2);assert.equal(v.requests.filter(r=>r.path==='/api/seats/owner').length,1);
});
for(const change of ['project','pagehide','history'] as const)test('254 DOM+HTTP: delayed '+change+' response cannot open or start a role in the wrong binding',async t=>{
 const h=await setup(t),gate=deferred(),entered=deferred();let hold=true;const v=ui(h,async(path,body)=>{if(hold&&(change==='history'?path==='/api/chats/'+h.q.seats[0]!.operationId:body&&path==='/api/seats/owner')){hold=false;entered.resolve();await gate.promise}});
 await v.find('[data-cx="role"]').emit('click');await v.settle();const click=v.find('[data-cx-team-create]').emit('click');await entered.promise;
 if(change==='pagehide'){v.box.leftPage=true;await v.window.emit('pagehide')}else {v.H.project='/other';v.L.invalidateBinding();v.box.resetProposals()}
 gate.resolve();await click;await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.equal(v.requests.some(r=>r.path==='/api/onboard'),false);assert.equal(v.document.querySelector('#live-role-knowledge'),null);if(change!=='pagehide')assert.equal(v.H.project,'/other');
});
test('253/254 DOM+HTTP: confirm creates the remaining team once and offers a working first-chat link',async t=>{
 const h=await setup(t),v=ui(h);h.provider.onRun=async(_s,_text,c)=>{c.modelStarted?.();return {text:'готов',sessionId:'s'}};
 await v.L.proposalsFetch();v.L.showTeamProposal(h.q.proposalId);await v.find('[data-team-confirm]').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.runtime.registry.ids.length,3);
 assert.equal(v.document.querySelector('[data-team-confirm]'),null);const link=v.find('[data-team-create]');await link.emit('click');await v.settle();assert.equal(v.S.ui.pane,h.q.seats[0]!.sid);assert.ok(v.document.querySelector('#live-role-knowledge'));
 const before=h.provider.calls.length;await v.L.proposalsFetch();v.L.showTeamProposal(h.q.proposalId);await v.find('[data-team-create]').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.length,before);
});

test('251 DOM+HTTP: missing knowledge cannot start the paid turn and offers a working retry',async t=>{
 const h=await setup(t);let omit=true;const v=ui(h,async(path,_body,response)=>{if(omit&&path==='/api/chats/'+h.q.seats[0]!.operationId){delete response.knowledge}});
 await v.L.proposalsFetch();v.L.showTeamProposal(h.q.proposalId);await v.find('[data-team-create]').emit('click');await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.match(v.find('#live-role-knowledge').textContent,/Не удалось прочитать контекст/);omit=false;
 await v.find('[data-knowledge-retry]').emit('click');await until(()=>h.provider.calls.length===2);await v.settle();await h.runtime.idle();assert.equal(h.provider.calls.length,2);
});
test('252 DOM+HTTP: team notification refreshes the visible knowledge without a model call',async t=>{
 const h=await setup(t),v=ui(h);await v.L.proposalsFetch();v.L.showTeamProposal(h.q.proposalId);await v.find('[data-team-create]').emit('click');await v.settle();await h.runtime.idle();const count=h.provider.calls.length;assert.match(v.find('#live-role-knowledge').textContent,/предложена · чата ещё нет/);
 await h.runtime.createOwnerSeat({project:h.dir,proposalId:h.q.proposalId,version:1,seatIndex:1,kind:'researcher'},OWNER);await v.L.proposalsFetch();await v.settle();await h.runtime.idle();assert.match(v.find('#live-role-knowledge').textContent,/создана владельцем как researcher/);assert.equal(h.provider.calls.length,count);
});
