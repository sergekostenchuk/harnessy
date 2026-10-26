import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
const snapshot=(project='/project-a',panes:any[]=[pane('orch','orchestrator','chat-orch'),pane('worker','worker','chat-worker')])=>({ok:true,project,generatedAt:Date.now(),halted:false,team:{path:project+'/.harness/team.yaml',integrationBranch:'main'},journal:{records:[record()],total:1,lastSeq:1},panes});
const chat=(id:string,paneId:string,text='Последняя живая реплика')=>({chat:{id,pane:paneId,revision:7,documents:[{project:'/project-a',path:'README.md'}]},messages:[{role:'me',text:'Вопрос владельца',ts:Date.now()-2000},{role:'assistant',text,ts:Date.now()-1000}]});
const settingsBinding=(id:string,project='/project-a')=>({project,instanceId:project.endsWith('-b')?'instance-b':'instance-a',pane:id,chat:'chat-'+id,revision:1,mode:'read',networkGeneration:null});

type ApiHandler=(path:string,body:unknown)=>unknown|Promise<unknown>;
function teamUi(mode:'work'|'constructor'|'queue',handler?:ApiHandler,options:any={}){
 const d=dom('<aside class="side ps"></aside><section class="main tc-main" data-team-live="'+mode+'"><div class="spec-banner">Макет · граница данных</div><div class="tc-live-loading">Загрузка</div></section>');
 Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:true,snapshotOnly:false,project:'/project-a',projectRequestGeneration:0,confirmedProjectGeneration:0,models:{claude:[{id:'orch-model',label:'Opus live'},{id:'worker-model',label:'Sonnet live'}],codex:[{id:'new-model',label:'Codex live'}]},turnModes:{claude:{read:{ok:true},all:{ok:true}},codex:{read:{ok:true},all:{ok:true}}},roleCatalog:[{role:'orchestrator',kind:'orchestrator',label:'Оркестратор',description:'ведёт ход',available:true},{role:'reviewer',kind:'reviewer',label:'Ревьюер',available:false,reason:'роль создаёт оркестратор'}],active:{room:'room-chat'},panes:[{id:'orch',busy:false,settingsBinding:settingsBinding('orch')},{id:'worker',busy:false,settingsBinding:settingsBinding('worker')}],...options.H};
 const state:any={ui:{pane:'room'}},requests:Array<{path:string;body:unknown}>=[],toasts:string[]=[],subscriptions:any[]=[],location:any={href:'',hash:'',pathname:mode==='work'?'/04-swarm.html':'/41-team-'+mode+'.html'};
 const fallback:ApiHandler=async(path,body)=>{
  if(path==='/api/swarm')return snapshot(H.project);
  if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');
  if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');
  if(path==='/api/chats/room-chat')return chat('room-chat','room');
  if(path.startsWith('/api/project/file?'))return {ok:true,project:H.project,path:'.harness/roles/worker.md',text:'# Живая инструкция\nПроверяй итог.'};
  if(path==='/api/assign'||path==='/api/chat'||path.startsWith('/api/panes/'))return {ok:true};
  throw Error('unexpected request '+path+' '+JSON.stringify(body));
 };
 const LIVE:any={H,S:state,esc:escape,async api(path:string,body?:unknown){requests.push({path,body});return (handler||fallback)(path,body)},async refreshStatus(){return true},subscribeLiveEvents(callback:any){const stream={callback,closed:false,close(){this.closed=true}};subscriptions.push(stream);return stream},toast(text:string){toasts.push(text)},save(){}};
 const viewport=()=>({fit(){},takeSuppress(){return false},zoomAt(){},cw(){return 900},chh(){return 600}});
 const timers=new Map<number,()=>void>();let timerId=0;
 const context:any={setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId},clearTimeout:(id:number)=>timers.delete(id),document:d.document,location,LIVE,OMCORE:{esc:escape,cubic:(...values:number[])=>'M'+values.join(' '),midOf:()=>[10,10],fwdPath:()=>({d:'M0 0L10 10',m:[5,5]}),viewport},addEventListener:d.window.addEventListener.bind(d.window),URLSearchParams};
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

