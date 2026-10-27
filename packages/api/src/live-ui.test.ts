import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {testSite} from './site-test-helpers.ts';
import {pathToFileURL} from 'node:url';
const site=pathToFileURL(testSite()+'/');
import {fixture,call,sse,deferred,until,OWNER,FakeProvider} from './test-helpers.ts';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
const proto=readFileSync(new URL('../../../ui/deploy/proto.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../../../ui/deploy/proto.css',import.meta.url),'utf8');
const away=readFileSync(new URL('../../../ui/sketches/disarto/18-overlays.html',import.meta.url),'utf8');
process.env.TZ='Europe/Istanbul';
function part(source:string,start:string,end:string){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b)}
function builtProtoPages(build:string){const a=build.indexOf('PROTO_PAGES ='),b=build.indexOf('PROTO_SRC =',a);assert.ok(a>=0&&b>a);const block=build.slice(a,b);return [...new Set([...block.matchAll(/"([0-9][^"]+)"\s*:/g),...block.matchAll(/PROTO_PAGES\["([0-9][^"]+)"\]/g)].map(match=>match[1]!))]}
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));
type Data=Record<string,any>;
const imageRef=(hex='a')=>({id:hex.repeat(64),mime:'image/png',size:4,w:1,h:1});
const imageFile=(value=1)=>{const bytes=Uint8Array.of(value,2,3,4);return {name:'screen.png',type:'image/png',size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}};
test('TS-47.4 F05: unknown windows and incompatible estimates never become measured percentages',()=>{
 const source=readFileSync(new URL('../../../ui/deploy/ctx.js',import.meta.url),'utf8'),start=source.indexOf('  const fmt='),end=source.indexOf('  function openCard(anchor)');assert.ok(start>=0&&end>start);
 const sandbox:Data={L:{H:{pane:{id:'worker',label:'Исполнитель'},project:'/a'},paneName:(p:Data)=>p.label,esc:String},Date,Math};sandbox.globalThis=sandbox;
 const context=createContext(sandbox);runInContext(source.slice(start,end)+'\nglobalThis.views={html,tip,matrix};',context);
 const sample={window:null,used:161,pct:null,measured:true,busy:false,turns:1,parts:[{key:'instructions',label:'Инструкции',tokens:2607,est:true},{key:'history',label:'История',tokens:161,est:false}],history:[],handoff:[]};
 const unknown=sandbox.views.html(sample);assert.match(unknown,/окно модели: нет данных/);assert.match(unknown,/распределение не определено/);assert.match(unknown,/оценка/);assert.doesNotMatch(unknown,/1619|class="ctx-mx"/);assert.doesNotMatch(sandbox.views.tip(sample,'instructions'),/1619|\d+ %/);
 const mixed={...sample,window:1000,pct:16};assert.doesNotMatch(sandbox.views.html(mixed),/class="ctx-mx"|261 %/);
 const valid={...sample,window:1000,used:200,pct:20,parts:[{key:'instructions',label:'Инструкции',tokens:50,est:false},{key:'history',label:'История',tokens:150,est:false}]};assert.match(sandbox.views.html(valid),/class="ctx-mx"/);assert.match(sandbox.views.html(valid),/5 %/);
});
function ui(options:{fetch?:(path:string,body:Data|undefined)=>Promise<Data>;storage?:Map<string,string>}={}){
 const storage=options.storage??new Map<string,string>(),requests:{path:string;body:Data|undefined}[]=[],toasts:string[]=[],clicks:((event:Data)=>unknown)[]=[],pagehide:(()=>void)[]=[],pageshow:((event:Data)=>unknown)[]=[],elements=new Map<string,Data>(),rows:Data[]=[];
 const H:Data={on:true,project:'/project-a',active:{worker:'chat-a'},panes:[{id:'worker',label:'воркер',model:'w1',vendor:'claude',role:'orchestrator',kind:'orchestrator',busy:false},{id:'room',label:'без роли',model:'w1',vendor:'claude'}],models:{claude:[{id:'w1',label:'W1',images:true}]},cur:null,asks:{},kinds:['question','note','verdict'],projects:[]};H.pane=H.panes[0];
 const S:Data={ui:{pane:'worker',direct:{worker:true}},chat:[],cx:{noFolder:false},draft:null},ta:Data={value:'question',style:{}};let rendered=0;
 const column={querySelectorAll:()=>[],classList:{toggle(){}},insertAdjacentHTML(){}};
 const document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',dataset:{},remove(){elements.delete(id)},parentElement:{querySelector:()=>({textContent:''})},querySelector:()=>null,insertAdjacentHTML(){},replaceWith(){},cloneNode(){return this}});return elements.get(id)!},
  querySelectorAll(selector:string){if(selector==='.ps-folder[data-folder]')return rows;if(selector==='.feed .col')return [column];return []},querySelector:()=>null,
  addEventListener(type:string,fn:(event:Data)=>unknown){if(type==='click')clicks.push(fn)},documentElement:{hasAttribute:()=>false}};
 const sandbox:Data={H,S,document,window:{},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},location:{pathname:'/21-journal.html',href:''},KEY:'harnessy-live-v1',PAGE:'chat',
  fetch:async(path:string,opts?:{body:string})=>{const body=opts?.body?JSON.parse(opts.body):undefined;requests.push({path,body});return {json:async()=>options.fetch?options.fetch(path,body):({ok:true,pane:{...H.pane,...body}})}},
  toast:(text:string)=>toasts.push(text),esc:(value:unknown)=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:Data)=>p.label,save(){},log(){},render(){rendered++},cols:()=>[column],drawLive(){},scrollEnd(){},md:(text:string)=>text,mdFiles:new Map(),mdToolPaths:()=>[],knowledgeReset(){},knowledgeSet(){return true},knowledgeOpen:async()=>{},knowledgeFetch(){},KN:{data:null},hydrateArtifacts(){},mdMessageArtifacts(){return ""},toolLine:()=>'',hStatus(){},now:()=>1791500000125,hhmm:()=>'',costLine:()=>'',actsLine:()=>'',ckBox:()=>'',onboardOnce:async()=>{},LOADED:null,
  showWaiting(){},showRestore(){},renderWaiting(){},loadAttemptNotes:async()=>{},setTimeout(){},clearInterval(){},setInterval(){return 1},addEventListener(type:string,fn:(event:Data)=>unknown){if(type==='pagehide')pagehide.push(fn as ()=>void);if(type==='pageshow')pageshow.push(fn)},dispatchEvent(){},CustomEvent:class {},confirm:()=>false,sideChats(){},btoa:(raw:string)=>Buffer.from(raw,'binary').toString('base64'),URL:{createObjectURL:()=>"blob:test-image",revokeObjectURL(){}},
  refreshStatus:async()=>{},refreshChats:async()=>{},pickPane(){H.pane=H.panes.find((p:Data)=>p.id===S.ui.pane)||null},close(){},renderAll(){},draw(){},base:()=>'',modeLabel:(s:string)=>s,modelLabel:(s:string)=>s,ROOM:'room',isRoom:(p:Data)=>p.id==='room',ico:()=>'',pl:(n:number)=>String(n)};
 const context=createContext(sandbox);
 runInContext(readFileSync(new URL('../../../ui/deploy/autopilot-ui.js',import.meta.url),'utf8'),context);
 runInContext(part(live,'  const api=','  // TS-07: waiting controls')+
  part(live,'  const warningSeen=','  function waitingControls(')+
  part(live,'  let bindingGeneration','  function md(')+
  part(live,'  async function ask(','  function applyStatus(')+
  part(live,'  function reply(','  function composer(')+
  part(live,'  function composer(','  const SCREENS=')+
  part(live,'  async function stop(','  const toolLine=')+
  part(live,'  function curHTML(','  function hEvent(')+
  part(live,'  function hEvent(','  const isDirect=')+
  part(live,'  async function loadChat(','  // подключение к движку')+
  part(live,'  // TS-09b2:','  // End TS-09b2 promotion.')+
  part(live,'  const fmtN=','  const ckBox=')+
  part(live,'  const bubble=','  const cols=')+
  part(live,'  function markupNode(','  function guidanceState(')+
  part(live,'  function guidanceState(','  function render(')+
  part(live,'  function closeLAMenus()','  // запись «контекст передан»')+
  '\nconst L={api,sendBinding,configureSetting,bindingCurrent,toast,save,log,hStatus,paneName,refreshStatus};const globalState=S;'+
  '(function(){const S=()=>globalState,seat=()=>H.panes.find(p=>p.id===globalState.ui.pane)||H.pane,cx=()=>globalState.cx;'+part(cx,'  function setSeat(','  function pick(')+'globalThis.setSeat=setSeat;})();'+
  '\ndrawLive=()=>{if(window.CX&&CX.setBusy)CX.setBusy(!!H.cur)};globalThis.testing={api,onSend,composer,sendBinding,configureSetting,settingsReady,bindingCurrent,invalidateBinding,recordModelChange,bindFreshModelChanges,ask,stop,curHTML,footerUpdate,finish,loadChat,recoverStoppedTurn,bubble,actsLine,messageTime,fullMessageTime,updateMessageTimes,insertQuote,messageSelection,messageSelectionText,quoteBlock,renumberQuotes,nextQuoteNumber,setSeat,consumeState,hEvent,streamScope,streamGet,streamEnd,streamSelect,streamHidden,streamClear,selectedBusy,queueDelivered,attachmentFiles,attachmentKey,attachmentRefs,attachmentState,attachmentDraw,ownerProfile,profileDraw,chatGuidanceDraw,showOrchestratorOffer,laPath,projectPathValue};',context);
 const functions=(context as Data).testing as Data;
 function journal(){runInContext(part(live,'  let JR=','  // ── «Сейчас» при подключённом движке')+'\nglobalThis.journal={fetch:journalFetch,draw:journalDraw,before:journalBefore,reset:resetJournal,card:jcard,get state(){return JR}};',context);return (context as Data).journal as Data}
 function sidebar(){runInContext(part(live,"  const PROJECT_FOLD_KEY=",'  async function sideChats(')+
  part(live,"  document.addEventListener('click',async e=>{ const toggle=",'  // меню профиля')+
  '\nglobalThis.sidebar={expanded:projectExpanded,folder:projectFolder,toggle:toggleProjectFolder};',context);return (context as Data).sidebar as Data}
 function direct(){runInContext(part(live,"  document.addEventListener('click',e=>{ const d=e.target.closest('[data-direct]');",'  // ── переключение собеседника'),context);const listener=clicks.at(-1)!;
  return (mode:'on'|'orch')=>listener({target:{closest:(selector:string)=>selector==='[data-direct]'?{dataset:{direct:mode}}:null}}) as Promise<boolean>}
 return {H,S,ta,requests,toasts,storage,elements,rows,column,sandbox,context,functions,journal,sidebar,direct,clicks,hidePage:()=>pagehide.forEach(fn=>fn()),showPage:(event:Data)=>Promise.all(pageshow.map(fn=>fn(event))),get rendered(){return rendered}};
}

test('TS-47.2 F02: receipt and events define one phase; failure has one readable decision card',async()=>{
 const receipt=deferred<Data>(),view=ui({fetch:async(path)=>path==='/api/chat'?receipt.promise:{ok:true}}),sending=view.functions.ask('проверить',view.functions.sendBinding());
 assert.match(view.functions.curHTML(),/отправляем/);assert.doesNotMatch(view.functions.curHTML(),/ждём ответа/);
 receipt.resolve({ok:true});assert.equal(await sending,true);assert.match(view.functions.curHTML(),/ждём ответа/);
 view.functions.hEvent({type:'tool',name:'Read',detail:'a.txt'});assert.match(view.functions.curHTML(),/выполняет инструменты/);
 view.functions.hEvent({type:'approval',id:'a',title:'Разрешить запись?',detail:'a.txt'});assert.match(view.functions.curHTML(),/ждёт вашего решения/);
 view.functions.hEvent({type:'approvalResolved',id:'a',decision:'allow'});view.H.link='lost';assert.match(view.functions.curHTML(),/связь потеряна/);assert.match(view.functions.curHTML(),/последнее: выполняет инструменты/);assert.doesNotMatch(view.functions.curHTML(),/продолжается на сервере/);
 view.H.link='ok';view.functions.hEvent({type:'delta',text:'Часть ответа'});assert.match(view.functions.curHTML(),/отвечает/);assert.match(view.functions.curHTML(),/первый символ через \d+,\d с/);
 const waiting={turnInstanceId:'turn-a',status:'uncertain',failure:{code:'turn_failed',reason:'Провайдер отказал',durationMs:42},recordSeqs:[1],queuedSeqs:[],actions:['retry','skip']};
 view.functions.hEvent({type:'note',warning:'worker:turn-a:uncertain',text:'место ждёт итога хода'});view.functions.hEvent({type:'error',warning:'worker:turn-a:error',message:'Провайдер отказал',code:'turn_failed',waiting});view.functions.hEvent({type:'note',text:'1 запись остались в очереди и уйдут со следующим ходом'});
 assert.equal(view.S.chat.filter((m:Data)=>m.src==='err'||m.src==='sys').length,0);assert.equal(view.S.chat.filter((m:Data)=>m.src==='live').length,1);assert.equal(view.H.pane.waiting,waiting);
 const ctx=createContext({networkWaiting:()=>null,paneName:()=> 'Воркер',esc:view.sandbox.esc});runInContext(part(live,'  function waitingControls(','  function showWaiting(')+'globalThis.card=waitingControls;',ctx);const html=(ctx as Data).card(view.H.pane,waiting,view.H.project);assert.match(html,/Провайдер отказал/);assert.match(html,/Повторить/);assert.match(html,/Пропустить/);assert.match(html,/<details><summary>Технические детали<\/summary>turn_failed/);
 const d=dom('<div class="frame"><div class="status"><span></span><span></span></div></div>');view.sandbox.document=d.document;view.functions.footerUpdate();assert.match(d.document.querySelector('.status span')!.textContent,/ждёт вашего решения/);assert.doesNotMatch(d.document.querySelector('.status span')!.textContent,/готов/);
 view.H.pane.waiting=null;view.H.cur=null;view.S.chat.push({role:'ai',src:'err',html:'отказ'});view.functions.footerUpdate();assert.match(d.document.querySelector('.status span')!.textContent,/ход не завершён/);assert.doesNotMatch(d.document.querySelector('.status span')!.textContent,/готов/);
 const queued=ui({fetch:async()=>({ok:true,queued:true})});assert.equal(await queued.functions.ask('в очередь',queued.functions.sendBinding()),true);assert.equal(queued.H.cur,null);
 const done=ui(),timers:{ms:number;fn:()=>void}[]=[];done.sandbox.setTimeout=(fn:()=>void,ms:number)=>timers.push({fn,ms});done.H.cur={text:'Готовый ответ',tools:[],phase:'write',startedAt:Date.now()-1500};done.functions.hEvent({type:'done',model:'w1'});const message=done.S.chat.at(-1),bubble=done.functions.bubble(message,done.S.chat.length-1);assert.match(bubble,/>завершено</);assert.doesNotMatch(bubble,/class="live-acts"/);
 const finalDom=dom('<div class="frame cur">'+bubble+'</div>');done.sandbox.document=finalDom.document;const timer=timers.find(t=>t.ms===3000);assert.ok(timer);timer.fn();assert.equal(finalDom.document.querySelector('.live-completion'),null);assert.ok(finalDom.document.querySelector('.live-acts'));message.completedUntil=0;assert.doesNotMatch(done.functions.bubble(message,done.S.chat.length-1),/>завершено</);
});

test('TS-50.B: failed partial response keeps its own reason, identity and tools across history without becoming transferable',async()=>{
 const turn={turnInstanceId:'attempt-old',ts:10,model:'w1',outcome:'error',errorCode:'turn_failed',partialText:'Часть ответа',recordSeqs:[42],failure:{reason:'Нет связи'},toolEvents:[{type:'tool',name:'Read',detail:'file',status:'unknown',offset:null,order:0}]};
 const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages:[{role:'me',text:'Вопрос',ts:10.5,journalTs:9,journalSeq:42,seq:1},{role:'ai',text:'Новый ответ',ts:11,seq:2,runtime:{turnInstanceId:'attempt-new'}}],turns:[turn]}:{records:[]}});
 v.H.cur={text:'Часть ответа',tools:[],parts:[{kind:'text',text:'Часть ответа'}],model:'w1',pane:'worker'};
 v.functions.finish({type:'error',turnInstanceId:'attempt-old',message:'Нет связи',code:'turn_failed',waiting:{turnInstanceId:'attempt-old'}});
 const live=v.S.chat[0];assert.equal(live.failed,true);assert.equal(live.failedTurnId,'attempt-old');assert.match(live.html,/ход не завершён/);assert.match(live.html,/Нет связи/);assert.doesNotMatch(v.functions.actsLine(live,0),/передать контекст/);
 await v.functions.loadChat({onboard:false});const old=v.S.chat.find((m:Data)=>m.failedTurnId==='attempt-old'),next=v.S.chat.find((m:Data)=>m.turnInstanceId==='attempt-new');
 assert.equal(old.text,'Часть ответа');assert.match(old.html,/ход не завершён/);assert.match(old.html,/Нет связи/);assert.match(old.html,/инструменты/);assert.equal(old.failed,true);assert.doesNotMatch(v.functions.actsLine(old,0),/передать контекст/);assert.equal(next.text,'Новый ответ');assert.doesNotMatch(next.html,/инструменты|Часть ответа/);assert.deepEqual(v.S.chat.map((m:Data)=>m.text),['Вопрос','Часть ответа','Новый ответ']);
});

test('TS-50.B r2: a peer task precedes both failed fragments and the successful retry in history',async()=>{
 const turns=[{turnInstanceId:'attempt-1',ts:10,outcome:'error',partialText:'Фрагмент 1',recordSeqs:[42]},{turnInstanceId:'attempt-2',ts:11,outcome:'error',partialText:'Фрагмент 2',recordSeqs:[42]}];
 const messages=[{seq:1,role:'peer',text:'[от Руководитель] Поручение',journalSeq:42,journalTs:9,ts:13},{seq:2,role:'ai',text:'Итог',journalSeq:42,journalTs:5,ts:14,runtime:{turnInstanceId:'attempt-3'}}];
 const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages,turns}:{records:[]}});await v.functions.loadChat({onboard:false});
 assert.deepEqual(v.S.chat.map((m:Data)=>m.text),['[от Руководитель] Поручение','Фрагмент 1','Фрагмент 2','Итог']);
 assert.equal(v.S.chat[0].journalSeq,42);assert.equal(v.S.chat[0].t,9000);assert.equal(v.S.chat[3].t,14000,'model output keeps its own timestamp');
});

