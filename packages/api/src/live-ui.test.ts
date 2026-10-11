import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {fixture,call,deferred,until,OWNER,FakeProvider} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
const proto=readFileSync(new URL('../../../ui/deploy/proto.js',import.meta.url),'utf8');
const away=readFileSync(new URL('../../../ui/sketches/disarto/18-overlays.html',import.meta.url),'utf8');
process.env.TZ='Europe/Istanbul';
function part(source:string,start:string,end:string){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b)}
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));
type Data=Record<string,any>;
function ui(options:{fetch?:(path:string,body:Data|undefined)=>Promise<Data>;storage?:Map<string,string>}={}){
 const storage=options.storage??new Map<string,string>(),requests:{path:string;body:Data|undefined}[]=[],toasts:string[]=[],clicks:((event:Data)=>unknown)[]=[],pagehide:(()=>void)[]=[],elements=new Map<string,Data>(),rows:Data[]=[];
 const H:Data={on:true,project:'/project-a',active:{worker:'chat-a'},panes:[{id:'worker',label:'воркер',model:'w1',vendor:'claude',role:'orchestrator',busy:false},{id:'room',label:'без роли',model:'w1',vendor:'claude'}],cur:null,asks:{},kinds:['question','note','verdict'],projects:[]};H.pane=H.panes[0];
 const S:Data={ui:{pane:'worker',direct:{worker:true}},chat:[],cx:{noFolder:false},draft:null},ta:Data={value:'question',style:{}};let rendered=0;
 const column={querySelectorAll:()=>[],classList:{toggle(){}},insertAdjacentHTML(){}};
 const document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',parentElement:{querySelector:()=>({textContent:''})},querySelector:()=>null,insertAdjacentHTML(){},replaceWith(){},cloneNode(){return this}});return elements.get(id)!},
  querySelectorAll(selector:string){if(selector==='.ps-folder[data-folder]')return rows;if(selector==='.feed .col')return [column];return []},querySelector:()=>null,
  addEventListener(type:string,fn:(event:Data)=>unknown){if(type==='click')clicks.push(fn)},documentElement:{hasAttribute:()=>false}};
 const sandbox:Data={H,S,document,window:{},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},location:{pathname:'/21-journal.html',href:''},PAGE:'chat',
  fetch:async(path:string,opts?:{body:string})=>{const body=opts?.body?JSON.parse(opts.body):undefined;requests.push({path,body});return {json:async()=>options.fetch?options.fetch(path,body):({ok:true,pane:{...H.pane,...body}})}},
  toast:(text:string)=>toasts.push(text),esc:(value:unknown)=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:Data)=>p.label,save(){},log(){},render(){rendered++},cols:()=>[column],drawLive(){},scrollEnd(){},md:(text:string)=>text,toolLine:()=>'',hStatus(){},now:()=>1791500000125,hhmm:()=>'',costLine:()=>'',actsLine:()=>'',ckBox:()=>'',onboardOnce:async()=>{},LOADED:null,
  showWaiting(){},showRestore(){},setTimeout(){},clearInterval(){},setInterval(){return 1},addEventListener(type:string,fn:()=>void){if(type==='pagehide')pagehide.push(fn)},dispatchEvent(){},CustomEvent:class {},confirm:()=>false,sideChats(){},
  refreshStatus:async()=>{},refreshChats:async()=>{},close(){},renderAll(){},draw(){},base:()=>'',modeLabel:(s:string)=>s,modelLabel:(s:string)=>s,ROOM:'room',isRoom:(p:Data)=>p.id==='room',ico:()=>'',pl:(n:number)=>String(n)};
 const context=createContext(sandbox);
 runInContext(part(live,'  const api=','  // TS-07: waiting controls')+
  part(live,'  let bindingGeneration','  function md(')+
  part(live,'  async function ask(','  function applyStatus(')+
  part(live,'  function reply(','  function composer(')+
  part(live,'  function composer(','  const SCREENS=')+
  part(live,'  function curHTML(','  function hEvent(')+
  part(live,'  async function loadChat(','  // подключение к движку')+
  part(live,'  const bubble=','  const cols=')+
  '\nconst L={api,configureSetting,bindingCurrent,toast,save,log,hStatus,paneName,refreshStatus};const globalState=S;'+
  '(function(){const S=()=>globalState,seat=()=>H.panes.find(p=>p.id===globalState.ui.pane)||H.pane,cx=()=>globalState.cx;'+part(cx,'  function setSeat(','  function pick(')+'globalThis.setSeat=setSeat;})();'+
  '\nglobalThis.testing={api,onSend,composer,sendBinding,configureSetting,settingsReady,bindingCurrent,invalidateBinding,ask,curHTML,finish,loadChat,bubble,setSeat};',context);
 const functions=(context as Data).testing as Data;
 function journal(){runInContext(part(live,'  let JR=','  // ── «Сейчас» при подключённом движке')+'\nglobalThis.journal={fetch:journalFetch,draw:journalDraw,before:journalBefore,reset:resetJournal,card:jcard,get state(){return JR}};',context);return (context as Data).journal as Data}
 function sidebar(){runInContext(part(live,"  const PROJECT_FOLD_KEY=",'  async function sideChats(')+
  part(live,"  document.addEventListener('click',async e=>{ const toggle=",'  // меню профиля')+
  '\nglobalThis.sidebar={expanded:projectExpanded,folder:projectFolder,toggle:toggleProjectFolder};',context);return (context as Data).sidebar as Data}
 return {H,S,ta,requests,toasts,storage,elements,rows,sandbox,context,functions,journal,sidebar,clicks,pagehide,get rendered(){return rendered}};
}

