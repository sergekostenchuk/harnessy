import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {deferred,fixture,sse,call} from './test-helpers.ts';
import {ProviderCatalog,ProviderError,LoginTerminal,type CatalogEntry} from '@harnessy/providers';
import {ollamaFixture} from '../../providers/src/ollama-test-helpers.ts';
import {antigravityFixture} from '../../providers/src/antigravity-test-helpers.ts';
import {devinFixture} from '../../providers/src/devin-test-helpers.ts';
import {kimiFixture} from '../../providers/src/kimi-test-helpers.ts';
import {opencodeFixture} from '../../providers/src/opencode-test-helpers.ts';
import type {TestContext} from 'node:test';
const read=(p:string)=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const login=(state='ok')=>({state,account:'u•••@example.test',command:'agy',checkedAt:100,reason:''});
const provider=(extra:any={})=>({id:'antigravity',title:'Antigravity',kind:'subscription',binary:'agy',installed:true,checking:false,version:'1.2.17',login:login(),models:[{id:'model-a',label:'Model A',default:true},{id:'model-b',label:'Model B'}],capabilities:{headless:true,resume:true,mcp:true,limits:false,probe:{ok:true}},...extra});
const catalog=(...providers:any[])=>({ok:true,providers});
function ui(handler?:(path:string,body:any)=>Promise<any>,initial:any=catalog(provider()),transport?:(path:string,init?:RequestInit)=>Promise<Response>,project='/a'){
 let httpApi:((path:string,body:any,operation:any)=>Promise<any>)|null=null;
 const raw=read('ui/sketches/disarto/11-connections.html'),d=dom(raw.slice(raw.indexOf('<body>'),raw.indexOf('<script>'))),requests:any[]=[],pending=new Map<Promise<any>,{path:string;body:any}>(),toasts:string[]=[],streams:any[]=[];
 Object.assign(d.document,{documentElement:d.html,body:d.body,visibilityState:'visible'});const H:any={on:true,project,confirmedProjectGeneration:0,panes:[{id:'worker',vendor:'antigravity',model:'model-a',label:'Воркер 1'}],models:{}};
 const defaults=(path:string,body:any)=>path==='/api/providers/catalog'?structuredClone(initial):path==='/api/connections'?{ok:true,project:H.project,providers:[],routes:['direct','proxy','iface']}:path==='/api/billing'?{ok:false}:path.endsWith('/probe')?{ok:true,provider:path.split('/')[3],model:body.model,approvalId:'probe-'+path.split('/')[3],status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'}}:path==='/api/approve'?{ok:true}:null;
 const context:any={document:d.document,location:{pathname:'/11-connections.html',hash:''},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(f:()=>void)=>f(),requestAnimationFrame:(f:()=>void)=>f(),LIVE:{H,esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),toast:(s:string)=>toasts.push(s),paneName:(p:any)=>p.label,log(){},subscribeLiveEvents(onmessage:any){const stream={onmessage,onopen:null,closed:false,close(){stream.closed=true}};streams.push(stream);return stream},providerLimitHTML:(_id:string,_name:string,_kind:string,supported:boolean)=>supported?'<p>Неделя · 42 % · остаток 58 %</p>':'<p>Провайдер лимиты не отдаёт.</p>',api:async(path:string,body?:any,operation?:any)=>{requests.push({path,body});const task=(async()=>{if(httpApi)return httpApi(path,body,operation);const result=await handler?.(path,body);return result===undefined?defaults(path,body):result})();pending.set(task,{path,body});try{return await task}finally{pending.delete(task)}}}};context.window=context;
 const vm=createContext(context);if(transport){context.H=H;context.fetch=transport;const live=read('ui/deploy/live.js');httpApi=runInContext('(function(){'+live.slice(live.indexOf('  const api='),live.indexOf('  // TS-07: waiting controls'))+'return api})()',vm)}runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(raw.slice(raw.indexOf('<script>')+8,raw.indexOf('</script>',raw.indexOf('<script>'))),vm);runInContext(read('ui/deploy/conn.js'),vm);
 const find=(s:string)=>{const node=d.document.querySelector(s);assert.ok(node,s);return node};const settle=async(skip:(request:{path:string;body:any})=>boolean=()=>false)=>{for(let i=0;i<30;i++){await Promise.allSettled([...pending].filter(([,request])=>!skip(request)).map(([task])=>task));await Promise.resolve();if([...pending.values()].every(skip))return}throw Error('UI did not settle')};
 const posts=(suffix='')=>requests.filter(r=>r.body&&r.path.endsWith(suffix));return {...d,H,context,requests,toasts,find,settle,streams,posts};
}
async function open(v:ReturnType<typeof ui>){await v.settle();await v.find('[data-pv="antigravity"]').emit('click');}
async function refreshPrograms(v:ReturnType<typeof ui>){await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'check'})});await v.settle()}

test('309: explicit probe support enables Antigravity without MCP and shows its note before permission',async()=>{
 const v=ui(undefined,catalog(provider({capabilities:{headless:true,resume:true,mcp:false,limits:false,probe:{ok:true,note:'без инструментов Harnessy <img src=x>'}}})));await open(v);
 assert.equal(v.find('[data-program-probe]').disabled,false);assert.match(v.find('[data-program-probe-note]').textContent,/без инструментов Harnessy/);await v.find('[data-program-probe]').emit('click');
 assert.equal(v.posts('/probe').length,1);assert.match(v.find('dialog').textContent,/без инструментов Harnessy <img src=x>/);assert.equal(v.document.querySelector('dialog img'),null);assert.equal(v.posts('/api/approve').length,0);
});

for(const probe of [undefined,{ok:false,reason:'пробный ход не поддерживается'}, {ok:'true'}])test('309: absent or denied probe capability refuses without deriving permission from MCP: '+JSON.stringify(probe),async()=>{
 const v=ui(undefined,catalog(provider({capabilities:{headless:true,resume:true,mcp:true,limits:false,...(probe?{probe}:{})}})));await open(v);assert.equal(v.find('[data-program-probe]').disabled,true);assert.match(v.find('.cbody').textContent,probe?.ok===false?/пробный ход не поддерживается/:/доступность пробного хода/);
 await v.find('[data-program-probe]').emit('click');assert.equal(v.posts('/probe').length,0);
});

test('309: a probe capability change revokes an open permission even after it changes back',async()=>{
 let probe={ok:true,reason:''};const v=ui(async path=>path==='/api/providers/catalog'?catalog(provider({capabilities:{headless:true,resume:true,mcp:false,limits:false,probe}})):undefined);await open(v);await v.find('[data-program-probe]').emit('click');const confirm=v.find('[data-program-confirm]');
 probe={ok:false,reason:'пробный ход отключён'};await refreshPrograms(v);assert.equal(v.document.querySelector('dialog'),null);assert.deepEqual(v.posts('/api/approve').map(r=>r.body.decision),['deny']);probe={ok:true,reason:''};await refreshPrograms(v);await confirm.emit('click');assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);
});

