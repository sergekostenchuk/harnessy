import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {createRuntime} from '@harnessy/runtime';
import {ProviderError} from '@harnessy/providers';
import {createApi} from './server.ts';
import {fixture,call,sse,deferred,until,OWNER,FakeProvider} from './test-helpers.ts';
import {completedActions} from '../../runtime/src/test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
type Card={id:string;className?:string;dataset:Record<string,string>;style:Record<string,string>;innerHTML:string;parentElement?:unknown;remove():void};
function ui(options:{realFinish?:boolean;page?:string}={}){
 const cards=new Map<string,Card>(),listeners:((event:unknown)=>Promise<void>)[]=[],requests:{path:string;body:unknown}[]=[],toasts:string[]=[];
 type UiPane={id:string;label:string;model?:string;waiting?:unknown};
 const H={on:false,project:'/project-a',panes:[{id:'worker',label:'воркер',waiting:null},{id:'room',label:'без роли',waiting:null}] as UiPane[],cur:null as null|{text:string;tools:unknown[]},pane:{id:'worker',model:'w1',label:'воркер'} as UiPane,asks:{},active:{}},S={chat:[] as Record<string,any>[],ui:{pane:'room',fresh:false,switched:false}};let finishes=0,refreshes=0,busy=false;
 const main={children:[] as unknown[],insertBefore(c:Card,ref:unknown){const old=this.children.indexOf(c);if(old>=0)this.children.splice(old,1);this.children.splice(this.children.indexOf(ref),0,c);c.parentElement=this;cards.set(c.id,c)}},feed={parentElement:main};main.children.push(feed);
 const decisions={innerHTML:'',dataset:{}},turns={innerHTML:'',dataset:{}},away={innerHTML:'',dataset:{}},status={innerHTML:''};
 const document={createElement(){const c:Card={id:'',dataset:{},style:{},innerHTML:'',remove(){cards.delete(c.id);const at=main.children.indexOf(c);if(at>=0)main.children.splice(at,1)}};return c},body:{appendChild(c:Card){cards.set(c.id,c);c.parentElement=this}},getElementById(id:string){return cards.get(id)},querySelector(selector:string){if(selector.endsWith(' .feed'))return feed;if(selector==='#v-week .lst')return decisions;if(selector==='#v-turn .lst')return turns;if(selector==='#v-away .lst')return away;if(selector==='.frame .top .st')return status;return null},querySelectorAll(){return []},addEventListener(_kind:string,fn:(event:unknown)=>Promise<void>){listeners.push(fn)}};
 const CX={setBusy(on:boolean){busy=on}};
 const sandbox={H,S,document,fetch:async(path:string,options?:{body:string})=>{requests.push({path,body:options?.body?JSON.parse(options.body):null});return {json:async()=>({ok:true})}},esc:(s:unknown)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:{label:string})=>p.label,
 finish(){finishes++;H.cur=null},noteFinish(){finishes++},refreshStatus:async()=>{refreshes++},refreshChats:async()=>{},sideChats(){},toast:(s:string)=>toasts.push(s),now:()=>1,save(){},render(){},drawLive(){busy=!!H.cur},log(){},setTimeout(){},addEventListener(){},PAGE:options.page??'chat',badges(){},pickPane(){H.pane=H.panes.find(p=>p.id===S.ui.pane)??H.panes[0]!},window:{CX},CX,toolLine:()=>'',md:(text:string)=>text,onboardOnce:async()=>{},LOADED:null,plural:(n:number)=>n===1?'ждёт':'ждут',who:(id:string)=>id,EventSource:class {onmessage:any;onerror:any;url:string;constructor(url:string){this.url=url}}};
 const context=createContext(sandbox);
 const helpers=source.slice(source.indexOf('  const api='),source.indexOf('  // End TS-07 waiting controls.'));
 const events=source.slice(source.indexOf('  function transferHTML('),source.indexOf('  const isDirect='));
 const finish=options.realFinish?source.slice(source.indexOf('  function finish('),source.indexOf('  function transferHTML('))+'\nconst originalFinish=finish;finish=ev=>{noteFinish();originalFinish(ev)};':'';
 const statusSource=source.slice(source.indexOf('  function applyStatus('),source.indexOf('  async function refreshChats('));
 const names=source.split('\n').find(line=>line.startsWith('  const modelName='));assert.ok(names);
 const binding=source.slice(source.indexOf('  let bindingGeneration'),source.indexOf('  function md(')),notes=source.slice(source.indexOf('  async function loadAttemptNotes('),source.indexOf('  // подключение к движку'));
 const now=options.page==='now'?source.slice(source.indexOf('  const NOW='),source.indexOf('  window.LIVE=')):'';
 runInContext(source.slice(source.indexOf('  // TS-12: one project-bound transport'),source.indexOf('  // End TS-12 shared events.'))+helpers+'\n'+binding+'\n'+notes+'\n'+finish+'\n'+events+'\n'+names+'\n'+statusSource+'\n'+now+'\nglobalThis.testing={api,hEvent,applyStatus,consumeState,waitingControls,showWaiting,showRestore,renderWaiting,loadChat,loadAttemptNotes,sendBinding'+(now?',nowLive':'')+'};',context);
 const functions=(context as unknown as {testing:{api(path:string,body?:unknown):Promise<unknown>;hEvent(e:unknown):void;applyStatus(st:unknown):void;consumeState(e:unknown):void;waitingControls(p:unknown,info:unknown,project:string,compact?:boolean):string;showWaiting(p:unknown,info:unknown,project:string):void;showRestore(project:string,error:string):void;renderWaiting():void;loadChat():Promise<void>;loadAttemptNotes(p:unknown,b:unknown):Promise<void>;sendBinding():unknown;nowLive():void}}).testing;
 async function click(dataset:Record<string,string>){const button={dataset,disabled:false};let stopped=false;await listeners[0]!({target:{closest(){return button}},preventDefault(){},stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(button.disabled,false)}
 function sidebar(all:unknown[]){const context=createContext({H,all,pins:[],PIN:'',esc:sandbox.esc,paneName:sandbox.paneName,waitingControls:functions.waitingControls});runInContext(source.slice(source.indexOf('    const seats=(H.panes'),source.indexOf('    const projHTML='))+'\nglobalThis.sidebar=chatsHTML;',context);return String((context as unknown as {sidebar:string}).sidebar)}

 async function sidebarClick(chat:string,pane:string){
  runInContext(source.slice(source.indexOf('  async function openChatRow('),source.indexOf('  async function sideSwitchProject('))+'\n'+source.slice(source.indexOf("  document.addEventListener('click',async e=>{ const toggle="),source.indexOf('  // меню профиля')),context);
  const row={dataset:{chat,pane},classList:{contains:()=>false}};
  await listeners.at(-1)!({target:{closest:(selector:string)=>selector==='.ps-chat[data-pane]'?row:null},preventDefault(){},stopPropagation(){}});
 }
 return {H,S,cards,main,feed,decisions,turns,status,requests,toasts,functions,sandbox,click,sidebar,sidebarClick,get finishes(){return finishes},get refreshes(){return refreshes},get busy(){return busy}};
}
const waiting={status:'uncertain',recordSeqs:[36],startedAt:1,turnInstanceId:'turn-a',actions:['retry','skip']};

test('77 window: SSE replay cannot finish an active answer; idle/new episode/project are independent',()=>{
 const view=ui(),ev={type:'error',pane:'worker',warning:'worker:turn-a:error',message:'ошибка',replay:true};
 view.functions.hEvent(ev);assert.equal(view.finishes,1);view.H.cur={text:'новый ответ',tools:[]};const active=view.H.cur;
 for(let i=0;i<4;i++)view.functions.hEvent(ev);assert.equal(view.finishes,1);assert.equal(view.H.cur,active);view.functions.hEvent({type:'delta',text:' продолжается'});assert.equal(active.text,'новый ответ продолжается');
 view.functions.consumeState({pane:'worker',status:'idle',waiting:null});view.functions.hEvent(ev);assert.equal(view.finishes,2);
 view.functions.hEvent({...ev,warning:'worker:turn-b:error'});assert.equal(view.finishes,3);view.H.project='/project-b';view.functions.hEvent(ev);assert.equal(view.finishes,4);
});

test('77/129 window: note replay is shown once; ordinary notes remain visible without finishing the answer',()=>{
 const view=ui(),ev={type:'note',text:'ожидание',pane:'worker',warning:'worker:turn-a:uncertain',replay:true};view.functions.hEvent(ev);view.H.cur={text:'ответ',tools:[]};const active=view.H.cur;view.functions.hEvent(ev);assert.equal(view.S.chat.length,1);assert.equal(view.finishes,0);assert.strictEqual(view.H.cur,active);
 view.functions.hEvent({type:'note',text:'другая заметка'});assert.equal(view.S.chat.length,2);assert.equal(view.S.chat[1]!.text,'[от харнесс] другая заметка');assert.equal(view.finishes,0);assert.strictEqual(view.H.cur,active);assert.equal(active.text,'ответ');
});

test('133/134 window: decision controls carry immutable project/pane/episode and disclose consequences',()=>{
 const view=ui(),html=view.functions.waitingControls(view.H.panes[0],waiting,view.H.project);assert.match(html,/data-attempt-project="\/project-a"/);assert.match(html,/data-attempt-id="turn-a"/);assert.match(html,/data-attempt-pane="worker"/);assert.match(html,/Итог хода по записи №36 неизвестен/);assert.match(html,/движок перезапускался до ответа/);assert.match(html,/Повторить — отправить записи №36–№36 модели снова/);assert.match(html,/Пропустить — не отправлять, пойдут только более поздние/);
 const damaged=view.functions.waitingControls(view.H.panes[0],{...waiting,turnInstanceId:'unreadable:worker:hash',recordSeqs:[],actions:['retry']},view.H.project);assert.doesNotMatch(damaged,/#|data-attempt-action="skip"/);assert.match(damaged,/всю очередь/);
 const finish=view.functions.waitingControls(view.H.panes[0],{...waiting,status:'recovering',actions:['finish']},view.H.project);assert.match(finish,/без вызова модели/);assert.doesNotMatch(finish,/data-attempt-action="retry"|data-attempt-action="skip"/);
});

test('133 window: role and room sidebar rows show only waiting labels; the decision door is in the chat',()=>{
 const view=ui();for(const pane of view.H.panes)pane.waiting=waiting;const rooms={H:view.H,all:[{pane:'worker',id:'cw',active:true,title:'роль'},{pane:'room',id:'cr',active:true,title:'разговор'}],cur:'/project-a',esc:(s:unknown)=>String(s),paneName:(p:{label:string})=>p.label,pinBtn:()=>'',waitingControls:view.functions.waitingControls};
 const context=createContext(rooms);runInContext(source.slice(source.indexOf('    const roleRow='),source.indexOf('    const shown='))+'\nglobalThis.testingRows={roleRow,roomRow};',context);const rows=(context as unknown as {testingRows:{roleRow(p:unknown):string;roomRow(c:unknown):string}}).testingRows;
 for(const html of [rows.roleRow(view.H.panes[0]),rows.roomRow(rooms.all[1])]){assert.match(html,/ждёт решения/);assert.doesNotMatch(html,/data-attempt|live-attempt-controls|Повторить|Пропустить|движок перезапускался|Записи №/)}
 assert.match(rows.roleRow(view.H.panes[0]),/data-pane="worker"/);assert.match(rows.roomRow(rooms.all[1]),/data-pane="room"/);assert.doesNotMatch(rows.roomRow({...rooms.all[1],active:false}),/ждёт решения|data-attempt-action/);
});

test('134 window: waiting card is above the selected chat feed, remains once, and disappears when another place is selected',()=>{
 const view=ui();view.H.pane=view.H.panes[0]!;view.H.pane.waiting=waiting;view.functions.renderWaiting();view.functions.renderWaiting();const card=view.cards.get('live-waiting')!;
 assert.equal(view.cards.size,1);assert.equal(card.parentElement,view.main);assert.deepEqual(view.main.children,[card,view.feed]);assert.match(card.style.cssText!,/flex:none/);assert.doesNotMatch(card.className!,/toast/);
 view.H.pane=view.H.panes[1]!;view.functions.renderWaiting();assert.equal(view.cards.size,0);assert.deepEqual(view.main.children,[view.feed]);
 view.H.pane=view.H.panes[0]!;view.functions.renderWaiting();assert.equal(view.cards.size,1);view.functions.consumeState({pane:'worker',status:'idle',waiting:null});assert.equal(view.cards.size,0);
});

test('134 window: Now uses the same decision card for every waiting place, including recovering without an attempt',()=>{
 const view=ui({page:'now'});view.H.on=true;view.H.panes[0]!.waiting=waiting;view.H.panes[1]!.waiting={...waiting,status:'recovering',recordSeqs:[],turnInstanceId:'recovering:room',actions:['finish']};view.functions.nowLive();
 assert.equal(view.cards.size,0);assert.match(view.decisions.innerHTML,/Решения владельца/);assert.ok(view.decisions.innerHTML.includes(view.functions.waitingControls(view.H.panes[0],waiting,view.H.project)));
 assert.equal(view.decisions.innerHTML.match(/data-attempt-action="retry"/g)?.length,1);assert.equal(view.decisions.innerHTML.match(/data-attempt-action="skip"/g)?.length,1);assert.equal(view.decisions.innerHTML.match(/data-attempt-action="finish"/g)?.length,1);assert.match(view.decisions.innerHTML,/Завершить восстановление/);assert.match(view.status.innerHTML,/2 ждут вас/);
 view.functions.consumeState({pane:'worker',status:'idle',waiting:null});assert.doesNotMatch(view.decisions.innerHTML,/data-attempt-pane="worker"/);assert.match(view.decisions.innerHTML,/data-attempt-pane="room"/);
 view.functions.consumeState({pane:'room',status:'idle',waiting:null});assert.doesNotMatch(view.decisions.innerHTML,/data-attempt-action/);assert.match(view.status.innerHTML,/никто не ждёт/);
});

for(const page of ['new','art','mem'])test('134 window: waiting on '+page+' does not create an unrelated floating decision card',()=>{
 const view=ui({page});view.H.panes[0]!.waiting=waiting;view.functions.showWaiting(view.H.panes[0],waiting,view.H.project);view.functions.renderWaiting();assert.equal(view.cards.size,0);
});

test('74 window: old button still sends its original binding and cannot remove another project card',async()=>{
 const view=ui();view.H.project='/project-b';view.functions.showWaiting(view.H.panes[0],{...waiting,turnInstanceId:'turn-b'},view.H.project);const card=view.cards.get('live-waiting');
 await view.click({attemptProject:'/project-a',attemptPane:'worker',attemptId:'turn-a',attemptAction:'skip'});assert.deepEqual(view.requests[0],{path:'/api/panes/worker/attempt',body:{project:'/project-a',turnInstanceId:'turn-a',action:'skip'}});assert.equal(view.cards.get('live-waiting'),card);assert.equal(view.refreshes,0);
});

test('74 window: current binding succeeds; missing transport remains a visible error',async()=>{
 const view=ui();view.functions.showWaiting(view.H.panes[0],waiting,view.H.project);await view.click({attemptProject:view.H.project,attemptPane:'worker',attemptId:'turn-a',attemptAction:'retry'});assert.equal(view.cards.size,0);assert.equal(view.refreshes,1);
 view.sandbox.fetch=async()=>{throw Error('offline')};await view.click({attemptProject:view.H.project,attemptPane:'worker',attemptId:'turn-a',attemptAction:'skip'});assert.match(view.toasts.at(-1)!,/нет связи/);
});

test('134 window: a late successful decision cannot clear a new waiting episode of the same place',async()=>{
 const view=ui(),gate=deferred();view.H.pane=view.H.panes[0]!;view.H.pane.waiting=waiting;view.functions.renderWaiting();view.sandbox.fetch=async()=>({json:async()=>{await gate.promise;return {ok:true}}});
 const deciding=view.click({attemptProject:view.H.project,attemptPane:'worker',attemptId:'turn-a',attemptAction:'skip'});view.H.pane.waiting={...waiting,turnInstanceId:'turn-b'};view.functions.renderWaiting();gate.resolve();await deciding;
 assert.equal(view.cards.get('live-waiting')!.dataset.attemptId,'turn-b');assert.equal(view.cards.size,1);
});

test('97 window: central API refusal opens the door, delayed response of another project cannot change its place',async()=>{
 const view=ui();view.sandbox.fetch=async()=>({json:async()=>({ok:false,pane:'worker',project:'/project-a',waiting})}) as unknown as Awaited<ReturnType<typeof view.sandbox.fetch>>;
 await view.functions.api('/api/panes/worker');assert.match(view.cards.get('live-waiting')!.innerHTML,/Повторить.*Пропустить/);
 view.H.project='/project-b';view.H.panes[0]!.waiting=null;view.cards.clear();await view.functions.api('/api/panes/worker');assert.equal(view.cards.size,0);assert.equal(view.H.panes[0]!.waiting,null);
 view.sandbox.fetch=async()=>({json:async()=>({ok:false,code:'restore_failed',project:'/project-b',error:'назначение не восстановлено'})}) as unknown as Awaited<ReturnType<typeof view.sandbox.fetch>>;await view.functions.api('/api/chat',{pane:'worker',message:'текст'});assert.match(view.cards.get('live-waiting')!.innerHTML,/Повторить восстановление проекта/);
});

for(const legacy of [false,true])for(const page of ['chat','now'])for(const action of ['retry','skip'])test('134: cold '+page+' resolves an uncertain first room turn through '+action+' and keeps its decision after reopening'+(legacy?' after recreating a missing chat':' with an analytic turn'),async t=>{
 const h=await fixture(t,{seats:'{}'});await call(h.api,'/api/room',{body:{model:'w1',folder:false}});
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','first room result unknown')};
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'room',message:'first question'}})).status,200);await h.runtime.idle();assert.equal(h.provider.calls.length,1);const chatsPath=h.runtime.project.state.chatsPath;await h.api.close();
 // Older projects can have only attempts.json. New failed model turns also persist chat.turns[], never a fabricated response.
 if(legacy)rmSync(chatsPath);
 const provider=new FakeProvider(),runtime=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>runtime.close());
 const api=createApi({runtime,siteDir:h.siteDir,port:0});await api.listen();t.after(()=>api.close());
 const status=await call(api,'/api/status'),chats=await call(api,'/api/chats');assert.equal(chats.body.chats.length,1);assert.equal(chats.body.chats[0].messages,0);if(!legacy){const spend=await call(api,'/api/spend');assert.equal(spend.body.totals.turns,1);assert.equal(spend.body.totals.outcomes.error,1)}const room=status.body.panes.find((p:{id:string})=>p.id==='room');assert.ok(room.waiting);const attemptId=room.waiting.turnInstanceId;
 const view=ui({page});view.H.on=true;view.functions.applyStatus(status.body);if(page==='now')view.functions.nowLive();assert.equal(provider.calls.length,0);
 const html=page==='chat'?view.cards.get('live-waiting')!.innerHTML:view.decisions.innerHTML;assert.match(html,/data-attempt-action="retry"/);assert.match(html,/data-attempt-action="skip"/);
 const sidebar=view.sidebar(chats.body.chats);assert.match(sidebar,/data-pane="room"/);assert.match(sidebar,/ждёт решения/);assert.doesNotMatch(sidebar,/data-attempt|в проекте пока нет ролей и чатов/);
 view.sandbox.fetch=async(path,options)=>({json:async()=>(await call(api,path,{...(options?.body?{body:JSON.parse(options.body)}:{})})).body});
 await view.click({attemptProject:status.body.project,attemptPane:'room',attemptId,attemptAction:action});await runtime.idle();assert.equal(runtime.waiting('room'),null);assert.equal(provider.calls.length,action==='retry'?1:0);assert.equal(view.cards.size,0);assert.doesNotMatch(view.decisions.innerHTML,/data-attempt-action/);
 const note='владелец решил: '+(action==='retry'?'повторить ход':'пропустить записи прежнего хода');
 if(page==='chat'){assert.equal(view.S.chat.filter(m=>m.text===note).length,1);await view.functions.loadChat();assert.equal(view.S.chat.filter(m=>m.attemptId===attemptId).length,1)}
 const reopened=ui();reopened.H.on=true;reopened.functions.applyStatus((await call(api,'/api/status')).body);reopened.sandbox.fetch=view.sandbox.fetch;await reopened.functions.loadChat();assert.equal(reopened.cards.size,0);assert.equal(reopened.S.chat.filter(m=>m.text===note).length,1);
});

