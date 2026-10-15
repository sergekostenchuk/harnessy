import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {request} from 'node:http';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {record,ProviderCatalog,ProviderError,type CatalogEntry,type ProviderLimits} from '@harnessy/providers';
import {copilotFixture} from '../../providers/src/copilot-test-helpers.ts';
import {fixture,call,deferred,until,sse,FakeProvider,FakeClock} from './test-helpers.ts';
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
 runInContext(part(live,'  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part(live,'  function closeLAMenus(','  // запись «контекст передан»')+part(live,'  const statics=','  // ══ ПЛАН:')+part(live,'  // TS-14b: spend blocks','  // ══ ПОДКЛЮЧЕНИЯ')+'\nglobalThis.testing={fetch:spendFetch,draw:spendDraw,csv:spendCsv,state:SP,limits:limitsFetch,limitState:LIM,limitDraw:limitsDraw,limitEvent:limitsEvent,subscribe:subscribeLiveEvents,syncEvents:syncLiveEvents,history:spendHistory,windows:spendWindows};restoreUI();',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 return {...d,H,S,context,requests,blobs,downloaded,logs,writes,toasts,find,response,functions:context.testing};
}

test('173/178: cancelled TS-10 hidden-block invariant; original Spend blocks and tabs stay, CSV has one owner',async t=>{
 const h=await fixture(t);await h.runtime.runTurn('worker','question');const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;
 const original=v.find('[data-c="router"]');await v.functions.fetch();await v.functions.limits();assert.equal(v.find('[data-c="router"]'),original);
 for(const selector of ['[data-c="claude"]','[data-c="codex"]','[data-c="qwen"]','[data-c="hist"]','[data-c="cal"]','#v-proj','#v-role','#v-est','#cap','#seg'])v.find(selector);
 assert.match(v.find('[data-c="claude"]').textContent,/62,4 %/);assert.match(v.find('[data-c="claude"]').textContent,/Макет лимитов/);assert.doesNotMatch(v.find('.main').textContent,/OMG|Sonnet 35 %/);assert.match(v.find('.main').textContent,/макет/);assert.match(v.find('.main').textContent,/chats.json/);assert.equal(v.functions.state.data.totals.input,20);
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

test('177/211/TS-29: sidebar uses connected basics and the most active third vendor, not quota availability',async()=>{
 const v=ui();v.functions.state.period='30';const paths:string[]=[],stamp=Date.now()/1000;v.context.api=async(p:string)=>{paths.push(p);return p==='/api/connections'?{ok:true,providers:['claude','codex','router','qwen','deepseek','off'].map(id=>({id,name:id,kind:['qwen','deepseek'].includes(id)?'ключ API':'подписка',auth:{loggedIn:id!=='off'}}))}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:['codex','qwen','deepseek','router'].map(vendor=>({vendor,sourceConnected:true,fetchedAt:stamp,source:'fixture',stale:true,windows:[{label:'5 ч',percentUsed:25,resetsAt:stamp+200},{label:'неделя',percentUsed:50}]}))}:{...snapshot('/projects/a','7'),byVendor:[{vendor:'router',turns:100},{vendor:'codex',turns:10},{vendor:'qwen',turns:7},{vendor:'deepseek',turns:4},{vendor:'claude',turns:1}]}};
 await v.functions.limits();assert.ok(paths.includes('/api/spend?period=7'));const widget=v.find('.limits');assert.equal(widget.hasAttribute('data-go'),false);assert.deepEqual(widget.querySelectorAll('.limit-label').map(n=>n.textContent),['Claude','Codex','qwen']);assert.equal(widget.querySelectorAll('[role="meter"]')[1]!.getAttribute('aria-valuenow'),'50');assert.equal(widget.querySelectorAll('.limit-provider').length,3);assert.doesNotMatch(widget.textContent,/устаревшие|router|off|подробнее|Расход и лимиты/);assert.equal(widget.querySelector('a'),null);
 await widget.emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('.sp-limit').length,4);assert.match(v.find('.limits-dialog').textContent,/неделя|5 ч/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/router|остаток API|\$41[,.]20/);assert.equal(v.find('.limits-dialog a').getAttribute('href'),'05-spend.html?period=30');
});

test('TS-29: one connected subscription stays one row; Devin beats an idle Copilot and the popup lists three active extras',async()=>{
 const v=ui(),stamp=Date.now()/1000;let connected=['claude'],activity:any[]=[];
 v.context.api=async(path:string)=>path==='/api/connections'?{ok:true,providers:connected.map(id=>({id,name:id,auth:{loggedIn:id!=='off'}}))}:path==='/api/limits'?{ok:true,project:v.H.project,revision:1,providers:connected.map(vendor=>({vendor,ok:true,sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:20,windowMinutes:10080}]}))}:path==='/api/spend?period=7'?{...snapshot(v.H.project,'7'),byVendor:activity}:v.response(path);
 await v.functions.limits();assert.deepEqual(v.find('.limits').querySelectorAll('.limit-label').map(n=>n.textContent),['Claude']);
 connected=['claude','codex'];await v.functions.limits();assert.deepEqual(v.find('.limits').querySelectorAll('.limit-label').map(n=>n.textContent),['Claude','Codex']);
 connected.push('off');activity=[{vendor:'off',turns:20},{vendor:'copilot',turns:0},{vendor:'devin',turns:13},{vendor:'opencode',turns:8},{vendor:'gemini',turns:3},{vendor:'kimi',turns:1}];await v.functions.limits();assert.deepEqual(v.find('.limits').querySelectorAll('.limit-label').map(n=>n.textContent),['Claude','Codex','Devin']);
 await v.find('.limits').emit('click');const dialog=v.find('.limits-dialog');assert.match(dialog.textContent,/Devin.*13 ходов за 7 дней.*лимит программой не отдаётся · считаем 100 %/);assert.match(dialog.textContent,/OpenCode|Opencode/);assert.match(dialog.textContent,/Gemini/);assert.doesNotMatch(dialog.textContent,/Copilot|Kimi/);assert.equal(dialog.querySelectorAll('.sp-limit').length,5);const devin=dialog.querySelectorAll('.sp-limit').find(node=>node.textContent.includes('Devin'))!;assert.doesNotMatch(devin.textContent,/обновлено|источник не указан/);
});

test('TS-29: weekly then monthly then five-hour quota controls the remaining value and tone; no data is grey 100%',()=>{
 const v=ui(),l=v.functions.limitState,stamp=Date.now()/1000;l.providers=[{id:'claude',name:'Claude'}];
 const draw=(windows:any[],failed=false)=>{l.limits=[{vendor:'claude',ok:!failed,status:failed?'unavailable':'ok',sourceConnected:true,fetchedAt:stamp,windows}];v.functions.limitDraw();return v.find('.limits [data-limit-vendor="claude"]')};
 let row=draw([{label:'5 ч',percentUsed:99,windowMinutes:300},{label:'месяц',percentUsed:90,windowMinutes:43200},{label:'неделя',percentUsed:75,windowMinutes:10080}]);assert.match(row.textContent,/25 %W/);assert.equal(row.querySelector('[role="meter"]')!.className,'ticks');
 row=draw([{label:'5 ч',percentUsed:99,windowMinutes:300},{label:'месяц',percentUsed:80,windowMinutes:43200}]);assert.match(row.textContent,/20 %M/);assert.equal(row.querySelector('[role="meter"]')!.className,'ticks warn');
 row=draw([{label:'5 ч',percentUsed:93,windowMinutes:300}]);assert.match(row.textContent,/7 %5h/);assert.equal(row.querySelector('[role="meter"]')!.className,'ticks bad');
 row=draw([]);assert.match(row.textContent,/100 %—/);assert.equal(row.querySelector('[role="meter"]'),null);assert.equal(row.querySelectorAll('.ticks i.on').length,0);
 row=draw([{label:'неделя',percentUsed:80,windowMinutes:10080}],true);assert.match(row.textContent,/100 %—/);assert.equal(row.querySelector('[role="meter"]'),null);
});

test('TS-29: renewal appears only with a future source date; absent Fable never produces a sample row',async()=>{
 const v=ui(),l=v.functions.limitState,stamp=Date.now()/1000;l.providers=[{id:'claude',name:'Claude'},{id:'codex',name:'Codex'}];
 l.limits=[{vendor:'claude',ok:true,sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:21,windowMinutes:10080}]},{vendor:'codex',ok:true,sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:21,windowMinutes:10080}]}];v.functions.limitDraw();await v.find('.limits').emit('click');const dialog=v.find('.limits-dialog');assert.doesNotMatch(dialog.textContent,/Fable|продление через/);assert.equal(dialog.querySelectorAll('.sp-limit-window').length,2);
 l.limits=l.limits.map((row:any)=>({...row,renewalAt:stamp+2*86400}));v.functions.limitDraw();assert.equal(dialog.querySelectorAll('.sp-limit-renewal').length,2);assert.match(dialog.textContent,/продление через 2 д/);
});

