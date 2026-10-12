import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {deferred,fixture,call,sse} from './test-helpers.ts';
import {ProviderCatalog,cliEntry} from '../../providers/src/index.ts';
import {cliFixture} from '../../providers/src/cli/test-support.ts';

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
]});
const modes=()=>Object.fromEntries(catalogue().providers.map(p=>[p.id,Object.fromEntries(['read','edit','all','chat'].map(m=>[m,
 p.id==='agy'?m==='all'?{ok:true,note:'без инструментов Harnessy'}:{ok:false,reason:'нет изоляции инструментов на ход'}:p.id==='copilot'&&m==='edit'?{ok:false,reason:'нет флага для этого режима'}:{ok:true}]))]));
function ui(options:{page?:string;room?:boolean;statusFetch?:()=>Promise<Data>;fetch?:(path:string,body:Data|undefined)=>Promise<Data>}={}){
 const d=dom('<div class="frame cur"><div class="main"><div class="feed"></div><div class="box"><input class="in live-in"><div class="bar2"></div></div></div></div>');
 d.html.setAttribute('data-proto','');d.html.setAttribute('data-page',options.page??'chat');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const pane={id:options.room?'room':'worker',label:options.room?'без роли':'воркер',vendor:'claude',model:'shared',mode:'read',busy:false};
 const H:Data={on:true,project:'/project-a',pane,panes:[pane],active:{[pane.id]:'chat-a'},models:Object.fromEntries(catalogue().providers.map(p=>[p.id,p.id==='gemini'?[{id:'default',label:'по умолчанию программы'}]:p.models])),turnModes:modes(),modes:[{id:'read',label:'Чтение'},{id:'edit',label:'Правка'},{id:'all',label:'Полный доступ'},{id:'chat',label:'Без проекта'}],chatList:[]};
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
 ctx.LIVE={H,S,esc,...ctx.binding,save(){},log(){},toast:ctx.toast,paneName:(p:Data)=>p.label,busy:()=>false,hStatus(){},
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
 const button=v.select('agy','agy-model');assert.equal(button.disabled,true);assert.match(button.textContent,/Ходы в режиме «Чтение» недоступны: нет изоляции/);await button.emit('click');assert.equal(v.select('copilot','copilot-model').disabled,false);
 assert.equal(v.requests.filter(r=>r.body).length,0);await v.select('codex','shared').emit('click');
 assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'codex',model:'shared'}}]);assert.equal(v.H.pane.vendor,'codex');assert.equal(v.find('[data-cx="model"] b').textContent,'Codex model');
 assert.equal(v.requests.some(r=>r.path==='/api/chat'),false);
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
 await v.open();const b=v.select('gemini','default');assert.equal(b.disabled,true);assert.match(b.textContent,/движок не сообщил поддержку режима/);await b.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);
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

for(const response of [{ok:true}, {ok:true,providers:[{id:'claude',title:'Claude Code',kind:'subscription'}]}, {ok:true,providers:[...catalogue().providers,catalogue().providers[0]]}])test('305/309: invalid catalogue metadata leaves the real status models visible',async()=>{
 const v=ui({fetch:async()=>response});await v.open();assert.equal(v.document.querySelectorAll('[data-cx-model]').length,7);assert.match(v.find('.cx-pop').textContent,/Каталог моделей не прочитан/);assert.ok(v.find('[data-cx-model-retry]'));assert.equal(v.select('codex','shared').disabled,false);
});

for(const page of ['chat','new','first'])for(const failure of ['slow','404','network'])test('309: '+page+' selects from status while catalogue is '+failure,async()=>{
 const gate=deferred<Data>();const v=ui({page,fetch:async(path,body)=>{if(path!=='/api/providers/catalog')return {ok:true,pane:{id:'worker',label:'воркер',mode:'read',...body}};if(failure==='slow')return gate.promise;if(failure==='network')throw Error('offline');return {ok:false,code:'not_found',error:'маршрут каталога недоступен'}}});
 await v.open();assert.equal(v.document.querySelectorAll('[data-cx-program]').length,6);assert.equal(v.select('codex','shared').disabled,false);assert.equal(v.select('agy','agy-model').disabled,true);if(failure!=='slow')assert.ok(v.find('[data-cx-model-retry]'));
 await v.select('codex','shared').emit('click');assert.equal(v.H.pane.vendor,'codex');assert.deepEqual(v.requests.filter(r=>r.body),[{path:'/api/panes/worker',body:{vendor:'codex',model:'shared'}}]);gate.resolve(catalogue());await v.flush();
});

test('305: catalogue titles, model IDs and capability reasons are text, not executable markup',async()=>{
 const response=catalogue();response.providers[0]!.title='<img src=x onerror=alert(1)>';response.providers[0]!.models=[{id:'"><script>bad()</script>',label:'<img src=x>'}];
 const v=ui({fetch:async()=>response});v.H.turnModes.claude.read={ok:false,reason:'<script>bad()</script>'};await v.open();assert.equal(v.document.querySelector('script'),null);assert.equal(v.document.querySelector('img'),null);assert.match(v.find('[data-cx-program="claude"]').textContent,/<script>bad\(\)<\/script>/);
 assert.equal(v.requests.filter(r=>r.body).length,0);
});

test('305/308: status enables the supported mode with its note; omitted capabilities disable it again',async()=>{
 const v=ui();await v.open();assert.equal(v.select('agy','agy-model').disabled,true);
 const status={project:v.H.project,panes:[{...v.H.pane,mode:'all'}],activeChats:v.H.active,models:v.H.models,modes:v.H.modes};
 v.ctx.binding.applyStatus({...status,turnModes:modes()},null);await v.status();const button=v.select('agy','agy-model');assert.equal(button.disabled,false);assert.match(button.textContent,/без инструментов Harnessy/);
 await button.emit('click');assert.equal(v.H.pane.vendor,'agy');assert.equal(v.requests.filter(r=>r.body).length,1);
 v.ctx.binding.applyStatus(status,null);await v.status();assert.equal(v.select('agy','agy-model').disabled,true);assert.match(v.select('agy','agy-model').textContent,/движок не сообщил поддержку режима/);
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
 ready.resolve();await discovered.promise;
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

for(const code of ['provider_not_installed','login_required','model_unsupported'])test('310: '+code+' stays readable and preserves the pane',async()=>{
 const v=ui({fetch:async(path)=>path==='/api/providers/catalog'?catalogue():{ok:false,code,reason:'Действие недоступно: '+code}}),before=plain(v.H.pane);await v.open();await v.select('codex','shared').emit('click');
 assert.deepEqual(v.H.pane,before);assert.match(v.find('[data-cx-model-error]').textContent,new RegExp(code));
 if(code==='login_required')assert.equal(v.find('[data-cx-model-error] a').getAttribute('href'),'11-connections.html');
});
