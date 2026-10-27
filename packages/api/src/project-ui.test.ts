import {fixtureSource,fixtureGroups} from './live-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProjectRegistry,initProject} from '@harnessy/projects';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {setImmediate as immediate} from 'node:timers/promises';
import {fixture,call,deferred,OWNER} from './test-helpers.ts';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
function ui(fetch:(path:string,body?:any)=>Promise<any>){
 const d=dom('<aside class="side ps"><div class="ps-proj"></div><div class="ps-folders"></div><div class="ps-pins"></div></aside><div class="recent"></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:true,project:'/projects/a',defaultDir:'/home/no-project',panes:[{id:'room',model:'w1',label:'без роли'}],active:{},projects:[{path:'/projects/a',name:'a',current:true}]};H.pane=H.panes[0];const S:any={ui:{pane:'room'},cx:{noFolder:false}},toasts:string[]=[],storage=new Map<string,string>(),requests:any[]=[];
 const context:any={H,S,knowledgeReset(){},PAGE:'new',document:d.document,window:{},location:{href:''},save(){},toast:(s:string)=>toasts.push(s),log(){},esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),paneName:(p:any)=>p.label,waitingControls:()=>'',showWaiting(){},showRestore(){},renderWaiting(){},badges(){},limitsDraw(){},resetJournal(){},hStatus(){},onboardOnce:async()=>{},LOADED:null,loadChat:async()=>{},pickPane(){H.pane=H.panes.find((p:any)=>p.id===S.ui.pane)||null},
  api:async(path:string,body?:any)=>{requests.push({path,body});return fetch(path,body)},addEventListener:d.window.addEventListener.bind(d.window),setTimeout(){},CustomEvent:class {},dispatchEvent(){},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}};
 const vm=createContext(context);runInContext([fixtureSource(live,fixtureGroups.live_bindingGeneration_to_settingsReady,{filename:'live.js',wrapper:0}),fixtureSource(live,['modelName'],{filename:'live.js',wrapper:0}),fixtureSource(live,fixtureGroups.live_applyStatus_to_refreshStatus,{filename:'live.js',wrapper:0}),fixtureSource(live,fixtureGroups.live_base_to_sideChats,{filename:'live.js',wrapper:0}),fixtureSource(live,fixtureGroups.live_openChatRow_to_document,{filename:'live.js',wrapper:0}),fixtureSource(live,fixtureGroups.live_projectPathValue_to_projectPathValue,{filename:'live.js',wrapper:0}),'globalThis.testing={applyStatus,refreshStatus,refreshChats,sideChats,sideSwitchProject,openChatRow,sendBinding,bindingCurrent,invalidateBinding,projectPathValue};'].join('\n'),vm);
 return {...d,H,S,context,requests,toasts,storage,functions:context.testing};
}
function menus(fetch:(path:string,body?:any)=>Promise<any>){const pending=new Set<Promise<any>>(),v=ui(async(path,body)=>{const response=fetch(path,body);pending.add(response);try{return await response}finally{pending.delete(response)}}),main=v.document.createElement('div');main.className='main';main.innerHTML='<span data-cx="plus">＋</span>';v.body.appendChild(main);v.html.setAttribute('data-proto','');v.html.setAttribute('data-page','new');Object.assign(v.S.cx,{modes:{},att:[],conn:{}});
 const L={...v.functions,api:v.context.api,H:v.H,S:v.S,save:v.context.save,esc:v.context.esc,toast:v.context.toast,log:v.context.log,paneName:v.context.paneName,hStatus:v.context.hStatus,pickPane:v.context.pickPane,busy:()=>false};v.context.window=v.context;v.context.LIVE=L;runInContext(cx,v.context);
 const find=(selector:string)=>{const n=v.document.querySelector(selector);assert.ok(n,selector);return n};
 const open=async(kind:'mkdir'|'opendir')=>{await find('[data-cx="plus"]').emit('click');await find('[data-cx-nav="folder"]').emit('click');await find('[data-cx-nav="'+kind+'"]').emit('click')};const settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};return {...v,L,find,open,settle};
}

for(const method of ['Enter','button'])test('130/117/128: '+method+' submits the same actual project form once, refreshes the sidebar and retains the chosen model',async t=>{
 const h=await fixture(t);h.runtime.roomSet({model:'w2'},OWNER);const v=menus(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);await v.functions.refreshStatus();await v.open('mkdir');const path=join(h.dir,'project-'+method),input=v.find('.cx-path');input.value=path;
 if(method==='Enter')await input.emit('keydown',{key:'Enter'});else await v.find('[data-cx-mkdir]').emit('click');assert.equal(v.requests.filter(r=>r.path==='/api/project/create').length,1);assert.equal(h.runtime.project.dir,path);assert.equal(v.document.querySelector('.ps-folder.cur')!.dataset.folder,path);assert.equal(v.H.panes.find((p:any)=>p.id==='room').model,'w2');assert.match(v.toasts.at(-1)!,/ролей нет/);assert.equal(v.document.querySelector('.cx-pop'),null);assert.equal(h.provider.calls.length,0);
});

