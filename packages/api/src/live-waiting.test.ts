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
type Card={id:string;dataset:Record<string,string>;style:Record<string,string>;innerHTML:string;remove():void};
function ui(options:{realFinish?:boolean}={}){
 const cards=new Map<string,Card>(),listeners:((event:unknown)=>Promise<void>)[]=[],requests:{path:string;body:unknown}[]=[],toasts:string[]=[];
 type UiPane={id:string;label:string;model?:string;waiting?:unknown};
 const H={on:false,project:'/project-a',panes:[{id:'worker',label:'воркер',waiting:null},{id:'room',label:'без роли',waiting:null}] as UiPane[],cur:null as null|{text:string;tools:unknown[]},pane:{id:'worker',model:'w1',label:'воркер'} as UiPane,asks:{}},S={chat:[] as {role:string;text?:string}[],ui:{pane:'room',fresh:false,switched:false}};let finishes=0,refreshes=0,busy=false;
 const document={createElement(){const c:Card={id:'',dataset:{},style:{},innerHTML:'',remove(){cards.delete(c.id)}};return c},body:{appendChild(c:Card){cards.set(c.id,c)}},getElementById(id:string){return cards.get(id)},querySelectorAll(){return []},addEventListener(_kind:string,fn:(event:unknown)=>Promise<void>){listeners.push(fn)}};
 const CX={setBusy(on:boolean){busy=on}};
 const sandbox={H,S,document,fetch:async(path:string,options?:{body:string})=>{requests.push({path,body:options?.body?JSON.parse(options.body):null});return {json:async()=>({ok:true})}},esc:(s:unknown)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:{label:string})=>p.label,
 finish(){finishes++;H.cur=null},noteFinish(){finishes++},refreshStatus:async()=>{refreshes++},refreshChats:async()=>{},sideChats(){},toast:(s:string)=>toasts.push(s),now:()=>1,save(){},render(){},drawLive(){busy=!!H.cur},log(){},setTimeout(){},PAGE:'new',badges(){},pickPane(){H.pane=H.panes.find(p=>p.id===S.ui.pane)??H.pane},window:{CX},CX,toolLine:()=>'',md:(text:string)=>text};
 const context=createContext(sandbox);
 const helpers=source.slice(source.indexOf('  const api='),source.indexOf('  // End TS-07 waiting controls.'));
 const events=source.slice(source.indexOf('  function hEvent('),source.indexOf('  const isDirect='));
 const finish=options.realFinish?source.slice(source.indexOf('  function finish('),source.indexOf('  function hEvent('))+'\nconst originalFinish=finish;finish=ev=>{noteFinish();originalFinish(ev)};':'';
 const status=source.slice(source.indexOf('  function applyStatus('),source.indexOf('  async function refreshChats('));
 const names=source.split('\n').find(line=>line.startsWith('  const modelName='));assert.ok(names);
 runInContext(helpers+'\n'+finish+'\n'+events+'\n'+names+'\n'+status+'\nglobalThis.testing={api,hEvent,applyStatus,consumeState,waitingControls,showWaiting,showRestore};',context);
 const functions=(context as unknown as {testing:{api(path:string,body?:unknown):Promise<unknown>;hEvent(e:unknown):void;applyStatus(st:unknown):void;consumeState(e:unknown):void;waitingControls(p:unknown,info:unknown,project:string,compact?:boolean):string;showWaiting(p:unknown,info:unknown,project:string):void;showRestore(project:string,error:string):void}}).testing;
 async function click(dataset:Record<string,string>){const button={dataset,disabled:false};let stopped=false;await listeners[0]!({target:{closest(){return button}},preventDefault(){},stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(button.disabled,false)}
 function sidebar(all:unknown[]){const context=createContext({H,all,pins:[],PIN:'',esc:sandbox.esc,paneName:sandbox.paneName,waitingControls:functions.waitingControls});runInContext(source.slice(source.indexOf('    const seats=(H.panes'),source.indexOf('    const projHTML='))+'\nglobalThis.sidebar=chatsHTML;',context);return String((context as unknown as {sidebar:string}).sidebar)}
 return {H,S,cards,requests,toasts,functions,sandbox,click,sidebar,get finishes(){return finishes},get refreshes(){return refreshes},get busy(){return busy}};
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

test('74/97 window: sidebar/banner controls carry immutable project/pane/episode and disclose consequences',()=>{
 const view=ui();for(const compact of [false,true]){const html=view.functions.waitingControls(view.H.panes[0],waiting,view.H.project,compact);assert.match(html,/data-attempt-project="\/project-a"/);assert.match(html,/data-attempt-id="turn-a"/);assert.match(html,/data-attempt-pane="worker"/);assert.match(html,/data-attempt-action="retry"/);assert.match(html,/data-attempt-action="skip"/);assert.match(html,/более поздние задания/)}
 const damaged=view.functions.waitingControls(view.H.panes[0],{...waiting,turnInstanceId:'unreadable:worker:hash',recordSeqs:[],actions:['retry']},view.H.project);assert.doesNotMatch(damaged,/#|data-attempt-action="skip"/);assert.match(damaged,/всю очередь/);
 const finish=view.functions.waitingControls(view.H.panes[0],{...waiting,status:'recovering',actions:['finish']},view.H.project);assert.match(finish,/без вызова модели/);assert.doesNotMatch(finish,/data-attempt-action="retry"|data-attempt-action="skip"/);
});

test('74/97 window: both room and role sidebar paths show the same owner door',()=>{
 const view=ui();for(const pane of view.H.panes)pane.waiting=waiting;const rooms={H:view.H,all:[{pane:'worker',id:'cw',active:true,title:'роль'},{pane:'room',id:'cr',active:true,title:'разговор'}],cur:'/project-a',esc:(s:unknown)=>String(s),paneName:(p:{label:string})=>p.label,pinBtn:()=>'',waitingControls:view.functions.waitingControls};
 const context=createContext(rooms);runInContext(source.slice(source.indexOf('    const roleRow='),source.indexOf('    const shown='))+'\nglobalThis.testingRows={roleRow,roomRow};',context);const rows=(context as unknown as {testingRows:{roleRow(p:unknown):string;roomRow(c:unknown):string}}).testingRows;
 assert.match(rows.roleRow(view.H.panes[0]),/data-attempt-pane="worker"/);assert.match(rows.roomRow(rooms.all[1]),/data-attempt-pane="room"/);assert.doesNotMatch(rows.roomRow({...rooms.all[1],active:false}),/data-attempt-action/);
});

test('74 window: old button still sends its original binding and cannot remove another project card',async()=>{
 const view=ui();view.H.project='/project-b';view.functions.showWaiting(view.H.panes[0],{...waiting,turnInstanceId:'turn-b'},view.H.project);const card=view.cards.get('live-waiting');
 await view.click({attemptProject:'/project-a',attemptPane:'worker',attemptId:'turn-a',attemptAction:'skip'});assert.deepEqual(view.requests[0],{path:'/api/panes/worker/attempt',body:{project:'/project-a',turnInstanceId:'turn-a',action:'skip'}});assert.equal(view.cards.get('live-waiting'),card);assert.equal(view.refreshes,0);
});

test('74 window: current binding succeeds; missing transport remains a visible error',async()=>{
 const view=ui();view.functions.showWaiting(view.H.panes[0],waiting,view.H.project);await view.click({attemptProject:view.H.project,attemptPane:'worker',attemptId:'turn-a',attemptAction:'retry'});assert.equal(view.cards.size,0);assert.equal(view.refreshes,1);
 view.sandbox.fetch=async()=>{throw Error('offline')};await view.click({attemptProject:view.H.project,attemptPane:'worker',attemptId:'turn-a',attemptAction:'skip'});assert.match(view.toasts.at(-1)!,/нет связи/);
});

test('97 window: central API refusal opens the door, delayed response of another project cannot change its place',async()=>{
 const view=ui();view.sandbox.fetch=async()=>({json:async()=>({ok:false,pane:'worker',project:'/project-a',waiting})}) as unknown as Awaited<ReturnType<typeof view.sandbox.fetch>>;
 await view.functions.api('/api/panes/worker');assert.match(view.cards.get('live-waiting')!.innerHTML,/Повторить.*Пропустить/);
 view.H.project='/project-b';view.H.panes[0]!.waiting=null;view.cards.clear();await view.functions.api('/api/panes/worker');assert.equal(view.cards.size,0);assert.equal(view.H.panes[0]!.waiting,null);
 view.sandbox.fetch=async()=>({json:async()=>({ok:false,code:'restore_failed',project:'/project-b',error:'назначение не восстановлено'})}) as unknown as Awaited<ReturnType<typeof view.sandbox.fetch>>;await view.functions.api('/api/chat',{pane:'worker',message:'текст'});assert.match(view.cards.get('live-waiting')!.innerHTML,/Повторить восстановление проекта/);
});

for(const legacy of [false,true])test('TS-07 r2/2 + TS-10/124: cold window exposes the owner door for an uncertain first room turn with '+(legacy?'no legacy chat':'an analytic turn and empty message history'),async t=>{
 const h=await fixture(t,{seats:'{}'});await call(h.api,'/api/room',{body:{model:'w1',folder:false}});
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();throw new ProviderError('transport_lost','first room result unknown')};
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'room',message:'first question'}})).status,200);await h.runtime.idle();assert.equal(h.provider.calls.length,1);const chatsPath=h.runtime.project.state.chatsPath;await h.api.close();
 // Older projects can have only attempts.json. New failed model turns also persist chat.turns[], never a fabricated response.
 if(legacy)rmSync(chatsPath);
 const provider=new FakeProvider(),runtime=await createRuntime({...h.deps,providers:{claude:provider}},completedActions);t.after(()=>runtime.close());
 const api=createApi({runtime,siteDir:h.siteDir,indexFile:h.indexFile,port:0});await api.listen();t.after(()=>api.close());
 const status=await call(api,'/api/status'),chats=await call(api,'/api/chats');assert.equal(chats.body.chats.length,legacy?0:1);if(!legacy){assert.equal(chats.body.chats[0].messages,0);const spend=await call(api,'/api/spend');assert.equal(spend.body.totals.turns,1);assert.equal(spend.body.totals.outcomes.error,1)}const room=status.body.panes.find((p:{id:string})=>p.id==='room');assert.ok(room.waiting);
 const view=ui();view.H.on=true;view.functions.applyStatus(status.body);assert.equal(provider.calls.length,0);const card=view.cards.get('live-waiting')!;assert.ok(card);assert.match(card.innerHTML,/data-attempt-action="retry"/);assert.match(card.innerHTML,/data-attempt-action="skip"/);
 const sidebar=view.sidebar(chats.body.chats);assert.match(sidebar,/data-attempt-pane="room"/);assert.doesNotMatch(sidebar,/в проекте пока нет ролей и чатов/);
 view.sandbox.fetch=async(path,options)=>({json:async()=>(await call(api,path,{...(options?.body?{body:JSON.parse(options.body)}:{})})).body});
 await view.click({attemptProject:status.body.project,attemptPane:'room',attemptId:room.waiting.turnInstanceId,attemptAction:'skip'});await runtime.idle();assert.equal(runtime.waiting('room'),null);assert.equal(provider.calls.length,0);assert.equal(view.cards.size,0);
});

test('TS-07 r2/2: the room door is shown once even if its active chat is beyond the sidebar history limit',()=>{
 const view=ui();view.H.panes[1]!.waiting=waiting;
 for(const activeAt of [0,6]){
  const chats=Array.from({length:7},(_,i)=>({id:'c'+i,pane:'room',active:i===activeAt,title:'chat '+i,last:10-i})),html=view.sidebar(chats);
  assert.equal(html.match(/data-attempt-action="retry"/g)?.length,1);assert.equal(html.match(/data-attempt-action="skip"/g)?.length,1);
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