test('TS-50.B r2: failed input survives reload before retry, is not duplicated afterwards, and belongs to its attempt',async()=>{
 const turns=[{turnInstanceId:'attempt-1',ts:10,outcome:'error',partialText:'Фрагмент 1',recordSeqs:[42]},{turnInstanceId:'attempt-2',ts:11,outcome:'error',partialText:'Фрагмент 2',recordSeqs:[42]}];
 let done=false;const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages:done?[{seq:1,role:'me',text:'Вопрос',journalSeq:42,journalTs:9,ts:12},{seq:2,role:'ai',text:'Итог',ts:13}]:[],turns,attemptInputs:[{role:'me',text:'Вопрос',journalSeq:42,journalTs:9,ts:9},{role:'me',text:'Чужой вопрос',journalSeq:99,journalTs:8,ts:8}]}:{records:[]}});
 await v.functions.loadChat();assert.deepEqual(v.S.chat.map((m:Data)=>m.text),['Вопрос','Фрагмент 1','Фрагмент 2']);assert.equal(v.requests.some(r=>r.path==='/api/onboard'),false);
 const identity=v.functions.bubble(v.S.chat[0],0).match(/data-message-live-id="([^"]+)"/)?.[1];await v.functions.loadChat({onboard:false});assert.equal(v.functions.bubble(v.S.chat[0],0).match(/data-message-live-id="([^"]+)"/)?.[1],identity);
 done=true;await v.functions.loadChat({onboard:false});assert.deepEqual(v.S.chat.map((m:Data)=>m.text),['Вопрос','Фрагмент 1','Фрагмент 2','Итог']);
 const image={id:'a'.repeat(64),mime:'image/png',size:1,w:1,h:1},peer=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages:[],turns,attemptInputs:[{role:'peer',text:'[от Руководитель] Поручение',journalSeq:42,journalTs:9,ts:9,attachments:[image]}]}:{records:[]}});await peer.functions.loadChat({onboard:false});assert.equal(peer.S.chat[0].journalSeq,42);assert.doesNotMatch(peer.functions.actsLine(peer.S.chat[0],0),/передать контекст/);assert.match(peer.functions.bubble(peer.S.chat[0],0),/data-attachment-view/);
 const moved=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages:[],turns,unavailableAttemptInputs:['attempt-1']}:{records:[]}});await moved.functions.loadChat({onboard:false});assert.match(moved.S.chat[0].html,/Исходная запись недоступна/);
 const collision=ui({fetch:async path=>path==='/api/chats/chat-a'?{messages:[{seq:4,role:'me',text:'Новый вопрос',journalSeq:42,journalTs:20,ts:22}],turns,foreignAttemptInputs:['attempt-1','attempt-2']}:{records:[]}});await collision.functions.loadChat({onboard:false});assert.equal(collision.S.chat.find((m:Data)=>m.text==='Новый вопрос').t,22000);
});

test('TS-47.2: stop remains requested until an actual terminal event, including late and failed receipts',async()=>{
 const reply=deferred<Data>(),view=ui({fetch:async path=>path==='/api/interrupt'?reply.promise:{ok:true}}),timers:{ms:number;fn:()=>void}[]=[];
 view.sandbox.setTimeout=(fn:()=>void,ms:number)=>timers.push({fn,ms});const turn={text:'ответ',tools:[],phase:'write',startedAt:Date.now(),pane:'worker'};view.H.cur=turn;view.H.pane.busy=true;
 const stopping=view.functions.stop(),duplicate=view.functions.stop();assert.equal(view.requests.filter(r=>r.path==='/api/interrupt').length,1);reply.resolve({ok:true});await stopping;await duplicate;
 assert.equal(view.H.cur,turn);assert.match(view.functions.curHTML(),/остановка запрошена/);assert.doesNotMatch(view.functions.curHTML(),/остановлено владельцем/);assert.equal(timers.some(t=>t.ms===4000),false);
 view.functions.hEvent({type:'error',code:'cancelled',message:'Ход остановлен'});assert.equal(view.H.cur,null);assert.match(view.S.chat.at(-1).html,/Ход остановлен/);
 const failed=ui({fetch:async()=>({ok:false,error:'<нет связи>'})}),kept={text:'ответ',tools:[],phase:'write',startedAt:Date.now()};failed.H.cur=kept;await failed.functions.stop();assert.equal(failed.H.cur,kept);assert.equal((kept as Data).stopping,undefined);assert.match(failed.toasts.at(-1)!,/Не удалось запросить остановку/);assert.match(failed.toasts.at(-1)!,/&lt;нет связи&gt;/);
 const lost=ui({fetch:async()=>{throw Error('offline')}}),during={text:'ещё идёт',tools:[],phase:'write',startedAt:Date.now()};lost.H.cur=during;await lost.functions.stop();assert.equal(lost.H.cur,during);assert.equal((during as Data).stopUncertain,true);assert.match(lost.toasts.at(-1)!,/Не удалось подтвердить остановку/);
 const late=deferred<Data>(),other=ui({fetch:async()=>late.promise}),old={text:'старый',tools:[],phase:'write',startedAt:Date.now()};other.H.cur=old;const pending=other.functions.stop();other.H.cur={text:'новый',tools:[],phase:'write',startedAt:Date.now()};late.resolve({ok:true});await pending;assert.equal(other.H.cur.stopping,undefined);assert.equal(other.toasts.length,0);
});

test('TS-47.2: reconnect reconciles an interrupted turn only against the same confirmed idle chat',async()=>{
 const status={project:'/project-a',activeChats:{worker:'chat-a'},panes:[{id:'worker',busy:false}]};
 const receipt={chat:{id:'chat-a',pane:'worker'},messages:[{role:'me',text:'вопрос',seq:1},{role:'ai',text:'сохранённый итог',seq:2}]};
 const generation={stream:0,busy:0,epoch:0};
 const gate=deferred<Data>(),v=ui({fetch:async path=>path==='/api/chats/chat-a'?gate.promise:{records:[]}});v.H.link='ok';v.H.cur={text:'часть',tools:[],stopping:true};const old=v.H.cur,binding=v.functions.sendBinding();v.S.chat=[{role:'me',text:'старый снимок'}];
 const recovery=v.functions.recoverStoppedTurn(old,binding,status,generation);assert.equal(v.H.cur,old);assert.equal(v.requests.filter(r=>r.path==='/api/chats/chat-a').length,1);gate.resolve(receipt);assert.equal(await recovery,true);assert.equal(v.H.cur,null);assert.deepEqual(v.S.chat.map((m:Data)=>m.text),['вопрос','сохранённый итог']);
 for(const state of [null,{...status,panes:{}},{...status,panes:[]},{...status,panes:[{id:'worker',busy:true}]},{...status,activeChats:{worker:'chat-b'}},{...status,project:'/other'}]){const w=ui();w.H.link='ok';w.H.cur={text:'часть',tools:[],stopping:true};const cur=w.H.cur;assert.equal(await w.functions.recoverStoppedTurn(cur,w.functions.sendBinding(),state,generation),false);assert.equal(w.H.cur,cur);assert.equal(w.requests.length,0)}
 for(const reply of [null,{chat:{id:'chat-b',pane:'worker'},messages:[]},{chat:{id:'chat-a',pane:'room'},messages:[]},{chat:{id:'chat-a',pane:'worker'}}]){const w=ui({fetch:async()=>reply as Data});w.H.link='ok';w.H.cur={text:'часть',tools:[],stopping:true};const cur=w.H.cur;assert.equal(await w.functions.recoverStoppedTurn(cur,w.functions.sendBinding(),status,generation),false);assert.equal(w.H.cur,cur)}
 for(const change of ['turn','project','chat','busy','busy-event','event','disconnect','reconnected']){const hold=deferred<Data>(),w=ui({fetch:async()=>hold.promise});w.H.link='ok';w.H.cur={text:'часть',tools:[],stopping:true};w.S.chat=[{role:'me',text:'не стирать'}];const cur=w.H.cur,pending=w.functions.recoverStoppedTurn(cur,w.functions.sendBinding(),status,generation);
  if(change==='turn')w.H.cur={text:'новый ход',tools:[]};if(change==='project')w.H.project='/other';if(change==='chat')w.H.active.worker='chat-b';if(change==='busy')w.H.pane.busy=true;if(change==='busy-event'){w.functions.consumeState({pane:'worker',busy:true});w.H.pane.busy=false}if(change==='event')w.H.streamGeneration=1;if(change==='disconnect')w.H.link='lost';if(change==='reconnected')w.H.stopRecoveryEpoch=1;
  hold.resolve(receipt);assert.equal(await pending,false,change);assert.equal(w.S.chat[0].text,'не стирать',change);assert.ok(w.H.cur,change);if(change==='turn')assert.equal(w.H.cur.text,'новый ход');}
 const switched=ui({fetch:async()=>({ok:true})});switched.H.link='ok';switched.H.cur={text:'часть',tools:[]};await switched.functions.stop();const interrupted=switched.H.cur,original=interrupted.stopBinding;assert.equal(original.chat,'chat-a');switched.H.active.worker='chat-b';assert.equal(await switched.functions.recoverStoppedTurn(interrupted,original,{...status,activeChats:{worker:'chat-b'}},generation),false);assert.equal(switched.H.cur,interrupted);assert.equal(switched.requests.filter(r=>r.path.startsWith('/api/chats/')).length,0);
 const late=deferred<Data>(),w=ui({fetch:async path=>path==='/api/interrupt'?late.promise:path==='/api/chats/chat-a'?receipt:{records:[]}});w.H.link='ok';w.H.cur={text:'часть',tools:[]};const pending=w.functions.stop(),turn=w.H.cur;turn.stopRecovery={binding:w.functions.sendBinding(),status,generation};late.resolve({ok:true});await pending;assert.equal(w.H.cur,null);assert.equal(w.S.chat.at(-1).text,'сохранённый итог');
});

function stopRecoveryUI(fetch:(path:string,body:Data|undefined)=>Promise<Data>){
 const view=ui({fetch});view.H.link='ok';view.H.cur={text:'часть',tools:[]};view.sandbox.proposalsFetch=async()=>{};view.sandbox.connectionFailed=()=>{view.H.connectionFailed=true};
 view.sandbox.applyStatus=(st:Data)=>{view.H.project=st.project;view.H.active=st.activeChats;view.H.panes=st.panes;view.H.pane=st.panes.find((p:Data)=>p.id===view.S.ui.pane)||null;view.H.connectionFailed=false};
 runInContext(part(live,'  async function refreshStatus(','  // лента активного чата')+'\nglobalThis.readRecoveryStatus=refreshStatus;',view.context);
 runInContext('globalThis.reconnect=(function(){let linkedProject=H.project;const es={};'+part(live,'      es.onerror=()=>{','      hStatus(); }')+'return es;})();',view.context);
 return {...view,connection:(view.context as Data).reconnect,refresh:(view.context as Data).readRecoveryStatus};
}
const stoppedStatus=()=>({project:'/project-a',activeChats:{worker:'chat-a'},panes:[{id:'worker',label:'воркер',busy:false}]});
const stoppedHistory=()=>({chat:{id:'chat-a',pane:'worker'},messages:[{role:'me',text:'вопрос',seq:1},{role:'ai',text:'подтверждённый итог',seq:2}]});

test('TS-47.2: failed recovery history retries on the next status or history read',async()=>{
 for(const retry of ['status','history']){let reads=0;const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(++reads===1?{ok:false,code:'unavailable'}:stoppedHistory()):{records:[]});
  await v.functions.stop();const turn=v.H.cur;v.connection.onerror();await v.connection.onopen();assert.equal(v.H.cur,turn);assert.equal(turn.stopping,true);assert.ok(turn.stopRecovery);assert.equal(reads,1);
  if(retry==='status')await v.refresh();else await v.functions.loadChat({onboard:false});assert.equal(v.H.cur,null,retry);assert.equal(v.S.chat.at(-1).text,'подтверждённый итог');assert.equal(reads,2);}
});

test('TS-47.2: failed recovery status retries after a later status or history read',async()=>{
 for(const retry of ['status','history']){let statuses=0;const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?(++statuses===1?{ok:false,code:'unavailable'}:stoppedStatus()):path==='/api/chats/chat-a'?stoppedHistory():{records:[]});
  await v.functions.stop();const turn=v.H.cur;v.connection.onerror();await v.connection.onopen();assert.equal(v.H.cur,turn);assert.ok(turn.stopRecovery);assert.equal(v.H.connectionFailed,true);assert.equal(v.requests.filter(r=>r.path==='/api/chats/chat-a').length,0);
  if(retry==='status')await v.refresh();else await v.functions.loadChat({onboard:false});assert.equal(v.H.cur,null,retry);assert.equal(v.S.chat.at(-1).text,'подтверждённый итог');assert.equal(statuses,2);}
});

test('TS-47.2: repeated disconnect invalidates an in-flight reconciliation and reconnects again',async()=>{
 const entered=deferred<void>(),hold=deferred<Data>();let reads=0;const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(++reads===1?(entered.resolve(),hold.promise):stoppedHistory()):{records:[]});
 await v.functions.stop();const turn=v.H.cur;v.connection.onerror();const first=v.connection.onopen();await entered.promise;v.connection.onerror();hold.resolve(stoppedHistory());await first;
 assert.equal(v.H.link,'lost');assert.equal(v.H.cur,turn);assert.ok(turn.stopRecovery);assert.equal(v.toasts.filter(text=>text==='Связь восстановлена').length,0);
 await v.connection.onopen();assert.equal(v.H.link,'ok');assert.equal(v.H.cur,null);assert.equal(v.S.chat.at(-1).text,'подтверждённый итог');assert.equal(reads,2);
});

test('TS-47.2: recovery retry never clears a newer event or a different chat',async()=>{
 for(const change of ['event','chat']){let reads=0;const status=stoppedStatus(),v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?status:path==='/api/chats/chat-a'?(++reads===1?{ok:false}:stoppedHistory()):{records:[]});
  await v.functions.stop();const turn=v.H.cur;v.connection.onerror();await v.connection.onopen();if(change==='event')v.functions.hEvent({type:'delta',text:' новый фрагмент'});else{status.activeChats.worker='chat-b';v.H.active.worker='chat-b';v.functions.sendBinding()}
  await v.refresh();assert.equal(v.H.cur,turn,change);assert.equal(reads,1,change);if(change==='event')assert.match(turn.text,/новый фрагмент/);}
 const entered=deferred<void>(),late=deferred<Data>();let reads=0;const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(++reads===1?{ok:false}:(entered.resolve(),late.promise)):{records:[]});
 await v.functions.stop();v.connection.onerror();await v.connection.onopen();const loading=v.functions.loadChat({onboard:false});await entered.promise;v.H.cur={text:'новый ход',tools:[]};late.resolve(stoppedHistory());await loading;assert.equal(v.H.cur.text,'новый ход');assert.equal(v.S.chat.length,0);
});

for(const uncertain of [false,true])test('TS-47.2: a new accepted turn during '+(uncertain?'uncertain ':'')+'stop recovery has its own stream and interrupt',async()=>{
 const entered=deferred<void>(),hold=deferred<Data>();let interrupts=0;const v=stopRecoveryUI(async path=>{if(path==='/api/interrupt'){interrupts++;if(uncertain&&interrupts===1)throw Error('response lost');return {ok:true}}return path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(entered.resolve(),hold.promise):path==='/api/chat'?{ok:true}:{records:[]}});
 v.H.cur.text='старый ответ';await v.functions.stop();const old=v.H.cur;if(uncertain)assert.equal(old.stopUncertain,true);v.connection.onerror();const recovery=v.connection.onopen();await entered.promise;
 assert.equal(await v.functions.ask('новое сообщение'),true);assert.notEqual(v.H.cur,old);assert.equal(v.H.cur.stopping,undefined);assert.equal(v.H.cur.text,'');
 v.functions.consumeState({pane:'worker',busy:true});v.functions.hEvent({type:'delta',text:'новый ответ'});hold.resolve(stoppedHistory());await recovery;assert.equal(v.H.cur.text,'новый ответ');assert.equal(v.H.cur.stopping,undefined);
 await v.functions.stop();assert.equal(interrupts,2);assert.equal(v.H.cur.stopping,true);
});

test('TS-47.2: a rejected new send retains the unconfirmed old stop recovery',async()=>{
 const entered=deferred<void>(),hold=deferred<Data>();const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(entered.resolve(),hold.promise):path==='/api/chat'?{ok:false,error:'нет связи'}:{records:[]});
 await v.functions.stop();const old=v.H.cur;v.connection.onerror();const recovery=v.connection.onopen();await entered.promise;assert.notEqual(await v.functions.ask('новое сообщение'),true);assert.equal(v.H.cur,old);assert.equal(old.stopping,true);assert.ok(old.stopRecovery);hold.resolve(stoppedHistory());await recovery;
});

test('TS-47.2: history requested before stop cannot confirm a later recovery',async()=>{
 const started=deferred<void>(),oldHistory=deferred<Data>();let reads=0;const v=stopRecoveryUI(async path=>path==='/api/interrupt'?{ok:true}:path==='/api/status'?stoppedStatus():path==='/api/chats/chat-a'?(++reads===1?(started.resolve(),oldHistory.promise):reads===2?{ok:false}:stoppedHistory()):{records:[]});
 const oldLoad=v.functions.loadChat({onboard:false});await started.promise;await v.functions.stop();v.connection.onerror();await v.connection.onopen();assert.equal(reads,2);assert.ok(v.H.cur?.stopping);
 oldHistory.resolve({chat:{id:'chat-a',pane:'worker'},messages:[]});await oldLoad;assert.equal(reads,3);assert.equal(v.H.cur,null);assert.equal(v.S.chat.at(-1).text,'подтверждённый итог');
});

test('TS-47.2: a lost interrupt receipt remains uncertain and is reconciled after reconnect',async()=>{
 const v=stopRecoveryUI(async path=>{if(path==='/api/interrupt')throw new TypeError('response lost');if(path==='/api/status')return stoppedStatus();if(path==='/api/chats/chat-a')return stoppedHistory();return {records:[]}});
 await v.functions.stop();const turn=v.H.cur;assert.equal(turn.stopping,undefined);assert.equal(turn.stopUncertain,true);assert.ok(turn.stopBinding);assert.ok(v.toasts.some(text=>/Не удалось подтвердить/.test(text)));assert.ok(!v.toasts.includes('Остановка запрошена'));
 v.connection.onerror();await v.connection.onopen();assert.equal(v.H.cur,null);assert.equal(v.S.chat.at(-1).text,'подтверждённый итог');
});


test('TS-36E: sidebar profile uses only the owner name from the engine, never a provider account',()=>{
 const view=ui(),profiles:any[]=[],avatar={firstChild:{nodeValue:''},textContent:''},name={textContent:''},email={textContent:'',hidden:true,removeAttribute(key:string){if(key==='hidden')this.hidden=false},setAttribute(key:string){if(key==='hidden')this.hidden=true}},row={title:'',querySelector(selector:string){return selector==='[data-owner-avatar]'?avatar:selector==='[data-owner-name]'?name:selector==='[data-owner-email]'?email:null}};view.sandbox.window.PS2={setProfile:(profile:any)=>profiles.push(profile)};
 const query=view.sandbox.document.querySelectorAll;view.sandbox.document.querySelectorAll=(selector:string)=>selector==='aside.side.ps [data-owner-profile]'?[row]:query(selector);
 assert.deepEqual(plain(view.functions.profileDraw({profile:{name:'Мария'},auth:{claude:{loggedIn:true,email:'owner@example.test',name:'Чужое имя'}}})),{name:'Мария',email:'',configured:true});assert.equal(avatar.firstChild.nodeValue,'М');assert.equal(name.textContent,'Мария');assert.equal(email.textContent,'');assert.equal(email.hidden,true);
 assert.deepEqual(plain(view.functions.profileDraw({auth:{claude:{loggedIn:true,email:'forged@example.test',name:'Чужое имя'}}})),{name:'Без имени',email:'',configured:false});assert.equal(avatar.firstChild.nodeValue,'?');assert.equal(name.textContent,'Без имени');assert.equal(email.textContent,'');assert.equal(email.hidden,true);
 assert.deepEqual(profiles.map(plain),[{name:'Мария',email:'',configured:true},{name:'Без имени',email:'',configured:false}]);assert.doesNotMatch(proto,/9616166@gmail\.com|>Serge</);assert.match(proto,/data-ps2-profile/);
});