test('130: empty path and a changed form binding refuse before HTTP; repeated Enter and button share the in-flight operation',async()=>{
 const entered=deferred(),gate=deferred<any>();const v=menus(async(path)=>{if(path==='/api/project/create'){entered.resolve();return gate.promise}return path==='/api/status'?{project:'/projects/new',panes:[],models:{}}:path==='/api/projects'?{projects:[{path:'/projects/new',name:'new',current:true}]}:path==='/api/chats'?{chats:[],active:{}}:{pins:[]}});await v.open('mkdir');const input=v.find('.cx-path');input.value='';await input.emit('keydown',{key:'Enter'});assert.equal(v.requests.length,0);assert.match(v.find('[data-cx-path-error]').textContent,/Введите имя или путь/);
 input.value='/projects/new';v.functions.invalidateBinding();await input.emit('keydown',{key:'Enter'});assert.equal(v.requests.length,0);assert.equal(input.value,'/projects/new');assert.match(v.toasts.at(-1)!,/разговор изменились/);
 await v.open('mkdir');v.find('.cx-path').value='/projects/new';const first=v.find('.cx-path').emit('keydown',{key:'Enter'});await entered.promise;await v.find('[data-cx-mkdir]').emit('click');await v.find('.cx-path').emit('keydown',{key:'Enter'});assert.equal(v.requests.filter(r=>r.path==='/api/project/create').length,1);gate.resolve({ok:true,project:'/projects/new',seats:0});await first;assert.equal(v.toasts.at(-1),'Проект создан: new · ролей нет');
});

for(const method of ['form','menu'])test('131/132: '+method+' opening of a three-role project uses the HTTP role count and refreshes the sidebar immediately',async t=>{
 const h=await fixture(t,{seats:'  one: {role: executor, vendor: claude, label: one, model: w1, mode: read}\n  two: {role: tester, vendor: claude, label: two, model: w1, mode: read}\n  three: {role: researcher, vendor: claude, label: three, model: w1, mode: read}'}),other=join(h.dir,'other');await initProject(other,{git:false,orchestrator:false});h.runtime.roomSet({model:'w2'},OWNER);await h.runtime.projectSet(other,{},OWNER);
 const v=menus(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);await v.functions.refreshStatus();assert.equal(v.H.panes.filter((p:any)=>p.id!=='room').length,0);
 if(method==='form'){await v.open('opendir');v.find('.cx-path').value=h.dir;await v.find('[data-cx-opendir]').emit('click')}
 else {v.H.projects.push({path:h.dir,name:'three-role',current:false});await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="folder"]').emit('click');await v.find('[data-cx-proj="'+h.dir+'"]').emit('click')}
 assert.equal(v.document.querySelector('.ps-folder.cur')!.dataset.folder,h.dir);assert.match(v.toasts.at(-1)!,new RegExp('^'+(method==='form'?'Проект открыт:':'Проект:')));assert.match(v.toasts.at(-1)!,/ролей 3/);assert.doesNotMatch(v.toasts.at(-1)!,/ролей нет|Связь восстановлена/);assert.equal(v.requests.filter(r=>r.path==='/api/room').length,0);
});

test('132: the connected thinking row is disabled on every current menu path and cannot mutate the draft or mode',async()=>{
 const v=menus(async()=>({chats:[],projects:[],pins:[]}));await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="tools"]').emit('click');assert.equal(v.document.querySelector('[data-cx-tog="mode:think"]'),null);assert.match(v.find('.cx-pop').textContent,/данных нет: движок отдаёт только историю ходов/);
 // An old offline popup also cannot enable thinking after connection.
 v.H.on=false;await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="tools"]').emit('click');const row=v.document.querySelectorAll('.cx-row.dis').find(n=>n.textContent.includes('Думать дольше'))!;assert.ok(row);const saved=JSON.stringify(v.S);v.H.on=true;await row.emit('click');assert.equal(JSON.stringify(v.S),saved);assert.equal(v.requests.length,0);
});

