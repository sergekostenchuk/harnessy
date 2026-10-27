import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {diskIO,type StateIO} from '@harnessy/runtime';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
const part=(a:string,b:string)=>live.slice(live.indexOf(a),live.indexOf(b,live.indexOf(a)));
async function setup(t:Parameters<typeof fixture>[0],proposed=true,options:Parameters<typeof fixture>[1]={}){
 const h=await fixture(t,{...options,seats:'  lead: {kind: orchestrator, role: orchestrator, label: Ведущий, vendor: claude, model: w1, mode: read}'}),gate=deferred<{text:string;sessionId:null}>();
 h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();if(s.id==='lead')return gate.promise;return {text:'готов',sessionId:null}};
 const run=h.runtime.runTurn('lead','Состав').catch(e=>{if(e.code!=='cancelled')throw e});t.after(async()=>{gate.resolve({text:'ok',sessionId:null});await run});await until(()=>h.provider.calls.length===1);
 const tool=proposed?await h.provider.calls[0]!.ctx.tools.proposeSeats({seats:[{kind:'worker',label:'Прокурор <script>bad</script>',vendor:'claude',model:'w1',mode:'read',intro:'Проверь доказательства.\nПолная вводная.'},{kind:'reviewer',label:'Судья',vendor:'claude',model:'w1',mode:'read',intro:'Независимая критика'}]}):null;
 if(tool)assert.equal(tool.ok,true);return {...h,gate};
}
function ui(h:Awaited<ReturnType<typeof fixture>>,pause?:(path:string,body:any,response:any)=>Promise<void>,page='chat'){
 const d=dom('<div class="frame cur"><main class="main"><span data-cx="role">Роль</span><div class="feed">Разговор остаётся</div></main></div><div id="toast"></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page',page);
 const list=h.runtime.chatsList(OWNER),panes=h.runtime.registry.ids.map(id=>h.runtime.registry.get(id)!.settings());
 const H:any={on:true,project:h.dir,active:list.active,chatList:list.chats,panes,pane:panes[0],roleCatalog:h.runtime.roleCatalog(),models:{claude:[{id:'w1'}]}},S:any={ui:{pane:panes[0]!.id},chat:[],cx:{noFolder:false,modes:{},att:[],conn:{}}},requests:any[]=[],pending=new Set<Promise<any>>();
 const box:any={H,S,PAGE:page,leftPage:false,document:d.document,window:null,location:{href:''},setTimeout(){},clearTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),save(){},log(){},esc:(v:any)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),toast(s:string){d.document.querySelector('#toast')!.innerHTML=s},paneName:(p:any)=>p.label,hStatus(){},pickPane(){H.pane=H.panes.find((p:any)=>p.id===S.ui.pane)},loadChat:async()=>{},
 api(path:string,body?:any){requests.push({path,body});const job=(async()=>{const response=(await call(h.api,path,body?{body}:{})).body;await pause?.(path,body,response);return response})();pending.add(job);job.finally(()=>pending.delete(job));return job},
 async refreshStatus(){const status=await box.api('/api/status');H.project=status.project;H.panes=status.panes;box.pickPane()},
 async onSend(text:string,_ta:any,binding:any){if(!box.LIVE.bindingCurrent(binding)||box.leftPage)return false;return box.api('/api/chat',{pane:binding.pane,message:text})}};
 box.window=box;const vm=createContext(box);
 runInContext(part('  let bindingGeneration','  function md(')+part('  // TS-09b4: one progress view','  // TS-09b2:')+part('  // TS-09b3: proposal cards','  // End TS-09b3 proposals.')+'globalThis.LIVE={H,S,save,api,esc,toast,log,paneName,hStatus,pickPane,refreshStatus,loadChat,sendBinding,bindingCurrent,invalidateBinding,get teamProposals(){return TP},proposalsFetch,showTeamProposal,requestTeamProposal,createTeamRole,proposalStateText,proposalMember};globalThis.resetProposals=proposalsReset;',vm);
 runInContext(cx,vm);
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};
 const settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};
 return {...d,H,S,requests,vm,find,settle,L:box.LIVE,box};
}
for(const page of ['chat','new'])test('240/241/242 DOM+HTTP '+page+': free labels appear above classes, owner chooses class and double click creates one row',async t=>{
 const h=await setup(t),gate=deferred(),entered=deferred();let hold=true;
 const v=ui(h,async(path,body)=>{if(path==='/api/seats/owner'&&body&&hold){hold=false;entered.resolve();await gate.promise}},page);
 await v.find('[data-cx="role"]').emit('click');await v.settle();const menu=v.find('.cx-pop');assert.match(menu.textContent,/Предложено в разговоре.*Прокурор.*worker.*claude.*w1.*read/s);assert.match(menu.textContent,/Судья/);assert.equal(menu.querySelector('script'),null);assert.equal(menu.textContent.indexOf('Предложено в разговоре')<menu.textContent.indexOf('классы прав'),true);
 await v.find('[data-cx-team-open]').emit('click');await v.find('[data-team-kind]').emit('click');await v.find('[data-proposal-kind-option="researcher"]').emit('click');assert.equal(v.find('[data-team-confirm]').disabled,true);
 const button=v.find('[data-team-create]'),click=button.emit('click');await entered.promise;await button.emit('click');assert.equal(v.requests.filter(r=>r.path==='/api/seats/owner').length,1);gate.resolve();await click;await v.settle();
 const request=v.requests.find(r=>r.path==='/api/seats/owner');assert.equal(request.body.kind,'researcher');assert.equal(request.body.project,h.dir);const stored=(await h.runtime.teamProposals(OWNER)).proposals[0]!;
 assert.equal(h.runtime.registry.get(stored.seats[0]!.sid)!.kind,'researcher');assert.equal(h.runtime.registry.get(stored.seats[1]!.sid),null);assert.equal(v.document.querySelector('[data-team-proposal]'),null,'the new role must not inherit its author’s proposal card');v.L.showTeamProposal(stored.proposalId);assert.match(v.find('[data-team-proposal]').textContent,/создана владельцем как Исследователь/);assert.match(v.find('.feed').textContent,/Разговор остаётся/);assert.ok(v.find('[data-team-proposal]').closest('.feed'));
 await v.find('[data-team-confirm]').emit('click');assert.equal((await h.runtime.teamProposals(OWNER)).proposals[0]!.confirmed,true);if(page==='new'){await v.find('[data-team-toggle]').emit('click');assert.equal(v.find('[data-team-toggle]').getAttribute('aria-expanded'),'false');assert.ok(v.find('.proposal-body').hasAttribute('hidden'));assert.ok(v.document.querySelector('[data-cx="role"]'))}
});

