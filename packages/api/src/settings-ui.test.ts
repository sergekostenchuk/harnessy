import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const live=read('ui/deploy/live.js'),set=read('ui/deploy/set.js');
function part(source:string,start:string,end:string){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b)}
function settingsUi(fetch?:(path:string,body?:any)=>Promise<any>){
 const d=dom('<div class="frame cur"><div class="main"><div class="top"><span class="st"></span><div class="r"></div></div><div class="set"></div></div></div>'),storage=new Map<string,string>(),writes:string[]=[],toasts:string[]=[],logs:any[]=[],requests:any[]=[],hooks:any[]=[];let pending=0;
 Object.assign(d.document,{documentElement:d.html,body:d.body});
 const H:any={on:true,project:'/projects/p1',panes:[{id:'worker',model:'w1',role:'executor',mode:'read',label:'воркер'}],modes:[{id:'read',label:'Чтение'},{id:'edit',label:'Правка'}],roleCatalog:[],models:{claude:[{id:'w1'}]}};
 const responses=(path:string)=>path==='/api/status'?{project:H.project,policy:{path:'policy'},team:{path:'team'}}:path==='/api/settings'?{ok:true,owner:{},project:{},effective:{defaultMode:'read'}}:{ok:true,providers:[]};
 const L:any={H,esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),toast:(s:string)=>toasts.push(s),log:(...a:any[])=>logs.push(a),paneName:(p:any)=>p.label,refreshStatus:async()=>{},api:async(path:string,body?:any)=>{requests.push({path,body});pending++;try{return await (fetch?fetch(path,body):responses(path))}finally{pending--}}};
 const context:any={LIVE:L,H,S:{ui:{set:{t:[0,0,0,0,0,0],s:[1,1,1]}},chat:[]},PAGE:'set',document:d.document,location:{pathname:'/06-settings.html',host:'127.0.0.1:3794',hash:'',href:''},history:{pushState(_a:any,_b:any,hash:string){context.location.hash=hash}},
  localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem(k:string,v:string){storage.set(k,v);writes.push(k)}},save(){writes.push('live-state')},log:L.log,toast:L.toast,esc:L.esc,hooks,stop(){requests.push({path:'stop'})},now:()=>1,hhmm:()=>'',
  addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{fn();return 1},requestAnimationFrame:(fn:()=>void)=>fn(),clearTimeout(){}};
 context.window=context;const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);
 runInContext(part(live,'  const statics=','  // ══ ПЛАН:')+part(live,'  function closeLAMenus(','  // запись «контекст передан»')+part(live,'  function laMulti(','  document.addEventListener(\'click\',async e=>{ const la=')+part(live,'  // ══ НАСТРОЙКИ:','  // ══ ПЕРВЫЙ ЗАПУСК:')+'\nglobalThis.menus={laMenu,laPath,laMulti};restoreUI();',vm);
 Object.assign(L,context.menus);runInContext(live.split('\n').find(l=>l.includes("if(e.key==='Escape'&&H.cur"))!,vm);runInContext(set,vm);
 const find=(selector:string)=>{const node=d.document.querySelector(selector);assert.ok(node,selector);return node};
 const go=async(p:string)=>{await find('.snav [data-p="'+p+'"]').emit('click')};
 const ready=async()=>{await immediate();await until(()=>pending===0);await immediate()};
 return {...d,H,L,context,storage,writes,toasts,logs,requests,find,go,ready};
}

test('111: less motion has one owner with raw HX and live handlers loaded; one click, one mutation, one log',async()=>{
 const v=settingsUi();await v.ready();await v.go('look');const toggle=v.find('[data-set-local]');
 await toggle.emit('click');assert.equal(toggle.classList.contains('on'),true);assert.equal(v.html.classList.contains('less-motion'),true);assert.deepEqual(v.writes,['harnessy-less-motion']);assert.equal(v.logs.length,1);
 await toggle.emit('click');assert.equal(toggle.classList.contains('on'),false);assert.equal(v.html.classList.contains('less-motion'),false);assert.deepEqual(v.writes,['harnessy-less-motion','harnessy-less-motion']);assert.equal(v.logs.length,2);
});

