import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {request} from 'node:http';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until,sse} from './test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8'),live=read('ui/deploy/live.js'),raw=read('ui/sketches/disarto/05-spend.html');
const part=(source:string,start:string,end:string)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b)};
const metrics=(turns=1)=>({turns,input:2,output:3,cacheRead:0,durationMs:10,averageDurationMs:10,durationSamples:1,p50DurationMs:10,p95DurationMs:10,errorRate:0,outcomes:{ok:turns,interrupted:0,error:0,unknown:0},missingMeasurements:0,cost:null,costByCurrency:[],unpricedTurns:turns,pricedTurns:0,costReason:'нет цены'});
const snapshot=(project='/projects/a',period='all')=>({ok:true,project,period,since:null,generatedAt:1791500000.125,source:'chats.json',totals:metrics(),byPane:[{pane:'worker',label:'воркер',...metrics()}],byChat:[{chat:'c1',pane:'worker',title:'Чат',...metrics()}],byModel:[{model:'w1',...metrics()}],byVendor:[{vendor:'claude',...metrics()}],byModelVendor:[{vendor:'claude',model:'w1',...metrics()}],byDay:[{day:'2026-10-08',...metrics()}],transferred:1,unknownOrigin:2,undated:0,cost:null,costReason:'нет цены'});
const item=(id='t1',chat='c1')=>({turnInstanceId:id,chat,pane:'worker',ts:1791500000,vendor:'claude',model:'w1',usage:{input:2,output:3,cacheRead:0},durationMs:10,outcome:'ok',cost:null,currency:null});
function ui(fetch?:(path:string,body?:any)=>Promise<any>,on=true){
 const d=dom(part(raw,'<body>','<script src=')),requests:string[]=[],blobs:Blob[]=[],downloaded:string[]=[],logs:any[]=[],writes:any[]=[],toasts:string[]=[];
 Object.assign(d.document,{documentElement:d.html,body:d.body});const H:any={on,project:'/projects/a',panes:[{id:'worker',model:'w1',label:'воркер'}],models:{claude:[{id:'w1'},{id:'w2'}]}},S:any={spend:{policy:1,cap:'80',revOpus:1},ui:{}};
 const sidebar=d.document.querySelector('aside')!;sidebar.className='side ps';sidebar.insertAdjacentHTML('beforeend','<div class="limits" data-go="spend"></div>');
 const response=(path:string)=>{const q=new URL('http://test'+path).searchParams,period=q.get('period')??'all';return path.startsWith('/api/spend/turns')?{ok:true,project:H.project,period,source:'chats.json',items:[item()],next:null}:path==='/api/connections'?{ok:true,providers:[{id:'claude',name:'Claude',auth:{loggedIn:true}}]}:path==='/api/limits'?{ok:false}:snapshot(H.project,period)};
 const context:any={H,S,PAGE:'spend',document:d.document,location:{href:'',search:'',hash:''},history:{replaceState(_a:any,_b:any,url:string){context.location.search=url}},hooks:[],save(){writes.push('state')},log(...v:any[]){logs.push(v)},toast:(s:string)=>toasts.push(s),now:()=>1,hhmm:()=>'',resolve(){throw Error('fake decision')},esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),base:(s:string)=>s.split('/').pop(),fmtN:(n:any)=>n==null?'—':String(n),paneName:(p:any)=>p.label,
  refreshStatus:async()=>{},proposalsFetch:async()=>{},api:async(path:string,body?:any)=>{requests.push(path);return fetch?fetch(path,body):response(path)},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{fn();return 1},requestAnimationFrame:(fn:()=>void)=>fn(),Blob,URLSearchParams,
  URL:{createObjectURL(blob:Blob){blobs.push(blob);return 'blob:test'},revokeObjectURL(){}},localStorage:{setItem(...v:any[]){writes.push(v)},getItem:()=>null}};
 const create=d.document.createElement.bind(d.document);d.document.createElement=(tag:string)=>{const n:any=create(tag);if(tag==='a')n.click=()=>downloaded.push(n.download);return n};context.window=context;
 const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(part(raw,'<script>','</script>').slice('<script>'.length),vm);
 runInContext(part(live,'  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part(live,'  function closeLAMenus(','  // запись «контекст передан»')+part(live,'  const statics=','  // ══ ПЛАН:')+part(live,'  // TS-14b: spend blocks','  // ══ ПОДКЛЮЧЕНИЯ')+'\nglobalThis.testing={fetch:spendFetch,draw:spendDraw,csv:spendCsv,state:SP,limits:limitsFetch,limitState:LIM,limitDraw:limitsDraw,limitEvent:limitsEvent,subscribe:subscribeLiveEvents,syncEvents:syncLiveEvents,history:spendHistory};restoreUI();',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 return {...d,H,S,context,requests,blobs,downloaded,logs,writes,toasts,find,response,functions:context.testing};
}

test('173/178: cancelled TS-10 hidden-block invariant; original Spend blocks and tabs stay, CSV has one owner',async t=>{
 const h=await fixture(t);await h.runtime.runTurn('worker','question');const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;
 const original=v.find('[data-c="router"]');await v.functions.fetch();await v.functions.limits();assert.equal(v.find('[data-c="router"]'),original);
 for(const selector of ['[data-c="claude"]','[data-c="codex"]','[data-c="qwen"]','[data-c="hist"]','[data-c="cal"]','#v-proj','#v-role','#v-est','#cap','#seg'])v.find(selector);
 assert.doesNotMatch(v.find('.main').textContent,/OMG|Sonnet 35 %/);assert.match(v.find('[data-c="claude"]').textContent,/62,4|62.4/);assert.match(v.find('[data-c="claude"]').textContent,/макет/);assert.match(v.find('.main').textContent,/макет/);assert.match(v.find('.main').textContent,/chats.json/);assert.equal(v.functions.state.data.totals.input,20);
 const before=v.requests.filter(p=>p==='/api/spend?period=7').length;await v.find('[data-spend-period="7"]').emit('click');assert.equal(v.requests.filter(p=>p==='/api/spend?period=7').length,before+1);assert.equal(v.context.location.search,'?period=7');
 await v.find('#seg [data-v="proj"]').emit('click');assert.equal(v.find('#v-proj').classList.contains('on'),true);await v.window.emit('keydown',{key:'4'});assert.equal(v.find('#v-est').classList.contains('on'),true);
 await v.find('[data-spend-group="byModel"]').emit('click');assert.match(v.find('#v-proj .tbl').textContent,/w1/);
 v.find('#v-proj .tbl tbody tr td').textContent='forged 999999 tokens';await v.find('.top [data-spend-csv]').emit('click');assert.equal(v.blobs.length,1);assert.deepEqual(v.downloaded,['harnessy-spend-7.csv']);const csv=await v.blobs[0]!.text();assert.match(csv,/"source";"chats.json"/);assert.match(csv,/"byChat";"c[0-9a-f]+"/);assert.doesNotMatch(csv,/forged|999999|62,4|94 %/);
 await v.find('[data-c="hist"]').emit('click');await v.find('.panel [data-spend-csv]').emit('click');assert.equal(v.blobs.length,2);await v.find('[data-spend-close]').emit('click');assert.equal(v.find('.ovl').classList.contains('on'),false);assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);
});

test('173/178: disabled mock actions and repeated cards cannot execute S.spend/S.mem; offline card closes on first load',async()=>{
 const v=ui(undefined,false);assert.match(v.find('.views').textContent,/макет/);await v.find('[data-c="claude"]').emit('click');assert.equal(v.find('.ovl').classList.contains('on'),true);
 v.H.on=true;await v.functions.fetch();await v.functions.limits();assert.equal(v.find('.ovl').classList.contains('on'),false);const before=JSON.stringify(v.S);
 for(let i=0;i<2;i++){await v.find('[data-c="claude"]').emit('click');for(const button of v.document.querySelectorAll('.panel [data-spend-unavailable]'))await button.emit('click');assert.equal(JSON.stringify(v.S),before);await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('.ovl').classList.contains('on'),false)}
 assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);assert.equal(v.document.querySelectorAll('[data-spend-demo]').length,0);
});