test('117: real project creation and sidebar switching refresh the project list before rendering; the default directory stays hidden',async t=>{
 const owned=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-ts10-projects-'))),defaultDir=join(owned,'without-project');mkdirSync(defaultDir);t.after(()=>rmSync(owned,{recursive:true,force:true}));
 const h=await fixture(t,{deps:{defaultDir,projectRegistry:new ProjectRegistry({projects:join(owned,'registry.json'),lastProject:join(owned,'last')},{noLast:false})}}),v=ui(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);v.H.project=h.dir;await h.runtime.projectRegistry.rememberProject(h.runtime.defaultDir);const path=join(h.dir,'new');
 await call(h.api,'/api/project/create',{body:{path,git:false,model:'w2'}});await v.functions.refreshStatus();const current=v.document.querySelector('.ps-folder.cur')!;assert.ok(current);assert.equal(current.dataset.folder,path);assert.equal(current.querySelector('[data-folder-toggle]')!.getAttribute('aria-expanded'),'true');assert.match(v.document.querySelector('.ps-proj')!.textContent,/new/);assert.equal(v.document.querySelectorAll('.ps-folder').some(n=>n.dataset.folder===h.runtime.defaultDir),false);
 await v.functions.sideSwitchProject(h.dir);assert.equal(v.H.project,h.dir);assert.equal(v.document.querySelector('.ps-folder.cur')!.dataset.folder,h.dir);assert.ok(v.requests.some(r=>r.path==='/api/projects'));assert.equal(v.requests.filter(r=>r.path==='/api/room').length,0);
 // Cold load uses engine data, even when the browser retained an older project list.
 const cold=ui(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);await cold.functions.refreshStatus();assert.equal(cold.document.querySelector('.ps-folder.cur')!.dataset.folder,h.dir);assert.ok(cold.document.querySelectorAll('.ps-folder').some(n=>n.dataset.folder===path));
});

test('117 ОКНА: delayed chat/project/pin snapshots cannot redraw the previous project, including A → B → A',async()=>{
 const gates=[deferred<any>(),deferred<any>()];let i=0;const v=ui(async path=>path==='/api/chats'?gates[i++]!.promise:path==='/api/projects'?{projects:[{path:v.H.project,name:'latest',current:true},{path:v.H.defaultDir,name:'unscoped',current:false}]}:{pins:[]});
 const a=v.functions.sideChats();v.functions.applyStatus({project:'/projects/b',panes:[],activeChats:{},defaultDir:'/home/no-project'});const b=v.functions.sideChats();gates[1]!.resolve({chats:[]});await b;assert.equal(v.document.querySelector('.ps-folder.cur')!.dataset.folder,'/projects/b');gates[0]!.resolve({chats:[{id:'old',pane:'room',messages:1,title:'OLD'}]});await a;assert.doesNotMatch(v.document.querySelector('.ps-folders')!.textContent,/OLD|unscoped/);
 const first=deferred<any>(),second=deferred<any>(),enteredFirst=deferred(),enteredSecond=deferred();let n=0;v.context.api=async(path:string)=>{if(path!=='/api/projects')return path==='/api/chats'?{chats:[]}:{pins:[]};if(n++===0){enteredFirst.resolve();return first.promise}enteredSecond.resolve();return second.promise};v.functions.applyStatus({project:'/projects/a',panes:[],defaultDir:'/home/no-project'});const old=v.functions.sideChats();await enteredFirst.promise;v.functions.applyStatus({project:'/projects/b',panes:[],defaultDir:'/home/no-project'});v.functions.applyStatus({project:'/projects/a',panes:[],defaultDir:'/home/no-project'});const latest=v.functions.sideChats();await enteredSecond.promise;second.resolve({projects:[{path:'/projects/a',name:'final',current:true}]});await latest;first.resolve({projects:[{path:'/old',name:'stale',current:true}]});await old;assert.equal(v.document.querySelector('.ps-folder.cur')!.dataset.folder,'/projects/a');assert.doesNotMatch(v.document.querySelector('.ps-folders')!.textContent,/stale/);
});

test('TS-36A: sidebar section counts accept only the current project and expose honest role states',async()=>{
 const paths:string[]=[],captured:any[]=[];const v=ui(async path=>{paths.push(path);if(path==='/api/chats')return {chats:[{id:'lead-chat',pane:'lead',title:'строю',active:true},{id:'worker-chat',pane:'worker',title:'ошибка',active:true},{id:'review-chat',pane:'review',title:'жду',active:true}]};if(path==='/api/pins')return {pins:[]};if(path==='/api/project/sections/docs')return {ok:true,project:'/projects/a',items:[{},{}]};if(path==='/api/project/sections/artifacts')return {ok:true,project:'/projects/foreign',items:[{},{},{}]};if(path==='/api/project/sections/memory')return {ok:true,project:'/projects/a',items:'forged'};if(path==='/api/project/sections/research')throw Error('offline');throw Error('unexpected '+path)});
 v.H.panes=[{id:'room',label:'без роли'},{id:'lead',label:'Оркестратор',busy:true},{id:'worker',label:'Исполнитель',waiting:{status:'unsent'}},{id:'review',label:'Ревьюер',waiting:{status:'sent'}}];v.H.pane=v.H.panes[1];v.context.window=v.context;v.context.waitList=()=>[{id:'review'}];v.context.PS2={setData:(value:any)=>captured.push(JSON.parse(JSON.stringify(value)))};
 await v.functions.sideChats();assert.deepEqual(paths.filter(path=>path.startsWith('/api/project/sections/')).sort(),['/api/project/sections/artifacts','/api/project/sections/docs','/api/project/sections/memory','/api/project/sections/research']);assert.equal(captured.length,1);
 assert.deepEqual(captured[0].sections,{docs:2});assert.equal(captured[0].inbox.need,1);assert.deepEqual(Object.fromEntries(captured[0].chats.map((chat:any)=>[chat.pane,chat.state])),{lead:'busy',worker:'err',review:'wait'});
});