test('175/178: history paginates with deduplication; late filter response cannot replace new filter; escape prevents reopening',async()=>{
 const v=ui();await v.functions.fetch();v.functions.state.next='cursor';v.functions.draw();await v.find('[data-c="hist"]').emit('click');v.context.api=async()=>({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item(),item('t2')],next:null});await v.find('[data-spend-more]').emit('click');assert.equal(v.functions.state.history.length,2);
 await v.find('[data-c="hist"]').emit('click');const gate=deferred<any>();v.context.api=()=>gate.promise;v.functions.state.next='more';const pending=v.functions.history(true);await v.window.emit('keydown',{key:'Escape'});gate.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('t3')],next:null});await pending;assert.equal(v.find('.ovl').classList.contains('on'),false);await v.find('[data-c="hist"]').emit('click');
 const old=deferred<any>();v.context.api=(p:string)=>p.includes('vendor=codex')?Promise.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[],next:null}):old.promise;const filter=v.find('[data-spend-vendor]');filter.value='claude';const first=filter.emit('change');const next=v.find('[data-spend-vendor]');next.value='codex';await next.emit('change');old.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('stale')],next:null});await first;assert.equal(v.functions.state.history.length,0);assert.equal(v.functions.state.historyLoading,false);
});

test('177: late quota reads cannot restore a previous project or a hidden page',async()=>{
 const v=ui(),old=deferred<any>(),connections={ok:true,providers:[{id:'claude',name:'Claude',auth:{loggedIn:true}}]};
 v.context.api=()=>old.promise;const first=v.functions.limits();v.H.project='/projects/b';v.context.api=async(p:string)=>p==='/api/connections'?connections:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'test',windows:[{label:'weekly',percentUsed:20}]}]}:snapshot('/projects/b','7');await v.functions.limits();
 v.H.project='/projects/a';await v.functions.limits();old.resolve({ok:true,providers:[{id:'stale',name:'stale',auth:{loggedIn:true}}]});await first;
 assert.deepEqual(Array.from(v.functions.limitState.providers,(p:any)=>p.id),['claude']);assert.equal(v.find('.limits [role="meter"]').getAttribute('aria-valuenow'),'80');
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

test('198/203/TS-29: disconnected widget invents no sample percentages; details still open',async()=>{
 const v=ui(undefined,false);v.functions.limitDraw();const widget=v.find('.limits');assert.equal(widget.querySelectorAll('.limit-provider').length,0);assert.equal(widget.querySelectorAll('[role="meter"]').length,0);assert.equal(widget.textContent,'Осталось');
 await widget.emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length,0);await v.find('[data-spend-close]').emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);
});
test('203: failed quota refresh keeps the last real value dated; foreign response cannot impersonate current project',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'Claude usage',fetchedAt:Date.now()/1000,windows:[{label:'неделя',percentUsed:0,resetsAt:Date.now()/1000+60}]}]}:v.response(p);
 await v.functions.limits();assert.equal(v.find('.limits [role="meter"]').getAttribute('aria-valuenow'),'100');assert.doesNotMatch(v.find('.limits').textContent,/макет/);
 v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:'/foreign',updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'forged',windows:[{label:'неделя',percentUsed:99}]}]}:v.response(p);await v.functions.limits();assert.equal(v.find('.limits [role="meter"]').getAttribute('aria-valuenow'),'100');assert.doesNotMatch(v.find('.limits').textContent,/устаревшие|forged|99 %/);
});

test('202/203/TS-29: a provider without weekly turns does not occupy the third widget row',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'kimi',name:'Kimi',kind:'подписка',auth:{loggedIn:true}},{id:'claude',name:'Claude',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'kimi',sourceConnected:true,source:'Kimi',windows:[],reason:'месячный лимит провайдер не отдаёт'}]}:snapshot(v.H.project,'7');
 await v.functions.limits();assert.deepEqual(v.find('.limits').querySelectorAll('.limit-label').map(n=>n.textContent),['Claude']);await v.find('.limits').emit('click');assert.doesNotMatch(v.find('.limits-dialog').textContent,/Kimi|макет|34 %|\$41[,.]20/);
});

test('146: sidebar details also open outside Spend without HX, close on Escape and restore focus',async()=>{
 const v=ui();v.context.PAGE='new';delete v.context.HX;await v.functions.limits();const opener=v.find('.limits');await opener.emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),true);await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);assert.equal(v.document.activeElement,opener);
});

test('200/473: plan and all three Claude windows appear with a countdown, and a connection-read failure keeps the last snapshot',async()=>{
 const v=ui(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:now,providers:[{vendor:'claude',plan:'Max',fetchedAt:now,status:'ok',sourceConnected:true,source:'claude.ai /usage',windows:[{label:'5 ч',percentUsed:21,windowMinutes:300,resetsAt:now+3120},{label:'неделя',percentUsed:21,windowMinutes:10080,resetsAt:now+100000},{label:'неделя · Sonnet',percentUsed:32,windowMinutes:10080,resetsAt:now+100000}]}]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude79 %W/);await v.find('.limits').emit('click');const detail=v.find('.limits-dialog');assert.equal(detail.querySelectorAll('[role="meter"]').length,2);assert.match(detail.textContent,/сброс через 52 мин/);assert.doesNotMatch(detail.textContent,/Sonnet/);
 v.context.api=async()=>{throw Error('connection down')};await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude79 %W/);assert.doesNotMatch(v.find('.limits').textContent,/устаревшие/);assert.match(detail.textContent,/устаревшие/);
});

test('200: an older in-flight HTTP result cannot overwrite a newer quota event',async()=>{
 const v=ui(),pending=deferred<any>(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?pending.promise:v.response(p);const reading=v.functions.limits();const quota=(stamp:number,percentUsed:number)=>({ok:true,revision:percentUsed,project:v.H.project,updatedAt:stamp,providers:[{vendor:'claude',plan:'Max',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed,windowMinutes:10080,resetsAt:now+3600}]}]});v.functions.limitEvent(quota(now,30));pending.resolve(quota(now-60,10));await reading;assert.equal(v.find('.limits [role="meter"]').getAttribute('aria-valuenow'),'70');assert.doesNotMatch(v.find('.limits').textContent,/90 %/);
});

for(const delivery of ['HTTP','SSE'])test('TS-12 r2: ok → not_applicable via '+delivery+' removes the old percentage and top-three entry',async t=>{
 let applicable=true;const {FakeProvider,FakeClock}=await import('./test-helpers.ts');const clock=new FakeClock();clock.time=Date.now();const provider=Object.assign(new FakeProvider(),{limits:async():Promise<any>=>applicable?{ok:true,plan:'Max',fetchedAt:clock.now()/1000,source:'fixture',windows:[{label:'неделя',percentUsed:61,windowMinutes:10080,resetsAt:clock.now()/1000+3600}]}:{ok:false,code:'limits_not_applicable',reason:''}});
 const h=await fixture(t,{deps:{providers:{claude:provider},clock}}),v=ui(async p=>(await call(h.api,p)).body);v.H.project=h.dir;await v.functions.limits();assert.match(v.find('.limits').textContent,/39 %/);await v.find('.limits').emit('click');
 const stream=await sse(h.api);t.after(()=>stream.close());applicable=false;clock.advance(300000);await until(()=>stream.frames.some(e=>e.type==='limits'&&e.providers[0]?.status==='not_applicable'));if(delivery==='HTTP')await v.functions.limits();else v.functions.limitEvent(stream.frames.find(e=>e.type==='limits'&&e.providers[0]?.status==='not_applicable'));
 assert.equal(v.functions.limitState.limits[0].status,'not_applicable');assert.equal(v.functions.limitState.updatedAt,null);assert.match(v.find('.limits').textContent,/Claude100 %—/);assert.doesNotMatch(v.find('.limits').textContent,/39 %/);const card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(c=>c.textContent.includes('Claude'))!;assert.doesNotMatch(card.textContent,/39 %|макет/);assert.match(card.textContent,/ключ API не имеет окон подписки/);
});

for(const revision of [undefined,null,-1,1.5,'20'])test('TS-12 r2: missing or forged revision '+revision+' cannot replace a valid quota',async()=>{
 const v=ui(),quota={ok:true,project:v.H.project,revision:2,updatedAt:Date.now()/1000,providers:[{vendor:'claude',sourceConnected:true,windows:[{label:'неделя',percentUsed:61}]}]};v.context.api=async(p:string)=>p==='/api/limits'?quota:v.response(p);await v.functions.limits();v.functions.limitEvent({...quota,revision,providers:[]});assert.match(v.find('.limits').textContent,/39 %/);v.context.api=async(p:string)=>p==='/api/limits'?{...quota,revision,providers:[]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/39 %/);
});