for(const page of ['rights','budget','notif','look'])test('111/112: disabled '+page+' controls ignore live, prototype and modal mutations',async()=>{
 const v=settingsUi();await v.ready();await v.go(page);const initialRequests=v.requests.length;
 for(const node of v.document.querySelectorAll('[data-set-disabled] .tog, [data-set-disabled] .seg > span')){const before=node.className;assert.equal(node.style.cursor,'default');assert.ok(node.title);await node.emit('click');assert.equal(node.className,before)}
 assert.equal(v.requests.length,initialRequests);assert.equal(v.logs.length,0);assert.equal(v.writes.length,0);
 assert.doesNotMatch(v.find('.pane').textContent,/✓ применено/);
});

test('111: confirmed project setting comes from actual HTTP saved shape; navigation cannot invent or rewrite the receipt',async t=>{
 const h=await fixture(t),v=settingsUi(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);v.H.project=h.dir;await v.ready();await v.go('rights');
 const old=v.find('.rcpt').textContent;await v.go('budget');await v.go('rights');assert.equal(v.find('.rcpt').textContent,old);assert.equal(v.logs.length,0);
 await v.find('[data-pick-mode]').emit('click');await v.find('.live-menu [data-k="1"]').emit('click');await v.ready();
 assert.equal(h.runtime.settings.effective().defaultMode,'edit');assert.match(v.find('.rcpt').textContent,/✓ проект .*действует со следующего назначения/);assert.equal(v.logs.length,1);assert.equal(v.writes.length,0);
 await v.go('look');await v.go('rights');assert.match(v.find('.rcpt').textContent,/✓ проект/);assert.doesNotMatch(v.find('.rcpt').textContent,/сегодня|каждой роли/);
});

for(const response of [{ok:false,error:'denied'},{ok:true},{ok:true,scope:'project',saved:[],effective:{}}])test('111: refused or incomplete setting response cannot produce a success receipt '+JSON.stringify(response),async()=>{
 const v=settingsUi(async(path,body)=>body?response:path==='/api/status'?{project:'/projects/p1'}:path==='/api/settings'?{ok:true,owner:{},project:{},effective:{defaultMode:'read'}}:{providers:[]});await v.ready();await v.go('rights');
 await v.find('[data-pick-mode]').emit('click');await v.find('.live-menu [data-k="1"]').emit('click');assert.match(v.find('.rcpt').textContent,/для проекта не задано/);assert.equal(v.logs.length,0);assert.match(v.toasts.at(-1)!,/Не вышло/);
});

test('111: pending setting from a previous project cannot label the new project as saved',async()=>{
 const gate=deferred<any>(),v=settingsUi(async(path,body)=>body?gate.promise:path==='/api/status'?{project:'/projects/p1'}:path==='/api/settings'?{ok:true,owner:{},project:{},effective:{defaultMode:'read'}}:{providers:[]});await v.ready();await v.go('rights');
 await v.find('[data-pick-mode]').emit('click');const applied=v.find('.live-menu [data-k="1"]').emit('click');v.H.project='/projects/p2';await v.window.emit('live:status');gate.resolve({ok:true,scope:'project',saved:{defaultMode:'edit'},effective:{defaultMode:'edit'}});await applied;await v.ready();
 assert.equal(v.logs.length,0);assert.doesNotMatch(v.find('.pane').textContent,/✓ проект/);assert.match(v.toasts.at(-1)!,/Проект сменился/);
});

test('111: seat rights in real HX modal call API once and do not run the fake apply handler',async t=>{
 const h=await fixture(t),v=settingsUi(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);v.H.project=h.dir;await v.ready();await v.go('rights');
 await v.find('[data-seat-rights]').emit('click');await v.find('[data-mode-seg] [data-m="edit"]').emit('click');await v.find('[data-rights-apply]').emit('click');
 assert.equal(h.runtime.registry.get('worker')!.mode,'edit');assert.equal(v.requests.filter(r=>r.path==='/api/panes/worker').length,1);assert.equal(v.logs.length,1);assert.equal(v.writes.length,0);assert.equal(v.toasts.filter(s=>s.includes('Права применены')).length,1);
});