test('TS-36A ОКНА: a project change discards delayed section counts before sidebar publication',async()=>{
 const entered=deferred(),gate=deferred<any>(),captured:any[]=[];const v=ui(async path=>{if(path==='/api/chats')return {chats:[]};if(path==='/api/pins')return {pins:[]};if(path==='/api/project/sections/docs'){entered.resolve();return gate.promise}if(path.startsWith('/api/project/sections/'))return {ok:true,project:'/projects/a',items:[]};throw Error('unexpected '+path)});
 v.context.window=v.context;v.context.waitList=()=>[];v.context.PS2={setData:(value:any)=>captured.push(value)};const pending=v.functions.sideChats();await entered.promise;v.H.project='/projects/b';gate.resolve({ok:true,project:'/projects/a',items:[{}]});await pending;assert.equal(captured.length,0);
});

test('122/128: retaining a project room model is explained by the accepted status; no old model write follows switching',async()=>{
 const v=ui(async()=>({chats:[],projects:[],pins:[]}));v.functions.applyStatus({project:'/projects/b',panes:[{id:'room',label:'без роли',model:'w2'}],models:{claude:[{id:'w2',label:'W2'}]}});assert.equal(v.toasts.at(-1),'у проекта своя настройка модели: W2');assert.equal(v.H.pane.model,'w2');assert.equal(v.H.projects,null);assert.equal(v.requests.length,0);
});

test('122/128: missing room selection disables the actual composer after typing and busy changes; the catalogue never silently selects a model',async()=>{
 const d=dom('<div class="frame cur"><div class="main"><div class="box"><input class="in live-in"><div class="bar2"></div></div></div></div>');d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','new');Object.assign(d.document,{documentElement:d.html,body:d.body});const box:any=d.document.querySelector('.box')!,ta:any=box.querySelector('input');let sent=0;box.__cx={ta,send(){sent++}};
 const H:any={on:true,project:'/projects/a',panes:[],pane:null,models:{claude:[{id:'first',label:'FIRST'}]},active:{}},state:any={ui:{pane:'room',fresh:true},cx:{modes:{},att:[],conn:{},noFolder:false}};
 const context:any={H,S:state,document:d.document,addEventListener:d.window.addEventListener.bind(d.window),LIVE:{H,S:state,esc:(s:any)=>String(s??''),save(){},toast(){},log(){},paneName:(p:any)=>p.label,busy:()=>false},setTimeout(){}};context.window=context;const vm=createContext(context);
 runInContext(fixtureSource(live,fixtureGroups.live_bindingGeneration_to_settingsReady,{filename:'live.js',wrapper:0})+'\nglobalThis.LIVE.sendBinding=sendBinding;',vm);
 runInContext(cx,vm);ta.value='my draft';await ta.emit('input');let go=d.document.querySelector('.cx-go')!;assert.equal(go.classList.contains('off'),true);assert.match(go.title,/выберите модель/);assert.equal(d.document.querySelector('.cx-chip[data-cx="model"] b')!.textContent,'выбрать модель');await go.emit('click');assert.equal(sent,0);
 context.CX.setBusy(true);context.CX.setBusy(false);go=d.document.querySelector('.cx-go')!;assert.equal(go.classList.contains('off'),true);assert.match(go.title,/выберите модель/);assert.equal(H.pane,null);assert.equal(ta.value,'my draft');
 H.panes=[{id:'room',label:'без роли',model:'chosen',mode:'read'}];H.pane=H.panes[0];context.CX.render();go=d.document.querySelector('.cx-go')!;assert.equal(go.classList.contains('off'),false);await go.emit('click');assert.equal(sent,1);assert.equal(H.pane.model,'chosen');
});

