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

test('171: real sketch route controls use HTTP, preserve blocks and report direct/proxy/interface plus actual checks',async t=>{
 const temp=mkdtempSync(join(tmpdir(),'harnessy-conn-ui-'));t.after(()=>rmSync(temp,{recursive:true,force:true}));let fail=false,ip='1.2.3.4',curlCalls=0;
 const connections=new Connections(join(temp,'routes.json'),{curl:async args=>{curlCalls++;return fail?{code:1,stdout:'',stderr:'fixture offline'}:args.at(-1)!.includes('ipapi.co')?{code:0,stdout:'{"country_name":"Test"}',stderr:''}:{code:0,stdout:JSON.stringify({ip})+'\n0.025',stderr:''}}});
 const h=await fixture(t,{deps:{connections}}),v=ui(async(path,body)=>(await call(h.api,path,{body})).body,h.dir);await v.settle();const blocks=['#v-list .sum','#v-list .list','#v-roles .rl','#v-roles .note','#v-keys .wrap'].map(s=>v.find(s));assert.match(v.find('#v-list .list').textContent,/Не проверено/);
 await v.find('[data-pv="claude"]').emit('click');assert.equal(curlCalls,0,'opening a card does not perform network diagnostics');assert.equal(v.find('[data-rapply]').disabled,true);
 await v.find('[data-rv="proxy"]').emit('click');const input=v.find('[data-rf="proxy"]');input.value='http://127.0.0.1:8080';await input.emit('input');await v.find('[data-rapply]').emit('click');assert.equal(connections.get('claude').route,'proxy');assert.equal(h.provider.resets,1);assert.equal(v.requests.filter(r=>r.path==='/api/connections/route').length,1);
 await v.find('[data-rcheck]').emit('click');assert.match(v.find('#v-list .list').textContent,/Проверено/);assert.match(v.find('.cbody').textContent,/1\.2\.3\.4/);
 ip='2.3.4.5';await v.find('[data-rcheck]').emit('click');assert.match(v.find('.cbody').textContent,/Выход изменился/);
 const expect=v.find('[data-rf="expect"]');expect.value=ip;await expect.emit('input');await v.find('[data-rapply]').emit('click');await v.find('[data-rcheck]').emit('click');assert.match(v.find('.cbody').textContent,/Совпадает с ожидаемым/);
 ip='9.9.9.9';await v.find('[data-rcheck]').emit('click');assert.match(v.find('.cbody').textContent,/Не совпадает с ожидаемым/);
 fail=true;await v.find('[data-rcheck]').emit('click');assert.match(v.find('#v-list .list').textContent,/Проверка не удалась/);assert.match(v.find('.cbody').textContent,/fixture offline/);
 await v.find('[data-rv="iface"]').emit('click');v.find('[data-rf="iface"]').value='utun4';await v.find('[data-rf="iface"]').emit('input');await v.find('[data-rapply]').emit('click');assert.match(v.find('.cbody').textContent,/только проверка выхода/);assert.equal(connections.get('claude').iface,'utun4');
 await v.find('[data-rv="direct"]').emit('click');await v.find('[data-rapply]').emit('click');assert.equal(connections.get('claude').route,'direct');assert.equal(h.provider.calls.length,0);for(const block of blocks)assert.ok(v.document.contains(block));
 for(const path of ['/api/connections/route','/api/connections/check']){const denied=await call(h.api,path,{body:{project:'/other',provider:'claude',route:'direct'}});assert.equal(denied.status,409);assert.equal(denied.body.code,'project_changed')}
});

for(const bad of [null,{ok:false,error:'offline'},{...data(),project:'/wrong'},{...data(),providers:[{...data().providers[0],route:null}]},{...data(),providers:[{...data().providers[0],id:'claude\" onclick=\"bad'}]}])test('171: malformed/missing connection data is an error with recovery, never a fabricated route: '+JSON.stringify(bad),async()=>{
 let broken=false;const v=ui(async path=>path==='/api/connections'?broken?bad:data():{ok:false});await v.settle();await v.find('[data-pv="claude"]').emit('click');broken=true;await v.find('[data-connections-refresh]').emit('click');assert.match(v.find('[data-connections-status]').textContent,/Подключения не прочитаны/);assert.equal(v.find('[data-rcheck]').disabled,true);await v.find('[data-rcheck]').emit('click');assert.equal(v.requests.some(r=>r.body),false);
 broken=false;await v.find('[data-connections-refresh]').emit('click');assert.equal(v.find('[data-rcheck]').disabled,false);
});