test('263/268: the catalog preserves the three sketch views and opens descriptor cards with real models, occupants, version and limits; reads never call a model',async()=>{
 const v=ui(undefined,catalog(provider({capabilities:{headless:true,resume:true,mcp:true,limits:true,probe:{ok:true}},limits:{ref:'/api/limits#antigravity'}}),provider({id:'copilot',title:'GitHub Copilot',binary:'copilot',installed:false,version:null,models:[],login:login('none')})));await v.settle();
 for(const selector of ['#v-list .sum','#v-list .list','#v-roles .rl','#v-roles .note','#v-keys .wrap'])assert.ok(v.find(selector));assert.match(v.find('#v-list .list').textContent,/Antigravity|GitHub Copilot/);await v.find('#addbtn').emit('click');assert.match(v.find('.cbody').textContent,/Программы подписок/);assert.match(v.find('.cbody').textContent,/Программа не установлена/);await v.find('[data-program-open="antigravity"]').emit('click');assert.match(v.find('.cbody').textContent,/1\.2\.17/);assert.match(v.find('.conn-models').textContent,/Воркер 1/);assert.match(v.find('.cbody').textContent,/42 %/);assert.equal(v.find('[data-program-probe]').disabled,false);assert.equal(v.posts().length,0);
});

test('263: explicit check uses the provider id without a model, distinguishes unknown/error login, and never starts a probe',async()=>{
 const v=ui(async path=>path.endsWith('/check')?{ok:true,login:{...login('error'),reason:'fixture offline'}}:undefined);await open(v);await v.find('[data-program-check]').emit('click');assert.deepEqual(v.posts().map(r=>r.path),['/api/providers/antigravity/check']);assert.deepEqual(JSON.parse(JSON.stringify(v.posts()[0].body)),{});assert.match(v.find('.cbody').textContent,/Не удалось проверить вход/);assert.match(v.find('.cbody').textContent,/fixture offline/);assert.equal(v.find('[data-program-probe]').disabled,true);
});

test('285: Gemini unknown login and an empty model list show their source reasons in the catalog and open card, without a probe',async()=>{
 const reason='сохранён аккаунт, вход не проверен',modelsReason='CLI не даёт безопасного чтения моделей без создания сессии',p=provider({id:'gemini',title:'Gemini',binary:'gemini',login:{...login('unknown'),command:'gemini',reason},models:[],modelsReason,capabilities:{headless:false,resume:false,mcp:false,limits:false}}),v=ui(undefined,catalog(p));await v.settle();
 assert.match(v.find('#v-list .list').textContent,/Неизвестно · сохранён аккаунт, вход не проверен/);await v.find('#addbtn').emit('click');assert.match(v.find('.cbody').textContent,/Неизвестно · сохранён аккаунт, вход не проверен/);await v.find('[data-program-open="gemini"]').emit('click');
 assert.match(v.find('.cbody').textContent,/Неизвестно · сохранён аккаунт, вход не проверен/);assert.ok(v.find('.cbody').textContent.includes('Модели: нет данных · '+modelsReason));assert.equal(v.find('[data-program-model]').querySelectorAll('option').length,0);assert.equal(v.find('[data-program-model]').disabled,true);assert.equal(v.find('[data-program-probe]').disabled,true);assert.equal(v.find('[data-program-probe]').textContent,'Недоступно');assert.equal(v.posts().length,0);
});

test('285: source reasons are text, and malformed modelsReason cannot replace an accepted catalog',async()=>{
 let data=catalog(provider({login:{...login('unknown'),reason:'<img src=x onerror=alert(1)>'},models:[],modelsReason:'<svg onload=alert(2)>'}));const v=ui(async path=>path==='/api/providers/catalog'?data:undefined);await open(v);
 assert.ok(v.find('.cbody').textContent.includes('Неизвестно · <img src=x onerror=alert(1)>'));assert.ok(v.find('.cbody').textContent.includes('Модели: нет данных · <svg onload=alert(2)>'));assert.equal(v.find('[data-connections-components]').querySelector('img'),null);assert.equal(v.find('[data-connections-components]').querySelector('svg'),null);
 data=catalog(provider({models:[],modelsReason:{forged:true}}));await refreshPrograms(v);assert.ok(v.toasts.some(text=>text.includes('каталог'))||v.find('.main').textContent.includes('Каталог не прочитан'));assert.ok(v.find('.cbody').textContent.includes('Модели: нет данных · <svg onload=alert(2)>'));assert.equal(v.posts().length,0);
});

test('263/269: Terminal receives only a descriptor id; returning to the window checks login exactly once, without a model call',async()=>{
 const v=ui(async path=>path.endsWith('/login-terminal')?{ok:true,command:'agy'}:path.endsWith('/check')?{ok:true,login:login()}:undefined);await open(v);const button=v.find('[data-program-terminal]');await button.emit('click');assert.deepEqual(v.posts().map(r=>r.path),['/api/providers/antigravity/login-terminal']);assert.deepEqual(JSON.parse(JSON.stringify(v.posts()[0].body)),{});
 await v.window.emit('blur');await v.window.emit('focus');await v.settle();await v.window.emit('focus');await v.settle();assert.deepEqual(v.posts().map(r=>r.path),['/api/providers/antigravity/login-terminal','/api/providers/antigravity/check']);assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);
});

for(const code of ['platform_unsupported','provider_unknown','not_installed','owner_only'])test('269: typed Terminal refusal '+code+' does not claim a login or start a check',async()=>{
 const v=ui(async path=>path.endsWith('/login-terminal')?{ok:false,code}:undefined);await open(v);await v.find('[data-program-terminal]').emit('click');assert.ok(v.find('.cbody [role="alert"]').textContent);await v.window.emit('blur');await v.window.emit('focus');await v.settle();assert.equal(v.posts().length,1);
});

test('263/271: probe only requests an owner card; cancel/Escape decline it, confirmation approves the exact selected model once',async()=>{
 const gate=deferred<any>(),entered=deferred();const v=ui(async(path,body)=>{if(path==='/api/approve'&&body.decision==='allow'){entered.resolve();return gate.promise}});await open(v);
 await v.find('[data-program-probe]').emit('click');assert.match(v.find('dialog').textContent,/расходуется подписка/);assert.equal(v.posts('/probe').length,1);assert.equal(v.posts('/api/approve').length,0);await v.find('[data-program-cancel]').emit('click');await v.settle();assert.equal(v.posts('/api/approve')[0].body.decision,'deny');assert.equal(v.document.querySelector('dialog'),null);
 await v.find('[data-program-probe]').emit('click');await v.window.emit('keydown',{key:'Escape'});await v.settle();assert.equal(v.posts('/api/approve')[1].body.decision,'deny');assert.ok(v.find('.ovl.on'));const select=v.find('[data-program-model]');select.value='model-b';await select.emit('change');await v.find('[data-program-probe]').emit('click');assert.match(v.find('dialog').textContent,/Model B/);const button=v.find('[data-program-confirm]'),running=button.emit('click');await entered.promise;await button.emit('click');assert.equal(v.find('[data-program-probe]').disabled,true);await v.find('[data-program-probe]').emit('click');assert.equal(v.posts('/probe').length,3);assert.deepEqual(JSON.parse(JSON.stringify(v.posts('/probe').at(-1).body)),{model:'model-b'});assert.deepEqual(JSON.parse(JSON.stringify(v.posts('/api/approve').at(-1).body)),{pane:'owner',id:'probe-antigravity',decision:'allow',project:'/a'});
 gate.resolve({ok:true});await running;await v.settle();assert.equal(v.find('[data-program-probe]').disabled,true);await v.streams[0].onmessage({data:JSON.stringify({type:'providers',provider:'antigravity',event:'probe',approvalId:'probe-antigravity',model:'model-b',status:'done',turn:{model:'model-b',usage:{input:4,output:8},durationMs:25,text:'fixture answer'},at:100})});await v.settle();assert.match(v.find('.cbody').textContent,/fixture answer/);assert.equal(v.find('[data-program-probe]').disabled,false);
});

