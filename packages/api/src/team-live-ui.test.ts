import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';

const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const canvas=read('ui/sketches/disarto/team-canvas.js');
const live=read('ui/deploy/team-live.js');
const legacy=read('ui/deploy/live.js');
const proto=read('ui/deploy/proto.js');
const part=(source:string,start:string,end:string)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const escape=(value:unknown)=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]!));
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<8;i++)await tick()};
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const until=async(predicate:()=>boolean)=>{for(let i=0;i<100;i++){if(predicate())return;await tick()}throw Error('condition was not reached')};

const record=(seq=1,from='worker',to=['orch'])=>({seq,ts:'2026-10-23T12:00:00.000Z',from,to,kind:'answer',thread:'current',text:'живое сообщение <img src=x>'});
const pane=(id:string,kind:string|null,chat:string|null)=>({id,label:id==='orch'?'Оркестратор':id==='worker'?'Воркер':'Роль',role:kind||'worker',kind,vendor:'claude',model:id==='worker'?'worker-model':'orch-model',mode:'read',status:'idle',busy:id==='worker',pendingApprovals:0,pending:0,waiting:null,turn:null,chat,instructionPath:id==='worker'?'.harness/roles/worker.md':null,queue:[],context:{used:170,window:200000,pct:0.1,measured:true,last:{input:100,output:20,cacheRead:30},turns:1}});
const snapshot=(project='/project-a',panes:any[]=[pane('orch','orchestrator','chat-orch'),pane('worker','worker','chat-worker')])=>({ok:true,project,instance:project+'-instance',policy:{ok:true,routes:[{from:['orchestrator'],to:['worker'],kinds:['task'],trigger:'wake'}]},generatedAt:Date.now(),halted:false,team:{path:project+'/.harness/team.yaml',integrationBranch:'main'},journal:{records:[record()],total:1,lastSeq:1},panes});
const chat=(id:string,paneId:string,text='Последняя живая реплика')=>({chat:{id,pane:paneId,revision:7,documents:[{project:'/project-a',path:'README.md'}]},messages:[{role:'me',text:'Вопрос владельца',ts:Date.now()-2000},{role:'assistant',text,ts:Date.now()-1000}]});
const settingsBinding=(id:string,project='/project-a')=>({project,instanceId:project.endsWith('-b')?'instance-b':'instance-a',pane:id,chat:'chat-'+id,revision:1,mode:'read',networkGeneration:null});

type ApiHandler=(path:string,body:unknown)=>unknown|Promise<unknown>;
function teamUi(mode:'work'|'constructor'|'queue',handler?:ApiHandler,options:any={}){
 const d=dom('<aside class="side ps"></aside><section class="main tc-main" data-team-live="'+mode+'"><div class="spec-banner">Макет · граница данных</div><div class="tc-live-loading">Загрузка</div></section>');
 Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:true,snapshotOnly:false,project:'/project-a',projectRequestGeneration:0,confirmedProjectGeneration:0,models:{claude:[{id:'orch-model',label:'Opus live'},{id:'worker-model',label:'Sonnet live'}],codex:[{id:'new-model',label:'Codex live'}]},turnModes:{claude:{read:{ok:true},all:{ok:true}},codex:{read:{ok:true},all:{ok:true}}},roleCatalog:[{role:'orchestrator',kind:'orchestrator',label:'Оркестратор',description:'ведёт ход',available:true},{role:'reviewer',kind:'reviewer',label:'Ревьюер',available:false,reason:'роль создаёт оркестратор'}],active:{room:'room-chat'},panes:[{id:'orch',busy:false,settingsBinding:settingsBinding('orch')},{id:'worker',busy:false,settingsBinding:settingsBinding('worker')}],...options.H};
 const state:any=options.state||{ui:{pane:'room'}},requests:Array<{path:string;body:unknown}>=[],toasts:string[]=[],subscriptions:any[]=[],location:any={href:'',hash:'',pathname:mode==='work'?'/04-swarm.html':'/41-team-'+mode+'.html'};
 const fallback:ApiHandler=async(path,body)=>{
  if(path==='/api/swarm')return snapshot(H.project);
  if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');
  if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');
  if(path==='/api/chats/room-chat')return chat('room-chat','room');
  if(path.startsWith('/api/project/file?'))return {ok:true,project:H.project,path:'.harness/roles/worker.md',instance:'/project-a-instance',hash:'a'.repeat(64),sharedWith:['worker'],text:'# Живая инструкция\nПроверяй итог.'};
  if(path==='/api/assign'||path==='/api/chat'||path.startsWith('/api/panes/'))return {ok:true};
  throw Error('unexpected request '+path+' '+JSON.stringify(body));
 };
 const LIVE:any={H,S:state,esc:escape,async api(path:string,body?:unknown){requests.push({path,body});return (handler||fallback)(path,body)},async refreshStatus(){return true},subscribeLiveEvents(callback:any){const stream={callback,closed:false,close(){this.closed=true}};subscriptions.push(stream);return stream},toast(text:string){toasts.push(text)},save(){}};
 const viewport=()=>({fit(){},takeSuppress(){return false},zoomAt(){},cw(){return 900},chh(){return 600}});
 const timers=new Map<number,()=>void>();let timerId=0;
 const context:any={setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId},clearTimeout:(id:number)=>timers.delete(id),document:d.document,location,LIVE,crypto:webcrypto,OMCORE:{esc:escape,cubic:(...values:number[])=>'M'+values.join(' '),midOf:()=>[10,10],fwdPath:()=>({d:'M0 0L10 10',m:[5,5]}),viewport},addEventListener:d.window.addEventListener.bind(d.window),URLSearchParams};
 context.window=context;
 const vm=createContext(context);runInContext(canvas,vm);runInContext(live,vm);
 const root=d.document.querySelector('[data-team-live]')!;
 const find=(selector:string)=>{const node=root.querySelector(selector);assert.ok(node,selector);return node};
 return {...d,H,state,requests,toasts,subscriptions,location,context,root,find,settle,timers};
}