test('TS-36A: offline badges never pass demo decisions off as live Inbox data',()=>{
 let inbox:Data|null=null;const sandbox:Data={DEC:{m0:'demo one',limit:'demo two'},waiting:()=>['m0','limit'],window:{LIVE:{H:{on:false,panes:[]}},PS2:{setInbox:(value:Data)=>inbox=value}},document:{querySelectorAll:()=>[]},paneName:(pane:Data)=>pane.label};sandbox.globalThis=sandbox;
 const context=createContext(sandbox);runInContext(part(live,'  function waitList()','  // ── «Сейчас»')+'\nglobalThis.badges=badges;',context);sandbox.badges();assert.deepEqual(plain(inbox),{need:0,info:0,unavailable:true});
 sandbox.window.LIVE.H={on:true,panes:[{id:'worker',label:'воркер',waiting:true,pendingApprovals:0}]};sandbox.badges();assert.deepEqual(plain(inbox),{need:1,info:0});
});

test('TS-47.3 F01: streams stay with their project, instance, place and chat across selection',()=>{
 const view=ui(),a=view.H.panes[0],b={id:'reviewer',label:'ревьюер',model:'w1',busy:false};view.H.panes.push(b);view.H.active.reviewer='chat-b';view.H.liveStatus={trace:{instanceId:'instance-1'}};
 view.functions.consumeState({pane:'worker',busy:true,settingsBinding:{project:'/project-a',instanceId:'instance-1',chat:'chat-a'}});view.functions.hEvent({type:'delta',text:'Ответ A'});assert.equal(view.H.cur.text,'Ответ A');
 view.S.ui.pane='reviewer';view.H.pane=b;view.functions.streamSelect();assert.equal(view.H.cur,null,'another place is not busy');view.functions.streamHidden({pane:'worker',type:'delta',text:' ещё'});
 view.S.ui.pane='worker';view.H.pane=a;view.functions.streamSelect();assert.equal((view.H.cur as Data | null)?.text,'Ответ A ещё','the original conversation keeps its stream');
 view.S.ui.pane='reviewer';view.H.pane=b;view.functions.streamSelect();view.functions.streamHidden({pane:'worker',type:'done',chat:'chat-a'});assert.equal(view.H.cur,null,'hidden completion does not leave the selected composer busy');
 view.S.ui.pane='worker';view.H.pane=a;view.H.active.worker='new-chat';a.busy=true;view.functions.streamSelect();assert.equal(view.H.cur,null,'a different chat never inherits the old stream');assert.equal(view.functions.selectedBusy(),false,'the same busy place does not mark a different chat busy');view.H.liveStatus.trace.instanceId='instance-2';view.H.active.worker='chat-a';a.busy=false;view.functions.streamSelect();assert.equal(view.H.cur,null,'a new engine instance never inherits it either');
});

test('TS-47.3 r2: a late rejected send clears only its own hidden placeholder',async()=>{
 const gate=deferred<Data>(),view=ui({fetch:async path=>path==='/api/chat'?gate.promise:{ok:true}}),other={id:'reviewer',label:'ревьюер',model:'w1',busy:false};view.H.panes.push(other);view.H.active.reviewer='chat-b';
 const send=view.functions.ask('текст',view.functions.sendBinding());view.S.ui.pane='reviewer';view.H.pane=other;view.functions.streamSelect();view.functions.hEvent({type:'delta',text:'чужой ответ'});const otherCurrent=view.H.cur;
 gate.resolve({ok:false,code:'binding_changed'});assert.equal(await send,false);assert.equal(view.H.cur,otherCurrent,'a late refusal does not touch the other visible stream');
 view.S.ui.pane='worker';view.H.pane=view.H.panes[0];view.functions.streamSelect();assert.equal(view.H.cur,null,'the refused hidden placeholder is gone');assert.equal(view.functions.selectedBusy(),false);
 const later=deferred<Data>(),newer=ui({fetch:async path=>path==='/api/chat'?later.promise:{ok:true}}),peer={id:'reviewer',label:'ревьюер',model:'w1',busy:false};newer.H.panes.push(peer);newer.H.active.reviewer='chat-b';const oldSend=newer.functions.ask('старый запрос',newer.functions.sendBinding());newer.S.ui.pane='reviewer';newer.H.pane=peer;newer.functions.streamSelect();newer.functions.streamHidden({pane:'worker',chat:'chat-a',type:'delta',text:'новый ответ'});later.resolve({ok:false,code:'pane_busy'});assert.equal(await oldSend,false);newer.S.ui.pane='worker';newer.H.pane=newer.H.panes[0];newer.functions.streamSelect();assert.equal(newer.H.cur?.text,'новый ответ','a newer real stream is not cleared by the old rejection');
});

test('TS-47.3 r2: hidden tool failures retain the same reason and details as visible failures',()=>{
 const view=ui(),worker=view.H.pane,peer={id:'reviewer',label:'ревьюер',model:'w1',busy:false},event={type:'toolError',pane:'worker',chat:'chat-a',text:JSON.stringify({error:'Ошибка чтения файла',code:'denied'})};view.H.panes.push(peer);view.H.active.reviewer='chat-b';
 view.functions.hEvent(event);const expected=plain(view.H.cur.tools[0]);view.functions.streamClear();view.S.ui.pane='reviewer';view.H.pane=peer;view.functions.streamSelect();view.functions.streamHidden(event);assert.equal(view.H.cur,null,'the other conversation is not updated');view.S.ui.pane='worker';view.H.pane=worker;view.functions.streamSelect();assert.deepEqual(plain((view.H.cur as Data | null)?.tools[0]),expected);
});

test('TS-47.2 and TS-47.3: a hidden stream keeps ordered tool groups and phases on return',()=>{
 const view=ui(),worker=view.H.pane,peer={id:'reviewer',label:'ревьюер',model:'w1',busy:false};view.H.panes.push(peer);view.H.active.reviewer='chat-b';
 view.functions.hEvent({type:'delta',text:'До инструментов'});view.S.ui.pane='reviewer';view.H.pane=peer;view.functions.streamSelect();
 view.functions.streamHidden({type:'tool',pane:'worker',chat:'chat-a',name:'Read',detail:'a.txt'});view.functions.streamHidden({type:'toolError',pane:'worker',chat:'chat-a',text:'ошибка'});view.functions.streamHidden({type:'delta',pane:'worker',chat:'chat-a',text:'После инструментов'});
 view.S.ui.pane='worker';view.H.pane=worker;view.functions.streamSelect();const turn=view.H.cur;assert.equal(turn.phase,'write');assert.deepEqual(plain(turn.parts.map((part:Data)=>part.kind)),['text','tools','text']);assert.equal(turn.parts[1].tools.length,2);assert.equal(turn.parts[1].tools[1].err,true);assert.match(view.functions.curHTML(),/После инструментов/);
});

test('TS-47.2 r6: message identity survives history rereads but never crosses a binding or sequence',()=>{
 const view=ui(),message={seq:12,role:'ai',src:'live',pane:'worker',text:'ответ',html:'<p>ответ</p>'},id=(row:Data)=>view.functions.bubble(row,0).match(/data-message-live-id="([^"]+)"/)![1];view.S.chat=[message];const first=id(message);assert.equal(id({...message}),first);
 assert.notEqual(id({...message,seq:13}),first);assert.notEqual(id({...message,role:'me'}),first);view.H.active.worker='chat-b';assert.notEqual(id({...message}),first);view.H.active.worker='chat-a';view.H.project='/project-b';assert.notEqual(id({...message}),first);view.H.project='/project-a';view.H.liveStatus={trace:{instanceId:'new-instance'}};assert.equal(id({...message}),first,'saved history has the same identity after an engine restart');
 const pending={...message,seq:undefined};const transient=id(pending);assert.equal(id(pending),transient);view.H.active.worker='chat-b';assert.notEqual(id(pending),transient,'an unsaved object cannot carry disclosure to another chat');view.H.active.worker='chat-a';assert.equal(id(pending),transient);view.H.liveStatus={trace:{instanceId:'another-instance'}};assert.notEqual(id(pending),transient,'an unsaved object cannot carry disclosure to a new engine instance');
});

test('TS-47.2 r6: history uses final chronological order on its first paint',async()=>{
 const renders:number[][]=[],view=ui({fetch:async()=>({messages:[{seq:1,role:'ai',text:'позже',ts:20},{seq:2,role:'ai',text:'раньше',ts:10}]})});
 view.sandbox.render=()=>{if(view.S.chat.length)renders.push(view.S.chat.map((row:Data)=>row.seq))};await view.functions.loadChat({onboard:false});
 assert.deepEqual(renders,[[2,1]],'history is not temporarily painted in a different order before journal notes');
});

test('TS-47.2 r6: unknown timestamps never invent a history order',async()=>{
 const view=ui({fetch:async()=>({messages:[{seq:1,role:'ai',text:'первый',ts:20},{seq:2,role:'ai',text:'время неизвестно'},{seq:3,role:'ai',text:'последний',ts:10}]})});
 await view.functions.loadChat({onboard:false});assert.deepEqual(plain(view.S.chat.map((row:Data)=>row.seq)),[1,2,3]);
 await view.functions.loadChat({onboard:false});assert.deepEqual(plain(view.S.chat.map((row:Data)=>row.seq)),[1,2,3]);
});

test('TS-47.2 r6: rereading the same chat retains its journal notes until refreshed',async()=>{
 const renders:string[][]=[],view=ui({fetch:async()=>({messages:[{seq:1,role:'ai',text:'один',ts:10},{seq:2,role:'ai',text:'два',ts:30}]})});
 view.sandbox.render=()=>{if(view.S.chat.length)renders.push(view.S.chat.map((row:Data)=>String(row.attemptId||row.seq)))};await view.functions.loadChat({onboard:false});
 view.S.chat.splice(1,0,{attemptId:'note-a',role:'ai',src:'sys',text:'решение',html:'решение',t:20000});renders.length=0;
 await view.functions.loadChat({onboard:false});assert.deepEqual(renders,[['1','note-a','2']]);
 view.H.active.worker='chat-b';renders.length=0;await view.functions.loadChat({onboard:false});assert.deepEqual(renders,[['1','2']],'notes never cross a conversation');
 view.H.active.worker='chat-a';await view.functions.loadChat({onboard:false});view.S.chat.splice(1,0,{attemptId:'note-a',role:'ai',src:'sys',text:'решение',html:'решение',t:20000});view.H.project='/project-b';renders.length=0;await view.functions.loadChat({onboard:false});assert.deepEqual(renders,[['1','2']],'notes never cross projects even if the chat id matches');
});

test('TS-47.3 F06: only a confirmed queued message gets a recipient and a delivery removes its marker',async()=>{
 const gate=deferred<Data>(),view=ui({fetch:async(path)=>path==='/api/chat'?gate.promise:{ok:true}}),sent={role:'me',text:'следующее'},binding=view.functions.sendBinding();view.S.chat=[sent];view.H.cur={text:'ответ',tools:[]};
 const send=view.functions.ask(sent.text,binding,[],sent);assert.doesNotMatch(view.functions.bubble(sent,0),/В очереди/);gate.resolve({ok:true,queued:true,seq:9});assert.equal(await send,true);assert.match(view.functions.bubble(sent,0),/В очереди · воркер · после текущего хода/);
 view.functions.queueDelivered({type:'delivered',pane:'worker',records:[{seq:9}]});assert.doesNotMatch(view.functions.bubble(sent,0),/В очереди/);
 const later=deferred<Data>(),early=ui({fetch:async(path)=>path==='/api/chat'?later.promise:{ok:true}}),message={role:'me',text:'ранняя доставка'};early.S.chat=[message];early.H.cur={text:'',tools:[]};const pending=early.functions.ask(message.text,early.functions.sendBinding(),[],message);early.functions.queueDelivered({type:'delivered',pane:'worker',records:[{seq:10}]});later.resolve({ok:true,queued:true,seq:10});assert.equal(await pending,true);assert.doesNotMatch(early.functions.bubble(message,0),/В очереди/,'a late HTTP response cannot resurrect a delivered marker');
 const late=deferred<Data>(),switched=ui({fetch:async(path)=>path==='/api/chat'?late.promise:{ok:true}}),saved={role:'me',text:'принято после перехода'},scope=switched.functions.streamScope(),other={id:'reviewer',label:'ревьюер',model:'w1',busy:false};switched.H.panes.push(other);switched.H.active.reviewer='chat-b';switched.S.chat=[saved];switched.H.cur={text:'ответ',tools:[]};const sending=switched.functions.ask(saved.text,switched.functions.sendBinding(),[],saved);switched.S.ui.pane='reviewer';switched.H.pane=other;switched.functions.streamSelect();late.resolve({ok:true,queued:true,seq:11});assert.equal(await sending,false);assert.equal(switched.functions.streamGet(scope).pending.get(11).text,saved.text,'a confirmed late receipt belongs to its original view');switched.functions.streamEnd(scope);assert.ok(switched.functions.streamGet(scope).pending.has(11));switched.functions.queueDelivered({type:'delivered',pane:'worker',chat:'chat-a',records:[{seq:11}]});assert.equal(switched.functions.streamGet(scope),undefined,'delivery clears the hidden view snapshot');
});

test('TS-36E: only a reply recorded in chat mode carries the discussion chip',()=>{
 const view=ui(),reply={role:'ai',src:'live',model:'w1',html:'<p>Ответ</p>',text:'Ответ',t:1791500000000};
 assert.match(view.functions.bubble({...reply,mode:'chat'},0),/live-discussion-label[^>]*>обсуждение/);
 assert.doesNotMatch(view.functions.bubble({...reply,mode:'read'},0),/live-discussion-label/);
 assert.doesNotMatch(view.functions.bubble({...reply,mode:null},0),/live-discussion-label/);
});

test('TS-25: question and answer share copy and relative time; undated messages invent nothing',()=>{
 const view=ui(),nowAt=1791500000125,at=new Date(2026,9,15,10,0,0).getTime();view.S.chat=[{role:'me',text:'Исходный вопрос',t:nowAt-120000},{role:'ai',src:'live',text:'Исходный ответ',html:'<div class="md-body">Исходный ответ</div>',who:'воркер',model:'w1',pane:'worker',t:nowAt}];
 const question=view.functions.bubble(view.S.chat[0],0),answer=view.functions.bubble(view.S.chat[1],1),legacy=view.functions.bubble({role:'me',text:'Старый вопрос'},0);
 assert.match(question,/data-la="copy"[^>]*>копировать<\/span>/);assert.match(question,/data-live-time=/);assert.match(question,/2 мин назад/);
 assert.match(answer,/data-la="copy"/);assert.match(answer,/только что/);assert.match(answer,/live-last/);assert.doesNotMatch(answer,/время не сохранено/);
 assert.doesNotMatch(legacy,/<time|время не сохранено/);assert.equal(view.functions.messageTime(at-120000,at),'2 мин назад');assert.equal(view.functions.messageTime(at-30000,at),'только что');assert.equal(view.functions.messageTime(new Date(2026,9,14,3,9).getTime(),at),'вчера 03:09');assert.equal(view.functions.messageTime(new Date(2026,9,12,18,40).getTime(),at),'12.10 18:40');assert.match(view.functions.fullMessageTime(at),/^\d\d\.\d\d\.\d{4} \d\d:\d\d:\d\d$/);
 const stamp=nowAt-120000,node:Data={dataset:{liveTime:String(stamp)},textContent:'старое',title:'',remove(){throw Error('timestamp unexpectedly removed')}};const query=view.sandbox.document.querySelectorAll;view.sandbox.document.querySelectorAll=(selector:string)=>selector==='[data-live-time]'?[node]:query(selector);view.functions.updateMessageTimes();assert.match(node.textContent,/^2 мин назад$/);assert.match(node.title,/^\d\d\.\d\d\.\d{4} \d\d:\d\d:\d\d$/);
});

test('TS-34: new-chat guidance stays above the context row owned by the composer',()=>{
 const view=ui(),d=dom('<div class="frame cur"><div class="nc"><h2>Чем займёмся?</h2><div class="cx-top">исходный контекст</div><div class="box"></div></div></div>');Object.assign(d.document,{body:d.body});view.sandbox.document=d.document;view.sandbox.PAGE='new';view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.pane.model=null;
 view.functions.chatGuidanceDraw();const card=d.document.querySelector('[data-model-guidance]')!,contextRow=d.document.querySelector('.cx-top')!,box=d.document.querySelector('.box')!;
 assert.equal(box.previousElementSibling,contextRow);assert.equal(contextRow.previousElementSibling,card);contextRow.innerHTML='<span>Без проекта · Новый чат · Без роли</span>';assert.match(card.textContent,/Подключите модель, когда захотите/);
});

test('TS-47.1 F08: room guidance ignores a background project, explains an existing local orchestrator and validates the path',async()=>{
 const view=ui(),d=dom('<div class="frame cur"><div class="main"><div class="feed"><div class="col"></div></div></div></div>');Object.assign(d.document,{body:d.body});view.sandbox.document=d.document;
 view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.active.room='room-chat';view.H.noProject=true;view.S.chat=[{src:'live',role:'ai',pane:'room'}];view.functions.chatGuidanceDraw();
 assert.ok(d.document.querySelector('[data-orchestrator-guidance-accept]'),'background project must not suppress the offer');
 view.H.noProject=false;assert.equal(view.functions.showOrchestratorOffer(),true);const unavailable=d.document.querySelector('[data-orchestrator-guidance]')!;
 assert.match(unavailable.textContent,/В этом проекте уже есть оркестратор/);assert.equal(unavailable.querySelector('[data-orchestrator-guidance-accept]'),null);
 view.H.chatList=[{id:'room-chat',promotion:{pending:true}}];view.functions.chatGuidanceDraw();assert.ok(d.document.querySelector('[data-orchestrator-guidance-accept]'),'an interrupted promotion remains resumable');view.H.chatList=[];
 view.H.project='/project-b';view.H.panes=[view.H.pane];assert.equal(view.functions.showOrchestratorOffer(),true);assert.ok(d.document.querySelector('[data-orchestrator-guidance-accept]'),'project without an orchestrator remains eligible');
 const anchor=d.document.createElement('div');d.body.appendChild(anchor);let submitted='';view.functions.laPath(anchor,'создать проект и git','',(path:string)=>{submitted=path});const input=anchor.querySelector('input')!;
 await anchor.querySelector('[data-ok]')!.emit('click');assert.equal(submitted,'');assert.match(anchor.querySelector('[data-cx-path-error]')!.textContent,/Введите имя или путь папки проекта/);assert.equal(input.getAttribute('aria-invalid'),'true');
 input.value=' /projects/new ';await input.emit('keydown',{key:'Enter'});assert.equal(submitted,'/projects/new');assert.equal(anchor.querySelector('.live-menu'),null);
});

test('TS-34: hiding sketch messages keeps live guidance cards visible',()=>{
 const rule=style.match(/html\[data-proto\] \.feed \.col\.live-demo-off[^}]+/);assert.ok(rule);assert.match(rule[0],/:not\(\.live-guidance\)/);assert.match(rule[0],/display:none !important/);
});

test('TS-25: quote insertion keeps typed text, caret and image draft intact',()=>{
 const view=ui(),key=view.functions.attachmentKey(),image=imageRef();view.S.attachmentDrafts={[key]:[image]};let caret:number[]=[];
 const ta:Data={value:'Уже набранный текст',selectionStart:19,selectionEnd:19,scrollHeight:48,style:{},focus(){},setSelectionRange(a:number,b:number){caret=[a,b]},dispatchEvent(){}};
 view.sandbox.document.querySelector=(selector:string)=>selector.includes('.live-in')?ta:null;
 assert.equal(view.functions.insertQuote('первая строка\nвторая строка'),true);assert.equal(ta.value,'Уже набранный текст\n[1] > первая строка\n> вторая строка\n\n');assert.deepEqual(caret,[ta.value.length,ta.value.length]);assert.deepEqual(plain(view.functions.attachmentRefs(key)),[image]);assert.equal(view.S.draft,ta.value);
 ta.selectionStart=ta.selectionEnd=ta.value.length;assert.equal(view.functions.insertQuote('ещё одна'),true);assert.match(ta.value,/\[2\] > ещё одна\n\n$/);assert.equal(view.functions.renumberQuotes('[4] > первая\nкомментарий\n\n[9] > вторая'),'[1] > первая\nкомментарий\n\n[2] > вторая');
});