test('178: a failed period read keeps the previous snapshot and exports its actual period',async()=>{
 const v=ui();await v.functions.fetch();const kept=v.functions.state.data;v.context.api=async()=>({ok:false,code:'spend_unreadable',error:'chats.json не читается: damaged'});
 await v.find('[data-spend-period="30"]').emit('click');assert.equal(v.functions.state.data,kept);assert.match(v.find('.main').textContent,/показан прежний снимок за период all/);assert.match(v.functions.csv(),/"period";"all"/);
});

test('178: project A → B → A, periods and pagehide reject late spend responses',async()=>{
 const gates=[deferred<any>(),deferred<any>(),deferred<any>()];let i=0;const v=ui(async p=>p.startsWith('/api/spend/turns')?{ok:true,project:'/projects/a',period:'7',source:'chats.json',items:[],next:null}:gates[i++]!.promise);
 const a=v.functions.fetch();v.H.project='/projects/b';const b=v.functions.fetch();v.H.project='/projects/a';v.functions.state.period='7';const c=v.functions.fetch();gates[2]!.resolve(snapshot('/projects/a','7'));assert.equal(await c,true);const kept=v.functions.state.data;
 gates[0]!.resolve(snapshot());gates[1]!.resolve(snapshot('/projects/b'));assert.equal(await a,false);assert.equal(await b,false);assert.equal(v.functions.state.data,kept);
 const late=deferred<any>();v.context.api=()=>late.promise;const pending=v.functions.fetch();await v.window.emit('pagehide');late.resolve(snapshot('/projects/a','7'));assert.equal(await pending,false);assert.equal(v.functions.state.data,kept);
});
for(const bad of [{ok:true},snapshot('/other'),snapshot('/projects/a','30'),{...snapshot(),source:'invented'}])test('178: malformed or foreign aggregate cannot replace the snapshot '+JSON.stringify(Object.keys(bad)),async()=>{const v=ui(async()=>bad);assert.equal(await v.functions.fetch(),false);assert.equal(v.functions.csv(),null);assert.match(v.find('.main').textContent,/ответ аналитики не соответствует/)});