test('81/109: real HTTP setting and send are ordered; launch uses the accepted model',async t=>{
 const h=await fixture(t),view=ui({fetch:async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body});
 const gate=deferred<Data>(),original=view.sandbox.fetch;
 view.sandbox.fetch=async(path:string,opts?:{body:string})=>path==='/api/panes/worker'?{json:async()=>{await gate.promise;return (await original(path,opts)).json()}}:original(path,opts);
 const setting=view.functions.setSeat({model:'w2'},'Модель'),sending=view.functions.onSend('question',view.ta);await until(()=>view.S.draft==='question');
 assert.equal(h.provider.calls.length,0);assert.equal(view.ta.value,'question');gate.resolve({});
 assert.equal(await setting,true);assert.equal(await sending,true);await h.runtime.idle();
 assert.equal(h.provider.calls[0]!.seat.model,'w2');assert.equal(view.ta.value,'');assert.deepEqual(view.requests.map(r=>r.path),['/api/panes/worker','/api/chat']);
});

test('81/109: Enter and button share a single send while configuration is pending',async t=>{
 const h=await fixture(t),gate=deferred(),view=ui({fetch:async(path,body)=>{if(path==='/api/panes/worker')await gate.promise;return (await call(h.api,path,{...(body?{body}:{})})).body}}),keys:Data={},clicks:Data={};
 const ta={value:'question',style:{},focus(){},addEventListener(type:string,fn:(event:Data)=>void){keys[type]=fn}},input={textContent:'Написать',querySelector:()=>null,appendChild(){}},button={style:{},addEventListener(type:string,fn:()=>void){clicks[type]=fn}},box={querySelector:(selector:string)=>selector===':scope > .in'?input:button};
 view.sandbox.document.createElement=()=>ta;const all=view.sandbox.document.querySelectorAll;view.sandbox.document.querySelectorAll=(selector:string)=>selector==='.box'?[box]:all(selector);view.functions.composer();
 const setting=view.functions.setSeat({model:'w2'},'Модель');keys.keydown({key:'Enter',shiftKey:false,isComposing:false,preventDefault(){}});clicks.click();keys.keydown({key:'Enter',preventDefault(){}});
 await until(()=>view.requests.length===1);assert.equal(h.provider.calls.length,0);assert.equal(ta.value,'question');gate.resolve();await setting;await until(()=>h.provider.calls.length===1);await h.runtime.idle();
 assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.seat.model,'w2');assert.equal(ta.value,'');assert.equal(view.requests.filter(r=>r.path==='/api/chat').length,1);
});