function connectedQuotaPage(page:string){
 const v=ui(),streams:any[]=[];let percent=18,revision=1;const quota=()=>({ok:true,project:v.H.project,revision,updatedAt:Date.now()/1000,providers:[{vendor:'claude',status:'ok',sourceConnected:true,windows:[{label:'неделя',percentUsed:percent,windowMinutes:10080,resetsAt:Date.now()/1000+3600}]}]});v.context.PAGE=page;v.S.ui.pane='room';v.context.location.pathname=page==='log'?'/21-journal.html':'/page.html';
 Object.assign(v.context,{firstSelectPane(){},firstDraw(){},NOW:{es:null,alive:true},nowFetch:async()=>true,nowDraw(){},hStatus(){},hEvent(){},consumeState(){},refreshChats:async()=>{},loadChat:async()=>{},journalLive(){},applyStatus(st:any){Object.assign(v.H,{on:true,snapshotOnly:false,project:st.project,panes:st.panes})},EventSource:class{closed=false;onmessage:any;onopen:any;onerror:any;constructor(){streams.push(this)}close(){this.closed=true}}});
 v.context.api=async(p:string)=>{v.requests.push(p);return p==='/api/status'?{project:v.H.project,panes:[]}:p==='/api/limits'?quota():v.response(p)};
 runInContext(part(live,'  async function hConnect(){','  // ── чат: настоящее поле ввода')+part(live,'  function nowLive(){','  // TS-15c Now lifecycle.')+'\nglobalThis.quotaConnect=hConnect;',v.context);
 return {...v,streams,quota,setPercent(n:number){percent=n;revision++}};
}

for(const page of ['new','now','chat','plan','res','doc','art','mem','swarm','sens','spend','events','log','set','conn','away','first','login'])test('TS-12 r2: '+page+' keeps exactly one shared stream and redraws 18 → 92 without another status fetch',async()=>{
 const v=connectedQuotaPage(page);await v.context.quotaConnect();await v.functions.limits();await v.context.quotaConnect();await v.window.emit('live:status');assert.equal(v.streams.length,1);for(const data of ['null','42','[]','{}','{'])assert.doesNotThrow(()=>v.streams[0].onmessage({data}));assert.match(v.find('.limits').textContent,/82 %/);assert.equal(v.find('.limits').querySelectorAll('.sp-limit').length,0);assert.equal(v.find('.limits').querySelectorAll('.limit-provider').length,1);const before=v.requests.filter(p=>p==='/api/status').length;v.setPercent(92);v.streams[0].onmessage({data:JSON.stringify({type:'limits',...v.quota()})});assert.match(v.find('.limits').textContent,/8 %/);assert.equal(v.requests.filter(p=>p==='/api/status').length,before);
});

test('TS-12 r2: project A → B → A and pagehide cancel old streams and late HTTP; return and server restart accept new revisions',async()=>{
 const v=connectedQuotaPage('spend');await v.context.quotaConnect();await v.functions.limits();const first=v.streams[0],old=v.quota();v.H.project='/projects/b';await v.window.emit('live:status');v.H.project='/projects/a';await v.window.emit('live:status');await until(()=>!v.functions.limitState.loading);assert.equal(first.closed,true);assert.equal(v.streams.filter(s=>!s.closed).length,1);const current=v.streams.at(-1);v.setPercent(92);current.onmessage({data:JSON.stringify({type:'limits',...v.quota()})});first.onmessage({data:JSON.stringify({type:'limits',...old,revision:999})});assert.match(v.find('.limits').textContent,/8 %/);
 const pending=deferred<any>();v.context.api=async(p:string)=>p==='/api/limits'?pending.promise:v.response(p);const reading=v.functions.limits();await v.window.emit('pagehide');assert.ok(v.streams.every(s=>s.closed));current.onmessage({data:JSON.stringify({type:'limits',...old,revision:999})});pending.resolve({...old,revision:999});await reading;assert.match(v.find('.limits').textContent,/8 %/);
 v.H.snapshotOnly=true;await v.window.emit('pageshow',{persisted:true});await v.window.emit('live:status');assert.ok(v.streams.every(s=>s.closed));v.H.snapshotOnly=false;v.context.api=async(p:string)=>p==='/api/limits'?{...old,revision:1}:v.response(p);await v.window.emit('live:status');await v.streams.at(-1).onopen();await until(()=>v.functions.limitState.revision===1);assert.equal(v.streams.filter(s=>!s.closed).length,1);assert.match(v.find('.limits').textContent,/82 %/);
});

// TS-15c: Now replay is covered with HTTP snapshots in now-ui.test.ts. Chat still consumes approval payloads.
for(const page of ['chat'])for(const delay of [false,true])for(const statusFirst of [false,true])test('TS-12 r3: '+page+' retains approval replay with '+(delay?'slow':'immediate')+' chat loading'+(statusFirst?' and an early live:status':''),async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!,approved=pane.askApproval('Разрешить тестовое действие','только дублёр',1000),gate=deferred(),sources:any[]=[];
 const v=ui(async path=>(await call(h.api,path)).body);v.context.PAGE=page;v.H.project=h.dir;v.H.pane=pane.settings();v.H.asks={};v.S.ui.pane='worker';
 Object.assign(v.context,{firstSelectPane(){},firstDraw(){},NOW:{es:null,alive:true},nowFetch:async()=>true,nowDraw(){},hStatus(){},drawLive(){},warningEvent:()=>false,consumeState(){},refreshChats:async()=>{if(delay)await gate.promise},loadChat:async()=>{},applyStatus(st:any){Object.assign(v.H,{on:true,project:st.project,panes:st.panes});if(statusFirst)void v.window.emit('live:status')},EventSource:class{
  onmessage?:((event:any)=>void);onopen?:((event:any)=>void);onerror?:((event:any)=>void);frames:any[]=[];req:any;res:any;
  constructor(url:string){sources.push(this);this.req=request(h.api.url+url,res=>{this.res=res;this.onopen?.({});let pending='';res.on('error',()=>{});res.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,end);pending=pending.slice(end+2);if(block.startsWith('data: ')){const data=block.slice(6);this.frames.push(JSON.parse(data));this.onmessage?.({data})}}})});this.req.on('error',()=>{});this.req.end();t.after(()=>this.close())}
  close(){this.req.destroy();this.res?.destroy()}
 }});
 runInContext(part(live,'  function hEvent(','  const isDirect=')+part(live,'  async function hConnect(){','  // ── чат: настоящее поле ввода')+part(live,'  function nowLive(){','  // TS-15c Now lifecycle.')+'\nglobalThis.connectReplay=hConnect;',v.context);
 if(statusFirst){await v.window.emit('live:status');assert.equal(sources.length,0,'replay must not start before the page consumer exists')}
 const connecting=v.context.connectReplay();await until(()=>sources.length===1&&sources[0].frames.some((e:any)=>e.type==='approval'));const count=()=>page==='chat'?Object.keys(v.H.asks).length:v.context.NOW.cards.size;
 assert.equal(pane.approvals.size,1);assert.equal(count(),1,'the card must already exist while refreshChats is pending');gate.resolve();await connecting;assert.equal(count(),1);assert.equal(sources.length,1);
 h.clock.advance(1000);assert.equal(await approved,false);await until(()=>sources[0].frames.some((e:any)=>e.type==='approvalResolved'));assert.equal(count(),0,'resolution still reaches the same consumer');
});

for(const kind of ['absent','disconnected','no-source','empty','forged','live'])test('211/TS-29: Spend API slot needs a real quota; sidebar needs weekly activity: '+kind,async()=>{
 const v=ui(),stamp=Date.now()/1000,providers=[{id:'claude',name:'Claude',kind:'подписка',auth:{loggedIn:true}},{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}},{id:'router',name:'Роутер провайдеров',kind:'локальный роутер 127.0.0.1:11435',auth:{loggedIn:true}},...(kind==='absent'?[]:[{id:'qwen',name:'Qwen',kind:'ключ API',auth:{loggedIn:kind!=='disconnected'}}])];
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'qwen',status:'ok',sourceConnected:kind!=='no-source',fetchedAt:stamp,windows:kind==='empty'?[]:[{label:'месяц',percentUsed:kind==='forged'?101:25,windowMinutes:43200,resetsAt:stamp+3600}]}]}:v.response(p);await v.functions.limits();await v.find('.limits').emit('click');
 assert.doesNotMatch(v.find('.limits').textContent,/Роутер провайдеров|остаток API|Qwen|\$41[,.]20/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/Роутер провайдеров|остаток API|Qwen|\$41[,.]20/);assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),kind!=='live');
 if(kind==='live'){assert.match(v.find('[data-c="qwen"]').textContent,/25 %/)}else assert.equal(v.find('[data-c="qwen"]').innerHTML,'');
});