test('178: CSV uses measurements, preserves quotes/newlines, and neutralizes formula prefixes after whitespace',async()=>{
 const v=ui(),data=snapshot();data.byChat[0]!.title='  =SUM(1;2)\n"label"';v.context.api=async(p:string)=>p.includes('/turns')?v.response(p):data;await v.functions.fetch();const csv=v.functions.csv();assert.match(csv,/"'  =SUM/);assert.match(csv,/""label""/);assert.match(csv,/costByCurrency/);assert.match(csv,/"byModelVendor"/);
});

test('177/211: top three use connected subscriptions and measured API quotas; a router never becomes a subscription',async()=>{
 const v=ui();v.functions.state.period='30';const paths:string[]=[],stamp=Date.now()/1000;v.context.api=async(p:string)=>{paths.push(p);return p==='/api/connections'?{ok:true,providers:['claude','codex','router','qwen','deepseek','off'].map(id=>({id,name:id,kind:['qwen','deepseek'].includes(id)?'ключ API':'подписка',auth:{loggedIn:id!=='off'}}))}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:['codex','qwen','deepseek','router'].map(vendor=>({vendor,sourceConnected:true,fetchedAt:stamp,source:'fixture',stale:true,windows:[{label:'5 ч',percentUsed:25,resetsAt:stamp+200},{label:'неделя',percentUsed:50}]}))}:{...snapshot('/projects/a','7'),byVendor:[{vendor:'router',turns:100},{vendor:'codex',turns:10},{vendor:'qwen',turns:7},{vendor:'deepseek',turns:4},{vendor:'claude',turns:1}]}};
 await v.functions.limits();assert.ok(paths.includes('/api/spend?period=7'));const widget=v.find('.limits');assert.equal(widget.hasAttribute('data-go'),false);assert.doesNotMatch(widget.textContent,/claude|router|off|остаток API|41,20/);assert.match(widget.textContent,/codex/);assert.match(widget.textContent,/остаток 75 %/);assert.match(widget.textContent,/устаревшие/);assert.equal(widget.querySelectorAll('.sp-limit').length,3);assert.equal(widget.querySelector('a')!.getAttribute('href'),'05-spend.html?period=30');
 await v.find('[data-spend-limits]').emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('.sp-limit').length,4);assert.match(v.find('.limits-dialog').textContent,/неделя|5 ч/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/router|остаток API|41,20/);assert.equal(v.find('.limits-dialog a').getAttribute('href'),'05-spend.html?period=30');
});

