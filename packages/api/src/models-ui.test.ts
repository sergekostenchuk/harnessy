import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {deferred,fixture,call,sse} from './test-helpers.ts';
import {ProviderCatalog,cliEntry} from '../../providers/src/index.ts';
import {cliFixture} from '../../providers/src/cli/test-support.ts';
import {collect} from '../../runtime/src/test-helpers.ts';

type Data=Record<string,any>;
const cx=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const part=(s:string,a:string,b:string)=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return s.slice(start,end)};
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));
const esc=(value:unknown)=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const catalogue=()=>({ok:true,providers:[
 {id:'claude',title:'Claude Code',kind:'subscription',models:[{id:'shared',label:'Claude model'},{id:'other',label:'Other Claude'}]},
 {id:'codex',title:'Codex',kind:'subscription',models:[{id:'shared',label:'Codex model'}]},
 {id:'agy',title:'Antigravity',kind:'subscription',models:[{id:'agy-model',label:'Antigravity model'}]},
 {id:'copilot',title:'GitHub Copilot',kind:'subscription',models:[{id:'copilot-model',label:'Copilot model'}]},
 {id:'gemini',title:'Gemini CLI',kind:'subscription',models:[],modelsReason:'CLI не даёт безопасного чтения списка'},
 {id:'router',title:'provider-router',kind:'local',models:[{id:'router-model',label:'Router model'}]}
].map(p=>({...p,installed:true as boolean|null,checking:false}))});
const modes=()=>Object.fromEntries(catalogue().providers.map(p=>[p.id,Object.fromEntries(['read','edit','all','chat'].map(m=>[m,
 p.id==='agy'?m==='all'?{ok:true,note:'без инструментов Harnessy'}:{ok:false,reason:'нет изоляции инструментов на ход'}:p.id==='copilot'&&m==='edit'?{ok:false,reason:'нет флага для этого режима'}:{ok:true}]))]));
function ui(options:{apiRoutes?:Data[];page?:string;room?:boolean;statusFetch?:()=>Promise<Data>;fetch?:(path:string,body:Data|undefined)=>Promise<Data>}={}){
 const d=dom('<div class="frame cur"><div class="main"><div class="feed"></div><div class="box"><input class="in live-in"><div class="bar2"></div></div></div></div>');
 d.html.setAttribute('data-proto','');d.html.setAttribute('data-page',options.page??'chat');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const pane:Data={id:options.room?'room':'worker',label:options.room?'без роли':'воркер',vendor:'claude',model:'shared',mode:'read',busy:false};
 const H:Data={on:true,project:'/project-a',pane,panes:[pane],active:{[pane.id]:'chat-a'},models:Object.fromEntries(catalogue().providers.map(p=>[p.id,p.id==='gemini'?[{id:'default',label:'по умолчанию программы'}]:p.models])),turnModes:modes(),modes:[{id:'read',label:'Чтение'},{id:'edit',label:'Правка'},{id:'all',label:'Полный доступ'},{id:'chat',label:'Без проекта'}],chatList:[]};
 pane.settingsBinding={project:H.project,instanceId:'project-instance',pane:pane.id,chat:H.active[pane.id],revision:0,mode:pane.mode};
 const S:Data={ui:{pane:pane.id},cx:{folder:'',noFolder:false,modes:{},att:[],conn:{}},chat:[]},requests:{path:string;body?:Data}[]=[],toasts:string[]=[],waiting:Data[]=[],listeners=new Set<Data>();
 let snapshot:Data=catalogue(),lastPane:Data|null=null,serverModels:Data|null=null;
 const ctx:Data={document:d.document,H,S,PAGE:options.page??'chat',esc,toast:(s:string)=>toasts.push(s),setTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),
  showWaiting:(p:Data,info:Data,project:string)=>waiting.push({pane:p.id,info,project}),showRestore(){},badges(){},pickPane(){H.pane=H.panes.find((p:Data)=>p.id===S.ui.pane)},renderWaiting(){},save(){},
  fetch:async(path:string,opts?:{body?:string})=>{const body=opts?.body?JSON.parse(opts.body):undefined;requests.push({path,body});
   const result=path==='/api/status'?(options.statusFetch?await options.statusFetch():{project:H.project,panes:H.panes,models:serverModels??H.models,turnModes:H.turnModes}):options.fetch?await options.fetch(path,body):path==='/api/providers/catalog'?snapshot:{ok:true,pane:{...H.pane,...body}};
   if(body&&result.ok)lastPane=result.pane;return {status:result.code==='capability_unsupported'?409:200,json:async()=>result};}};
 ctx.window=ctx;const context=createContext(ctx);
 runInContext(part(live,'  const api=','  // TS-07: waiting controls')+part(live,'  let bindingGeneration','  function md(')+part(live,'  function applyStatus(','  async function refreshChats(')+
  '\nglobalThis.binding={api,sendBinding,bindingCurrent,invalidateBinding,configureSetting,applyStatus};',context);
 ctx.LIVE={H,S,esc,...ctx.binding,...(options.apiRoutes?{apiRoutes:options.apiRoutes,loadLlmRoutes:async()=>true}:{}),save(){},log(){},toast:ctx.toast,paneName:(p:Data)=>p.label,busy:()=>false,hStatus(){},
  refreshStatus:async()=>{if(lastPane){Object.assign(H.pane,lastPane);await d.window.emit('live:status')}},
  subscribeLiveEvents(onmessage:(event:Data)=>void){const listener={onmessage,close(){listeners.delete(listener)}};listeners.add(listener);return listener}};
 (d.document.querySelector('.box') as any).__cx={ta:d.document.querySelector('input'),send(){}};
 runInContext(cx,context);
 const find=(selector:string)=>{const el=d.document.querySelector(selector);assert.ok(el,selector);return el};
 const flush=async()=>{await immediate()};
 const open=async()=>{await find('[data-cx="model"]').emit('click');await flush()};
 const select=(vendor:string,model:string)=>find('[data-cx-vendor="'+vendor+'"][data-cx-model="'+model+'"]');
 const providers=async(next:Data)=>{snapshot=next;if(next.ok&&Array.isArray(next.providers))serverModels=Object.fromEntries(next.providers.map((p:Data)=>[p.id,p.id==='gemini'?[{id:'default',label:'по умолчанию программы'}]:p.models]));for(const l of [...listeners])l.onmessage({data:JSON.stringify({type:'providers',project:H.project})});await flush()};
 return {...d,H,S,ctx,requests,toasts,waiting,listeners,find,open,select,flush,providers,
  status:()=>d.window.emit('live:status'),hide:()=>d.window.emit('pagehide')};
}

