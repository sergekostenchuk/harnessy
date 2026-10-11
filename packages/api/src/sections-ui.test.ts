import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,OWNER} from './test-helpers.ts';
import {SECTION_LIMITS} from '@harnessy/projects';
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),proto=readFileSync(new URL('../../../ui/deploy/proto.js',import.meta.url),'utf8');
const screens={doc:'17-doc',art:'15-artifacts',mem:'16-memory',res:'12-research'} as const;
const sections={doc:'docs',art:'artifacts',mem:'memory',res:'research'} as const;
type Page=keyof typeof screens;
const part=(s:string,a:string,b:string)=>{const x=s.indexOf(a),y=s.indexOf(b,x+a.length);assert.ok(x>=0&&y>x,a);return s.slice(x,y)};
function view(page:Page,fetch:(path:string,body?:any)=>Promise<any>){
 const raw=readFileSync(new URL('../../../ui/sketches/disarto/'+screens[page]+'.html',import.meta.url),'utf8');
 const d=dom(raw.slice(raw.indexOf('<div class="frame"'),raw.indexOf('<script')));Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:false,project:'/projects/a',panes:[],pane:null,snapshotOnly:false,active:{}},S:any={ui:{pane:'room'},chat:[],dec:{}},hooks:Function[]=[],requests:any[]=[],toasts:string[]=[],pending=new Set<Promise<any>>(),timers:Function[]=[];
 const hx=new Proxy({close(){}},{get:()=>()=>''});
 const sandbox:any={H,S,PAGE:page,document:d.document,window:null,HX:hx,hooks,location:{href:'',pathname:'/sketches/proto/'+screens[page]+'.html'},esc:(s:any)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),base:(s:string)=>s.split('/').filter(Boolean).pop()||'',
  toast:(s:string)=>toasts.push(s),save(){},log(){},now:()=>1,hhmm:()=> '12:00',badges(){},pickPane(){},renderWaiting(){},modelName:(id:string)=>id,
  addEventListener:d.window.addEventListener.bind(d.window),dispatchEvent(){},CustomEvent:class{},setTimeout:(f:Function)=>{timers.push(f)},clearTimeout(){},
  api:async(path:string,body?:any)=>{requests.push({path,body});const p=fetch(path,body);pending.add(p);try{return await p}finally{pending.delete(p)}}};sandbox.window=sandbox;
 const context=createContext(sandbox);
 for(const script of raw.matchAll(/<script>([\s\S]*?)<\/script>/g))runInContext(script[1]!,context);
 runInContext(part(live,'  // TS-09a: project materials','  // лента активного чата')+'\nglobalThis.sections={fetch:sectionFetch,draw:sectionDraw,sync:sectionSync,changing:sectionChanging,request:sectionRequest,applyStatus,PS};',context);
 // Register the actual old hooks too: they must stay harmless after the engine connects.
 const lines=live.split('\n');for(let i=0;i<lines.length;i++)if(lines[i]!.startsWith('  if(')&&lines[i]!.includes("PAGE==='"+page+"'")){const end=lines.indexOf('  }',i+1);assert.ok(end>i);runInContext(lines.slice(i,end+1).join('\n'),context);i=end}
 H.on=true;
 const find=(selector:string)=>{const el=d.document.querySelector(selector);assert.ok(el,selector);return el};
 const settle=async()=>{do{await Promise.allSettled([...pending]);await immediate()}while(pending.size)};
 return {...d,H,S,hooks,requests,toasts,timers,sandbox,context,functions:sandbox.sections,find,settle};
}
const data=(page:Page,project='/projects/a',orch:any=null)=>({ok:true,project,section:sections[page],empty:true,items:[],limited:[],limits:SECTION_LIMITS,orchestrator:orch,memoryState:page==='mem'?'template':null});