for(const change of ['project','aba','pagehide','provider','model','account'])test('263/ОКНА: stale owner confirmation cannot run a different '+change,async()=>{
 let source=catalog(provider(),provider({id:'copilot',title:'Copilot'}));const v=ui(async path=>path==='/api/providers/catalog'?structuredClone(source):undefined);await open(v);await v.find('[data-program-probe]').emit('click');const button=v.find('[data-program-confirm]');
 if(change==='project'||change==='aba'){v.H.project='/b';v.H.confirmedProjectGeneration++;await v.window.emit('live:status');if(change==='aba'){v.H.project='/a';v.H.confirmedProjectGeneration++;await v.window.emit('live:status')}await v.settle()}
 else if(change==='pagehide')await v.window.emit('pagehide');else if(change==='provider')await v.find('[data-pv="copilot"]').emit('click');else if(change==='model'){const select=v.find('[data-program-model]');select.value='model-b';await select.emit('change')}else {source=catalog(provider({login:{...login(),account:'z•••@example.test',checkedAt:200}}));await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});await v.settle()}
 await button.emit('click');await v.settle();assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);
});

for(const patch of [{models:null},{models:[{id:'x'}]},{login:null},{login:{state:'ok'}},{capabilities:null},{installed:'false'},{installed:undefined},{checking:'true'},{checking:undefined},{id:'x\" onclick=\"bad'},{limits:{ref:'https://example.test/private'}}])test('268/ОТСУТСТВИЕ: incomplete or forged catalog fails closed '+JSON.stringify(patch),async()=>{
 const v=ui(undefined,catalog(provider(patch)));await v.settle();await v.find('#addbtn').emit('click');assert.match(v.find('.cbody').textContent,/Каталог не прочитан/);assert.equal(v.document.querySelector('[data-program-probe]'),null);assert.equal(v.posts().length,0);
});

test('268/МАСКАРАД: descriptor, price and result strings remain text; command is display only and accounts are masked',async()=>{
 const p=provider({title:'<img src=x onerror=bad>',login:{...login(),command:'agy; touch /tmp/never-run',account:'unmasked@example.test'},models:[{id:'x" onclick="bad',label:'<script>bad</script>'}]});const v=ui(undefined,catalog(p));await open(v);assert.equal(v.document.querySelector('.cbody img'),null);assert.equal(v.document.querySelector('.cbody script'),null);assert.doesNotMatch(v.find('.cbody').textContent,/unmasked@example/);await v.find('[data-program-probe]').emit('click');await v.find('[data-program-confirm]').emit('click');await v.settle();await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:p.id,approvalId:'probe-antigravity',model:p.models[0].id,status:'done',turn:{model:p.models[0].id,usage:{},durationMs:1,text:'<img src=x onerror=bad>'},at:100})});assert.equal(v.document.querySelector('.cbody img'),null);assert.equal(v.posts('/probe').length,1);assert.equal(v.posts('/probe')[0].body.model,p.models[0].id);assert.equal(v.posts('/api/approve').length,1);
});

test('268/ОКНА: slow old catalog cannot overwrite a check; SSE refresh waits for it and repeated checks coalesce',async()=>{
 const gate=deferred<any>(),entered=deferred();let checking=false,source=catalog(provider({login:login('none')}));const v=ui(async path=>{if(path==='/api/providers/catalog')return structuredClone(source);if(path.endsWith('/check')){checking=true;entered.resolve();return gate.promise}});await open(v);const button=v.find('[data-program-check]'),running=button.emit('click');await entered.promise;assert.equal(checking,true);await button.emit('click');const reads=v.requests.filter(r=>r.path==='/api/providers/catalog').length;await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});assert.equal(v.requests.filter(r=>r.path==='/api/providers/catalog').length,reads);source=catalog(provider());gate.resolve({ok:true,login:login()});await running;await v.settle();assert.equal(v.posts().length,1);assert.match(v.find('.cbody').textContent,/Вход проверен/);assert.equal(v.find('[data-program-probe]').disabled,false);
});

test('268: one shared SSE subscription refreshes descriptors and is closed on pagehide, restored once on pageshow',async()=>{
 let rows=catalog(provider());const v=ui(async path=>path==='/api/providers/catalog'?rows:undefined);await open(v);assert.equal(v.streams.length,1);rows=catalog(provider({version:'2.0',login:login('none')}));await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});await v.settle();assert.match(v.find('.cbody').textContent,/2\.0/);assert.equal(v.find('[data-program-probe]').disabled,true);await v.window.emit('live:status');assert.equal(v.streams.length,1);
 await v.window.emit('pagehide');assert.equal(v.streams[0].closed,true);const before=v.requests.length;await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});await v.settle();assert.equal(v.requests.length,before);await v.window.emit('pageshow',{persisted:true});await v.settle();assert.equal(v.streams.length,2);assert.equal(v.posts().length,0);
});

for(const p of [provider({installed:false}),provider({login:login('none')}),provider({login:login('unknown')}),provider({login:login('error')}),provider({models:[]}),provider({capabilities:{headless:false,resume:false,mcp:false,limits:false}})])test('263: a missing program, login, model or probe capability keeps the probe disabled '+JSON.stringify([p.installed,p.login.state,p.models.length,p.capabilities.headless]),async()=>{
 const v=ui(undefined,catalog(p));await open(v);assert.equal(v.find('[data-program-probe]').disabled,true);await v.find('[data-program-probe]').emit('click');assert.equal(v.document.querySelector('dialog'),null);assert.equal(v.posts().length,0);
});

for(const change of ['project','aba','pagehide'])test('263: late check or Terminal reply cannot update or initiate work in a replacement '+change,async()=>{
 const gate=deferred<any>(),seen=deferred();const v=ui(async path=>{if(path.endsWith('/login-terminal')){seen.resolve();return gate.promise}});await open(v);const running=v.find('[data-program-terminal]').emit('click');await seen.promise;await v.window.emit('blur');
 if(change==='pagehide')await v.window.emit('pagehide');else{v.H.project='/b';v.H.confirmedProjectGeneration++;await v.window.emit('live:status');if(change==='aba'){v.H.project='/a';v.H.confirmedProjectGeneration++;await v.window.emit('live:status')}}gate.resolve({ok:true,command:'OLD COMMAND'});await running;await v.settle();await v.window.emit('focus');await v.settle();assert.equal(v.posts('/check').length,0);assert.doesNotMatch(v.document.textContent,/OLD COMMAND/);
});

test('268: failed catalog refresh preserves its last snapshot but disables auth/probe until a successful retry',async()=>{
 let fail=false;const v=ui(async path=>path==='/api/providers/catalog'?fail?{ok:false,error:'fixture offline'}:catalog(provider()):undefined);await open(v);fail=true;await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});await v.settle();assert.match(v.find('#v-list .foot-note').textContent,/fixture offline/);assert.equal(v.find('[data-program-check]').disabled,true);assert.equal(v.find('[data-program-probe]').disabled,true);await v.find('[data-program-check]').emit('click');assert.equal(v.posts().length,0);
 fail=false;await v.find('#addbtn').emit('click');await v.find('[data-program-refresh]').emit('click');await v.settle();await v.find('[data-program-open="antigravity"]').emit('click');assert.equal(v.find('[data-program-check]').disabled,false);
});

