import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const source=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
type Card={id:string;dataset:Record<string,string>;style:Record<string,string>;innerHTML:string;remove():void};
function ui(){
 const cards=new Map<string,Card>(),listeners:((event:unknown)=>Promise<void>)[]=[],requests:{path:string;body:unknown}[]=[],toasts:string[]=[];
 const H={project:'/project-a',panes:[{id:'worker',label:'воркер',waiting:null},{id:'room',label:'без роли',waiting:null}] as {id:string;label:string;waiting:unknown}[],cur:null as null|{text:string;tools:unknown[]},pane:{id:'worker',model:'w1',label:'воркер'},asks:{}},S={chat:[]};let finishes=0,refreshes=0;
 const document={createElement(){const c:Card={id:'',dataset:{},style:{},innerHTML:'',remove(){cards.delete(c.id)}};return c},body:{appendChild(c:Card){cards.set(c.id,c)}},getElementById(id:string){return cards.get(id)},addEventListener(_kind:string,fn:(event:unknown)=>Promise<void>){listeners.push(fn)}};
 const sandbox={H,S,document,fetch:async(path:string,options?:{body:string})=>{requests.push({path,body:options?.body?JSON.parse(options.body):null});return {json:async()=>({ok:true})}},esc:(s:unknown)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:{label:string})=>p.label,
 finish(){finishes++;H.cur=null},refreshStatus:async()=>{refreshes++},refreshChats:async()=>{},sideChats(){},toast:(s:string)=>toasts.push(s),now:()=>1,save(){},render(){},drawLive(){},log(){},setTimeout(){}};
 const context=createContext(sandbox);
 const helpers=source.slice(source.indexOf('  const api='),source.indexOf('  // End TS-07 waiting controls.'));
 const events=source.slice(source.indexOf('  function hEvent('),source.indexOf('  const isDirect='));
 runInContext(helpers+'\n'+events+'\nglobalThis.testing={api,hEvent,consumeState,waitingControls,showWaiting,showRestore};',context);
 const functions=(context as unknown as {testing:{api(path:string,body?:unknown):Promise<unknown>;hEvent(e:unknown):void;consumeState(e:unknown):void;waitingControls(p:unknown,info:unknown,project:string,compact?:boolean):string;showWaiting(p:unknown,info:unknown,project:string):void;showRestore(project:string,error:string):void}}).testing;
 async function click(dataset:Record<string,string>){const button={dataset,disabled:false};let stopped=false;await listeners[0]!({target:{closest(){return button}},preventDefault(){},stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(button.disabled,false)}
 return {H,S,cards,requests,toasts,functions,sandbox,click,get finishes(){return finishes},get refreshes(){return refreshes}};
}
const waiting={status:'uncertain',recordSeqs:[36],startedAt:1,turnInstanceId:'turn-a',actions:['retry','skip']};

test('77 window: SSE replay cannot finish an active answer; idle/new episode/project are independent',()=>{
 const view=ui(),ev={type:'error',pane:'worker',warning:'worker:turn-a:error',message:'ошибка',replay:true};
 view.functions.hEvent(ev);assert.equal(view.finishes,1);view.H.cur={text:'новый ответ',tools:[]};const active=view.H.cur;
 for(let i=0;i<4;i++)view.functions.hEvent(ev);assert.equal(view.finishes,1);assert.equal(view.H.cur,active);view.functions.hEvent({type:'delta',text:' продолжается'});assert.equal(active.text,'новый ответ продолжается');
 view.functions.consumeState({pane:'worker',status:'idle',waiting:null});view.functions.hEvent(ev);assert.equal(view.finishes,2);
 view.functions.hEvent({...ev,warning:'worker:turn-b:error'});assert.equal(view.finishes,3);view.H.project='/project-b';view.functions.hEvent(ev);assert.equal(view.finishes,4);
});

test('77 window: note replay is shown once, ordinary events remain visible',()=>{
 const view=ui(),ev={type:'note',text:'ожидание',pane:'worker',warning:'worker:turn-a:uncertain',replay:true};view.functions.hEvent(ev);view.H.cur={text:'ответ',tools:[]};view.functions.hEvent(ev);assert.equal(view.S.chat.length,1);assert.equal(view.finishes,0);assert.equal(view.H.cur.text,'ответ');
 view.functions.hEvent({type:'note',text:'другая заметка'});assert.equal(view.S.chat.length,2);assert.equal(view.finishes,1);
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