test('175/178: history paginates with deduplication; late filter response cannot replace new filter; escape prevents reopening',async()=>{
 const v=ui();await v.functions.fetch();v.functions.state.next='cursor';v.functions.draw();v.context.api=async()=>({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item(),item('t2')],next:null});await v.find('[data-spend-more]').emit('click');assert.equal(v.functions.state.history.length,2);
 await v.find('[data-c="hist"]').emit('click');const gate=deferred<any>();v.context.api=()=>gate.promise;v.functions.state.next='more';const pending=v.functions.history(true);await v.window.emit('keydown',{key:'Escape'});gate.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('t3')],next:null});await pending;assert.equal(v.find('.ovl').classList.contains('on'),false);
 const old=deferred<any>();v.context.api=(p:string)=>p.includes('vendor=codex')?Promise.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[],next:null}):old.promise;const filter=v.find('[data-spend-vendor]');filter.value='claude';const first=filter.emit('change');const next=v.find('[data-spend-vendor]');next.value='codex';await next.emit('change');old.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('stale')],next:null});await first;assert.equal(v.functions.state.history.length,0);assert.equal(v.functions.state.historyLoading,false);
});

test('177: late quota reads cannot restore a previous project or a hidden page',async()=>{
 const v=ui(),old=deferred<any>(),connections={ok:true,providers:[{id:'claude',name:'Claude',auth:{loggedIn:true}}]};
 v.context.api=()=>old.promise;const first=v.functions.limits();v.H.project='/projects/b';v.context.api=async(p:string)=>p==='/api/connections'?connections:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'test',windows:[{label:'weekly',percentUsed:20}]}]}:snapshot('/projects/b','7');await v.functions.limits();
 v.H.project='/projects/a';await v.functions.limits();old.resolve({ok:true,providers:[{id:'stale',name:'stale',auth:{loggedIn:true}}]});await first;
 assert.deepEqual(Array.from(v.functions.limitState.providers,(p:any)=>p.id),['claude']);assert.match(v.find('.limits').textContent,/остаток 80 %/);
 const hidden=deferred<any>();v.context.api=()=>hidden.promise;const pending=v.functions.limits();await v.window.emit('pagehide');hidden.resolve({ok:true,providers:[{id:'hidden',auth:{loggedIn:true}}]});await pending;assert.doesNotMatch(v.find('.limits').textContent,/hidden/);
});

for(const expanded of [false,true]){
 const root=expanded?'.panel':'[data-c="router"]';
 test('173 round 2: real model menu reaches HTTP once from '+root,async t=>{
  const h=await fixture(t),v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body);v.H.project=h.dir;await v.functions.fetch();
  if(expanded)await v.find('[data-c="router"]').emit('click');const beforeCard=v.functions.state.card;
  await v.find(root+' [data-spend-model="worker"]').emit('click');await v.find(root+' .live-menu [data-k="1"] small').emit('click');
  assert.equal(v.requests.filter(p=>p==='/api/panes/worker').length,1);await until(()=>!v.functions.state.mutation);
  assert.equal(h.runtime.project.registry.get('worker')!.model,'w2');assert.match(v.toasts.at(-1)!,/Модель: w2/);assert.equal(v.functions.state.card,beforeCard);
  assert.equal(v.document.querySelector('.ovl')?.classList.contains('on')??false,expanded);assert.equal(v.document.querySelector('.live-menu'),null);
 });
 test('173 round 2: real model menu preserves binding, refusal and in-flight guard from '+root,async()=>{
  const v=ui();await v.functions.fetch();if(expanded)await v.find('[data-c="router"]').emit('click');
  const gate=deferred<any>(),writes:any[]=[];v.context.api=async(path:string,body:any)=>{writes.push({path,body});return gate.promise};
  await v.find(root+' [data-spend-model]').emit('click');await v.find(root+' .live-menu [data-k="1"]').emit('click');
  assert.equal(writes.length,1);assert.equal(writes[0].body.model,'w2');assert.equal(v.functions.state.mutation,true);
  // A second real choice while the first HTTP write is pending cannot start another write.
  if(expanded){await v.find(root+' [data-spend-model]').emit('click');await v.find(root+' .live-menu [data-k="0"]').emit('click')}
  else await v.find(root+' [data-spend-model]').emit('click');
  assert.equal(writes.length,1);gate.resolve({ok:false,error:'refused'});await until(()=>!v.functions.state.mutation);assert.match(v.toasts.at(-1)!,/refused/);
  await v.find(root+' [data-spend-model]').emit('click');v.H.project='/different';await v.find(root+' .live-menu [data-k="1"]').emit('click');assert.equal(writes.length,1);
  v.H.project='/projects/a';await v.find(root+' [data-spend-model]').emit('click');v.functions.state.generation++;await v.find(root+' .live-menu [data-k="1"]').emit('click');assert.equal(writes.length,1);
 });
}