for(const page of ['chat','now'])test('134: '+page+' finishes a saved response without another model call and reopens its decision note',async t=>{
 const h=await fixture(t,{actions:{...completedActions,async afterTurn(){throw Error('local effects failed')}}});
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'сохрани ответ'}})).status,200);await h.runtime.idle();
 const status=await call(h.api,'/api/status'),pane=status.body.panes.find((p:{id:string})=>p.id==='worker');assert.equal(pane.waiting.status,'recovering');assert.deepEqual(pane.waiting.actions,['finish']);const attemptId=pane.waiting.turnInstanceId;
 h.runtime.actions.afterTurn=completedActions.afterTurn;
 const view=ui({page});view.H.on=true;view.S.ui.pane='worker';view.functions.applyStatus(status.body);if(page==='now')view.functions.nowLive();
 const html=page==='chat'?view.cards.get('live-waiting')!.innerHTML:view.decisions.innerHTML;assert.match(html,/data-attempt-action="finish"/);assert.doesNotMatch(html,/data-attempt-action="retry"|data-attempt-action="skip"/);
 view.sandbox.fetch=async(path,options)=>({json:async()=>(await call(h.api,path,{...(options?.body?{body:JSON.parse(options.body)}:{})})).body});
 await view.click({attemptProject:status.body.project,attemptPane:'worker',attemptId,attemptAction:'finish'});await h.runtime.idle();assert.equal(h.runtime.waiting('worker'),null);assert.equal(h.provider.calls.length,1);assert.equal(view.cards.size,0);assert.doesNotMatch(view.decisions.innerHTML,/data-attempt-action/);
 const reopened=ui();reopened.H.on=true;reopened.S.ui.pane='worker';reopened.functions.applyStatus((await call(h.api,'/api/status')).body);reopened.sandbox.fetch=view.sandbox.fetch;await reopened.functions.loadChat();assert.equal(reopened.S.chat.filter(m=>m.text==='владелец решил: завершить восстановление').length,1);
});