test('81/109: HTTP next-model receipt preserves a busy turn and its protected fields',async t=>{
 const h=await fixture(t),gate=deferred(),entered=deferred();h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();entered.resolve();await gate.promise;ctx.session('old-session');ctx.publish({type:'done',sessionId:'old-session',model:seat.model,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'old result',sessionId:'old-session'}};
 await call(h.api,'/api/chat',{body:{pane:'worker',message:'old'}});await entered.promise;const before=h.runtime.registry.get('worker')!.settings();
 const configured=await call(h.api,'/api/panes/worker',{body:{model:'c1',mode:'full',cwd:'/elsewhere',sessionId:'forged',digest:true,role:'reviewer'}});assert.equal(configured.status,200);assert.equal(configured.body.ok,true);assert.equal(configured.body.appliesFrom,'next');assert.equal(configured.body.pane.vendor,'codex');assert.equal(configured.body.pane.mode,before.mode);assert.equal(configured.body.pane.cwd,before.cwd);assert.equal(configured.body.pane.role,before.role);assert.equal(configured.body.pane.digest,before.digest);
 gate.resolve();await h.runtime.idle();const pane=h.runtime.registry.get('worker')!;assert.equal(pane.model,'c1');assert.equal(pane.sessionId,null);assert.equal(pane.transcript.at(-1)!.model,'w1');await call(h.api,'/api/chat',{body:{pane:'worker',message:'next'}});await h.runtime.idle();assert.equal(h.codex.calls[0]!.seat.model,'c1');assert.equal(h.codex.calls[0]!.seat.sessionId,null);
});

for(const change of ['project','pane','chat','away-back','pagehide'])test('81/109: pending configuration cannot send across '+change+'; draft remains',async()=>{
 const gate=deferred<Data>(),view=ui({fetch:async()=>{await gate.promise;return {ok:true,pane:{id:'worker',model:'w2'}}}});
 const setting=view.functions.setSeat({model:'w2'},'Модель'),sending=view.functions.onSend('question',view.ta);await until(()=>view.requests.length===1);
 if(change==='project')view.H.project='/project-b';if(change==='pane')view.S.ui.pane='room';if(change==='chat')view.H.active.worker='chat-b';
 if(change==='away-back'){view.functions.invalidateBinding();view.S.ui.pane='room';view.functions.sendBinding();view.S.ui.pane='worker';view.functions.invalidateBinding()}
 if(change==='pagehide')view.pagehide[0]!();
 gate.resolve({});assert.equal(await setting,false);assert.equal(await sending,false);assert.equal(view.requests.length,1);assert.equal(view.ta.value,'question');assert.equal(view.S.draft,'question');assert.equal(view.H.panes[0].model,'w1');
});

test('81/109: refused setting and edited input never dispatch; multiple choices wait for the latest',async()=>{
 const denied=ui({fetch:async()=>({ok:false,error:'denied'})});denied.functions.setSeat({model:'w2'},'Модель');assert.equal(await denied.functions.onSend('question',denied.ta),false);assert.equal(denied.requests.length,1);assert.equal(denied.ta.value,'question');
 const gates=[deferred<Data>(),deferred<Data>()],view=ui({fetch:async(path,body)=>path==='/api/chat'?{ok:true}:{ok:true,pane:{...view.H.pane,...body},...(await gates[view.requests.length-1]!.promise)}});
 const first=view.functions.setSeat({model:'w2'},'Модель'),sending=view.functions.onSend('question',view.ta);await until(()=>view.requests.length===1);const second=view.functions.setSeat({model:'w1'},'Модель');
 gates[0]!.resolve({});await first;await until(()=>view.requests.length===2);assert.equal(view.requests.some(r=>r.path==='/api/chat'),false);view.ta.value='edited';gates[1]!.resolve({});await second;
 assert.equal(await sending,false);assert.equal(view.ta.value,'edited');assert.equal(view.S.draft,'edited');assert.equal(view.requests.length,2);
});

test('81/109: current answer keeps its launch label; history uses only saved done.model, including legacy',async()=>{
 const view=ui({fetch:async path=>path.startsWith('/api/chats/')?{messages:[{role:'ai',text:'saved',ts:1,model:'actual'},{role:'ai',text:'legacy',ts:2}],chat:{model:'configured-later'}}:{ok:true}});
 await view.functions.ask('question');view.H.cur.text='answer';view.H.pane.model='next';assert.match(view.functions.curHTML(),/w1/);assert.doesNotMatch(view.functions.curHTML(),/next/);
 view.functions.finish({type:'done',model:'actual'});assert.equal(view.S.chat.at(-1).model,'actual');await view.functions.loadChat();assert.equal(view.S.chat[0].model,'actual');assert.equal(view.S.chat[1].model,null);assert.match(view.functions.bubble(view.S.chat[1],1),/модель не сохранена/);assert.doesNotMatch(view.functions.bubble(view.S.chat[1],1),/configured-later|next/);
 view.H.cur={text:'no model terminal',tools:[],model:'launch',pane:'worker',who:'воркер'};view.functions.finish({type:'done'});assert.equal(view.S.chat.at(-1).model,null);
});