test('198/203: disconnected widget keeps sketch percentages and meters, marked as samples; details still open',async()=>{
 const v=ui(undefined,false);v.functions.limitDraw();const widget=v.find('.limits');assert.equal(widget.querySelectorAll('.sp-limit').length,2);assert.equal(widget.querySelectorAll('[role="meter"]').length,2);assert.match(widget.textContent,/62,4|62.4/);assert.match(widget.textContent,/94 %/);assert.doesNotMatch(widget.textContent,/Qwen|41,20|остаток API|Роутер провайдеров/);assert.match(widget.textContent,/макет/);assert.doesNotMatch(widget.textContent,/нет данных|—/);
 await v.find('[data-spend-limits]').emit('click');assert.ok(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length>=4);await v.find('[data-spend-close]').emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);
});
test('203: failed quota refresh keeps the last real value dated; foreign response cannot impersonate current project',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'Claude usage',fetchedAt:Date.now()/1000,windows:[{label:'неделя',percentUsed:0,resetsAt:Date.now()/1000+60}]}]}:v.response(p);
 await v.functions.limits();assert.match(v.find('.limits').textContent,/остаток 100 %/);assert.doesNotMatch(v.find('.limits').textContent,/макет/);
 v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:'/foreign',updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'forged',windows:[{label:'неделя',percentUsed:99}]}]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/остаток 100 %/);assert.match(v.find('.limits').textContent,/устаревшие данные/);assert.doesNotMatch(v.find('.limits').textContent,/forged|99 %/);
});

test('202/203: an attached source without its monthly quota is a fact, excluded from top three and never replaced with sample money',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'kimi',name:'Kimi',kind:'подписка',auth:{loggedIn:true}},{id:'claude',name:'Claude',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'kimi',sourceConnected:true,source:'Kimi',windows:[],reason:'месячный лимит провайдер не отдаёт'}]}:snapshot(v.H.project,'7');
 await v.functions.limits();assert.doesNotMatch(v.find('.limits').textContent,/Kimi/);await v.find('[data-spend-limits]').emit('click');const cards=v.find('.limits-dialog').querySelectorAll('.sp-limit'),kimi=cards.find(c=>c.textContent.includes('Kimi'))!;assert.ok(kimi);assert.match(kimi.textContent,/месячный лимит провайдер не отдаёт/);assert.doesNotMatch(kimi.textContent,/макет|34|41,20/);assert.equal(kimi.querySelectorAll('[role="meter"]').length,0);
});

test('146: sidebar details also open outside Spend without HX, close on Escape and restore focus',async()=>{
 const v=ui();v.context.PAGE='new';delete v.context.HX;await v.functions.limits();const opener=v.find('[data-spend-limits]');await opener.emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),true);assert.ok(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length>=2);await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);assert.equal(v.document.activeElement,opener);
});

test('200/473: plan and all three Claude windows appear with a countdown, and a connection-read failure keeps the last snapshot',async()=>{
 const v=ui(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:now,providers:[{vendor:'claude',plan:'Max',fetchedAt:now,status:'ok',sourceConnected:true,source:'claude.ai /usage',windows:[{label:'5 ч',percentUsed:21,windowMinutes:300,resetsAt:now+3120},{label:'неделя',percentUsed:21,windowMinutes:10080,resetsAt:now+100000},{label:'неделя · Sonnet',percentUsed:32,windowMinutes:10080,resetsAt:now+100000}]}]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude Max/);await v.find('[data-spend-limits]').emit('click');const detail=v.find('.limits-dialog');assert.equal(detail.querySelectorAll('[role="meter"]').length,3);assert.match(detail.textContent,/сброс через 52 мин/);assert.match(detail.textContent,/Sonnet/);
 v.context.api=async()=>{throw Error('connection down')};await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude Max/);assert.match(v.find('.limits').textContent,/устаревшие данные/);
});