test('36D: live work canvas uses project seats, chats, usage and channel, and the orchestrator card is the same chat',async()=>{
 const v=teamUi('work');await v.settle();
 assert.equal(v.root.querySelectorAll(':scope > .spec-banner').length,1);assert.equal(v.root.firstElementChild!.classList.contains('spec-banner'),true);
 assert.match(v.root.textContent,/Оркестратор/);assert.match(v.root.textContent,/Воркер/);assert.match(v.root.textContent,/Opus live/);assert.match(v.root.textContent,/Sonnet live/);
 assert.match(v.root.textContent,/Последняя живая реплика/);assert.match(v.root.textContent,/150 ток/);assert.match(v.root.textContent,/Воркер → Оркестратор · живое сообщение <img src=x>/);assert.equal(v.root.querySelector('img'),null);
 const input=v.find('[data-team-chat-input]');input.value='Проверь живую сдачу';await v.find('[data-team-send]').emit('click');await v.settle();
 assert.deepEqual(plain(v.requests.find(row=>row.path==='/api/chat')),{path:'/api/chat',body:{pane:'orch',message:'Проверь живую сдачу'}});
 await v.find('[data-team-open-chat]').emit('click');assert.equal(v.state.ui.pane,'orch');assert.equal(v.location.href,'01-chat.html');
 assert.equal(v.subscriptions.length,1);await v.window.emit('pagehide');assert.equal(v.subscriptions[0].closed,true);await v.window.emit('pageshow',{persisted:true});await v.settle();assert.equal(v.subscriptions.length,2);
});