for(const override of [{provider:'copilot'},{model:'other'},{approvalId:null},{price:null},{price:{kind:'estimate',label:'cheap',amount:-1}},{status:'running'}])test('271/273: mismatched or missing probe binding cannot display approval '+JSON.stringify(override),async()=>{
 const v=ui(async(path,body)=>path.endsWith('/probe')?{ok:true,provider:'antigravity',model:body.model,approvalId:'expected',status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'},...override}:undefined);await open(v);await v.find('[data-program-probe]').emit('click');assert.equal(v.document.querySelector('dialog'),null);assert.match(v.find('.cbody [role="alert"]').textContent,/привязка/);assert.equal(v.posts('/api/approve').length,0);
});

test('273: a pending different model is a conflict without a confirm button',async()=>{
 const v=ui(async path=>path.endsWith('/probe')?{ok:false,code:'probe_conflict',pending:{approvalId:'other',model:'another-model'}}:undefined);await open(v);await v.find('[data-program-probe]').emit('click');assert.match(v.find('.cbody [role="alert"]').textContent,/Уже ожидается подтверждение another-model/);assert.equal(v.document.querySelector('[data-program-confirm]'),null);assert.equal(v.posts('/api/approve').length,0);
});

test('272: only matching provider, approval and model can complete a probe; old awaiting/running cannot replace its result',async()=>{
 const v=ui();await open(v);await v.find('[data-program-probe]').emit('click');await v.find('[data-program-confirm]').emit('click');const event={type:'providers',event:'probe',provider:'antigravity',approvalId:'probe-antigravity',model:'model-a',status:'done',turn:{model:'model-a',usage:{},durationMs:5,text:'expected result'},at:100};
 for(const override of [{provider:'copilot'},{approvalId:'other'},{model:'model-b'},{turn:{...event.turn,model:'model-b'}},{turn:null}]){await v.streams[0].onmessage({data:JSON.stringify({...event,...override})});assert.doesNotMatch(v.find('.cbody').textContent,/expected result/)}
 await v.streams[0].onmessage({data:JSON.stringify(event)});assert.match(v.find('.cbody').textContent,/expected result/);await v.streams[0].onmessage({data:JSON.stringify({...event,status:'awaiting_approval'})});await v.streams[0].onmessage({data:JSON.stringify({...event,status:'running'})});assert.match(v.find('.cbody').textContent,/expected result/);assert.equal(v.document.querySelector('dialog'),null);
});

test('272: result received before the probe HTTP reply is retained and cannot open an already resolved approval',async()=>{
 const seen=deferred(),gate=deferred<any>();const v=ui(async path=>{if(path.endsWith('/probe')){seen.resolve();return gate.promise}});await open(v);const request=v.find('[data-program-probe]').emit('click');await seen.promise;await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:'antigravity',approvalId:'early',model:'model-a',status:'done',turn:{model:'model-a',usage:{},durationMs:5,text:'early result'},at:100})});gate.resolve({ok:true,provider:'antigravity',model:'model-a',approvalId:'early',status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'}});await request;await v.settle();assert.match(v.find('.cbody').textContent,/early result/);assert.equal(v.document.querySelector('dialog'),null);assert.equal(v.posts('/api/approve').length,0);
});

test('263: HTTP limits arrival updates the open card without resetting the selected model; another project cannot update it',async()=>{
 const v=ui(undefined,catalog(provider({capabilities:{headless:true,resume:true,mcp:true,limits:true,probe:{ok:true}}})));await open(v);const select=v.find('[data-program-model]');select.value='model-b';await select.emit('change');v.context.LIVE.providerLimitHTML=()=>'<p>Неделя · 91 %</p>';v.context.LIVE.onProviderLimits('/other');assert.doesNotMatch(v.find('[data-program-limits]').textContent,/91 %/);v.context.LIVE.onProviderLimits('/a');assert.match(v.find('[data-program-limits]').textContent,/91 %/);assert.equal(v.find('[data-program-model]'),select);assert.equal(select.value,'model-b');assert.equal(v.posts().length,0);
});


test('268/ОТСУТСТВИЕ: a real catalog HTTP 404 shows disabled design-code examples, then retry adopts a connected source',async t=>{
 const h=await fixture(t);let connected=false,status=0;
 const v=ui(undefined,undefined,async(path,init)=>{if(path==='/api/providers/catalog'&&connected)return Response.json(catalog(provider()));const r=await fetch(h.api.url+(path==='/api/providers/catalog'?'/api/catalog-not-connected':path),init);if(path==='/api/providers/catalog')status=r.status;return r});
 v.H.project=h.dir;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();await v.find('#addbtn').emit('click');await v.settle();assert.equal(status,404);
 assert.match(v.find('.cbody').textContent,/макет.*маршрут каталога ещё не подключён/);assert.equal(v.document.querySelectorAll('.cbody [data-program-mock]').length,3);assert.match(v.find('.cbody').textContent,/Antigravity/);assert.match(v.find('.cbody').textContent,/GitHub Copilot/);
 for(const button of v.document.querySelectorAll('.cbody .conn-program button')){assert.equal(button.disabled,true);await button.emit('click')}
 assert.equal(v.posts().length,0);assert.equal(h.provider.calls.length,0);connected=true;await v.find('[data-program-refresh]').emit('click');await v.settle();assert.equal(v.document.querySelector('[data-program-mock]'),null);assert.equal(v.find('[data-program-open="antigravity"]').disabled,false);
});

for(const status of [404,500])test('268/ОТСУТСТВИЕ: HTTP '+status+' after a successful snapshot preserves real cards without relabelling them as a mock',async()=>{
 let failed=false;const v=ui(undefined,undefined,async(path)=>path==='/api/providers/catalog'?(failed?new Response('fixture unavailable',{status}):Response.json(catalog(provider()))):Response.json(path==='/api/connections'?{ok:true,project:'/a',providers:[],routes:['direct','proxy','iface']}:{ok:false}));
 await v.settle();await v.find('#addbtn').emit('click');failed=true;await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});await v.settle();assert.match(v.find('.cbody').textContent,/показан предыдущий снимок/);assert.match(v.find('.cbody').textContent,/Antigravity/);assert.equal(v.document.querySelector('[data-program-mock]'),null);assert.equal(v.find('[data-program-open="antigravity"]').disabled,true);assert.equal(v.posts().length,0);
});

for(const event of ['status','catalog','reconnect','check'])test('263/СОСЕДИ: '+event+' updates an open program card without discarding the payment date or focus',async()=>{
 const route={route:'direct',proxy:'',iface:'',label:'',expect:'',lastCheck:null},connections={ok:true,project:'/a',routes:['direct','proxy','iface'],providers:[{id:'claude',name:'Claude',kind:'подписка',auth:{loggedIn:true},models:2,seats:[],routable:true,route}]},billing={ok:true,project:'/a',config:{subscriptionDates:[{vendor:'claude',account:'a@example.test',date:'2027-02-15'}]},subscriptions:[{vendor:'claude',account:'a@example.test',detectedPlan:'Max'}]};
 let version='1.0';const v=ui(async path=>path==='/api/connections'?connections:path==='/api/billing'?billing:path==='/api/providers/catalog'?catalog(provider({id:'claude',title:'Claude',version})):path.endsWith('/check')?{ok:true,login:login()}:undefined);
 await v.settle();await v.find('[data-pv="claude"]').emit('click');const input=v.find('[data-subscription-date]');input.value='2027-12-25';await input.emit('input');input.focus();version='2.0';
 if(event==='status')await v.window.emit('live:status');else if(event==='catalog')await v.streams[0].onmessage({data:JSON.stringify({type:'providers'})});else if(event==='reconnect')await v.streams[0].onopen();else await v.find('[data-program-check]').emit('click');await v.settle();
 assert.equal(v.find('[data-subscription-date]').value,'2027-12-25');assert.equal(v.document.activeElement,v.find('[data-subscription-date]'));assert.equal(v.posts('/api/billing').length,0);if(event==='catalog'||event==='reconnect')assert.match(v.find('.conn-facts').textContent,/2\.0/);
});


