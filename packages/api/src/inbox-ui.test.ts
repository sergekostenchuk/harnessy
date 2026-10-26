import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';

const source=readFileSync(new URL('../../../ui/deploy/inbox.js',import.meta.url),'utf8');
const sketch=readFileSync(new URL('../../../ui/sketches/disarto/44-inbox.html',import.meta.url),'utf8');
const now=Date.now(),stamp=new Date(now).toISOString();
const approval={pane:'worker',id:'ack:3',title:'Подтвердить отправку',detail:'Вопрос ревьюера'};
const status={project:'/a',panes:[{id:'worker',waiting:{status:'unsent',turnInstanceId:'turn-1',startedAt:now,actions:['retry','skip'],failure:{reason:'вход не подтверждён'}}},{id:'reviewer',kind:'reviewer',waiting:null}],approvals:[approval]};
const journal={project:'/a',records:[
  {seq:3,kind:'question',from:'worker',to:['owner'],text:'Подтвердить?',ts:stamp},
  {seq:4,kind:'verdict',from:'reviewer',to:['worker'],text:'Круг 2: исправить вывод',ts:stamp},
  {seq:5,kind:'question',from:'worker',to:['owner'],text:'Как продолжать?',ts:stamp},
]};
const chat={chat:{id:'chat-a',pane:'worker',title:'Сборка',last:Math.floor(now/1000)},messages:[{seq:1,role:'me',text:'Сделай',ts:Math.floor(now/1000)-20},{seq:2,role:'ai',text:'Готово',ts:Math.floor(now/1000)}]};
const trace={ok:true,project:'/a',records:[{seq:9,kind:'network.failover',ts:stamp,data:{vendor:'claude',from:'exit-1',to:'exit-2'},reason:{text:'основной выход упал'}}]};
const limits={ok:true,project:'/a',providers:[{vendor:'claude',label:'Claude',sourceConnected:true,fetchedAt:Math.floor(now/1000),windows:[{label:'неделя',percentUsed:83,resetsAt:Math.floor(now/1000)+86400}]}]};
function view(owner:Record<string,unknown>={},decisionRows:any[]=[],proposalRows:any[]=[],records=journal.records,chatLast=chat.chat.last){
  const d=dom(sketch.slice(sketch.indexOf('<body>')+6,sketch.lastIndexOf('</body>')));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','inbox');
  const calls:{path:string;body?:any}[]=[],panelCounts:any[]=[],H={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,active:{worker:'chat-a'}},S={ui:{pane:'room',fresh:false,switched:false}},events:{onmessage?:Function}[]=[];
  const api=async(path:string,body?:any)=>{calls.push({path,body});if(path==='/api/status')return status;if(path==='/api/journal?limit=0')return {...journal,records};
    if(path==='/api/seats/proposals')return {ok:true,project:'/a',proposals:proposalRows};if(path==='/api/chats')return {chats:[{...chat.chat,last:chatLast}]};if(path==='/api/chats/chat-a')return {...chat,messages:[...chat.messages,...proposalRows.map(q=>({runtime:{turnInstanceId:q.turnInstanceId},role:'ai',text:'Состав',seq:99,ts:1}))]};if(path.startsWith('/api/trace?'))return trace;
    if(path==='/api/limits')return limits;if(path==='/api/autopilot/decisions')return {ok:true,project:'/a',decisions:decisionRows};if(path==='/api/settings'&&!body)return {ok:true,owner};
    if(path.endsWith('/cancel'))return {ok:false,code:'cancel_unavailable',error:'Отмена решения Автопилота ещё не реализована'};
    if(path==='/api/settings'&&body){Object.assign(owner,body.patch);return {ok:true,saved:owner}};
    if(path==='/api/approve'||path==='/api/chat')return {ok:true};throw Error('unexpected '+path)};
  const context:any={setTimeout:()=>1,clearTimeout(){},window:null,document:d.document,location:{href:''},Date,Set,Map,Number,Array,JSON,Promise,encodeURIComponent,CustomEvent:class{type:string;init:any;constructor(type:string,init:any){this.type=type;this.init=init}},dispatchEvent(){},addEventListener:d.window.addEventListener.bind(d.window),
    LIVE:{H,S,api,esc:(v:any)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),save(){},subscribeLiveEvents:()=>{const item={};events.push(item);return item}}};context.window=context;
  context.PS2={setInbox:(value:any)=>panelCounts.push({...value}),setData:(value:any)=>{if(value.inbox)panelCounts.push({...value.inbox})}};runInContext(source,createContext(context));return {d,H,S,owner,calls,panelCounts,context,events,async refresh(){await new Promise(resolve=>setImmediate(resolve));await context.HARNESS_INBOX.refresh();await new Promise(resolve=>setImmediate(resolve))},async settle(){await new Promise(resolve=>setImmediate(resolve))}};
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