test('TS-09b7 DOM+HTTP: a new single-seat proposal is shown as +1 место к составу after the previous team is confirmed',async t=>{
 const h=await setup(t),first=(await call(h.api,'/api/seats/proposals')).body.proposals[0],v=ui(h);await v.find('[data-cx="role"]').emit('click');await v.settle();assert.doesNotMatch(v.find('.cx-pop').textContent,/к составу/);assert.equal((await call(h.api,'/api/seats/confirm',{body:{project:h.dir,proposalId:first.proposalId,version:first.version}})).status,200);
 const result=await h.provider.calls[0]!.ctx.tools.proposeSeats({seats:[{kind:'researcher',label:'Налоговый юрист',vendor:'claude',model:'w1',mode:'read',intro:'Проверь налоговые последствия.'}]});assert.equal(result.ok,true);await v.L.proposalsFetch();await v.settle();assert.match(v.find('.cx-pop').textContent,/Предложено в разговоре.*\+1 место к составу.*Налоговый юрист/s);assert.equal(v.find('.cx-pop').querySelectorAll('.cx-proposal-role').length,1);assert.doesNotMatch(v.find('.cx-proposal-role').textContent,/Прокурор|Судья/);
 await v.find('[data-cx-team-open]').emit('click');assert.match(v.find('[data-team-proposal]').textContent,/Налоговый юрист/);assert.equal(v.find('[data-team-proposal]').querySelectorAll('[data-team-row]').length,1);
});

