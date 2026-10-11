import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {fixture,call,OWNER,deferred} from './test-helpers.ts';
import {dom} from './ui-dom-test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
const part=(s:string,a:string,b:string)=>{const from=s.indexOf(a),to=s.indexOf(b,from+a.length);assert.ok(from>=0&&to>from,a);return s.slice(from,to)};
async function ui(h:Awaited<ReturnType<typeof fixture>>,pause?:(path:string,body:any)=>Promise<void>,options:{prepare?:boolean;pane?:string;page?:string}={}){
 const d=dom('<div class="main"><span data-cx="role">Роль</span><div class="ai"><div class="live-acts"><button data-la="assign" data-i="0">Назначить</button></div></div></div><div id="toast"></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page',options.page??'chat');
 if(options.prepare!==false){h.runtime.roomSet({model:'w1'},OWNER);h.runtime.registry.get('room')!.record('me','Юридическая команда')}const paneId=options.pane??'room',chats=h.runtime.chatsList(OWNER),pane=h.runtime.registry.get(paneId)!.settings();
 const H:any={on:true,noProject:false,project:h.dir,active:chats.active,chatList:chats.chats,panes:[pane],pane,roleCatalog:h.runtime.roleCatalog(),models:{claude:[{id:'w1'}]}},S:any={ui:{pane:paneId},chat:[{role:'ai',pane:paneId,text:'Ответ'}],cx:{noFolder:false,modes:{},att:[],conn:{}}},requests:any[]=[],pending=new Set<Promise<any>>();
 const box:any={H,S,PAGE:options.page??'chat',document:d.document,window:null,location:{href:''},navigator:{},save(){},log(){},esc:(v:any)=>String(v??''),toast(html:string){d.document.querySelector('#toast')!.innerHTML=html},hStatus(){},badges(){},renderWaiting(){},loadChat:async()=>{},pickPane(){H.pane=H.panes.find((p:any)=>p.id===S.ui.pane)},render(){},setTimeout(){},clearTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),removeEventListener:d.window.removeEventListener.bind(d.window),
 api(path:string,body?:any){requests.push({path,body});const job=(async()=>{await pause?.(path,body);return (await call(h.api,path,body?{body}:{})).body})();pending.add(job);job.finally(()=>pending.delete(job));return job},
 async refreshStatus(){H.project=h.runtime.project.dir;H.panes=(await box.api('/api/status')).panes;const c=h.runtime.chatsList(OWNER);H.active=c.active;H.chatList=c.chats;box.pickPane()},closeLAMenus(){d.document.querySelectorAll('.live-menu').forEach(n=>n.remove())},dismissLAMenu(m:any){return ()=>m.remove()},modelName:(m:string)=>m,paneName:(p:any)=>p.label};
 box.window=box;const context=createContext(box);runInContext(part(live,'  let bindingGeneration','  function md(')+part(live,'  function laMenu(','  function laPath(')+part(live,'  // TS-09b2:',"    if(kind==='handoff')")+'});',context);
 runInContext(part(live,'  function applyStatus(','  // лента активного чата'),context);
 runInContext('globalThis.LIVE={H,S,save,api,esc,toast,log,paneName,hStatus,pickPane,refreshStatus,loadChat,promoteConversation,sendBinding,bindingCurrent,invalidateBinding,configureSetting,busy:()=>false};',context);runInContext(cx,context);
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};
 const click=async(entry:string)=>{if(entry==='composer'){await find('[data-cx="role"]').emit('click');await find('[data-cx-newseat="orchestrator"]').emit('click')}else {await find('[data-la="assign"]').emit('click');await find('.live-menu [data-k="0"]').emit('click')}};
 const settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};
 return {...d,H,S,requests,context,click,settle,find};
}
for(const entry of ['reply','composer'])test('154 UI '+entry+': actual menu click reaches HTTP and preserves chat',async t=>{
 const h=await fixture(t),v=await ui(h),id=v.H.active.room;await v.click(entry);await v.settle();await h.runtime.idle();const posts=v.requests.filter(r=>r.path.endsWith('/orchestrator'));assert.equal(posts.length,1);assert.equal(posts[0].body.project,h.dir);assert.equal(typeof posts[0].body.revision,'number');assert.deepEqual(Array.from(posts[0].body.documents),[]);assert.equal(h.runtime.project.state.chats.active.orchestrator,id);assert.equal(v.S.ui.pane,'orchestrator');assert.equal(h.provider.calls.length,1);assert.match(v.find('#toast').textContent,/Оркестратор назначен/);
});
for(const change of ['project','chat','pagehide','setting-failed'])test('154 UI pending '+change+' never promotes the current replacement binding',async t=>{
 const h=await fixture(t),gate=deferred(),entered=deferred();let once=true;const v=await ui(h,async(path,body)=>{if(!body&&path.startsWith('/api/chats/')&&once){once=false;entered.resolve();await gate.promise}});
 if(change==='setting-failed'){runInContext('LIVE.configureSetting(async()=>false)',v.context);await v.click('reply');await v.settle();assert.equal(v.requests.length,0);return}
 const click=v.click('reply');await entered.promise;if(change==='project')v.H.project='/another';else if(change==='chat')v.H.active.room='other';else await v.window.emit('pagehide');gate.resolve();await click;await v.settle();assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(h.runtime.registry.get('orchestrator'),null);
});