test('36D: constructor reads the project instruction and saves only the existing model and mode fields',async()=>{
 const mutations:Array<{path:string;body:unknown}>=[];
 const data=snapshot();data.panes[1]!.busy=false;const v=teamUi('constructor',async(path,body)=>{if(path==='/api/swarm')return data;if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');if(path.startsWith('/api/project/file?'))return {ok:true,project:'/project-a',path:'.harness/roles/worker.md',text:'# Настоящая инструкция роли'};if(path.startsWith('/api/panes/')){mutations.push({path,body});return {ok:true,pane:{id:'worker',vendor:'codex',model:'new-model',mode:'all',settingsBinding:settingsBinding('worker')}}}throw Error('unexpected '+path)});await v.settle();
 assert.equal(v.find('[data-team-count]').textContent,'2 ролей');assert.equal(v.find('[data-team-link]').textContent,'подключено');
 await v.find('[data-team-instruction-open="worker"]').emit('click');await v.settle();assert.match(v.find('[data-team-instruction]').textContent,/Настоящая инструкция роли/);assert.match(v.find('[data-team-instruction]').textContent,/нет API записи/);
 for(const select of v.root.querySelectorAll('[data-team-model],[data-team-mode]'))select.value=select.dataset.original!;
 const worker=v.find('[data-team-pane="worker"]'),model=worker.querySelector('[data-team-model]')!,mode=worker.querySelector('[data-team-mode]')!;model.value='codex/new-model';mode.value='all';
 await model.emit('change');await v.context.TEAM_LIVE.refresh(true);await v.settle();const redrawnModel=v.find('[data-team-pane="worker"] [data-team-model]'),redrawnMode=v.find('[data-team-pane="worker"] [data-team-mode]');assert.notEqual(redrawnModel,model);assert.equal(redrawnModel.value,'codex/new-model');assert.equal(redrawnMode.value,'all','unsaved draft survives a live redraw');
 await v.find('[data-team-save]').emit('click');await v.settle();assert.deepEqual(plain(mutations),[{path:'/api/panes/worker',body:{vendor:'codex',model:'new-model',mode:'all',binding:settingsBinding('worker')}}]);
 assert.equal(v.requests.some(row=>/instruction|role/.test(row.path)&&!row.path.startsWith('/api/project/file?')),false,'there is no invented instruction-write endpoint');
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

test('36D: missing live data stays honest, while the queue is explicitly local mock state with working drag and drop',async()=>{
 const offline=teamUi('work',undefined,{H:{on:false,snapshotOnly:true,roleCatalog:[]}});await offline.settle();assert.match(offline.root.textContent,/Движок недоступен/);assert.doesNotMatch(offline.root.textContent,/Alpha-Test|Анна Ветрова/);assert.match(offline.root.textContent,/макет · компиляция OMG не подключена/);assert.equal(offline.root.querySelectorAll('.tc-card').length,0);assert.equal(offline.requests.length,0);
 const queue=teamUi('queue');await queue.settle();assert.match(queue.root.textContent,/в движке очереди нет/);assert.match(queue.root.textContent,/пример · не данные движка/);assert.equal(queue.requests.length,0);
 const transfer:any={value:'',effectAllowed:'',dropEffect:'',setData(_type:string,value:string){this.value=value},getData(){return this.value}},task=queue.find('[data-task="14"]'),target=queue.find('[data-key="mock-orch"]');await task.emit('dragstart',{dataTransfer:transfer});await target.emit('dragover',{dataTransfer:transfer});await target.emit('drop',{dataTransfer:transfer});
 const changed=queue.context.TEAM_LIVE.state.queue.find((row:any)=>row.n===14);assert.equal(changed.who,'Оркестратор');assert.equal(changed.st,'work');assert.match(target.textContent,/№14 назначена/);assert.equal(queue.requests.length,0);
});


test('TS-43: failed team read is unavailable rather than missing orchestrator; automatic retry restores data',async()=>{
 let broken=true;const ui=teamUi('work',async path=>{if(broken)throw Error('503');if(path==='/api/swarm')return snapshot();if(path==='/api/chats/chat-orch')return chat('chat-orch','orch');if(path==='/api/chats/chat-worker')return chat('chat-worker','worker');throw Error(path)});await ui.settle();
 assert.match(ui.find('[data-team-error]').textContent,/503/);assert.ok(ui.find('[data-team-refresh]'));assert.equal(ui.root.querySelector('[data-key="missing-orchestrator"]'),null);assert.equal(ui.timers.size,1);
 broken=false;[...ui.timers.values()][0]!();await ui.settle();assert.equal(ui.context.TEAM_LIVE.state.error,null);assert.ok(ui.root.querySelector('[data-key="orch"]'));assert.equal(ui.timers.size,0);
 broken=true;await ui.context.TEAM_LIVE.refresh();assert.match(ui.find('[data-team-error]').textContent,/Последний снимок устарел/);assert.equal(ui.find('[data-team-send]').disabled,true);await ui.window.emit('pagehide');assert.equal(ui.timers.size,0);
});