test('200: an older in-flight HTTP result cannot overwrite a newer quota event',async()=>{
 const v=ui(),pending=deferred<any>(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?pending.promise:v.response(p);const reading=v.functions.limits();const quota=(stamp:number,percentUsed:number)=>({ok:true,revision:percentUsed,project:v.H.project,updatedAt:stamp,providers:[{vendor:'claude',plan:'Max',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed,windowMinutes:10080,resetsAt:now+3600}]}]});v.functions.limitEvent(quota(now,30));pending.resolve(quota(now-60,10));await reading;assert.match(v.find('.limits').textContent,/остаток 70 %/);assert.doesNotMatch(v.find('.limits').textContent,/остаток 90 %/);
});

for(const delivery of ['HTTP','SSE'])test('TS-12 r2: ok → not_applicable via '+delivery+' removes the old percentage and top-three entry',async t=>{
 let applicable=true;const {FakeProvider,FakeClock}=await import('./test-helpers.ts');const clock=new FakeClock();clock.time=Date.now();const provider=Object.assign(new FakeProvider(),{limits:async():Promise<any>=>applicable?{ok:true,plan:'Max',fetchedAt:clock.now()/1000,source:'fixture',windows:[{label:'неделя',percentUsed:61,windowMinutes:10080,resetsAt:clock.now()/1000+3600}]}:{ok:false,code:'limits_not_applicable',reason:''}});
 const h=await fixture(t,{deps:{providers:{claude:provider},clock}}),v=ui(async p=>(await call(h.api,p)).body);v.H.project=h.dir;await v.functions.limits();assert.match(v.find('.limits').textContent,/61 %/);await v.find('[data-spend-limits]').emit('click');
 const stream=await sse(h.api);t.after(()=>stream.close());applicable=false;clock.advance(60000);await until(()=>stream.frames.some(e=>e.type==='limits'&&e.providers[0]?.status==='not_applicable'));if(delivery==='HTTP')await v.functions.limits();else v.functions.limitEvent(stream.frames.find(e=>e.type==='limits'&&e.providers[0]?.status==='not_applicable'));
 assert.equal(v.functions.limitState.limits[0].status,'not_applicable');assert.equal(v.functions.limitState.updatedAt,null);assert.doesNotMatch(v.find('.limits').textContent,/Claude|61 %/);const card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(c=>c.textContent.includes('Claude'))!;assert.doesNotMatch(card.textContent,/61 %|макет/);assert.match(card.textContent,/ключ API не имеет окон подписки/);
});

for(const revision of [undefined,null,-1,1.5,'20'])test('TS-12 r2: missing or forged revision '+revision+' cannot replace a valid quota',async()=>{
 const v=ui(),quota={ok:true,project:v.H.project,revision:2,updatedAt:Date.now()/1000,providers:[{vendor:'claude',sourceConnected:true,windows:[{label:'неделя',percentUsed:61}]}]};v.context.api=async(p:string)=>p==='/api/limits'?quota:v.response(p);await v.functions.limits();v.functions.limitEvent({...quota,revision,providers:[]});assert.match(v.find('.limits').textContent,/61 %/);v.context.api=async(p:string)=>p==='/api/limits'?{...quota,revision,providers:[]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/61 %/);
});

function connectedQuotaPage(page:string){
 const v=ui(),streams:any[]=[];let percent=18,revision=1;const quota=()=>({ok:true,project:v.H.project,revision,updatedAt:Date.now()/1000,providers:[{vendor:'claude',status:'ok',sourceConnected:true,windows:[{label:'неделя',percentUsed:percent,windowMinutes:10080,resetsAt:Date.now()/1000+3600}]}]});v.context.PAGE=page;v.S.ui.pane='room';v.context.location.pathname=page==='log'?'/21-journal.html':'/page.html';
 Object.assign(v.context,{NOW:{cards:new Map(),es:null},nowDraw(){},hStatus(){},hEvent(){},consumeState(){},refreshChats:async()=>{},loadChat:async()=>{},journalLive(){},applyStatus(st:any){Object.assign(v.H,{on:true,snapshotOnly:false,project:st.project,panes:st.panes})},EventSource:class{closed=false;onmessage:any;onopen:any;onerror:any;constructor(){streams.push(this)}close(){this.closed=true}}});
 v.context.api=async(p:string)=>{v.requests.push(p);return p==='/api/status'?{project:v.H.project,panes:[]}:p==='/api/limits'?quota():v.response(p)};
 runInContext(part(live,'  async function hConnect(){','  // ── чат: настоящее поле ввода')+part(live,'  function nowLive(){',"  document.addEventListener('click',async e=>{ const b=e.target.closest('[data-ap-decision]')")+'\nglobalThis.quotaConnect=hConnect;',v.context);
 return {...v,streams,quota,setPercent(n:number){percent=n;revision++}};
}