for(const page of Object.keys(screens) as Page[])test('136–140: '+page+' actual screen reads HTTP materials with empty team, removes mocks, and opens the original conversation without posting',async t=>{
 const h=await fixture(t,{seats:'  {}'}),v=view(page,async(path,body)=>(await call(h.api,path,body?{body}:{})).body);v.H.project=h.dir;
 await v.functions.fetch();assert.match(v.document.title,/Harnessy/);assert.match(v.find('[data-project-section]').textContent,/нет оркестратора/);assert.doesNotMatch(v.find('.frame .main').textContent,/OMG|уровня L1|87 задач|12 правил|111|3 готовы к проверке/);
 const first=v.find('.frame .main').innerHTML;for(const hook of v.hooks)hook();assert.equal(v.find('.frame .main').innerHTML,first,'refresh cannot reapply the demo');
 const seq=h.runtime.journal.lastSeq;await v.find('[data-section-conversation]').emit('click');assert.equal(v.sandbox.location.href,'01-chat.html');assert.equal(v.S.ui.pane,'room');assert.equal(v.S.ui.fresh,false);assert.match(v.S.ui.sectionHint,/исходный разговор/);assert.equal(h.runtime.journal.lastSeq,seq);assert.equal(h.provider.calls.length,0);assert.equal(v.requests.some(r=>r.body),false);
});

