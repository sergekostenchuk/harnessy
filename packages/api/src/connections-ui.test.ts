import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createContext,runInContext} from 'node:vm';
import {Connections} from '@harnessy/projects';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred,until} from './test-helpers.ts';
const read=(p:string)=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
function ui(fetch:(path:string,body?:any)=>Promise<any>,project='/a'){
 const raw=read('ui/sketches/disarto/11-connections.html'),d=dom(raw.slice(raw.indexOf('<body>'),raw.indexOf('<script>'))),requests:any[]=[],pending=new Set<Promise<any>>(),toasts:string[]=[];
 Object.assign(d.document,{documentElement:d.html,body:d.body});const H:any={on:true,project,confirmedProjectGeneration:0,panes:[],models:{}};
 const context:any={document:d.document,location:{pathname:'/11-connections.html',hash:''},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(f:()=>void)=>f(),requestAnimationFrame:(f:()=>void)=>f(),LIVE:{H,esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),toast:(s:string)=>toasts.push(s),log(){},api:async(path:string,body?:any)=>{requests.push({path,body});const task=fetch(path,body);pending.add(task);try{return await task}finally{pending.delete(task)}}}};context.window=context;
 const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(raw.slice(raw.indexOf('<script>')+8,raw.indexOf('</script>',raw.indexOf('<script>'))),vm);runInContext(read('ui/deploy/conn.js'),vm);
 const find=(s:string)=>{const node=d.document.querySelector(s);assert.ok(node,s);return node};const settle=async()=>{for(let i=0;i<10;i++){await Promise.all([...pending]);await Promise.resolve();if(!pending.size)return}};
 return {...d,H,context,requests,toasts,find,settle};
}
const route=(extra:any={})=>({route:'direct',proxy:'',iface:'',label:'',expect:'',lastCheck:null,...extra});
const data=(project='/a',extra:any={})=>({ok:true,project,routes:['direct','proxy','iface'],providers:[{id:'claude',name:'Claude',kind:'подписка',auth:{loggedIn:true},models:2,seats:[],routable:true,route:route(extra)}]});

// The former write/editor tests move to the revisioned exit-chain component (TS-22c).
// Billing and account-generation regressions below retain their existing coverage.
test('22c: without the exits module, the old editor is absent and the read-only snapshot remains',{timeout:20000},async()=>{
 const v=ui(async path=>path==='/api/connections'?data():{ok:false});await v.settle();await v.find('[data-pv="claude"]').emit('click');assert.equal(v.document.querySelector('[data-rapply]'),null);assert.equal(v.document.querySelector('[data-rv]'),null);assert.match(v.find('.cbody').textContent,/Редактор выходов не загружен/);assert.equal(v.requests.some(r=>r.body),false);
});

test('211a: refreshing route data does not discard an unsaved subscription date in the same card',async()=>{
 const billing={ok:true,project:'/a',subscriptions:[{vendor:'claude',account:'fixture@example.test'}],config:{subscriptionDates:[]}};const v=ui(async path=>path==='/api/billing'?billing:data());await v.settle();await v.find('[data-pv="claude"]').emit('click');v.find('[data-subscription-date]').value='2027-02-15';await v.find('[data-subscription-date]').emit('input');await v.find('[data-connections-refresh]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-02-15');assert.equal(v.requests.some(r=>r.body),false);
});

