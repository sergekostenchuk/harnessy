import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,OWNER} from './test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8'),live=read('ui/deploy/live.js'),raw=read('ui/sketches/disarto/05-spend.html');
const part=(source:string,start:string,end:string)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b)};
const metrics=(turns=1)=>({turns,input:2,output:3,cacheRead:0,durationMs:10,averageDurationMs:10,durationSamples:1,outcomes:{ok:turns,interrupted:0,error:0,unknown:0},missingMeasurements:0});
const snapshot=(project='/projects/a',period='all')=>({ok:true,project,period,since:null,generatedAt:1791500000.125,source:'chats.json',totals:metrics(),byPane:[{pane:'worker',label:'воркер',...metrics()}],byChat:[{chat:'c1',pane:'worker',title:'Чат',...metrics()}],byModel:[{model:'w1',...metrics()}],transferred:1,unknownOrigin:2,undated:0,cost:null,costReason:'нет прайс-листа и чтения квот'});
function ui(fetch?:(path:string)=>Promise<any>,on=true){
 const d=dom(part(raw,'<body>','<script src=')),requests:string[]=[],blobs:Blob[]=[],downloaded:string[]=[],logs:any[]=[],writes:any[]=[],toasts:string[]=[];
 Object.assign(d.document,{documentElement:d.html,body:d.body});const H={on,project:'/projects/a'},S:any={spend:{policy:1,cap:'80',revOpus:1},ui:{}};
 const context:any={H,S,PAGE:'spend',document:d.document,location:{href:''},hooks:[],save(){writes.push('state')},log(...v:any[]){logs.push(v)},toast:(s:string)=>toasts.push(s),now:()=>1,hhmm:()=>'',resolve(){throw Error('fake decision')},esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),base:(s:string)=>s.split('/').pop(),fmtN:(n:any)=>n==null?'—':String(n),
  api:async(path:string)=>{requests.push(path);return fetch?fetch(path):snapshot(H.project,new URL('http://test'+path).searchParams.get('period')??'all')},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{fn();return 1},requestAnimationFrame:(fn:()=>void)=>fn(),Blob,
  URL:{createObjectURL(blob:Blob){blobs.push(blob);return 'blob:test'},revokeObjectURL(){}},localStorage:{setItem(...v:any[]){writes.push(v)},getItem:()=>null}};
 const create=d.document.createElement.bind(d.document);d.document.createElement=(tag:string)=>{const n:any=create(tag);if(tag==='a')n.click=()=>downloaded.push(n.download);return n};context.window=context;
 const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(part(raw,'<script>','</script>').slice('<script>'.length),vm);
 runInContext(part(live,'  const statics=','  // ══ ПЛАН:')+part(live,'  // TS-10: one owner for real spend','  // ══ ПОДКЛЮЧЕНИЯ')+'\nglobalThis.testing={fetch:spendFetch,draw:spendDraw,csv:spendCsv,state:SP};restoreUI();',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 return {...d,H,S,context,requests,blobs,downloaded,logs,writes,toasts,find,functions:context.testing};
}

test('113/114/123: shipped Spend/HX/live handlers show only real HTTP data, with one click and one CSV',async t=>{
 const h=await fixture(t);await h.runtime.runTurn('worker','question');const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;await v.functions.fetch();
 assert.equal(v.requests.length,1);assert.equal(v.document.querySelectorAll('[data-c], [data-pj], [data-rs], [data-es], [data-pol], [data-spend-demo]').length,0);assert.doesNotMatch(v.find('.main').textContent,/62,4|94 %|19:58|OMG|Sonnet 35 %|порог 80/);assert.match(v.find('.main').textContent,/данных нет: движок отдаёт только историю ходов/);assert.match(v.find('.main').textContent,/chats.json/);
 assert.equal(v.functions.state.data.totals.turns,1);assert.equal(v.functions.state.data.totals.input,20);assert.equal(v.find('.view').style.overflow,'auto');
 await v.find('[data-spend-period="7"]').emit('click');assert.deepEqual(v.requests,['/api/spend?period=all','/api/spend?period=7']);assert.equal(v.functions.state.data.period,'7');
 await v.find('[data-spend-group="byModel"]').emit('click');assert.equal(v.requests.length,2);assert.match(v.find('.tbl').textContent,/w1/);
 // Display tampering cannot become exported measurement data.
 v.find('.tbl tbody tr td').textContent='forged 999999 tokens';await v.find('[data-spend-csv]').emit('click');assert.equal(v.blobs.length,1);assert.deepEqual(v.downloaded,['harnessy-spend-7.csv']);const csv=await v.blobs[0]!.text();assert.match(csv,/"source";"chats.json"/);assert.match(csv,/"byChat";"c[0-9a-f]+"/);assert.doesNotMatch(csv,/forged|999999|62,4|94 %/);assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);
 await v.find('[data-spend-refresh]').emit('click');assert.equal(v.requests.length,3);
});