test('TS-27: real mousedown, mouseup and click keep the same reply control alive',async()=>{
 const d=dom('<div class="frame cur"><div class="live-msg" data-message-index="0"><span class="live-message-text">выделенная цитата</span></div><textarea class="live-in"></textarea></div>');Object.assign(d.document,{body:d.body});const content=d.document.querySelector('.live-message-text')!,ta:any=d.document.querySelector('.live-in')!;ta.value='Комментарий';ta.scrollHeight=40;let collapsed=false;
 const selection:any={isCollapsed:false,rangeCount:1,anchorNode:content.firstChild,focusNode:content.firstChild,toString:()=>collapsed?'':'выделенная цитата',getRangeAt:()=>({getBoundingClientRect:()=>({left:20,right:130,bottom:60})}),removeAllRanges(){collapsed=true;this.isCollapsed=true}};
 let choose:(picked:Data[])=>void=()=>assert.fail('chooser not opened'),transferred:Data|null=null;const sandbox:Data={document:d.document,window:{},S:{chat:[{seq:1,role:'ai',src:'live',who:'Воркер',text:'выделенная цитата',t:1791500000000}],draft:null},H:{on:true,pane:{id:'worker',label:'Воркер'},panes:[{id:'worker',label:'Воркер'},{id:'reviewer',label:'Ревьюер'}]},getSelection:()=>selection,innerWidth:1440,innerHeight:920,setTimeout:(fn:Function)=>fn(),addEventListener:d.window.addEventListener.bind(d.window),Event:class {},save(){},paneName:(p:Data)=>p.label,fullMessageTime:()=>'',toast(){},modelName:String,esc:String,sendBinding:()=>({}),laMulti:(_a:any,_b:any,_c:any,_d:any,next:(picked:Data[])=>void)=>choose=next,bindingCurrent:()=>true,leftPage:false,selStart:(to:string[],opts:Data)=>transferred={to,opts}};sandbox.globalThis=sandbox;const context=createContext(sandbox);
 runInContext(part(live,'  const selectionElement=','  const cols=')+'\nglobalThis.quoteUi={messageSelectionText,insertQuote};',context);await d.document.emit('selectionchange');const actions=d.document.querySelector('.live-quote-selection')!,reply=actions.querySelector('[data-selection-reply]')!;
 const transfer=actions.querySelector('[data-selection-transfer]')!;await transfer.emit('mousedown');await transfer.emit('mouseup');assert.equal(d.document.querySelector('.live-quote-selection'),actions);await transfer.emit('click');choose([{id:'reviewer'}]);assert.deepEqual(plain(transferred),{to:['reviewer'],opts:{sw:false,quotes:[{seq:1,text:'выделенная цитата',comment:'',source:'из ответа Воркер'}]}});
 await reply.emit('mousedown');await reply.emit('mouseup');assert.equal(d.document.querySelector('.live-quote-selection'),actions);assert.equal(actions.isConnected,true);await reply.emit('click');assert.equal(ta.value,'Комментарий\n[1] > выделенная цитата\n\n');assert.equal(d.document.querySelector('.live-quote-selection'),null);
});

test('TS-27: send renumbers remaining quotes before the model sees them',async t=>{
 const h=await fixture(t),view=ui({fetch:async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body}),text='[4] > первая\nкомментарий\n\n[9] > вторая';view.ta.value=text;
 assert.equal(await view.functions.onSend(text,view.ta),true);await h.runtime.idle();assert.equal(h.provider.calls[0]!.message,'[1] > первая\nкомментарий\n\n[2] > вторая');
});

test('TS-25: reply selection accepts text inside one message and rejects cross-message or outside selection',()=>{
 const view=ui();
 const message=(id:string)=>({id}),a=message('a'),b=message('b');
 const content=(parent:Data)=>({nodeType:1,closest(selector:string){if(selector==='.live-message-text,.md-body')return this;if(selector==='.live-msg'||selector==='.live-msg[data-message-index]')return parent;return null}}),ca=content(a),cb=content(b),node=(parent:Data)=>({nodeType:3,parentElement:parent});
 const selection=(start:Data,end:Data,text='выделенный текст')=>({isCollapsed:false,rangeCount:1,anchorNode:node(start),focusNode:node(end),toString:()=>text});
 assert.equal(view.functions.messageSelectionText(selection(ca,ca)),'выделенный текст');assert.equal(view.functions.messageSelectionText(selection(ca,cb)),'');assert.equal(view.functions.messageSelectionText({isCollapsed:true,rangeCount:1,toString:()=>''}),'');
});

function attachmentComposer(view:ReturnType<typeof ui>){
 const inputListeners:Data={},boxListeners:Data={};let host:Data|null=null;
 const input={textContent:'Написать…',querySelector:()=>null,appendChild(){}},ta:Data={value:'',style:{},focus(){},addEventListener(type:string,fn:Function){inputListeners[type]=fn},closest:()=>box},box:Data={classList:{add(){},remove(){}},querySelector(selector:string){if(selector===':scope > .in')return input;if(selector==='.live-attachments')return host;return null},insertBefore(node:Data){host=node},addEventListener(type:string,fn:Function){boxListeners[type]=fn},closest:()=>null};
 const query=view.sandbox.document.querySelectorAll;view.sandbox.document.querySelectorAll=(selector:string)=>selector==='.box'?[box]:query(selector);view.sandbox.document.createElement=(tag:string)=>tag==='textarea'?ta:{className:'',innerHTML:'',style:{}};view.functions.composer();return {ta,box,inputListeners,boxListeners,get host(){return host}};
}

test('81/109: real HTTP setting and send are ordered; launch uses the accepted model',async t=>{
 const h=await fixture(t),view=ui({fetch:async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body});
 view.H.project=h.dir;view.H.active.worker=h.runtime.paneBinding('worker').chat;view.H.pane.settingsBinding=h.runtime.paneBinding('worker');
 const gate=deferred<Data>(),original=view.sandbox.fetch;
 view.sandbox.fetch=async(path:string,opts?:{body:string})=>path==='/api/panes/worker'?{json:async()=>{await gate.promise;return (await original(path,opts)).json()}}:original(path,opts);
 const setting=view.functions.setSeat({model:'w2'},'Модель'),sending=view.functions.onSend('question',view.ta);await until(()=>view.S.draft==='question');
 assert.equal(h.provider.calls.length,0);assert.equal(view.ta.value,'question');gate.resolve({});
 assert.equal(await setting,true);assert.equal(await sending,true);await h.runtime.idle();
 assert.equal(h.provider.calls[0]!.seat.model,'w2');assert.equal(view.ta.value,'');assert.deepEqual(view.requests.map(r=>r.path),['/api/panes/worker','/api/chat']);
});

test('81/109: Enter and button share a single send while configuration is pending',async t=>{
 const h=await fixture(t),gate=deferred(),view=ui({fetch:async(path,body)=>{if(path==='/api/panes/worker')await gate.promise;return (await call(h.api,path,{...(body?{body}:{})})).body}}),keys:Data={},clicks:Data={};
 view.H.project=h.dir;view.H.active.worker=h.runtime.paneBinding('worker').chat;view.H.pane.settingsBinding=h.runtime.paneBinding('worker');
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
 if(change==='pagehide')view.hidePage();
 gate.resolve({});assert.equal(await setting,false);assert.equal(await sending,false);assert.equal(view.requests.length,1);assert.equal(view.ta.value,'question');assert.equal(view.S.draft,'question');assert.equal(view.H.panes[0].model,'w1');
});

test('81/109: refused setting and edited input never dispatch; multiple choices wait for the latest',async()=>{
 const denied=ui({fetch:async()=>({ok:false,error:'denied'})});denied.functions.setSeat({model:'w2'},'Модель');assert.equal(await denied.functions.onSend('question',denied.ta),false);assert.equal(denied.requests.length,1);assert.equal(denied.ta.value,'question');
 const gates=[deferred<Data>(),deferred<Data>()],view=ui({fetch:async(path,body)=>path==='/api/chat'?{ok:true}:{ok:true,pane:{...view.H.pane,...body},...(await gates[view.requests.length-1]!.promise)}});
 view.H.pane.settingsBinding={project:view.H.project,instanceId:'instance-a',pane:'worker',chat:'chat-a'};
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

test('TS-49.2: confirmed model event survives history reload only in its original project, place and chat',async()=>{
 const view=ui({fetch:async path=>path.startsWith('/api/chats/')?{chat:{id:path.split('/').at(-1),pane:view.H.pane.id},messages:[{role:'me',text:'hello',ts:1}]}:{ok:true}});
 await view.functions.loadChat({onboard:false});view.S.chat=[];
 const binding=view.functions.sendBinding();view.functions.recordModelChange(binding,{from:'Fable · Claude',to:'Fable · Codex',scope:'место «воркер»'});
 assert.equal(view.S.chat.length,1);const html=view.functions.bubble(view.S.chat[0],0);assert.match(html,/Fable · Claude/);assert.match(html,/Fable · Codex/);assert.match(html,/место «воркер»/);assert.match(html,/<time /);
 await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.filter((m:Data)=>m.src==='model-change').length,1);await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.filter((m:Data)=>m.src==='model-change').length,1);
 view.H.active.worker='chat-b';await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.some((m:Data)=>m.src==='model-change'),false);
 view.H.active.worker='chat-a';view.H.project='/project-b';await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.some((m:Data)=>m.src==='model-change'),false);
 view.H.project='/project-a';view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.active.room='chat-a';await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.some((m:Data)=>m.src==='model-change'),false);
 view.S.ui.pane='worker';view.H.pane=view.H.panes[0];await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.filter((m:Data)=>m.src==='model-change').length,1);
});

test('TS-49.2 r3: a receipt for the selected chat cannot enter the previous feed while history is loading',async()=>{
 const view=ui({fetch:async path=>path.startsWith('/api/chats/')?{chat:{id:path.split('/').at(-1),pane:view.H.pane.id},messages:[{role:'me',text:path.endsWith('chat-a')?'Сообщение A':'Сообщение B',ts:1}]}:{ok:true}});
 await view.functions.loadChat({onboard:false});assert.equal(view.S.chat[0].text,'Сообщение A');
 view.H.active.worker='chat-b';const binding=view.functions.sendBinding();view.functions.recordModelChange(binding,{from:'A',to:'B',scope:'место «воркер»'});
 assert.equal(view.S.chat.length,1);assert.equal(view.S.chat[0].text,'Сообщение A');
 await view.functions.loadChat({onboard:false});assert.equal(view.S.chat.some((m:Data)=>m.text==='Сообщение A'),false);assert.equal(view.S.chat.filter((m:Data)=>m.src==='model-change').length,1);
});

test('TS-49.2: a receipt after pagehide merges into stored state without replacing the newer draft',()=>{
 const view=ui(),binding=view.functions.sendBinding(),key='harnessy-live-v1',other=JSON.stringify(['/project-a','worker','other']);view.storage.set(key,JSON.stringify({v:1,draft:'новый несентый текст',attachmentDrafts:{other:['image']},modelChanges:{[other]:[{src:'model-change',from:'A',to:'B',scope:'место',t:1}]}}));view.hidePage();
 view.functions.recordModelChange(binding,{from:'W1',to:'W2',scope:'место «воркер»'});const stored=JSON.parse(view.storage.get(key)!);assert.equal(stored.draft,'новый несентый текст');assert.deepEqual(stored.attachmentDrafts,{other:['image']});assert.equal(stored.modelChanges[other].length,1);assert.equal(stored.modelChanges[JSON.stringify(['/project-a','worker','chat-a'])].length,1);
});

test('TS-49.2: a new-chat model receipt never enters the previous chat and follows only its confirmed new chat',()=>{
 const view=ui();view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.active.room='old';const old=view.functions.sendBinding(),key=JSON.stringify([old.project,old.pane,old.chat,'fresh']);
 view.functions.recordModelChange({...old,fresh:true},{from:'W1',to:'W2',scope:'этот разговор'});assert.equal(view.S.chat.length,0);
 view.functions.bindFreshModelChanges(old,key);assert.equal(view.S.chat.length,0);view.H.active.room='new';const created=view.functions.sendBinding();view.functions.bindFreshModelChanges(created,JSON.stringify(['/other','room','old','fresh']));assert.equal(view.S.chat.length,0);
 view.functions.bindFreshModelChanges(created,key);assert.equal(view.S.chat.length,1);assert.equal(view.S.chat[0].scope,'этот разговор');view.functions.bindFreshModelChanges(created,key);assert.equal(view.S.chat.length,1);
});

test('81/109: busy room uses pane setting and explains next-turn application',async()=>{
 const view=ui();view.S.ui.pane='room';view.H.pane=view.H.panes[1];view.H.active.room='room-chat';view.H.pane.settingsBinding={project:view.H.project,instanceId:'instance-a',pane:'room',chat:'room-chat'};view.H.pane.busy=true;view.sandbox.fetch=async(path:string,opts:{body:string})=>{view.requests.push({path,body:JSON.parse(opts.body)});return {json:async()=>({ok:true,pane:{...view.H.pane,model:'w2'},appliesFrom:'next'})}};
 assert.equal(await view.functions.setSeat({model:'w2'},'Модель'),true);assert.equal(view.requests[0]!.path,'/api/panes/room');assert.match(view.toasts.at(-1)!,/применится со следующего хода/);
});

const directSeats='  worker: {role: executor, vendor: claude, model: w1, mode: read}\n  orchestrator: {role: orchestrator, vendor: claude, model: w1, mode: read}';
for(const place of ['worker','room'])for(const page of ['chat','new'])test('135/TS-36E: '+place+' composer on '+page+' follows current project state without a project chip',()=>{
 const view=ui();view.H.project='/projects/chat-test';view.H.noProject=false;view.H.pane=view.H.panes.find((p:Data)=>p.id===place);view.S.ui.pane=place;view.S.cx={noFolder:true,att:[],modes:{}};view.sandbox.PAGE=page;
 view.sandbox.svg=()=>'';view.sandbox.seats=()=>view.H.panes.filter((p:Data)=>p.id!=='room');
 const top={innerHTML:''},bot={innerHTML:''},att={innerHTML:'',style:{}},box={__cx:{ta:view.ta},previousElementSibling:top,querySelector:(s:string)=>s==='.cx-bot'?bot:s==='.cx-att'?att:null};
 runInContext('(function(){const S=()=>globalState,seat=()=>H.pane,cx=()=>globalState.cx;'+cx.match(/const base=[^;]+;/)![0]+part(cx,'  const allModels=','  // ── строка:')+part(cx,'  function render(box)','  function setBusy(')+'globalThis.renderCX=render;})();',view.context);
 const render=(view.context as Data).renderCX;render(box);assert.doesNotMatch(top.innerHTML,/data-cx="folder"|<b>chat-test<\/b>/);assert.equal(view.S.cx.noFolder,false);
 view.H.project='/projects/next';render(box);assert.doesNotMatch(top.innerHTML,/data-cx="folder"|<b>chat-test<\/b>/);assert.equal(view.S.cx.noFolder,false);
 view.H.noProject=true;view.S.cx.noFolder=false;render(box);assert.doesNotMatch(top.innerHTML,/data-cx="folder"|<b>Без проекта<\/b>/);assert.equal(view.S.cx.noFolder,true);
});
function withOrchestrator(view:ReturnType<typeof ui>){view.H.panes[0].role='executor';view.H.panes[0].kind='worker';view.H.panes.push({id:'orchestrator',label:'оркестратор',role:'orchestrator',kind:'orchestrator',vendor:'claude',model:'w1'});view.H.active.orchestrator='c-orch'}
for(const change of ['pane','project','chat','away-back','pagehide'])test('TS-08 r2/1: orchestrator card retains its target through delayed history and cancels on '+change,async t=>{
 const h=await fixture(t,{seats:directSeats}),history=deferred<Data>(),view=ui({fetch:async(path,body)=>path==='/api/chats/c-orch'?history.promise:(await call(h.api,path,{...(body?{body}:{})})).body});
 withOrchestrator(view);view.S.draft='ONLY for orchestrator';const sending=view.direct()('orch');await until(()=>view.requests.some(r=>r.path==='/api/chats/c-orch'));
 if(change==='pane'){h.runtime.roomSet({model:'w1',folder:false},OWNER);view.functions.invalidateBinding();view.S.ui.pane='room';view.H.pane=view.H.panes[1]}
 if(change==='project')view.H.project='/project-b';if(change==='chat')view.H.active.orchestrator='c-other';
 if(change==='away-back'){view.functions.invalidateBinding();view.S.ui.pane='room';view.functions.sendBinding();view.S.ui.pane='orchestrator';view.H.pane=view.H.panes.at(-1);view.functions.invalidateBinding()}
 if(change==='pagehide')view.hidePage();
 history.resolve({messages:[],chat:{model:'w1'}});assert.equal(await sending,false);await h.runtime.idle();
 assert.equal(h.provider.calls.length,0);assert.equal(view.requests.filter(r=>r.path==='/api/chat').length,0);assert.equal(view.S.draft,'ONLY for orchestrator');assert.equal(view.S.chat.filter((m:Data)=>m.role==='me').length,0);
});

for(const mode of ['on','orch'] as const)for(const accepted of [false,true])test('TS-08 r2/2: '+mode+' card waits for '+(accepted?'accepted':'refused')+' model setting before sending',async t=>{
 const h=await fixture(t,{seats:directSeats}),history=deferred<Data>(),configuration=deferred(),id=mode==='on'?'worker':'orchestrator',orchChat=(await h.runtime.chatsNew({pane:'orchestrator',carry:'none'},OWNER)).chat.id;
 const view=ui({fetch:async(path,body)=>{if(path==='/api/chats/'+orchChat)return history.promise;if(path==='/api/panes/'+id){await configuration.promise;if(!accepted)return {ok:false,error:'model setting denied'}}return (await call(h.api,path,{...(body?{body}:{})})).body}});
 withOrchestrator(view);view.H.project=h.dir;view.H.active.worker=h.runtime.paneBinding('worker').chat;view.H.active.orchestrator=orchChat;for(const pane of view.H.panes.filter((p:Data)=>p.id==='worker'||p.id==='orchestrator'))pane.settingsBinding=h.runtime.paneBinding(pane.id);view.S.ui.direct={};view.S.draft='confirmation question';const click=view.direct();let sending:Promise<boolean>,setting:Promise<boolean>;
 if(mode==='on'){setting=view.functions.setSeat({model:'w2'},'Модель');await until(()=>view.requests.some(r=>r.path==='/api/panes/worker'));sending=click(mode)}
 else {sending=click(mode);await until(()=>view.requests.some(r=>r.path==='/api/chats/'+orchChat));setting=view.functions.setSeat({model:'w2'},'Модель');await until(()=>view.requests.some(r=>r.path==='/api/panes/orchestrator'));history.resolve({messages:[],chat:{model:'w1'}})}
 await immediate();assert.equal(view.requests.filter(r=>r.path==='/api/chat').length,0);assert.equal(h.provider.calls.length,0);assert.equal(view.S.draft,'confirmation question');
 configuration.resolve();assert.equal(await setting,accepted);assert.equal(await sending,accepted);await h.runtime.idle();
 assert.equal(view.requests.filter(r=>r.path==='/api/chat').length,accepted?1:0);assert.equal(h.provider.calls.length,accepted?1:0);
 if(accepted){assert.equal(h.provider.calls[0]!.seat.id,id);assert.equal(h.provider.calls[0]!.seat.model,'w2');assert.match(h.provider.calls[0]!.message,/confirmation question/);assert.equal(view.S.draft,null)}
 else {assert.equal(view.S.draft,'confirmation question');assert.equal(view.S.chat.filter((m:Data)=>m.role==='me').length,0)}
});