async function connectedPrograms(t:TestContext,intercept?:(path:string,init:RequestInit|undefined,send:()=>Promise<Response>)=>Promise<Response>){
 const turns:string[]=[],opened:string[]=[],events:any[]=[],receipts:{path:string;body:any}[]=[];const capabilities={headless:true,resume:true,mcp:true,limits:false,probe:{ok:true}};const entry:CatalogEntry={id:'fixture',title:'Fixture CLI',binary:'/fixture/cli',login:{args:['login']},forbiddenEnv:['SECRET_KEY'],capabilities,async version(){return '1.2.3'},async auth(){return {loggedIn:true,email:'alice@example.test'}},async models(){return [{id:'model-a',label:'Model A'}]},async runTurn(seat,_message,ctx){turns.push(seat.model);ctx.modelStarted?.();ctx.publish({type:'done',sessionId:'fixture',model:seat.model,durationMs:2,usage:{input:3,output:1,cacheRead:null}});return {text:'готов · дублёр',sessionId:'fixture'}}};
 const source=new ProviderCatalog([entry]),terminal=new LoginTerminal({platform:'darwin',open:async file=>{opened.push(readFileSync(file,'utf8'))}}),h=await fixture(t,{deps:{providerCatalog:source,loginTerminal:terminal}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());
 const v=ui(undefined,undefined,async(path,init)=>{const send=()=>fetch(h.api.url+path,init),r=await (intercept?intercept(path,init,send):send());if(r.headers.get('content-type')?.includes('json'))receipts.push({path,body:await r.clone().json()});return r},h.dir);let offset=0;const done=deferred<any>(),declined=deferred();
 const pump=()=>{let end;while((end=stream.raw.indexOf('\n\n',offset))>=0){const block=stream.raw.slice(offset,end);offset=end+2;if(!block.startsWith('data: '))continue;const data=block.slice(6),event=JSON.parse(data);if(event.type!=='providers')continue;events.push(event);for(const listener of v.streams)if(!listener.closed)listener.onmessage?.({data});if(event.event==='probe'&&['done','declined','error'].includes(event.status))done.resolve(event);if(event.event==='probe'&&event.status==='declined')declined.resolve()}};
 stream.response.on('data',pump);pump();await v.settle();return {...h,v,source,turns,opened,events,receipts,done,declined};
}

test('268/269/271/277: actual catalog/check/login/probe routes reach conn.js with millisecond dates and one owner-approved fake turn',{timeout:10000},async t=>{
 const h=await connectedPrograms(t),v=h.v;await v.find('#addbtn').emit('click');await v.find('[data-program-open="fixture"]').emit('click');const row=h.receipts.filter(r=>r.path==='/api/providers/catalog').at(-1)!.body.providers[0];assert.ok(row.login.checkedAt>1e12);assert.match(v.find('.conn-facts').textContent,new RegExp(new Date(row.login.checkedAt).toLocaleString('ru-RU').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(h.turns.length,0);
 await v.find('[data-program-check]').emit('click');await v.settle();const checked=h.receipts.filter(r=>r.path.endsWith('/check')).at(-1)!.body.login.checkedAt;assert.ok(checked>1e12);assert.ok(v.find('.conn-facts').textContent.includes(new Date(checked).toLocaleString('ru-RU')));assert.equal(h.turns.length,0);
 await v.find('[data-program-terminal]').emit('click');await v.settle();assert.equal(h.opened.length,1);assert.match(h.opened[0]!,/fixture\/cli/);assert.equal(h.turns.length,0);await v.window.emit('blur');await v.window.emit('focus');await v.settle();assert.equal(v.posts('/check').length,2);
 await v.find('[data-program-probe]').emit('click');await v.settle();assert.match(v.find('dialog').textContent,/расходуется подписка/);assert.equal(h.turns.length,0);assert.equal(h.runtime.owner.approvals.size,1);await v.find('[data-program-confirm]').emit('click');await v.settle();assert.equal(v.posts('/api/approve').at(-1)?.body.decision,'allow',JSON.stringify(v.toasts));const outcome=await h.done.promise;assert.equal(outcome.status,'done',JSON.stringify(outcome));await v.settle();assert.deepEqual(h.turns,['model-a']);assert.match(v.find('.cbody').textContent,/готов · дублёр/);assert.equal(v.posts('/api/approve').length,1);assert.ok(h.events.length>0);for(const event of h.events){assert.equal(event.at,h.clock.now());assert.ok(event.at>1e12)}
});

test('271: actual HTTP owner cancellation from conn.js never invokes the fake model',{timeout:10000},async t=>{
 const h=await connectedPrograms(t),v=h.v;await v.find('[data-pv="fixture"]').emit('click');await v.find('[data-program-probe]').emit('click');await v.find('[data-program-cancel]').emit('click');await h.declined.promise;await v.settle();assert.equal(h.turns.length,0);assert.equal(h.runtime.owner.approvals.size,0);assert.match(v.find('.cbody').textContent,/отменён/);
});

test('276: actual capability_unsupported response disables repeated probes and displays the backend reason',{timeout:10000},async t=>{
 const h=await connectedPrograms(t),v=h.v;await v.find('[data-pv="fixture"]').emit('click');h.source.get('fixture').capabilities.headless=false;await v.find('[data-program-probe]').emit('click');await v.settle();assert.equal(h.receipts.filter(r=>r.path.endsWith('/probe')).at(-1)!.body.code,'capability_unsupported');assert.match(v.find('.cbody').textContent,/У программы нет безголового режима/);assert.match(v.find('[data-program-probe]').textContent,/Недоступно/);assert.equal(v.find('[data-program-probe]').disabled,true);await v.find('[data-program-probe]').emit('click');assert.equal(v.posts('/probe').length,1);assert.equal(v.document.querySelector('dialog'),null);assert.equal(h.turns.length,0);assert.equal(h.runtime.owner.approvals.size,0);
});

for(const source of ['catalog','http','sse'])test('276: '+source+' capability refusal keeps login actions available and never retries the unavailable probe',async()=>{
 const reason='нет изолированного MCP-конфига и политики read/edit/all на ход',v=ui(async path=>source==='http'&&path.endsWith('/probe')?{ok:false,code:'capability_unsupported',reason}:path.endsWith('/check')?{ok:true,login:login()}:undefined,catalog(provider({capabilities:{headless:true,resume:true,mcp:source!=='catalog',limits:false,probe:source==='catalog'?{ok:false,reason}:{ok:true}}})));await open(v);
 if(source==='http')await v.find('[data-program-probe]').emit('click');if(source==='sse'){await v.find('[data-program-probe]').emit('click');await v.find('[data-program-confirm]').emit('click');await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:'antigravity',approvalId:'probe-antigravity',model:'model-a',status:'error',error:{code:'capability_unsupported',reason},at:Date.now()})})}
 await v.settle();assert.equal(v.find('[data-program-probe]').disabled,true);assert.match(v.find('.cbody').textContent,/изолированного MCP-конфига/);assert.equal(v.find('[data-program-terminal]').disabled,false);assert.equal(v.find('[data-program-check]').disabled,false);const before=v.posts('/probe').length;await v.find('[data-program-probe]').emit('click');assert.equal(v.posts('/probe').length,before);await v.find('[data-program-check]').emit('click');await v.settle();assert.equal(v.find('[data-program-probe]').disabled,true);
});


