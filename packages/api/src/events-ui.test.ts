import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until,sse} from './test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8'),live=read('ui/deploy/live.js'),proto=read('ui/deploy/proto.js'),raw=read('ui/sketches/disarto/09-events.html');
const part=(s:string,a:string,b:string)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end)};
const record=(seq:number,text='event '+seq)=>({seq,ts:'2026-10-11T12:00:00+03:00',from:'owner',to:['worker'],kind:'note',thread:'work',text});
const snapshot=(project='/a',records=[record(1)],lastSeq=records.at(-1)?.seq??0,total=records.length)=>({project,records,lastSeq,summary:{total,byKind:total?{note:total}:{}}});
function ui(fetch?:(path:string)=>Promise<any>){
 const d=dom(part(raw,'<body>','</body>'));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');
 const H:any={on:true,snapshotOnly:false,project:'/a'},requests:string[]=[],streams:any[]=[];
 const context:any={H,PAGE:'events',KEY:'events',document:d.document,URLSearchParams,location:{},refreshStatus:async()=>true,
  esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:async(path:string)=>{requests.push(path);return fetch?fetch(path):snapshot(H.project)},
  addEventListener:d.window.addEventListener.bind(d.window),EventSource:class{onmessage:any;onopen:any;onerror:any;closed=false;path:string;constructor(path:string){this.path=path;streams.push(this)}close(){this.closed=true}}};context.window=context;
 const vm=createContext(context);runInContext(part(proto,'  // TS-15a specification','  // End TS-15a specification'),vm);
 runInContext(part(live,'  // TS-12: one project-bound transport','  // End TS-12 shared events.')+part(live,'  // TS-15a: journal-backed','  // End TS-15a events.')+'\nglobalThis.testing={state:EV,sync:eventsSync,fetch:eventsFetch,reset:eventsReset,draw:eventsDraw};',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 const switchProject=(project:string)=>{H.project=project;context.testing.reset();return context.testing.sync()};
 return {...d,H,context,requests,streams,find,switchProject,functions:context.testing};
}

test('168/184: actual sketch feed reads HTTP, counts whole project, pages by seq, filters via real controls; no mock actions',async t=>{
 const h=await fixture(t);for(let n=1;n<=205;n++)h.runtime.journal.append({sender:n%2?'owner':'harness',to:'worker',kind:n%2?'question':'note',text:'event '+n,thread:n%3?'one':'two'});
 const v=ui(async path=>(await call(h.api,path)).body);v.H.project=h.dir;const original=v.find('[data-event-feed]'),mock=v.find('.co.warn');await v.functions.sync();
 assert.equal(v.find('[data-event-feed]'),original);assert.equal(v.find('.co.warn'),mock);assert.match(v.find('[data-events-count]').textContent,/Всего в проекте: 205 · загружено по фильтрам: 100/);
 assert.equal(v.document.querySelectorAll('[data-event-seq]').length,100);assert.doesNotMatch(original.textContent,/H1.5|D8.4d|78 %/);assert.match(v.find('[data-event-seq="205"]').textContent,/event 205|владелец/);
 await v.find('[data-events-more]').emit('click');await v.find('[data-events-more]').emit('click');assert.equal(v.document.querySelectorAll('[data-event-seq]').length,205);assert.equal(v.find('[data-events-more]').disabled,true);assert.ok(v.requests.some(p=>p.includes('before=106')));
 await v.find('[data-events-kind="note"]').emit('click');assert.equal(v.functions.state.records.length,100);assert.match(v.find('[data-events-count]').textContent,/Всего в проекте: 205/);
 v.find('[name="from"]').value='harness';v.find('[name="to"]').value='worker';v.find('[name="thread"]').value='two';await v.find('form').emit('submit');
 assert.ok(v.functions.state.records.every((r:any)=>r.kind==='note'&&r.thread==='two'&&r.seq%6===0));assert.ok(v.requests.some(p=>p.includes('from=harness&to=worker&thread=two')));
 h.runtime.journal.append({sender:'harness',to:'worker',kind:'note',thread:'two',text:'<script>forged</script>'});await v.find('[data-events-refresh]').emit('click');
 assert.equal(v.functions.state.records.length,35);assert.equal(v.document.querySelector('[data-event-seq="206"] script'),null);
});

test('168/184: stream is only an invalidation signal, retains older pages and never inserts forged event data',async()=>{
 let latest=1;const v=ui(async path=>{const q=new URL('http://test'+path).searchParams;return snapshot('/a',latest>Number(q.get('since')||0)?[record(latest)]:[],latest,latest)});
 await v.functions.sync();latest=2;v.streams[0].onmessage({data:JSON.stringify({type:'done',seq:999,text:'forged stream record'})});await until(()=>v.functions.state.lastSeq===2);
 assert.deepEqual([...v.functions.state.records].map(r=>r.seq),[2,1]);assert.ok(v.requests.at(-1)?.includes('since=1'));assert.doesNotMatch(v.find('[data-events-body]').textContent,/forged/);
 await v.find('[data-events-clear]').emit('click');assert.equal(v.streams[0].closed,false);assert.equal(v.streams.length,1);
});

test('168/190: late A, B, A and filter responses cannot replace the confirmed binding',async()=>{
 const pending:Array<ReturnType<typeof deferred<any>>>=[];const v=ui(async()=>{const d=deferred<any>();pending.push(d);return d.promise});
 const a=v.functions.sync();const b=v.switchProject('/b');const a2=v.switchProject('/a');
 pending[2]!.resolve(snapshot('/a',[record(3,'new A')],3));await a2;pending[1]!.resolve(snapshot('/b',[record(2,'old B')]));await b;pending[0]!.resolve(snapshot('/a',[record(1,'old A')]));await a;
 assert.match(v.find('[data-events-body]').textContent,/new A/);assert.doesNotMatch(v.find('[data-events-body]').textContent,/old/);
 const refresh=v.functions.fetch();v.find('[name="from"]').value='different';const filtered=v.find('form').emit('submit');pending[4]!.resolve(snapshot('/a',[],3,3));await filtered;pending[3]!.resolve(snapshot('/a',[record(4,'old filter')],4));await refresh;
 assert.equal(v.functions.state.records.length,0);assert.match(v.find('[data-events-body]').textContent,/По выбранным фильтрам/);assert.equal(v.functions.state.summary.total,3);
});

test('168/190: pagehide/pageshow discards stale history and re-reads HTTP only after project confirmation',async()=>{
 const late=deferred<any>();let waiting=false;const v=ui(async()=>waiting?late.promise:snapshot(v.H.project,[record(1,v.H.project+' history')]));await v.functions.sync();waiting=true;const old=v.functions.fetch();await v.window.emit('pagehide');
 assert.equal(v.streams[0].closed,true);assert.doesNotMatch(v.find('[data-events-body]').textContent,/a history/);
 v.H.snapshotOnly=true;v.H.project='/b';await v.window.emit('pageshow',{persisted:true});const count=v.requests.length;await v.window.emit('live:status');assert.equal(v.requests.length,count);
 waiting=false;v.H.snapshotOnly=false;await v.window.emit('live:status');late.resolve(snapshot('/a',[record(2,'stale A')],2));await old;
 assert.match(v.find('[data-events-body]').textContent,/b history/);assert.doesNotMatch(v.find('[data-events-body]').textContent,/stale A/);assert.equal(v.functions.state.project,'/b');
});

for(const bad of [null,{ok:false,error:'disk unreadable'}, {...snapshot(),project:'/other'}, {...snapshot(),summary:undefined}, {...snapshot(),summary:{total:9,byKind:{note:1}}}, {...snapshot(),records:[{...record(2),to:null}]}, {...snapshot(),records:[{...record(1),ts:'invalid'}]}])test('168/184: malformed journal is a read error, never a false empty project: '+JSON.stringify(bad),async()=>{
 let corrupt=false;const v=ui(async()=>corrupt?bad:snapshot());await v.functions.sync();corrupt=true;await v.functions.fetch();assert.match(v.find('[data-events-error]').textContent,/Не удалось прочитать/);assert.match(v.find('[data-events-body]').textContent,/event 1/);
 v.functions.reset();await v.functions.fetch();assert.match(v.find('[data-events-body]').textContent,/Данные не прочитаны/);assert.doesNotMatch(v.find('[data-events-body]').textContent,/пока нет событий/);
});

for(const [key,file,state] of [['plan','02-plan','макет'],['swarm','04-swarm','макет'],['sens','13-sensors','макет'],['now','14-now','частично'],['events','09-events','частично'],['spend','05-spend','частично'],['first','19-first-run','частично'],['login','20-login-pour','макет'],['away','18-overlays','частично']])test('183: '+file+' keeps original blocks and specification after successful boot',()=>{
 const html=read('ui/sketches/disarto/'+file+'.html'),d=dom(part(html,'<body>','</body>'));Object.assign(d.document,{documentElement:d.html,body:d.body});
 const frames=[...d.document.querySelectorAll('.frame')],original=frames.map(f=>[...f.querySelectorAll('.top,.nums,.feed,.co,.views,.grid')]);
 const context:any={KEY:key,document:d.document,sessionStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>1,clearTimeout(){}};context.window=context;const vm=createContext(context);
 runInContext(part(proto,'  // TS-15a specification','  // End TS-15a specification'),vm);const labels=d.document.querySelectorAll('.spec-banner');assert.ok(labels.length>0);assert.equal(d.html.getAttribute('data-spec-state'),state);
 for(const label of labels)assert.match(label.textContent,/Макет · образец данных/);
 runInContext(part(proto,'(function(){','/* LIVE_BOOT_END */'),vm);const token=context.HARNESS_BOOT.capture();assert.equal(context.HARNESS_BOOT.confirm('/a',token),true);context.HARNESS_BOOT.ready();
 assert.equal(d.html.hasAttribute('data-live-pending'),false);assert.equal(d.html.getAttribute('data-spec-state'),state);assert.deepEqual(d.document.querySelectorAll('.spec-banner'),labels);
 for(let i=0;i<frames.length;i++)for(const node of original[i]!)assert.equal(frames[i]!.contains(node),true,node.className);
 if(key==='events'){assert.equal(d.document.querySelectorAll('[data-spec-mock] .spec-block').length,2);assert.match(d.document.querySelector('[data-spec-mock]')!.textContent,/94 %/)}
 if(key==='now')assert.ok(d.document.querySelectorAll('.nums .spec-block').length>0);
});

test('168/190: older-page read cannot advance the live cursor past a concurrent new event',async()=>{
 let latest=105;const v=ui(async path=>{const q=new URL('http://test'+path).searchParams;const before=q.get('before');if(before){latest=106;return snapshot('/a',Array.from({length:5},(_,i)=>record(i+1)),106,106)}if(q.has('since'))return snapshot('/a',[record(106,'arrived during paging')],106,106);return snapshot('/a',Array.from({length:100},(_,i)=>record(i+6)),latest,latest)});
 await v.functions.sync();await v.find('[data-events-more]').emit('click');assert.equal(v.functions.state.lastSeq,105);await v.find('[data-events-refresh]').emit('click');
 assert.equal(v.functions.state.records.length,106);assert.match(v.find('[data-events-body]').textContent,/arrived during paging/);assert.ok(v.requests.at(-1)?.includes('since=105'));
});

test('168/190: replay burst shares one pending status read; rejected confirmation cannot pretend to refresh',async()=>{
 const v=ui();await v.functions.sync();const gate=deferred<boolean>();let calls=0;v.context.refreshStatus=async()=>{calls++;return gate.promise};
 for(let i=0;i<10;i++)v.streams[0].onmessage({data:'{"type":"state"}'});assert.equal(calls,1);const reads=v.requests.length;gate.resolve(false);await until(()=>v.functions.state.checking===null);
 assert.equal(v.requests.length,reads);assert.match(v.find('[data-events-error]').textContent,/проект не подтверждён/);
});


test('168/190 ОКНА: real SSE during a captured HTTP snapshot triggers a second read without another event',async t=>{
 const h=await fixture(t);h.runtime.journal.append({sender:'owner',to:'worker',kind:'note',text:'initial'});
 const captured=deferred(),release=deferred();t.after(()=>release.resolve());let delay=false;
 const v=ui(async path=>{const response=(await call(h.api,path)).body;if(delay&&path.startsWith('/api/journal')){delay=false;captured.resolve();await release.promise}return response});v.H.project=h.dir;
 Object.assign(v.context,{leftPage:false,S:{ui:{pane:'worker'},chat:[]},sendBinding:()=>({}),bindingCurrent:()=>true,sideChats:async()=>{},hStatus(){},badges(){},pickPane(){},renderWaiting(){},save(){},modelName:(s:any)=>s,toast(){},setTimeout:(fn:any)=>queueMicrotask(fn),CustomEvent:class{type:string;constructor(type:string){this.type=type}},dispatchEvent:(e:any)=>{void v.window.emit(e.type)}});
 runInContext(part(live,'  function applyStatus(','  // лента активного чата'),v.context);
 await v.functions.sync();const stream=await sse(h.api);t.after(()=>stream.close());await until(()=>stream.raw.includes(': ok'));let seen=0;
 const deliver=()=>{while(seen<stream.frames.length)v.streams.at(-1).onmessage({data:JSON.stringify(stream.frames[seen++])})};delay=true;
 h.runtime.registry.get('worker')!.publish({type:'note',text:'refresh'});await until(()=>stream.frames.length===1);deliver();await captured.promise;
 const next=h.runtime.journal.append({sender:'worker',to:'owner',kind:'answer',text:'arrived during snapshot'});h.runtime.registry.get('worker')!.publish({type:'sent',record:next});await until(()=>stream.frames.length===2);deliver();release.resolve();
 await until(()=>!v.functions.state.checking&&!v.functions.state.loading);assert.equal(v.functions.state.lastSeq,next.seq);assert.ok(v.functions.state.records.some((r:any)=>r.seq===next.seq));assert.match(v.find('[data-events-body]').textContent,/arrived during snapshot/);
 assert.equal(v.requests.filter(p=>p.startsWith('/api/journal')).length,3); // initial + captured + one follow-up
});

for(const change of ['project','ABA','filter','pagehide'])test('168/190: queued refresh is discarded on '+change+' binding change',async()=>{
 const release=deferred<any>(),captured=deferred();let delay=false;
 const v=ui(async()=>{if(delay){delay=false;captured.resolve();return release.promise}return snapshot(v.H.project)});await v.functions.sync();delay=true;
 v.streams[0].onmessage({data:'{"type":"note"}'});await captured.promise;for(let i=0;i<5;i++)v.streams[0].onmessage({data:'{"type":"sent"}'});
 if(change==='project'||change==='ABA'){await v.switchProject('/b');if(change==='ABA')await v.switchProject('/a')}
 else if(change==='filter')await v.find('[data-events-clear]').emit('click');else await v.window.emit('pagehide');
 const reads=v.requests.length;release.resolve(snapshot('/a',[record(2,'stale')],2));await until(()=>!v.functions.state.loading&&!v.functions.state.checking);
 assert.equal(v.requests.length,reads);assert.equal(v.functions.state.refreshQueued,false);assert.doesNotMatch(v.find('[data-events-body]').textContent,/stale/);
});