for(const nextModel of ['w2','c1'])test('TS-08 r2/3: actual EventBus → SSE → window takes external start model and keeps it after setting '+nextModel,async t=>{
 const h=await fixture(t),stream=await sse(h.api),gate=deferred(),entered=deferred();t.after(()=>{gate.resolve();stream.close()});await until(()=>stream.raw.includes(': ok'));
 const view=ui();view.H.project=h.dir;view.H.active={...h.runtime.project.state.chats.active};view.H.liveStatus={trace:{instanceId:h.runtime.project.trace.instanceId}};let delivered=0;const deliver=()=>{while(delivered<stream.frames.length){const event=stream.frames[delivered++];if(event.type==='state')view.functions.consumeState(event);if(event.pane==='worker')view.functions.hEvent(event)}};
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'first '});entered.resolve();await gate.promise;ctx.publish({type:'delta',text:'second'});ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'first second',sessionId:null}};
 const turn=h.runtime.runTurn('worker','started outside this window');await entered.promise;await until(()=>stream.frames.some(e=>e.type==='delta'));deliver();
 const initial=stream.frames.find(e=>e.type==='state'&&e.pane==='worker'&&e.busy);assert.ok(initial);assert.equal(initial.status,'idle');assert.equal(view.H.cur.model,'w1');assert.match(view.functions.curHTML(),/w1/);assert.doesNotMatch(view.functions.curHTML(),/модель не сохранена/);
 const configured=await call(h.api,'/api/panes/worker',{body:{model:nextModel}});assert.equal(configured.body.appliesFrom,'next',JSON.stringify(configured.body));await until(()=>stream.frames.some(e=>e.type==='state'&&e.pane==='worker'&&e.model===nextModel));deliver();
 assert.equal(view.H.pane.model,nextModel);assert.equal(view.H.cur.model,'w1');assert.match(view.functions.curHTML(),/w1/);assert.doesNotMatch(view.functions.curHTML(),new RegExp(nextModel));
 gate.resolve();await turn;await until(()=>stream.frames.some(e=>e.type==='done'));deliver();assert.equal(view.H.cur,null);assert.equal(view.S.chat.length,1);assert.equal(view.S.chat[0].model,'w1');assert.equal(view.S.chat[0].text,'first second');
});

test('TS-08 r2/3: missing start model stays unknown; state from another pane cannot start the selected answer',()=>{
 const view=ui();view.functions.consumeState({pane:'room',busy:true,status:'idle',model:'foreign'});assert.equal(view.H.cur,null);
 view.functions.consumeState({pane:'worker',busy:true,status:'idle'});assert.match(view.functions.curHTML(),/модель не сохранена/);view.functions.consumeState({pane:'worker',busy:true,status:'idle',model:'next'});assert.match(view.functions.curHTML(),/модель не сохранена/);assert.doesNotMatch(view.functions.curHTML(),/next/);
});

for(const source of ['carry','digest','carry + digest'])test('129: EventBus → SSE → window preserves the active model through '+source+' and a note between deltas',async t=>{
 const h=await fixture(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: true}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',
  before:dir=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: "*", to: "*", kinds: "*"}]\nobserve: {executor: "*"}\n')});
 if(source.includes('digest'))await h.runtime.runTurn('peer','context from peer');
 if(source.includes('carry'))h.runtime.registry.get('worker')!.carry='saved earlier conversation';
 const stream=await sse(h.api),first=deferred(),last=deferred(),entered=deferred(),streaming=deferred();
 t.after(()=>{first.resolve();last.resolve();stream.close()});await until(()=>stream.raw.includes(': ok'));
 const view=ui(),busy:boolean[]=[];view.H.project=h.dir;view.H.active={...h.runtime.project.state.chats.active};view.H.liveStatus={trace:{instanceId:h.runtime.project.trace.instanceId}};view.sandbox.CX=view.sandbox.window.CX={setBusy:(value:boolean)=>busy.push(value)};
 view.sandbox.selBar=()=>{};view.sandbox.cols=()=>[];
 runInContext(part(live,'  function render(){',"  document.addEventListener('click',e=>{ if(e.target.closest('a[data-demo]'))"),view.context);
 const binding=plain(view.functions.sendBinding()),active:{snapshot:Data|null}={snapshot:null};let delivered=0;
 const deliver=()=>{while(delivered<stream.frames.length){const event=stream.frames[delivered++];
  if(event.type==='state')view.functions.consumeState(event);
  if(event.pane!=='worker')continue;
  if(event.type==='state'&&event.busy&&!active.snapshot)active.snapshot=view.H.cur;
  view.functions.hEvent(event);
  if(event.type==='note'){assert.ok(active.snapshot);assert.strictEqual(view.H.cur,active.snapshot);assert.equal(view.H.cur.model,'w1');assert.equal(view.H.cur.pane,'worker');assert.equal(busy.at(-1),true);assert.equal(view.S.chat.filter((m:Data)=>m.src==='live').length,0);assert.deepEqual(plain(view.functions.sendBinding()),binding)}
 }};
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();entered.resolve();await first.promise;
  ctx.publish({type:'delta',text:'first '});h.runtime.registry.get('worker')!.publish({type:'note',text:'служебная заметка между частями ответа'});streaming.resolve();await last.promise;
  ctx.publish({type:'delta',text:'second'});ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:2,cacheRead:0}});return {text:'first second',sessionId:null}};
 const turn=h.runtime.runTurn('worker','started outside this window');await entered.promise;
 const setupNotes=(source.includes('carry')?1:0)+(source.includes('digest')?1:0);
 await until(()=>stream.frames.filter(e=>e.pane==='worker'&&e.type==='note').length===setupNotes);deliver();
 assert.ok(active.snapshot);assert.equal(view.H.cur.text,'');assert.match(view.functions.curHTML(),/w1/);assert.equal(busy.includes(false),false);
 const events=stream.frames.filter(e=>e.pane==='worker');assert.equal(events[0].type,'state');assert.equal(events[0].busy,true);assert.ok(events.slice(1).every(e=>e.type==='note'));
 const prompt=h.provider.calls.at(-1)!.message;if(source.includes('carry'))assert.match(prompt,/saved earlier conversation/);if(source.includes('digest'))assert.match(prompt,/готов: peer/);
 first.resolve();await streaming.promise;await until(()=>stream.frames.some(e=>e.text==='служебная заметка между частями ответа'));deliver();
 assert.strictEqual(view.H.cur,active.snapshot);assert.equal(view.H.cur.text,'first ');assert.match(view.functions.curHTML(),/w1/);assert.doesNotMatch(view.functions.curHTML(),/модель не сохранена/);assert.equal(busy.includes(false),false);
 const configured=await call(h.api,'/api/panes/worker',{body:{model:'w2'}});assert.equal(configured.body.appliesFrom,'next');await until(()=>stream.frames.some(e=>e.pane==='worker'&&e.type==='state'&&e.model==='w2'));deliver();
 assert.strictEqual(view.H.cur,active.snapshot);assert.equal(view.H.pane.model,'w2');assert.match(view.functions.curHTML(),/w1/);assert.doesNotMatch(view.functions.curHTML(),/w2/);
 last.resolve();await turn;await until(()=>stream.frames.some(e=>e.pane==='worker'&&e.type==='done'));deliver();
 assert.equal(view.H.cur,null);assert.equal(busy.at(-1),false);const replies=view.S.chat.filter((m:Data)=>m.src==='live');assert.equal(replies.length,1);assert.equal(replies[0].text,'first second');assert.equal(replies[0].model,'w1');assert.equal(view.S.chat.filter((m:Data)=>m.src==='sys').length,setupNotes+1);
});

test('129: note preserves an unknown start model; provider error still finishes the answer',()=>{
 const view=ui();view.functions.consumeState({pane:'worker',busy:true,status:'idle'});view.functions.hEvent({type:'delta',text:'partial'});const snapshot=view.H.cur;
 view.functions.hEvent({type:'note',text:'служебная заметка'});assert.strictEqual(view.H.cur,snapshot);assert.equal(view.H.cur.text,'partial');assert.match(view.functions.curHTML(),/модель не сохранена/);assert.equal(view.S.chat.filter((m:Data)=>m.src==='live').length,0);
 view.functions.hEvent({type:'error',code:'transport_lost',message:'связь потеряна'});assert.equal(view.H.cur,null);assert.equal(view.S.chat.filter((m:Data)=>m.src==='live').length,1);assert.equal(view.S.chat.at(-1).src,'err');assert.match(view.S.chat.at(-1).html,/связь потеряна/);
});

test('TS-08 r2/2: pending new-chat transition shares the setting wait and preserves a refused draft',async t=>{
 const h=await fixture(t),gate=deferred(),view=ui({fetch:async path=>{if(path==='/api/panes/worker'){await gate.promise;return {ok:false,error:'model setting denied'}}return (await call(h.api,path)).body}});
 view.S.pending={text:'pending question',target:view.functions.sendBinding()};const setting=view.functions.setSeat({model:'w2'},'Модель');await until(()=>view.requests.length===1);
 view.sandbox.hConnect=async()=>{};runInContext('globalThis.pendingSend='+part(live,'  hConnect().finally(',"  addEventListener('resize',()=>{ wireSearch();"),view.context);
 await immediate();assert.equal(view.requests.filter(r=>r.path==='/api/chat').length,0);gate.resolve();assert.equal(await setting,false);await (view.context as Data).pendingSend;
 assert.equal(h.provider.calls.length,0);assert.equal(view.S.draft,'pending question');assert.equal(view.S.chat.length,0);
});

test('new chat: text sent from the start screen is not restored into the composer after the answer',async()=>{
 const view=ui();view.sandbox.cols=()=>[];view.ta.value='first question';
 assert.equal(await view.functions.onSend('first question',view.ta),true);
 assert.equal(view.S.pending.text,'first question');assert.equal(view.S.draft,null);assert.equal(view.ta.value,'');assert.equal(view.sandbox.location.href,'01-chat.html');
});

test('TS-24c: paste and drop upload images in order and the composer sends their ids',async()=>{
 const refs=[imageRef('a'),imageRef('b')],view=ui({fetch:async path=>path==='/api/attachments'?refs[view.requests.filter(r=>r.path==='/api/attachments').length-1]!:{ok:true}}),composer=attachmentComposer(view);
 let pastePrevented=false;composer.inputListeners.paste({clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>imageFile(1)}]},preventDefault(){pastePrevented=true}});await until(()=>view.functions.attachmentState(composer.box).ready.length===1);assert.equal(pastePrevented,true);
 let dropPrevented=false;composer.boxListeners.drop({dataTransfer:{files:[imageFile(5)]},preventDefault(){dropPrevented=true}});await until(()=>view.functions.attachmentState(composer.box).ready.length===2);assert.equal(dropPrevented,true);assert.match(composer.host!.innerHTML,/2 из 8/);assert.equal(composer.host!.style.display,'block','proto.css hides .live-attachments by default; a strip with images must be shown explicitly');
 composer.ta.value='Сравни состояния';await composer.box.__cx.send();const chat=view.requests.find(r=>r.path==='/api/chat');assert.deepEqual(chat?.body?.attachments,refs.map(r=>r.id));assert.equal(chat?.body?.message,'Сравни состояния');assert.equal(view.functions.attachmentState(composer.box).ready.length,0);assert.equal(composer.ta.value,'');
});

test('TS-24c WINDOWS: a delayed upload cannot survive project A to B to A',async()=>{
 const gate=deferred<Data>(),ref=imageRef('9'),view=ui({fetch:async path=>path==='/api/attachments'?gate.promise:{ok:true}});view.H.confirmedProjectGeneration=1;view.functions.attachmentFiles([imageFile()]);await until(()=>view.requests.some(r=>r.path==='/api/attachments'));
 view.H.project='/project-b';view.H.confirmedProjectGeneration=2;view.functions.sendBinding();view.H.project='/project-a';view.H.confirmedProjectGeneration=3;view.functions.sendBinding();gate.resolve(ref);await until(()=>view.functions.attachmentState(null).invalid);
 const state=view.functions.attachmentState(null);assert.equal(state.ready.length,0);assert.match(state.local[0].error,/проект изменился/);assert.equal(view.requests.some(r=>r.path==='/api/chat'),false);
});

test('TS-24c: model capability, typed failure and chat switch keep the exact image draft',async()=>{
 const ref=imageRef('c');let fail=false;const view=ui({fetch:async path=>path==='/api/attachments'?ref:path==='/api/chat'&&fail?{ok:false,code:'attachment_not_found',error:'изображение исчезло'}:{ok:true}}),composer=attachmentComposer(view);view.functions.attachmentFiles([imageFile()]);await until(()=>view.functions.attachmentState(composer.box).ready.length===1);const keyA=view.functions.attachmentKey();
 view.H.active.worker='chat-b';view.functions.sendBinding();assert.equal(view.functions.attachmentState(composer.box).ready.length,0);view.H.active.worker='chat-a';view.functions.sendBinding();assert.equal(view.functions.attachmentKey(),keyA);assert.deepEqual(plain(view.functions.attachmentState(composer.box).ready),[ref]);
 view.H.models.claude[0].images=false;view.functions.attachmentDraw(composer.box);const before=view.requests.length;assert.match(composer.host!.innerHTML,/Эта модель не видит изображения — выберите другую или уберите картинку/);assert.equal(await view.functions.onSend('Посмотри',composer.ta),false);assert.equal(view.requests.length,before);assert.match(view.functions.attachmentState(composer.box).reason,/Эта модель не видит изображения/);assert.deepEqual(plain(view.functions.attachmentState(composer.box).ready),[ref]);
 view.H.models.claude[0].images=true;fail=true;composer.ta.value='Посмотри';assert.equal(await view.functions.onSend('Посмотри',composer.ta),false);const state=view.functions.attachmentState(composer.box);assert.deepEqual(plain(state.ready),[ref]);assert.match(state.fieldError,/не найдено/);assert.equal(composer.ta.value,'Посмотри');assert.equal(view.S.chat.some((m:Data)=>m.role==='me'),false);
});

test('TS-24c PATHS: an image-only message survives the direct-address confirmation',async()=>{
 const ref=imageRef('f');let chats=0;const view=ui({fetch:async path=>path==='/api/attachments'?ref:path==='/api/chat'&&++chats===1?{needDirect:true}:{ok:true}});view.functions.attachmentFiles([imageFile()]);await until(()=>view.functions.attachmentState(null).ready.length===1);view.ta.value='';assert.equal(await view.functions.onSend('',view.ta),false);assert.deepEqual(plain(view.functions.attachmentState(null).ready),[ref]);assert.equal(await view.direct()('on'),true);assert.equal(chats,2);assert.deepEqual(view.requests.filter(r=>r.path==='/api/chat').map(r=>r.body?.attachments),[[ref.id],[ref.id]]);assert.equal(view.functions.attachmentState(null).ready.length,0);
});

test('TS-24c: oversize and non-image upload errors stay in the field without a chat call',async()=>{
 const tooLarge=ui(),oversize={name:'huge.png',type:'image/png',size:10*1024*1024+1,arrayBuffer:async()=>new ArrayBuffer(0)};tooLarge.functions.attachmentFiles([oversize]);let state=tooLarge.functions.attachmentState(null);assert.equal(state.invalid,true);assert.equal(state.local[0].error,'больше 10 МБ');assert.equal(tooLarge.requests.length,0);
 const invalid=ui({fetch:async()=>({ok:false,code:'attachment_invalid',error:'bad'})});invalid.functions.attachmentFiles([imageFile()]);await until(()=>invalid.functions.attachmentState(null).invalid);state=invalid.functions.attachmentState(null);assert.equal(state.local[0].error,'не картинка');assert.equal(await invalid.functions.onSend('Текст',invalid.ta),false);assert.equal(invalid.requests.filter(r=>r.path==='/api/chat').length,0);
});

test('TS-24c: a new-chat transition carries images once and does not restore the sent draft',async()=>{
 const ref=imageRef('d'),view=ui({fetch:async path=>path==='/api/attachments'?ref:{ok:true}});view.functions.attachmentFiles([imageFile()]);await until(()=>view.functions.attachmentState(null).ready.length===1);view.sandbox.cols=()=>[];view.ta.value='Первый вопрос';assert.equal(await view.functions.onSend('Первый вопрос',view.ta),true);assert.deepEqual(plain(view.S.pending.attachments),[ref]);assert.equal(view.S.draft,null);assert.equal(view.ta.value,'');
 view.sandbox.cols=()=>[view.column];view.sandbox.hConnect=async()=>{};runInContext('globalThis.pendingSend='+part(live,'  hConnect().finally(',"  addEventListener('resize',()=>{ wireSearch();"),view.context);await (view.context as Data).pendingSend;
 const chat=view.requests.find(r=>r.path==='/api/chat');assert.deepEqual(chat?.body?.attachments,[ref.id]);assert.equal(view.S.pending,null);assert.equal(view.S.draft,null);assert.equal(view.functions.attachmentState(null).ready.length,0);
});

for(const change of ['chat','project'] as const)test('TS-24c: pending images return only to the original draft after '+change+' changes',async()=>{
 const ref=imageRef('e'),view=ui({fetch:async path=>path==='/api/attachments'?ref:{ok:true}});view.functions.attachmentFiles([imageFile()]);await until(()=>view.functions.attachmentState(null).ready.length===1);const original=view.functions.attachmentKey();view.sandbox.cols=()=>[];view.ta.value='Исходное сообщение';assert.equal(await view.functions.onSend(view.ta.value,view.ta),true);
 if(change==='chat')view.H.active.worker='chat-b';else{view.H.project='/project-b';view.H.confirmedProjectGeneration=2}view.functions.sendBinding();const target=view.functions.attachmentKey();assert.notEqual(target,original);view.sandbox.cols=()=>[view.column];view.sandbox.hConnect=async()=>{};runInContext('globalThis.pendingSend='+part(live,'  hConnect().finally(',"  addEventListener('resize',()=>{ wireSearch();"),view.context);await (view.context as Data).pendingSend;
 assert.equal(view.requests.some(r=>r.path==='/api/chat'),false);assert.equal(view.S.draft,'Исходное сообщение');assert.equal(view.functions.attachmentRefs(target).length,0);assert.deepEqual(plain(view.functions.attachmentRefs(original)),[ref]);
});

test('TS-24c: pending text and images return to their original draft after capability refusal',async()=>{
 const ref=imageRef('7'),view=ui({fetch:async path=>path==='/api/attachments'?ref:{ok:true}});view.functions.attachmentFiles([imageFile()]);await until(()=>view.functions.attachmentState(null).ready.length===1);const original=view.functions.attachmentKey();view.sandbox.cols=()=>[];view.ta.value='Исходное сообщение';assert.equal(await view.functions.onSend(view.ta.value,view.ta),true);view.H.models.claude[0].images=false;view.sandbox.cols=()=>[view.column];view.sandbox.hConnect=async()=>{};runInContext('globalThis.pendingSend='+part(live,'  hConnect().finally(',"  addEventListener('resize',()=>{ wireSearch();"),view.context);await (view.context as Data).pendingSend;
 assert.equal(view.requests.some(r=>r.path==='/api/chat'),false);assert.equal(view.S.draft,'Исходное сообщение');assert.deepEqual(plain(view.functions.attachmentRefs(original)),[ref]);
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
 const view=ui(),title={textContent:'Автопилот'},get=view.sandbox.document.getElementById;view.sandbox.document.getElementById=(id:string)=>id==='jrows'?null:get(id);view.sandbox.document.querySelector=(selector:string)=>selector==='.frame .top > b'?title:null;
 const journal=view.journal();journal.reset('/new-project');assert.equal(title.textContent,'Автопилот');assert.equal(view.requests.length,0);
});