test('171: a delayed check coalesces clicks and cannot redraw a different provider/project or cached page',async()=>{
 let project='/a';const gate=deferred<any>(),seen=deferred();const v=ui(async(path,body)=>{if(body){seen.resolve();return gate.promise}return path==='/api/connections'?data(project):{ok:false}});await v.settle();await v.find('[data-pv="claude"]').emit('click');const first=v.find('[data-rcheck]').emit('click');await seen.promise;assert.equal(v.find('[data-rcheck]').disabled,true);await v.find('[data-rcheck]').emit('click');assert.equal(v.requests.filter(r=>r.body).length,1);
 project='/b';v.H.project=project;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await until(()=>v.find('[data-connections-status]').dataset.project==='/b');await v.find('[data-pv="claude"]').emit('click');gate.resolve({...data('/a'),provider:'claude',route:route(),check:{state:'checked',ok:true,ip:'OLD'}});await first;assert.doesNotMatch(v.find('.cbody').textContent,/OLD/);assert.equal(v.toasts.length,0);assert.equal(v.find('[data-rcheck]').disabled,false);
 await v.window.emit('pagehide');project='/c';v.H.project=project;v.H.confirmedProjectGeneration++;await v.window.emit('pageshow',{persisted:true});await v.settle();assert.equal(v.find('[data-connections-status]').dataset.project,'/c');assert.equal(v.requests.filter(r=>r.body).length,1);
});

test('171: a late snapshot cannot overwrite a saved route and failed route writes keep a usable draft',async()=>{
 let snapshot=data(),hold=false,fail=true;const gate=deferred<any>(),seen=deferred();const v=ui(async(path,body)=>{if(path==='/api/billing')return {ok:false};if(body){if(fail)return {ok:false,error:'invalid proxy'};snapshot=data('/a',body);return {ok:true,project:'/a',provider:'claude',route:snapshot.providers[0]!.route,applies:'со следующего хода'}}if(hold){hold=false;seen.resolve();return gate.promise}return snapshot});await v.settle();await v.find('[data-pv="claude"]').emit('click');await v.find('[data-rv="proxy"]').emit('click');v.find('[data-rf="proxy"]').value='http://localhost:8080';await v.find('[data-rf="proxy"]').emit('input');await v.find('[data-rapply]').emit('click');assert.match(v.toasts.at(-1)!,/invalid proxy/);assert.equal(v.find('[data-rapply]').disabled,false);
 hold=true;const old=v.find('[data-connections-refresh]').emit('click');await seen.promise;fail=false;await v.find('[data-rapply]').emit('click');gate.resolve(data());await old;assert.match(v.find('#v-list .list').textContent,/localhost:8080/);assert.equal(v.find('[data-rapply]').disabled,true);
});

for(const reopen of ['closed','claude','codex'])test('TS-15e r2/2: saved route refreshes the snapshot after Escape with '+reopen+' card',async t=>{
 const h=await fixture(t),gate=deferred(),seen=deferred();const v=ui(async(path,body)=>{const r=await call(h.api,path,{body});if(path==='/api/connections/route'&&body){seen.resolve();await gate.promise}return r.body},h.dir);await v.settle();await v.find('[data-pv="claude"]').emit('click');await v.find('[data-rv="proxy"]').emit('click');v.find('[data-rf="proxy"]').value='http://127.0.0.1:8080';await v.find('[data-rf="proxy"]').emit('input');
 const saving=v.find('[data-rapply]').emit('click');await seen.promise;const reads=v.requests.filter(r=>r.path==='/api/connections').length;await v.window.emit('keydown',{key:'Escape'});if(reopen!=='closed')await v.find('[data-pv="'+reopen+'"]').emit('click');const otherCard=reopen==='codex'?v.find('.cbody').innerHTML:null;
 gate.resolve();await saving;await v.settle();assert.equal(h.runtime.connections.get('claude').route,'proxy');assert.match(v.find('[data-pv="claude"]').textContent,/127\.0\.0\.1:8080/);assert.ok(v.requests.filter(r=>r.path==='/api/connections').length>reads);assert.equal(v.requests.filter(r=>r.path==='/api/connections/route').length,1);
 if(reopen==='codex')assert.equal(v.find('.cbody').innerHTML,otherCard,'updating Claude must not replace the Codex dialog');if(reopen==='closed')assert.equal(v.document.querySelector('.ovl.on'),null);if(reopen!=='claude'){await v.window.emit('keydown',{key:'Escape'});await v.find('[data-pv="claude"]').emit('click')}
 assert.match(v.find('.cbody').textContent,/127\.0\.0\.1:8080/);assert.equal(v.find('[data-rapply]').disabled,true);assert.equal(h.provider.calls.length,0);
});