test('134: decision notes require a completed harness receipt for the same place and reject a late project response',async()=>{
 const view=ui();view.H.pane=view.H.panes[0]!;view.S.ui.pane='worker';
 const record={from:'harness',kind:'note',origin:'attempt',to:['owner'],thread:'attempt:turn-a',ts:'2026-10-11T00:00:00Z',attempt:{pane:'worker',turnInstanceId:'turn-a',action:'skip',done:true}};
 const invalid=[{...record,from:'worker'},{...record,attempt:undefined},{...record,attempt:{...record.attempt,done:false}},{...record,to:['worker']},{...record,attempt:{...record.attempt,pane:'room'}}];
 view.sandbox.fetch=async()=>({json:async()=>({ok:true,records:invalid})});await view.functions.loadAttemptNotes(view.H.pane,view.functions.sendBinding());assert.equal(view.S.chat.length,0);
 const gate=deferred();view.sandbox.fetch=async()=>({json:async()=>{await gate.promise;return {ok:true,records:[record]}}});const loading=view.functions.loadAttemptNotes(view.H.pane,view.functions.sendBinding());view.H.project='/project-b';gate.resolve();await loading;assert.equal(view.S.chat.length,0);
 view.sandbox.fetch=async()=>({json:async()=>({ok:true,records:[record,record]})});await view.functions.loadAttemptNotes(view.H.pane,view.functions.sendBinding());await view.functions.loadAttemptNotes(view.H.pane,view.functions.sendBinding());assert.equal(view.S.chat.length,1);
});

