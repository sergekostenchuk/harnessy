import test from 'node:test';
import assert from 'node:assert/strict';
import {deferred} from './test-helpers.ts';
import {networkUi} from './network-ui-test-helpers.ts';
const opts={timeout:15000};
const exit={config:{id:'proxy',label:'Амстердам <img src=x>',type:'proxy',url:'http://proxy.invalid'},revision:'one',password:{present:false}};
const program={id:'claude',title:'Claude',kind:'subscription',binary:'claude',installed:true,checking:false,version:'1.0',login:{state:'ok',command:'claude',checkedAt:100},models:[{id:'default',label:'Default'}],capabilities:{headless:true,resume:false,mcp:false,limits:false,probe:{ok:true}}};
const base=(path:string)=>path==='/api/providers/catalog'?{ok:true,providers:[program]}:path==='/api/connections'?{ok:true,project:'/one',providers:[],routes:['direct','proxy','iface']}:path.endsWith('/exits')?{ok:true,exits:[exit]}:path==='/api/network/providers/claude'?{ok:true,provider:'claude',configured:true,exits:['proxy'],revision:'chain'}:{ok:false};
// TS-23f replaces the three obsolete batch-check screen tests. Backend batch
// routes remain covered by network-provider-checks.test.ts, with no API change.
test('23f: inventory checks one proxy; obsolete batch controls and legacy connection checks are absent',opts,async()=>{
 const v=networkUi(async(path)=>path.endsWith('/proxy/check')?{ok:true,check:{ok:true,revision:'one',ip:'192.0.2.1',country:'Нидерланды',durationMs:24}}:base(path),true);await v.flush();
 assert.equal(v.requests.some(r=>r.body),false);assert.equal(v.document.querySelector('[data-net-batch]'),null);assert.equal(v.document.querySelector('[data-net-check-action]'),null);assert.equal(v.document.querySelector('[data-rcheck]'),null);
 assert.match(v.find('.row.head').textContent,/через что/);assert.equal(v.find('[data-net-overview="count"]').textContent,'1');assert.match(v.find('[data-net-summary="claude"]').textContent,/Амстердам/);assert.equal(v.document.querySelector('[data-net-summary] img'),null);
 await v.click('[data-net-check="proxy"]');assert.deepEqual(v.requests.filter(r=>r.body).map(r=>r.path),['/api/network/exits/proxy/check']);assert.match(v.find('[data-net-check-result="proxy"]').textContent,/192\.0\.2\.1/);assert.equal(v.requests.some(r=>r.path.includes('/checks')||r.path==='/api/connections/check'),false);
 await v.click('[data-net-edit="proxy"]');assert.match(v.find('.network-dialog').textContent,/Изменить прокси/);assert.equal(v.document.querySelector('[data-net-field="id"]'),null);assert.doesNotMatch(v.find('.network-dialog').textContent,/Добавить выход|Сохранить выход|Маршрут/);
});
test('23f: provider probe and permission display the selected connection; no model before explicit approval',opts,async()=>{
 const v=networkUi(async(path)=>path.endsWith('/probe')?{ok:true,provider:'claude',model:'default',approvalId:'probe-one',status:'awaiting_approval',price:{kind:'subscription',label:'расходуется подписка'}}:path==='/api/approve'?{ok:true}:base(path),true);await v.flush();await v.click('[data-pv="claude"]');
 assert.match(v.find('.cbody [data-net-probe]').textContent,/через прокси «Амстердам/);assert.equal(v.document.querySelector('.cbody img'),null);await v.click('[data-program-probe]');assert.match(v.find('.conn-trial-dialog [data-net-probe]').textContent,/через прокси «Амстердам/);assert.equal(v.requests.some(r=>r.path==='/api/approve'),false);
 await v.click('[data-program-cancel]');assert.deepEqual(v.requests.filter(r=>r.path==='/api/approve').map(r=>r.body.decision),['deny']);
 await v.click('[data-program-probe]');await v.click('[data-program-confirm]');assert.deepEqual(v.requests.filter(r=>r.path==='/api/approve').map(r=>r.body.decision),['deny','allow']);
});
test('23f: pending, failed, explicitly stopped and direct connections never borrow a misleading probe label',opts,async()=>{
 const gate=deferred<any>();let pending=true,mode='proxy';const v=networkUi(async path=>path==='/api/network/providers/claude'?pending?gate.promise:mode==='error'?{ok:false,error:'offline'}:{ok:true,provider:'claude',configured:mode!=='direct',exits:mode==='proxy'?['proxy']:[],revision:'chain'}:base(path));await v.flush();v.L.network.setProviders('programs',[{id:'claude',title:'Claude'}]);const holder=v.document.createElement('div');holder.innerHTML=v.L.network.probeLabel('claude');v.body.appendChild(holder);assert.match(holder.textContent,/читаю подключение/);
 pending=false;gate.resolve(base('/api/network/providers/claude'));await v.flush();assert.match(holder.textContent,/через прокси/);
 mode='error';await v.click('[data-net-refresh]');assert.equal(holder.textContent,'подключение не прочитано');mode='stopped';await v.L.network.refresh('claude');assert.equal(holder.textContent,'подключение остановлено');mode='direct';await v.L.network.refresh('claude');assert.equal(holder.textContent,'напрямую — сервис видит ваш адрес');assert.equal(v.requests.some(r=>r.body),false);
});

test('23f: explicit direct is named directly even when its stored legacy label mentions a route',opts,async()=>{
 const v=networkUi(async path=>path.endsWith('/exits')?{ok:true,exits:[{config:{id:'legacy-claude',label:'Напрямую · прежний маршрут Claude',type:'direct'},revision:'one',password:{present:false}}]}:path==='/api/network/providers/claude'?{ok:true,provider:'claude',configured:true,exits:['legacy-claude'],revision:'chain'}:base(path),true);await v.flush();assert.equal(v.find('[data-net-summary="claude"]').textContent,'напрямую');assert.equal(v.find('[data-net-overview="count"]').textContent,'0');assert.equal(v.requests.some(r=>r.body),false);
});