test('36D: a page without a historical top bar keeps the SPEC banner inside main, outside the sidebar grid',()=>{
 const d=dom('<div class="frame"><div class="app"><aside class="side ps"></aside><section class="main" data-team-live="work"></section></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const context:any={KEY:'swarm',document:d.document};context.window=context;runInContext(part(proto,'  // TS-15a specification','  // End TS-15a specification'),createContext(context));
 const banner=d.document.querySelector('.spec-banner')!,main=d.document.querySelector('.main')!,app=d.document.querySelector('.app')!;assert.equal(banner.parentElement,main);assert.equal(app.children.includes(banner),false);
});

test('39.2: the live constructor has no page-wide mock banner; only editing connections is mocked',async()=>{
 const d=dom('<div class="frame"><div class="app"><section class="main" data-team-live="constructor"></section></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const context:any={KEY:'teamcons',document:d.document};context.window=context;runInContext(part(proto,'  // TS-15a specification','  // End TS-15a specification'),createContext(context));assert.equal(d.document.querySelector('.spec-banner'),null);
 const v=constructorUi();await v.settle();assert.match(v.find('[data-team-policy]').textContent,/макет · редактирование связей/);assert.doesNotMatch(v.find('[data-team-instruction]').textContent,/макет/);
});

test('36D: clean live team boot never enters the historical swarm overlay controller',()=>{
 const d=dom('<div class="frame"><section class="main" data-team-live="work"></section></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});let overlayQueries=0;
 const query=d.document.querySelector.bind(d.document);d.document.querySelector=(selector:string)=>{if(selector.includes('#ovl'))overlayQueries++;return query(selector)};
 const sandbox:any={PAGE:'swarm',document:d.document,H:{on:true,snapshotOnly:false,project:'/project-a',projectRequestGeneration:0,confirmedProjectGeneration:0}};sandbox.window=sandbox;
 const context=createContext(sandbox);runInContext(part(legacy,'  const swarmRoot=','  const swCount=')+'\nglobalThis.historicalSwarmRoot=swarmRoot;',context);
 assert.equal(context.historicalSwarmRoot(),null);assert.equal(overlayQueries,0,'new live DOM must not query the missing historical overlay');
});

test('36D: + role uses the confirmed room receipt and never invents a door for unavailable roles',async()=>{
 const requests:Array<{path:string;body:unknown}>=[];
 const v=teamUi('work',async(path,body)=>{requests.push({path,body});if(path==='/api/swarm')return snapshot('/project-a',[pane('worker','worker','chat-worker')]);if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');if(path==='/api/chats/room-chat')return chat('room-chat','room');if(path==='/api/assign')return {ok:true};throw Error('unexpected '+path)});await v.settle();
 await v.find('[data-team-role="orchestrator"]').emit('click');await v.settle();
 assert.deepEqual(plain(requests.find(row=>row.path==='/api/assign')),{path:'/api/assign',body:{role:'orchestrator',chat:'room-chat',project:'/project-a',revision:7,documents:[{project:'/project-a',path:'README.md'}]}});
 const before=requests.length,disabled=v.find('[data-team-role="reviewer"]');assert.equal(disabled.disabled,true);await disabled.emit('click');await v.settle();assert.equal(requests.length,before);
});

test('36D: + role refuses an incomplete or forged room receipt before /api/assign',async()=>{
 const requests:Array<{path:string;body:unknown}>=[];
 const v=teamUi('work',async(path,body)=>{requests.push({path,body});if(path==='/api/swarm')return snapshot('/project-a',[pane('worker','worker','chat-worker')]);if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');if(path==='/api/chats/room-chat')return {chat:{id:'room-chat',pane:'room',documents:[]},messages:[]};throw Error('unexpected '+path)});await v.settle();
 await v.find('[data-team-role="orchestrator"]').emit('click');await v.settle();assert.equal(requests.some(row=>row.path==='/api/assign'),false);assert.match(v.find('.tc-live-error').textContent,/Разговор без роли изменился/);
});

test('36D: constructor keeps model/mode save separate from the versioned instruction editor',async()=>{
 const mutations:Array<{path:string;body:unknown}>=[];
 const data=snapshot();data.panes[1]!.busy=false;const v=teamUi('constructor',async(path,body)=>{if(path==='/api/swarm')return data;if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');if(path.startsWith('/api/project/file?'))return {ok:true,project:'/project-a',path:'.harness/roles/worker.md',instance:'/project-a-instance',hash:'a'.repeat(64),sharedWith:['worker'],text:'# Настоящая инструкция роли'};if(path.startsWith('/api/panes/')){mutations.push({path,body});return {ok:true,pane:{id:'worker',vendor:'codex',model:'new-model',mode:'all',settingsBinding:settingsBinding('worker')}}}throw Error('unexpected '+path)});await v.settle();
 assert.equal(v.find('[data-team-count]').textContent,'2 ролей');assert.equal(v.find('[data-team-link]').textContent,'подключено');
 await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();assert.match(v.find('[data-team-instruction]').textContent,/Настоящая инструкция роли/);assert.ok(v.find('[data-team-instruction-save]'));assert.doesNotMatch(v.find('[data-team-instruction]').textContent,/нет API записи|макет/);
 for(const select of v.root.querySelectorAll('[data-team-model],[data-team-mode]'))select.value=select.dataset.original!;
 const worker=v.find('[data-team-pane="worker"]'),model=worker.querySelector('[data-team-model]')!,mode=worker.querySelector('[data-team-mode]')!;model.value='codex/new-model';mode.value='all';
 await model.emit('change');await v.context.TEAM_LIVE.refresh(true);await v.settle();const redrawnModel=v.find('[data-team-pane="worker"] [data-team-model]'),redrawnMode=v.find('[data-team-pane="worker"] [data-team-mode]');assert.notEqual(redrawnModel,model);assert.equal(redrawnModel.value,'codex/new-model');assert.equal(redrawnMode.value,'all','unsaved draft survives a live redraw');
 await v.find('[data-team-save]').emit('click');await v.settle();assert.deepEqual(plain(mutations),[{path:'/api/panes/worker',body:{vendor:'codex',model:'new-model',mode:'all',binding:settingsBinding('worker')}}]);
 assert.equal(v.requests.some(row=>/instruction|role/.test(row.path)&&!row.path.startsWith('/api/project/file?')),false,'saving model and mode does not write the instruction');
 v.H.panes.find((row:any)=>row.id==='worker').settingsBinding=undefined;await v.context.TEAM_LIVE.refresh(true);await v.settle();for(const select of v.root.querySelectorAll('[data-team-model],[data-team-mode]'))select.value=select.dataset.original!;v.find('[data-team-pane="worker"] [data-team-model]').value='codex/new-model';await v.find('[data-team-save]').emit('click');await v.settle();assert.equal(mutations.length,1);assert.match(v.find('.tc-live-error').textContent,/подтвердить настройки места/);
});

test('36D r3: a model-only draft preserves rights narrowed by another window',async()=>{
 const mutations:Array<{path:string;body:any}>=[],worker={...pane('worker','worker',null),busy:false,mode:'all'};let data=snapshot('/project-a',[worker]);
 const initialReceipt={...settingsBinding('worker'),mode:'all'},v=teamUi('constructor',async(path,body:any)=>{if(path==='/api/swarm')return data;if(path.startsWith('/api/panes/')){mutations.push({path,body});return {ok:true,pane:{id:'worker',vendor:body.vendor,model:body.model,mode:body.mode}}}throw Error('unexpected '+path)},{H:{panes:[{id:'worker',busy:false,settingsBinding:initialReceipt}]}});await v.settle();
 const model=v.find('[data-team-pane="worker"] [data-team-model]');model.value='codex/new-model';await model.emit('change');
 const narrowed={...worker,mode:'read'};data=snapshot('/project-a',[narrowed]);const currentReceipt={...settingsBinding('worker'),revision:2,mode:'read'};v.H.panes[0].settingsBinding=currentReceipt;await v.context.TEAM_LIVE.refresh(true);await v.settle();
 assert.equal(v.find('[data-team-pane="worker"] [data-team-model]').value,'codex/new-model');assert.equal(v.find('[data-team-pane="worker"] [data-team-mode]').value,'read');
 await v.find('[data-team-save]').emit('click');await v.settle();assert.deepEqual(plain(mutations),[{path:'/api/panes/worker',body:{vendor:'codex',model:'new-model',mode:'read',binding:currentReceipt}}]);
});

test('36D: an A constructor cannot save through a B receipt while the B snapshot is pending',async()=>{
 const mutations:Array<{path:string;body:unknown}>=[],b=deferred<any>();let project='/project-a',bReads=0;
 const aPane={...pane('worker','worker',null),label:'A воркер',busy:false},bPane={...pane('worker','worker',null),label:'B воркер',busy:false,model:'b-model'};
 const v=teamUi('constructor',async(path,body)=>{if(path==='/api/swarm'){if(project==='/project-a')return snapshot('/project-a',[aPane]);bReads++;return b.promise}if(path.startsWith('/api/panes/')){mutations.push({path,body});return {ok:true}}throw Error('unexpected '+path)});await v.settle();
 const model=v.find('[data-team-pane="worker"] [data-team-model]');model.value='codex/new-model';await model.emit('change');project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;v.H.panes=[{id:'worker',busy:false,settingsBinding:settingsBinding('worker','/project-b')}];
 await v.find('[data-team-save]').emit('click');await v.settle();assert.equal(mutations.length,0);assert.match(v.find('.tc-live-error').textContent,/Проект изменился/);
 await v.window.emit('live:status');await until(()=>bReads===1);assert.equal(v.find('[data-team-save]').disabled,false);assert.match(v.root.textContent,/A воркер/);assert.match(v.find('.tc-live-error').textContent,/Дождитесь состава нового проекта/);assert.equal(mutations.length,0);
 b.resolve(snapshot('/project-b',[bPane]));await v.settle();assert.match(v.root.textContent,/B воркер/);assert.equal(v.find('[data-team-pane="worker"] [data-team-model]').value,'claude/b-model','A draft never becomes a B draft');assert.equal(v.find('[data-team-save]').disabled,false);
});

test('36D: an A → B → A project change during /api/swarm discards the old response and drains the queued refresh',async()=>{
 const gates:Array<{project:string;gate:ReturnType<typeof deferred<any>>}>=[];
 let project='/project-a';const v=teamUi('work',async path=>{if(path.startsWith('/api/chats/'))return chat(path.split('/').pop()!,'worker');const gate=deferred<any>();gates.push({project,gate});return gate.promise});
 await until(()=>gates.length===1);project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');project=v.H.project='/project-a';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');gates[0]!.gate.resolve(snapshot('/project-a',[{...pane('worker','worker',null),label:'Старый проект'}]));await until(()=>gates.length===2);gates[1]!.gate.resolve(snapshot('/project-a',[{...pane('worker','worker',null),label:'Новый проект'}]));await v.settle();
 assert.match(v.root.textContent,/Новый проект/);assert.doesNotMatch(v.root.textContent,/Старый проект/);assert.equal(v.context.TEAM_LIVE.state.loading,false);assert.equal(v.context.TEAM_LIVE.state.queued,false);
});

test('TS-39.1: missing live team data stays honest; the queue mounts the journal-backed surface, never QUEUE0',async()=>{
 const offline=teamUi('work',async()=>{throw Error('нет связи')});await offline.settle();assert.match(offline.root.textContent,/нет связи/);assert.doesNotMatch(offline.root.textContent,/виджет лимитов|TS-35/);
 const queue=teamUi('queue');await queue.settle();assert.ok(queue.root.querySelector('[data-task-queue="full"]'));assert.ok(queue.requests.some(row=>row.path==='/api/swarm'));assert.doesNotMatch(queue.root.textContent,/в движке очереди нет|пример · не данные движка/);assert.doesNotMatch(live,/QUEUE0|bindQueue/);
});

test('TS-44 rebase: live queue and orchestrator draft survive the same canvas refresh',async()=>{
 const v=teamUi('work');let draws=0;
 v.context.HARNESS_TASK_QUEUE={draw(){const queue=v.root.querySelector('[data-task-queue="preview"]');if(queue){queue.textContent='Живая задача';draws++}}};
 await v.settle();const queue=v.find('[data-task-queue="preview"]');assert.ok(draws>0);assert.match(queue.textContent,/Живая задача/);
 const input=v.find('[data-team-chat-input]');input.value='Сохранённый черновик';input.focus();input.setSelectionRange(1,5);
 await v.context.TEAM_LIVE.refresh(true);await v.settle();
 assert.equal(v.find('[data-task-queue="preview"]'),queue);assert.match(queue.textContent,/Живая задача/);
 const restored=v.find('[data-team-chat-input]');assert.equal(restored.value,'Сохранённый черновик');assert.equal(v.document.activeElement,restored);assert.deepEqual([restored.selectionStart,restored.selectionEnd],[1,5]);
});


test('TS-43: failed team read is unavailable rather than missing orchestrator; automatic retry restores data',async()=>{
 let broken=true;const ui=teamUi('work',async path=>{if(broken)throw Error('503');if(path==='/api/swarm')return snapshot();if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');throw Error(path)});await ui.settle();
 assert.match(ui.find('[data-team-error]').textContent,/503/);assert.ok(ui.find('[data-team-refresh]'));assert.equal(ui.root.querySelector('[data-key="missing-orchestrator"]'),null);assert.equal(ui.timers.size,1);
 broken=false;[...ui.timers.values()][0]!();await ui.settle();assert.equal(ui.context.TEAM_LIVE.state.error,null);assert.ok(ui.root.querySelector('[data-key="orch"]'));assert.equal(ui.timers.size,0);
 broken=true;await ui.context.TEAM_LIVE.refresh();assert.match(ui.find('[data-team-error]').textContent,/Последний снимок устарел/);assert.equal(ui.find('[data-team-send]').disabled,true);await ui.window.emit('pagehide');assert.equal(ui.timers.size,0);
});


test('TS-43 r2: full role name is escaped, opens without hover and closes on Escape with focus restored',async()=>{
 const name='Аналитик договора поставки оборудования <img src=x>',data=snapshot('/project-a',[{...pane('worker','worker',null),label:name}]);
 const v=teamUi('work',async path=>{assert.equal(path,'/api/swarm');return data});await v.settle();
 const nameButton=v.find('.tc-card .l1 [data-tc-reveal]'),full=nameButton.nextElementSibling!;
 assert.equal(nameButton.getAttribute('title'),name);assert.equal(full.hasAttribute('hidden'),true);assert.equal(v.root.querySelector('img'),null);assert.equal(v.find('.tc-card .md').textContent,'Sonnet live');
 await nameButton.emit('click');assert.equal(Reflect.get(full,'hidden'),false);assert.equal(full.textContent,name);assert.equal(nameButton.getAttribute('aria-expanded'),'true');
 await v.window.emit('keydown',{key:'Escape'});assert.equal(Reflect.get(full,'hidden'),true);assert.equal(v.document.activeElement,nameButton);
 await nameButton.emit('click');await v.body.emit('click');assert.equal(Reflect.get(full,'hidden'),true);
});

for(const mode of ['work','constructor'] as const)test('TS-43 r2: '+mode+' expands the same unavailable reason without assigning the role',async()=>{
 const reason='Участников создаёт оркестратор по подтверждённому предложению <script>bad()</script>',v=teamUi(mode,undefined,{H:{roleCatalog:[{role:'reviewer',kind:'reviewer',label:'Ревьюер',available:false,reason}]}});await v.settle();
 const role=v.find('[data-team-role="reviewer"]');assert.equal(role.disabled,true);const detail=v.find('.tc-reason [data-tc-reveal]'),full=detail.nextElementSibling!,requests=v.requests.length;
 assert.equal(detail.getAttribute('title'),reason);assert.equal(full.hasAttribute('hidden'),true);await detail.emit('click');assert.equal(Reflect.get(full,'hidden'),false);assert.equal(full.textContent,reason);assert.equal(v.root.querySelector('script'),null);
 await detail.emit('click');assert.equal(Reflect.get(full,'hidden'),true);assert.equal(v.requests.length,requests);assert.equal(v.requests.some(row=>row.path==='/api/assign'),false);
});


test('TS-43 r2: role popup escapes the clipped toolbar, keeps disclosure on status refresh and restores focus',async()=>{
 const v=teamUi('work');await v.settle();Object.assign(v.context,{innerWidth:390,innerHeight:844});
 await v.find('[data-team-plus]').emit('click');const menu=v.document.querySelector('[data-team-role-menu]')!;assert.ok(menu);assert.equal(menu.parentElement,v.body);
 const detail=menu.querySelector('[data-tc-reveal]')!;await detail.emit('click');assert.equal(Reflect.get(detail.nextElementSibling!,'hidden'),false);
 await v.context.TEAM_LIVE.refresh();assert.equal(v.document.querySelector('[data-team-role-menu]'),menu);assert.equal(Reflect.get(detail.nextElementSibling!,'hidden'),false,'unchanged catalog keeps the explanation open');
 await v.window.emit('keydown',{key:'Escape'});assert.equal(v.document.querySelector('[data-team-role-menu]'),null);assert.equal(v.document.activeElement,v.find('[data-team-plus]'));
 await v.find('[data-team-plus]').emit('click');v.H.roleCatalog=[];await v.context.TEAM_LIVE.refresh();assert.equal(v.document.querySelector('[data-team-role-menu]'),null,'changed catalog closes stale choices');
});


for(const mode of ['work','constructor'] as const)test('TS-43 r3: '+mode+' keeps the full role name and its focus after live status',async()=>{
 const label='Аналитик договора поставки оборудования <img src=x>',data=snapshot('/project-a',[{...pane('worker','worker',null),label}]);
 const v=teamUi(mode,async path=>{assert.equal(path,'/api/swarm');return data});await v.settle();const selector='[data-key="worker"] [data-tc-reveal="name"]',before=v.find(selector);before.focus();await before.emit('click');
 await v.window.emit('live:status');await v.settle();const current=v.find(selector);assert.notEqual(current,before);assert.equal(current.getAttribute('aria-expanded'),'true');assert.equal(Reflect.get(current.nextElementSibling!,'hidden'),false);assert.equal(current.getAttribute('aria-controls'),current.nextElementSibling!.getAttribute('id'));assert.equal(current.nextElementSibling!.textContent,label);assert.equal(current.getAttribute('title'),label);assert.equal(v.document.activeElement,current);assert.equal(v.root.querySelector('img'),null);
 if(mode==='constructor')assert.ok(v.find('[data-team-pane="worker"] [data-team-model]'));
 await v.window.emit('keydown',{key:'Escape'});assert.equal(Reflect.get(current.nextElementSibling!,'hidden'),true);assert.equal(v.document.activeElement,current);
});

test('TS-43 r3: library disclosure follows role identity through a refresh and closes when the reason changes',async()=>{
 const v=teamUi('constructor');await v.settle();const selector='[data-team-role-key="reviewer"] [data-tc-reveal="reason"]',detail=v.find(selector);detail.focus();await detail.emit('click');v.H.roleCatalog.reverse();await v.window.emit('live:status');await v.settle();const current=v.find(selector);assert.equal(v.document.activeElement,current);assert.equal(current.getAttribute('aria-expanded'),'true');assert.equal(Reflect.get(current.nextElementSibling!,'hidden'),false);
 v.H.roleCatalog.find((role:any)=>role.role==='reviewer').reason='Новая причина недоступности';await v.window.emit('live:status');await v.settle();const changed=v.find(selector);assert.equal(changed.getAttribute('aria-expanded'),'false');assert.equal(v.document.activeElement,changed);assert.equal(v.requests.some(row=>row.body),false);
});

test('TS-43 r3: disclosure does not migrate to an identically named role in another project',async()=>{
 const v=teamUi('work');await v.settle();const before=v.find('[data-key="worker"] [data-tc-reveal="name"]');before.focus();await before.emit('click');v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();const current=v.find('[data-key="worker"] [data-tc-reveal="name"]');assert.equal(current.getAttribute('aria-expanded'),'false');assert.equal(Reflect.get(current.nextElementSibling!,'hidden')??current.nextElementSibling!.hasAttribute('hidden'),true);assert.notEqual(v.document.activeElement,current);
});

// TS-39.2 replaces only the instruction read-only invariant; queue fixtures stay independent.
const instructionReceipt=(extra:any={})=>({ok:true,project:'/project-a',instance:'/project-a-instance',path:'.harness/roles/worker.md',hash:'a'.repeat(64),sharedWith:['worker','orch'],text:'Original',...extra});
function constructorUi(handler?:ApiHandler){return teamUi('constructor',async(path,body)=>{if(path==='/api/swarm')return snapshot('/project-a',[{...pane('orch','orchestrator',null),busy:false},{...pane('worker','worker',null),busy:false}]);if(path.startsWith('/api/project/file?'))return instructionReceipt();return handler?.(path,body)})}

test('39.2: shared instruction is explicit; typing/focus survive live refresh and a rejected save preserves the draft',async()=>{
 const replies=deferred<any>(),v=constructorUi(()=>replies.promise);await v.settle();await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();
 const input=v.find('[data-team-instruction-text]');input.value='My unsaved instruction';await input.emit('input');input.focus();input.setSelectionRange(3,10);
 await v.subscriptions[0].callback({data:JSON.stringify({project:'/project-a',event:{type:'instructionUpdated'}})});await v.settle();assert.equal(v.find('[data-team-instruction-text]'),input);assert.equal(v.document.activeElement,input);assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,10);
 await v.find('[data-team-instruction-save]').emit('click');assert.equal(v.requests.filter(r=>r.path.endsWith('/instruction')).length,0);assert.match(v.find('[data-team-instruction-error]').textContent,/общего файла/);
 const shared=v.find('[data-team-instruction-shared]');(shared as any).checked=true;await shared.emit('change');await v.find('[data-team-instruction-save]').emit('click');await v.find('[data-team-instruction-save]').emit('click');assert.equal(v.requests.filter(r=>r.path.endsWith('/instruction')).length,1);
 replies.resolve({ok:false,code:'file_changed',error:'Файл изменился. Перечитайте.'});await v.settle();assert.equal(v.find('[data-team-instruction-text]').value,'My unsaved instruction');assert.match(v.find('[data-team-instruction-error]').textContent,/Файл изменился/);
 assert.doesNotMatch(v.find('[data-team-instruction]').textContent,/макет/);assert.match(v.find('[data-team-policy]').textContent,/Оркестратор → Воркер.*задача/);assert.match(v.find('[data-team-policy]').textContent,/макет · редактирование связей/);
});

test('39.2: missing receipt/hash cannot become an editable instruction; missing file can be created from its receipt',async()=>{
 for(const answer of [instructionReceipt({hash:undefined}),{ok:false,error:'Источник недоступен'},instructionReceipt({ok:false,code:'instruction_missing',hash:null,canCreate:true})]){
  const v=teamUi('constructor',async(path)=>path==='/api/swarm'?snapshot('/project-a',[{...pane('worker','worker',null),busy:false}]):answer);await v.settle();await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();
  if(answer.canCreate){assert.match(v.find('[data-team-instruction-save]').textContent,/Создать/)}else{assert.equal(v.root.querySelector('[data-team-instruction-save]'),null);assert.match(v.find('[data-team-instruction-error]').textContent,/прочитать|Источник недоступен/)}
 }
});

test('39.2: owner form has seven classes, keeps opId on retry and project draft across A → B → A',async()=>{
 let replies=deferred<any>(),project='/project-a';const v=teamUi('constructor',async(path)=>path==='/api/swarm'?snapshot(project,[]):replies.promise);await v.settle();await v.find('[data-team-own-open]').emit('click');
 const set=async(field:string,value:string)=>{const n=v.find('[data-team-own-field="'+field+'"]');n.value=value;await n.emit('input')};await set('label','Аналитик');await set('intro','Проверь условия');
 assert.deepEqual(JSON.parse(v.find('[data-team-own-field="kind"]').dataset.options!).map((row:any)=>row.value),['worker','orchestrator','reviewer','tester','assistant','architect','researcher']);
 await v.find('[data-team-own-form]').emit('submit');await v.find('[data-team-own-form]').emit('submit');const first=v.requests.filter(r=>r.path==='/api/seats/propose');assert.equal(first.length,1);assert.equal((first[0]!.body as any).instance,'/project-a-instance');
 replies.resolve({ok:false,error:'Соединение оборвалось'});await v.settle();assert.equal(v.find('[data-team-own-field="label"]').value,'Аналитик');replies=deferred();await v.find('[data-team-own-form]').emit('submit');const second=v.requests.filter(r=>r.path==='/api/seats/propose')[1]!;assert.equal((second.body as any).opId,(first[0]!.body as any).opId);
 project=v.H.project='/project-b';v.H.projectRequestGeneration=1;v.H.confirmedProjectGeneration=1;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-own-field="label"]').value,'');
 replies.resolve({ok:true,project:'/project-a',instance:'/project-a-instance',pane:'role-old'});await v.settle();assert.doesNotMatch(v.root.textContent,/Роль создана/);
 project=v.H.project='/project-a';v.H.projectRequestGeneration=2;v.H.confirmedProjectGeneration=2;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-own-field="label"]').value,'Аналитик');assert.equal(v.find('[data-team-own-field="intro"]').value,'Проверь условия');
});

test('39.2: constructor choices use the design menu, keyboard navigation and readable rights',async()=>{
 const v=constructorUi();await v.settle();assert.equal(v.root.querySelector('select'),null);assert.match(v.find('[data-team-mode]').textContent,/Чтение папки/);
 await v.find('[data-team-own-open]').emit('click');const control=v.find('[data-team-own-field="kind"]');v.context.innerWidth=390;Object.assign(v.html,{clientWidth:375});Object.assign(control,{getBoundingClientRect:()=>({left:192,bottom:532,width:160})});await control.emit('click');
 const menu=v.document.querySelector('.tc-choice-menu')!;assert.ok(menu);assert.ok(parseFloat(menu.style.left!)+parseFloat(menu.style.width!)<=367,'menu clears the scrollbar');const choices=menu.querySelectorAll('[data-team-option]');assert.equal(choices.length,7);assert.equal(control.getAttribute('aria-expanded'),'true');
 assert.equal(v.document.activeElement,choices[0]);await choices[0]!.emit('keydown',{key:'ArrowDown'});assert.equal(v.document.activeElement,choices[1]);
 await choices.find(row=>row.dataset.teamOption==='tester')!.emit('click');assert.equal(control.value,'tester');assert.match(control.textContent,/Тестер/);assert.equal(v.document.querySelector('.tc-choice-menu'),null);assert.equal(v.document.activeElement,control);
 await control.emit('click');await v.document.activeElement!.emit('keydown',{key:'Escape'});assert.equal(v.document.querySelector('.tc-choice-menu'),null);assert.equal(control.getAttribute('aria-expanded'),'false');
});

test('39.2: a late instruction reload preserves text, focus and selection while typing',async()=>{
 let pending=false;const receipt=deferred<any>(),v=teamUi('constructor',async path=>path==='/api/swarm'?snapshot('/project-a',[{...pane('worker','worker',null),busy:false}]):pending?receipt.promise:instructionReceipt());
 await v.settle();await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();pending=true;await v.find('[data-team-instruction-reload]').emit('click');
 const editor=v.find('[data-team-instruction-text]');editor.value='Unsaved while reading';await editor.emit('input');editor.focus();editor.setSelectionRange(2,8,'backward');
 receipt.resolve(instructionReceipt({text:'Changed on disk',hash:'b'.repeat(64)}));await v.settle();const current=v.find('[data-team-instruction-text]');assert.equal(current.value,'Unsaved while reading');assert.equal(v.document.activeElement,current);assert.equal(current.selectionStart,2);assert.equal(current.selectionEnd,8);assert.equal(current.selectionDirection,'backward');
});

test('39.2 r2: drafts survive new page instances A → B → A, and writes use the newly confirmed instance',async()=>{
 const page=(project:string,instance:string,state?:any)=>teamUi('constructor',async(path,body:any)=>{
  if(path==='/api/swarm')return {...snapshot(project,[{...pane('worker','worker',null),busy:false}]),instance};
  if(path.startsWith('/api/project/file?'))return instructionReceipt({project,instance,sharedWith:['worker']});
  if(path.endsWith('/instruction'))return instructionReceipt({...body,ok:true,hash:'b'.repeat(64)});
  throw Error('unexpected '+path);
 },{H:{project},state});
 const first=page('/project-a','first-instance');await first.settle();await first.find('[data-team-instruction-open="worker"]').emit('click');await first.settle();const text=first.find('[data-team-instruction-text]');text.value='Инструкция А';await text.emit('input');await first.find('[data-team-own-open]').emit('click');
 for(const [field,value] of [['label','Роль А'],['intro','Вводная А']] as const){const node=first.find('[data-team-own-field="'+field+'"]');node.value=value;await node.emit('input')}await first.window.emit('pagehide');
 const other=page('/project-b','other-instance',plain(first.state));await other.settle();await other.find('[data-team-own-open]').emit('click');assert.equal(other.find('[data-team-own-field="label"]').value,'');assert.equal(other.root.querySelector('[data-team-instruction-text]'),null);await other.window.emit('pagehide');
 const returned=page('/project-a','returned-instance',plain(other.state));await returned.settle();assert.equal(returned.find('[data-team-own-field="label"]').value,'Роль А');assert.equal(returned.find('[data-team-own-field="intro"]').value,'Вводная А');assert.equal(returned.find('[data-team-instruction-text]').value,'Инструкция А');
 await returned.find('[data-team-own-close]').emit('click');await returned.find('[data-team-instruction-save]').emit('click');await returned.settle();const sent=returned.requests.find(row=>row.path.endsWith('/instruction'))!;assert.equal((sent.body as any).instance,'returned-instance');assert.equal((sent.body as any).expectedHash,'a'.repeat(64));assert.equal((sent.body as any).text,'Инструкция А');
});

test('39.2 r2: a restored draft cannot silently adopt a changed file hash or an absent instance',async()=>{
 const first=constructorUi();await first.settle();await first.find('[data-team-instruction-open="worker"]').emit('click');await first.settle();const editor=first.find('[data-team-instruction-text]');editor.value='Draft';await editor.emit('input');
 for(const instance of ['new-instance',undefined]){const v=teamUi('constructor',async path=>path==='/api/swarm'?{...snapshot('/project-a',[{...pane('worker','worker',null),busy:false}]),instance}:instructionReceipt({instance,text:'Remote changed',hash:'b'.repeat(64)}),{state:plain(first.state)});await v.settle();if(instance){assert.equal(v.find('[data-team-instruction-text]').value,'Draft');assert.match(v.find('[data-team-instruction-error]').textContent,/Файл изменился/);assert.equal(v.state.constructorDrafts.projects['/project-a'].instructions.worker.hash,'a'.repeat(64))}else assert.equal(v.root.querySelector('[data-team-instruction-save]'),null);assert.equal(v.requests.some(row=>row.body),false)}
});

test('39.2 r2: a late save confirms only its sent text; typing removes the saved claim',async()=>{
 const response=deferred<any>(),v=constructorUi(()=>response.promise);await v.settle();await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();let editor=v.find('[data-team-instruction-text]');editor.value='Sent text';await editor.emit('input');const shared=v.find('[data-team-instruction-shared]');(shared as any).checked=true;await shared.emit('change');await v.find('[data-team-instruction-save]').emit('click');editor=v.find('[data-team-instruction-text]');editor.value='Newer text';await editor.emit('input');editor.focus();editor.setSelectionRange(2,5);
 response.resolve(instructionReceipt({text:'Sent text',hash:'b'.repeat(64)}));await v.settle();editor=v.find('[data-team-instruction-text]');assert.equal(editor.value,'Newer text');assert.equal(v.document.activeElement,editor);assert.equal(editor.selectionStart,2);assert.match(v.find('[data-team-instruction-error]').textContent,/несохранённые/);assert.doesNotMatch(v.find('[data-team-instruction-error]').textContent,/Сохранено/);
 editor.value='Sent text';await editor.emit('input');assert.match(v.find('[data-team-instruction-error]').textContent,/Сохранено/);editor.value='Changed again';await editor.emit('input');assert.match(v.find('[data-team-instruction-error]').textContent,/несохранённые/);
 const stored=v.state.constructorDrafts.projects['/project-a'].instructions.worker;assert.equal(stored.text,'Changed again');assert.equal(stored.original,'Sent text');assert.equal(stored.hash,'b'.repeat(64));
});

test('39.2 r2: unchanged status keeps class/model menus and focus; changed choices close onto the button',async()=>{
 const v=constructorUi();await v.settle();await v.find('[data-team-own-open]').emit('click');
 for(const selector of ['[data-team-own-field="kind"]','[data-team-pane="worker"] [data-team-model]']){const control=v.find(selector);await control.emit('click');const menu=v.document.querySelector('.tc-choice-menu')!,focused=v.document.activeElement;await v.subscriptions[0].callback({data:JSON.stringify({project:'/project-a',event:{type:'state'}})});await v.settle();assert.equal(v.document.querySelector('.tc-choice-menu'),menu);assert.equal(v.document.activeElement,focused);assert.equal(v.find(selector).getAttribute('aria-expanded'),'true');await focused!.emit('keydown',{key:'Escape'});assert.equal(v.document.activeElement,v.find(selector))}
 await v.find('[data-team-pane="worker"] [data-team-model]').emit('click');v.H.models.codex.push({id:'another',label:'Другая модель'});await v.context.TEAM_LIVE.refresh();await v.settle();assert.equal(v.document.querySelector('.tc-choice-menu'),null);assert.equal(v.document.activeElement,v.find('[data-team-pane="worker"] [data-team-model]'));
 await v.find('[data-team-own-field="model"]').emit('click');v.H.models.codex.push({id:'last',label:'Последняя модель'});await v.context.TEAM_LIVE.refresh();await v.settle();assert.equal(v.document.querySelector('.tc-choice-menu'),null);assert.equal(v.document.activeElement,v.find('[data-team-own-field="model"]'));
});

test('39.2 r2: both write forms explain a transport failure in Russian and preserve their text',async()=>{
 const v=constructorUi(()=>{throw new TypeError('Failed to fetch')});await v.settle();await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();const editor=v.find('[data-team-instruction-text]');editor.value='Instruction draft';await editor.emit('input');const shared=v.find('[data-team-instruction-shared]');(shared as any).checked=true;await shared.emit('change');await v.find('[data-team-instruction-save]').emit('click');await v.settle();assert.match(v.find('[data-team-instruction-error]').textContent,/Сохранение не выполнено, черновик сохранён, повторите/);assert.equal(v.find('[data-team-instruction-text]').value,'Instruction draft');
 await v.find('[data-team-own-open]').emit('click');for(const [field,value] of [['label','Моя роль'],['intro','Моя вводная']] as const){const node=v.find('[data-team-own-field="'+field+'"]');node.value=value;await node.emit('input')}await v.find('[data-team-own-form]').emit('submit');await v.settle();assert.match(v.find('[data-team-own-error]').textContent,/Сохранение не выполнено, черновик сохранён, повторите/);assert.equal(v.find('[data-team-own-field="intro"]').value,'Моя вводная');assert.doesNotMatch(v.root.textContent,/Failed to fetch/);
});

test('39.2 r2: changing the custom role provider refreshes supported rights while keeping every other field',async()=>{
 const v=teamUi('constructor',undefined,{H:{models:{gemini:[{id:'g1',label:'Gemini'}],claude:[{id:'w1',label:'Claude'}]},turnModes:{gemini:{all:{ok:true}},claude:{read:{ok:true},edit:{ok:true},all:{ok:true},chat:{ok:true}}}}});await v.settle();await v.find('[data-team-own-open]').emit('click');for(const [field,value] of [['label','Аналитик'],['intro','Прочитай договор']] as const){const n=v.find('[data-team-own-field="'+field+'"]');n.value=value;await n.emit('input')}
 assert.equal(v.find('[data-team-own-field="mode"]').value,'all');await v.find('[data-team-own-field="model"]').emit('click');await v.document.querySelector('[data-team-option="claude/w1"]')!.emit('click');assert.deepEqual(JSON.parse(v.find('[data-team-own-field="mode"]').dataset.options!).map((row:any)=>row.value),['read','edit','all','chat']);assert.equal(v.find('[data-team-own-field="mode"]').value,'all');assert.equal(v.find('[data-team-own-field="label"]').value,'Аналитик');assert.equal(v.find('[data-team-own-field="intro"]').value,'Прочитай договор');assert.equal(v.find('[data-team-own-field="kind"]').value,'worker');assert.equal(v.document.activeElement,v.find('[data-team-own-field="model"]'));
});

test('TS-44: every canonical role has an icon and constructor rights use owner-facing words',async()=>{
 const v=teamUi('constructor');await v.settle();const icons=['orchestrator','assistant','architect','worker','reviewer','tester','researcher'].map(kind=>v.context.TC.ico(kind));
 for(const icon of icons)assert.match(icon,/<(?:path|circle|rect)\b/);assert.equal(new Set(icons).size,7);
 const rights=v.find('[data-team-mode]');assert.equal(JSON.parse(rights.dataset.options!).find((row:any)=>row.value==='read').label,'Чтение папки');assert.equal(rights.value,'read');
});


for(const mode of ['work','constructor'] as const)test('TS-44 r2: '+mode+' canvas relayouts both ways without replacing focused controls or drafts',async()=>{
 const v=teamUi(mode);await v.settle();const engine=v.context.TEAM_LIVE.state.engine,canvas=v.find('[data-canvas]');
 Object.assign(canvas,{clientWidth:900,clientHeight:800});await v.window.emit('resize');const wide=engine.G.rects.worker.x;
 const control=v.find(mode==='work'?'[data-team-chat-input]':'[data-team-pane="worker"] [data-team-model]');control.value='Черновик';control.focus();
 Object.assign(canvas,{clientWidth:340,clientHeight:800});await v.window.emit('resize');const narrow=engine.G.rects.worker.x;assert.ok(narrow<wide);assert.equal(v.document.activeElement,control);assert.equal(control.value,'Черновик');assert.equal(control.isConnected,true);
 Object.assign(canvas,{clientWidth:900,clientHeight:800});await v.window.emit('resize');assert.equal(engine.G.rects.worker.x,wide);assert.equal(v.document.activeElement,control);assert.equal(control.value,'Черновик');
});


test('TS-44 r3: fit bounds retain only mounted nodes after a missing orchestrator is replaced',async()=>{
 const v=teamUi('work');await v.settle();const engine=v.context.TEAM_LIVE.state.engine,canvas=v.find('[data-canvas]');
 assert.equal(engine.G.rects['missing-orchestrator'],undefined);
 for(const width of [900,340,900]){Object.assign(canvas,{clientWidth:width,clientHeight:800});await v.window.emit('resize');assert.deepEqual(Object.keys(engine.G.rects).sort(),v.root.querySelectorAll('[data-key]').map(node=>node.dataset.key).sort())}
});

test('TS-44 r3: status retains the orchestrator draft, focus and selection; project and chat changes isolate it',async()=>{
 const v=teamUi('work');await v.settle();let input=v.find('[data-team-chat-input]');input.value='Неотправленный текст';input.focus();input.setSelectionRange(2,9,'backward');
 await v.window.emit('live:status');await v.settle();input=v.find('[data-team-chat-input]');assert.equal(input.value,'Неотправленный текст');assert.equal(v.document.activeElement,input);assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectionDirection],[2,9,'backward']);
 v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();input=v.find('[data-team-chat-input]');assert.equal(input.value,'');assert.notEqual(v.document.activeElement,input);input.value='Проект Б';
 v.H.project='/project-a';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Неотправленный текст');
 assert.equal(v.requests.some(row=>row.path==='/api/chat'),false);
});

test('TS-44 r3: a pending send survives status; its receipt clears only the sent draft',async()=>{
 const receipt=deferred<any>();let activeChat='chat-orch';const v=teamUi('work',async(path,body)=>path==='/api/swarm'?snapshot('/project-a',[pane('orch','orchestrator',activeChat)]):path==='/api/chat'?receipt.promise:chat(activeChat,'orch'));await v.settle();let input=v.find('[data-team-chat-input]');input.value='Отправлено';await v.find('[data-team-send]').emit('click');
 await v.window.emit('live:status');await v.settle();input=v.find('[data-team-chat-input]');assert.equal(input.value,'Отправлено');assert.equal(input.disabled,true);assert.equal(v.find('[data-team-send]').disabled,true);
 activeChat='other-chat';await v.window.emit('live:status');await v.settle();input=v.find('[data-team-chat-input]');assert.equal(input.value,'');input.value='Новый разговор';receipt.resolve({ok:true});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Новый разговор');assert.equal(v.find('[data-team-chat-input]').disabled,false);
});

test('TS-44 r3: successful send clears its draft even if status replaced the input',async()=>{
 const receipt=deferred<any>();const v=teamUi('work',async path=>path==='/api/swarm'?snapshot('/project-a',[pane('orch','orchestrator','chat-orch')]):path==='/api/chat'?receipt.promise:chat('chat-orch','orch'));await v.settle();v.find('[data-team-chat-input]').value='Отправлено';await v.find('[data-team-send]').emit('click');await v.window.emit('live:status');await v.settle();receipt.resolve({ok:true});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'');assert.equal(v.find('[data-team-chat-input]').disabled,false);
});

test('TS-44 r4: a late receipt clears its own chat draft without touching another chat',async()=>{
 const receipt=deferred<any>();let activeChat='chat-orch';const v=teamUi('work',async path=>path==='/api/swarm'?snapshot('/project-a',[pane('orch','orchestrator',activeChat)]):path==='/api/chat'?receipt.promise:chat(activeChat,'orch'));await v.settle();v.find('[data-team-chat-input]').value='Отправлено в A';await v.find('[data-team-send]').emit('click');
 activeChat='other-chat';await v.window.emit('live:status');await v.settle();v.find('[data-team-chat-input]').value='Черновик B';receipt.resolve({ok:true});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');
 activeChat='chat-orch';await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'');activeChat='other-chat';await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');
});

test('TS-44 r4: project A → B → A before a late receipt clears only A',async()=>{
 const receipt=deferred<any>();let project='/project-a';const v=teamUi('work',async path=>path==='/api/swarm'?snapshot(project,[pane('orch','orchestrator','chat-orch')]):path==='/api/chat'?receipt.promise:chat('chat-orch','orch'));await v.settle();v.find('[data-team-chat-input]').value='Отправлено в A';await v.find('[data-team-send]').emit('click');
 project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();v.find('[data-team-chat-input]').value='Черновик B';
 project=v.H.project='/project-a';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Отправлено в A');receipt.resolve({ok:true});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'');
 project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');
});

test('TS-44 r4: receipt in project B clears A without touching a same-named chat in B',async()=>{
 const receipt=deferred<any>();let project='/project-a';const v=teamUi('work',async path=>path==='/api/swarm'?snapshot(project,[pane('orch','orchestrator','chat-orch')]):path==='/api/chat'?receipt.promise:chat('chat-orch','orch'));await v.settle();v.find('[data-team-chat-input]').value='Отправлено в A';await v.find('[data-team-send]').emit('click');
 project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();v.find('[data-team-chat-input]').value='Черновик B';receipt.resolve({ok:true});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');
 project=v.H.project='/project-a';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'');project=v.H.project='/project-b';v.H.projectRequestGeneration++;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');
});

test('TS-44 r4: a receipt never clears a newer revision or an unconfirmed draft',async()=>{
 for(const result of [{ok:true},{ok:false,error:'Отказ'}]){const receipt=deferred<any>();const v=teamUi('work',async path=>path==='/api/swarm'?snapshot('/project-a',[pane('orch','orchestrator','chat-orch')]):path==='/api/chat'?receipt.promise:chat('chat-orch','orch'));await v.settle();let input=v.find('[data-team-chat-input]');input.value='Первая редакция';await v.find('[data-team-send]').emit('click');input.value=result.ok?'Новая редакция':'Первая редакция';receipt.resolve(result);await v.settle();input=v.find('[data-team-chat-input]');assert.equal(input.value,result.ok?'Новая редакция':'Первая редакция')}
});

test('TS-44 r4: a late rejected receipt neither changes the other chat nor clears the unsent draft',async()=>{
 const receipt=deferred<any>();let activeChat='chat-orch';const v=teamUi('work',async path=>path==='/api/swarm'?snapshot('/project-a',[pane('orch','orchestrator',activeChat)]):path==='/api/chat'?receipt.promise:chat(activeChat,'orch'));await v.settle();v.find('[data-team-chat-input]').value='Черновик A';await v.find('[data-team-send]').emit('click');activeChat='other-chat';await v.window.emit('live:status');await v.settle();v.find('[data-team-chat-input]').value='Черновик B';receipt.resolve({ok:false,error:'Отказ A'});await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик B');assert.doesNotMatch(v.root.textContent,/Отказ A/);activeChat='chat-orch';await v.window.emit('live:status');await v.settle();assert.equal(v.find('[data-team-chat-input]').value,'Черновик A');
});
