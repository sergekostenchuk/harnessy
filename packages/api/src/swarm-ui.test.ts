import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8'),live=read('ui/deploy/live.js'),proto=read('ui/deploy/proto.js'),raw=read('ui/sketches/disarto/04-swarm.html');
const part=(s:string,a:string,b:string)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end)};
const record=(seq=1)=>({seq,ts:'2026-10-11T12:00:00Z',from:'owner',to:['worker'],kind:'task',thread:'current',text:'actual task '+seq});
const pane=(id='worker')=>({id,label:id==='worker'?'Воркер':'Ревьюер',role:'worker',vendor:'claude',model:'fixture-model',mode:'read',cwd:'/a',status:'idle',busy:false,pendingApprovals:0,pending:0,queue:[],waiting:null,turn:null,writePaths:[],context:{used:170,window:200000,pct:0.1,measured:true,last:{input:100,output:20,cacheRead:50},turns:1}});
const snapshot=(project='/a',panes:any[]=[pane()])=>({ok:true,project,generatedAt:1791712800000,halted:false,team:{path:project+'/.harness/team.yaml',integrationBranch:'main'},journal:{records:[record()],total:1,lastSeq:1},panes});
function ui(fetch?:(path:string)=>Promise<any>){
 const d=dom(part(raw,'<body>','</body>'));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','swarm');
 const H:any={on:true,snapshotOnly:false,project:'/a',panes:[pane(),{id:'room',kind:null}],active:{worker:'chat1'},projectRequestGeneration:0,confirmedProjectGeneration:0},requests:string[]=[],streams:any[]=[],opened:any[]=[],sheets:string[]=[];
 const context:any={H,PAGE:'swarm',KEY:'swarm',document:d.document,location:{href:''},modelName:(x:string)=>x,toast(){},openChatRow:(chat:string,id:string)=>{opened.push({chat,id})},HX:{open:(_anchor:any,html:string)=>sheets.push(html)},
  esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:async(path:string)=>{requests.push(path);return fetch?fetch(path):path==='/api/swarm'?snapshot(H.project):{ok:true,project:H.project,proposals:[]}},refreshStatus:async()=>true,
  addEventListener:d.window.addEventListener.bind(d.window),EventSource:class{onmessage:any;onopen:any;onerror:any;closed=false;constructor(){streams.push(this)}close(){this.closed=true}}};context.window=context;
 const vm=createContext(context);runInContext(part(proto,'  // TS-15a specification','  // End TS-15a specification'),vm);
 // The sketch keeps its own handlers only on the reference page, never alongside the live controller.
 for(const script of raw.matchAll(/<script>([\s\S]*?)<\/script>/g))runInContext(script[1]!,vm);
 runInContext(part(live,'  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part(live,'  const TEAM_KINDS=','  function proposalsDraw(')+part(live,'  // TS-15b: project-bound','  // End TS-15b swarm.')+'\nglobalThis.testing={state:SWARM,sync:swarmSync,fetch:swarmFetch,refresh:swarmRefresh,reset:swarmReset,draw:swarmDraw};',vm);
 const find=(selector:string)=>{const node=d.document.querySelector(selector);assert.ok(node,selector);return node};
 const switchProject=(project:string)=>{H.project=project;H.confirmedProjectGeneration++;return context.testing.sync()};
 return {...d,H,context,requests,streams,opened,sheets,find,switchProject,functions:context.testing};
}

test('308: the place card displays the selected mode note as text and clears it for other modes',async()=>{
 const p={...pane(),vendor:'agy',mode:'all'},v=ui(async path=>path==='/api/swarm'?snapshot('/a',[p]):{ok:true,project:'/a',proposals:[]});
 v.H.turnModes={agy:{all:{ok:true,note:'без инструментов Harnessy <img src=x>'},read:{ok:false,reason:'нет изоляции'}}};await v.functions.sync();await v.find('#board [data-swarm-seat]').emit('click');
 assert.match(v.find('#a-sub').textContent,/без инструментов Harnessy <img src=x>/);assert.equal(v.document.querySelector('#a-sub img'),null);
 p.mode='read';await v.functions.fetch();assert.doesNotMatch(v.find('#a-sub').textContent,/без инструментов Harnessy/);
});

test('166: original canvas, cards, channel, composition and comparison survive real data; all seat views open one live card',async t=>{
 const h=await fixture(t),queued=h.runtime.journal.append({sender:'owner',to:'worker',kind:'task',text:'actual <img src=x> goal',thread:'current'});
 const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;const blocks=['#board','#board .waits','#v-cards .over','#v-chan .chan','#v-chan .msgs','#v-seats .lst','#v-cmp .lst'].map(s=>v.find(s));await v.functions.sync();
 for(const node of blocks)assert.equal(v.find('.main').contains(node),true);assert.equal(v.document.querySelectorAll('#board [data-swarm-seat]').length,1);assert.match(v.find('#topst').textContent,/1 мест.*1 в очереди/);
 assert.match(v.find('#v-chan .msgs').textContent,/actual <img src=x> goal/);assert.equal(v.document.querySelector('#v-chan .msgs img'),null);assert.match(v.find('#v-chan .chan').textContent,new RegExp('№'+queued.seq));assert.equal(v.document.querySelectorAll('#board svg path').length,1);
 for(const [view,selector] of [['board','#board [data-swarm-seat]'],['cards','#v-cards [data-swarm-seat]'],['seats','#v-seats [data-swarm-seat]']]){
  await v.find('#seg [data-v="'+view+'"]').emit('click');assert.equal(v.find('#v-'+view).classList.contains('on'),true);await v.find(selector!).emit('click');assert.equal(v.find('#ovl').classList.contains('on'),true);assert.match(v.find('#a-h').textContent,/воркер/i);assert.match(v.find('#a-goal').textContent,/actual <img src=x> goal/);assert.equal(v.document.querySelector('#ovl img'),null);await v.find('#x').emit('click');assert.equal(v.find('#ovl').classList.contains('on'),false);
 }
 await v.find('#v-cards [data-swarm-seat]').emit('click');await v.find('[data-swarm-write]').emit('click');assert.equal(v.opened.length,1);assert.equal(v.opened[0].id,'worker');assert.equal(h.provider.calls.length,0);
 await v.find('#seg [data-v="cmp"]').emit('click');assert.match(v.find('#v-cmp').textContent,/Макет.*A\/B/);assert.match(v.find('#v-cmp').textContent,/Fable 5.1/);await v.find('#ab').emit('click');assert.match(v.sheets[0]!,/Макет.*сравнение/);assert.match(v.sheets[0]!,/disabled/);assert.match(v.find('#board .waits').textContent,/Макет.*цену простоя/);
});

test('TS-51.D: a real partial context with null counters remains visible in the team',async t=>{
 const h=await fixture(t);h.runtime.registry.get('worker')!.tokens={input:17,output:null,cacheRead:null};
 const card=await call(h.api,'/api/context/worker');assert.equal(card.status,200);assert.equal(card.body.measured,false);assert.deepEqual(card.body.last,{input:17,output:null,cacheRead:null});assert.equal(card.body.pct,null);assert.equal(card.body.parts.find((part:any)=>part.key==='free').tokens,null);
 const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;await v.functions.sync();
 const context=v.functions.state.data.panes[0].context;assert.equal(context.measured,false);assert.deepEqual(context.last,{input:17,output:null,cacheRead:null});assert.equal(context.window,null);assert.equal(context.pct,null);
 assert.equal(v.document.querySelectorAll('#board [data-swarm-seat]').length,1);await v.find('#board [data-swarm-seat]').emit('click');assert.match(v.find('#ovl .load').textContent,/Нет данных об окне/);
});

test('166/190: empty team keeps all blocks and routes + place to the existing conversation without fabricating a seat',async()=>{
 const v=ui(async path=>path==='/api/swarm'?{...snapshot('/a',[]),journal:{records:[],total:0,lastSeq:0}}:{ok:true,project:'/a',proposals:[]});await v.functions.sync();
 assert.equal(v.document.querySelectorAll('[data-swarm-seat]').length,0);assert.match(v.find('#board').textContent,/Нет данных.*нет мест/);assert.match(v.find('#v-chan .msgs').textContent,/канал пока пуст/);assert.match(v.find('#v-seats .note').textContent,/неподписанных предложений нет/);assert.equal(v.document.querySelectorAll('#board svg path').length,0);
 await v.find('#board [data-swarm-team]').emit('click');assert.deepEqual(v.opened,[{chat:'',id:'room'}]);assert.ok(v.requests.every(p=>p==='/api/swarm'||p==='/api/seats/proposals'));
});

test('166/185: real waiting and tools have no invented age or progress; cold tools are explicitly absent',async()=>{
 const p:any=pane();p.busy=true;p.pendingApprovals=1;p.turn={id:'turn1',startedAt:1791712000000,records:[record()],message:'current goal'};const v=ui(async path=>path==='/api/swarm'?snapshot('/a',[p]):{ok:true,project:'/a',proposals:[]});await v.functions.sync();await v.find('#board [data-swarm-seat]').emit('click');
 assert.match(v.find('#board .waits').textContent,/Время начала неизвестно/);assert.match(v.find('#a-goal').textContent,/current goal/);assert.match(v.find('#a-cnt').textContent,/1 записей канала/);assert.match(v.find('#ovl .tools').textContent,/Нет данных/);assert.match(v.find('#ovl .load').textContent,/0.1 %.*170.*200000/);
 v.streams[0].onmessage({data:JSON.stringify({type:'tool',pane:'worker',name:'<script>tool</script>',detail:'actual tool'})});assert.match(v.find('#ovl .tools').textContent,/actual tool/);assert.equal(v.document.querySelector('#ovl .tools script'),null);
 await v.window.emit('keydown',{key:'Escape'});assert.equal(v.find('#ovl').classList.contains('on'),false);await v.window.emit('keydown',{key:'3'});assert.equal(v.find('#v-chan').classList.contains('on'),true);
});

for(const corrupt of [null,{...snapshot(),project:'/foreign'},{...snapshot(),panes:[{...pane(),queue:undefined}]},{...snapshot(),panes:[{...pane(),context:undefined}]},{...snapshot(),panes:[{...pane(),context:{...pane().context,measured:false,last:{input:17,cacheRead:null}}}]},{...snapshot(),panes:[{...pane(),context:{...pane().context,measured:false,last:{input:17,output:-1,cacheRead:null}}}]},{...snapshot(),panes:[{...pane(),context:{...pane().context,measured:true,last:{input:17,output:null,cacheRead:null}}}]},{...snapshot(),panes:[{...pane(),context:{...pane().context,measured:true,last:null}}]},{...snapshot(),panes:[pane(),pane()]},{...snapshot(),journal:{records:[{...record(),to:null}],total:1,lastSeq:1}}])test('166/190: malformed snapshots are read errors, retain the last good project, and never become a false empty team: '+JSON.stringify(corrupt),async()=>{
 let bad=false;const v=ui(async path=>path==='/api/swarm'?(bad?corrupt:snapshot()):{ok:true,project:'/a',proposals:[]});await v.functions.sync();bad=true;await v.functions.fetch();assert.match(v.find('[data-swarm-notice]').textContent,/Не удалось прочитать.*предыдущий снимок/);assert.equal(v.document.querySelectorAll('#board [data-swarm-seat]').length,1);
 v.functions.reset();await v.functions.fetch();assert.match(v.find('#board').textContent,/Данные не прочитаны/);assert.doesNotMatch(v.find('#board').textContent,/в проекте пока нет мест/);
});

test('166/190: delayed A → B → A responses cannot replace the newest binding or its open card',async()=>{
 const pending:Array<{project:string;gate:ReturnType<typeof deferred<any>>}>=[];let v:ReturnType<typeof ui>;v=ui(async path=>{if(path!=='/api/swarm')return {ok:true,project:v.H.project,proposals:[]};const gate=deferred<any>();pending.push({project:v.H.project,gate});return gate.promise});
 const a=v.functions.sync(),b=v.switchProject('/b'),latest=v.switchProject('/a');pending[2]!.gate.resolve(snapshot('/a',[{...pane(),label:'new A'}]));await latest;await v.find('#board [data-swarm-seat]').emit('click');pending[0]!.gate.resolve(snapshot('/a',[{...pane(),label:'old A'}]));pending[1]!.gate.resolve(snapshot('/b',[{...pane(),label:'old B'}]));await Promise.all([a,b]);assert.match(v.find('#a-h').textContent,/new A/);assert.doesNotMatch(v.find('#board').textContent,/old A|old B/);assert.equal(v.streams.filter(s=>!s.closed).length,1);
});

test('166/190: pagehide cancels view data and the stream; pageshow waits for confirmation and re-reads',async()=>{
 const gate=deferred<any>();let delay=false;const v=ui(async path=>path==='/api/swarm'?(delay?gate.promise:snapshot(v.H.project)):{ok:true,project:v.H.project,proposals:[]});await v.functions.sync();delay=true;const pending=v.functions.fetch();await v.window.emit('pagehide');assert.equal(v.streams[0].closed,true);assert.equal(v.document.querySelectorAll('[data-swarm-seat]').length,0);
 v.H.project='/b';v.H.snapshotOnly=true;await v.window.emit('pageshow',{persisted:true});const n=v.requests.length;await v.window.emit('live:status');assert.equal(v.requests.length,n);delay=false;v.H.snapshotOnly=false;await v.window.emit('live:status');gate.resolve(snapshot('/a',[{...pane(),label:'stale A'}]));await pending;
 assert.equal(v.functions.state.data.project,'/b');assert.doesNotMatch(v.find('#board').textContent,/stale A/);assert.equal(v.streams.filter(s=>!s.closed).length,1);
});

test('166/190: replay burst during a captured HTTP read queues a follow-up snapshot; forged stream rows never render',async()=>{
 const gate=deferred<any>();let count=0,latest='before';const v=ui(async path=>{if(path!=='/api/swarm')return {ok:true,project:'/a',proposals:[]};count++;if(count===2)return gate.promise;return snapshot('/a',[{...pane(),label:latest}])});await v.functions.sync();const pending=v.functions.fetch();latest='after';
 for(let i=0;i<8;i++)v.streams[0].onmessage({data:JSON.stringify({type:'state',pane:'worker',label:'forged'})});await until(()=>v.functions.state.queued);gate.resolve(snapshot('/a',[{...pane(),label:'captured'}]));await pending;await until(()=>v.functions.state.data.panes[0].label==='after');assert.match(v.find('#board').textContent,/after/);assert.doesNotMatch(v.find('#board').textContent,/forged/);assert.equal(v.streams.length,1);
});

test('166: a project without any pane routes the empty action to New chat',async()=>{
 const v=ui(async path=>path==='/api/swarm'?snapshot('/a',[]):{ok:true,project:'/a',proposals:[]});v.H.panes=[];await v.functions.sync();await v.find('#board [data-swarm-team]').emit('click');assert.equal(v.context.location.href,'10-new-chat.html');assert.equal(v.opened.length,0);
});

test('166: unsigned proposal count comes from the project endpoint and wrong-project proposals cannot appear',async()=>{
 let wrong=false;const q={proposalId:'p'+'a'.repeat(24),version:1,confirmed:false,seats:[{sid:'new-worker',operationId:'cfixture',kind:'worker',label:'Юрист',vendor:'claude',model:'fixture',mode:'read',intro:'Проверь документы'}],team:[{id:'new-worker',kind:'worker',proposedKind:'worker',state:'proposed',chat:null}]};const v=ui(async path=>path==='/api/swarm'?snapshot():{ok:true,project:wrong?'/other':'/a',proposals:[q]});await v.functions.sync();assert.match(v.find('#v-seats .note').textContent,/1 предложений/);wrong=true;await v.functions.fetch();assert.match(v.find('#v-seats .note').textContent,/Не удалось прочитать предложения/);assert.doesNotMatch(v.find('#v-seats .note').textContent,/1 предложений/);
});