for(const page of ['new','now','chat','plan','res','doc','art','mem','swarm','sens','spend','events','log','set','conn','away','first','login'])test('TS-12 r2: '+page+' keeps exactly one shared stream and redraws 18 → 92 without another status fetch',async()=>{
 const v=connectedQuotaPage(page);await v.context.quotaConnect();await v.functions.limits();await v.context.quotaConnect();await v.window.emit('live:status');assert.equal(v.streams.length,1);for(const data of ['null','42','[]','{}','{'])assert.doesNotThrow(()=>v.streams[0].onmessage({data}));assert.match(v.find('.limits').textContent,/18 %/);const before=v.requests.filter(p=>p==='/api/status').length;v.setPercent(92);v.streams[0].onmessage({data:JSON.stringify({type:'limits',...v.quota()})});assert.match(v.find('.limits').textContent,/92 %/);assert.equal(v.requests.filter(p=>p==='/api/status').length,before);
});

test('TS-12 r2: project A → B → A and pagehide cancel old streams and late HTTP; return and server restart accept new revisions',async()=>{
 const v=connectedQuotaPage('spend');await v.context.quotaConnect();await v.functions.limits();const first=v.streams[0],old=v.quota();v.H.project='/projects/b';await v.window.emit('live:status');v.H.project='/projects/a';await v.window.emit('live:status');await until(()=>!v.functions.limitState.loading);assert.equal(first.closed,true);assert.equal(v.streams.filter(s=>!s.closed).length,1);const current=v.streams.at(-1);v.setPercent(92);current.onmessage({data:JSON.stringify({type:'limits',...v.quota()})});first.onmessage({data:JSON.stringify({type:'limits',...old,revision:999})});assert.match(v.find('.limits').textContent,/92 %/);
 const pending=deferred<any>();v.context.api=async(p:string)=>p==='/api/limits'?pending.promise:v.response(p);const reading=v.functions.limits();await v.window.emit('pagehide');assert.ok(v.streams.every(s=>s.closed));current.onmessage({data:JSON.stringify({type:'limits',...old,revision:999})});pending.resolve({...old,revision:999});await reading;assert.match(v.find('.limits').textContent,/92 %/);
 v.H.snapshotOnly=true;await v.window.emit('pageshow',{persisted:true});await v.window.emit('live:status');assert.ok(v.streams.every(s=>s.closed));v.H.snapshotOnly=false;v.context.api=async(p:string)=>p==='/api/limits'?{...old,revision:1}:v.response(p);await v.window.emit('live:status');await v.streams.at(-1).onopen();await until(()=>v.functions.limitState.revision===1);assert.equal(v.streams.filter(s=>!s.closed).length,1);assert.match(v.find('.limits').textContent,/18 %/);
});