for(const page of ['chat','new'])test('154 UI '+page+': conflict opens existing conversation without replacing history',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: юрист, vendor: claude, model: w1, mode: read}'});h.runtime.registry.get('lead')!.record('ai','existing answer');const v=await ui(h,undefined,{page}),old=h.runtime.chatsList(OWNER).active.lead;
 await v.click('reply');await v.settle();assert.match(v.find('.live-menu').textContent,/Открыть существующий/);await v.find('.live-menu [data-k="0"]').emit('click');await v.settle();assert.equal(v.S.ui.pane,'lead');assert.equal(h.runtime.project.state.chats.active.lead,old);assert.equal(h.runtime.registry.get('lead')!.transcript[0]!.text,'existing answer');assert.equal(h.provider.calls.length,0);if(page==='new')assert.equal((v.context as any).location.href,'01-chat.html');
});

test('157: tool failure shows a readable reason and preserves escaped technical details',()=>{
 const context:any={H:{cur:null},warningEvent:()=>false,drawLive(){},esc:(v:string)=>v.replaceAll('<','&lt;').replaceAll('>','&gt;')};const vm=createContext(context);
 runInContext(live.split('\n').find(l=>l.startsWith('  const toolLine='))!+part(live,'  function hEvent(','  const isDirect=')+'globalThis.event=hEvent;globalThis.html=()=>toolLine(H.cur.tools[0]);',vm);
 context.event({type:'toolError',text:JSON.stringify({error:'Документ не прочитан',code:'ENOENT',path:'<script>unsafe</script>'})});assert.match(context.H.cur.tools[0].text,/Документ не прочитан/);assert.match(context.html(),/Технические детали/);assert.match(context.html(),/ENOENT/);assert.doesNotMatch(context.html(),/<script>/);
});


test('154 UI: repeat from partially materialized role uses saved documents and completes the same operation',async t=>{
 const h=await fixture(t),r=h.runtime;r.roomSet({model:'w1'},OWNER);r.registry.get('room')!.record('me','Обсуждение');writeFileSync(h.dir+'/case.txt','original');const list=r.chatsList(OWNER),id=list.active.room!,chat=list.chats.find(c=>c.id===id)!,append=r.journal.append.bind(r.journal);let once=true;
 r.journal.append=(record)=>{const out=append(record);if(once&&record.origin==='onboarding'){once=false;throw Error('after intro')}return out};
 await assert.rejects(r.promoteChat(id,{project:h.dir,revision:chat.revision,documents:[{project:h.dir,path:'case.txt'}]},OWNER),/after intro/);
 const v=await ui(h,undefined,{prepare:false,pane:'orchestrator'});await v.click('composer');await v.settle();await r.idle();assert.equal(r.project.state.chats.active.orchestrator,id);assert.equal(h.provider.calls.length,1);assert.match(v.find('#toast').textContent,/Оркестратор назначен/);assert.equal(r.chatGet(id,OWNER).chat.promotion?.pending,false);
});


test('154 UI: promotion on the new-chat page survives applyStatus selecting room, then navigates to the promoted chat',async t=>{
 const h=await fixture(t),v=await ui(h,undefined,{page:'new'}),id=v.H.active.room;await v.click('composer');await v.settle();await h.runtime.idle();assert.equal(v.context.location.href,'01-chat.html');assert.equal(v.S.ui.pane,'orchestrator');assert.equal(v.H.active.orchestrator,id);assert.equal(v.S.ui.fresh,false);
});