for(const page of ['chat','new','first'])test('305/306: '+page+' lists every catalogue program and selects the exact vendor/model',async()=>{
 const v=ui({page});await v.open();
 assert.deepEqual(v.document.querySelectorAll('[data-cx-program] .grp b').map(n=>n.textContent),catalogue().providers.map(p=>p.title));
 assert.match(v.find('[data-cx-program="claude"]').textContent,/подписка · 2 модели/);assert.match(v.find('[data-cx-program="router"]').textContent,/локально · 1 модель/);
 assert.equal(v.select('claude','shared').classList.contains('on'),true);assert.equal(v.select('codex','shared').classList.contains('on'),false);
 const button=v.select('agy','agy-model');assert.equal(button.disabled,true);assert.match(v.find('[data-cx-program="agy"] [data-cx-group-reason]').textContent,/Работает только в режиме «Полный доступ»/);await button.emit('click');assert.equal(v.select('copilot','copilot-model').disabled,false);
 assert.equal(v.requests.filter(r=>r.body).length,0);await v.select('codex','shared').emit('click');
 assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'codex',model:'shared'}}]);assert.equal(v.H.pane.vendor,'codex');assert.equal(v.find('[data-cx="model"] b').textContent,'Codex model');
 assert.equal(v.requests.some(r=>r.path==='/api/chat'),false);
});

for(const page of ['chat','new'])for(const room of [false,true])test('351: '+page+' '+(room?'room':'seat')+' requires explicit full-access confirmation, then selects the program separately',async()=>{
 const v=ui({page,room});v.H.pane.kind=room?'room':'orchestrator';await v.open();const group=v.find('[data-cx-program="agy"]');assert.equal(group.querySelectorAll('[data-cx-group-reason]').length,1);assert.equal(v.select('agy','agy-model').textContent,'Antigravity model');assert.match(group.textContent,/Работает только в режиме «Полный доступ» · без инструментов Harnessy/);if(!room)assert.match(group.textContent,/оркестратор не сможет назначать роли/);
 await v.find('[data-cx-full-access="agy"]').emit('click');assert.match(v.find('[role="alertdialog"]').textContent,/Модель сможет менять файлы проекта и запускать команды/);assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(v.H.pane.mode,'read');await v.find('[data-cx-access-cancel]').emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
 await v.find('[data-cx-full-access="agy"]').emit('click');await v.find('[data-cx-access-confirm]').emit('click');assert.equal(v.H.pane.mode,'all');assert.equal(v.H.pane.vendor,'claude');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/'+v.H.pane.id,body:{mode:'all',binding:{project:'/project-a',instanceId:'project-instance',pane:v.H.pane.id,chat:'chat-a',revision:0,mode:'read'}}}]);assert.equal(v.select('agy','agy-model').disabled,false);await v.select('agy','agy-model').emit('click');assert.equal(v.H.pane.vendor,'agy');assert.equal(v.H.pane.mode,'all');assert.deepEqual(v.requests.filter(r=>r.body).at(-1),{path:'/api/panes/'+v.H.pane.id,body:{vendor:'agy',model:'agy-model'}});assert.equal(v.requests.some(r=>r.path==='/api/chat'||r.path.endsWith('/probe')),false);
});

for(const vendor of ['agy','gemini','qwen','ollama','devin','kimi','opencode'])test('351: one group explanation covers every unavailable '+vendor+' model',async()=>{
 const next=catalogue(),entry={id:vendor,title:vendor,kind:'subscription',models:[{id:'one',label:'one'},{id:'two',label:'two'}],installed:true,checking:false};next.providers=next.providers.filter(p=>p.id!==vendor);next.providers.push(entry);const v=ui({fetch:async()=>next});v.H.models[vendor]=entry.models;v.H.turnModes[vendor]={read:{ok:false,reason:'MCP technical implementation'},all:{ok:true,note:'без инструментов Harnessy'}};await v.open();const group=v.find('[data-cx-program="'+vendor+'"]');assert.equal(group.querySelectorAll('[data-cx-group-reason]').length,1);assert.equal((group.textContent.match(/Работает только/g)||[]).length,1);assert.doesNotMatch(group.textContent,/MCP technical/);assert.equal(v.select(vendor,'one').disabled,true);assert.equal(v.select(vendor,'two').disabled,true);assert.ok(v.find('[data-cx-full-access="'+vendor+'"]'));
});

for(const change of ['project','pane','chat','mode','model','capability','program','pagehide','close'])test('351: '+change+' invalidates full-access consent, including A → B → A',async()=>{
 const v=ui();await v.open();await v.find('[data-cx-full-access="agy"]').emit('click');const old=v.find('[data-cx-access-confirm]');
 if(change==='pagehide')await v.hide();else if(change==='close')await v.find('[data-cx="model"]').emit('click');else if(change==='program'){const missing=catalogue();missing.providers.find(p=>p.id==='agy')!.installed=false;await v.providers(missing);await v.providers(catalogue())}
 else {const before=plain({project:v.H.project,pane:v.H.pane,active:v.H.active,turnModes:v.H.turnModes});if(change==='project')v.H.project='/b';if(change==='pane'){v.H.pane={...v.H.pane,id:'other'};v.S.ui.pane='other'}if(change==='chat')v.H.active.worker='chat-b';if(change==='mode')v.H.pane.mode='edit';if(change==='model')v.H.pane.model='other';if(change==='capability')v.H.turnModes.agy.all.ok=false;await v.status();v.H.project=before.project;v.H.pane=before.pane;v.S.ui.pane=before.pane.id;v.H.panes=[before.pane];v.H.active=before.active;v.H.turnModes=before.turnModes;await v.status()}
 await old.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(v.H.pane.mode,'read');assert.equal(v.document.querySelector('[data-cx-access-confirm]'),null);
});