for(const selection of ['both','primary','secondary'])test('212: Codex '+selection+' renders every supplied window and no invented replacement',async()=>{
 const v=ui(),stamp=Date.now()/1000,windows=[{label:'5 ч',percentUsed:18,windowMinutes:300,resetsAt:stamp+3600},{label:'неделя',percentUsed:71,windowMinutes:10080,resetsAt:stamp+7200}].filter((_,i)=>selection==='both'||i===(selection==='primary'?0:1));
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'codex',status:'ok',sourceConnected:true,fetchedAt:stamp,windows}]}:v.response(p);await v.functions.limits();assert.equal(v.find('[data-c="codex"]').querySelectorAll('[role="meter"]').length,windows.length);await v.find('.limits').emit('click');const chosen=windows.find(w=>w.windowMinutes===10080)||windows[0]!;assert.equal(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length,1);assert.match(v.find('.limits-dialog').textContent,new RegExp((100-chosen.percentUsed)+' %'));assert.doesNotMatch(v.find('.limits-dialog').textContent,/макет/);
});


test('216/217: sidebar replaces the five-window invariant with one row per subscription; details keep every window',async()=>{
 const v=ui(),stamp=Date.now()/1000,w=(label:string,percentUsed:number,windowMinutes:number)=>({label,percentUsed,windowMinutes,resetsAt:stamp+3600}),providers=[{vendor:'claude',plan:'Max',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[w('5 ч',80,300),w('неделя',79.9,10080),w('неделя · Fable',94.9,10080)]},{vendor:'codex',plan:'Pro',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[w('5 ч',0,300),w('неделя',95,10080)]}];
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:providers.map(p=>({id:p.vendor,name:p.vendor,auth:{loggedIn:true}}))}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers}:v.response(p);await v.functions.limits();
 const widget=v.find('.limits'),labels=widget.querySelectorAll('.limit-label').map(n=>n.textContent),meters=widget.querySelectorAll('[role="meter"]');assert.equal(widget.querySelector('.cap')!.textContent,'Осталось');assert.deepEqual(labels,['Claude','Codex']);assert.deepEqual(meters.map(n=>n.getAttribute('aria-valuenow')),['20.1','5']);assert.deepEqual(meters.map(n=>n.className),['ticks warn','ticks bad']);assert.ok(meters.every(n=>n.querySelectorAll('i').length===24));assert.equal(widget.querySelectorAll('.sp-limit,.sp-value').length,0);assert.doesNotMatch(widget.textContent,/макет|устаревшие/);
 assert.equal(v.find('[data-c="claude"]').querySelector('.sp-quota .big b')!.textContent,'79,9 %');assert.equal(v.find('[data-c="codex"]').querySelectorAll('.sp-quota').length,2);await widget.emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('.sp-value').length,4);assert.match(v.find('.limits-dialog').textContent,/Max|Pro/);
});

test('213: absent model windows stay absent and additional model names are escaped without taking the all-model quota',async()=>{
 const v=ui(),stamp=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'claude',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя · <img src=x>',percentUsed:95,windowMinutes:10080},{label:'неделя · Haiku',percentUsed:12,windowMinutes:10080},{label:'неделя',percentUsed:20,windowMinutes:10080}]}]}:v.response(p);await v.functions.limits();const widget=v.find('.limits');assert.equal(widget.querySelectorAll('img').length,0);assert.deepEqual(widget.querySelectorAll('.limit-label').map(n=>n.textContent),['Claude']);assert.doesNotMatch(widget.textContent,/Fable|5 ч/);assert.equal(v.find('[data-c="claude"]').querySelector('.sp-quota .big b')!.textContent,'20 %');
 const update=await v.context.api('/api/limits');update.revision=2;update.providers[0].windows.push({label:'неделя · Fable',percentUsed:42,windowMinutes:10080});v.functions.limitEvent(update);assert.equal(v.find('.limits .limit-label').textContent,'Claude');assert.equal(v.find('.limits').querySelectorAll('.limit-provider').length,1);await widget.emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('.sp-limit-window').length,2);assert.match(v.find('.limits-dialog').textContent,/58 %.*Fable · неделя.*80 %.*остальные · неделя/s);assert.doesNotMatch(v.find('.limits-dialog').textContent,/Haiku|<img src=x>/);assert.equal(v.find('.limits-dialog').querySelector('img'),null);
});


test('216: unavailable subscriptions remain visible within the three-row cap, with the reason in details',async()=>{
 const v=ui(),now=Date.now()/1000,providers=[{id:'claude',name:'Claude',kind:'подписка'},{id:'codex',name:'Codex',kind:'подписка'},{id:'qwen',name:'Qwen',kind:'ключ API'},{id:'deepseek',name:'DeepSeek',kind:'ключ API'}];v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:providers.map(p=>({...p,auth:{loggedIn:true}}))}:p==='/api/limits'?{ok:true,revision:1,project:v.H.project,updatedAt:now,providers:providers.map(p=>({vendor:p.id,status:p.id==='claude'?'unavailable':'ok',sourceConnected:true,fetchedAt:p.id==='claude'?null:now,reason:p.id==='claude'?'Claude: сервис лимитов просит повторить позже':undefined,windows:p.id==='claude'?[]:[{label:'неделя',percentUsed:21,windowMinutes:10080}]}))}:v.response(p);await v.functions.limits();const widget=v.find('.limits'),claude=v.find('.limits [data-limit-vendor="claude"]');assert.equal(widget.querySelectorAll('[role="meter"]').length,1);assert.equal(widget.querySelectorAll('[data-limit-vendor]').length,2);assert.equal(claude.querySelectorAll('[role="meter"]').length,0);assert.match(claude.textContent,/100 %—/);assert.doesNotMatch(widget.textContent,/просит повторить|макет/);assert.doesNotMatch(v.find('[data-c="claude"]').textContent,/данные за/);await widget.emit('click');assert.match(v.find('.limits-dialog').textContent,/Claude: сервис лимитов просит повторить позже/);
});

test('283/TS-29: an idle Copilot quota stays on Spend but does not displace the active third row',async()=>{
 const v=ui(),stamp=Date.now()/1000,w=(label:string,percentUsed:number,windowMinutes:number)=>({label,percentUsed,windowMinutes,resetsAt:stamp+3600}),providers=[{vendor:'claude',sourceConnected:true,fetchedAt:stamp,windows:[w('неделя',39,10080)]},{vendor:'codex',sourceConnected:true,fetchedAt:stamp,windows:[w('5 ч',18,300)]},{vendor:'copilot',kind:'subscription',label:'GitHub Copilot',ok:true,status:'ok',sourceConnected:true,source:'GitHub Copilot CLI',fetchedAt:stamp,windows:[w('additional_requests',10,29*1440),w('month',25,29*1440)]}];
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:providers.slice(0,2).map(p=>({id:p.vendor,auth:{loggedIn:true}}))}:p==='/api/limits'?{ok:true,project:v.H.project,revision:1,providers}:v.response(p);await v.functions.limits();
 assert.deepEqual(v.find('.limits').querySelectorAll('.limit-label').map(n=>n.textContent),['Claude','Codex']);assert.equal(v.find('[data-c="codex"]').querySelectorAll('[role="meter"]').length,1);assert.doesNotMatch(v.find('.limits').textContent,/Copilot|макет/);await v.find('.limits').emit('click');assert.doesNotMatch(v.find('.limits-dialog').textContent,/Copilot/);
});

for(const vendor of ['claude','codex','copilot'])test('286: a typed '+vendor+' failure has no invented quota and keeps the other vendors from the same HTTP response',async()=>{
 const v=ui(),stamp=Date.now()/1000,reason='Лимиты временно недоступны <img src=x>',providers=['claude','codex','copilot'].map(id=>id===vendor?{vendor:id,ok:false,code:'limits_unavailable',reason,checkedAt:stamp*1000}:{vendor:id,kind:'subscription',ok:true,sourceConnected:true,fetchedAt:stamp,windows:[{label:id==='copilot'?'month':'неделя',percentUsed:42,windowMinutes:id==='copilot'?31*1440:10080,resetsAt:stamp+3600}]});
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'claude',auth:{loggedIn:true}},{id:'codex',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,project:v.H.project,revision:1,providers}:p==='/api/spend?period=7'?{...snapshot(v.H.project,'7'),byVendor:[{vendor:'copilot',turns:5}]}:v.response(p);await v.functions.limits();await v.find('.limits').emit('click');const failed=v.find('[data-limit-vendor="'+vendor+'"]');assert.match(failed.textContent,/100 %—/);assert.equal(failed.querySelector('[role="meter"]'),null);assert.equal(failed.querySelector('img'),null);assert.equal(v.find('.limits').querySelectorAll('[data-limit-vendor]').length,3);assert.equal(v.find('.limits').querySelectorAll('[role="meter"]').length,2);assert.doesNotMatch(v.find('.limits').textContent,/нет данных|макет|Лимиты временно/);assert.ok(v.find('.limits-dialog').textContent.includes('нет данных · '+reason));assert.equal(v.find('.limits-dialog').querySelector('img'),null);assert.equal(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length,2);
 const updated={...providers.find(p=>p.vendor!==vendor),vendor,kind:'subscription',ok:true,sourceConnected:true,windows:[{label:vendor==='copilot'?'month':'неделя',percentUsed:67,windowMinutes:vendor==='copilot'?30*1440:10080,resetsAt:stamp+3600}]};v.functions.limitEvent({ok:true,project:v.H.project,revision:2,providers:providers.map(p=>p.vendor===vendor?updated:p)});assert.equal(v.find('[data-limit-vendor="'+vendor+'"] [role="meter"]').getAttribute('aria-valuenow'),'33');assert.doesNotMatch(v.find('.limits').textContent,/нет данных|макет/);
});

