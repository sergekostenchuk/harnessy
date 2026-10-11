import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,OWNER} from './test-helpers.ts';
process.env.TZ='Europe/Istanbul';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const part=(start:string,end:string)=>{const a=live.indexOf(start),b=live.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return live.slice(a,b)};
function ui(project:string,active:Record<string,string>,fetch:(path:string)=>Promise<any>){
 const d=dom('<div class="frame cur"><div class="feed"><div class="col"><div class="ai static-example">six fake replies OMG</div></div></div></div><div class="frame"><div class="feed"><div class="col"><div class="ai static-example">old demo</div></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:true,project,panes:[{id:'worker',label:'воркер',model:'configured-later'}],active,asks:{},cur:null};H.pane=H.panes[0];const S:any={chat:[{role:'me',text:'browser duplicate'},{role:'ai',src:'live',html:'browser duplicate'}],ui:{pane:'worker',demo:true},cx:{}},requests:string[]=[],storage=new Map<string,string>();
 const context:any={H,S,document:d.document,window:{},PAGE:'chat',LOADED:null,SEL:null,md:(s:string)=>s,esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:any)=>p.label,now:()=>1,hhmm:(n:number)=>new Date(n).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),save(){storage.set('state',JSON.stringify(S))},
  api:async(path:string)=>{requests.push(path);return fetch(path)},setTimeout(){},showWaiting(){},showRestore(){},renderWaiting(){},loadAttemptNotes:async()=>{},renderAll(){},selBar(){},drawLive(){},onboardOnce:async()=>{},addEventListener:d.window.addEventListener.bind(d.window)};
 const vm=createContext(context);runInContext(part('  let bindingGeneration','  function md(')+part('  async function loadChat(','  // подключение к движку')+part('  const fmtN=',"  document.addEventListener('click',e=>{ const d=e.target.closest('[data-direct]');")+'\nglobalThis.testing={load:loadChat,render,cost:costLine,bubble,invalidate:invalidateBinding};',vm);
 return {...d,H,S,context,requests,storage,functions:context.testing};
}

test('120/121: six genuine HTTP messages replace local/demo history once through repeated loads, render and F5; equal texts remain distinct',async t=>{
 const h=await fixture(t);h.clock.time=Date.UTC(2026,9,11,10,7,0)+123;
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();const n=h.provider.calls.length;if(n<3)ctx.publish({type:'done',model:'actual-'+n,sessionId:'session',usage:n===1?{input:0,output:0,cacheRead:0}:{input:4,output:2,cacheRead:0},durationMs:n===1?0:1500});return {text:'same answer',sessionId:'session'}};
 for(let i=0;i<3;i++){h.runtime.chat({pane:'worker',message:'same question',direct:true},OWNER);await h.runtime.idle()}
 const id=h.runtime.project.state.chats.active.worker!,server=await call(h.api,'/api/chats/'+id);assert.equal(server.body.messages.length,6);
 const make=()=>ui(h.dir,{worker:id},async path=>(await call(h.api,path)).body),v=make();
 for(let i=0;i<3;i++){await v.functions.load();v.functions.render();assert.equal(v.S.chat.length,6);for(const col of v.document.querySelectorAll('.feed .col')){assert.equal(col.querySelectorAll('.live-msg').length,6);assert.equal(col.querySelectorAll('.live-msg.me').length,3);assert.equal(col.querySelectorAll('.live-msg.ai').length,3);assert.equal(col.classList.contains('live-demo-off'),true);assert.equal(col.querySelectorAll('[data-demo], [data-clear]').length,0)}}
 assert.equal(v.S.chat[1].t,Date.UTC(2026,9,11,10,7,0)+123);const replies=v.document.querySelectorAll('.frame.cur .live-msg.ai');assert.match(replies[0]!.textContent,/actual-1 · 13:07/);assert.match(replies[0]!.textContent,/расход: 0 токенов · вход 0 · выход 0 · кэш 0 · 0 с/);assert.match(replies[1]!.textContent,/расход: 6 токенов/);assert.match(replies[2]!.textContent,/расход недоступен/);assert.doesNotMatch(replies.map(n=>n.textContent).join(' '),/configured-later|browser duplicate|OMG/);
 const reloaded=make();reloaded.S.chat=JSON.parse(v.storage.get('state')!).chat;await reloaded.functions.load();assert.equal(reloaded.document.querySelectorAll('.frame.cur .live-msg').length,6);assert.equal(reloaded.S.chat.filter((m:any)=>m.text==='same answer').length,3);
});

test('120: a connected chat with no server history clears saved browser history on cold load',async()=>{
 const v=ui('/projects/a',{},async()=>{throw Error('no request expected')});await v.functions.load();assert.deepEqual(v.requests,[]);assert.equal(v.S.chat.length,0);assert.equal(v.document.querySelectorAll('.live-msg').length,0);assert.match(v.document.querySelector('.live-sep')!.textContent,/разговор пуст/);
});

test('120 ОКНА: an old history request cannot repopulate a new binding; an unreadable new chat cannot show local duplicates',async()=>{
 const gate=deferred<any>(),v=ui('/projects/a',{worker:'a'},async path=>path==='/api/chats/a'?gate.promise:{error:'unavailable'});const pending=v.functions.load();assert.equal(v.S.chat.length,0);v.functions.invalidate();v.H.project='/projects/b';v.H.active={worker:'b'};await v.functions.load();assert.equal(v.S.chat.length,0);
 gate.resolve({messages:[{role:'ai',text:'old answer',ts:10}]});await pending;assert.equal(v.S.chat.length,0);assert.doesNotMatch(v.document.querySelector('.frame.cur .col')!.textContent,/old answer|browser duplicate/);
});

test('121: zero timestamps and missing measurements remain unknown; legacy answers never borrow the current model',async()=>{
 const messages=[{role:'ai',text:'legacy',ts:0},{role:'ai',text:'partial',ts:1.25,usage:{input:0},durationMs:0},{role:'ai',text:'duration only',durationMs:1500}];const v=ui('/projects/a',{worker:'a'},async()=>({messages}));await v.functions.load();const replies=v.document.querySelectorAll('.frame.cur .live-msg.ai');
 assert.match(replies[0]!.textContent,/модель не сохранена · время не сохранено/);assert.match(replies[0]!.textContent,/расход недоступен/);assert.match(replies[1]!.textContent,/расход: неполные данные · вход 0 · выход — · кэш — · 0 с/);assert.equal(v.S.chat[1].t,1250);assert.match(replies[2]!.textContent,/время не сохранено/);assert.match(replies[2]!.textContent,/· 2 с/);assert.doesNotMatch(replies.map(n=>n.textContent).join(' '),/configured-later|1970|03:00/);
});