test('243 DOM+HTTP: no registered proposal gives a precise prompt to the project orchestrator',async t=>{
 const h=await setup(t,false),v=ui(h);await v.find('[data-cx="role"]').emit('click');await v.settle();assert.match(v.find('.cx-pop').textContent,/Предложение не зарегистрировано/);
 await v.find('[data-cx-team-request]').emit('click');await v.settle();const sent=v.requests.filter(r=>r.path==='/api/chat');assert.equal(sent.length,1);assert.deepEqual(sent[0].body,{pane:'lead',message:'зарегистрируй предложение'});
});

for(const phase of ['read','create'])test('244 DOM+HTTP: delayed '+phase+' cannot repaint another project or keep a usable stale menu',async t=>{
 const h=await setup(t),gate=deferred(),entered=deferred();let hold=true;const v=ui(h,async(path,body)=>{if(hold&&(phase==='read'&&path==='/api/seats/proposals'||phase==='create'&&body&&path==='/api/seats/owner')){hold=false;entered.resolve();await gate.promise}});
 await v.find('[data-cx="role"]').emit('click');if(phase==='create'){await v.settle();await v.find('[data-cx-team-open]').emit('click')}
 const click=phase==='create'?v.find('[data-team-create]').emit('click'):Promise.resolve();await entered.promise;const statusReads=v.requests.filter(r=>r.path==='/api/status').length;v.H.project='/other';v.L.invalidateBinding();v.box.resetProposals();gate.resolve();await click;await v.settle();assert.equal(v.document.querySelector('[data-team-proposal]'),null);assert.equal(v.document.querySelector('.cx-pop'),null);assert.equal(v.H.project,'/other');assert.equal(v.requests.filter(r=>r.path==='/api/status').length,statusReads);
});

test('240: an updated proposal snapshot redraws an already open role menu',async t=>{
 const h=await setup(t,false),v=ui(h);await v.find('[data-cx="role"]').emit('click');await v.settle();assert.ok(v.document.querySelector('[data-cx-team-request]'));
 const response=await h.provider.calls[0]!.ctx.tools.proposeSeats({seats:[{kind:'tester',label:'Новый эксперт',vendor:'claude',model:'w1',mode:'read',intro:'Проверь'}]});assert.equal(response.ok,true);
 await v.L.proposalsFetch();assert.match(v.find('.cx-pop').textContent,/Новый эксперт/);assert.equal(v.document.querySelector('[data-cx-team-request]'),null);
});

test('243: changing the project while opening the orchestrator never sends the prompt to the replacement',async t=>{
 const h=await setup(t,false),v=ui(h),gate=deferred(),entered=deferred();v.box.loadChat=async()=>{entered.resolve();await gate.promise};
 await v.find('[data-cx="role"]').emit('click');await v.settle();const action=v.find('[data-cx-team-request]').emit('click');await entered.promise;const statusReads=v.requests.filter(r=>r.path==='/api/status').length;v.H.project='/other';v.L.invalidateBinding();gate.resolve();await action;assert.equal(v.requests.some(r=>r.path==='/api/chat'),false);
});

test('241: partial owner materialization keeps a visible retry even when the place exists in status',async t=>{
 let armed=false;const io:StateIO={...diskIO,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('seat-materialization.json')&&JSON.parse(text).some((op:any)=>op.stages.chat)){armed=false;throw Error('chat persisted before failure')}}};
 const h=await setup(t,true,{deps:{stateIO:io}}),v=ui(h);await v.find('[data-cx="role"]').emit('click');await v.settle();await v.find('[data-cx-team-open]').emit('click');armed=true;await v.find('[data-team-create]').emit('click');await v.settle();await v.L.refreshStatus();await v.L.proposalsFetch();assert.equal(v.H.panes.length,2);assert.match(v.find('[data-team-create]').textContent,/Завершить создание/);await v.find('[data-team-create]').emit('click');await v.settle();const q=(await h.runtime.teamProposals(OWNER)).proposals[0]!;assert.equal(q.ownerSeats![0]!.created,true);assert.equal(h.runtime.registry.ids.length,2);assert.equal(h.runtime.journal.read({limit:0}).filter(r=>r.origin==='onboarding'&&r.to.includes(q.seats[0]!.sid)).length,1);
});