test('78/106: arrows never switch projects; state is keyed by full path and survives redraw/restart',async()=>{
 const view=ui(),sidebar=view.sidebar(),a={path:'/first/same',name:'same',current:true},b={path:'/second/same',name:'same',current:false};view.H.projects=[a,b];
 assert.equal(sidebar.expanded(a),true);assert.equal(sidebar.expanded(b),false);let opened='';view.sandbox.sideSwitchProject=async(path:string)=>{opened=path};
 function click(target:Data){return view.clicks.at(-1)!({target:{closest:(selector:string)=>selector==='[data-folder-toggle]'&&target.toggle?{dataset:{folderToggle:target.path}}:selector==='.ps-folder[data-folder]'&&!target.toggle?{dataset:{folder:target.path,cur:'1'}}:null},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}})}
 await click({toggle:true,path:a.path});assert.equal(opened,'');assert.equal(sidebar.expanded(a),false);assert.match(sidebar.folder(a,'own docs','own chats',()=>''),/display:none/);
 await click({toggle:true,path:b.path});assert.equal(opened,'');const other=sidebar.folder(b,'foreign docs','foreign chats',()=>'' );assert.match(other,/Откройте проект, чтобы увидеть его чаты/);assert.doesNotMatch(other,/foreign docs|foreign chats/);
 const restarted=ui({storage:view.storage}),next=restarted.sidebar();assert.equal(next.expanded(a),false);assert.equal(next.expanded(b),true);await click({path:a.path});assert.equal(opened,a.path);
});

test('TS-38.1: profile entry opens the Autopilot master and submits typed conditions',()=>{
 const listeners:((e:Data)=>void)[]=[],location={href:''};let reopened=0;const document={addEventListener(_t:string,fn:(e:Data)=>void){listeners.push(fn)},getElementById:()=>({click(){reopened++}})};
 const context=createContext({document,location,KEY:'chat',PAGES:{away:'18-overlays.html'},window:{}});runInContext(part(proto,"  document.addEventListener('click',e=>{const menuButton=","  document.addEventListener('click',e=>{if(!e.target.closest('.ps-foot'))"),context);
 const target={closest:(selector:string)=>selector==='aside.side'?{}:selector==='[data-go]'?{dataset:{go:'away'}}:null};
 for(const side of ['wide','rail']){listeners[0]!({target,preventDefault(){},stopPropagation(){}});assert.equal(location.href,'18-overlays.html#leave',side)}
 (context as Data).KEY='away';listeners[0]!({target,preventDefault(){},stopPropagation(){}});assert.equal(reopened,1);
 const templates:string[]=[];runInContext(part(away,"  HX.bind('#leave'",'  // ── Показать окно'),createContext({HX:{bind(_s:string,fn:()=>string){templates.push(fn())}},blk:(_label:string,html:string)=>html,kv:()=>''}));
 assert.match(proto,/class="it ap" data-go="away" href="18-overlays\.html#leave"/);
 assert.match(templates[0]!,/до утра · 07:00/);assert.match(templates[0]!,/до ответа/);
 assert.match(templates[0]!,/data-autopilot-on/);assert.match(templates[0]!,/data-autopilot-off/);assert.match(templates[0]!,/data-autopilot-cap/);assert.doesNotMatch(templates[0]!,/<button[^>]+disabled[^>]*>Включить Автопилот<\/button>/);
 assert.match(live,/api\('\/api\/autopilot',body\)/);assert.match(live,/status\?\.trace\?\.instanceId/);
 assert.match(proto,/PAGES\[k\]\+\(k==='away'\?'#leave':''\)/);assert.doesNotMatch(away,/<div class="comp"|<div class="col"><div class="me"/);
 const view=ui();view.S.away={deputy:'fake'};
 const cleaned=createContext({KEY:'k',localStorage:{getItem:()=>JSON.stringify({...view.S,v:1})}});runInContext(part(live,'  let S;','  const now=')+'load();globalThis.cleaned=S;',cleaned);assert.equal(Object.hasOwn((cleaned as Data).cleaned,'away'),false);
});

test('TS-42: orchestrator chat shows engine conditions and retains the same master',()=>{
 const view=ui(),d=dom('<div class="frame cur"><div class="main"><div class="feed"><div class="col"></div></div></div></div>');view.sandbox.document=d.document;
 view.H.liveStatus={autopilot:{on:false,conditions:{operations:['answer_question'],stopCases:['payment'],maxSpendPercent:3}}};view.functions.chatGuidanceDraw();const card=d.document.querySelector('[data-autopilot-guidance]');assert.ok(card);
 assert.match(card.textContent,/Автопилот выключен.*ответы на вопросы.*деньги и оплата.*3 %/);assert.equal(card.querySelector('a')?.getAttribute('href'),'18-overlays.html#leave');
 assert.equal(view.requests.length,0);assert.doesNotMatch(d.body.innerHTML,/автопилот · до 07:00|Автопилот решил/);
 view.H.snapshotOnly=true;view.functions.chatGuidanceDraw();assert.equal(d.document.querySelector('[data-autopilot-guidance]'),null);
});



// Delayed status used to expose the original OMG sketch on every full-page navigation.
function firstPaint(html:string,storage=new Map<string,string>(),page='chat'){
 const view=ui({fetch:async path=>path==='/api/status'?await status.promise:path==='/api/chats'?{chats:[{id:'c-real',pane:'worker',title:'Настоящий разговор',messages:1,active:true}],active:{worker:'c-real'}}:path==='/api/projects'?{projects:[{path:'/real/project',name:'project',current:true,seats:1}],current:'/real/project'}:path==='/api/pins'?{pins:[]}:{messages:[]}}),status=deferred<Data>();
 const attrs=new Map<string,string>(),timers=new Map<number,{fn:()=>void;ms:number}>(),nodes=new Map<string,Data>();let timerId=0;
 const node=()=>({dataset:{},style:{},innerHTML:'',textContent:'',setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],classList:{toggle(){}},appendChild(){},remove(){nodes.delete('live-boot-state')}});
 const side=node(),folders=node(),project=node(),head=node();head.textContent='Оркестратор · OMG';
 const root={dataset:{page:''},hasAttribute:(a:string)=>attrs.has(a),setAttribute:(a:string,v:string)=>attrs.set(a,v),removeAttribute:(a:string)=>attrs.delete(a)};
 Object.assign(view.sandbox.document,{documentElement:root,getElementById:(id:string)=>nodes.get(id)||null,createElement:node,body:{appendChild(el:Data){nodes.set(el.id,el)}}});
 const original=view.sandbox.document.querySelectorAll;
 view.sandbox.document.querySelectorAll=(q:string)=>q==='aside.side.ps'?[side]:q==='aside.side.ps .ps-folders'?[folders]:q==='aside.side.ps .ps-proj:not(.ps2-prow)'?[project]:q==='.frame .top > b'?[head]:original(q);
 Object.assign(view.sandbox,{setTimeout:(fn:()=>void,ms:number)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:(id:number)=>timers.delete(id),sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)},badges(){},limitsDraw(){},firstSelectPane(){},firstDraw(){},EventSource:class {close(){}},nowLive(){},journalLive(){},journalFetch:async()=>{},SP:{generation:0},JR:{epoch:0},base:(path:string)=>path.split('/').pop(),PROJ_ITEMS:[],PIN:'',PAGE:page});
 view.sandbox.window=view.sandbox;view.sandbox.psKey=page;view.sandbox.location.pathname='/sketches/proto/'+(runInContext('('+proto.match(/const PAGES=(\{[^;]+\})/)![1]+')',createContext({})) as Data)[page];view.H.on=false;view.H.panes=[];view.H.project=undefined;view.H.pane=null;
 const first=html.match(/<head>\s*<script>([\s\S]*?)<\/script>/);assert.ok(first,'first head script precedes styles and all frames');runInContext(first[1]!,view.context);
 runInContext(part(live,'  function applyStatus(','  // лента активного чата')+
  part(live,'  // TS-12: one project-bound transport','  // End TS-12 shared events.')+
  part(live,'  async function hConnect(','  // ── чат: настоящее')+
  part(live,'  const PROJECT_FOLD_KEY=','  async function openChatRow(')+
  part(live,'  function restoreLiveSnapshot(','  // End TS-11 snapshot.')+
  part(live,'  // TS-09a.1: one lifecycle','  // End TS-09a.1 page lifecycle.')+
  '\nglobalThis.paint={restore:restoreLiveSnapshot,connect:hConnect,refresh:refreshStatus,apply:applyStatus,ready:liveFirstPaint,remember:rememberLive};',view.context);
 return {...view,root,attrs,timers,nodes,side,folders,project,head,status,storage,boot:view.sandbox.HARNESS_BOOT,paint:view.sandbox.paint,
  demoVisible:()=>!attrs.has('data-live-pending')&&!attrs.has('data-live-unavailable'),deadline(){for(const [id,timer] of timers)if(timer.ms===1500){timers.delete(id);timer.fn()}}};
}
const realStatus=()=>({project:'/real/project',panes:[{id:'worker',label:'Настоящий оркестратор',model:'w1',vendor:'claude',role:'orchestrator',kind:'orchestrator',busy:false}],activeChats:{worker:'c-real'},models:{},auth:{token:'must-not-cache'}});

function historyDOM(v:ReturnType<typeof firstPaint>,html='<div class="frame"><div class="main"><div class="top"><b>Project A</b><span class="st"></span></div><div class="feed"><div class="col"></div></div></div></div>'){
 const d=dom(html),all=v.sandbox.document.querySelectorAll,one=v.sandbox.document.querySelector;
 v.sandbox.document.createElement=d.document.createElement.bind(d.document);
 v.sandbox.document.querySelectorAll=(q:string)=>['.feed .col','.feed','.frame .top > b','.frame .top .st'].includes(q)?d.document.querySelectorAll(q):all(q);
 v.sandbox.document.querySelector=(q:string)=>d.document.querySelector(q)||one(q);
 v.sandbox.cols=()=>d.document.querySelectorAll('.feed .col');v.sandbox.selBar=()=>{};
 runInContext(part(live,'  const paneName=','  function pickMenu(')+part(live,'  function render(){',"  document.addEventListener('click',e=>{ if(e.target.closest('a[data-demo]'))"),v.context);
 return d;
}

test('141–143: every PROTO_PAGES page hides demo before delayed status; success paints real project, offline is labelled',async()=>{
 const directory=new URL('sketches/proto/',site);
 const build=readFileSync(new URL('../../../ui/deploy/build.py',import.meta.url),'utf8');
 const pages=builtProtoPages(build);
 assert.equal(pages.length,33);assert.ok(pages.includes('44-inbox'));assert.ok(readdirSync(directory).includes('01-chat.html'));assert.ok(readdirSync(directory).includes('41-team-constructor.html'));assert.ok(readdirSync(directory).includes('38-project-result.html'));
 const css=readFileSync(new URL('../../../ui/deploy/proto.css',import.meta.url),'utf8');assert.match(css,/html\[data-live-pending\] \[data-demo\]\{visibility:hidden!important\}/);
 for(const page of pages){
  const html=readFileSync(new URL(page+'.html',directory),'utf8'),frames=html.match(/<div class="frame[^"]*"[^>]*>/g)||[];
  assert.ok(frames.length,page);assert.ok(frames.every(tag=>/data-demo(?:[ >])/.test(tag)),page+': all frames marked before scripts');
  const mapping=runInContext('('+proto.match(/const PAGES=(\{[^;]+\})/)![1]+')',createContext({})) as Data,key=Object.keys(mapping).find(key=>mapping[key]===page+'.html')||(/^(?:2[89]|3[0-8])-/.test(page)?'path':'');
  if(key==='path'){assert.match(html,/path\.css\?v=/,page);assert.match(html,/path\.js\?v=/,page);assert.match(html,/sidebar-v2\.css\?v=/,page);assert.match(html,/<html lang="ru" data-proto class="ps2-root">/,page)}
  const v=firstPaint(html,new Map(),key);assert.equal(v.demoVisible(),false,page);assert.equal(v.paint.restore(),false);
  const connecting=v.paint.connect().finally(()=>{v.sandbox.render();v.paint.ready()});await until(()=>v.requests.some(r=>r.path==='/api/status'));
  assert.equal(v.demoVisible(),false,page+': waiting for status');v.status.resolve(realStatus());await connecting;
  assert.equal(v.demoVisible(),true,page);assert.match(v.project.innerHTML,/project/);assert.match(v.folders.innerHTML,/Настоящий оркестратор/);assert.doesNotMatch(v.folders.innerHTML,/OMG|H1\.5/);
  assert.equal(v.attrs.has('data-live-mock'),false);assert.equal(v.nodes.has('live-boot-state'),false);
  assert.doesNotMatch(v.storage.get('harnessy-live-snapshot-v1')!,/must-not-cache/);
  const offline=firstPaint(html,new Map(),key);offline.deadline();assert.equal(offline.demoVisible(),false,page);assert.match(offline.nodes.get('live-boot-state')!.textContent,/Движок недоступен/);
  // TS-43: late recovery removes the unavailable label; merely connecting and leaving /api/chats pending must not fall back to a mock.
  const recovered=offline.paint.connect().finally(()=>offline.paint.ready());offline.status.resolve(realStatus());await recovered;assert.equal(offline.attrs.has('data-live-mock'),false);
 }
 const inboxHtml=readFileSync(new URL('44-inbox.html',directory),'utf8'),inboxScript=readFileSync(new URL('inbox.js',directory),'utf8');
 assert.match(inboxHtml,/<script src="inbox\.js\?v=[0-9a-f]+"><\/script>/);assert.ok(inboxHtml.indexOf('<script src="live.js?')<inboxHtml.indexOf('<script src="inbox.js?'));
 const d=dom(inboxHtml.slice(inboxHtml.indexOf('<body>')+6,inboxHtml.lastIndexOf('</body>')));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','inbox');
 const id='e'.repeat(64),project='/built-project',row={version:1,project,at:new Date().toISOString(),entry:{state:'applied',decisionId:id,operation:'stop_pane',receipt:{result:{},effectVersion:'attempt:4'},question:{id:'waiting:1',kind:'waiting',text:'Ход не ответил'},proposal:{answer:null,reason:'Консилиум подтвердил остановку'},council:{orchestrator:{seat:'lead',model:'w1'},reviewer:{seat:'review',model:'w2'}},cost:{currency:'USD',amount:0.03,status:'measured'}}};
 const H={on:false,snapshotOnly:false,project,confirmedProjectGeneration:1,active:{}},api=async(path:string)=>path==='/api/status'?{project,approvals:[],panes:[]}:path==='/api/journal?limit=0'?{project,records:[]}:path==='/api/chats'?{chats:[]}:path.startsWith('/api/trace?')?{ok:true,project,records:[]}:path==='/api/limits'?{ok:true,project,providers:[]}:path==='/api/autopilot/decisions'?{ok:true,project,decisions:[row]}:path==='/api/settings'?{ok:true,owner:{}}:Promise.reject(Error('unexpected '+path));
 const sandbox:Data={window:null,document:d.document,location:{href:''},setTimeout(){},clearTimeout(){},Date,Set,Map,Number,Array,JSON,Promise,encodeURIComponent,CustomEvent:class{},dispatchEvent(){},addEventListener:d.window.addEventListener.bind(d.window),LIVE:{H,S:{ui:{}},api,esc:(value:unknown)=>String(value??''),subscribeLiveEvents:()=>({})}};sandbox.window=sandbox;
 runInContext(inboxScript,createContext(sandbox));H.on=true;await sandbox.HARNESS_INBOX.refresh();
 assert.match(d.document.querySelector('[data-inbox-feed]')!.textContent,/Автопилот решил: Остановить ход/);assert.match(d.document.querySelector('[data-inbox-feed]')!.textContent,/Консилиум подтвердил остановку/);
 assert.match(d.document.querySelector('[data-inbox-feed]')!.innerHTML,/data-inbox-action="cancel"/);
 (row as any).cancellation={state:'partial',effectVersion:'attempt:4',code:'cancel_partial',reason:'Ход остановлен; изменения не откатились',nextStep:'Проверьте проект',result:{}};
 await sandbox.HARNESS_INBOX.refresh();assert.match(d.document.querySelector('[data-inbox-feed]')!.textContent,/Ход остановлен; изменения не откатились/);
 assert.doesNotMatch(d.document.querySelector('[data-inbox-feed]')!.innerHTML,/data-inbox-action="cancel"/);
});

test('142: cached status and chat list render before HTTP; wrong project, corrupt or absent snapshot never renders',async()=>{
 const html=readFileSync(new URL('sketches/proto/01-chat.html',site),'utf8'),original=firstPaint(html);
 original.boot.save(realStatus(),[{id:'c-real',pane:'worker',title:'Сохранённый разговор',messages:1,active:true}],[{path:'/real/project',name:'project',current:true,seats:1}],[]);
 const restored=firstPaint(html,original.storage);restored.S.chat=[{text:'foreign conversation'}];restored.S.ui.openChat='c-real';
 assert.equal(restored.paint.restore(),true);assert.equal(restored.requests.length,0,'snapshot preview must not open a chat or call a model');assert.equal((await restored.functions.api('/api/chat',{pane:'worker',message:'keyboard send while pending'})).code,'live_pending');assert.equal(restored.requests.length,0,'preview is read-only even through keyboard or secondary controls');
 assert.equal(restored.H.project,'/real/project');assert.equal(restored.H.active.worker,'c-real');assert.equal(restored.S.chat.length,0);assert.match(restored.project.innerHTML,/project/);assert.match(restored.folders.innerHTML,/Сохранённый разговор/);
 assert.equal(restored.attrs.has('data-live-pending'),true,'demo remains hidden while only the genuine sidebar is previewed');assert.equal(restored.attrs.has('data-live-preview'),true);
 delete restored.S.ui.openChat;const connect=restored.paint.connect().finally(()=>restored.paint.ready());assert.equal(restored.demoVisible(),false);restored.status.resolve(realStatus());await connect;assert.equal(restored.demoVisible(),true);
 const snapshot=original.storage.get('harnessy-live-snapshot-v1')!;
 for(const candidate of [null,'{bad',JSON.stringify({...JSON.parse(snapshot),project:'/foreign'}),JSON.stringify({...JSON.parse(snapshot),chats:[null]}),JSON.stringify({...JSON.parse(snapshot),projects:[null]}),JSON.stringify({...JSON.parse(snapshot),pins:[null]}),JSON.stringify({...JSON.parse(snapshot),status:{...realStatus(),models:'invalid'}})]){
  const storage=new Map(original.storage);if(candidate===null)storage.delete('harnessy-live-snapshot-v1');else storage.set('harnessy-live-snapshot-v1',candidate);
  const bad=firstPaint(html,storage);assert.equal(bad.paint.restore(),false);assert.equal(bad.H.on,false);assert.equal(bad.folders.innerHTML,'');assert.equal(bad.demoVisible(),false);
 }
 original.boot.select('/different-project');original.boot.save(realStatus(),[],[],[]);assert.equal(original.storage.get('harnessy-live-project-v1'),'/different-project','late old-project data cannot undo an accepted switch');assert.equal(original.boot.confirm('/real/project',original.boot.capture()),false);assert.equal(original.boot.confirm('/different-project',original.boot.capture()),true);const switched=firstPaint(html,original.storage);assert.equal(switched.paint.restore(),false,'accepted project switch invalidates the old preview before a new status arrives');
 assert.doesNotMatch(cx,/folder:'OMG'|c\.folder\|\|'OMG'/);
});