for(const page of Object.keys(screens) as Page[])test('136/139: '+page+' escapes filenames, HTML and real headings, distinguishes error and empty, and retries without mocks',async()=>{
 let broken=false;const r=data(page);Object.assign(r,{empty:false,items:[{name:'<img src=x onerror=alert(1)>.md',path:'.harness/docs/<script>.md',stage:'Реальная стадия',bytes:20,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',text:'# Правило\n<script>alert(1)</script>\n## Решение\nВсе факты',truncated:false},{name:'binary.dat',path:'.harness/binary.dat',stage:null,bytes:2,modifiedAt:'2026-10-11T12:00:00.000Z',format:'binary',text:null,truncated:false}]});
 const v=view(page,async()=>broken?{ok:false,code:'section_unreadable',error:'доступ закрыт'}:r);await v.functions.fetch();assert.equal(v.document.querySelector('script'),null);assert.equal(v.document.querySelector('img'),null);assert.match(v.find('[data-project-section]').textContent,/alert\(1\)/);assert.match(v.find('[data-project-section]').textContent,/Реальная стадия/);assert.equal(v.find('article h3').textContent,'Правило');assert.match(v.find('[data-project-section]').textContent,/Бинарный файл/);
 broken=true;await v.find('[data-section-refresh]').emit('click');assert.match(v.find('[role="alert"]').textContent,/доступ закрыт/);assert.equal(v.document.querySelector('article'),null);for(const hook of v.hooks)hook();assert.match(v.find('[role="alert"]').textContent,/доступ закрыт/);assert.equal(v.document.querySelector('[data-section-request]'),null);
 broken=false;await v.find('[data-section-refresh]').emit('click');assert.equal(v.document.querySelector('[role="alert"]'),null);assert.ok(v.document.querySelector('article'));
});

for(const page of Object.keys(screens) as Page[])test('138: '+page+' explicit form via HTTP records exactly one owner request to the real role',async t=>{
 const h=await fixture(t,{seats:'  counsel: {role: orchestrator, label: Старший юрист, vendor: claude, model: w1, mode: read}'});h.runtime.halt(true,OWNER);
 const gate=deferred<any>();let hold=false;const v=view(page,async(path,body)=>{if(body&&hold)return gate.promise;return (await call(h.api,path,body?{body}:{})).body});v.H.project=h.dir;await v.functions.fetch();assert.equal(h.provider.calls.length,0);
 const input=v.find('[data-section-text]'),button=v.find('[data-section-request]');input.value='';await button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,0);assert.match(v.toasts.at(-1)!,/Опишите/);
 input.value='Подготовь материалы '+page;hold=true;const a=button.emit('click'),b=button.emit('click');assert.equal(v.requests.filter(r=>r.body).length,1);assert.equal(button.disabled,true);
 const req=v.requests.at(-1),seq=h.runtime.journal.lastSeq;gate.resolve((await call(h.api,req.path,{body:req.body})).body);await Promise.all([a,b]);assert.equal(h.runtime.journal.lastSeq,seq+1);assert.deepEqual(h.runtime.journal.read({since:seq})[0]!.to,['counsel']);assert.match(button.textContent,/Поручение записано/);assert.equal(input.value,'');assert.equal(h.provider.calls.length,0);
});

test('140: A→B→A, same-project refresh and pagehide reject every late result; a project receipt removes old materials immediately',async()=>{
 const gates=[deferred<any>(),deferred<any>(),deferred<any>()],v=view('doc',()=>gates.shift()!.promise),a=gates[0]!,b=gates[1]!,again=gates[2]!;
 const first=v.functions.fetch();v.H.project='/projects/b';const second=v.functions.fetch();v.H.project='/projects/a';const third=v.functions.fetch();
 b.resolve({...data('doc','/projects/b'),empty:false,items:[{name:'FOREIGN',path:'foreign',bytes:1,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',truncated:false,stage:null,text:'B SECRET'}]});a.resolve({...data('doc'),empty:false,items:[{name:'OLD A',path:'old',bytes:1,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',truncated:false,stage:null,text:'old A'}]});await Promise.all([first,second]);assert.doesNotMatch(v.find('.frame .main').textContent,/FOREIGN|SECRET|OLD A/);
 again.resolve(data('doc'));await third;assert.match(v.find('.frame .main').textContent,/Документы проекта ещё/);
 v.functions.PS.data={...data('doc'),empty:false,items:[{name:'old',path:'old',bytes:1,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',truncated:false,stage:null,text:'OLD MATERIAL'}]};v.functions.draw();assert.match(v.find('.main').textContent,/OLD MATERIAL/);v.functions.changing();assert.equal(v.document.querySelector('article'),null);
 const late=deferred<any>();v.sandbox.api=()=>late.promise;const job=v.functions.fetch();await v.window.emit('pagehide');late.resolve({...data('doc'),empty:false,items:[{name:'after pagehide',path:'late',bytes:1,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',truncated:false,stage:null,text:'LATE'}]});await job;assert.doesNotMatch(v.find('.main').textContent,/LATE/);
});

test('138/140: missing role, refused write and stale reply never fabricate a successful dispatch',async()=>{
 let reply:any={ok:false,code:'write_failed',error:'journal write failed'};const v=view('res',async(path,body)=>body?reply:data('res','/projects/a',{pane:'lead',label:'Лид'}));await v.functions.fetch();v.find('[data-section-text]').value='поручение';await v.find('[data-section-request]').emit('click');assert.equal(v.find('[data-section-text]').value,'поручение');assert.match(v.toasts.at(-1)!,/не записано/);
 reply={ok:false,code:'orchestrator_missing',error:'назначьте оркестратора'};await v.find('[data-section-request]').emit('click');assert.equal(v.document.querySelector('[data-section-request]'),null);assert.ok(v.document.querySelector('[data-section-conversation]'));
 await v.functions.fetch();const gate=deferred<any>();reply=gate.promise;v.sandbox.api=async(_path:string,body:any)=>body?await gate.promise:data('res','/projects/a',{pane:'lead',label:'Лид'});const old=v.find('[data-section-request]'),job=old.emit('click');v.H.project='/projects/b';v.functions.changing();gate.resolve({ok:true,seq:123});await job;assert.doesNotMatch(v.toasts.join('\n'),/123/);
});

test('137/136: template memory and truncation have distinct, honest captions',async()=>{
 const r=data('mem');const v=view('mem',async()=>r);await v.functions.fetch();assert.match(v.find('.main').textContent,/Начальный шаблон памяти: решений проекта ещё нет/);assert.equal(v.document.querySelector('article'),null);
 Object.assign(r,{empty:false,memoryState:'content',limited:['response'],items:[{name:'MEMORY.md',path:'.harness/MEMORY.md',bytes:999999,modifiedAt:'2026-10-11T12:00:00.000Z',format:'text',truncated:true,stage:null,text:'## Решения\nодин'}]});await v.functions.fetch();assert.match(v.find('.main').textContent,/Показана часть материалов/);assert.match(v.find('.main').textContent,/Сокращённый просмотр/);assert.equal(v.find('article h3').textContent,'Решения');
});

test('87/139: sidebar, rail, mobile and palette all route Documents to the same real screen, including cold reload',async()=>{
 const d=dom('<aside class="side"><div data-go="doc">Документы проекта</div></aside>'),location={href:''},context:any={document:d.document,window:{},location,KEY:'chat',PAGES:{doc:'17-doc.html'},frames:[],cur:0,show(){},toggleSide(){}};
 runInContext(part(proto,"  document.addEventListener('click',e=>{ const a=e.target.closest('aside.side');",'  // ── навигация телефона'),createContext({...context,addEventListener(){}}));await d.document.querySelector('[data-go="doc"]')!.emit('click');assert.equal(location.href,'17-doc.html');
 assert.match(proto,/\['doc','Документы проекта'\]/);assert.match(proto,/item\('doc','Документы проекта'\)/);assert.match(live,/\['Документы проекта','17-doc.html'\]/);assert.doesNotMatch(proto,/Документ стадии/);
 const cold=view('doc',async()=>data('doc'));await cold.functions.fetch();assert.match(cold.document.title,/Документы проекта · a/);assert.equal(cold.find('[data-project-section]').dataset.projectSection,'docs');
});

for(const path of ['empty','items','limited','limits','memoryState','orchestrator','orchestrator.pane','orchestrator.label','items.path','items.name','items.stage','items.bytes','items.modifiedAt','items.format','items.text','items.truncated'])test('136/140: absent '+path+' refuses incomplete data instead of inferring a valid section',async()=>{
 const r:any={...data('doc','/projects/a',{pane:'lead',label:'Лид'}),empty:false,items:[{path:'.harness/docs/a',name:'a',stage:null,bytes:1,modifiedAt:'2026-10-11T12:00:00Z',format:'text',text:'x',truncated:false}]};
 const [root,key]=path.split('.');if(key){delete (root==='items'?r.items[0]:r[root!])[key]}else delete r[root!];
 const v=view('doc',async()=>r);await v.functions.fetch();assert.match(v.find('[role="alert"]').textContent,/неполный ответ движка/);assert.equal(v.document.querySelector('[data-section-request]'),null);assert.equal(v.document.querySelector('article'),null);
});

test('140: actual applyStatus and project POST evict old documents before repaint, then read only the new project',async t=>{
 const h=await fixture(t,{seats:'  {}'}),other=join(h.dir,'second');mkdirSync(join(h.dir,'.harness','docs'),{recursive:true});writeFileSync(join(h.dir,'.harness','docs','old.md'),'OLD PROJECT DOCUMENT');mkdirSync(join(other,'.harness','docs'),{recursive:true});writeFileSync(join(other,'.harness','docs','new.md'),'NEW PROJECT DOCUMENT');
 const v=view('doc',async(path,body)=>(await call(h.api,path,body?{body}:{})).body);v.H.project='';v.functions.applyStatus((await call(h.api,'/api/status')).body);await v.settle();assert.match(v.find('.main').textContent,/OLD PROJECT DOCUMENT/);
 v.sandbox.fetch=async(path:string,options:any)=>({json:()=>v.sandbox.api(path,options?JSON.parse(options.body):undefined)});
 runInContext(part(live,'  const api=','  // TS-07: waiting controls')+'\nglobalThis.changeProject=api;',v.context);
 await v.sandbox.changeProject('/api/project',{path:other});assert.doesNotMatch(v.find('.main').textContent,/OLD PROJECT DOCUMENT/);
 v.functions.applyStatus((await call(h.api,'/api/status')).body);await v.settle();assert.match(v.find('.main').textContent,/NEW PROJECT DOCUMENT/);assert.doesNotMatch(v.find('.main').textContent,/OLD PROJECT DOCUMENT/);assert.equal(h.provider.calls.length,0);
});