test('81/109: busy room uses pane setting and explains next-turn application',async()=>{
 const view=ui();view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.pane.busy=true;view.sandbox.fetch=async(path:string,opts:{body:string})=>{view.requests.push({path,body:JSON.parse(opts.body)});return {json:async()=>({ok:true,pane:{...view.H.pane,model:'w2'},appliesFrom:'next'})}};
 assert.equal(await view.functions.setSeat({model:'w2'},'Модель'),true);assert.equal(view.requests[0]!.path,'/api/panes/room');assert.match(view.toasts.at(-1)!,/применится со следующего хода/);
});

const records=(count:number)=>Array.from({length:count},(_,i)=>({seq:i+1,ts:i%2?'2026-10-10T10:37:00+03:00':'2026-10-10T02:01:00Z',from:'owner',to:['worker'],kind:i%2?'note':'question',text:'record '+(i+1),thread:null}));
test('79/80/107: >800 records, refresh, missing kinds, seq chronology and local card time',async()=>{
 let data=records(805);const view=ui({fetch:async path=>{const url=new URL(path,'http://localhost'),before=Number(url.searchParams.get('before')||Infinity);return {records:data.filter(r=>r.seq<before).slice(-400).reverse(),lastSeq:data.length,threads:{}}}}),journal=view.journal();
 await journal.fetch();assert.match(view.elements.get('jst')!.innerHTML,/последние 400 записей/);assert.equal(journal.before(),406);assert.ok(view.elements.get('jrows')!.innerHTML.indexOf('data-seq="805"')<view.elements.get('jrows')!.innerHTML.indexOf('data-seq="804"'));
 await journal.fetch(true);assert.equal(journal.state.records.length,800);data=records(808);await journal.fetch();assert.equal(journal.state.records.length,803);await journal.fetch(true);assert.equal(journal.state.records.length,808);assert.equal(new Set(journal.state.records.map((r:Data)=>r.seq)).size,808);assert.equal(journal.before(),null);
 journal.state.kind='verdict';journal.draw();assert.match(view.elements.get('jrows')!.innerHTML,/Среди загруженных записей нет вида verdict/);assert.match(view.elements.get('jf')!.innerHTML,/data-jk="verdict"/);
 journal.state.kind='question';journal.draw();assert.ok(view.elements.get('jrows')!.innerHTML.indexOf('data-seq="807"')<view.elements.get('jrows')!.innerHTML.indexOf('data-seq="805"'));assert.match(journal.card(data[0]),/10\.10\.2026.*05:01:00/);
 data=records(1808);await journal.fetch();assert.equal(journal.before(),1409);while(journal.before()!==null)await journal.fetch(true);assert.equal(journal.state.records.length,1808);assert.equal(new Set(journal.state.records.map((r:Data)=>r.seq)).size,1808);
});

test('79/107: failed and delayed pages retain loaded data, including project-away-and-back',async()=>{
 const gate=deferred<Data>();let delayed=false,fail=false;const data=records(805),view=ui({fetch:async path=>{if(path.includes('before')){if(fail)throw Error('offline');if(delayed)return gate.promise}return {records:data.slice(-400),lastSeq:805,threads:{}}}}),journal=view.journal();
 await journal.fetch();fail=true;assert.equal(await journal.fetch(true),false);assert.equal(journal.state.records.length,400);assert.match(view.toasts.at(-1)!,/уже загруженные сохранены/);assert.equal(journal.before(),406);
 fail=false;delayed=true;const old=journal.fetch(true);view.H.project='/project-b';journal.reset('/project-b');view.H.project='/project-a';journal.reset('/project-a');await journal.fetch();gate.resolve({records:data.slice(5,405),lastSeq:805});assert.equal(await old,false);assert.equal(journal.state.records.length,400);assert.equal(journal.state.loadingMore,false);
});

test('79/82: journal reset after project opening cannot change another screen title',()=>{
 const view=ui(),title={textContent:'Уйти'},get=view.sandbox.document.getElementById;view.sandbox.document.getElementById=(id:string)=>id==='jrows'?null:get(id);view.sandbox.document.querySelector=(selector:string)=>selector==='.frame .top > b'?title:null;
 const journal=view.journal();journal.reset('/new-project');assert.equal(title.textContent,'Уйти');assert.equal(view.requests.length,0);
});