for(const reopen of ['claude','codex','closed'])test('211a: follow-up GET refreshes a reopened '+reopen+' card after route POST',async t=>{
 const h=await fixture(t),gate=deferred(),seen=deferred();let hold=false;
 const v=ui(async(path,body)=>{const r=await call(h.api,path,{body});if(path==='/api/connections'&&hold){hold=false;seen.resolve();await gate.promise}return r.body},h.dir);
 await v.settle();await v.find('[data-pv="claude"]').emit('click');await v.find('[data-rv="proxy"]').emit('click');v.find('[data-rf="proxy"]').value='http://127.0.0.1:8080';await v.find('[data-rf="proxy"]').emit('input');
 hold=true;const saving=v.find('[data-rapply]').emit('click');await seen.promise;await v.window.emit('keydown',{key:'Escape'});if(reopen!=='closed')await v.find('[data-pv="'+reopen+'"]').emit('click');
 gate.resolve();await saving;await v.settle();assert.equal(h.runtime.connections.get('claude').route,'proxy');assert.match(v.find('[data-pv="claude"]').textContent,/127\.0\.0\.1:8080/);
 if(reopen==='closed')assert.equal(v.document.querySelector('.ovl.on'),null);else if(reopen==='codex'){assert.match(v.find('.cbody').textContent,/Codex/);assert.doesNotMatch(v.find('.cbody').textContent,/127\.0\.0\.1:8080/)}else{assert.match(v.find('.cbody').textContent,/Сейчас.*127\.0\.0\.1:8080/);assert.equal(v.find('[data-rf="proxy"]').value,'http://127.0.0.1:8080');assert.equal(v.find('[data-rapply]').disabled,true)}
 assert.equal(v.requests.filter(r=>r.path==='/api/connections/route').length,1);assert.equal(h.provider.calls.length,0);
});

test('211a: accepted snapshot updates current route while preserving edits made in the reopened card',async()=>{
 const gate=deferred<any>(),seen=deferred();let hold=false;const v=ui(async path=>{if(path==='/api/billing')return {ok:false};if(hold){hold=false;seen.resolve();return gate.promise}return data()});await v.settle();await v.find('[data-pv="claude"]').emit('click');hold=true;const loading=v.find('[data-connections-refresh]').emit('click');await seen.promise;
 await v.window.emit('keydown',{key:'Escape'});await v.find('[data-pv="claude"]').emit('click');await v.find('[data-rv="iface"]').emit('click');v.find('[data-rf="iface"]').value='utun5';await v.find('[data-rf="iface"]').emit('input');v.find('[data-rf="label"]').value='my draft';await v.find('[data-rf="label"]').emit('input');
 gate.resolve(data('/a',{route:'proxy',proxy:'http://127.0.0.1:8080'}));await loading;assert.match(v.find('.cbody').textContent,/Сейчас.*127\.0\.0\.1:8080/);assert.equal(v.find('[data-rf="iface"]').value,'utun5');assert.equal(v.find('[data-rf="label"]').value,'my draft');assert.equal(v.find('[data-rapply]').disabled,false);assert.equal(v.requests.some(r=>r.body),false);
});

test('211a: delayed follow-up GET cannot refresh a card of the next project',async()=>{
 const gate=deferred<any>(),seen=deferred();let project='/a',hold=false;const v=ui(async path=>{if(path==='/api/billing')return {ok:false};if(hold){hold=false;seen.resolve();return gate.promise}return data(project)});await v.settle();await v.find('[data-pv="claude"]').emit('click');hold=true;const loading=v.find('[data-connections-refresh]').emit('click');await seen.promise;
 project='/b';v.H.project=project;v.H.confirmedProjectGeneration++;await v.window.emit('live:status');await until(()=>v.find('[data-connections-status]').dataset.project==='/b');await v.find('[data-pv="claude"]').emit('click');gate.resolve(data('/a',{route:'proxy',proxy:'http://old.invalid:8080'}));await loading;assert.equal(v.find('[data-connections-status]').dataset.project,'/b');assert.doesNotMatch(v.find('.cbody').textContent,/old\.invalid/);assert.equal(v.find('[data-rapply]').disabled,true);
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

test('302: real Connections markup uses router health and exact via metadata rather than model name patterns',async t=>{
 let available=true;const h=await fixture(t,{router:{models:()=>({ok:true,models:['gpt-routed']}),health:async()=>available?{ok:true,models:['nova3'],families:['nova']}:{ok:false,reason:'offline fixture'}}});h.codex.models=async()=>[{id:'gpt-routed',label:'Routed GPT'},{id:'qwen-unrelated',label:'Native custom model'}];
 const v=ui(async(path,body)=>(await call(h.api,path,{body})).body,h.dir);v.H.models=(await call(h.api,'/api/status')).body.models;await v.settle();assert.match(v.find('[data-pv="router"]').textContent,/provider-router.*локально · 127.0.0.1:11435 · nova/);
 await v.find('[data-pv="router"]').emit('click');assert.match(v.find('.cbody').textContent,/Routed GPT/);assert.doesNotMatch(v.find('.cbody').textContent,/Native custom model/);available=false;await v.find('[data-recheck]').emit('click');await v.settle();assert.match(v.find('[data-pv="router"]').textContent,/нет данных · offline fixture/);assert.doesNotMatch(v.find('[data-pv="router"]').textContent,/null|нет входа/);assert.equal(h.codex.calls.length,0);
});