test('TS-36B r2: one pending decision sends once and an action failure stays in its card',async()=>{
  const v=view();await v.refresh();let release!:(value:any)=>void,writes=0;
  const initial=v.context.LIVE.api;v.context.LIVE.api=(path:string,body?:any)=>path==='/api/approve'?(writes++,new Promise(resolve=>{release=resolve})):initial(path,body);
  const allow=v.d.document.querySelector('[data-inbox-action="allow"]')!;await allow.emit('click');await allow.emit('click');
  assert.equal(writes,1);assert.ok(v.d.document.querySelector('[data-inbox-action="deny"]')!.disabled);
  release({ok:false,error:'Вопрос уже закрыт'});await v.settle();
  const feed=v.d.document.querySelector('[data-inbox-feed]')!;assert.match(feed.textContent,/Вопрос уже закрыт/);assert.ok(feed.querySelector('[data-inbox-action="allow"]'));assert.equal(feed.querySelector('[role="alert"]'),null);
});

test('TS-36B r2: question is answered in its card; opening the chat remains separate',async()=>{
  const v=view();await v.refresh();const answer=v.d.document.querySelectorAll('[data-inbox-action="open"]').find(node=>node.textContent==='Ответить')!;await answer.emit('click');await v.settle();
  assert.equal(v.context.location.href,'');const field=v.d.document.querySelector('[data-inbox-reply]')!;assert.ok(field);
  field.value='Продолжайте с проверкой';await field.emit('input');await v.d.document.querySelector('[data-inbox-action="send"]')!.emit('click');await v.settle();
  assert.ok(v.calls.some(c=>c.path==='/api/chat'&&c.body.pane==='worker'&&c.body.kind==='decision'&&c.body.reply_to===5&&c.body.message==='Продолжайте с проверкой'));
  assert.equal(v.context.HARNESS_INBOX.current.counts.need,2);assert.match(v.d.document.querySelector('[data-inbox-feed]')!.textContent,/Выполнено/);
});

test('TS-36B r2: failed optional sources are visible; incomplete status does not complete a decision',async()=>{
  const v=view();await v.refresh();const before=v.context.HARNESS_INBOX.current.counts.need,initial=v.context.LIVE.api;
  v.context.LIVE.api=(path:string,body?:any)=>path.startsWith('/api/trace?')||path==='/api/limits'?Promise.reject(Error('источник недоступен')):initial(path,body);
  await v.refresh();assert.match(v.d.document.querySelector('[data-inbox-feed]')!.textContent,/События подключения недоступны.*Лимиты недоступны/);
  assert.doesNotMatch(v.d.document.querySelector('[data-inbox-connection]')!.textContent,/Подключено$/);
  v.context.LIVE.api=(path:string,body?:any)=>path==='/api/status'?Promise.resolve({project:'/a',panes:[]}):initial(path,body);
  await v.refresh();assert.equal(v.context.HARNESS_INBOX.current.counts.need,before);
  assert.match(v.d.document.querySelector('[data-inbox-feed]')!.textContent,/Данные входящих не подтверждены/);
  assert.equal(v.context.HARNESS_INBOX.current.items.filter((x:any)=>x.done).length,0);
});

test('TS-36B r2: a malformed successful-looking source is unavailable, not an empty inbox',async()=>{
  const v=view();await v.refresh();const initial=v.context.LIVE.api;
  v.context.LIVE.api=(path:string,body?:any)=>path.startsWith('/api/trace?')?Promise.resolve({ok:false,project:'/a',records:[]}):path==='/api/chats/chat-a'?Promise.resolve({chat:{id:'chat-a'}}):initial(path,body);
  await v.refresh();const feed=v.d.document.querySelector('[data-inbox-feed]')!;
  assert.match(feed.textContent,/События подключения недоступны/);assert.match(feed.textContent,/История чатов недоступна/);
  assert.doesNotMatch(v.d.document.querySelector('[data-inbox-connection]')!.textContent,/^Подключено$/);
});