test('351: queued consent is rechecked before mutation, double click sends once, and 409 preserves the mode',async()=>{
 const gate=deferred(),v=ui();await v.open();v.ctx.binding.configureSetting(()=>gate.promise);await v.find('[data-cx-full-access="agy"]').emit('click');const pending=v.find('[data-cx-access-confirm]').emit('click');v.H.pane.model='other';await v.status();gate.resolve();await pending;assert.equal(v.requests.filter(r=>r.body).length,0);
 const entered=deferred(),receipt=deferred<Data>(),w=ui({fetch:async(path)=>{if(path==='/api/providers/catalog')return catalogue();entered.resolve();return receipt.promise}});await w.open();await w.find('[data-cx-full-access="agy"]').emit('click');const button=w.find('[data-cx-access-confirm]'),first=button.emit('click');await entered.promise;await button.emit('click');receipt.resolve({ok:false,code:'capability_unsupported',error:'полный доступ больше не поддерживается'});await first;assert.equal(w.requests.filter(r=>r.body).length,1);assert.equal(w.H.pane.mode,'read');assert.match(w.find('[data-cx-model-error]').textContent,/больше не поддерживается/);
});

for(const change of ['project','pane','chat','capability'])test('351: delayed permission receipt cannot change a replaced '+change,async()=>{
 const entered=deferred(),receipt=deferred<Data>(),v=ui({fetch:async(path)=>{if(path==='/api/providers/catalog')return catalogue();entered.resolve();return receipt.promise}});await v.open();await v.find('[data-cx-full-access="agy"]').emit('click');const request=v.find('[data-cx-access-confirm]').emit('click');await entered.promise;
 if(change==='project')v.H.project='/b';if(change==='pane'){v.H.pane={...v.H.pane,id:'other'};v.S.ui.pane='other'}if(change==='chat')v.H.active.worker='chat-b';if(change==='capability')v.H.turnModes.agy.all.ok=false;await v.status();receipt.resolve({ok:true,pane:{id:'worker',mode:'all'}});await request;assert.equal(v.H.pane.mode,'read');
});

for(const receipt of [{ok:true},{ok:true,pane:{mode:'read'}}])test('351: an incomplete or unapplied mode receipt never claims successful elevation '+JSON.stringify(receipt),async()=>{
 const v=ui({fetch:async path=>path==='/api/providers/catalog'?catalogue():receipt});await v.open();await v.find('[data-cx-full-access="agy"]').emit('click');await v.find('[data-cx-access-confirm]').emit('click');assert.equal(v.H.pane.mode,'read');assert.equal(v.select('agy','agy-model').disabled,true);assert.match(v.find('[data-cx-model-error]').textContent,/не подтвердил полный доступ/);assert.doesNotMatch(v.find('.cx-pop').textContent,/Полный доступ включён/);
});

for(const absent of ['capability','busy','binding','checking'])test('351: '+absent+' cannot offer elevation for an unconfirmed target',async()=>{
 const next=catalogue(),v=ui({fetch:async()=>next});if(absent==='capability')delete v.H.turnModes.agy.all;if(absent==='busy')v.H.pane.busy=true;if(absent==='binding')v.S.ui.pane='different';if(absent==='checking')next.providers.find(p=>p.id==='agy')!.checking=true;await v.open();assert.equal(v.document.querySelector('[data-cx-full-access="agy"]'),null);assert.equal(v.requests.filter(r=>r.body).length,0);
});

for(const room of [false,true])test('351: real HTTP permission change and model selection preserve '+(room?'room':'seat')+' context without launching a model',async t=>{
 const cli=await cliFixture(t,'probe'),description={...cli.description,modes:{all:cli.description.modes.all!}},entry=cliEntry(description,{env:cli.env,cwd:cli.dir,temporaryDirectory:cli.dir}),catalog=new ProviderCatalog([entry]),h=await fixture(t,{deps:{providerCatalog:catalog}});await catalog.read('test-cli');
 if(room){const r=await call(h.api,'/api/room',{body:{vendor:'claude',model:h.runtime.registry.models.claude![0]!.id,folder:true}});assert.equal(r.status,200,r.text)}
 const initial=(await call(h.api,'/api/status')).body,v=ui({room,fetch:async(path,body)=>(await call(h.api,path,body?{body}:{})).body,statusFetch:async()=>(await call(h.api,'/api/status')).body});v.H.project=initial.project;v.ctx.binding.applyStatus(initial,null);await v.status();await v.open();const id=room?'room':'worker',chat=h.runtime.project.state.chats.active[id];
 await v.find('[data-cx-full-access="test-cli"]').emit('click');assert.equal(h.runtime.registry.get(id)!.mode,'read');await v.find('[data-cx-access-confirm]').emit('click');assert.equal(h.runtime.registry.get(id)!.mode,'all');await v.select('test-cli','test-model').emit('click');assert.equal(h.runtime.registry.get(id)!.vendor,'test-cli',JSON.stringify({requests:v.requests,pane:v.H.pane,menu:v.find('.cx-pop').textContent}));assert.equal(h.runtime.registry.get(id)!.mode,'all');assert.equal(h.runtime.project.state.chats.active[id],chat);assert.equal(cli.capture().filter(r=>r.action==='turn').length,0);assert.equal(h.provider.calls.length+h.codex.calls.length,0);
});