test('78/106: arrows never switch projects; state is keyed by full path and survives redraw/restart',async()=>{
 const view=ui(),sidebar=view.sidebar(),a={path:'/first/same',name:'same',current:true},b={path:'/second/same',name:'same',current:false};view.H.projects=[a,b];
 assert.equal(sidebar.expanded(a),true);assert.equal(sidebar.expanded(b),false);let opened='';view.sandbox.sideSwitchProject=async(path:string)=>{opened=path};
 function click(target:Data){return view.clicks.at(-1)!({target:{closest:(selector:string)=>selector==='[data-folder-toggle]'&&target.toggle?{dataset:{folderToggle:target.path}}:selector==='.ps-folder[data-folder]'&&!target.toggle?{dataset:{folder:target.path,cur:'1'}}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}})}
 await click({toggle:true,path:a.path});assert.equal(opened,'');assert.equal(sidebar.expanded(a),false);assert.match(sidebar.folder(a,'own docs','own chats',()=>''),/display:none/);
 await click({toggle:true,path:b.path});assert.equal(opened,'');const other=sidebar.folder(b,'foreign docs','foreign chats',()=>'' );assert.match(other,/Откройте проект, чтобы увидеть его чаты/);assert.doesNotMatch(other,/foreign docs|foreign chats/);
 const restarted=ui({storage:view.storage}),next=restarted.sidebar();assert.equal(next.expanded(a),false);assert.equal(next.expanded(b),true);await click({path:a.path});assert.equal(opened,a.path);
});

test('82/105: wide/rail and mobile open the existing master; native confirmation is disabled and legacy cannot sign',()=>{
 const listeners:((e:Data)=>void)[]=[],location={href:''};let reopened=0;const document={addEventListener(_t:string,fn:(e:Data)=>void){listeners.push(fn)},getElementById:()=>({click(){reopened++}})};
 const context=createContext({document,location,KEY:'chat',PAGES:{away:'18-overlays.html'},window:{}});runInContext(part(proto,"  document.addEventListener('click',e=>{ const a=","  addEventListener('keydown'"),context);
 const target={closest:(selector:string)=>selector==='aside.side'?{}:selector==='[data-go]'?{dataset:{go:'away'}}:null};
 for(const side of ['wide','rail']){listeners[0]!({target,preventDefault(){},stopPropagation(){}});assert.equal(location.href,'18-overlays.html#leave',side)}
 (context as Data).KEY='away';listeners[0]!({target,preventDefault(){},stopPropagation(){}});assert.equal(reopened,1);
 const templates:string[]=[];runInContext(part(away,"  HX.bind('#leave'",'  // ── Показать окно'),createContext({HX:{bind(_s:string,fn:()=>string){templates.push(fn())}},blk:(_label:string,html:string)=>html,kv:()=>''}));
 assert.match(templates[0]!,/<button[^>]+disabled[^>]+title="условия ухода движок пока не исполняет"[^>]*>Подписать уход<\/button>/);assert.doesNotMatch(templates[0]!,/Сначала подписать M0|Прошлые ночи/);
 assert.match(proto,/PAGES\[k\]\+\(k==='away'\?'#leave':''\)/);assert.doesNotMatch(away,/<div class="comp"|<div class="col"><div class="me"/);
 const view=ui();view.S.away={deputy:'fake'};const callbacks:(()=>void)[]=[];view.sandbox.setTimeout=(fn:()=>void)=>callbacks.push(fn);
 runInContext(part(live,"  if(PAGE==='away'){",'  // ── боковая панель'),Object.assign(view.context,{PAGE:'away'}));const sign=view.clicks.at(-1)!;let stopped=false;
 sign({target:{closest:(selector:string)=>selector==='.panel .btn'?{textContent:'Подписать уход',dataset:{},closest:()=>null}:null},preventDefault(){},stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(view.S.away.deputy,'fake');assert.match(view.toasts.at(-1)!,/условия ухода движок пока не исполняет/);
 const cleaned=createContext({KEY:'k',localStorage:{getItem:()=>JSON.stringify({...view.S,v:1})}});runInContext(part(live,'  let S;','  const now=')+'load();globalThis.cleaned=S;',cleaned);assert.equal(Object.hasOwn((cleaned as Data).cleaned,'away'),false);
});
