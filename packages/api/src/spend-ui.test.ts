import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
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
  refreshStatus:async()=>{},api:async(path:string,body?:any)=>{requests.push(path);return fetch?fetch(path,body):response(path)},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{fn();return 1},requestAnimationFrame:(fn:()=>void)=>fn(),Blob,URLSearchParams,
  URL:{createObjectURL(blob:Blob){blobs.push(blob);return 'blob:test'},revokeObjectURL(){}},localStorage:{setItem(...v:any[]){writes.push(v)},getItem:()=>null}};
 const create=d.document.createElement.bind(d.document);d.document.createElement=(tag:string)=>{const n:any=create(tag);if(tag==='a')n.click=()=>downloaded.push(n.download);return n};context.window=context;
 const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(part(raw,'<script>','</script>').slice('<script>'.length),vm);
 runInContext(part(live,'  function closeLAMenus(','  // запись «контекст передан»')+part(live,'  const statics=','  // ══ ПЛАН:')+part(live,'  // TS-14b: spend blocks','  // ══ ПОДКЛЮЧЕНИЯ')+'\nglobalThis.testing={fetch:spendFetch,draw:spendDraw,csv:spendCsv,state:SP,limits:limitsFetch,limitState:LIM,limitDraw:limitsDraw,limitEvent:limitsEvent,history:spendHistory};restoreUI();',vm);
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

test('177/198–203: top three connected subscriptions keep sketch meters; all windows show dated values or marked samples',async()=>{
 const v=ui();v.functions.state.period='30';const paths:string[]=[];v.context.api=async(p:string)=>{paths.push(p);return p==='/api/connections'?{ok:true,providers:['claude','codex','router','four','off'].map(id=>({id,name:id,auth:{loggedIn:id!=='off'}}))}:p==='/api/limits'?{ok:true,project:v.H.project,updatedAt:1,providers:[{vendor:'codex',source:'event',stale:true,windows:[{label:'5-hour',percentUsed:25,resetsAt:200},{label:'weekly',percentUsed:50}]}]}:{...snapshot('/projects/a','7'),byVendor:[{vendor:'codex',turns:10},{vendor:'four',turns:7},{vendor:'router',turns:4},{vendor:'claude',turns:1}]}};
 await v.functions.limits();assert.ok(paths.includes('/api/spend?period=7'));const widget=v.find('.limits');assert.equal(widget.hasAttribute('data-go'),false);assert.doesNotMatch(widget.textContent,/claude|off/);assert.match(widget.textContent,/codex/);assert.match(widget.textContent,/остаток 75 %/);assert.match(widget.textContent,/устаревшие/);assert.equal(widget.querySelectorAll('.sp-limit').length,3);assert.equal(widget.querySelector('a')!.getAttribute('href'),'05-spend.html?period=30');
 await v.find('[data-spend-limits]').emit('click');assert.equal(v.find('.limits-dialog').querySelectorAll('.sp-limit').length,4);assert.match(v.find('.limits-dialog').textContent,/weekly|5-hour/);assert.match(v.find('.limits-dialog').textContent,/макет/);assert.doesNotMatch(v.find('.limits-dialog').textContent,/нет данных|—/);assert.ok(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length>=4);assert.equal(v.find('.limits-dialog a').getAttribute('href'),'05-spend.html?period=30');
});

test('175/178: history paginates with deduplication; late filter response cannot replace new filter; escape prevents reopening',async()=>{
 const v=ui();await v.functions.fetch();v.functions.state.next='cursor';v.functions.draw();v.context.api=async()=>({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item(),item('t2')],next:null});await v.find('[data-spend-more]').emit('click');assert.equal(v.functions.state.history.length,2);
 await v.find('[data-c="hist"]').emit('click');const gate=deferred<any>();v.context.api=()=>gate.promise;v.functions.state.next='more';const pending=v.functions.history(true);await v.window.emit('keydown',{key:'Escape'});gate.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('t3')],next:null});await pending;assert.equal(v.find('.ovl').classList.contains('on'),false);
 const old=deferred<any>();v.context.api=(p:string)=>p.includes('vendor=codex')?Promise.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[],next:null}):old.promise;const filter=v.find('[data-spend-vendor]');filter.value='claude';const first=filter.emit('change');const next=v.find('[data-spend-vendor]');next.value='codex';await next.emit('change');old.resolve({ok:true,project:v.H.project,period:'all',source:'chats.json',items:[item('stale')],next:null});await first;assert.equal(v.functions.state.history.length,0);assert.equal(v.functions.state.historyLoading,false);
});