for(const change of ['project','chat','project A-B-A','chat A-B-A','mode A-B-A'])test('358: delayed permission POST cannot elevate after '+change,{timeout:12000},async t=>{
 const h=await fixture(t),other=change.startsWith('project')?await fixture(t):null,entered=deferred(),release=deferred();t.after(()=>release.resolve());let receipt:Awaited<ReturnType<typeof call>>|undefined;
 await call(h.api,'/api/chats/new',{body:{pane:'worker',carry:'none'}});
 const initial=(await call(h.api,'/api/status')).body,v=ui({fetch:async(path,body)=>{if(path==='/api/providers/catalog')return catalogue();entered.resolve();await release.promise;receipt=await call(h.api,path,{body});return receipt.body}});
 const bind=(status:Data)=>{v.H.project=status.project;v.H.panes=plain(status.panes);v.H.pane=v.H.panes.find((p:Data)=>p.id==='worker');v.H.active=plain(status.activeChats);v.S.ui.pane='worker'};
 bind(initial);await v.status();await v.open();await v.find('[data-cx-full-access="agy"]').emit('click');const click=v.find('[data-cx-access-confirm]').emit('click');await entered.promise;
 const expected=initial.panes.find((p:Data)=>p.id==='worker').settingsBinding;assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{mode:'all',binding:expected}}]);
 if(change.startsWith('chat')){assert.equal((await call(h.api,'/api/chats/new',{body:{pane:'worker',carry:'none'}})).status,200);if(change.endsWith('A-B-A'))assert.equal((await call(h.api,'/api/chats/open',{body:{chat:expected.chat,carry:'none'}})).status,200)}
 else if(change.startsWith('project')){assert.equal((await call(h.api,'/api/project',{body:{path:other!.dir}})).status,200);if(change.endsWith('A-B-A'))assert.equal((await call(h.api,'/api/project',{body:{path:h.dir}})).status,200)}
 else{for(const mode of ['edit','read'])assert.equal((await call(h.api,'/api/panes/worker',{body:{mode}})).status,200)}
 bind((await call(h.api,'/api/status')).body);await v.status();const before=h.runtime.registry.get('worker')!.settings(),file=h.runtime.project.dir+'/.harness/state/panes.json',bytes=()=>existsSync(file)?readFileSync(file):null,saved=bytes();release.resolve();await click;
 assert.equal(receipt?.status,409,receipt?.text);assert.equal(receipt?.body.code,'binding_changed');assert.deepEqual(h.runtime.registry.get('worker')!.settings(),before);assert.deepEqual(bytes(),saved);assert.equal(v.H.pane.mode,'read');assert.equal(h.provider.calls.length+h.codex.calls.length,0);
});

test('358: missing or forged confirmation fields refuse without changing settings; an intact confirmation is consumed once',async t=>{
 const h=await fixture(t),status=(await call(h.api,'/api/status')).body,expected=status.panes.find((p:Data)=>p.id==='worker').settingsBinding,before=h.runtime.registry.get('worker')!.settings();
 const cases:any[]=[undefined,null,[],{}, {...expected,extra:true}];
 for(const key of Object.keys(expected)){const absent={...expected};delete absent[key];cases.push(absent,{...expected,[key]:key==='revision'?expected.revision+1:'forged'})}
 for(const binding of cases){const r=await call(h.api,'/api/panes/worker',{body:{mode:'all',binding}});assert.equal(r.status,409,r.text);assert.equal(r.body.code,'binding_changed');assert.deepEqual(h.runtime.registry.get('worker')!.settings(),before)}
 const accepted=await call(h.api,'/api/panes/worker',{body:{mode:'all',binding:expected}});assert.equal(accepted.status,200,accepted.text);assert.equal(accepted.body.pane.mode,'all');assert.ok(accepted.body.pane.settingsBinding.revision>expected.revision);
 const duplicate=await call(h.api,'/api/panes/worker',{body:{mode:'all',binding:expected}});assert.equal(duplicate.status,409);assert.equal(duplicate.body.code,'binding_changed');assert.equal(h.provider.calls.length+h.codex.calls.length,0);
});

test('358: the ordinary rights menu sends the original server binding too',async()=>{
 const v=ui();await v.find('[data-cx="rights"]').emit('click');const expected=plain(v.H.pane.settingsBinding);await v.find('[data-cx-mode="all"]').emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{mode:'all',binding:expected}}]);
});

test('358: an already open rights menu cannot adopt a fresh binding after an unseen project A-B-A',async t=>{
 const h=await fixture(t),other=await fixture(t);let receipt:Awaited<ReturnType<typeof call>>|undefined;
 const v=ui({fetch:async(path,body)=>{receipt=await call(h.api,path,{body});return receipt.body}}),initial=(await call(h.api,'/api/status')).body;
 const bind=(status:Data)=>{v.H.project=status.project;v.H.panes=plain(status.panes);v.H.pane=v.H.panes.find((p:Data)=>p.id==='worker');v.H.active=plain(status.activeChats)};
 bind(initial);await v.find('[data-cx="rights"]').emit('click');const expected=plain(v.H.pane.settingsBinding);
 for(const path of [other.dir,h.dir])assert.equal((await call(h.api,'/api/project',{body:{path}})).status,200);
 bind((await call(h.api,'/api/status')).body);await v.status();await v.find('[data-cx-mode="all"]').emit('click');
 assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{mode:'all',binding:expected}}]);assert.equal(receipt?.status,409,receipt?.text);assert.equal(h.runtime.registry.get('worker')!.mode,'read');
});

for(const page of ['chat','new'])for(const door of ['rights','model'])test('358: fresh '+door+' permission in '+page+' works after a completed turn through the shared state stream',async t=>{
 const h=await fixture(t),events=collect(h.runtime);t.after(()=>events.sub.close());let receipt:Awaited<ReturnType<typeof call>>|undefined;
 const initial=(await call(h.api,'/api/status')).body,v=ui({page,fetch:async(path,body)=>{if(path==='/api/providers/catalog')return catalogue();receipt=await call(h.api,path,{body});return receipt.body}});
 Object.assign(v.H,{project:initial.project,panes:plain(initial.panes),active:plain(initial.activeChats)});v.H.pane=v.H.panes.find((p:Data)=>p.id==='worker');v.S.ui.pane='worker';await v.status();
 const sources:Data[]=[];v.ctx.drawLive=()=>{};v.ctx.paneName=(p:Data)=>p.label;v.ctx.EventSource=class{onmessage:((e:Data)=>void)|null=null;constructor(){sources.push(this)}close(){}};v.H.events={onmessage(){}};
 runInContext('var warningSeen=new Set();\n'+part(live,'  function consumeState(','  function waitingControls(')+part(live,'  const LIVE_EVENTS=','  async function hConnect(')+'\nsyncLiveEvents();',v.ctx);
 await h.runtime.runTurn('worker','fixture turn');const states=events.events.filter(e=>e.type==='state'&&e.pane==='worker');assert.ok(states.length>=2);
 for(const event of events.events){if(event.type==='state')sources[0]!.onmessage({data:JSON.stringify(event)});if(event.type==='done')v.H.cur=null}await v.status();
 assert.deepEqual(plain(v.H.pane.settingsBinding),h.runtime.paneBinding('worker'));assert.notEqual(v.H.pane.settingsBinding.revision,initial.panes[0].settingsBinding.revision);
 if(door==='rights'){await v.find('[data-cx="rights"]').emit('click');await v.find('[data-cx-mode="all"]').emit('click')}else{await v.open();await v.find('[data-cx-full-access="agy"]').emit('click');await v.find('[data-cx-access-confirm]').emit('click')}
 assert.equal(receipt?.status,200,receipt?.text);assert.equal(h.runtime.registry.get('worker')!.mode,'all');assert.equal(h.provider.calls.length,1);
});