for(const source of ['catalog','check'])test('277/ОКНА: '+source+' refreshing only checkedAt preserves the same approval and confirm button',async()=>{
 let checkedAt=1791800000000;const v=ui(async path=>path==='/api/providers/catalog'?catalog(provider({login:{...login(),checkedAt}})):path.endsWith('/check')?{ok:true,login:{...login(),checkedAt}}:undefined);await open(v);await v.find('[data-program-probe]').emit('click');const dialog=v.find('dialog'),confirm=v.find('[data-program-confirm]');checkedAt+=1000;if(source==='catalog')await refreshPrograms(v);else await v.find('[data-program-check]').emit('click');await v.settle();assert.equal(v.find('dialog'),dialog);assert.equal(v.find('[data-program-confirm]'),confirm);await confirm.emit('click');await v.settle();assert.deepEqual(v.posts('/api/approve').map(r=>r.body.decision),['allow']);assert.equal(v.posts('/api/approve')[0].body.id,'probe-antigravity');
});

for(const change of ['account','models','provider','mcp','version','missing-account'])test('271/ОКНА: accepted '+change+' changes immediately revoke the approval, including A-B-A and retained buttons',async()=>{
 const original=catalog(provider());let rows=original,probe=0;
 const v=ui(async(path,body)=>path==='/api/providers/catalog'?structuredClone(rows):path.endsWith('/probe')?{ok:true,provider:'antigravity',model:body.model,approvalId:'approval-'+ ++probe,status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'}}:undefined);await open(v);await v.find('[data-program-probe]').emit('click');const oldConfirm=v.find('[data-program-confirm]');
 rows=change==='account'?catalog(provider({login:{...login(),account:'z•••@other.test'}})):change==='models'?catalog(provider({models:[{id:'model-b',label:'Model B'}]})):change==='provider'?catalog(provider({id:'copilot',title:'GitHub Copilot'})):change==='mcp'?catalog(provider({capabilities:{headless:true,resume:true,mcp:false,limits:false}})):change==='version'?catalog(provider({version:'2.0'})):catalog(provider({login:{state:'ok',command:'agy',checkedAt:100}}));
 await refreshPrograms(v);assert.equal(v.document.querySelector('dialog'),null,'changed binding must close without waiting for a click');assert.deepEqual(v.posts('/api/approve').map(r=>[r.body.id,r.body.decision]),[['approval-1','deny']]);
 rows=original;await refreshPrograms(v);await oldConfirm.emit('click');await v.settle();assert.equal(v.document.querySelector('dialog'),null);assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);
 await v.find('[data-program-probe]').emit('click');await v.find('[data-program-confirm]').emit('click');await v.settle();assert.deepEqual(v.posts('/api/approve').filter(r=>r.body.decision==='allow').map(r=>r.body.id),['approval-2'],'only an explicit new approval may run');
});

for(const path of ['catalog','check'])test('271/ОТСУТСТВИЕ: '+path+' revocation survives a failed denial, replay and repeated receipt of the old approval',async()=>{
 let account=login().account;const v=ui(async url=>url==='/api/providers/catalog'?catalog(provider({login:{...login(),account}})):url.endsWith('/check')?{ok:true,login:{...login(),account}}:url==='/api/approve'?{ok:false,error:'fixture offline'}:undefined);await open(v);await v.find('[data-program-probe]').emit('click');const confirm=v.find('[data-program-confirm]');
 account='z•••@other.test';if(path==='check')await v.find('[data-program-check]').emit('click');else await refreshPrograms(v);await v.settle();assert.equal(v.document.querySelector('dialog'),null);assert.equal(v.posts('/api/approve')[0].body.decision,'deny');
 account=login().account;await refreshPrograms(v);await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:'antigravity',model:'model-a',approvalId:'probe-antigravity',status:'awaiting_approval'})});await confirm.emit('click');await v.find('[data-program-probe]').emit('click');await v.settle();assert.equal(v.document.querySelector('dialog'),null);assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);assert.equal(v.posts('/api/approve').length,2,'a failed denial may be retried without reviving permission');
});

for(const change of ['account','models','mcp','check'])test('271/ОКНА: real HTTP '+change+' replacement and return remove the server approval without a model call',{timeout:10000},async t=>{
 const h=await connectedPrograms(t),v=h.v,entry=h.source.get('fixture'),auth=entry.auth,models=entry.models;await v.find('[data-pv="fixture"]').emit('click');await v.find('[data-program-probe]').emit('click');const confirm=v.find('[data-program-confirm]'),id=v.posts('/probe').length&&[...h.runtime.owner.approvals.keys()][0];assert.ok(id);
 if(change==='account'||change==='check')entry.auth=async()=>({loggedIn:true,email:'zoe@other.test'});else if(change==='models')entry.models=async()=>[{id:'model-b',label:'Model B'}];else entry.capabilities.mcp=false;
 if(change==='check'){entry.models=async()=>[{id:'model-b',label:'Model B'}];await v.find('[data-program-check]').emit('click')}else{await h.source.read('fixture');await refreshPrograms(v)}const outcome=await h.done.promise;assert.equal(outcome.status,change==='mcp'?'declined':'error');if(change!=='mcp')assert.equal(outcome.error.code,'binding_changed');await v.settle();assert.equal(v.document.querySelector('dialog'),null);assert.equal(h.runtime.owner.approvals.size,0);assert.deepEqual(v.posts('/api/approve').map(r=>[r.body.id,r.body.decision]),[[id,'deny']]);if(change==='check')assert.match(v.find('.conn-models').textContent,/Model B/,'the catalog event queued behind check and denial must be applied');
 entry.auth=auth;entry.models=models;entry.capabilities.mcp=true;await h.source.read('fixture');await refreshPrograms(v);await confirm.emit('click');await v.settle();assert.deepEqual(h.turns,[]);assert.equal(v.posts('/api/approve').filter(r=>r.body.decision==='allow').length,0);
});

test('271/ОКНА: opening the catalog closes the old approval before returning to the same provider',async()=>{
 const v=ui();await open(v);await v.find('[data-program-probe]').emit('click');const confirm=v.find('[data-program-confirm]');await v.find('#addbtn').emit('click');await v.settle();assert.equal(v.document.querySelector('dialog'),null);await v.find('[data-program-open="antigravity"]').emit('click');await confirm.emit('click');await v.settle();assert.deepEqual(v.posts('/api/approve').map(r=>r.body.decision),['deny']);
});

test('307 integration: Antigravity with probe capability opens owner approval through the real window and HTTP routes',{timeout:20000},async t=>{
 const f=antigravityFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}}),v=ui(undefined,undefined,(path,init)=>fetch(h.api.url+path,init),h.dir);await call(h.api,'/api/providers/antigravity/check',{body:{}});await refreshPrograms(v);await open(v);assert.match(v.find('.conn-facts').textContent,/1\.2\.17/);assert.equal(v.find('[data-program-probe]').disabled,false);
 await v.find('[data-program-check]').emit('click');await v.settle();assert.equal(v.find('[data-program-check]').disabled,false);assert.equal(v.find('[data-program-probe]').disabled,false);await v.find('[data-program-probe]').emit('click');await v.settle();assert.equal(v.posts('/probe').length,1);assert.equal(h.runtime.owner.approvals.size,1);assert.equal(f.capture().some(c=>c.args.includes('stream-json')),false);assert.ok(v.document.querySelector('dialog'));assert.equal(v.posts('/api/approve').length,0);
});