function connection(respond:(path:string,body?:any)=>Promise<any>){
 const v=ui(respond),streams:any[]=[];v.context.PAGE='chat';v.context.location.pathname='/01-chat.html';v.context.consumeState=()=>{};v.context.hEvent=()=>{};v.context.proposalsFetch=async()=>{};v.context.render=()=>{};v.context.liveFirstPaint=()=>{};
 v.context.fetch=(path:string,opts?:{body?:string})=>Promise.resolve({json:()=>respond(path,opts?.body?JSON.parse(opts.body):undefined)});
 v.context.EventSource=class {constructor(){streams.push(this)}close(){}};
 runInContext(fixtureSource(live,fixtureGroups.live_api_to_networkWaiting,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_LIVE_EVENTS_to_addEventListener,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_hConnect_to_hConnect,{filename:'live.js',wrapper:0})+'\nglobalThis.linkTesting={api,hConnect};',v.context);
 return {...v,streams,link:v.context.linkTesting};
}
function linkStatus(project:string){return {project,panes:[{id:'room',label:'без роли',model:'w1'}],models:{},activeChats:{}}}

test('132: planned project SSE reconnection does not replace the project toast; a later genuine disconnection reports recovery',async()=>{
 let project='/projects/a';const entered=deferred(),gate=deferred<any>();const v=connection(async(path,body)=>{
  if(path==='/api/project'&&body){project=body.path;entered.resolve();return gate.promise}
  return path==='/api/status'?linkStatus(project):path==='/api/projects'?{projects:[{path:project,name:'current',current:true}]}:path==='/api/chats'?{chats:[],active:{}}:{pins:[]};
 });await v.link.hConnect();const es=v.streams[0];const switching=v.link.api('/api/project',{path:'/projects/b'});await entered.promise;
 assert.equal(v.H.projectLinkChange,true);es.onerror();assert.equal(v.H.link,'lost');await es.onopen();assert.equal(v.H.project,'/projects/b');assert.equal(v.H.link,'ok');assert.equal(v.H.projectLinkChange,false);assert.equal(v.toasts.length,0);
 gate.resolve({ok:true,project});await switching;await v.window.emit('live:status');const current=v.streams.at(-1);current.onerror();await current.onopen();assert.deepEqual(v.toasts,['Связь с движком потеряна — переподключаюсь…','Связь восстановлена']);
});

test('132: a refused or same-project request cannot mask a genuine reconnect; another window changing project does not announce recovery',async()=>{
 let project='/projects/a',refuse=true;const v=connection(async(path,body)=>{
  if(body)return refuse?{ok:false,code:'busy'}:{ok:true,project};
  return path==='/api/status'?linkStatus(project):path==='/api/projects'?{projects:[{path:project,name:'current',current:true}]}:path==='/api/chats'?{chats:[],active:{}}:{pins:[]};
 });await v.link.hConnect();const es=v.streams[0];
 for(const route of ['/api/project','/api/project/create','/api/room/move','/api/assign']){await v.link.api(route,{path:'/projects/b'});assert.equal(v.H.projectLinkChange,false)}
 refuse=false;await v.link.api('/api/project',{path:project});assert.equal(v.H.projectLinkChange,false);es.onerror();await es.onopen();assert.equal(v.toasts.at(-1),'Связь восстановлена');
 v.toasts.length=0;project='/projects/b';es.onerror();await es.onopen();assert.equal(v.H.project,project);assert.doesNotMatch(v.toasts.join('\n'),/Связь восстановлена/);
});


// TS-20g status/catalogue contract double; room/project mutations still use the real HTTP routes.
async function modelMenuContract(h:Awaited<ReturnType<typeof fixture>>,path:string,body?:any){
 if(path==='/api/providers/catalog')return {ok:true,providers:Object.entries(h.runtime.registry.models).map(([id,models])=>({id,title:id,kind:'subscription',models:(models??[]).map(m=>({...m,label:m.label||m.id}))}))};
 const result=(await call(h.api,path,body?{body}:{})).body;
 if(path==='/api/status')result.turnModes=Object.fromEntries(Object.keys(result.models).map(id=>[id,Object.fromEntries(result.modes.map((m:any)=>[m.id,{ok:true}]))]));
 return result;
}
for(const alreadyConfigured of [false,true])test('TS-07.2 r2/2: no-project choice survives rerender and model selection via real HTTP, configured='+alreadyConfigured,async t=>{
 const h=await fixture(t);if(alreadyConfigured)await call(h.api,'/api/room',{body:{model:'w1',folder:true}});
 const v=menus((path,body)=>modelMenuContract(h,path,body));await v.functions.refreshStatus();
 const box=v.document.createElement('div');box.className='box';box.innerHTML='<div class="in"></div><div class="bar2"></div>';const ta=v.document.createElement('textarea');(box as any).__cx={ta};v.document.querySelector('.main')!.appendChild(box);v.context.CX.render();
 runInContext('LIVE.configureSetting=configureSetting;',v.context);
 await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="folder"]').emit('click');await v.settle();await v.find('[data-cx-nofolder]').emit('click');
 assert.equal(v.S.cx.noFolder,true);assert.equal(v.document.querySelector('.cx-top [data-cx="folder"]'),null);
 if(!alreadyConfigured){assert.equal(v.H.noProject,false);assert.equal(v.S.cx.noFolderPending,v.H.project);assert.equal(v.requests.some(r=>r.path==='/api/room'),false)}
 await v.functions.refreshStatus();v.context.CX.render();assert.equal(v.S.cx.noFolder,true,'old confirmed status must not erase a pending choice');
 await v.find('.cx-bot [data-cx="model"]').emit('click');await v.settle();await v.find('[data-cx-model="gpt-test"]').emit('click');
 const selected=v.requests.filter(r=>r.path==='/api/room').at(-1)!;assert.equal(selected.body.folder,false);assert.equal(selected.body.model,'gpt-test');assert.equal(selected.body.vendor,'codex');
 const status=(await call(h.api,'/api/status')).body;assert.equal(status.noProject,true);assert.equal(status.panes.find((p:any)=>p.id==='room').mode,'chat');assert.equal(v.S.cx.noFolderPending,undefined);assert.equal(h.provider.calls.length+h.codex.calls.length,0);
});