test('141: offline deadline before body parsing waits to attach its label; accepted live data cancels deferred unavailable captions',()=>{
 const html=readFileSync(new URL('sketches/proto/01-chat.html',site),'utf8');
 for(const recovered of [false,true]){
  const v=firstPaint(html),document=v.sandbox.document,body=document.body;let loaded!:()=>void;document.body=null;document.addEventListener=(kind:string,fn:()=>void)=>{if(kind==='DOMContentLoaded')loaded=fn};
  assert.doesNotThrow(()=>v.deadline());assert.ok(loaded);if(recovered)v.boot.ready();document.body=body;loaded();
  if(recovered)assert.equal(v.nodes.has('live-boot-state'),false);else assert.match(v.nodes.get('live-boot-state')!.textContent,/Движок недоступен/);
 }
});


test('142: cold cached journal executes the real startup after journal/Now state initialization, without model or chat mutations',async()=>{
 const html=readFileSync(new URL('sketches/proto/21-journal.html',site),'utf8'),seed=firstPaint(html);seed.boot.save(realStatus(),[{id:'c-real',pane:'worker',messages:1,title:'cached',active:true}],[{path:'/real/project',name:'project',current:true}],[]);
 const v=firstPaint(html,seed.storage,'log');Object.assign(v.sandbox,{stop(){},openPal(){},selStart(){},laMenu(){},laPath(){},laMulti(){},operationsDraw(){},operationAttention(){return false},restoreUI(){},wireSearch(){},refresh(){}});
 const tail=live.slice(live.indexOf('  function restoreLiveSnapshot('),live.lastIndexOf('})();'));
 assert.doesNotThrow(()=>runInContext(tail,v.context));assert.equal(v.H.snapshotOnly,true);assert.equal(v.H.project,'/real/project');assert.deepEqual(v.requests.map(r=>r.path),['/api/status']);
 v.status.resolve(realStatus());await immediate();assert.equal(v.attrs.has('data-live-pending'),false);assert.equal(v.H.connected,true);assert.equal(v.requests.some(r=>r.path==='/api/onboard'||r.path==='/api/chats/open'||r.path==='/api/chat'),false);
});

const bootHtml='<head><script>'+proto.split('/* LIVE_BOOT_END */')[0]+'</script></head>';
const projectStatus=(project:string,label:string)=>({...realStatus(),project,panes:[{...realStatus().panes[0]!,label}]});
for(const older of ['refresh','connect'])for(const newer of ['refresh','connect'])test('TS-11 r2: late '+older+' cannot undo confirmed project from '+newer,async()=>{
 const v=firstPaint(bootHtml,new Map(),'set'),old=deferred<Data>(),next=deferred<Data>();let calls=0;
 v.paint.apply(projectStatus('/project-a','initial A'),v.boot.capture(),true);v.paint.remember();
 const fetch=v.sandbox.fetch;v.sandbox.fetch=async(path:string)=>path==='/api/status'?{json:()=>++calls===1?old.promise:next.promise}:fetch(path);
 const pending=v.paint[older]();v.boot.select('/project-b');const current=v.paint[newer]();
 next.resolve(projectStatus('/project-b','current B'));await current;v.paint.remember();const saved=v.storage.get('harnessy-live-snapshot-v1'),requests=v.requests.length;
 assert.equal(v.H.project,'/project-b');assert.equal(v.H.panes[0].label,'current B');
 old.resolve(projectStatus('/project-a','late A'));await pending;
 assert.equal(v.H.project,'/project-b');assert.equal(v.H.liveStatus.project,'/project-b');assert.equal(v.H.panes[0].label,'current B');assert.equal(v.H.on,true);assert.equal(v.H.snapshotOnly,false);
 assert.equal(v.storage.get('harnessy-live-project-v1'),'/project-b');assert.equal(v.storage.get('harnessy-live-snapshot-v1'),saved);assert.equal(v.boot.snapshot().project,'/project-b');assert.equal(v.requests.length,requests,'rejected status cannot refresh chats or save an old snapshot');
});

for(const reader of ['refresh','connect'])test('TS-11 r2: '+reader+' rejects a pre-switch response after A → B → A, including the saved snapshot',async()=>{
 const v=firstPaint(bootHtml,new Map(),'set'),gates=[deferred<Data>(),deferred<Data>(),deferred<Data>()];let calls=0;
 v.paint.apply(projectStatus('/project-a','initial A'),v.boot.capture(),true);
 const fetch=v.sandbox.fetch;v.sandbox.fetch=async(path:string)=>path==='/api/status'?{json:()=>gates[calls++]!.promise}:fetch(path);
 const old=v.paint[reader]();v.boot.select('/project-b');const b=v.paint[reader]();gates[1]!.resolve(projectStatus('/project-b','B'));await b;
 v.boot.select('/project-a');const a=v.paint[reader]();gates[2]!.resolve(projectStatus('/project-a','new A'));await a;v.paint.remember();const saved=v.storage.get('harnessy-live-snapshot-v1');
 gates[0]!.resolve(projectStatus('/project-a','obsolete A'));await old;
 assert.equal(v.H.project,'/project-a');assert.equal(v.H.panes[0].label,'new A');assert.equal(v.storage.get('harnessy-live-project-v1'),'/project-a');assert.equal(v.storage.get('harnessy-live-snapshot-v1'),saved);assert.equal(v.boot.snapshot().status.panes[0].label,'new A');
});

test('TS-11 r2: request order protects a changed status from another window; missing or invalid request cannot apply',async()=>{
 const v=firstPaint(bootHtml,new Map(),'set'),old=deferred<Data>(),next=deferred<Data>();let calls=0;
 v.paint.apply(projectStatus('/project-a','A'),v.boot.capture(),true);
 const fetch=v.sandbox.fetch;v.sandbox.fetch=async(path:string)=>path==='/api/status'?{json:()=>++calls===1?old.promise:next.promise}:fetch(path);
 const pending=v.paint.refresh(),current=v.paint.refresh();next.resolve(projectStatus('/project-b','external B'));await current;v.paint.remember();const saved=v.storage.get('harnessy-live-snapshot-v1');
 old.resolve(projectStatus('/project-a','old external A'));await pending;
 for(const token of [undefined,null,{}, {generation:0,request:NaN},{generation:0,request:999}])assert.equal(v.paint.apply(projectStatus('/forged','forged'),token),false);
 assert.equal(v.H.project,'/project-b');assert.equal(v.storage.get('harnessy-live-project-v1'),'/project-b');assert.equal(v.storage.get('harnessy-live-snapshot-v1'),saved);
});

test('TS-11 r2: rejected startup response leaves a cached preview read-only until a current status arrives',async()=>{
 const seed=firstPaint(bootHtml);seed.boot.save(realStatus(),[],[],[]);const v=firstPaint(bootHtml,seed.storage,'set'),gate=deferred<Data>();
 assert.equal(v.paint.restore(),true);v.sandbox.fetch=async(path:string)=>({json:()=>path==='/api/status'?gate.promise:Promise.resolve({chats:[]})});
 const old=v.paint.connect();v.boot.select('/next-project');gate.resolve(realStatus());await old;
 assert.equal(v.H.project,'/real/project');assert.equal(v.H.snapshotOnly,true);assert.equal(v.H.connected,undefined);assert.equal(v.storage.get('harnessy-live-project-v1'),'/next-project');
 const before=v.requests.length;assert.equal((await v.functions.api('/api/chat',{message:'keep preview read-only'})).code,'live_pending');assert.equal(v.requests.length,before);
});

test('152: all PROTO_PAGES share history return, invalidate old bindings/status, and confirm before accepting writes',async()=>{
 const build=readFileSync(new URL('../../../ui/deploy/build.py',import.meta.url),'utf8'),pages=builtProtoPages(build);
 const mapping=runInContext('('+proto.match(/const PAGES=(\{[^;]+\})/)![1]+')',createContext({})) as Data;assert.equal(pages.length,33);assert.ok(pages.includes('44-inbox'));assert.ok(pages.includes('41-team-constructor'));assert.ok(pages.includes('41-team-queue'));
 for(const page of pages){
  const html=readFileSync(new URL('sketches/proto/'+page+'.html',site),'utf8'),key=Object.keys(mapping).find(k=>mapping[k]===page+'.html')||(/^(?:2[89]|3[0-8])-/.test(page)?'path':''),v=firstPaint(html,new Map(),key);
  const body=html.match(/<body[^>]*>([\s\S]*?)<script\b/)![1]!,d=historyDOM(v,body),columns=d.document.querySelectorAll('.feed .col');
  v.paint.apply(realStatus(),v.boot.capture(),true);await immediate();v.S.chat=[{role:'ai',src:'live',text:'CACHED ANSWER FROM A',html:'CACHED ANSWER FROM A'}];for(const column of columns)column.innerHTML='<div class="ai live-msg">CACHED ANSWER FROM A</div>';
  v.S.ui.openChat='old-pinned-chat';v.S.pending={text:'unsent draft from A'};v.H.cur={text:'OLD STREAM',tools:[]};v.H.asks={old:{text:'OLD QUESTION'}};
  const old=v.boot.capture(),binding=v.functions.sendBinding(),gate=deferred<Data>(),fetch=v.sandbox.fetch;
  v.sandbox.onboardOnce=async()=>{throw Error('history return must not onboard')};
  v.sandbox.fetch=async(path:string)=>{if(['/api/status','/api/chats','/api/chats/chat-b'].includes(path)){v.requests.push({path,body:undefined});return {json:()=>path==='/api/status'?gate.promise:Promise.resolve(path==='/api/chats'?{chats:[{id:'chat-b',pane:'worker',title:'B',messages:2,active:true}],active:{worker:'chat-b'}}:{messages:[{role:'me',text:'QUESTION FROM B'},{role:'ai',text:'ANSWER FROM B',model:'w1'}]})}}return fetch(path)};
  v.hidePage();const before=v.requests.length;await v.showPage({persisted:false});assert.equal(v.requests.length,before,page+': ordinary pageshow is not a restore');
  const resumed=v.showPage({persisted:true});assert.equal(v.requests.at(-1)!.path,'/api/status');assert.equal(v.H.snapshotOnly,true,page);assert.equal(v.functions.bindingCurrent(binding),false,page);assert.equal(v.boot.current(old),false,page);
  assert.equal(v.H.cur,null,page);assert.equal(Object.keys(v.H.asks).length,0,page);assert.equal(v.S.pending,null,page);assert.equal(v.S.draft,'unsent draft from A',page);assert.equal(v.S.ui.openChat,null,page);for(const column of columns)assert.doesNotMatch(column.textContent,/CACHED ANSWER FROM A|OLD STREAM|OLD QUESTION/,page);
  assert.equal((await v.functions.api('/api/chat',{message:'must wait for confirmation'})).code,'live_pending',page);
  gate.resolve({...projectStatus('/returned/'+page,'Returned '+page),activeChats:{worker:'chat-b'}});await resumed;await immediate();
  assert.equal(v.H.project,'/returned/'+page,page);assert.equal(v.H.snapshotOnly,false,page);assert.equal(v.storage.get('harnessy-live-project-v1'),'/returned/'+page,page);assert.equal(v.attrs.has('data-live-preview'),false,page);
  assert.equal(v.paint.apply(projectStatus('/real/project','OLD'),old),false,page);assert.equal(v.requests.some(r=>r.body),false,page+': history return cannot post or call a model');
  assert.equal(v.requests.some(r=>r.path==='/api/chats/chat-b'),columns.length>0,page+': read history exactly where a feed is displayed');
  for(const column of columns){assert.match(column.querySelectorAll('.live-msg').map(m=>m.textContent).join('\n'),/QUESTION FROM B[\s\S]*ANSWER FROM B/,page);assert.doesNotMatch(column.textContent,/CACHED ANSWER FROM A|OLD STREAM|OLD QUESTION/,page)}
 }
});

for(const reader of ['refresh','connect'])test('152: late '+reader+' status from a hidden page cannot undo its resumed project',async()=>{
 const v=firstPaint(bootHtml,new Map(),'set'),old=deferred<Data>(),fresh=deferred<Data>();let calls=0;v.paint.apply(projectStatus('/project-a','A'),v.boot.capture(),true);
 const fetch=v.sandbox.fetch;v.sandbox.fetch=async(path:string)=>path==='/api/status'?{json:()=>++calls===1?old.promise:fresh.promise}:fetch(path);
 const pending=v.paint[reader]();v.hidePage();const restored=v.showPage({persisted:true});fresh.resolve(projectStatus('/project-b','B'));await restored;
 old.resolve(projectStatus('/project-a','OLD A'));await pending;
 assert.equal(v.H.project,'/project-b');assert.equal(v.H.panes[0].label,'B');assert.equal(v.storage.get('harnessy-live-project-v1'),'/project-b');assert.equal(v.H.snapshotOnly,false);
});

test('TS-09a.1 r2: real HTTP return replaces project A feed with B history and rejects an old history response',async t=>{
 const h=await fixture(t),v=firstPaint(bootHtml,new Map(),'chat'),d=historyDOM(v);let answer='ANSWER FROM A';
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:answer,sessionId:null}};
 await h.runtime.runTurn('worker','question A');const a=(await call(h.api,'/api/status')).body,oldPath='/api/chats/'+a.activeChats.worker;
 const oldGate=deferred(),newGate=deferred(),oldEntered=deferred(),newEntered=deferred();let holdOld=false,newPath='';t.after(()=>{oldGate.resolve();newGate.resolve()});
 v.sandbox.fetch=async(path:string,options?:{body:string})=>{const body=options?.body?JSON.parse(options.body):undefined;v.requests.push({path,body});const result=(await call(h.api,path,body?{body}:{})).body;
  if(path===oldPath&&holdOld){oldEntered.resolve();await oldGate.promise}if(path===newPath){newEntered.resolve();await newGate.promise}return {json:async()=>result}};
 runInContext(part(live,'  // лента активного чата','  // подключение к движку'),v.context);
 v.paint.apply(a,v.boot.capture(),true);await v.functions.loadChat({onboard:false});assert.match(d.document.querySelector('.feed')!.textContent,/ANSWER FROM A/);
 holdOld=true;const pending=v.functions.loadChat({onboard:false});await oldEntered.promise;v.hidePage();
 const b=join(h.dir,'project-b');mkdirSync(join(b,'.harness'),{recursive:true});writeFileSync(join(b,'.harness','team.yaml'),readFileSync(join(h.dir,'.harness','team.yaml')));
 assert.equal((await call(h.api,'/api/project',{body:{path:b}})).body.ok,true);answer='ANSWER FROM B';await h.runtime.runTurn('worker','question B');const status=(await call(h.api,'/api/status')).body;newPath='/api/chats/'+status.activeChats.worker;
 const calls=h.provider.calls.length,seq=h.runtime.journal.lastSeq,start=v.requests.length,restored=v.showPage({persisted:true});await newEntered.promise;
 assert.equal(v.H.project,b);assert.equal(v.H.active.worker,status.activeChats.worker);assert.doesNotMatch(d.document.querySelector('.feed')!.textContent,/ANSWER FROM A|ANSWER FROM B/);assert.match(d.document.querySelector('.top > b')!.textContent,/project-b$/);
 newGate.resolve();await restored;oldGate.resolve();await pending;await h.runtime.idle();
 assert.match(d.document.querySelector('.feed')!.textContent,/ANSWER FROM B/);assert.doesNotMatch(d.document.querySelector('.feed')!.textContent,/ANSWER FROM A/);assert.equal(v.S.chat.at(-1).text,'ANSWER FROM B');assert.equal(h.provider.calls.length,calls);assert.equal(h.runtime.journal.lastSeq,seq);assert.equal(v.requests.slice(start).some(r=>r.body),false);assert.equal(v.requests.slice(start).filter(r=>r.path===newPath).length,1);
});

for(const current of ['no-active-chat','empty-active-chat','no-pane'])test('TS-09a.1 r2: '+current+' restores an empty feed without real onboarding or a model call',async t=>{
 const h=await fixture(t,current==='no-pane'?{seats:'  {}'}:{}),v=firstPaint(bootHtml,new Map(),'chat'),d=historyDOM(v);
 if(current==='no-pane'){h.runtime.registry.panes.clear();h.runtime.project.state.chats={chats:{},active:{}}} // Explicit legacy absence; an empty project now has a saved room.
 if(current==='empty-active-chat')assert.equal((await call(h.api,'/api/chats/new',{body:{pane:'worker',carry:'none'}})).body.ok,true);
 v.sandbox.fetch=async(path:string,options?:{body:string})=>{const body=options?.body?JSON.parse(options.body):undefined;v.requests.push({path,body});return {json:async()=>(await call(h.api,path,body?{body}:{})).body}};
 runInContext(part(live,'  // лента активного чата','  // подключение к движку'),v.context);
 v.paint.apply((await call(h.api,'/api/status')).body,v.boot.capture(),true);d.document.querySelector('.col')!.innerHTML='<div class="ai live-msg">OLD ANSWER</div>';v.S.chat=[{role:'ai',text:'OLD ANSWER',html:'OLD ANSWER'}];
 v.hidePage();await v.showPage({persisted:true});await h.runtime.idle();
 assert.doesNotMatch(d.document.querySelector('.feed')!.textContent,/OLD ANSWER/);assert.equal(v.S.chat.length,0);assert.equal(h.provider.calls.length,0);assert.equal(v.requests.some(r=>r.body||r.path==='/api/onboard'),false);
 assert.equal(v.requests.some(r=>r.path.startsWith('/api/chats/')&&!r.path.endsWith('/new')),current!=='no-pane'); // 83: a real place now has a saved empty chat even without messages.
});

for(const change of ['pane','chat','pagehide'])test('TS-09a.1 r2: a late restored history cannot repaint after '+change,async()=>{
 const v=firstPaint(bootHtml,new Map(),'chat'),d=historyDOM(v),history=deferred<Data>();let reads=0;
 const status={...realStatus(),project:'/project-b',panes:[realStatus().panes[0]!,{id:'room',label:'Без роли',model:'w1',vendor:'claude'}],activeChats:{worker:'chat-b',room:'chat-room'}};
 v.sandbox.fetch=async(path:string)=>{v.requests.push({path,body:undefined});return {json:async()=>path==='/api/status'?status:path==='/api/chats'?{chats:[],active:status.activeChats}:path==='/api/chats/chat-b'?(reads++,await history.promise):{messages:[{role:'ai',text:'CURRENT SELECTION'}]}}};
 v.S.chat=[{role:'ai',text:'OLD A',html:'OLD A'}];d.document.querySelector('.col')!.innerHTML='<div class="ai live-msg">OLD A</div>';v.hidePage();const restored=v.showPage({persisted:true});await until(()=>reads===1);
 v.functions.invalidateBinding();if(change==='pane'){v.S.ui.pane='room';v.sandbox.pickPane()}if(change==='chat')v.H.active.worker='chat-c';if(change==='pagehide')v.hidePage();
 if(change!=='pagehide')await v.functions.loadChat({onboard:false,visible:true});history.resolve({messages:[{role:'ai',text:'STALE RETURNED HISTORY'}]});await restored;
 const text=d.document.querySelector('.feed')!.textContent;assert.doesNotMatch(text,/STALE RETURNED HISTORY|OLD A/);if(change!=='pagehide')assert.match(text,/CURRENT SELECTION/);assert.equal(v.requests.some(r=>r.body),false);
});

test('153: the direct-to-orchestrator card selects verified kind and ignores an orchestrator-shaped worker',async t=>{
 const h=await fixture(t,{seats:'  orchestrator: {kind: worker, role: orchestrator, label: Ложный руководитель, vendor: claude, model: w1, mode: read}\n  lead: {kind: orchestrator, role: юрист, label: Тимлид, vendor: claude, model: w1, mode: read}'});
 const view=ui({fetch:async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body}),status=(await call(h.api,'/api/status')).body;
 view.H.project=h.dir;view.H.panes=status.panes;view.H.active=status.activeChats;view.S.ui.pane='orchestrator';view.H.pane=view.H.panes[0];view.S.draft='Задача только тимлиду';assert.equal(await view.direct()('orch'),true);await h.runtime.idle();assert.equal(view.requests.find(r=>r.path==='/api/chat')!.body!.pane,'lead');assert.equal(h.provider.calls.length,1);assert.equal(h.provider.calls[0]!.seat.id,'lead');
});