for(const dirty of [false,true])test('211a r2: refreshing account A to B does not carry '+(dirty?'an edited':'a saved')+' subscription date into B',async t=>{
 const h=await fixture(t);let account='a@example.test';h.provider.auth=async()=>({loggedIn:true,email:account});
 await h.runtime.settings.patch('owner',{subscriptionDates:[{vendor:'claude',account:'a@example.test',date:'2027-02-15',plan:'Max'},{vendor:'claude',account:'b@example.test',date:'2027-03-21',plan:'Max'}]});
 const v=ui(async(path,body)=>(await call(h.api,path,{body})).body,h.dir);await v.settle();await v.find('[data-pv="claude"]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-02-15');
 if(dirty){v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input')}
 account='b@example.test';await v.find('[data-connections-refresh]').emit('click');assert.match(v.find('.cbody').textContent,/b@example\.test/);assert.equal(v.find('[data-subscription-date]').value,'2027-03-21');await v.find('[data-subscription-save]').emit('click');assert.equal(h.runtime.settings.billing().subscriptionDates.find(r=>r.account===account)?.date,'2027-03-21');assert.equal(h.provider.calls.length,0);
});

test('211a r2: an untouched date accepts another window correction; an edited date retains its original compare value',async t=>{
 const h=await fixture(t),account='a@example.test';h.provider.auth=async()=>({loggedIn:true,email:account});const set=(date:string)=>h.runtime.settings.patch('owner',{subscriptionDates:[{vendor:'claude',account,date,plan:'Max'}]});await set('2027-02-15');
 const v=ui(async(path,body)=>(await call(h.api,path,{body})).body,h.dir);await v.settle();await v.find('[data-pv="claude"]').emit('click');await set('2027-03-21');await v.find('[data-connections-refresh]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-03-21');
 v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');await set('2027-04-22');await v.find('[data-connections-refresh]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-06-10');await v.find('[data-subscription-save]').emit('click');const post=v.requests.filter(r=>r.body?.changes).at(-1);assert.equal(post.body.changes[0].before.date,'2027-03-21');assert.equal(h.runtime.settings.billing().subscriptionDates[0]?.date,'2027-04-22');assert.match(v.toasts.at(-1)!,/Не вышло/);
});

test('211a r2: a date draft belongs to its project and vendor; reverting a field removes the draft',async()=>{
 let project='/a',date='2027-02-15';const providers=()=>({...data(project),providers:[...data(project).providers,{...data(project).providers[0],id:'codex',name:'Codex'}]}),billing=()=>({ok:true,project,subscriptions:[{vendor:'claude',account:'a@test'},{vendor:'codex',account:'x@test'}],config:{subscriptionDates:[{vendor:'claude',account:'a@test',date},{vendor:'codex',account:'x@test',date:'2027-09-09'}]}}),v=ui(async path=>path==='/api/billing'?billing():providers());await v.settle();await v.find('[data-pv="claude"]').emit('click');v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');await v.window.emit('keydown',{key:'Escape'});await v.find('[data-pv="codex"]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-09-09');await v.window.emit('keydown',{key:'Escape'});await v.find('[data-pv="claude"]').emit('click');assert.equal(v.find('[data-subscription-date]').value,'2027-06-10');
 v.find('[data-subscription-date]').value=date;await v.find('[data-subscription-date]').emit('input');date='2027-04-22';await v.find('[data-connections-refresh]').emit('click');assert.equal(v.find('[data-subscription-date]').value,date);v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');project='/b';v.H.project=project;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await v.settle();await v.find('[data-pv="claude"]').emit('click');assert.equal(v.find('[data-subscription-date]').value,date);
});

test('211a r2: an old date save cannot continue after project A to B to A navigation',async()=>{
 const gate=deferred<any>(),seen=deferred();let project='/a',hold=false;const billing=()=>({ok:true,project,subscriptions:[{vendor:'claude',account:'a@test'}],config:{subscriptionDates:[{vendor:'claude',account:'a@test',date:'2027-02-15'}]}}),v=ui(async(path,body)=>{if(path==='/api/billing'){if(hold&&!body){hold=false;seen.resolve();return gate.promise}return billing()}return data(project)});await v.settle();await v.find('[data-pv="claude"]').emit('click');v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');hold=true;const saving=v.find('[data-subscription-save]').emit('click');await seen.promise;
 for(const next of ['/b','/a']){project=next;v.H.project=next;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await until(()=>v.find('[data-connections-status]').dataset.project===next)}await v.find('[data-pv="claude"]').emit('click');gate.resolve(billing());await saving;assert.equal(v.requests.some(r=>r.body?.changes),false);assert.equal(v.find('[data-subscription-date]').value,'2027-02-15');
});

for(const changeAccount of [false,true])test('211a r3: a delayed save receipt preserves a newer date edit'+(changeAccount?' after account A-B-A':''),async t=>{
 const h=await fixture(t);let account='a@example.test',hold=false;
 h.provider.auth=async()=>({loggedIn:true,email:account});
 await h.runtime.settings.patch('owner',{subscriptionDates:[
  {vendor:'claude',account:'a@example.test',date:'2027-02-15',plan:'Max'},
  {vendor:'claude',account:'b@example.test',date:'2027-03-21',plan:'Max'}
 ]});
 const gate=deferred(),seen=deferred();
 const v=ui(async(path,body)=>{
  const r=await call(h.api,path,{body});
  if(path==='/api/billing'&&body&&hold){hold=false;seen.resolve();await gate.promise}
  return r.body;
 },h.dir);
 await v.settle();await v.find('[data-pv="claude"]').emit('click');
 v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');
 hold=true;const saving=v.find('[data-subscription-save]').emit('click');await seen.promise;
 if(changeAccount){for(const next of ['b@example.test','a@example.test']){account=next;await v.find('[data-connections-refresh]').emit('click');assert.ok(v.find('.cbody').textContent.includes(next))}}
 v.find('[data-subscription-date]').value='2027-11-30';await v.find('[data-subscription-date]').emit('input');
 gate.resolve();await saving;await v.settle();
 const shown=v.find('[data-subscription-date]').value,saved=h.runtime.settings.billing().subscriptionDates.find(x=>x.account==='a@example.test')?.date;
 t.diagnostic(JSON.stringify({changeAccount,shown,newDraft:'2027-11-30',saved,posts:v.requests.filter(r=>r.body?.changes).length,toasts:v.toasts,modelCalls:h.provider.calls.length}));
 assert.equal(saved,'2027-06-10','the old request was already committed before its delayed receipt');
 assert.equal(shown,'2027-11-30','receipt must not erase a later edit');
 const beforeNext=v.toasts.length;await v.find('[data-subscription-save]').emit('click');assert.equal(h.runtime.settings.billing().subscriptionDates.find(x=>x.account===account)?.date,'2027-11-30');assert.ok(v.toasts.length>beforeNext);assert.doesNotMatch(v.toasts.at(-1)!,/Не вышло/);
 assert.equal(h.provider.calls.length,0);
});


for(const moment of ['read','post','reload'] as const)test('211a r3: edits and focus survive a delayed billing '+moment,async t=>{
 const h=await fixture(t),account='a@example.test';h.provider.auth=async()=>({loggedIn:true,email:account});await h.runtime.settings.patch('owner',{subscriptionDates:[{vendor:'claude',account,date:'2027-02-15',plan:'Max'}]});
 const gate=deferred(),seen=deferred();let hold=false,posted=false;
 const v=ui(async(path,body)=>{const r=await call(h.api,path,{body});if(path==='/api/billing'){if(body)posted=true;if(hold&&(moment==='read'&&!body&&!posted||moment==='post'&&body||moment==='reload'&&!body&&posted)){hold=false;seen.resolve();await gate.promise}}return r.body},h.dir);await v.settle();await v.find('[data-pv="claude"]').emit('click');v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');hold=true;
 const saving=v.find('[data-subscription-save]').emit('click');await seen.promise;const input=v.find('[data-subscription-date]');input.value='2027-11-30';await input.emit('input');input.focus();gate.resolve();await saving;await v.settle();assert.equal(v.find('[data-subscription-date]').value,'2027-11-30');assert.equal(v.document.activeElement,v.find('[data-subscription-date]'));assert.equal(h.runtime.settings.billing().subscriptionDates[0]!.date,'2027-06-10');
});

for(const change of ['account','provider','project','revert'] as const)test('211a r3: delayed date receipt cannot overwrite '+change,async t=>{
 const h=await fixture(t);let account='a@example.test';h.provider.auth=async()=>({loggedIn:true,email:account});await h.runtime.settings.patch('owner',{subscriptionDates:[{vendor:'claude',account,date:'2027-02-15',plan:'Max'},{vendor:'claude',account:'b@example.test',date:'2027-03-21',plan:'Max'}]});
 const gate=deferred(),seen=deferred();let hold=false;const v=ui(async(path,body)=>{const r=await call(h.api,path,{body});if(path==='/api/billing'&&body&&hold){hold=false;seen.resolve();await gate.promise}return r.body},h.dir);await v.settle();await v.find('[data-pv="claude"]').emit('click');v.find('[data-subscription-date]').value='2027-06-10';await v.find('[data-subscription-date]').emit('input');hold=true;const saving=v.find('[data-subscription-save]').emit('click');await seen.promise;
 if(change==='account'){account='b@example.test';await v.find('[data-connections-refresh]').emit('click');v.find('[data-subscription-date]').value='2027-12-24';await v.find('[data-subscription-date]').emit('input')}
 if(change==='provider'){await v.window.emit('keydown',{key:'Escape'});await v.find('[data-pv="codex"]').emit('click')}
 if(change==='project'){await v.window.emit('pagehide')}
 if(change==='revert'){v.find('[data-subscription-date]').value='2027-02-15';await v.find('[data-subscription-date]').emit('input')}
 const toasts=v.toasts.length;gate.resolve();await saving;assert.equal(h.runtime.settings.billing().subscriptionDates.find(x=>x.account==='a@example.test')!.date,'2027-06-10');
 if(change==='account'){assert.equal(v.find('[data-subscription-date]').value,'2027-12-24');assert.match(v.find('.cbody').textContent,/b@example.test/);assert.equal(v.toasts.length,toasts)}
 if(change==='provider'){assert.match(v.find('.cbody').textContent,/Codex/);assert.equal(v.toasts.length,toasts)}
 if(change==='project'){assert.equal(v.document.querySelector('.ovl.on'),null);assert.equal(v.toasts.length,toasts)}
 if(change==='revert'){assert.equal(v.find('[data-subscription-date]').value,'2027-02-15');await v.find('[data-subscription-save]').emit('click');assert.equal(h.runtime.settings.billing().subscriptionDates.find(x=>x.account==='a@example.test')!.date,'2027-02-15')}
});


for(const moment of ['menu','post','status'] as const)test('211a r3 await audit: model '+moment+' cannot continue across project selection',async()=>{
 const gate=deferred<any>(),seen=deferred();let project='/a',callback:any,refreshes=0;
 const v=ui(async(path,body)=>{if(body){if(moment==='post'){seen.resolve();await gate.promise}return {ok:true}}return path==='/api/billing'?{ok:false}:data(project)});await v.settle();v.H.panes=[{id:'worker',vendor:'claude',model:'old',role:'worker',mode:'read'}];v.H.models={claude:[{id:'new',label:'New'}]};v.context.confirm=()=>true;v.context.LIVE.paneName=(p:any)=>p.id;v.context.LIVE.laMenu=(_el:any,_title:any,_items:any,cb:any)=>{callback=cb};v.context.LIVE.refreshStatus=async()=>{refreshes++;if(moment==='status'){seen.resolve();await gate.promise}};await v.window.emit('live:status');await v.find('[data-pick-model="worker"]').emit('click');
 const move=async()=>{project='/b';v.H.project=project;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await until(()=>v.find('[data-connections-status]').dataset.project==='/b')};
 if(moment==='menu'){await move();await callback({id:'new'});assert.equal(v.requests.some(r=>r.body),false)}else{const choosing=callback({id:'new'});await seen.promise;await move();const toasts=v.toasts.length;gate.resolve({ok:true});await choosing;assert.equal(v.toasts.length,toasts);assert.equal(refreshes,moment==='post'?0:1)}assert.equal(v.find('[data-connections-status]').dataset.project,'/b');
});

test('22h: retired provider-router and its key instructions stay absent from Connections after refresh',async t=>{
 let available=true;const h=await fixture(t,{router:{models:()=>({ok:true,models:['gpt-routed']}),health:async()=>available?{ok:true,models:['nova3'],families:['nova']}:{ok:false,reason:'offline fixture'}}});
 assert.ok((await call(h.api,'/api/connections')).body.providers.some((p:any)=>p.id==='router'),'legacy engine response still carries the retired row');
 const v=ui(async(path,body)=>(await call(h.api,path,{body})).body,h.dir);await v.settle();
 for(const connected of [true,false]){available=connected;await v.find('[data-connections-refresh]').emit('click');await v.settle();assert.equal(v.document.querySelector('[data-pv="router"]'),null);assert.doesNotMatch(v.find('#v-list').textContent,/provider-router|127\.0\.0\.1:11435/);assert.doesNotMatch(v.find('#v-keys').textContent,/Роутер провайдеров|настройках локального роутера/);assert.ok(v.find('[data-pv="claude"]'));assert.ok(v.find('[data-pv="codex"]'));}
 assert.equal(h.codex.calls.length,0);
});