test('TS-07.2 r2/2: denied no-project change never claims success and restores the confirmed folder',async t=>{
 const h=await fixture(t);await call(h.api,'/api/room',{body:{model:'w1',folder:true}});
 const v=menus(async(path,body)=>path==='/api/room'?{ok:false,error:'busy'}:(await call(h.api,path,body?{body}:{})).body);await v.functions.refreshStatus();
 const box=v.document.createElement('div');box.className='box';box.innerHTML='<div class="in"></div><div class="bar2"></div>';const ta=v.document.createElement('textarea');(box as any).__cx={ta};v.document.querySelector('.main')!.appendChild(box);v.context.CX.render();
 await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="folder"]').emit('click');await v.settle();await v.find('[data-cx-nofolder]').emit('click');
 assert.equal(v.S.cx.noFolder,false);assert.equal(v.S.cx.noFolderPending,undefined);assert.match(v.toasts.at(-1)!,/не принял.*busy/);assert.equal(v.H.noProject,false);
});


test('TS-07.2 r2/2: pending no-project choice belongs to its project and expires on a project switch',async t=>{
 const h=await fixture(t),v=menus((path,body)=>modelMenuContract(h,path,body));await v.functions.refreshStatus();
 const box=v.document.createElement('div');box.className='box';box.innerHTML='<div class="in"></div><div class="bar2"></div>';const ta=v.document.createElement('textarea');(box as any).__cx={ta};v.document.querySelector('.main')!.appendChild(box);v.context.CX.render();runInContext('LIVE.configureSetting=configureSetting;',v.context);
 await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="folder"]').emit('click');await v.settle();await v.find('[data-cx-nofolder]').emit('click');assert.equal(v.S.cx.noFolderPending,h.dir);
 const other=join(h.dir,'other');mkdirSync(other);assert.equal((await call(h.api,'/api/project',{body:{path:other}})).status,200);await v.functions.refreshStatus();v.context.CX.render();assert.equal(v.S.cx.noFolder,false);assert.equal(v.S.cx.noFolderPending,undefined);assert.equal(v.H.project,other);assert.equal(v.document.querySelector('.cx-top [data-cx="folder"]'),null);
 await v.find('.cx-bot [data-cx="model"]').emit('click');await v.settle();await v.find('[data-cx-model="gpt-test"]').emit('click');assert.equal(v.requests.filter(r=>r.path==='/api/room').at(-1)!.body.folder,true);assert.equal((await call(h.api,'/api/status')).body.noProject,false);
});

test('83: sidebar lists every saved role chat, including empty and closed chats, and only real participants before the first reply',async t=>{
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: юрист-руководитель, label: Руководитель, vendor: claude, model: w1, mode: read}\n  law: {kind: worker, role: юрист, label: Юрист, vendor: claude, model: w1, mode: read}'}),v=ui(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);
 await v.functions.refreshStatus();let rows=v.document.querySelectorAll('.ps-folders .ps-chat[data-pane]');assert.equal(rows.length,2);assert.deepEqual(rows.map(n=>n.dataset.pane).sort(),['law','lead']);assert.equal(rows.every(n=>!!n.dataset.chat),true);assert.match(v.document.querySelector('.ps-folders')!.textContent,/Руководитель.*разговор ещё пуст.*Юрист.*разговор ещё пуст/);assert.doesNotMatch(v.document.querySelector('.ps-folders')!.textContent,/Исполнитель|Ревьюер|Тестер|новый чат/);assert.equal(h.runtime.registry.get('law')!.touched,false);assert.equal(h.provider.calls.length,0);
 for(let i=0;i<7;i++){const response=await call(h.api,'/api/chats/new',{body:{pane:'law',carry:'none'}});assert.equal(response.status,200)}
 const list=(await call(h.api,'/api/chats')).body;assert.equal(list.chats.filter((c:any)=>c.pane==='law'&&c.closed!==null).length,7);await v.functions.sideChats();rows=v.document.querySelectorAll('.ps-folders .ps-chat[data-pane="law"]');assert.equal(rows.length,8);assert.deepEqual(new Set(rows.map(n=>n.dataset.chat)),new Set(list.chats.filter((c:any)=>c.pane==='law').map((c:any)=>c.id)));assert.equal(h.provider.calls.length,0);
});