test('111: repeated rights cards replace their handler rather than retaining an earlier seat',async()=>{
 const v=settingsUi(async(path,body)=>path.startsWith('/api/panes/')?{ok:true,pane:{mode:body.mode}}:path==='/api/status'?{project:'/projects/p1'}:path==='/api/settings'?{ok:true,project:{},effective:{}}:{providers:[]});await v.ready();v.H.panes.push({id:'second',role:'tester',label:'второй',model:'w1',mode:'read'});await v.go('rights');
 await v.find('[data-seat-rights="worker"]').emit('click');v.context.HX.close();await v.find('[data-seat-rights="second"]').emit('click');await v.find('[data-mode-seg] [data-m="edit"]').emit('click');await v.find('[data-rights-apply]').emit('click');
 assert.deepEqual(v.requests.filter(r=>r.path.startsWith('/api/panes/')).map(r=>r.path),['/api/panes/second']);assert.equal(v.logs.length,1);
});

test('111: real halt confirmation has one HTTP effect; raw HX steps do not save a fake stop',async t=>{
 const h=await fixture(t),v=settingsUi(async(path,body)=>(await call(h.api,path,{...(body?{body}:{})})).body);v.H.project=h.dir;await v.ready();await v.go('budget');
 await v.find('[data-halt="on"]').emit('click');await v.find('[data-go="2"]').emit('click');await v.find('[data-halt-go="on"]').emit('click');assert.equal(h.runtime.project.halted,true);assert.equal(v.H.halted,true);
 assert.equal(v.requests.filter(r=>r.path==='/api/halt').length,1);assert.equal(v.logs.length,1);assert.equal(v.writes.length,0);
});

test('112: settings search finds section headings and item text, does not duplicate results on successive queries',async()=>{
 const v=settingsUi();await v.ready();const input=v.find('[data-set-q]');
 for(const [q,expected] of [['уведомления','Нужно ваше решение'],['бюджет','Предупреждать при'],['анимации','Меньше анимации'],['несуществующее','ничего не найдено']] as const){input.value=q;await input.emit('input');assert.match(v.find('.pane').textContent,new RegExp(expected));assert.equal(v.document.querySelectorAll('.pane').length,1)}
 input.value='бюджет';await input.emit('input');await v.window.emit('live:status');await v.ready();assert.equal(v.find('[data-set-q]').value,'бюджет');assert.match(v.find('.pane').textContent,/Выключатель/);
 input.value='';await v.find('[data-set-q]').emit('input');assert.equal(v.document.querySelectorAll('.pane').length,1);
});

test('112: Escape closes common menus and unregisters replaced menus without stopping an active answer',async()=>{
 const v=settingsUi();await v.ready();await v.go('rights');v.H.cur={text:'active'};
 await v.find('[data-pick-mode]').emit('click');assert.ok(v.document.querySelector('.live-menu'));const target=v.find('[data-pick-mode]');
 v.L.laMenu(target.parentElement,'replacement',[{t:'item'}],()=>{});assert.equal(v.document.querySelectorAll('.live-menu').length,1);
 await target.emit('keydown',{key:'Escape'});assert.equal(v.document.querySelector('.live-menu'),null);assert.equal(v.requests.some(r=>r.path==='stop'),false);assert.equal(v.document.listeners.get('keydown')!.length,0);
 v.L.laPath(target.parentElement,'path','/project',()=>{});v.L.laMulti(target.parentElement,'multiple',[], 'OK',()=>{});await target.emit('keydown',{key:'Escape'});assert.equal(v.document.querySelector('.live-menu'),null);assert.equal(v.document.listeners.get('keydown')!.length,0);
});

test('116: developer shows this origin and actual status; cached H.on cannot claim a connection',async()=>{
 let healthy=true;const v=settingsUi(async(path)=>path==='/api/status'?healthy?{project:'/projects/p1'}:{error:'offline'}:path==='/api/settings'?{ok:true,project:{},effective:{}}:{providers:[]});await v.ready();await v.go('dev');
 assert.match(v.find('.pane').textContent,/127\.0\.0\.1:3794 · подключён/);assert.doesNotMatch(v.find('.pane').textContent,/:3777/);healthy=false;await v.window.emit('live:status');await v.ready();assert.equal(v.H.on,true);assert.match(v.find('.pane').textContent,/нет связи/);assert.doesNotMatch(v.find('.pane').textContent,/работает/);
});