for(const page of ['chat','new','first'])test('306: '+page+' room passes vendor and the program default without launching a turn',async()=>{
 const v=ui({page,room:true});await v.open();const button=v.select('gemini','default');assert.equal(button.textContent,'по умолчанию программы');assert.match(v.find('[data-cx-program="gemini"]').textContent,/1 модель/);
 await button.emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/room',body:{vendor:'gemini',model:'default',folder:true}}]);assert.equal(v.H.pane.vendor,'gemini');
 assert.equal(v.listeners.size,0);
 assert.equal(v.find('[data-cx="model"] b').textContent,'по умолчанию программы');
});

test('305: + → model uses the same catalogue and vendor selection',async()=>{
 const v=ui();await v.find('[data-cx="plus"]').emit('click');await v.find('[data-cx-nav="model"]').emit('click');await v.flush();
 await v.select('copilot','copilot-model').emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'copilot',model:'copilot-model'}}]);
});

test('305: a stale catalogue response cannot restore a removed model',async()=>{
 const pending:ReturnType<typeof deferred<Data>>[]=[];const v=ui({fetch:async()=>{const gate=deferred<Data>();pending.push(gate);return gate.promise}});
 await v.find('[data-cx="model"]').emit('click');await v.providers({ok:false});assert.equal(pending.length,2);
 const next=catalogue();next.providers[1]!.models=[{id:'new-model',label:'New Codex'}];v.H.models.codex=next.providers[1]!.models;await v.status();pending[1]!.resolve(next);await v.flush();pending[0]!.resolve(catalogue());await v.flush();
 assert.ok(v.select('codex','new-model'));assert.equal(v.document.querySelector('[data-cx-vendor="codex"][data-cx-model="shared"]'),null);
});

for(const change of ['project','pane','chat'])test('305: delayed selection receipt cannot alter a different '+change,async()=>{
 const entered=deferred(),gate=deferred<Data>();const v=ui({fetch:async(path)=>{if(path==='/api/providers/catalog')return catalogue();entered.resolve();return gate.promise}});await v.open();
 const click=v.select('codex','shared').emit('click');await entered.promise;
 if(change==='project')v.H.project='/project-b';if(change==='pane'){v.S.ui.pane='other';v.H.pane={...v.H.pane,id:'other'}}if(change==='chat')v.H.active.worker='chat-b';await v.status();
 gate.resolve({ok:true,pane:{id:'worker',model:'shared',vendor:'codex'}});await click;assert.equal(v.H.pane.vendor,'claude');assert.equal(v.document.querySelector('.cx-pop'),null);
});

for(const missing of ['all','provider','mode','reason'])test('305: missing '+missing+' support is visible and cannot change the pane',async()=>{
 const v=ui();if(missing==='all')delete v.H.turnModes;else if(missing==='provider')delete v.H.turnModes.gemini;else if(missing==='mode')delete v.H.turnModes.gemini.read;else v.H.turnModes.gemini.read={ok:false};
 await v.open();const b=v.select('gemini','default');assert.equal(b.disabled,true);assert.match(v.find('[data-cx-program="gemini"] [data-cx-group-reason]').textContent,missing==='reason'?/В режиме «Чтение» недоступно/:/движок не сообщил поддержку режима/);await b.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
});

for(const room of [false,true])test('305/306: 409 stays in '+(room?'room':'pane')+' menu and leaves configuration intact',async()=>{
 const v=ui({room,fetch:async(path)=>path==='/api/providers/catalog'?catalogue():{ok:false,code:'capability_unsupported',error:'программа больше не гарантирует Чтение'}});const before=plain(v.H.pane);await v.open();await v.select('codex','shared').emit('click');
 assert.deepEqual(v.H.pane,before);assert.match(v.find('[data-cx-model-error]').textContent,/программа больше не гарантирует Чтение/);assert.equal(v.select('codex','shared').disabled,false);
});

test('305: selection keeps the existing API waiting/context handoff response path',async()=>{
 const pending={turnInstanceId:'turn-context',reason:'needs_owner',actions:['retry']};
 const v=ui({fetch:async(path,body)=>path==='/api/providers/catalog'?catalogue():{ok:true,pane:{id:'worker',label:'воркер',mode:'read',...body},waiting:pending}});await v.open();await v.select('codex','shared').emit('click');
 assert.deepEqual(plain(v.waiting),[{pane:'worker',info:pending,project:'/project-a'}]);assert.deepEqual(plain(v.H.pane.waiting),pending);assert.equal(v.requests.filter(r=>r.body).length,1);
});

test('305: providers events replace the model list; status updates mode support without losing search',async()=>{
 const v=ui();await v.open();const input=v.find('.cx-find');input.value='gemini';input.focus();await input.emit('input');
 v.H.turnModes.gemini.read={ok:false,reason:'режим отключён'};await v.status();assert.equal(v.find('.cx-find').value,'gemini');assert.equal(v.document.activeElement,v.find('.cx-find'));assert.equal(v.select('gemini','default').disabled,true);
 const next=catalogue();next.providers[1]!.models=[{id:'new-model',label:'New Codex'}];await v.providers(next);assert.equal(v.document.querySelector('[data-cx-vendor="codex"][data-cx-model="shared"]'),null);assert.ok(v.select('codex','new-model'));
 v.ctx.CX.close();assert.equal(v.listeners.size,0);await v.open();assert.equal(v.listeners.size,1);await v.hide();assert.equal(v.listeners.size,0);
});