test('260/276 integration: an explicitly denied Antigravity descriptor reaches conn.js through actual routes and refuses a probe before any process or owner approval',{timeout:20000},async t=>{
 const f=antigravityFixture(t),entry={...f.entry,capabilities:{...f.entry.capabilities,probe:{ok:false,reason:'Нет изолированного MCP-конфига'}}},h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}}),v=ui(undefined,undefined,(path,init)=>fetch(h.api.url+path,init),h.dir);await call(h.api,'/api/providers/antigravity/check',{body:{}});await refreshPrograms(v);await open(v);assert.match(v.find('.conn-facts').textContent,/1\.2\.17/);assert.equal(v.find('[data-program-probe]').disabled,true);assert.equal(v.find('[data-program-probe]').textContent,'Недоступно');assert.match(v.find('.cbody').textContent,/Нет изолированного MCP-конфига/);
 await v.find('[data-program-check]').emit('click');await v.settle();assert.equal(v.find('[data-program-check]').disabled,false);assert.equal(v.find('[data-program-probe]').disabled,true);const before=f.capture().length;await v.find('[data-program-probe]').emit('click');assert.equal(v.posts('/probe').length,0);const r=await call(h.api,'/api/providers/antigravity/probe',{body:{model:'gemini-3.8-flash-high'}});assert.equal(r.status,409);assert.equal(r.body.code,'capability_unsupported');assert.equal(f.capture().length,before);assert.equal(h.runtime.owner.approvals.size,0);assert.equal(v.document.querySelector('dialog'),null);
});

for(const [change,order] of [...['checkedAt','account','models','account-ABA','models-ABA'].map(change=>[change,'deny-first']),['account-ABA','allow-first'],['models-ABA','allow-first']])test('271/295 ОКНА: revocation before delivery wins in '+order+' order: '+change,{timeout:12000},async t=>{
 const captured=deferred(),catalogGate=deferred(),allowSeen=deferred(),allowGate=deferred(),denySeen=deferred(),denyGate=deferred(),denyDelivered=deferred(),wire:{id:string;decision:string}[]=[];let holdCatalog=false;
 t.after(()=>{catalogGate.resolve();allowGate.resolve();denyGate.resolve()});
 const h=await connectedPrograms(t,async(path,init,send)=>{const body=init?.body?JSON.parse(String(init.body)):null;if(path==='/api/approve'&&body.decision==='allow'){allowSeen.resolve();await allowGate.promise}if(path==='/api/approve'&&body.decision==='deny'){denySeen.resolve();await denyGate.promise}if(path==='/api/approve')wire.push({id:body.id,decision:body.decision});const response=await send();if(path==='/api/approve'&&body.decision==='deny'){assert.equal((await response.clone().json()).ok,true);denyDelivered.resolve()}if(path==='/api/providers/catalog'&&holdCatalog){holdCatalog=false;const row=await response.json();captured.resolve();await catalogGate.promise;return Response.json(row)}return response}),v=h.v,entry=h.source.get('fixture'),auth=entry.auth,models=entry.models;
 await v.find('[data-pv="fixture"]').emit('click');await v.find('[data-program-probe]').emit('click');await v.settle();const confirm=v.find('[data-program-confirm]'),id=[...h.runtime.owner.approvals.keys()][0];assert.ok(id);assert.ok(Number.isSafeInteger(h.receipts.find(r=>r.path.endsWith('/probe'))!.body.bindingGen));
 if(change!.startsWith('account'))entry.auth=async()=>({loggedIn:true,email:'zoe@other.test'});if(change!.startsWith('models'))entry.models=async()=>[{id:'model-b',label:'Model B'}];holdCatalog=true;await h.source.read('fixture');await captured.promise;
 const allowing=confirm.emit('click');await allowSeen.promise;assert.deepEqual(h.turns,[]);catalogGate.resolve();
 if(change!=='checkedAt'){await denySeen.promise;if(change!.endsWith('ABA')){entry.auth=auth;entry.models=models}if(order==='deny-first'){denyGate.resolve();await denyDelivered.promise}}
 allowGate.resolve();await allowing;const outcome=await h.done.promise;if(order==='allow-first'){denyGate.resolve();await denyDelivered.promise}await v.settle();assert.equal(v.document.querySelector('dialog'),null);
 if(change==='checkedAt'){assert.deepEqual(wire,[{id,decision:'allow'}]);assert.deepEqual(h.turns,['model-a']);assert.equal(outcome.status,'done')}
 else{assert.deepEqual(wire,(order==='deny-first'?['deny','allow']:['allow','deny']).map(decision=>({id,decision})));assert.deepEqual(h.turns,[]);assert.equal(outcome.status,'error');assert.equal(outcome.error.code,'binding_changed');assert.match(v.find('.cbody').textContent,/Пробный ход отменён|Привязка программы изменилась; подтвердите новый пробный ход/);assert.doesNotMatch(v.find('.cbody').textContent,/вопрос уже закрыт|Пробный ход завершён/)}
});

for(const result of ['ok','refusal','error'])test('271/ОКНА: a late allow '+result+' and positive SSE cannot replace an in-flight denial or unlock its controls',async()=>{
 let rows=catalog(provider()),hold=false;const captured=deferred(),catalogGate=deferred(),allowSeen=deferred(),allowGate=deferred<any>(),denySeen=deferred(),denyGate=deferred<any>();
 const v=ui(async(path,body)=>{if(path==='/api/providers/catalog'){const snapshot=structuredClone(rows);if(hold){hold=false;captured.resolve();await catalogGate.promise}return snapshot}if(path==='/api/approve'){if(body.decision==='allow'){allowSeen.resolve();return allowGate.promise}denySeen.resolve();return denyGate.promise}});await open(v);await v.find('[data-program-probe]').emit('click');const confirm=v.find('[data-program-confirm]');
 rows=catalog(provider({login:{...login(),account:'z•••@other.test'}}));hold=true;await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'check'})});await captured.promise;const allowing=confirm.emit('click');await allowSeen.promise;catalogGate.resolve();await denySeen.promise;
 for(const status of ['running','done'])await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:'antigravity',model:'model-a',approvalId:'probe-antigravity',status,turn:{model:'model-a',usage:{input:1,output:1},durationMs:1,text:'LATE MODEL RESULT'}})});
 if(result==='error')allowGate.reject(Error('LATE ALLOW ERROR'));else allowGate.resolve(result==='ok'?{ok:true}:{ok:false,error:'LATE ALLOW ERROR'});await allowing;assert.equal(v.find('[data-program-probe]').disabled,true,'the older allow cleanup must not remove the pending denial');assert.doesNotMatch(v.find('.cbody').textContent,/LATE ALLOW ERROR|LATE MODEL RESULT|Пробный ход завершён/);await confirm.emit('click');assert.deepEqual(v.posts('/api/approve').map(r=>r.body.decision),['allow','deny']);
 denyGate.resolve({ok:true});await v.settle();assert.match(v.find('.cbody').textContent,/отменён/);assert.equal(v.document.querySelector('dialog'),null);
});

