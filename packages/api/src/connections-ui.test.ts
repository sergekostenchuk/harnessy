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