for(const change of ['project','pane','chat','pagehide'])test('305: late catalogue cannot reopen or configure after '+change,async()=>{
 const gate=deferred<Data>();const v=ui({fetch:async()=>gate.promise});await v.find('[data-cx="model"]').emit('click');assert.equal(v.listeners.size,1);
 if(change==='project')v.H.project='/project-b';if(change==='pane')v.S.ui.pane='other';if(change==='chat')v.H.active.worker='chat-b';if(change==='pagehide')await v.hide();else await v.status();
 gate.resolve(catalogue());await v.flush();assert.equal(v.document.querySelector('.cx-pop'),null);assert.equal(v.listeners.size,0);assert.equal(v.requests.filter(r=>r.body).length,0);
});

test('305: queued model selection is cancelled when capability changes and returns to its former value',async()=>{
 const v=ui();await v.open();const gate=deferred();const before=v.ctx.LIVE.configureSetting(()=>gate.promise.then(()=>true)),choice=v.select('gemini','default').emit('click');
 v.H.turnModes.gemini.read={ok:false,reason:'отозвано'};await v.status();v.H.turnModes.gemini.read={ok:true};await v.status();gate.resolve();await before;await choice;
 assert.equal(v.requests.filter(r=>r.body).length,0);assert.equal(v.H.pane.vendor,'claude');
});

test('305/309: read failure preserves status groups and choices; retry restores metadata',async()=>{
 let result:Data=catalogue();const v=ui({fetch:async()=>result});await v.open();result={ok:false,error:'каталог временно недоступен'};await v.providers(result);
 assert.equal(v.document.querySelectorAll('[data-cx-program]').length,6);assert.equal(v.select('codex','shared').disabled,false);assert.match(v.find('.cx-pop').textContent,/каталог временно недоступен/);
 result=catalogue();await v.find('[data-cx-model-retry]').emit('click');assert.equal(v.select('codex','shared').disabled,false);
});

for(const response of [{ok:true}, {ok:true,providers:[{id:'claude',title:'Claude Code',kind:'subscription'}]}, {ok:true,providers:[...catalogue().providers,catalogue().providers[0]]},...['installed','checking'].map(key=>({ok:true,providers:[{...catalogue().providers[0],[key]:undefined}]}))])test('305/309: invalid catalogue metadata leaves the real status models visible',async()=>{
 const v=ui({fetch:async()=>response});await v.open();assert.equal(v.document.querySelectorAll('[data-cx-model]').length,7);assert.match(v.find('.cx-pop').textContent,/Каталог моделей не прочитан/);assert.ok(v.find('[data-cx-model-retry]'));assert.equal(v.select('codex','shared').disabled,false);
});

for(const page of ['chat','new','first'])for(const failure of ['slow','404','network'])test('309: '+page+' selects from status while catalogue is '+failure,async()=>{
 const gate=deferred<Data>();const v=ui({page,fetch:async(path,body)=>{if(path!=='/api/providers/catalog')return {ok:true,pane:{id:'worker',label:'воркер',mode:'read',...body}};if(failure==='slow')return gate.promise;if(failure==='network')throw Error('offline');return {ok:false,code:'not_found',error:'маршрут каталога недоступен'}}});
 await v.open();assert.equal(v.document.querySelectorAll('[data-cx-program]').length,6);assert.equal(v.select('codex','shared').disabled,false);assert.equal(v.select('agy','agy-model').disabled,true);if(failure!=='slow')assert.ok(v.find('[data-cx-model-retry]'));
 await v.select('codex','shared').emit('click');assert.equal(v.H.pane.vendor,'codex');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'codex',model:'shared'}}]);gate.resolve(catalogue());await v.flush();
});

test('305: catalogue titles, model IDs and capability reasons are text, not executable markup',async()=>{
 const response=catalogue();response.providers[0]!.title='<img src=x onerror=alert(1)>';response.providers[0]!.models=[{id:'"><script>bad()</script>',label:'<img src=x>'}];
 const v=ui({fetch:async()=>response});v.H.turnModes.claude.read={ok:false,reason:'<script>bad()</script>'};v.H.turnModes.claude.all={ok:false};await v.open();assert.equal(v.document.querySelector('script'),null);assert.equal(v.document.querySelector('img'),null);assert.match(v.find('[data-cx-program="claude"]').textContent,/<script>bad\(\)<\/script>/);
 assert.equal(v.requests.filter(r=>r.body).length,0);
});

test('305/308: status enables the supported mode with its note; omitted capabilities disable it again',async()=>{
 const v=ui();await v.open();assert.equal(v.select('agy','agy-model').disabled,true);
 const status={project:v.H.project,panes:[{...v.H.pane,mode:'all'}],activeChats:v.H.active,models:v.H.models,modes:v.H.modes};
 v.ctx.binding.applyStatus({...status,turnModes:modes()},null);await v.status();const button=v.select('agy','agy-model');assert.equal(button.disabled,false);assert.match(v.find('[data-cx-program="agy"] [data-cx-group-reason]').textContent,/без инструментов Harnessy/);
 await button.emit('click');assert.equal(v.H.pane.vendor,'agy');assert.equal(v.requests.filter(r=>r.body).length,1);
 v.ctx.binding.applyStatus(status,null);await v.status();assert.equal(v.select('agy','agy-model').disabled,true);assert.match(v.find('[data-cx-program="agy"] [data-cx-group-reason]').textContent,/движок не сообщил поддержку режима/);
});

for(const page of ['chat','new','first'])test('311: '+page+' refreshes cold status after catalogue discovery without inventing default',async()=>{
 const catalog=deferred<Data>(),fresh=deferred<Data>();const v=ui({page,fetch:async()=>catalog.promise,statusFetch:()=>fresh.promise});v.H.models.copilot=[];v.H.models.gemini=[];
 await v.open();assert.equal(v.document.querySelector('[data-cx-vendor="copilot"]'),null);assert.equal(v.document.querySelector('[data-cx-vendor="gemini"]'),null);
 catalog.resolve(catalogue());await v.flush();assert.equal(v.requests.filter(r=>r.path==='/api/status').length,1);
 fresh.resolve({project:v.H.project,panes:v.H.panes,models:{...v.H.models,copilot:[{id:'discovered',label:'Discovered Copilot'}],gemini:[{id:'default',label:'по умолчанию программы'}]},turnModes:modes()});await v.flush();
 assert.equal(v.select('copilot','discovered').disabled,false);assert.ok(v.select('gemini','default'));
});

