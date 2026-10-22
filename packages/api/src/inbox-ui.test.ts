import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';

const source=readFileSync(new URL('../../../ui/deploy/inbox.js',import.meta.url),'utf8');
const sketch=readFileSync(new URL('../../../ui/sketches/disarto/22-inbox.html',import.meta.url),'utf8');
const now=Date.now(),stamp=new Date(now).toISOString();
const approval={pane:'worker',id:'ack:3',title:'Подтвердить отправку',detail:'Вопрос ревьюера'};
const status={project:'/a',panes:[{id:'worker',waiting:{status:'unsent',turnInstanceId:'turn-1',startedAt:now,actions:['retry','skip'],failure:{reason:'вход не подтверждён'}}},{id:'reviewer',kind:'reviewer',waiting:null}],approvals:[approval]};
const journal={project:'/a',records:[
  {seq:3,kind:'question',from:'worker',to:['owner'],text:'Подтвердить?',ts:stamp},
  {seq:4,kind:'verdict',from:'reviewer',to:['worker'],text:'Круг 2: исправить вывод',ts:stamp},
  {seq:5,kind:'question',from:'worker',to:['owner'],text:'Как продолжать?',ts:stamp},
]};
const chat={chat:{id:'chat-a',pane:'worker',title:'Сборка',last:Math.floor(now/1000)},messages:[{seq:1,role:'me',text:'Сделай',ts:Math.floor(now/1000)-20},{seq:2,role:'ai',text:'Готово',ts:Math.floor(now/1000)}]};
const trace={project:'/a',records:[{seq:9,kind:'network.failover',ts:stamp,data:{vendor:'claude',from:'exit-1',to:'exit-2'},reason:{text:'основной выход упал'}}]};
const limits={project:'/a',providers:[{vendor:'claude',label:'Claude',sourceConnected:true,fetchedAt:Math.floor(now/1000),windows:[{label:'неделя',percentUsed:83,resetsAt:Math.floor(now/1000)+86400}]}]};
function view(owner:Record<string,unknown>={}){
  const d=dom(sketch.slice(sketch.indexOf('<body>')+6,sketch.lastIndexOf('</body>')));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','inbox');
  const calls:{path:string;body?:any}[]=[],H={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,active:{worker:'chat-a'}},S={ui:{pane:'room',fresh:false,switched:false}},events:{onmessage?:Function}[]=[];
  const api=async(path:string,body?:any)=>{calls.push({path,body});if(path==='/api/status')return status;if(path==='/api/journal?limit=0')return journal;
    if(path==='/api/chats')return {chats:[chat.chat]};if(path==='/api/chats/chat-a')return chat;if(path.startsWith('/api/trace?'))return trace;
    if(path==='/api/limits')return limits;if(path==='/api/settings'&&!body)return {ok:true,owner};
    if(path==='/api/settings'&&body){Object.assign(owner,body.patch);return {ok:true,saved:owner}};
    if(path==='/api/approve')return {ok:true};throw Error('unexpected '+path)};
  const context:any={window:null,document:d.document,location:{href:''},Date,Set,Map,Number,Array,JSON,Promise,encodeURIComponent,CustomEvent:class{type:string;init:any;constructor(type:string,init:any){this.type=type;this.init=init}},dispatchEvent(){},addEventListener:d.window.addEventListener.bind(d.window),
    LIVE:{H,S,api,esc:(v:any)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),save(){},subscribeLiveEvents:()=>{const item={};events.push(item);return item}}};context.window=context;
  runInContext(source,createContext(context));return {d,H,S,owner,calls,context,events,async refresh(){await new Promise(resolve=>setImmediate(resolve));await context.HARNESS_INBOX.refresh();await new Promise(resolve=>setImmediate(resolve))},async settle(){await new Promise(resolve=>setImmediate(resolve))}};
}