test('TS-07 r2/2: the room door is shown once even if its active chat is beyond the sidebar history limit',()=>{
 const view=ui();view.H.panes[1]!.waiting=waiting;
 for(const activeAt of [0,6]){
  const chats=Array.from({length:7},(_,i)=>({id:'c'+i,pane:'room',active:i===activeAt,title:'chat '+i,last:10-i})),html=view.sidebar(chats);
  assert.equal(html.match(/ждёт решения/g)?.length,1);assert.doesNotMatch(html,/data-attempt-action|live-attempt-controls/);
 }
});

for(const malformed of ['serializer','bus'] as const)test('TS-07 r2/3: '+malformed+' warning traverses EventBus → SSE → window without terminating or splitting the model answer',async t=>{
 const h=await fixture(t),stream=await sse(h.api),gate=deferred();t.after(()=>{gate.resolve();stream.close()});await until(()=>stream.raw.includes(': ok'));
 h.provider.onRun=async(seat,_text,ctx)=>{
  ctx.modelStarted?.();ctx.publish({type:'delta',text:'first half '});
  h.runtime.registry.get('worker')!.publish(malformed==='serializer'?{type:'error',code:undefined,message:'missing code'}:{type:'note',get text():string{throw Error('getter failed')}});
  await gate.promise;ctx.publish({type:'delta',text:'second half'});ctx.publish({type:'done',model:seat.model,sessionId:'s1',durationMs:5,usage:{input:2,output:2,cacheRead:0}});return {text:'first half second half',sessionId:'s1'};
 };
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'answer continuously'}})).status,200);
 await until(()=>stream.frames.some(event=>event.code==='unserializable'));const view=ui({realFinish:true});let delivered=0;
 const deliver=()=>{while(delivered<stream.frames.length){const event=stream.frames[delivered++];if(event.pane==='worker'&&['delta','error','done'].includes(event.type))view.functions.hEvent(event)}};
 deliver();const answer=view.H.cur;assert.ok(answer);assert.equal(view.finishes,0);assert.equal(view.busy,true);assert.equal(answer.text,'first half ');assert.equal(view.toasts.length,1);
 gate.resolve();await h.runtime.idle();await until(()=>stream.frames.some(event=>event.type==='done'));deliver();
 assert.equal(view.finishes,1);assert.equal(view.busy,false);assert.equal(view.H.cur,null);assert.equal(view.S.chat.length,1);assert.equal(view.S.chat[0]!.text,'first half second half');
});