test('286: a failed CLI refresh keeps the measured month and visibly reports the reason in both limit views',async()=>{
 const v=ui(),stamp=Date.now()/1000,provider={vendor:'copilot',kind:'subscription',ok:true,sourceConnected:true,fetchedAt:stamp,windows:[{label:'month',percentUsed:25,windowMinutes:28*1440,resetsAt:stamp+3600}]};v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[]}:p==='/api/limits'?{ok:true,project:v.H.project,revision:1,providers:[provider]}:p==='/api/spend?period=7'?{...snapshot(v.H.project,'7'),byVendor:[{vendor:'copilot',turns:5}]}:v.response(p);await v.functions.limits();await v.find('.limits').emit('click');
 v.functions.limitEvent({ok:true,project:v.H.project,revision:2,providers:[{...provider,ok:false,status:'unavailable',code:'limits_unavailable',reason:'Сервис просит повторить позже',nextAttemptAt:stamp+300}]});assert.match(v.find('.limits').textContent,/Copilot100 %—/);assert.doesNotMatch(v.find('.limits').textContent,/Сервис просит повторить позже|макет/);assert.match(v.find('.limits-dialog').textContent,/75 %|Сервис просит повторить позже/);assert.match(v.find('.limits-dialog').textContent,/следующая попытка/);
});

test('283/286 HTTP → widget: Copilot recovers a monthly window and retains it after 429 while Claude/Codex remain measured',async t=>{
 const clock=new FakeClock();let phase='unavailable',turns=0;const quota=(label:string,percentUsed:number,windowMinutes:number):ProviderLimits=>({ok:true,plan:null,source:'fixture',fetchedAt:clock.now()/1000,windows:[{label,percentUsed,windowMinutes,resetsAt:clock.now()/1000+3600}]}),claude=Object.assign(new FakeProvider('claude'),{limits:async()=>quota('неделя',39,10080)}),codex=Object.assign(new FakeProvider('codex'),{limits:async()=>quota('5 ч',18,300)});
 const entry:CatalogEntry={id:'copilot',title:'GitHub Copilot',binary:'/fixture/copilot',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,resume:true,mcp:true,limits:true},version:async()=>'1.0',auth:async()=>({loggedIn:true,email:'fixture@example.test'}),models:async()=>[],runTurn:async()=>{turns++;throw Error('no model allowed')},limits:async()=>phase==='ok'?quota('month',25,31*1440):{ok:false,code:phase==='rate'?'limits_rate_limited':'limits_unavailable',reason:'fixture unavailable'}};
 const h=await fixture(t,{deps:{clock,providers:{claude,codex},providerCatalog:new ProviderCatalog([entry])}}),v=ui(async path=>path==='/api/spend?period=7'?{...snapshot(h.dir,'7'),byVendor:[{vendor:'copilot',turns:13}]}:(await call(h.api,path)).body);v.H.project=h.dir;await v.functions.limits();await v.find('.limits').emit('click');
 const refused=(await call(h.api,'/api/limits')).body;assert.equal(refused.ok,true);assert.equal(refused.providers.find((p:any)=>p.vendor==='copilot').ok,false);assert.equal(v.find('.limits').querySelectorAll('[role="meter"]').length,2);assert.match(v.find('[data-limit-vendor="copilot"]').textContent,/100 %—/);assert.equal(v.find('[data-limit-vendor="claude"] [role="meter"]').getAttribute('aria-valuenow'),'61');assert.equal(v.find('[data-limit-vendor="codex"] [role="meter"]').getAttribute('aria-valuenow'),'82');assert.doesNotMatch(v.find('.limits-dialog').textContent,/макет/);
 phase='ok';clock.advance(300000);await v.functions.limits();assert.match(v.find('[data-limit-vendor="copilot"]').textContent,/Copilot75 %M/);assert.match(v.find('.limits-dialog').textContent,/Copilot.*75 %.*месяц/s);assert.equal(v.find('.limits').querySelectorAll('[data-limit-vendor]').length,3);
 phase='rate';clock.advance(300000);await v.functions.limits();assert.match(v.find('.limits').textContent,/Copilot100 %—/);assert.doesNotMatch(v.find('.limits').textContent,/Программа просит повторить/);assert.match(v.find('.limits-dialog').textContent,/75 %|Программа просит повторить чтение лимитов позже/);assert.equal(turns,0);assert.equal(claude.calls.length+codex.calls.length,0);
});

test('215: weekly-only Codex shows credits in both cards and does not invent a five-hour sidebar row',async()=>{
 const v=ui(),stamp=Date.now()/1000,quota={ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'codex',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:21,windowMinutes:10080,resetsAt:stamp+7200}],credits:{hasCredits:true,unlimited:false,balance:62500},resetCredits:2}]};v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}}]}:p==='/api/limits'?quota:v.response(p);await v.functions.limits();await v.find('.limits').emit('click');assert.match(v.find('.limits').textContent,/Codex79 %W/);assert.doesNotMatch(v.find('.limits').textContent,/5 ч|кредиты/);for(const selector of ['[data-c="codex"]','.limits-dialog'])assert.equal(v.find(selector).querySelector('.sp-limit-credits')!.textContent.replace(/\s/g,' '),'кредиты: 62 500 · сбросов лимита в запасе: 2');
 v.functions.limitEvent({...quota,revision:2,providers:[{...quota.providers[0],credits:undefined,resetCredits:undefined}]});assert.equal(v.find('[data-c="codex"]').querySelector('.sp-limit-credits'),null);
});

test('214/215: Codex weekly-only quota shows credits in both cards; a failed refresh retains values and names the next attempt',async()=>{
 const v=ui(),stamp=Date.now()/1000,quota={ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'codex',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:21,windowMinutes:10080,resetsAt:stamp+7200}],credits:{hasCredits:true,unlimited:false,balance:62500},resetCredits:2}]};
 v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'codex',name:'Codex',kind:'подписка',auth:{loggedIn:true}}]}:p==='/api/limits'?quota:v.response(p);await v.functions.limits();await v.find('.limits').emit('click');
 assert.match(v.find('.limits').textContent,/Codex79 %W/);assert.doesNotMatch(v.find('.limits').textContent,/5 ч|кредиты/);for(const selector of ['[data-c="codex"]','.limits-dialog'])assert.equal(v.find(selector).querySelector('.sp-limit-credits')!.textContent.replace(/\s/g,' '),'кредиты: 62 500 · сбросов лимита в запасе: 2');
 v.functions.limitEvent({...quota,revision:2,providers:[{...quota.providers[0],status:'unavailable',reason:'сервис лимитов просит повторить позже',stale:true,nextAttemptAt:stamp+600}]});assert.match(v.find('.limits').textContent,/Codex100 %—/);assert.doesNotMatch(v.find('.limits').textContent,/устаревшие|просит повторить/);for(const selector of ['[data-c="codex"]','.limits-dialog']){assert.match(v.find(selector).textContent,/21 %|79 %/);assert.match(v.find(selector).textContent,/следующая попытка/);assert.match(v.find(selector).textContent,/просит повторить позже/)}
 v.functions.limitEvent({...quota,revision:3,providers:[{...quota.providers[0],credits:undefined,resetCredits:undefined}]});assert.equal(v.find('[data-c="codex"]').querySelector('.sp-limit-credits'),null);assert.equal(v.find('.limits-dialog').querySelector('.sp-limit-retry'),null);
});
// 204–207 replace the old 'no limit source = empty card' invariant, without inventing provider readings.
test('204/205/207: stable vendor slots, live quota graphics, unavailable fields and labelled samples',async()=>{
 const v=ui();await v.functions.fetch();const l=v.functions.limitState;
 l.providers=[{id:'codex',name:'Codex'},{id:'claude',name:'Claude'},{id:'router',name:'Router'}];
 l.limits=[{vendor:'claude',plan:'Max',sourceConnected:true,source:'test usage',fetchedAt:1791500000,windows:[{label:'неделя',percentUsed:28.5,resetsAt:1791600000},{label:'5 ч',percentUsed:12,resetsAt:1791550000}]},{vendor:'codex',sourceConnected:true,reason:'Подписка не отдаёт лимиты',windows:[]}];v.functions.draw();
 const claude=v.find('[data-c="claude"]'),codex=v.find('[data-c="codex"]'),qwen=v.find('[data-c="qwen"]');
 assert.equal(claude.dataset.vendor,'claude');assert.equal(codex.dataset.vendor,'codex');assert.equal(claude.querySelectorAll('[role="meter"]').length,2);assert.equal(claude.querySelector('[role="meter"]')!.getAttribute('aria-valuenow'),'28.5');assert.match(claude.textContent,/28,5 %/);assert.doesNotMatch(claude.textContent,/62,4\s*%/);
 assert.match(codex.textContent,/нет данных.*Подписка не отдаёт лимиты/s);assert.equal(codex.querySelector('[role="meter"]'),null);assert.doesNotMatch(codex.textContent,/94 %/);
 assert.equal(Reflect.get(qwen,'hidden'),true);assert.equal(qwen.textContent,'');assert.equal(v.document.querySelector('[data-spend-extra]'),null);assert.equal(v.find('.sp-gateway').dataset.spendRouter,'connected');
 for(const selector of ['claude','codex','hist','router','cal']){const card=v.find('[data-c="'+selector+'"]');assert.match(card.querySelector('.sp-state')!.textContent,/живое|частично|макет/);assert.doesNotMatch(card.textContent,/—/)}
});