test('83/102: sidebar new roleless chat goes through HTTP, persists model:null and opens that exact chat without onboarding',async t=>{
 const h=await fixture(t),path=join(h.dir,'new-project');await call(h.api,'/api/project/create',{body:{path,git:false}});const v=ui(async(route,body)=>(await call(h.api,route,{...(body?{body}:{})})).body);await v.functions.refreshStatus();const before=h.runtime.project.state.chats.active.room;
 const button=v.document.querySelector('[data-new-room]');assert.ok(button);await button.emit('click');const id=h.runtime.project.state.chats.active.room!;assert.notEqual(id,before);assert.equal(v.S.ui.pane,'room');assert.equal(v.H.active.room,id);assert.equal(v.context.location.href,'01-chat.html');assert.equal(v.requests.filter(r=>r.path==='/api/chats/new').length,1);assert.equal(h.runtime.project.state.chats.chats[id]!.model,null);assert.equal(h.runtime.journal.lastSeq,0);assert.equal(h.provider.calls.length,0);assert.equal(v.document.querySelectorAll('.ps-folders .ps-chat[data-pane="room"]').length,2);
});

test('83: a created but untouched place stays visible even when a cached chat list has no receipt yet',async()=>{
 const v=ui(async path=>path==='/api/chats'?{chats:[],active:{}}:{pins:[]});v.H.panes=[{id:'legal-critic',kind:'reviewer',role:'юрист',label:'Критик',touched:false,sessionId:null,model:'w1'}];await v.functions.sideChats();const row=v.document.querySelector('.ps-chat[data-pane="legal-critic"]');assert.ok(row);assert.match(row.textContent,/Критик.*разговор ещё пуст/);assert.doesNotMatch(row.textContent,/новый чат/);assert.equal(v.document.querySelectorAll('.ps-chat.role').length,1);
});

for(const window of ['create-reply','status-reply'])test('83 ОКНА: new roleless chat cannot navigate after A → B → A during '+window,async()=>{
 const entered=deferred(),gate=deferred<any>();let hold=true;
 const v=ui(async path=>{if(hold&&path===(window==='create-reply'?'/api/chats/new':'/api/status')){entered.resolve();return gate.promise}return path==='/api/chats'?{chats:[]}:{pins:[],ok:true,chat:{id:'created'}}});
 await v.functions.sideChats();const clicking=v.document.querySelector('[data-new-room]')!.emit('click');await entered.promise;v.functions.invalidateBinding();v.H.project='/projects/b';v.functions.sendBinding();v.functions.invalidateBinding();v.H.project='/projects/a';v.functions.sendBinding();hold=false;gate.resolve(window==='create-reply'?{ok:true,chat:{id:'created'}}:{project:'/projects/a',panes:[{id:'room',model:'w1',label:'без роли'}],activeChats:{room:'created'},defaultDir:'/home/no-project'});await clicking;assert.equal(v.context.location.href,'');assert.equal(v.requests.some(r=>r.path==='/api/chats/open'),false);
});

for(const page of ['new','chat'])test('172/186: '+page+' pins saved chats via HTTP once and removes missing targets from the pinned list',async t=>{
 const h=await fixture(t);h.runtime.roomSet({model:'w1'},OWNER);const chat=(await call(h.api,'/api/chats/new',{body:{pane:'room',carry:'none'}})).body.chat;
 const gate=deferred(),seen=deferred();let hold=true;const v=ui(async(path,body)=>{if(path==='/api/pins'&&body&&hold){seen.resolve();await gate.promise}return (await call(h.api,path,{body})).body});v.context.PAGE=page;await v.functions.refreshStatus();await v.functions.sideChats();assert.match(v.document.querySelector('.ps-pins')!.textContent,/закреплённых пока нет/);
 const pin=v.document.querySelector('[data-pin-toggle="chat"][data-chat-id="'+chat.id+'"]')!;assert.ok(pin);const first=pin.emit('click');await seen.promise;await pin.emit('click');gate.resolve();await first;assert.equal(v.requests.filter(r=>r.path==='/api/pins'&&r.body).length,1);assert.equal(v.requests.find(r=>r.path==='/api/pins'&&r.body)!.body.on,true);assert.match(v.toasts.at(-1)!,/Закреплено/);assert.equal(v.document.querySelectorAll('.ps-pins [data-pin-chat]').length,1);
 hold=false;delete h.runtime.project.state.chats.chats[chat.id];await v.document.querySelector('.ps-pins [data-pin-toggle="chat"]')!.emit('click');assert.equal((await call(h.api,'/api/pins')).body.pins.length,0);assert.match(v.document.querySelector('.ps-pins')!.textContent,/закреплённых пока нет/);assert.equal(h.provider.calls.length,0);
 const denied=await call(h.api,'/api/pins',{body:{kind:'folder',path:h.dir,on:true,project:'/other'}});assert.equal(denied.status,409);assert.equal((await call(h.api,'/api/pins')).body.pins.length,0);
});