test('TS-07 r2/3: ordinary provider errors remain terminal',()=>{
 const view=ui({realFinish:true});view.functions.hEvent({type:'delta',text:'partial'});assert.equal(view.busy,true);view.functions.hEvent({type:'error',code:'transport_lost',message:'provider disconnected'});assert.equal(view.finishes,1);assert.equal(view.busy,false);assert.equal(view.H.cur,null);
});


for(const place of ['worker','room'])for(const state of ['uncertain','recovering'])test('TS-07.2 r2/1: sidebar → HTTP history → waiting card for '+place+' with '+state+' and an existing chat',async t=>{
 const h=await fixture(t,{actions:{...completedActions,async afterTurn(){return 'completed'}}});await call(h.api,'/api/room',{body:{model:'w1'}});
 await call(h.api,'/api/chat',{body:{pane:place,message:'saved answer'}});await h.runtime.idle();
 if(state==='recovering')h.runtime.actions.afterTurn=async()=>{throw Error('effects unavailable')};
 else h.provider.onRun=async(_seat,_message,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','lost')};
 await call(h.api,'/api/chat',{body:{pane:place,message:'uncertain work'}});await h.runtime.idle();
 const st=(await call(h.api,'/api/status')).body,chats=(await call(h.api,'/api/chats')).body.chats,chat=chats.find((c:any)=>c.pane===place&&c.active);
 assert.ok(chat.messages>0);assert.equal(st.panes.find((p:any)=>p.id===place).waiting.status,state);
 // Keep the protected mutation closed: viewing a selected active chat must not call it at all.
 assert.equal((await call(h.api,'/api/chats/open',{body:{chat:chat.id,carry:'text'}})).status,409);
 const calls=h.provider.calls.length;
 for(const cold of [false,true]){
  const v=ui();v.H.on=true;v.S.ui.pane=place==='worker'?'room':'worker';v.functions.applyStatus(st);assert.notEqual(v.H.pane.id,place);
  v.sandbox.fetch=async(path,options)=>{v.requests.push({path,body:options?.body?JSON.parse(options.body):null});return {json:async()=>(await call(h.api,path,options?.body?{body:JSON.parse(options.body)}:{})).body}};
  v.sandbox.refreshStatus=async()=>{v.functions.applyStatus((await call(h.api,'/api/status')).body)};
  const row=v.sidebar(chats);assert.match(row,/ждёт решения/);assert.doesNotMatch(row,/data-attempt-action/);
  await v.sidebarClick(chat.id,place);
  assert.equal(v.S.ui.pane,place,cold?'cold':'warm');assert.equal(v.H.pane.id,place);assert.equal(v.cards.get('live-waiting')!.dataset.pane,place);assert.match(v.cards.get('live-waiting')!.innerHTML,/Итог хода|восстановлен/);
  assert.ok(v.S.chat.some(m=>m.text==='saved answer'));assert.ok(v.requests.some(r=>r.path==='/api/chats/'+chat.id));assert.equal(v.requests.some(r=>r.path==='/api/chats/open'),false);
 }
 assert.equal(h.provider.calls.length,calls);assert.equal((await call(h.api,'/api/status')).body.panes.find((p:any)=>p.id===place).waiting.status,state);
});

test('247/249: EventBus → HTTP SSE → window shows expandable transfer without ending reply; history restores it',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!,p=h.runtime.project;pane.transcript=[{role:'me',text:'<script>historical</script>',ts:1},{role:'ai',text:'saved answer',ts:2}];pane.sessionId=null;p.state.saveChats(p.registry);const cid=p.state.chats.active.worker!;
 const stream=await sse(h.api);t.after(()=>stream.close());const view=ui({realFinish:true});Object.assign(view.H,{on:true,project:h.dir,active:{worker:cid}});view.S.ui.pane='worker';view.H.cur={text:'',tools:[]};const active=view.H.cur;
 const gate=deferred();t.after(()=>gate.resolve());h.provider.onRun=async(s,_text,ctx)=>{ctx.modelStarted?.();await gate.promise;ctx.publish({type:'delta',text:'NEW REPLY'});ctx.publish({type:'done',sessionId:'new',model:s.model,usage:{input:33,output:2,cacheRead:0},durationMs:1});return {text:'NEW REPLY',sessionId:'new'}};
 const sent=await call(h.api,'/api/chat',{body:{pane:'worker',message:'continue',kind:'question'}});assert.equal(sent.status,200);await until(()=>stream.frames.some(e=>e.type==='contextTransfer'));
 const event=stream.frames.find(e=>e.type==='contextTransfer');view.functions.hEvent(event);view.functions.hEvent(event);assert.equal(view.finishes,0);assert.strictEqual(view.H.cur,active);assert.equal(view.S.chat.length,1);assert.match(view.S.chat[0]!.html,/<details.*<summary>контекст передан новой модели/);assert.match(view.S.chat[0]!.html,/&lt;script&gt;/);assert.doesNotMatch(view.S.chat[0]!.html,/<script>/);
 const status=(await call(h.api,'/api/status')).body;assert.equal(status.panes.find((x:any)=>x.id==='worker').contextTransfer.chat,cid);
 view.functions.hEvent({...event,transfer:{...event.transfer,project:'/other'}});assert.equal(view.S.chat.length,1);
 gate.resolve();await h.runtime.idle();await until(()=>stream.frames.some(e=>e.type==='done'));for(const e of stream.frames.filter(e=>['delta','done'].includes(e.type)))view.functions.hEvent(e);assert.equal(view.finishes,1);assert.equal(view.S.chat.at(-1)!.text,'NEW REPLY');
 view.sandbox.fetch=async(path:string)=>({json:async()=>(await call(h.api,path)).body});await view.functions.loadChat();const note=view.S.chat.find(m=>m.transferId===event.transfer.turnInstanceId)!;assert.ok(note);assert.match(note.html,/<details/);assert.equal(view.S.chat.filter(m=>m.transferId).length,1);
});