test('204/206: router SVG uses actual turn shares, token fallback and exactly one bottom price link',async()=>{
 const v=ui();await v.functions.fetch();assert.equal(v.find('[data-c="router"] svg').querySelectorAll('path').length,1);assert.match(v.find('.sp-node').textContent,/w1.*100 %/s);assert.match(v.find('[data-c="hist"]').textContent,/5 ток\./);assert.doesNotMatch(v.find('#v-over').textContent,/без цены|прайс-лист/);
 const link=v.find('.views [data-spend-prices] a');assert.equal(link.textContent,'цены моделей (донастройка)');assert.equal(link.getAttribute('href'),'06-settings.html#p=priceList');assert.equal(v.document.querySelectorAll('a[href="06-settings.html#p=priceList"]').length,1);
 await v.find('[data-c="router"]').emit('click');assert.equal(v.document.querySelectorAll('a[href="06-settings.html#p=priceList"]').length,1);
 v.functions.state.history=[{...item(),cost:0.125,currency:'USD'}];v.functions.draw();assert.match(v.find('[data-c="hist"]').textContent,/0,125 USD/);
 v.functions.state.data.byModelVendor=[{...metrics(),model:'<img src=x>',vendor:null,p50DurationMs:null,p95DurationMs:null,errorRate:null}];v.functions.draw();assert.equal(v.document.querySelector('.sp-node img'),null);assert.match(v.find('[data-c="router"]').textContent,/нет данных/);
});

test('204/205: calendar retains 21 cells, uses daily counts and resets, marks payments as samples',async()=>{
 const v=ui();await v.functions.fetch();const today=new Date().toISOString().slice(0,10);v.functions.state.data.byDay=[{day:today,...metrics(7)}];v.functions.limitState.limits=[{vendor:'codex',windows:[{label:'5 ч',percentUsed:50,resetsAt:Date.now()/1000+1}]}];v.functions.draw();
 assert.equal(v.find('.sp-calendar').children.length,21);const cell=v.find('.sp-calendar [data-date="'+today+'"]');assert.match(cell.textContent,/7 ход/);assert.equal(cell.classList.contains('r'),true);assert.match(cell.getAttribute('title')!,/codex.*5 ч/s);assert.match(v.find('[data-c="cal"]').textContent,/Макет платежей/);
});

test('204: threshold and router policy samples remain visible but never mutate settings, from both surfaces',async()=>{
 const v=ui();await v.functions.fetch();const before=JSON.stringify(v.S),writes=v.requests.filter(p=>!p.startsWith('/api/spend')).length;
 for(const expanded of [false,true]){if(expanded)await v.find('[data-c="claude"]').emit('click');const root=expanded?'.panel':'[data-c="claude"]';assert.equal(v.find(root+' [role="switch"]').disabled,true);await v.find(root+' [role="switch"]').emit('click');}
 assert.equal(JSON.stringify(v.S),before);assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);assert.equal(v.requests.filter(p=>!p.startsWith('/api/spend')).length,writes);
});

test('209: third subscription slot requires a connected API provider with quota, never router or a fabricated Qwen',async()=>{
 const v=ui();await v.functions.fetch();const l=v.functions.limitState;l.providers=[{id:'router',name:'Роутер провайдеров',kind:'локальный роутер',auth:{loggedIn:true}}];v.functions.draw();assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),true);assert.doesNotMatch(v.find('#v-over').textContent,/Роутер провайдеров|Qwen|остаток API/);
 l.providers.push({id:'qwen',name:'Qwen',kind:'ключ API',auth:{loggedIn:true}});v.functions.draw();assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),true);
 l.limits=[{vendor:'qwen',sourceConnected:true,fetchedAt:Date.now()/1000,windows:[{label:'месяц',percentUsed:34,resetsAt:1791600000}]}];v.functions.draw();assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),false);assert.match(v.find('[data-c="qwen"]').textContent,/Qwen · ключ API/);assert.equal(v.find('[data-c="qwen"] [role="meter"]').getAttribute('aria-valuenow'),'34');
 l.providers=[];v.functions.draw();assert.equal(Reflect.get(v.find('[data-c="qwen"]'),'hidden'),true);
});

test('211/218: owner payment dates and quota preferences are live; stale billing replies cannot cross projects',async()=>{
 const v=ui(),today=new Date().toISOString().slice(0,10),config={subscriptionPrices:[],subscriptionDates:[{vendor:'claude',date:today,plan:null}],limitWarn80:false,limitSwitchCheaper:false};let old:any;
 const billing=()=>({ok:true,project:v.H.project,config:{...config},subscriptions:[],payments:[{vendor:'claude',date:today,plan:'Max',amount:123,currency:'USD',source:'owner'}]});
 v.context.api=async(path:string,body:any)=>path==='/api/billing'?billing():body?{ok:true,scope:'owner',saved:{...body.patch}}:v.response(path);await v.functions.fetch();
 const cell=v.find('.sp-calendar [data-date="'+today+'"]');assert.match(cell.getAttribute('title')!,/настройки владельца.*123 USD/);assert.doesNotMatch(v.find('[data-c="cal"]').textContent,/Макет платежей/);
 const flag=v.find('[data-spend-policy="limitWarn80"]');assert.equal(flag.disabled,false);await flag.emit('click');assert.equal(v.find('[data-spend-policy="limitWarn80"]').getAttribute('aria-checked'),'true');assert.match(v.toasts.at(-1)!,/действие движка пока не поддерживается/);
 const gate=deferred<any>();v.context.api=async(path:string)=>path==='/api/billing'?(old=billing(),gate.promise):v.response(path);const request=v.functions.fetch();await until(()=>!!old);v.H.project='/b';gate.resolve(old);await request;v.functions.draw();assert.doesNotMatch(v.find('[data-c="cal"]').innerHTML,/123 USD/);
});

test('210: window tokens span cursor pages independently of history filters; forecast is labelled and missing measurements stay explicit',async()=>{
 const v=ui(),now=Math.floor(Date.now()/1000),w={label:'5 ч',percentUsed:20,windowMinutes:300,resetsAt:now+9000};let reads=0;
 v.context.api=async(path:string)=>{if(path.startsWith('/api/spend/turns')){reads++;return {ok:true,project:v.H.project,period:'all',items:reads===1?[{...item('a'),ts:now-10},{...item('b'),ts:now-20,usage:{input:null,output:1,cacheRead:0}}]:[{...item('c'),ts:now-30},{...item('old'),ts:now-10000}],next:reads===1?'cursor':null}}return v.response(path)};
 v.functions.limitState.providers=[{id:'claude',name:'Claude',auth:{loggedIn:true}}];v.functions.limitState.limits=[{vendor:'claude',status:'ok',sourceConnected:true,windows:[w],fetchedAt:now}];v.functions.state.vendor='codex';await v.functions.windows();assert.equal(reads,2);assert.match(v.find('.top .st').textContent,/Claude 20 % 5 ч.*сброс через/);assert.match(v.find('[data-c="claude"]').textContent,/Наш проект за окно: 10 ток.*часть токенов не сохранена/);assert.match(v.find('[data-c="claude"]').textContent,/Оценка к сбросу ≈ 40/);
 const late=deferred<any>();v.context.api=async()=>late.promise;const pending=v.functions.windows(true);v.H.project='/projects/b';late.resolve({ok:true,project:'/projects/a',period:'all',items:[{...item(),ts:now}],next:null});await pending;v.functions.draw();assert.doesNotMatch(v.find('[data-c="claude"]').textContent,/Наш проект за окно: 10/);

});