test('271/СОСЕДИ: an old allow response cannot overwrite a newer approval after revocation and A-B-A',async()=>{
 let rows=catalog(provider()),hold=false,probe=0;const captured=deferred(),catalogGate=deferred(),allowSeen=deferred(),allowGate=deferred<any>(),denySeen=deferred();
 const v=ui(async(path,body)=>{if(path==='/api/providers/catalog'){const snapshot=structuredClone(rows);if(hold){hold=false;captured.resolve();await catalogGate.promise}return snapshot}if(path.endsWith('/probe'))return {ok:true,provider:'antigravity',model:body.model,approvalId:'fresh-'+ ++probe,status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'}};if(path==='/api/approve'){if(body.decision==='allow'){allowSeen.resolve();return allowGate.promise}denySeen.resolve();return {ok:true}}});await open(v);await v.find('[data-program-probe]').emit('click');const old=v.find('[data-program-confirm]');rows=catalog(provider({login:{...login(),account:'z•••@other.test'}}));hold=true;await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'check'})});await captured.promise;const allowing=old.emit('click');await allowSeen.promise;catalogGate.resolve();await denySeen.promise;await v.settle(r=>r.path==='/api/approve'&&r.body.decision==='allow');
 rows=catalog(provider());await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'check'})});await v.settle(r=>r.path==='/api/approve'&&r.body.decision==='allow');await v.find('[data-program-probe]').emit('click');const fresh=v.find('dialog'),confirm=v.find('[data-program-confirm]');allowGate.resolve({ok:false,error:'OLD RECEIPT'});await allowing;await v.settle();await old.emit('click');assert.equal(v.find('dialog'),fresh);assert.equal(v.find('[data-program-confirm]'),confirm);assert.doesNotMatch(v.find('.cbody').textContent,/OLD RECEIPT/);assert.deepEqual(v.posts('/api/approve').map(r=>[r.body.id,r.body.decision]),[['fresh-1','allow'],['fresh-1','deny']]);
});

// Real HTTP responses from a deferred CLI read exercise both the catalog and open card.
test('317: cold catalog and card show checking until the program is read; confirmed absence is distinct',async t=>{
 const f=antigravityFixture(t),gate=deferred(),ready=deferred();f.entry.version=async()=>{await gate.promise;return '1.2.17'};
 const source=new ProviderCatalog([f.entry]);source.subscribe(()=>ready.resolve());t.after(()=>gate.resolve());
 const h=await fixture(t,{deps:{providerCatalog:source}}),v=ui(undefined,undefined,(path,init)=>fetch(h.api.url+path,init),h.dir);
 await v.settle();assert.match(v.find('[data-pv="antigravity"]').textContent,/Проверяется…/);
 await v.find('#addbtn').emit('click');await v.settle();assert.match(v.find('.cbody').textContent,/Проверяется…/);assert.doesNotMatch(v.find('.cbody').textContent,/Программа не установлена/);
 await v.find('[data-program-open="antigravity"]').emit('click');assert.match(v.find('.conn-facts').textContent,/проверяется…/);
 assert.equal(v.find('[data-program-terminal]').disabled,true);assert.equal(v.find('[data-program-probe]').disabled,true);assert.equal(v.find('[data-program-check]').disabled,true);
 await v.find('[data-program-probe]').emit('click');await v.find('[data-program-terminal]').emit('click');assert.equal(v.posts().length,0);
 gate.resolve();await ready.promise;await refreshPrograms(v);assert.match(v.find('.cbody').textContent,/Вход проверен/);assert.doesNotMatch(v.find('.conn-facts').textContent,/проверяется/);assert.equal(v.find('[data-program-probe]').disabled,false);
 source.get('antigravity').version=async()=>{throw new ProviderError('no_binary','missing')};await call(h.api,'/api/providers/antigravity/check',{body:{}});await refreshPrograms(v);
 assert.match(v.find('.cbody').textContent,/Программа не установлена/);assert.doesNotMatch(v.find('.conn-facts').textContent,/проверяется/);assert.equal(v.find('[data-program-terminal]').disabled,true);assert.equal(v.find('[data-program-probe]').disabled,true);
 assert.ok(f.capture().every(c=>!c.args.includes('stream-json')));
});


test('334: actual Ollama catalogue renders daemon, cloud/local labels, signin and owner-only probe with unknown cloud login',async t=>{
 const f=await ollamaFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}});await call(h.api,'/api/providers/ollama/check',{body:{}});
 const handler=async(path:string,body:any)=>(await call(h.api,path,{...(body?{body}:{})})).body,v=ui(handler,undefined,undefined,h.dir);await v.settle();await v.find('[data-pv="ollama"]').emit('click');await v.settle();
 assert.match(v.body.textContent,/Ollama.*локально/);assert.match(v.body.textContent,/Демон.*доступен · 0.40.2/);assert.doesNotMatch(v.body.textContent,/glm-5.3:cloud/);assert.match(v.body.textContent,/gemma4:latest · локально/);assert.match(v.body.textContent,/serve/);assert.match(v.body.textContent,/Неизвестно/);const button=v.find('[data-program-probe="ollama"]');assert.equal(button.disabled,false);await button.emit('click');await v.settle();assert.equal(v.find('[data-program-confirm]').disabled,false);assert.equal(f.capture().length,0);
 f.setOffline(true);await call(h.api,'/api/providers/ollama/check',{body:{}});await refreshPrograms(v);assert.match(v.body.textContent,/демон не запущен/);assert.match(v.body.textContent,/ollama serve/);assert.equal(v.find('[data-program-probe="ollama"]').disabled,true);assert.equal(f.capture().length,0);
});

for(const program of [{id:'devin',title:'Devin',fixture:devinFixture},{id:'kimi',title:'Kimi Code',fixture:kimiFixture},{id:'opencode',title:'OpenCode',fixture:opencodeFixture}])test('345: '+program.title+' actual catalogue opens a full-access permission card without starting the program',async t=>{
 const f=program.fixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}});await call(h.api,'/api/providers/'+program.id+'/check',{body:{}});
 const v=ui(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body,undefined,undefined,h.dir);await v.settle();await v.find('[data-pv="'+program.id+'"]').emit('click');await v.settle();
 assert.match(v.body.textContent,new RegExp(program.title));if(program.id!=='devin')assert.match(v.body.textContent,/Неизвестно/);if(program.id==='kimi')assert.match(v.body.textContent,/по умолчанию программы/);
 const probe=v.find('[data-program-probe="'+program.id+'"]');assert.equal(probe.disabled,false);await probe.emit('click');await v.settle();assert.equal(v.find('[data-program-confirm]').disabled,false);assert.match(v.body.textContent,/полный доступ, без инструментов Harnessy/);
 assert.equal(f.capture().filter(c=>c.args.includes('--print')||c.args.includes('--prompt')||c.args[0]==='run').length,0);
});
test('21g: local catalogue offers API connection instead of cloud daemon models', {timeout:8000},async t=>{
 const f=await ollamaFixture(t);const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}});await call(h.api,'/api/providers/ollama/check',{body:{}});
 const v=ui(async(path:string,body:any)=>(await call(h.api,path,{...(body?{body}:{})})).body,undefined,undefined,h.dir);await v.settle();await v.find('[data-pv="ollama"]').emit('click');await v.settle();
 assert.doesNotMatch(v.find('.cbody').textContent,/glm-5.3:cloud/);assert.match(v.find('.cbody').textContent,/облачные модели — через Ollama Cloud по API/);assert.ok(v.find('[data-llm-ollama-cloud]'));assert.equal(f.cloudReads,0);assert.equal(v.find('[data-program-probe="ollama"]').disabled,false);
});

test('350: provider card exposes failed probe code, safe excerpt and measured duration as text',async()=>{
 const v=ui();await open(v);await v.find('[data-program-probe]').emit('click');await v.find('[data-program-confirm]').emit('click');await v.streams[0].onmessage({data:JSON.stringify({type:'providers',event:'probe',provider:'antigravity',model:'model-a',approvalId:'probe-antigravity',status:'error',error:{code:'transport_lost',reason:'upstream <offline>',durationMs:10000}})});
 const card=v.find('[role="alert"]');assert.match(card.textContent,/upstream <offline>.*transport_lost.*10000 мс/);assert.equal(card.querySelector('offline'),null);
});