test('311: real catalogue discovery refreshes HTTP status and exposes the CLI model on cold startup',async t=>{
 const cli=await cliFixture(t,'probe'),entry=cliEntry(cli.description,{env:cli.env,cwd:cli.dir,temporaryDirectory:cli.dir}),ready=deferred(),discovered=deferred(),statusReady=deferred();
 entry.version=async()=>{await ready.promise;return '1.0'};t.after(()=>ready.resolve());
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}}),initial=(await call(h.api,'/api/status')).body;
 assert.deepEqual(initial.models['test-cli'],[]);
 const v=ui({fetch:async(path,body)=>{const response=await call(h.api,path,body?{body}:{});if(path==='/api/providers/catalog')discovered.resolve();return response.body},statusFetch:async()=>{const response=await call(h.api,'/api/status');if(response.body.models['test-cli']?.length)statusReady.resolve();return response.body}});
 v.H.project=initial.project;v.ctx.binding.applyStatus(initial,null);await v.status();await v.open();assert.equal(v.document.querySelector('[data-cx-vendor="test-cli"]'),null);
 const stream=await sse(h.api,'owner');t.after(()=>stream.close());stream.response.on('data',()=>{for(const event of stream.frames.splice(0))if(event.type==='providers')for(const listener of v.listeners)listener.onmessage({data:JSON.stringify(event)})});
 await discovered.promise;await v.flush();assert.match(v.find('[data-cx-program="test-cli"]').textContent,/проверяется…/);ready.resolve();
 // Wait for the actual status response, not a duration or an assumption about HTTP latency.
 await statusReady.promise;await v.flush();
 assert.equal(v.select('test-cli','test-model').disabled,false);assert.equal(v.requests.filter(r=>r.body).length,0);
});

for(const change of ['project','pane','chat','pagehide','reopen','newer-request'])test('311: late status is discarded after '+change,async()=>{
 const pending:ReturnType<typeof deferred<Data>>[]=[];const v=ui({statusFetch:()=>{const gate=deferred<Data>();pending.push(gate);return gate.promise}});await v.open();const oldProject=v.H.project,oldModels=v.H.models;
 assert.equal(pending.length,1);
 if(change==='project')v.H.project='/different';if(change==='pane')v.S.ui.pane='other';if(change==='chat')v.H.active.worker='different';
 if(change==='pagehide')await v.hide();else if(change==='reopen'){await v.find('[data-cx="model"]').emit('click');await v.open()}else if(change==='newer-request')await v.providers(catalogue());else await v.status();
 pending[0]!.resolve({project:oldProject,panes:v.H.panes,models:{forged:[{id:'late',label:'Late'}]},turnModes:{}});await v.flush();
 assert.equal(v.H.models,oldModels);assert.equal(v.document.querySelector('[data-cx-model="late"]'),null);
 for(const gate of pending.slice(1))gate.resolve({project:v.H.project,panes:v.H.panes,models:oldModels,turnModes:modes()});await v.flush();
});

for(const code of ['provider_checking','provider_not_installed','login_required','model_unsupported'])test('310: '+code+' stays readable and preserves the pane',async()=>{
 const v=ui({fetch:async(path)=>path==='/api/providers/catalog'?catalogue():{ok:false,code,reason:'Действие недоступно: '+code}}),before=plain(v.H.pane);await v.open();await v.select('codex','shared').emit('click');
 assert.deepEqual(v.H.pane,before);assert.match(v.find('[data-cx-model-error]').textContent,new RegExp(code));
 if(code==='login_required')assert.equal(v.find('[data-cx-model-error] a').getAttribute('href'),'11-connections.html');
});

for(const state of ['cold','refreshing','missing'] as const)test('317: '+state+' program group stays visible and existing models cannot be selected',async()=>{
 const next=catalogue(),row=next.providers.find(p=>p.id==='codex')!;row.installed=state==='cold'?null:state!=='missing';row.checking=state!=='missing';
 const v=ui({fetch:async(path,body)=>path==='/api/providers/catalog'?next:{ok:true,pane:{...v.H.pane,...body}}});await v.open();
 assert.match(v.find('[data-cx-program="codex"]').textContent,state==='missing'?/не установлена/:/проверяется…/);
 const old=v.select('codex','shared');assert.equal(old.disabled,true);await old.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
 row.installed=true;row.checking=false;await v.providers(next);assert.equal(v.select('codex','shared').disabled,false);
 await v.select('codex','shared').emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'codex',model:'shared'}}]);
});

test('317: cold program is visible even without an entry in status.models and never invents a selectable model',async()=>{
 const next=catalogue();next.providers.find(p=>p.id==='gemini')!.installed=null;next.providers.find(p=>p.id==='gemini')!.checking=true;
 const v=ui({fetch:async()=>next});delete v.H.models.gemini;await v.open();
 assert.match(v.find('[data-cx-program="gemini"]').textContent,/проверяется…/);assert.equal(v.document.querySelector('[data-cx-vendor="gemini"]'),null);
});

for(const room of [false,true])test('316: explicit via groups routed models, while selection still uses Codex ('+(room?'room':'seat')+')',async()=>{
 const v=ui({room});v.H.models.codex=[{id:'gpt-routed',label:'Routed GPT',via:'provider-router',viaStatus:{ok:true}},{id:'qwen-unrelated',label:'Native catalogue model'},{id:'cloud:any',label:'Cloud',via:'provider-router',viaStatus:{ok:true}}];await v.open();
 const routed=v.find('[data-cx-program="provider-router"]'),native=v.find('[data-cx-program="codex"]');assert.match(routed.textContent,/provider-router.*локально · через Codex/);assert.equal(routed.querySelectorAll('[data-cx-model]').length,2);assert.equal(native.querySelectorAll('[data-cx-model]').length,1);assert.ok(native.querySelector('[data-cx-model="qwen-unrelated"]'));
 await v.select('codex','gpt-routed').emit('click');const sent=v.requests.find(r=>r.body?.model==='gpt-routed')!;assert.equal(sent.path,room?'/api/room':'/api/panes/worker');assert.equal(sent.body!.vendor,'codex');
});