test('TS-36B r3: live refresh keeps the active reply, selection, and the sidebar count',async()=>{
  const v=view();await v.refresh();
  const open=v.d.document.querySelectorAll('[data-inbox-action="open"]').find(node=>node.textContent==='Ответить')!;await open.emit('click');await v.settle();
  const before=v.d.document.querySelector('[data-inbox-reply]')!;before.value='Продолжить проверку';await before.emit('input');before.focus();before.setSelectionRange(5,8);
  await v.refresh();const after=v.d.document.querySelector('[data-inbox-reply]')!;
  assert.notEqual(after,before);assert.equal(v.d.document.activeElement,after);assert.equal(after.value,'Продолжить проверку');
  assert.deepEqual([after.selectionStart,after.selectionEnd],[5,8]);
  assert.deepEqual(v.panelCounts.at(-1),{...v.context.HARNESS_INBOX.current.counts});
});

test('TS-36B r4: panel badge and chat-list updates use the bound inbox count after resize',async()=>{
  const v=view();await v.refresh();const current=v.context.HARNESS_INBOX.current.counts;
  v.context.PS2.setInbox({need:0,info:0}); // panel A badges() on resize
  assert.deepEqual(v.panelCounts.at(-1),{...current});
  v.context.PS2.setData({live:true,inbox:{need:0,info:0}}); // panel A sideChats()
  assert.deepEqual(v.panelCounts.at(-1),{...current});
  v.H.project='/b';v.H.confirmedProjectGeneration++;
  v.context.PS2.setInbox({need:current.need,info:current.info});
  assert.deepEqual(v.panelCounts.at(-1),{all:0,need:0,info:0,unavailable:true});
  v.H.project='/a';v.H.confirmedProjectGeneration++;
  v.context.PS2.setData({inbox:{need:current.need,info:current.info}});
  assert.deepEqual(v.panelCounts.at(-1),{all:0,need:0,info:0,unavailable:true});
});

test('TS-38.3: durable applied decision becomes an inbox card; cancel stays a typed refusal in that card',async()=>{
  const id='a'.repeat(64),rows=[{version:1,project:'/a',at:stamp,entry:{state:'applied',decisionId:id,operation:'answer_question',question:{id:'journal:5',kind:'question',text:'Как продолжать?'},proposal:{answer:'Продолжить проверку',reason:'Ревьюер согласился с проверкой'},council:{orchestrator:{seat:'lead',model:'w1'},reviewer:{seat:'review',model:'w2'}},cost:{currency:'USD',amount:0.04,status:'measured'}}}];
  const v=view({},rows);await v.refresh();const feed=v.d.document.querySelector('[data-inbox-feed]')!;
  assert.match(feed.textContent,/Автопилот решил: Продолжить проверку/);assert.match(feed.textContent,/Ревьюер согласился/);assert.match(feed.textContent,/lead · w1; review · w2/);assert.match(feed.textContent,/0.04 USD/);
  await v.d.document.querySelector('[data-inbox-action="cancel"]')!.emit('click');await v.settle();
  assert.ok(v.calls.some(c=>c.path==='/api/autopilot/decisions/'+id+'/cancel'&&c.body.project==='/a'));
  assert.match(feed.textContent,/Отмена решения Автопилота ещё не реализована/);
  await v.d.document.querySelector('[data-inbox-action="ack"]')!.emit('click');await v.settle();assert.ok(Array.isArray(v.owner.inboxRead));
  assert.ok((v.owner.inboxRead as string[]).some(value=>value.includes(id)));
});

test('TS-38.3 r2: an operation without answer uses a human label',()=>{
 const id='d'.repeat(64),row={version:1,project:'/a',at:stamp,entry:{state:'applied',decisionId:id,operation:'stop_pane',question:{id:'waiting:1',kind:'waiting',text:'Ход завис'},proposal:{answer:null,reason:'Повтор запрещён'},council:{orchestrator:{seat:'lead',model:'w1'},reviewer:{seat:'review',model:'w2'}},cost:{currency:'USD',amount:null,status:'unavailable'}}};
 const v=view({},[row]),items=v.context.HARNESS_INBOX.collect({project:'/a',status,journal,chats:[],decisions:[row]});const card=items.find((x:any)=>x.type==='autopilotDecision');assert.equal(card.title,'Автопилот решил: Остановить ход');assert.doesNotMatch(card.title,/stop_pane/);
});

