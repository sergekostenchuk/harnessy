import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {dom} from './ui-dom-test-helpers.ts';
import {deferred} from './test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/task-queue.js',import.meta.url),'utf8');
const tick=()=>new Promise<void>(r=>setImmediate(r));
const settled=async()=>{for(let n=0;n<10;n++)await tick()};
const task=(extra:any={})=>({taskId:'a'.repeat(64),n:1,text:'Проверить <img src=x>',to:null,assignedSeq:null,state:'unassigned',reason:'Ждёт назначения',expectedState:'b'.repeat(64),readonly:false,...extra});
function view(handler?:(path:string,body:any,H:any)=>Promise<any>){const d=dom('<section data-team-live="queue"><div data-task-queue="full"></div><div data-task-targets></div></section>');Object.assign(d.document,{body:d.body,documentElement:d.html});const H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{trace:{instanceId:'instance-a'}},panes:[{id:'worker',label:'Воркер',model:'w1',status:'idle'}]},requests:any[]=[],listeners=new Map<string,Function[]>();
 const data=()=>({ok:true,project:H.project,instance:H.liveStatus.trace.instanceId,tasks:[task()],outsideQueue:[]});
 const L={H,esc:(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)),subscribeLiveEvents(){return {}},async api(path:string,body:any){requests.push({path,body});return handler?handler(path,body,H):data()}};
 const box:any={document:d.document,window:null,crypto:{randomUUID},console,addEventListener:(type:string,fn:Function)=>listeners.set(type,[...listeners.get(type)||[],fn])};box.window=box;box.LIVE=L;runInContext(source,createContext(box));return {...d,H,requests,ui:box.HARNESS_TASK_QUEUE,listeners,data};
}
test('TS-39.1 queue renders every engine state and an honest error; no example queue or HTML injection',async()=>{
 const states=['unassigned','queued','work','review','done','blocked','partial','unknown'];let failure=false;const v=view(async(_path,_body,H)=>failure?{ok:false,error:'Журнал недоступен'}:{ok:true,project:H.project,instance:'instance-a',tasks:states.map((state,i)=>task({state,n:i+1,taskId:String(i).repeat(64)})),outsideQueue:[task({n:null,taskId:'journal:1',readonly:true,state:'queued'})]});await settled();
 for(const label of ['Без исполнителя','В очереди','В работе','На ревью','Готово','Заблокирована','Частично','Неизвестно','Вне очереди'])assert.ok(v.body.textContent.includes(label),label);assert.equal(v.body.querySelector('img'),null);assert.equal(v.body.querySelectorAll('[data-task-assign]').length,2);assert.doesNotMatch(v.body.textContent,/макет|TS-35/);
 failure=true;await v.ui.refresh(true);assert.match(v.body.textContent,/Журнал недоступен/);assert.equal(v.body.querySelector('[data-task-id]'),null);
});
test('TS-39.1 create via form/Enter uses one stable op after lost response, keeps draft and typed refusal',async()=>{
 let calls=0;const v=view(async(path,body,H)=>{if(body){calls++;if(calls===1)throw Error('Соединение прервано');return {ok:true,project:H.project,instance:'instance-a',task:task()}}return {ok:true,project:H.project,instance:'instance-a',tasks:[],outsideQueue:[]}});await settled();
 let input=v.body.querySelector('[data-task-text]')!;input.value='Сохранить черновик';await input.emit('input');await v.body.querySelector('[data-task-form]')!.emit('submit');await settled();assert.match(v.body.textContent,/Соединение прервано/);assert.equal(v.body.querySelector('[data-task-text]')!.value,'Сохранить черновик');
 await v.body.querySelector('[data-task-form]')!.emit('submit');await settled();const posts=v.requests.filter(r=>r.body);assert.equal(posts.length,2);assert.equal(posts[0].body.opId,posts[1].body.opId);assert.equal(posts[0].body.instance,'instance-a');assert.equal(v.body.querySelector('[data-task-text]')!.value,'');
});
test('TS-39.1 menu and drag/drop assign the displayed receipt, never a foreign project',async()=>{
 const v=view(async(path,body,H)=>body?{ok:false,error:'Назначение изменилось; обновите очередь'}:{ok:true,project:H.project,instance:H.liveStatus.trace.instanceId,tasks:[task()],outsideQueue:[]});await settled();const select=v.body.querySelector('[data-task-assign]')!;select.value='worker';await select.emit('change');await settled();assert.equal(v.requests.filter(r=>r.body)[0].body.expectedState,task().expectedState);assert.match(v.body.textContent,/Назначение изменилось/);
 const transfer={setData(){}};await v.body.querySelector('[data-task-id]')!.emit('dragstart',{dataTransfer:transfer});await v.body.querySelector('[data-task-target]')!.emit('drop',{dataTransfer:transfer});await settled();assert.equal(v.requests.filter(r=>r.body).length,2);
 await v.body.querySelector('[data-task-id]')!.emit('dragstart',{dataTransfer:transfer});v.H.project='/b';v.H.liveStatus.trace.instanceId='instance-b';await v.ui.refresh();await v.body.querySelector('[data-task-target]')!.emit('drop',{dataTransfer:transfer});await settled();assert.equal(v.requests.filter(r=>r.body).length,2);
});
test('TS-39.1 delayed read and form reply cannot overwrite A→B→A; drafts stay in their project',async()=>{
 const gate=deferred<any>();let hold=true;const v=view(async(_path,_body,H)=>hold?gate.promise:{ok:true,project:H.project,instance:H.liveStatus.trace.instanceId,tasks:[],outsideQueue:[]});v.H.project='/b';v.H.liveStatus.trace.instanceId='b';v.H.confirmedProjectGeneration++;hold=false;await v.ui.refresh();v.ui.state.drafts.set('/b','B draft');v.H.project='/a';v.H.liveStatus.trace.instanceId='new-a';v.H.confirmedProjectGeneration++;await v.ui.refresh();gate.resolve({ok:true,project:'/a',instance:'instance-a',tasks:[task()],outsideQueue:[]});await settled();assert.equal(v.body.querySelector('[data-task-id]'),null);assert.equal(v.ui.state.drafts.get('/b'),'B draft');
});
test('TS-39.1 retry after engine restart preserves the original operation and receipt',async()=>{
 let attempts=0;const v=view(async(_path,body,H)=>{if(body){attempts++;if(attempts===1)throw Error('response lost');return {ok:true,project:H.project,instance:H.liveStatus.trace.instanceId}}return {ok:true,project:H.project,instance:H.liveStatus.trace.instanceId,tasks:[],outsideQueue:[]}});await settled();v.ui.state.drafts.set('/a','Один эффект');await v.ui.create();v.H.liveStatus.trace.instanceId='instance-after-restart';await v.ui.refresh(true);await v.ui.create();const posts=v.requests.filter(r=>r.body);assert.equal(posts.length,2);assert.equal(posts[0].body.opId,posts[1].body.opId);assert.equal(posts[1].body.instance,'instance-a');assert.equal(v.ui.state.drafts.has('/a'),false);
});
test('TS-39.1 restart before intent: explicit project_changed permits a fresh retry without losing the draft',async()=>{
 let attempts=0;const v=view(async(_path,body,H)=>{if(body){attempts++;if(attempts===1)throw Error('lost before commit');if(body.instance!==H.liveStatus.trace.instanceId)return {ok:false,code:'project_changed',error:'Обновите очередь'};return {ok:true,project:H.project,instance:H.liveStatus.trace.instanceId}}return {ok:true,project:H.project,instance:H.liveStatus.trace.instanceId,tasks:[],outsideQueue:[]}});await settled();v.ui.state.drafts.set('/a','Сохранить');await v.ui.create();v.H.liveStatus.trace.instanceId='after';await v.ui.refresh(true);await v.ui.create();assert.equal(v.ui.state.drafts.get('/a'),'Сохранить');await v.ui.create();const posts=v.requests.filter(r=>r.body);assert.equal(posts.length,3);assert.equal(posts[0].body.opId,posts[1].body.opId);assert.notEqual(posts[1].body.opId,posts[2].body.opId);assert.equal(posts[2].body.instance,'after');assert.equal(v.ui.state.drafts.has('/a'),false);
});