for(const page of ['chat','now'])for(const delay of [false,true])for(const statusFirst of [false,true])test('TS-12 r3: '+page+' retains approval replay with '+(delay?'slow':'immediate')+' chat loading'+(statusFirst?' and an early live:status':''),async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!,approved=pane.askApproval('Разрешить тестовое действие','только дублёр',1000),gate=deferred(),sources:any[]=[];
 const v=ui(async path=>(await call(h.api,path)).body);v.context.PAGE=page;v.H.project=h.dir;v.H.pane=pane.settings();v.H.asks={};v.S.ui.pane='worker';
 Object.assign(v.context,{NOW:{cards:new Map(),es:null},nowDraw(){},hStatus(){},drawLive(){},warningEvent:()=>false,consumeState(){},refreshChats:async()=>{if(delay)await gate.promise},loadChat:async()=>{},applyStatus(st:any){Object.assign(v.H,{on:true,project:st.project,panes:st.panes});if(statusFirst)void v.window.emit('live:status')},EventSource:class{
  onmessage?:((event:any)=>void);onopen?:((event:any)=>void);onerror?:((event:any)=>void);frames:any[]=[];req:any;res:any;
  constructor(url:string){sources.push(this);this.req=request(h.api.url+url,res=>{this.res=res;this.onopen?.({});let pending='';res.on('error',()=>{});res.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,end);pending=pending.slice(end+2);if(block.startsWith('data: ')){const data=block.slice(6);this.frames.push(JSON.parse(data));this.onmessage?.({data})}}})});this.req.on('error',()=>{});this.req.end();t.after(()=>this.close())}
  close(){this.req.destroy();this.res?.destroy()}
 }});
 runInContext(part(live,'  function hEvent(','  const isDirect=')+part(live,'  async function hConnect(){','  // ── чат: настоящее поле ввода')+part(live,'  function nowLive(){',"  document.addEventListener('click',async e=>{ const b=e.target.closest('[data-ap-decision]')")+'\nglobalThis.connectReplay=hConnect;',v.context);
 if(statusFirst){await v.window.emit('live:status');assert.equal(sources.length,0,'replay must not start before the page consumer exists')}
 const connecting=v.context.connectReplay();await until(()=>sources.length===1&&sources[0].frames.some((e:any)=>e.type==='approval'));const count=()=>page==='chat'?Object.keys(v.H.asks).length:v.context.NOW.cards.size;
 assert.equal(pane.approvals.size,1);assert.equal(count(),1,'the card must already exist while refreshChats is pending');gate.resolve();await connecting;assert.equal(count(),1);assert.equal(sources.length,1);
 h.clock.advance(1000);assert.equal(await approved,false);await until(()=>sources[0].frames.some((e:any)=>e.type==='approvalResolved'));assert.equal(count(),0,'resolution still reaches the same consumer');
});

for(const kind of ['absent','disconnected','no-source','empty','forged','live'])test('211: an API slot needs a connected provider and a real quota: '+kind,async()=>{
 const v=ui(),stamp=Date.now()/1000,providers=[{id:'claude',name:'Claude',kind:'подписка',auth:{loggedIn:true}},{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}},{id:'router',name:'Роутер провайдеров',kind:'локальный роутер 127.0.0.1:11435',auth:{loggedIn:true}},...(kind==='absent'?[]:[{id:'qwen',name:'Qwen',kind:'ключ API',auth:{loggedIn:kind!=='disconnected'}}])];
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'qwen',status:'ok',sourceConnected:kind!=='no-source',fetchedAt:stamp,windows:kind==='empty'?[]:[{label:'месяц',percentUsed:kind==='forged'?101:25,windowMinutes:43200,resetsAt:stamp+3600}]}]}:v.response(p);await v.functions.limits();await v.find('[data-spend-limits]').emit('click');
 assert.doesNotMatch(v.find('.limits').textContent,/Роутер провайдеров|остаток API|41,20/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/Роутер провайдеров|остаток API|41,20/);assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),kind!=='live');
 if(kind==='live'){assert.match(v.find('.limits').textContent,/Qwen · ключ API/);assert.match(v.find('[data-c="qwen"]').textContent,/25 %/);const card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(c=>c.textContent.includes('Qwen'))!;assert.doesNotMatch(card.textContent,/макет/)}else {assert.doesNotMatch(v.find('.limits').textContent,/Qwen/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/Qwen/);assert.equal(v.find('[data-c="qwen"]').innerHTML,'')}
});

for(const selection of ['both','primary','secondary'])test('212: Codex '+selection+' renders every supplied window and no invented replacement',async()=>{
 const v=ui(),stamp=Date.now()/1000,windows=[{label:'5 ч',percentUsed:18,windowMinutes:300,resetsAt:stamp+3600},{label:'неделя',percentUsed:71,windowMinutes:10080,resetsAt:stamp+7200}].filter((_,i)=>selection==='both'||i===(selection==='primary'?0:1));
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'codex',status:'ok',sourceConnected:true,fetchedAt:stamp,windows}]}:v.response(p);await v.functions.limits();assert.equal(v.find('[data-c="codex"]').querySelectorAll('[role="meter"]').length,windows.length);await v.find('[data-spend-limits]').emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length,windows.length);for(const w of windows)assert.match(v.find('.limits-dialog').textContent,new RegExp(w.percentUsed+' %'));assert.doesNotMatch(v.find('.limits-dialog').textContent,/макет/);
});