test('TS-38.3: missing decisions source is visible; forged project decision is not shown',async()=>{
  const v=view();await v.refresh();const initial=v.context.LIVE.api;
  v.context.LIVE.api=(path:string,body?:any)=>path==='/api/autopilot/decisions'?Promise.resolve({ok:true,project:'/foreign',decisions:[]}):initial(path,body);
  await v.refresh();assert.match(v.d.document.querySelector('[data-inbox-feed]')!.textContent,/Решения Автопилота недоступны/);
  const forged={version:1,project:'/foreign',at:stamp,entry:{state:'applied',decisionId:'b'.repeat(64),question:{id:'x',kind:'question',text:'чужой'},proposal:{reason:'чужое'},council:{orchestrator:{seat:'a',model:'a'},reviewer:{seat:'b',model:'b'}}}};
  assert.equal(v.context.HARNESS_INBOX.collect({project:'/a',status,journal,chats:[],decisions:[forged]}).some((x:any)=>x.type==='autopilotDecision'),false);
});

test('TS-38.3: a temporary source failure keeps an already seen autopilot decision',async()=>{
  const id='c'.repeat(64),rows=[{version:1,project:'/a',at:stamp,entry:{state:'applied',decisionId:id,operation:'answer_question',question:{id:'journal:5',kind:'question',text:'Продолжать?'},proposal:{answer:'Да',reason:'После проверки'},council:{orchestrator:{seat:'lead',model:'w1'},reviewer:{seat:'review',model:'w2'}},cost:{currency:'USD',amount:null,status:'unavailable'}}}];
  const v=view({},rows);await v.refresh();assert.ok(v.context.HARNESS_INBOX.current.items.some((x:any)=>x.type==='autopilotDecision'));
  const initial=v.context.LIVE.api;v.context.LIVE.api=(path:string,body?:any)=>path==='/api/autopilot/decisions'?Promise.reject(Error('offline')):initial(path,body);
  await v.refresh();const feed=v.d.document.querySelector('[data-inbox-feed]')!;assert.match(feed.textContent,/Решения Автопилота недоступны/);assert.match(feed.textContent,/Автопилот решил: Да/);
});


test('TS-44: registered team proposal replaces technical question and opens its chat card',()=>{
 const v=view(),proposal={proposalId:'team-1',version:2,from:'worker',questionSeq:22,turnInstanceId:'call-a',seats:[{},{}]};
 const record={seq:22,kind:'question',from:'harness',to:['owner'],origin:'team-proposal',text:'technical parameters',ts:stamp};
 const rows=v.context.HARNESS_INBOX.collect({project:'/a',status,journal:{project:'/a',records:[record]},proposals:[proposal],chats:[{chat:chat.chat,messages:[{runtime:{turnInstanceId:'call-a'}}]}]},now);
 const row=rows.find((r:any)=>r.type==='teamProposal');assert.ok(row);assert.equal(row.title,'Состав команды · версия 2 · 2 роли');assert.equal(row.chat,'chat-a');assert.equal(rows.filter((r:any)=>r.record?.seq===22).length,0);
 const forged=v.context.HARNESS_INBOX.collect({project:'/a',status,journal:{project:'/a',records:[{...record,from:'worker'}]},proposals:[proposal]},now);assert.equal(forged.some((r:any)=>r.type==='teamProposal'),false);
});


test('TS-44: old inbox proposal action opens the registered proposal instead of a reply editor',async()=>{
 const proposal={proposalId:'p123',version:2,from:'worker',questionSeq:22,turnInstanceId:'call-a',seats:[{},{}]},record={seq:22,kind:'question',from:'harness',to:['owner'],origin:'team-proposal',text:'technical parameters',ts:stamp};
 const v=view({},[],[proposal],[record],1);await v.refresh();const row=v.d.document.querySelectorAll('[data-inbox-id]').find(r=>r.textContent.includes('Состав команды · версия 2 · 2 роли'));assert.ok(row);assert.doesNotMatch(row.textContent,/technical parameters|Ответить/);
 const button=row.querySelector('[data-inbox-action="open"]')!;assert.equal(button.textContent,'Открыть состав');await button.emit('click');await v.settle();assert.equal(v.context.location.href,'01-chat.html#team=p123');assert.equal(v.S.ui.pane,'worker');assert.equal(v.d.document.querySelector('[data-inbox-reply]'),null);
});


test('TS-44: missing proposal metadata cannot turn a team card into a technical reply',async()=>{
 const record={seq:22,kind:'question',from:'harness',to:['owner'],origin:'team-proposal',text:'raw internal proposal data',ts:stamp},v=view({},[],[],[record]);await v.refresh();const row=v.d.document.querySelectorAll('[data-inbox-id]').find(r=>r.textContent.includes('Состав команды недоступен'));assert.ok(row);assert.doesNotMatch(row.textContent,/raw internal|Ответить/);assert.ok(row.querySelector('[data-inbox-retry]'));assert.equal(row.querySelector('[data-inbox-action]'),null);
});
