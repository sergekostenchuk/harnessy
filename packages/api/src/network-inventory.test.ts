import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call,deferred} from './test-helpers.ts';
import {networkUi} from './network-ui-test-helpers.ts';
import {MemoryKeys} from '../../llm/src/test-helpers.ts';
import {networkRevision} from '@harnessy/projects';
const opts={timeout:15000},base='/api/network';
async function setup(t:Parameters<typeof fixture>[0]){
 const h=await fixture(t,{deps:{networkKeys:new MemoryKeys()}});
 await h.runtime.settings.changeNetwork(async n=>{n.migrated=true;n.legacyLabelsVersion=1;n.exits.a={id:'a',label:'Основной',type:'proxy',url:'http://a.invalid:8080'};n.exits.b={id:'b',label:'Запасной',type:'proxy',url:'http://b.invalid:8080'};n.chains.claude=['a','b'];n.chains.codex=['a'];n.chains['api:fixture']=['b','a'];return {result:undefined}});return h;
}
const deletion=(r:any)=>({revision:r.revision,confirmation:{networkRevision:r.networkRevision,chains:r.chains}});
test('23a: removal preview is read-only; one confirmed transaction advances main, removes reserve and explicitly records direct',opts,async t=>{
 const h=await setup(t),bytes=readFileSync(join(h.dir,'owner-settings.json'),'utf8'),preview=await call(h.api,base+'/exits/a/removal');assert.equal(preview.status,200);assert.equal(readFileSync(join(h.dir,'owner-settings.json'),'utf8'),bytes);
 assert.deepEqual(preview.body.changes.map((c:any)=>[c.provider,c.reserve,c.direct]),[['claude',false,false],['codex',false,true],['api:fixture',true,false]]);
 assert.equal((await call(h.api,base+'/exits/a/delete',{body:{revision:preview.body.revision}})).body.code,'exit_in_use');assert.equal(readFileSync(join(h.dir,'owner-settings.json'),'utf8'),bytes);
 assert.equal((await call(h.api,base+'/exits/a/delete',{body:deletion(preview.body)})).status,200);const config=h.runtime.settings.network();assert.equal(config.exits.a,undefined);assert.deepEqual(config.chains.claude,['b']);assert.deepEqual(config.chains['api:fixture'],['b']);assert.equal(config.exits[config.chains.codex![0]!]!.type,'direct');assert.notDeepEqual(config.chains.codex,[]);
});
test('23a: stale or forged removal receipts cannot change any provider; newly affected providers must be confirmed',opts,async t=>{
 const h=await setup(t),preview=(await call(h.api,base+'/exits/a/removal')).body;
 for(const confirmation of [null,{}, {networkRevision:preview.networkRevision,chains:{}},{...deletion(preview).confirmation,extra:true}]){assert.equal((await call(h.api,base+'/exits/a/delete',{body:{revision:preview.revision,confirmation}})).body.code,'network_conflict');assert.ok(h.runtime.settings.network().exits.a)}
 await h.runtime.settings.changeNetwork(async n=>{n.chains.gemini=['a'];return {result:undefined}});const bytes=readFileSync(join(h.dir,'owner-settings.json'),'utf8');assert.equal((await call(h.api,base+'/exits/a/delete',{body:deletion(preview)})).body.code,'network_conflict');assert.equal(readFileSync(join(h.dir,'owner-settings.json'),'utf8'),bytes);
 for(const path of ['/exits/a/removal','/exits/a/delete'])assert.equal((await call(h.api,base+path,{headers:{'x-harness-pane':'worker'},...(path.endsWith('delete')?{body:deletion(preview)}:{})})).status,403);
});
test('23a: a concurrent chain edit wins before removal lock and deletion fails without partial writes',opts,async t=>{
 const h=await setup(t),preview=(await call(h.api,base+'/exits/a/removal')).body,entered=deferred(),release=deferred();t.after(()=>release.resolve());
 const saving=h.runtime.settings.changeNetwork(async n=>{entered.resolve();await release.promise;n.chains.codex=['b'];return {result:undefined}});await entered.promise;const removing=call(h.api,base+'/exits/a/delete',{body:deletion(preview)});release.resolve();await saving;assert.equal((await removing).body.code,'network_conflict');assert.ok(h.runtime.settings.network().exits.a);assert.deepEqual(h.runtime.settings.network().chains.codex,['b']);
});
const rows=[{config:{id:'vps',label:'Нидерланды',type:'ssh',user:'root',host:'vps.example',port:22,keyPath:'~/.ssh/key'},revision:'one',password:{present:false},lastCheck:{ok:true,ip:'192.0.2.1',country:'Нидерланды',durationMs:48,checkedAt:Date.now()}},{config:{id:'backup',label:'Амстердам',type:'proxy',url:'socks5h://proxy.example:1080'},revision:'two',password:{present:false},lastCheck:{ok:true,ip:'192.0.2.2',country:'Нидерланды',durationMs:61,checkedAt:Date.now()}},{config:{id:'down',label:'Хельсинки',type:'ssh',user:'root',host:'down.example',port:22,keyPath:'~/.ssh/key'},revision:'three',password:{present:false},lastCheck:{ok:false,code:'ssh_auth_failed',reason:'Сервер не принял ключ'}}];
const metrics=(values:any={})=>Object.fromEntries(['speedBps','bytes','bytesUp','bytesDown','availabilityPct','failures','costUsd','latencyP50Ms','latencyP95Ms','http429','blocks','ipChanges','countryChanges','reserveMs','tunnelRestarts'].map(k=>[k,{value:values[k]??null,reason:values[k]===undefined?'Нет измерений':null}]));
const stats=()=>({ok:true,source:'connected',period:'today',from:0,to:Date.now(),generatedAt:Date.now(),exits:[{exitId:'vps',label:'Нидерланды',metrics:metrics({bytes:1.2e9,speedBps:3e6,failures:0}),series:[]}],providers:[]});
const response=(path:string)=>path.endsWith('/exits')?{ok:true,exits:structuredClone(rows)}:path.startsWith(base+'/stats')?stats():path.includes('/providers/')?{ok:true,provider:decodeURIComponent(path.split('/').at(-1)!),configured:true,exits:path.endsWith('claude')?['vps','backup']:['vps'],revision:'chain'}:{ok:false,error:'Недоступно'};
test('23a: frame 9 cards use measured data, reserve names and human reasons; IP checks are explicit',opts,async()=>{
 const v=networkUi(async path=>response(path));await v.flush();v.L.network.setProviders('programs',[{id:'claude',title:'Claude'},{id:'codex',title:'Codex'}]);await v.flush();assert.equal(v.find('[data-v="exits"]').textContent,'Прокси и VPS');
 const working=v.find('[data-proxy-id="vps"]');assert.match(working.textContent,/Нидерландыработает.*VPS по SSH · root@vps.example.*192.0.2.1 · Нидерланды · 48 мс.*проверено.*Claude · Codex.*1,2 ГБ · 24 Мбит\/с · падений не было/);
 assert.match(v.find('[data-proxy-id="backup"]').textContent,/прокси · socks5 · proxy.example:1080.*Claude — запасной.*ещё не использовался/);assert.match(v.find('[data-proxy-id="down"]').textContent,/не отвечает.*никто.*сервер не принял ключ/i);assert.doesNotMatch(v.find('[data-proxy-id="down"]').textContent,/ssh_auth_failed/);
 assert.equal(v.find('[data-net-check="vps"]').disabled,false);assert.equal(v.requests.some(r=>r.body),false);assert.ok(v.find('.proxy-footer a').getAttribute('href')?.includes('05-spend.html#proxy'));assert.ok(v.find('.proxy-add'));await v.click('[data-net-check="vps"]');assert.equal(v.requests.filter(r=>r.path.endsWith('/vps/check')).length,1);
});
test('23a: unknown and failed statistics never invent zero or working status; late stats keep editor and focus',opts,async()=>{
 let failed=false;const v=networkUi(async path=>path.startsWith(base+'/stats')&&failed?{ok:false,error:'offline'}:path.endsWith('/exits')?{ok:true,exits:[{...rows[0],lastCheck:null}]}:response(path));await v.flush();assert.match(v.find('[data-proxy-id="vps"]').textContent,/ещё не проверен/);await v.click('[data-net-edit="vps"]');await v.input('label','Unsaved');const field=v.find('[data-net-field="label"]');field.focus();failed=true;await v.L.networkStats.refresh(true);assert.match(v.find('[data-net-today="vps"]').textContent,/1,2 ГБ.*не удалось обновить/);assert.equal(v.find('[data-net-field="label"]').value,'Unsaved');assert.equal(v.document.activeElement,field);
 const empty=networkUi(async path=>path.startsWith(base+'/stats')?{...stats(),exits:[]}:path.endsWith('/exits')?{ok:true,exits:[]}:response(path));await empty.flush();assert.equal(empty.document.querySelectorAll('[data-proxy-id]').length,0);assert.ok(empty.find('.proxy-add'));assert.doesNotMatch(empty.find('[data-net-list]').textContent,/ГБ|Мбит/);
});
test('23a: card and editor delete share explicit consequence confirmation; stale receipt demands a new confirmation',opts,async()=>{
 let posts=0;const preview={ok:true,id:'vps',label:'Нидерланды',revision:'one',networkRevision:'net1',chains:{claude:'chain'},changes:[{provider:'claude',exits:['direct'],direct:true,reserve:false,label:'Напрямую'}]};
 const v=networkUi(async(path,body)=>path.endsWith('/removal')?preview:path.endsWith('/delete')?(posts++,{ok:false,code:'network_conflict'}):response(path));await v.flush();v.L.network.setProviders('programs',[{id:'claude',title:'Claude'}]);await v.flush();await v.click('[data-net-delete="vps"]');assert.match(v.find('.network-dialog').textContent,/Claude перейдёт на напрямую — сервис увидит ваш адрес/);assert.equal(posts,0);await v.click('[data-net-close]');assert.equal(posts,0);
 await v.click('[data-net-edit="vps"]');await v.click('[data-net-action="delete"]');await v.click('[data-net-action="confirm-delete"]');assert.equal(posts,1);assert.match(v.find('[data-net-message]').textContent,/подтвердите новые изменения/);assert.equal(v.find('[data-net-action="confirm-delete"]').disabled,true);await v.click('[data-net-action="reload"]');assert.equal(v.find('[data-net-action="confirm-delete"]').disabled,false);
});
test('23a: delayed removal preview cannot cross projects or restore a closed dialog',opts,async()=>{
 const late=deferred<any>(),seen=deferred(),v=networkUi(async path=>path.endsWith('/removal')?(seen.resolve(),late.promise):response(path));await v.flush();const opening=v.click('[data-net-delete="vps"]');await seen.promise;await v.change();late.resolve({ok:true,id:'vps',revision:'one',networkRevision:'old',chains:{},changes:[],label:'OLD'});await opening;await v.flush();assert.equal(v.document.querySelector('.network-dialog'),null);assert.equal(v.requests.some(r=>r.path.endsWith('/delete')),false);
});
test('23a: SSH check calls the tunnel manager, passes only its loopback SOCKS URL and retains revision protection',opts,async t=>{
 const seen:any[]=[],ensured:any[]=[],h=await fixture(t,{deps:{networkKeys:new MemoryKeys(),sshTunnels:{ensure:async(id,config)=>{ensured.push({id,config});return {id,state:'up',url:'socks5h://127.0.0.1:34567',generation:1,code:null,reason:null,retryAt:null}},get:()=>null,snapshots:()=>[],subscribe:()=>()=>true,stop:async()=>{},close:async()=>{}},networkCheckOptions:{execute:async req=>{seen.push(req);return {code:0,signal:null,stderr:'',stdout:req.input?.includes('ipapi.co')?'{"country_name":"Fixture"}\n0.02':'{"ip":"192.0.2.1"}\n0.04'}}}}});
 await h.runtime.settings.changeNetwork(async n=>{n.migrated=true;n.legacyLabelsVersion=1;n.exits.vps=rows[0]!.config as any;return {result:undefined}});const revision=networkRevision(h.runtime.settings.network().exits.vps),r=await call(h.api,base+'/exits/vps/check',{body:{revision}});assert.equal(r.status,200);assert.equal(r.body.check.ok,true);assert.equal(r.body.check.country,'Fixture');assert.equal(ensured.length,1);assert.equal(seen.length,2);for(const req of seen)assert.match(req.input,/proxy = "socks5h:\/\/127.0.0.1:34567"/);assert.equal((await call(h.api,base+'/exits')).body.exits[0].lastCheck.ok,true);assert.equal((await call(h.api,base+'/exits/vps/check',{body:{revision:'old'}})).body.code,'network_conflict');assert.equal(ensured.length,1);
});

test('23a: the inventory always requests today even with a spending-period URL; public strings remain text',opts,async()=>{
 const v=networkUi(async path=>path.endsWith('/exits')?{ok:true,exits:[{...rows[0],config:{...rows[0]!.config,label:'<img src=x onerror=alert(1)>'}}]}:response(path),false,'/one','?proxyPeriod=week');await v.flush();assert.ok(v.requests.some(r=>r.path===base+'/stats?period=today'));assert.equal(v.requests.some(r=>r.path.includes('period=week')),false);assert.equal(v.find('[data-net-list]').querySelector('img'),null);assert.match(v.find('[data-proxy-id="vps"] h3').textContent,/<img/);
});