test('216–218/TS-29: the whole compact button and keyboard open only real quota details; the detail link preserves the period',async()=>{
 const v=ui(),stamp=Date.now()/1000,w=(label:string,percentUsed:number,windowMinutes:number)=>({label,percentUsed,windowMinutes,resetsAt:stamp+3600});v.functions.state.period='90';
 const quota={ok:true,revision:1,project:v.H.project,updatedAt:stamp,providers:[{vendor:'claude',plan:'Max',status:'ok',sourceConnected:true,fetchedAt:stamp,source:'claude.ai /usage',windows:[w('5 ч',12,300),w('неделя',80,10080),w('неделя · Fable',95,10080)],extraUsageEnabled:false},{vendor:'codex',plan:'Pro',status:'ok',sourceConnected:true,fetchedAt:stamp,source:'Codex app-server',windows:[w('5 ч',95,300),w('неделя',30,10080)],credits:{hasCredits:true,unlimited:false,balance:62500},resetCredits:2}]};
 v.context.api=async(path:string)=>path==='/api/connections'?{ok:true,providers:quota.providers.map(p=>({id:p.vendor,name:p.vendor,kind:'подписка',auth:{loggedIn:true}}))}:path==='/api/limits'?quota:v.response(path);await v.functions.limits();const widget=v.find('.limits');
 assert.deepEqual(widget.querySelectorAll('[role="meter"]').map(n=>n.className),['ticks warn','ticks']);assert.equal(widget.querySelectorAll('.limit-note').length,0);assert.equal(widget.getAttribute('role'),'button');assert.equal(widget.querySelector('a'),null);assert.doesNotMatch(widget.textContent,/Fable|остальные|5 ч|данные за|подробнее/);
 for(const selector of ['.limits .cap','.limits .row','.limits [role="meter"]','.limits']){await v.find(selector).emit('click');const dialog=v.find('.limits-dialog');assert.equal(dialog.hasAttribute('open'),true);assert.equal(dialog.querySelectorAll('.sp-limit-window').length,4);assert.match(dialog.textContent,/Fable · неделя.*остальные · неделя.*5 ч/);assert.match(dialog.textContent,/Claude Max/);assert.match(dialog.textContent,/Codex Pro/);assert.match(dialog.textContent,/доплата: выкл/);assert.match(dialog.textContent,/claude.ai \/usage/);assert.match(dialog.textContent,/сброс через 1 ч 0 мин/);assert.equal(dialog.querySelectorAll('.sp-limit-window small').length,4);assert.match(dialog.querySelector('.sp-limit-credits')!.textContent.replace(/\s/g,' '),/62 500.*запасе: 2/);assert.equal(dialog.querySelector('a')!.getAttribute('href'),'05-spend.html?period=90');assert.doesNotMatch(dialog.textContent,/продление через/);await v.window.emit('keydown',{key:'Escape'});assert.equal(dialog.hasAttribute('open'),false)}
 await widget.emit('keydown',{key:'Enter'});assert.equal(v.find('.limits-dialog').hasAttribute('open'),true);await v.find('[data-spend-close]').emit('click');assert.equal(v.document.activeElement,widget);
 assert.equal(widget.querySelector('a'),null);await widget.emit('click');const link=v.find('.limits-dialog a');assert.equal(link.getAttribute('href'),'05-spend.html?period=90');const clicked=await link.emit('click');assert.equal(clicked.prevented,false);await v.find('[data-spend-close]').emit('click');
 await widget.emit('keydown',{key:' '});v.functions.limitEvent({...quota,revision:2,providers:quota.providers.map(p=>p.vendor==='claude'?{...p,extraUsageEnabled:true}:p)});assert.match(v.find('.limits-dialog').textContent,/доплата: вкл/);
 v.functions.limitEvent({...quota,revision:3,providers:quota.providers.map(p=>p.vendor==='claude'?{...p,extraUsageEnabled:null}:p)});assert.doesNotMatch(v.find('.limits-dialog').textContent,/доплата:/);assert.equal(v.writes.length,0);
});


for(const delivery of ['HTTP','SSE'])test('219/TS-29: quota '+delivery+' updates the open dialog and focus returns to the stable widget',async()=>{
 const v=ui(),stamp=Date.now()/1000;let revision=1;const quota=()=>({ok:true,project:v.H.project,revision,updatedAt:stamp,providers:[{vendor:'claude',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed:revision*20,windowMinutes:10080}]}]});
 v.context.api=async(path:string)=>path==='/api/limits'?quota():v.response(path);await v.functions.limits();const widget=v.find('.limits');await widget.emit('click');revision++;
 if(delivery==='HTTP')await v.functions.limits();else v.functions.limitEvent(quota());assert.equal(v.find('.limits'),widget);assert.equal(v.find('.limits-dialog').hasAttribute('open'),true);assert.match(v.find('.limits-dialog').textContent,/60 %/);
 await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);assert.equal(v.document.activeElement,widget);assert.equal(widget.isConnected,true);
 await widget.emit('click');revision++;v.functions.limitEvent(quota());await v.find('[data-spend-close]').emit('click');assert.equal(v.document.activeElement,widget);
});

for(const failure of ['missing','logged-out','quota-error','parser-reason'])test('286: HTTP → widget keeps measured Claude when Copilot fails: '+failure,async t=>{
 const clock=new FakeClock(),claude=Object.assign(new FakeProvider(),{limits:async():Promise<ProviderLimits>=>({ok:true,plan:null,source:'fixture',fetchedAt:clock.now()/1000,windows:[{label:'неделя',percentUsed:31,windowMinutes:10080,resetsAt:clock.now()/1000+5000}]})});
 const entry:CatalogEntry={id:'copilot',title:'GitHub Copilot',binary:'fake',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,mcp:true,resume:true,limits:true},version:async()=>'',auth:async()=>{if(failure==='missing')throw new ProviderError('no_binary','missing');return {loggedIn:failure!=='logged-out',email:'a@github.com'}},models:async()=>[],limits:async()=>({ok:false,code:'limits_unavailable',reason:failure==='parser-reason'?'Copilot не передал дату сброса квоты':'private response'}),runTurn:async()=>{throw Error('no model allowed')}};
 const h=await fixture(t,{deps:{clock,providers:{claude},providerCatalog:new ProviderCatalog([entry])}}),r=await call(h.api,'/api/limits');assert.equal(r.body.ok,true);assert.equal(r.body.providers.find((p:any)=>p.vendor==='claude').ok,true);const cp=r.body.providers.find((p:any)=>p.vendor==='copilot');assert.equal(cp.ok,false);assert.equal(cp.code,'limits_unavailable');assert.deepEqual(cp.windows,[]);
 // 299 replaces the old invariant that every CLI failure has one generic label.
 const expectedReason=failure==='parser-reason'?'Copilot не передал дату сброса квоты':failure==='quota-error'?'Лимиты программы временно недоступны':'Не удалось подтвердить вход для чтения лимитов';assert.equal(cp.reason,expectedReason);
 const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;v.context.PAGE='new';await v.functions.limits();assert.equal(v.find('.limits [data-limit-vendor="claude"] [role="meter"]').getAttribute('aria-valuenow'),'69');assert.doesNotMatch(v.find('.limits [data-limit-vendor="claude"]').textContent,/макет/);assert.equal(v.find('.limits').querySelector('[data-limit-vendor="copilot"]'),null);
 await v.find('.limits').emit('click');assert.doesNotMatch(v.find('.limits-dialog').textContent,/Copilot/);
 // The same envelope must work through SSE, including when all actual sources fail.
 const failed={...r.body,ok:false,revision:r.body.revision+100,providers:r.body.providers.map((p:any)=>({...p,ok:false,status:'unavailable',sourceConnected:true,windows:[],fetchedAt:null,code:'limits_unavailable',reason:'временно недоступно'}))};v.functions.limitEvent(failed);assert.match(v.find('.limits [data-limit-vendor="claude"]').textContent,/100 %—/);assert.equal(v.find('.limits [data-limit-vendor="claude"]').querySelector('[role="meter"]'),null);
 v.functions.limitEvent({...r.body,revision:failed.revision+1});assert.equal(v.find('.limits [data-limit-vendor="claude"] [role="meter"]').getAttribute('aria-valuenow'),'69');
});