test('177: late quota reads cannot restore a previous project or a hidden page',async()=>{
 const v=ui(),old=deferred<any>(),connections={ok:true,providers:[{id:'claude',name:'Claude',auth:{loggedIn:true}}]};
 v.context.api=()=>old.promise;const first=v.functions.limits();v.H.project='/projects/b';v.context.api=async(p:string)=>p==='/api/connections'?connections:p==='/api/limits'?{ok:true,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'test',windows:[{label:'weekly',percentUsed:20}]}]}:snapshot('/projects/b','7');await v.functions.limits();
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
 const v=ui(undefined,false);v.functions.limitDraw();const widget=v.find('.limits');assert.equal(widget.querySelectorAll('.sp-limit').length,3);assert.equal(widget.querySelectorAll('[role="meter"]').length,3);assert.match(widget.textContent,/62,4|62.4/);assert.match(widget.textContent,/94 %/);assert.match(widget.textContent,/\$41,20/);assert.match(widget.textContent,/макет/);assert.doesNotMatch(widget.textContent,/нет данных|—/);
 await v.find('[data-spend-limits]').emit('click');assert.ok(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length>=5);await v.find('[data-spend-close]').emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);
});
test('203: failed quota refresh keeps the last real value dated; foreign response cannot impersonate current project',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'Claude usage',fetchedAt:Date.now()/1000,windows:[{label:'неделя',percentUsed:0,resetsAt:Date.now()/1000+60}]}]}:v.response(p);
 await v.functions.limits();assert.match(v.find('.limits').textContent,/остаток 100 %/);assert.doesNotMatch(v.find('.limits').textContent,/макет/);
 v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,project:'/foreign',updatedAt:Date.now()/1000,providers:[{vendor:'claude',source:'forged',windows:[{label:'неделя',percentUsed:99}]}]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/остаток 100 %/);assert.match(v.find('.limits').textContent,/устаревшие данные/);assert.doesNotMatch(v.find('.limits').textContent,/forged|99 %/);
});

test('202/203: an attached source without its monthly quota is a fact, excluded from top three and never replaced with sample money',async()=>{
 const v=ui();v.context.api=async(p:string)=>p==='/api/connections'?{ok:true,providers:[{id:'kimi',name:'Kimi',kind:'подписка',auth:{loggedIn:true}},{id:'claude',name:'Claude',auth:{loggedIn:true}}]}:p==='/api/limits'?{ok:true,project:v.H.project,updatedAt:Date.now()/1000,providers:[{vendor:'kimi',sourceConnected:true,source:'Kimi',windows:[],reason:'месячный лимит провайдер не отдаёт'}]}:snapshot(v.H.project,'7');
 await v.functions.limits();assert.doesNotMatch(v.find('.limits').textContent,/Kimi/);await v.find('[data-spend-limits]').emit('click');const cards=v.find('.limits-dialog').querySelectorAll('.sp-limit'),kimi=cards.find(c=>c.textContent.includes('Kimi'))!;assert.ok(kimi);assert.match(kimi.textContent,/месячный лимит провайдер не отдаёт/);assert.doesNotMatch(kimi.textContent,/макет|34|41,20/);assert.equal(kimi.querySelectorAll('[role="meter"]').length,0);
});

test('146: sidebar details also open outside Spend without HX, close on Escape and restore focus',async()=>{
 const v=ui();v.context.PAGE='new';delete v.context.HX;await v.functions.limits();const opener=v.find('[data-spend-limits]');await opener.emit('click');assert.equal(v.find('.limits-dialog').hasAttribute('open'),true);assert.ok(v.find('.limits-dialog').querySelectorAll('[role="meter"]').length>=2);await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('.limits-dialog').hasAttribute('open'),false);assert.equal(v.document.activeElement,opener);
});

test('200/473: plan and all three Claude windows appear with a countdown, and a connection-read failure keeps the last snapshot',async()=>{
 const v=ui(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?{ok:true,project:v.H.project,updatedAt:now,providers:[{vendor:'claude',plan:'Max',fetchedAt:now,status:'ok',sourceConnected:true,source:'claude.ai /usage',windows:[{label:'5 ч',percentUsed:21,windowMinutes:300,resetsAt:now+3120},{label:'неделя',percentUsed:21,windowMinutes:10080,resetsAt:now+100000},{label:'неделя · Sonnet',percentUsed:32,windowMinutes:10080,resetsAt:now+100000}]}]}:v.response(p);await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude · Max/);await v.find('[data-spend-limits]').emit('click');const detail=v.find('.limits-dialog');assert.equal(detail.querySelectorAll('[role="meter"]').length,3);assert.match(detail.textContent,/сброс через 52 мин/);assert.match(detail.textContent,/Sonnet/);
 v.context.api=async()=>{throw Error('connection down')};await v.functions.limits();assert.match(v.find('.limits').textContent,/Claude · Max/);assert.match(v.find('.limits').textContent,/устаревшие данные/);
});

test('200: an older in-flight HTTP result cannot overwrite a newer quota event',async()=>{
 const v=ui(),pending=deferred<any>(),now=Date.now()/1000;v.context.api=async(p:string)=>p==='/api/limits'?pending.promise:v.response(p);const reading=v.functions.limits();const quota=(stamp:number,percentUsed:number)=>({ok:true,project:v.H.project,updatedAt:stamp,providers:[{vendor:'claude',plan:'Max',status:'ok',sourceConnected:true,fetchedAt:stamp,windows:[{label:'неделя',percentUsed,windowMinutes:10080,resetsAt:now+3600}]}]});v.functions.limitEvent(quota(now,30));pending.resolve(quota(now-60,10));await reading;assert.match(v.find('.limits').textContent,/остаток 70 %/);assert.doesNotMatch(v.find('.limits').textContent,/остаток 90 %/);
});