test('172/186: pin identity includes project; read failure retains evidence and late writes have no false receipt',async()=>{
 const other={kind:'chat',path:'/projects/b',chat:'same',name:'b',title:'Other project',current:false};let broken=false,hold=false;const gate=deferred<any>(),seen=deferred();
 const v=ui(async(path,body)=>{if(path==='/api/chats')return {chats:[{id:'same',pane:'room',title:'Current conversation',active:true}]};if(path==='/api/pins'&&body){if(hold){seen.resolve();return gate.promise}return {ok:false,error:'write failed'}}return broken?{ok:false,error:'cannot read pins'}:{pins:[other]}});await v.functions.sideChats();
 const currentPin=v.document.querySelector('.ps-folders [data-pin-toggle="chat"]')!;assert.equal(currentPin.dataset.pinOn,'1');assert.equal(v.document.querySelector('.ps-pins [data-pin-toggle="chat"]')!.dataset.pinOn,'0');await currentPin.emit('click');assert.match(v.toasts.at(-1)!,/write failed/);assert.equal(v.document.querySelectorAll('.ps-pins [data-pin-chat]').length,1);
 broken=true;await v.functions.sideChats();assert.match(v.document.querySelector('.ps-pins')!.textContent,/не прочитаны/);assert.match(v.document.querySelector('.ps-pins')!.textContent,/Other project/);assert.equal(v.document.querySelector('.ps-folders [data-pin-toggle="chat"]')!.disabled,true);broken=false;await v.document.querySelector('[data-pins-refresh]')!.emit('click');assert.equal(v.document.querySelector('.ps-folders [data-pin-toggle="chat"]')!.disabled,false);
 hold=true;const old=v.document.querySelector('.ps-folders [data-pin-toggle="chat"]')!.emit('click');await seen.promise;const before=v.toasts.length;v.H.project='/projects/b';v.H.confirmedProjectGeneration=1;v.H.project='/projects/a';v.H.confirmedProjectGeneration=2;gate.resolve({ok:true,on:true,pins:[other]});await old;assert.equal(v.toasts.length,before);assert.equal(v.document.querySelector('.ps-folders [data-pin-toggle="chat"]')!.dataset.pinOn,'1');
});

test('TS-15e r2/1: damaged pin storage returns a typed HTTP error, preserves bytes and the sidebar snapshot until retry',async t=>{
 const h=await fixture(t),file=join(h.dir,'pins.json');assert.deepEqual((await call(h.api,'/api/pins')).body.pins,[]);
 await call(h.api,'/api/pins',{body:{kind:'folder',path:h.dir,on:true}});const saved=readFileSync(file),v=ui(async(path,body)=>(await call(h.api,path,{body})).body);await v.functions.refreshStatus();await v.functions.sideChats();assert.equal(v.document.querySelectorAll('.ps-pins [data-pin-folder]').length,1);
 const damaged='[{"kind":"folder","path":"/saved-evidence",';writeFileSync(file,damaged);
 for(const body of [undefined,{kind:'folder',path:join(h.dir,'missing-target'),on:false,project:h.dir},{kind:'folder',path:h.dir,on:true,project:h.dir}]){const r=await call(h.api,'/api/pins',{body});assert.equal(r.status,409);assert.equal(r.body.code,'pins_unreadable');assert.equal(readFileSync(file,'utf8'),damaged)}
 await v.functions.sideChats();assert.match(v.document.querySelector('.ps-pins')!.textContent,/не прочитаны/);assert.doesNotMatch(v.document.querySelector('.ps-pins')!.textContent,/закреплённых пока нет/);assert.equal(v.document.querySelectorAll('.ps-pins [data-pin-folder]').length,1);assert.equal(v.document.querySelector('.ps-pins [data-pin-toggle]')!.disabled,true);
 writeFileSync(file,saved);await v.document.querySelector('[data-pins-refresh]')!.emit('click');assert.equal(v.document.querySelector('[data-pins-refresh]'),null);assert.equal(v.document.querySelector('.ps-pins [data-pin-toggle]')!.disabled,false);await v.document.querySelector('.ps-pins [data-pin-toggle]')!.emit('click');assert.deepEqual((await call(h.api,'/api/pins')).body.pins,[]);
});