test('319: Copilot process → HTTP → widget renders measured billing periods, excludes unlimited chat and invents no pace',async t=>{
 const cli=await copilotFixture(t,'billing-period'),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}}),r=await call(h.api,'/api/limits');
 const cp=r.body.providers.find((p:any)=>p.vendor==='copilot');assert.equal(cp.ok,true);assert.deepEqual(cp.windows.map((w:any)=>w.label),['месяц · премиум-запросы','месяц · дополнения']);assert.equal(cp.windows[0].percentUsed,25);
 const v=ui(async path=>path==='/api/spend?period=7'?{...snapshot(h.dir,'7'),byVendor:[{vendor:'copilot',turns:5}]}:(await call(h.api,path)).body);v.H.project=h.dir;v.context.PAGE='new';await v.functions.limits();const widget=v.find('.limits [data-limit-vendor="copilot"]');assert.equal(widget.querySelector('[role="meter"]')!.getAttribute('aria-valuenow'),'75');assert.doesNotMatch(widget.textContent,/нет данных|макет/);
 await v.find('.limits').emit('click');const card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(n=>n.textContent.includes('Copilot'))!;assert.ok(card);assert.match(card.textContent,/месяц · премиум-запросы/);assert.match(card.textContent,/месяц · дополнения/);assert.match(card.textContent,/сброс/);assert.doesNotMatch(card.textContent,/месяц · чат|нет данных|макет/);assert.equal(card.querySelectorAll('[role="meter"]').length,2);
 // Another provider may have a known duration and loaded turns; Copilot still cannot infer its own period start.
 v.context.PAGE='spend';const quota={...r.body,revision:r.body.revision+1,providers:[...r.body.providers.filter((p:any)=>p.vendor!=='claude'),{vendor:'claude',ok:true,sourceConnected:true,fetchedAt:Date.now()/1000,windows:[{label:'неделя',percentUsed:31,windowMinutes:10080,resetsAt:Date.now()/1000+3600}]}]};v.functions.limitEvent(quota);await v.functions.windows();
 const unknown={label:'месяц · премиум-запросы',percentUsed:25,resetsAt:Date.now()/1000+3600,windowMinutes:null};const usage=v.context.spWindowUsage(unknown,'copilot',false);assert.doesNotMatch(usage,/Наш проект за окно|Оценка к сбросу ≈|NaN|Infinity/);assert.match(usage,/недостаточно данных/);assert.equal(cli.capture().some(c=>c.turn),false);
});

for(const delivery of ['HTTP','SSE'])test('325: Copilot process → HTTP → '+delivery+' clears old percentages on confirmed unlimited, including the open detail card',async t=>{
 const clock=new FakeClock(),cli=await copilotFixture(t),h=await fixture(t,{deps:{clock,providerCatalog:new ProviderCatalog([cli.entry])}});
 const v=ui(async path=>path==='/api/spend?period=7'?{...snapshot(h.dir,'7'),byVendor:[{vendor:'copilot',turns:5}]}:(await call(h.api,path)).body);v.H.project=h.dir;v.context.PAGE='new';await v.functions.limits();await v.find('.limits').emit('click');
 assert.equal(v.find('[data-limit-vendor="copilot"] [role="meter"]').getAttribute('aria-valuenow'),'75');
 writeFileSync(cli.quotaFile,JSON.stringify({quotaSnapshots:{chat:{entitlementRequests:0},completions:{entitlementRequests:100,unlimited:true},premium_interactions:{entitlementRequests:0}}}));clock.advance(300000);
 const changed=(await call(h.api,'/api/limits')).body,cp=changed.providers.find((p:any)=>p.vendor==='copilot');assert.equal(changed.ok,true);assert.equal(cp.ok,true);assert.equal(cp.code,'limits_unlimited');assert.equal(cp.reason,'все квоты Copilot безлимитны');assert.equal(cp.unlimited,true);assert.deepEqual(cp.windows,[]);assert.equal(cp.stale,false);
 const trace=(await h.runtime.project.trace.read()).filter(e=>e.kind==='provider.limits'&&record(e.data)&&e.data.code==='limits_unlimited');assert.equal(trace.length,1);assert.equal(trace[0]!.outcome,'ok');assert.ok(record(trace[0]!.data));assert.equal(trace[0]!.data.reason,cp.reason);assert.doesNotMatch(JSON.stringify(trace),/alice|quotaSnapshots|entitlementRequests|FAKE-SECRET/);
 if(delivery==='HTTP')await v.functions.limits();else v.functions.limitEvent(changed);
 const check=()=>{const widget=v.find('[data-limit-vendor="copilot"]'),card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(n=>n.textContent.includes('Copilot'))!;assert.match(widget.textContent,/100 %—/);assert.doesNotMatch(widget.textContent,/безлимит|нет данных|макет/);assert.match(card.textContent,/лимит программой не отдаётся · считаем 100 %/);assert.equal(widget.querySelector('[role="meter"]'),null)};check();
 // The same renderer is used by program cards on Connections and the Spend overview.
 assert.match(v.context.spLimitHTML({id:'copilot'},true),/безлимит/);assert.match(v.context.spProvider({id:'copilot',name:'Copilot'}),/безлимит/);
 writeFileSync(cli.quotaFile,JSON.stringify({quotaSnapshots:{premium_interactions:{entitlementRequests:300,remainingPercentage:75}}}));clock.advance(300000);
 const failed=(await call(h.api,'/api/limits')).body;assert.equal(failed.providers.find((p:any)=>p.vendor==='copilot').code,'limits_unavailable');v.functions.limitEvent(failed);assert.match(v.find('[data-limit-vendor="copilot"]').textContent,/100 %—/);assert.match(v.find('.limits-dialog').textContent,/Copilot не передал дату сброса квоты|устаревшие данные/);
 writeFileSync(cli.quotaFile,JSON.stringify({quotaSnapshots:{premium_interactions:{entitlementRequests:300,usedRequests:120,resetDate:'2027-02-15T17:12:00+03:00'}}}));clock.advance(300000);await v.functions.limits();assert.equal(v.find('[data-limit-vendor="copilot"] [role="meter"]').getAttribute('aria-valuenow'),'60');assert.doesNotMatch(v.find('[data-limit-vendor="copilot"]').textContent,/безлимит/);assert.equal(cli.capture().some(c=>c.turn),false);
});

for(const delivery of ['HTTP','SSE'])test('367: '+delivery+' keeps Copilot percentage and age through alternating login failures and recovery',async t=>{
 const clock=new FakeClock();clock.time=Date.now();let fail=false,authReads=0,quotaReads=0;
 const entry:CatalogEntry={id:'copilot',title:'GitHub Copilot',binary:'fake',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,resume:true,mcp:true,limits:true},version:async()=>'1.0',auth:async()=>{authReads++;if(fail)throw new ProviderError('transport_lost','private login failure');return {loggedIn:true,email:'fixture@example.test'}},models:async()=>[],runTurn:async()=>{throw Error('no model allowed')},limits:async()=>{quotaReads++;return {ok:true,plan:null,source:'Copilot CLI',fetchedAt:clock.now()/1000,windows:[{label:'month',percentUsed:quotaReads===1?25:40,windowMinutes:null,resetsAt:clock.now()/1000+86400}]}}};
 const h=await fixture(t,{deps:{clock,providerCatalog:new ProviderCatalog([entry])}}),v=ui(async path=>path==='/api/spend?period=7'?{...snapshot(h.dir,'7'),byVendor:[{vendor:'copilot',turns:5}]}:(await call(h.api,path)).body);v.H.project=h.dir;v.context.Date=class extends Date {static now(){return clock.now()}};
 await v.functions.limits();await v.find('.limits').emit('click');const measured=h.runtime.limitsSnapshot().providers.find(p=>p.vendor==='copilot')!;
 const initialAuthReads=authReads;fail=true;await Promise.all(Array.from({length:8},()=>call(h.api,'/api/limits')));assert.equal(authReads,initialAuthReads);assert.equal(quotaReads,1);
 clock.advance(300000);if(delivery==='HTTP')await v.functions.limits();else v.functions.limitEvent((await call(h.api,'/api/limits')).body);
 const stale=h.runtime.limitsSnapshot().providers.find(p=>p.vendor==='copilot')!;assert.equal(stale.fetchedAt,measured.fetchedAt);assert.equal(stale.windows[0]!.percentUsed,25);assert.equal(stale.stale,true);assert.equal(stale.ok,false);assert.equal(authReads,initialAuthReads+1);
 assert.match(v.find('[data-limit-vendor="copilot"]').textContent,/100 %—/);assert.doesNotMatch(v.find('[data-limit-vendor="copilot"]').textContent,/обновлено|Не удалось/);const card=v.find('.limits-dialog').querySelectorAll('.sp-limit').find(n=>n.textContent.includes('Copilot'))!;assert.match(card.textContent,/75 %/);assert.match(card.textContent,/обновлено 5 мин назад/);assert.match(card.textContent,/Не удалось подтвердить вход для чтения лимитов/);assert.doesNotMatch(card.textContent,/макет|private login failure/);
 await Promise.all(Array.from({length:6},()=>call(h.api,'/api/limits')));assert.equal(authReads,initialAuthReads+1);assert.equal(quotaReads,1);
 fail=false;clock.advance(300000);await v.functions.limits();assert.equal(authReads,initialAuthReads+2);assert.equal(quotaReads,2);assert.equal(v.find('[data-limit-vendor="copilot"] [role="meter"]').getAttribute('aria-valuenow'),'60');assert.doesNotMatch(v.find('[data-limit-vendor="copilot"]').textContent,/Не удалось|обновлено|нет данных/);
});