test('TS-36B: six live source kinds, deduplicated approval/question, and one count function for page and rail',()=>{
  const v=view(),items=v.context.HARNESS_INBOX.collect({project:'/a',status,journal,chats:[chat],trace:trace.records,limits:limits.providers,update:{readyVersion:'0.2.0'},read:[]},now);
  assert.equal(items.filter((x:any)=>x.need).length,3);assert.equal(items.filter((x:any)=>x.type==='question').length,1);
  assert.deepEqual([...new Set(items.map((x:any)=>x.type))].sort(),['approval','chat','limit','network','question','update','verdict','waiting']);
  assert.equal(items.some((x:any)=>x.title.includes('Подтвердить?')),false);
  assert.equal(v.context.HARNESS_INBOX.collect({project:'/a',status:{...status,panes:status.panes.slice(0,1)},journal,chats:[],trace:[],limits:[]},now).some((x:any)=>x.type==='verdict'),false);
  const counts=v.context.HARNESS_INBOX.counts(items);assert.deepEqual(JSON.parse(JSON.stringify(counts)),{all:8,need:3,info:5});
  assert.equal(v.context.HARNESS_INBOX.collect({project:'/b',status,journal,chats:[chat],trace:[],limits:[]},now).length,0);
  assert.equal(v.context.HARNESS_INBOX.collect({project:'/a',status,journal,chats:[],trace:[],limits:[{...limits.providers[0],ok:false}]},now).some((x:any)=>x.type==='limit'),false);
});

test('TS-36B: owner settings retain read cards across window restart; pending decisions stay actionable',async()=>{
  const owner:Record<string,unknown>={},first=view(owner);await first.refresh();
  const read=first.d.document.querySelector('[data-inbox-read-all]');assert.ok(read);await read.emit('click');await first.settle();
  assert.ok(Array.isArray(owner.inboxRead));assert.equal((owner.inboxRead as string[]).length,7);
  const second=view(owner);await second.refresh();const current=second.context.HARNESS_INBOX.current;
  assert.equal(current.counts.need,3);assert.equal(current.counts.info,0);
  assert.equal(current.items.filter((x:any)=>x.read).length,7);
  assert.ok(second.d.document.querySelector('[data-inbox-feed]')!.innerHTML.includes('Отправить снова'));
});

test('TS-36B: allow/deny use chat approval API; waiting buttons carry exact project and episode',async()=>{
  const v=view();await v.refresh();
  const card=v.d.document.querySelector('[data-inbox-action="allow"]');assert.ok(card);await card.emit('click');await v.settle();
  assert.ok(v.calls.some(c=>c.path==='/api/approve'&&c.body.project==='/a'&&c.body.pane==='worker'&&c.body.id==='ack:3'&&c.body.decision==='allow'));
  assert.equal(v.context.HARNESS_INBOX.current.counts.need,2);
  assert.match(v.d.document.querySelector('[data-inbox-feed]')!.textContent,/Выполнено/);
  assert.equal(v.context.HARNESS_INBOX.current.items.at(-1).type,'approval');
  const retry=v.d.document.querySelector('[data-attempt-action="retry"]');assert.ok(retry);assert.equal(retry.dataset.attemptProject,'/a');assert.equal(retry.dataset.attemptPane,'worker');assert.equal(retry.dataset.attemptId,'turn-1');
  assert.equal(v.calls.some(c=>c.path.includes('/attempt')),false); // Existing live.js handler owns that action.
});

test('TS-36B: late response for another project cannot repaint or persist read state',async()=>{
  const v=view();await v.refresh();assert.ok(v.context.HARNESS_INBOX.current.items.length>0);
  v.H.project='/b';v.H.confirmedProjectGeneration++;
  await v.context.HARNESS_INBOX.refresh();assert.equal(v.context.HARNESS_INBOX.current.items.length,0);
  await v.d.document.querySelector('[data-inbox-read-all]')!.emit('click');await v.settle();assert.equal(v.calls.some(c=>c.path==='/api/settings'&&c.body),false);
});
