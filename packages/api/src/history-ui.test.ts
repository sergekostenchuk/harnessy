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
 const timers=new Map<number,()=>void>();let timerId=0;
 const context:any={H,S,document:d.document,window:{},PAGE:'chat',LOADED:null,SEL:null,md:(s:string)=>s,knowledgeReset(){},knowledgeSet(){return true},knowledgeOpen:async()=>{},knowledgeFetch(){},KN:{data:null},hydrateArtifacts(){},mdMessageArtifacts(){return ""},esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:any)=>p.label,now:()=>1,hhmm:(n:number)=>new Date(n).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),save(){storage.set('state',JSON.stringify(S))},
  api:async(path:string)=>{requests.push(path);return fetch(path)},setTimeout(fn:()=>void){timers.set(++timerId,fn);return timerId},clearTimeout(id:number){timers.delete(id)},showWaiting(){},showRestore(){},renderWaiting(){},loadAttemptNotes:async()=>{},renderAll(){},selBar(){},drawLive(){},onboardOnce:async()=>{},addEventListener:d.window.addEventListener.bind(d.window)};
 const vm=createContext(context);runInContext(part('  // TS-23d:','  // TS-07: waiting controls')+part('  let bindingGeneration','  function md(')+part('  async function loadChat(','  // подключение к движку')+part('  const fmtN=',"  document.addEventListener('click',e=>{ const d=e.target.closest('[data-direct]');")+'\nglobalThis.testing={load:loadChat,render,bubble,invalidate:invalidateBinding};',vm);
 return {...d,H,S,context,requests,storage,timers,functions:context.testing};
}

test('120/121: six genuine HTTP messages replace local/demo history once through repeated loads, render and F5; equal texts remain distinct',async t=>{
 const h=await fixture(t);h.clock.time=Date.UTC(2026,9,11,10,7,0)+123;
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();const n=h.provider.calls.length;if(n<3)ctx.publish({type:'done',model:'actual-'+n,sessionId:'session',usage:n===1?{input:0,output:0,cacheRead:0}:{input:4,output:2,cacheRead:0},durationMs:n===1?0:1500});return {text:'same answer',sessionId:'session'}};
 for(let i=0;i<3;i++){h.runtime.chat({pane:'worker',message:'same question',direct:true},OWNER);await h.runtime.idle()}
 const id=h.runtime.project.state.chats.active.worker!,server=await call(h.api,'/api/chats/'+id);assert.equal(server.body.messages.length,6);
 const make=()=>ui(h.dir,{worker:id},async path=>(await call(h.api,path)).body),v=make();
 for(let i=0;i<3;i++){await v.functions.load();v.functions.render();assert.equal(v.S.chat.length,6);for(const col of v.document.querySelectorAll('.feed .col')){assert.equal(col.querySelectorAll('.live-msg').length,6);assert.equal(col.querySelectorAll('.live-msg.me').length,3);assert.equal(col.querySelectorAll('.live-msg.ai').length,3);assert.equal(col.classList.contains('live-demo-off'),true);assert.equal(col.querySelectorAll('[data-demo], [data-clear]').length,0)}}
 assert.equal(v.S.chat[1].t,Date.UTC(2026,9,11,10,7,0)+123);const replies=v.document.querySelectorAll('.frame.cur .live-msg.ai');assert.match(replies[0]!.textContent,/actual-1.*11\.10 13:07/);assert.equal(replies[0]!.querySelector('[data-turn-stats]')?.getAttribute('aria-expanded'),'false');assert.ok(replies[1]!.querySelector('[data-turn-stats]'));assert.ok(replies[2]!.querySelector('[data-turn-stats]'));assert.equal(v.document.querySelector('.live-cost'),null);assert.equal(v.S.chat[1].usage.input,0);assert.equal(v.S.chat[5].usage.input,null);assert.doesNotMatch(replies.map(n=>n.textContent).join(' '),/configured-later|browser duplicate|OMG/);
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
 assert.match(replies[0]!.textContent,/модель не сохранена/);assert.equal(replies[0]!.querySelector('time'),null);assert.equal(v.document.querySelector('[data-turn-stats]'),null,'legacy counter-only records have no per-turn card');assert.equal(v.S.chat[1].t,1250);assert.equal(replies[2]!.querySelector('time'),null);assert.equal(v.document.querySelector('.live-cost'),null);assert.doesNotMatch(replies.map(n=>n.textContent).join(' '),/configured-later|1970|03:00/);
});

test('TS-24c: saved image refs render in history and open the large viewer',async()=>{
 const ref={id:'e'.repeat(64),mime:'image/png',size:68,w:1,h:1},forged={...ref,id:'not-a-hash'},v=ui('/projects/a',{worker:'a'},async()=>({messages:[{role:'me',text:'Сравни',ts:1,attachments:[ref,forged]}]}));await v.functions.load();v.functions.render();assert.deepEqual(JSON.parse(JSON.stringify(v.S.chat[0].attachments)),[ref]);const opener=v.document.querySelector('[data-attachment-view]')!;assert.equal(opener.dataset.attachmentView,ref.id);assert.match(opener.innerHTML,new RegExp('/api/attachments/'+ref.id));await opener.emit('click');const dialog=v.body.querySelector('.live-image-dialog')!;assert.ok(dialog);assert.equal(dialog.hasAttribute('open'),true);assert.match(dialog.querySelector('img')!.getAttribute('src')!,new RegExp('/api/attachments/'+ref.id));await dialog.querySelector('[data-attachment-close]')!.emit('click');assert.equal(v.body.querySelector('.live-image-dialog'),null);
});


test('23d: reloaded response uses its captured connection, not the current provider route',async()=>{
 const network={provider:'claude',via:{id:'nl',type:'ssh',label:'Нидерланды'},reserve:{from:{id:'first',type:'ssh',label:'Первый <сервер>'},reason:'connection'}};
 const v=ui('/projects/a',{worker:'a'},async()=>({messages:[{role:'ai',text:'Сохранённый ответ',ts:1,network}]}));v.H.network={claude:{id:'other',type:'ssh',label:'Другой выход'}};await v.functions.load();
 const reply=v.document.querySelector('.frame.cur .live-msg.ai')!;assert.match(reply.textContent,/через VPS «Нидерланды»/);assert.match(reply.textContent,/ход пошёл через запасной/);assert.doesNotMatch(reply.textContent,/Другой выход/);assert.match(reply.innerHTML,/&lt;сервер&gt;/);assert.match(reply.textContent,/Сохранённый ответ/);
});


test('TS-43: chat read failure labels stale history, retries and removes the error after real recovery',async()=>{
 let failed=false;const v=ui('/projects/a',{worker:'a'},async()=>failed?{ok:false,error:'503'}:{messages:[{role:'ai',text:'Ответ из движка',ts:1}]});
 await v.functions.load();failed=true;await v.functions.load();
 assert.match(v.document.querySelector('[data-chat-read-error]')!.textContent,/Не удалось прочитать чат.*Последний снимок устарел/s);assert.equal(v.timers.size,1);assert.equal(v.S.chat[0].text,'Ответ из движка');
 failed=false;const retry=[...v.timers.values()][0]!;retry();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(v.document.querySelector('[data-chat-read-error]'),null);assert.equal(v.timers.size,0);assert.equal(v.S.chat[0].text,'Ответ из движка');
 failed=true;await v.functions.load();const old=[...v.timers.values()][0]!,before=v.requests.length;v.functions.invalidate();v.H.project='/projects/b';old();await new Promise(resolve=>setImmediate(resolve));assert.equal(v.requests.length,before,'old project does not retry into the new one');
});