test('178: gallery preserves the sketch canvas and routes implemented pages to the live prototype',()=>{
 const gallery=readFileSync(new URL('sketches/proto/gallery.html',site),'utf8');
 assert.match(gallery,/href="05-spend.html"/);assert.match(gallery,/href="01-chat.html"/);assert.match(gallery,/href="\/sketches\/disarto\/00-design-code.html"/);assert.doesNotMatch(gallery,/location.replace/);
 const index=readFileSync(new URL('sketches/proto/index.html',site),'utf8');assert.match(index,/10-new-chat.html/);
});

test('210: every SCREENS entry is reachable from the untruncated palette by click, keyboard and search',async()=>{
 const d=dom('<aside class="side"><div class="search">Найти</div></aside>');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const context:Data={document:d.document,location:{href:''},waiting:()=>[],DEC:{},addEventListener:d.window.addEventListener.bind(d.window),esc:(v:unknown)=>String(v),localStorage:{removeItem(){}},S:{chat:[]},save(){},render(){},toast(){}};context.window=context;
 runInContext(part(live,'  const SCREENS=','  // ── переключатели и сегменты')+'\nglobalThis.screens=SCREENS;wireSearch();',createContext(context));
 const screens=plain(context.screens) as [string,string][];assert.ok(screens.some(([name])=>name==='События'));assert.ok(screens.some(([name])=>name==='Журнал'));assert.ok(screens.length>12);
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};
 await d.window.emit('keydown',{key:'k',metaKey:true});assert.equal(find('.live-pal').classList.contains('on'),true);
 const rows=()=>d.document.querySelectorAll('.lp-i[data-i]');assert.deepEqual(rows().filter(n=>n.querySelector('small')?.textContent==='экран').map(n=>n.textContent.replace(/экран$/,'')),screens.map(([name])=>name));
 for(let i=0;i<screens.length;i++){await rows()[i]!.emit('click');assert.equal(context.location.href,screens[i]![1])}
 const scrolled:number[]=[];rows().forEach((n,i)=>Reflect.set(n,'scrollIntoView',(options:unknown)=>{assert.deepEqual(plain(options),{block:'nearest'});scrolled.push(i)}));
 for(let i=0;i<screens.length;i++){await find('.lp-box input').emit('keydown',{key:'Enter'});assert.equal(context.location.href,screens[i]![1]);await find('.lp-box input').emit('keydown',{key:'ArrowDown'})}
 assert.ok(scrolled.includes(screens.length-1),'keyboard selection scrolls to screens after the twelfth entry');
 for(const [name,href] of screens){const input=find('.lp-box input');input.value=name.toUpperCase();await input.emit('input');const row=rows().find(n=>n.textContent===name+'экран');assert.ok(row,name);await row.emit('click');assert.equal(context.location.href,href)}
 const input=find('.lp-box input');input.value='no matching screen';await input.emit('input');const previous=context.location.href;await input.emit('keydown',{key:'ArrowDown'});await input.emit('keydown',{key:'Enter'});assert.equal(context.location.href,previous);
 await d.window.emit('keydown',{key:'Escape'});assert.equal(find('.live-pal').classList.contains('on'),false);await find('aside .search').emit('click');assert.equal(find('.live-pal').classList.contains('on'),true);assert.equal(rows().filter(n=>n.querySelector('small')?.textContent==='экран').length,screens.length);
});

test('22d: reserve card belongs to its chat, escapes the label, deduplicates SSE and survives history reload', {timeout:15000},async()=>{
 const notice='Ход ушёл через резервный выход «<Proxy>» · ответ 429',view=ui({fetch:async()=>({ok:true,project:'/project-a',pane:'worker',chat:'chat-a',messages:[{seq:11,role:'peer',text:'[от харнесс] '+notice,ts:100}]})});
 view.functions.hEvent({type:'networkRoute',pane:'worker',chat:'other',seq:11,text:notice,ts:100});assert.equal(view.S.chat.length,0);
 const event={type:'networkRoute',pane:'worker',chat:'chat-a',seq:11,text:notice,ts:100};view.functions.hEvent(event);view.functions.hEvent(event);assert.equal(view.S.chat.length,1);assert.match(view.S.chat[0].html,/live-context-transfer/);assert.match(view.S.chat[0].html,/&lt;Proxy&gt;/);await view.functions.loadChat();assert.match(view.S.chat[0].html,/live-context-transfer/);assert.match(view.S.chat[0].html,/ответ 429/);
});


for(const deepLink of [false,true])test('TS-41: proposal cards stay in the feed with '+(deepLink?'a deep link':'no browser location'),async()=>{
 const d=dom('<div class="frame cur"><div class="main"><div class="feed"><div class="col"><div class="live-msg" data-message-index="0">Ответ оркестратора</div><div class="live-msg" data-message-index="1">Следующий ответ</div></div></div><div class="box"></div></div></div>');
 const seat={sid:'worker-a',operationId:'caaaaa',kind:'worker',label:'Юрист',vendor:'codex',model:'w1',mode:'read',intro:'Проверь договор'},proposal={proposalId:'p'+'a'.repeat(24),version:1,from:'lead',turnInstanceId:'turn-proposal',confirmed:false,seats:[seat],team:[{id:seat.sid,kind:'worker',proposedKind:'worker',state:'proposed',chat:null}]};
 const context:Data={document:d.document,H:{on:true,project:'/test',snapshotOnly:false},sendBinding:()=>({project:'/test',pane:'lead',chat:'lead-chat'}),bindingCurrent:()=>true,S:{ui:{pane:'lead'},chat:[{role:'ai',pane:'lead',turnInstanceId:'turn-proposal'},{role:'ai',pane:'lead',turnInstanceId:'later'}]},...(deepLink?{location:{hash:'#team='+proposal.proposalId}}:{}),PAGE:'chat',leftPage:false,addEventListener(){},esc:(v:unknown)=>String(v),api:async()=>({ok:true,project:'/test',proposals:[proposal]}),operationsTeams(){},OPS:{items:new Map()}};
 runInContext(part(live,'  // TS-09b3: proposal cards','  // End TS-09b3 proposals.')+'globalThis.fetchProposals=proposalsFetch;',createContext(context));
 await context.fetchProposals();
 const card=d.document.querySelector('[data-team-proposal]')!;
 assert.ok(card);assert.equal(card.parentElement,d.document.querySelector('.feed .col'));
 assert.equal(d.document.querySelector('.main > .team-proposals'),null);assert.equal(card.previousElementSibling?.dataset.messageIndex,'0');
 assert.equal(card.querySelector('[data-team-toggle]')!.getAttribute('aria-expanded'),String(deepLink));assert.equal(card.querySelector('.proposal-body')!.hasAttribute('hidden'),!deepLink);
 assert.doesNotMatch(style,/\.team-proposals\{[^}]*max-height|html\[data-page="new"\] \.team-proposals\{position:absolute/);
 assert.match(style,/live-demo-off[^}]*:not\(\.team-proposals\)/,'connected mode must not hide a live proposal as demo content');
});
function turnStatsUI(){
 const d=dom('<main></main>'),H:any={project:'/project-a',pane:{id:'worker'},active:{worker:'chat-a'}},S:any={chat:[]},copied:string[]=[];
 const context:any={H,S,document:d.document,esc:(value:any)=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),navigator:{clipboard:{writeText:async(value:string)=>{copied.push(value)}}},toast(){}};
 context.render=()=>{d.document.querySelector('main')!.innerHTML=S.chat.map((m:any,i:number)=>'<article>'+context.stats.button(m,i)+context.stats.card(m,i)+'</article>').join('')};
 runInContext(part(live,'  const fmtN=','  const timePart=')+'globalThis.stats={parse:messageUsage,button:turnStatsButton,card:turnStatsCard};',createContext(context));
 return {...d,H,S,copied,render:context.render,stats:context.stats};
}
const statsUsage={turnId:'12345678-1234-1234-1234-123456789012',model:'claude-test',vendor:'claude',mode:'read',input:50892,cacheRead:779968,output:17413,durationMs:6400,toolCalls:2,stopped:false,contextAfter:{used:68305,window:200000},cost:.031,currency:'USD'};
test('TS-47.6: history replays observed groups, keeps anonymous errors visible and refuses invented positions',async()=>{
 const tools=[{type:'tool',name:'Read',detail:'<файл>',status:'unknown',offset:3},{type:'toolError',reason:'ошибка',status:'error',offset:3},{type:'tool',name:'Bash',detail:'команда',status:'unknown',offset:8}];
 const messages:Data[]=[{seq:1,role:'ai',text:'До после!',ts:1,usage:{...statsUsage,toolCalls:2},toolEvents:tools},{seq:2,role:'ai',text:'Старый',ts:1,usage:{...statsUsage,toolCalls:2}},{seq:3,role:'ai',text:'Другой',ts:1,usage:{...statsUsage,toolCalls:1},toolEvents:[{...tools[0],offset:null}]},{seq:4,role:'ai',text:'Повреждён',ts:1,usage:{...statsUsage,toolCalls:1},toolEvents:[{...tools[0],offset:999}]}];
 const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{chat:{id:'chat-a',pane:'worker'},messages}:{records:[]}});v.sandbox.toolLine=(item:Data)=>v.sandbox.esc(item.text);await v.functions.loadChat({onboard:false});
 const [observed,legacy,uncertain,invalid]=v.S.chat.map((m:Data)=>m.html);
 assert.equal((observed.match(/data-live-tool-group=/g)||[]).length,2);assert.match(observed,/&lt;файл&gt;/);assert.match(observed,/ошибка/);assert.doesNotMatch(observed,/подробности доступны только/);
 assert.ok(observed.indexOf('До ')<observed.indexOf('&lt;файл&gt;'));assert.ok(observed.indexOf('ошибка')<observed.indexOf('после'));assert.ok(observed.indexOf('после')<observed.indexOf('команда'));
 assert.match(legacy,/подробности доступны только в живом ходе/);assert.match(uncertain,/Положение инструментов относительно текста не подтверждено/);assert.match(invalid,/подробности доступны только в живом ходе/);
});
test('TS-47.6 r2: a result-only error remains visible in a collapsed history group',async()=>{
 const message={seq:1,role:'ai',text:'Готово',ts:1,usage:{...statsUsage,toolCalls:2},toolEvents:[{type:'tool',name:'Edit',detail:'file',status:'unknown',offset:0,order:0},{type:'tool',name:'Edit',detail:'other',status:'unknown',offset:0,order:1}],toolResults:[{id:'receipt-1',name:'fileChange',status:'error',reason:'Не удалось изменить файл',offset:0,order:2}]};
 const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{chat:{id:'chat-a',pane:'worker'},messages:[message]}:{records:[]}});v.sandbox.toolLine=(item:Data)=>v.sandbox.esc(item.text);await v.functions.loadChat({onboard:false});
 const html=v.S.chat[0].html,d=dom('<div>'+html+'</div>'),group=d.document.querySelector('.tg')!,details=group.querySelector('details')!;assert.equal(details.hasAttribute('open'),false);assert.match(group.querySelector('.notice')!.textContent,/Квитанция: Не удалось изменить файл/);assert.doesNotMatch(details.textContent,/Не удалось изменить файл/);assert.match(html,/изменял 2/);assert.match(html,/2 действия/);assert.doesNotMatch(html,/3 действия/);
});
test('TS-47.6 r2: failed turn evidence belongs to its chat and never becomes a completed answer',async()=>{
 const failure={turnInstanceId:'failed-turn',outcome:'error',ts:2,toolEvents:[{type:'tool',name:'Read',detail:'file',status:'unknown',offset:null,order:0},{type:'toolError',reason:'Ошибка чтения',status:'error',offset:null,order:1}],toolResults:[{id:'receipt',name:'Read',status:'error',reason:'Ошибка чтения',offset:null,order:2}]};
 const v=ui({fetch:async path=>path==='/api/chats/chat-a'?{chat:{id:'chat-a',pane:'worker'},messages:[],turns:[failure]}:{chat:{id:'chat-b',pane:'worker'},messages:[]}});v.sandbox.toolLine=(item:Data)=>v.sandbox.esc(item.text);await v.functions.loadChat({onboard:false});assert.equal(v.S.chat.length,1);const m=v.S.chat[0];assert.equal(m.src,'sys');assert.match(m.who,/незавершённого хода/);assert.match(m.html,/Событие: Ошибка чтения/);assert.match(m.html,/Квитанция: Ошибка чтения/);assert.match(m.html,/Положение инструментов относительно текста не подтверждено/);assert.doesNotMatch(m.html,/завершено/);
 const before=v.functions.bubble(m,0).match(/data-message-live-id="([^"]+)"/)![1];await v.functions.loadChat({onboard:false});const after=v.functions.bubble(v.S.chat[0],0).match(/data-message-live-id="([^"]+)"/)![1];assert.equal(before,after);v.H.active.worker='chat-b';await v.functions.loadChat({onboard:false});assert.equal(v.S.chat.length,0);
});
test('TS-47.2 history: only a confirmed tool count is shown, without inventing details or ordering',async()=>{
 const counts=[1,2,5,21,0,null,-1,1.5,'3',Number.MAX_SAFE_INTEGER+1],messages:Data[]=counts.map((toolCalls,i)=>({seq:i+1,role:'ai',text:'Ответ '+i,ts:1,usage:{...statsUsage,toolCalls}}));
 messages.push({seq:11,role:'peer',text:'Сосед',ts:1,usage:statsUsage},{seq:12,role:'ai',origin:'transferred',text:'Перенос',ts:1,usage:statsUsage},{seq:13,role:'me',text:'Вопрос',ts:1,usage:statsUsage});
 const view=ui({fetch:async()=>({messages})});await view.functions.loadChat({onboard:false});
 for(const [i,label] of ['1 инструмент','2 инструмента','5 инструментов','21 инструмент'].entries()){const html=view.S.chat[i].html;assert.match(html,new RegExp(label));assert.match(html,/подробности доступны только в живом ходе/);assert.doesNotMatch(html,/data-live-tool-group|<details|<button/)}
 for(const m of view.S.chat.slice(4))assert.doesNotMatch(m.html||'',/live-history-tools/);
 await view.functions.loadChat({onboard:false});assert.equal((view.S.chat[0].html.match(/live-history-tools/g)||[]).length,1);
});
test('TS-40 UI: complete, missing and interrupted cards preserve nulls and show real zeroes',async()=>{
 const view=turnStatsUI();view.S.chat=[{role:'ai',src:'live',usage:statsUsage},{role:'ai',src:'live',usage:{...statsUsage,turnId:'22345678-1234-1234-1234-123456789012',model:'codex-test',input:null,output:null,cacheRead:null,cost:null,currency:null,contextAfter:null}},{role:'ai',src:'live',usage:{...statsUsage,turnId:'32345678-1234-1234-1234-123456789012',stopped:true,cacheRead:0,output:611}}];view.render();
 assert.equal(view.document.querySelector('.tstat'),null);await view.document.querySelector('[data-turn-stats="0"]')!.emit('click');let card=view.document.querySelector('.tstat')!;assert.match(card.textContent,/50 892/);assert.match(card.textContent,/94 % входа/);assert.equal(card.querySelectorAll('.ticks i').length,32);
 await view.document.querySelector('[data-turn-stats="1"]')!.emit('click');assert.equal(view.document.querySelectorAll('.tstat').length,1);card=view.document.querySelector('.tstat')!;assert.match(card.textContent,/Провайдер не сообщил расход/);assert.equal(card.querySelector('.ticks'),null);assert.equal(card.querySelectorAll('.dim').length,4);assert.doesNotMatch(card.textContent,/0 токенов/);
 await view.document.querySelector('[data-turn-stats="2"]')!.emit('click');card=view.document.querySelector('.tstat')!;assert.match(card.textContent,/Ход прерван/);assert.match(card.textContent,/611/);assert.equal(card.querySelectorAll('.cell b')[1]!.textContent,'0');assert.equal(view.stats.parse({input:0,output:0,cacheRead:0}),null,'legacy usage has no card');
});
test('TS-40 UI: ids are copied exactly, journal links use the turn and project, foreign chat does not retain an open card',async()=>{
 const view=turnStatsUI();view.S.chat=[{role:'ai',src:'live',usage:statsUsage}];view.render();await view.document.querySelector('[data-turn-stats]')!.emit('click');
 const link=view.document.querySelector('.tstat a')!.getAttribute('href')!;assert.equal(link,'21-journal.html?project=%2Fproject-a#turn='+statsUsage.turnId);await view.document.querySelector('[data-turn-copy]')!.emit('click');assert.deepEqual(view.copied,[statsUsage.turnId]);
 view.H.active.worker='chat-b';view.render();assert.equal(view.document.querySelector('.tstat'),null);
 view.S.chat[0].usage={...statsUsage,turnId:null,model:'<img src=x>'};view.render();await view.document.querySelector('[data-turn-stats]')!.emit('click');assert.equal(view.document.querySelector('[data-turn-copy]'),null);assert.equal(view.document.querySelector('.tstat a'),null);assert.equal(view.document.querySelector('img'),null);
});
test('TS-40 UI: history and live completion parse the same per-turn usage',async()=>{
 const view=ui({fetch:async()=>({messages:[{seq:1,role:'ai',text:'Ответ',ts:1,usage:statsUsage}]})});await view.functions.loadChat({onboard:false});assert.deepEqual(plain(view.S.chat[0].usage),statsUsage);
 view.H.cur={text:'Ещё ответ',tools:[],pane:'worker'};view.functions.finish({type:'done',turnUsage:{...statsUsage,input:null},usage:{input:null,output:17413,cacheRead:779968},durationMs:6400});assert.equal(view.S.chat.at(-1).usage.input,null);assert.equal(view.S.chat.at(-1).usage.turnId,statsUsage.turnId);assert.equal(view.S.chat.at(-1).turnNumber,2);view.S.chat=[{role:'ai',src:'live',turnNumber:41,usage:statsUsage}];view.H.cur={text:'Следующий',tools:[],pane:'worker'};view.functions.finish({type:'done',turnUsage:statsUsage});assert.equal(view.S.chat.at(-1).turnNumber,42);
 assert.match(style,/@media\(max-width:640px\).*\.tstat \.grid\{grid-template-columns:repeat\(2/);
});


test('TS-40 cost: icon and card round to three decimals without changing stored precision',async()=>{
 const view=turnStatsUI(),usage={...statsUsage,cost:.322515};view.S.chat=[{role:'ai',src:'live',usage}];view.render();
 assert.equal(view.document.querySelector('[data-turn-stats] .cost')!.textContent,'$0,323');await view.document.querySelector('[data-turn-stats]')!.emit('click');assert.match(view.document.querySelector('.tstat')!.textContent,/\$0,323/);assert.equal(usage.cost,.322515);
});

test('TS-43: reconnecting a busy chat keeps the answer already received over SSE',async()=>{
 const html=readFileSync(new URL('sketches/proto/01-chat.html',site),'utf8'),v=firstPaint(html),status=realStatus();status.panes[0]!.busy=true;
 v.H.project=status.project;v.H.panes=status.panes;v.H.pane=status.panes[0];v.H.cur={text:'PREFIX ',tools:[]};
 const pending=v.paint.connect();v.status.resolve(status);await pending;
 assert.equal(v.H.cur.text,'PREFIX ');v.functions.hEvent({type:'delta',text:'SUFFIX'});assert.equal(v.H.cur.text,'PREFIX SUFFIX');
});