test('316: router models inherit Codex capability refusals and vanish from the group when metadata is absent',async()=>{
 const v=ui();v.H.models.codex=[{id:'opaque',label:'Opaque',via:'provider-router',viaStatus:{ok:true}}];v.H.turnModes.codex.read={ok:false,reason:'provider disabled'};await v.open();const button=v.select('codex','opaque');assert.equal(button.disabled,true);assert.match(v.find('[data-cx-program="provider-router"] [data-cx-group-reason]').textContent,/provider disabled/);await button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
 v.H.models.codex=[{id:'opaque',label:'Opaque'}];await v.status();assert.equal(v.document.querySelector('[data-cx-program="provider-router"]'),null);assert.ok(v.find('[data-cx-program="codex"] [data-cx-model="opaque"]'));
});

for(const page of ['chat','new'])test('328: '+page+' keeps offline router models visible and disabled from real HTTP status; recovery restores selection',async t=>{
 let offline=false;const models=[{id:'gpt-routed',label:'Routed GPT'},{id:'qwen-native',label:'Native custom'}],h=await fixture(t,{deps:{models:{codex:models}},router:{models:()=>({ok:true,models:['gpt-routed']}),health:async()=>offline?{ok:false,reason:'/health: HTTP 503'}:{ok:true,models:['gpt-routed'],families:['gpt']}}});h.codex.models=async()=>models;
 const pending=new Set<Promise<Data>>(),get=(path:string,body?:Data)=>{const p=call(h.api,path,body?{body}:{}).then(r=>r.body);pending.add(p);void p.finally(()=>pending.delete(p));return p},settle=async()=>{do{await Promise.all([...pending]);await immediate()}while(pending.size)};
 const initial=await get('/api/status'),v=ui({page,room:page==='new',fetch:get,statusFetch:()=>get('/api/status')});v.H.project=initial.project;v.ctx.binding.applyStatus(initial,null);await v.open();await settle();assert.equal(v.select('codex','gpt-routed').disabled,false);
 offline=true;await v.providers(catalogue());await settle();
 assert.ok(v.find('[data-cx-program="provider-router"]'));const unavailable=v.select('codex','gpt-routed');assert.equal(unavailable.disabled,true);assert.match(v.find('[data-cx-program="provider-router"] [data-cx-group-reason]').textContent,/provider-router не отвечает: \/health: HTTP 503/);assert.equal(v.select('codex','qwen-native').disabled,false);
 unavailable.disabled=false;await unavailable.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0,'forged enabled DOM cannot bypass engine availability');
 offline=false;await v.providers(catalogue());await settle();assert.equal(v.select('codex','gpt-routed').disabled,false);await v.select('codex','gpt-routed').emit('click');await settle();
 assert.deepEqual(v.requests.filter(r=>r.body),[{path:page==='new'?'/api/room':'/api/panes/worker',body:page==='new'?{model:'gpt-routed',vendor:'codex',folder:true}:{vendor:'codex',model:'gpt-routed'}}]);assert.equal(h.codex.calls.length+h.provider.calls.length,0);
});

for(const viaStatus of [undefined,{}, {ok:'true'}, {ok:false}])test('328: missing or malformed router availability cannot enable a routed model: '+JSON.stringify(viaStatus),async()=>{
 const v=ui();v.H.models.codex=[{id:'opaque',label:'Opaque',via:'provider-router',viaStatus}];await v.open();const button=v.select('codex','opaque');assert.equal(button.disabled,true);assert.match(v.find('[data-cx-program="provider-router"] [data-cx-group-reason]').textContent,/provider-router не отвечает/);await button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
});


test('334: Ollama has its own cloud/local group; daemon refusal disables its models without touching Codex/router',async()=>{
 const v=ui();await v.open();const next=catalogue();next.providers.push({id:'ollama',title:'Ollama',subtitle:'облако и локально',kind:'local',installed:true,checking:false,models:[{id:'glm-5.3:cloud',label:'glm-5.3:cloud · облако'},{id:'gemma4:latest',label:'gemma4:latest · локально'}]} as any);v.H.turnModes.ollama={read:{ok:true}};await v.providers(next);
 assert.match(v.find('[data-cx-program="ollama"]').textContent,/Ollama.*облако и локально.*2 модели/);assert.match(v.select('ollama','glm-5.3:cloud').textContent,/облако/);assert.match(v.select('ollama','gemma4:latest').textContent,/локально/);assert.equal(v.select('ollama','glm-5.3:cloud').disabled,false);assert.doesNotMatch(v.find('[data-cx-program="codex"]').textContent,/glm-5.3/);assert.doesNotMatch(v.find('[data-cx-program="router"]').textContent,/glm-5.3/);
 v.H.turnModes.ollama={read:{ok:false,reason:'демон не запущен; запустите ollama serve'}};await v.providers(next);assert.equal(v.select('ollama','glm-5.3:cloud').disabled,true);assert.match(v.find('[data-cx-program="ollama"] [data-cx-group-reason]').textContent,/демон не запущен/);await v.select('ollama','glm-5.3:cloud').emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
 v.H.turnModes.ollama={read:{ok:true}};await v.providers(next);await v.select('ollama','glm-5.3:cloud').emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'ollama',model:'glm-5.3:cloud'}}]);
});

for(const mode of ['read','edit','all'])test('TS-21c: saved API route is a separate group and selectable in '+mode,{timeout:15000},async()=>{
 const routes=[{id:'api:my-route',title:'Мой API',kind:'apikey',installed:true,checking:false,models:[{id:'shared',label:'Моя модель'}]}],v=ui({apiRoutes:routes});v.H.pane.mode=mode;await v.open();
 assert.match(v.find('[data-cx-program="api:my-route"]').textContent,/Мой API/);const button=v.select('api:my-route','shared');assert.equal(button.disabled,false);await button.emit('click');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'api:my-route',model:'shared'}}]);
});
test('TS-21c: removing a route while menu is open cannot select a stale model',{timeout:15000},async()=>{
 const routes=[{id:'api:mine',title:'API',kind:'apikey',installed:true,checking:false,models:[{id:'shared',label:'Model'}]}],v=ui({apiRoutes:routes});await v.open();const old=v.select('api:mine','shared');routes.splice(0);await v.status();assert.equal(v.document.querySelector('[data-cx-program="api:mine"]'),null);await old.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
});