test('113/123: offline page is marked as a mock; a preopened fake card closes on connection and cannot act',async()=>{
 const v=ui(undefined,false);assert.match(v.find('.views').textContent,/макет/);await v.find('[data-c="claude"]').emit('click');assert.equal(v.find('.ovl').classList.contains('on'),true);const before=JSON.stringify(v.S),toggle=v.find('.panel .tog');
 v.H.on=true;await toggle.emit('click');assert.equal(JSON.stringify(v.S),before);assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);assert.equal(toggle.classList.contains('on'),true);
 await v.functions.fetch();assert.equal(v.find('.ovl').classList.contains('on'),false);assert.equal(v.document.querySelectorAll('.views [data-spend-demo]').length,0);assert.equal(v.logs.length,0);
});

test('114/126: a failed period read keeps the previous snapshot and labels its actual period and freshness',async()=>{
 let fail=false;const v=ui(async path=>fail?{ok:false,code:'spend_unreadable',error:'chats.json не читается: damaged'}:snapshot(v.H.project,new URL('http://test'+path).searchParams.get('period')??'all'));
 await v.functions.fetch();const kept=v.functions.state.data;fail=true;await v.find('[data-spend-period="30"]').emit('click');assert.equal(v.functions.state.data,kept);assert.match(v.find('.main').textContent,/chats.json не читается: damaged · показан прежний снимок за период all/);assert.match(v.find('.main').textContent,/период all · снимок/);assert.equal(v.functions.state.error,'chats.json не читается: damaged');assert.ok(v.functions.csv().includes('"period";"all"'));
});

test('114/126 ОКНА: project A → B → A and period changes ignore late responses, including equal project names',async()=>{
 const gates=[deferred<any>(),deferred<any>(),deferred<any>()];let i=0;const v=ui(()=>gates[i++]!.promise);
 const first=v.functions.fetch();v.H.project='/projects/b';const second=v.functions.fetch();v.H.project='/projects/a';v.functions.state.period='7';const third=v.functions.fetch();assert.equal(v.functions.state.data,null);
 gates[2]!.resolve(snapshot('/projects/a','7'));assert.equal(await third,true);const kept=v.functions.state.data;
 gates[0]!.resolve(snapshot('/projects/a','all'));gates[1]!.resolve(snapshot('/projects/b','all'));assert.equal(await first,false);assert.equal(await second,false);assert.equal(v.functions.state.data,kept);assert.doesNotMatch(v.find('.main').textContent,/период all/);
 const late=deferred<any>();v.context.api=async()=>late.promise;const pending=v.functions.fetch();await v.window.emit('pagehide');late.resolve(snapshot('/projects/a','7'));assert.equal(await pending,false);assert.equal(v.functions.state.data,kept);
});

for(const bad of [{ok:true},snapshot('/other'),snapshot('/projects/a','30'),{...snapshot(),source:'invented'}])test('114/126 ОТСУТСТВИЕ/МАСКАРАД: wrong spend response cannot replace or invent a snapshot '+JSON.stringify(Object.keys(bad)),async()=>{
 const v=ui(async()=>bad);assert.equal(await v.functions.fetch(),false);assert.equal(v.functions.state.data,null);assert.equal(v.functions.csv(),null);assert.match(v.find('.main').textContent,/ответ аналитики не соответствует проекту и периоду/);
});

test('113/123: CSV keeps chat IDs, per-group measurements, quotes and newlines; labels cannot execute as spreadsheet formulas',async()=>{
 const data=snapshot();data.byChat[0]!.title='=SUM(1;2)\n"label"';data.byChat[0]!.chat='c-unique';const v=ui(async()=>data);await v.functions.fetch();const csv=v.functions.csv();assert.match(csv,/"byChat";"c-unique";"'=SUM\(1;2\)\n""label"""/);assert.match(csv,/"byPane";"worker";"воркер"/);assert.match(csv,/"byModel";"w1";"w1"/);assert.match(csv,/"costReason"/);assert.doesNotMatch(csv,/94 %|Sonnet/);
});
