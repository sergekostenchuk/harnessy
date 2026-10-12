import test from 'node:test';
import assert from 'node:assert/strict';
import {networkUi} from './network-ui-test-helpers.ts';
import {deferred} from './test-helpers.ts';
const opts={timeout:15000};
const row={provider:'api:demo',title:'<Demo>',exit:'proxy',exitLabel:'Прокси A',model:'m1',action:'IP и страна → ответ до 1 токена',price:{kind:'unknown',label:'Цена неизвестна'},result:{state:'pending',ip:null,country:null,latencyMs:null,durationMs:null,response:null}};
const plan={id:'plan1',project:'/one',createdAt:1,revision:0,state:'preview',rows:[row]},exit={config:{id:'proxy',label:'Прокси A',type:'proxy',url:'http://proxy.invalid'},revision:'one',password:{present:false}};
const base=(path:string)=>path.endsWith('/exits')?{ok:true,exits:[exit]}:{ok:true,check:null};
test('22f: preview lists calls and price; one explicit click starts, SSE wins over an older HTTP receipt, cancellation and result stay visible',opts,async()=>{
 const gate=deferred<any>(),entered=deferred();let starts=0,cancels=0;
 const v=networkUi(async(path,body)=>{if(path.endsWith('/preview'))return {ok:true,check:structuredClone(plan)};if(path.endsWith('/start')){starts++;assert.deepEqual(JSON.parse(JSON.stringify(body)),{project:'/one',decision:'allow'});entered.resolve();return gate.promise}if(path.endsWith('/cancel')){cancels++;return {ok:true,check:{...plan,revision:4,state:'cancelled'}}}return base(path)});await v.flush();await v.click('[data-net-batch]');assert.equal(starts,0);assert.match(v.find('.network-dialog').textContent,/Цена неизвестна/);assert.match(v.find('.network-dialog').innerHTML,/&lt;Demo&gt;/);assert.match(v.find('.network-dialog').textContent,/api.ipify.org/);
 const launching=v.click('[data-net-check-action="start"]');await entered.promise;await v.click('[data-net-check-action="start"]');assert.equal(starts,1);
 await v.event({type:'networkCheck',check:{...plan,revision:3,state:'running',rows:[{...row,result:{...row.result,state:'running',ip:'192.0.2.1',country:'Germany'}}]}});gate.resolve({ok:true,check:{...plan,revision:1,state:'running'}});await launching;assert.match(v.find('.network-dialog').textContent,/192.0.2.1/);await v.click('[data-net-check-action="cancel"]');assert.equal(cancels,1);assert.match(v.find('.network-dialog').textContent,/Проверка отменена/);
});
test('22f: stale project responses and events never reopen or repopulate another project dialog; failed approval remains actionable',opts,async()=>{
 const gate=deferred<any>(),entered=deferred();let delay=false;
 const v=networkUi(async(path)=>{if(path.endsWith('/preview'))return {ok:true,check:structuredClone(plan)};if(path.endsWith('/start')){if(delay){entered.resolve();return gate.promise}return {ok:false,code:'binding_changed',error:'Вход изменился'}}return base(path)});await v.flush();await v.click('[data-net-batch]');await v.click('[data-net-check-action="start"]');assert.match(v.find('[data-net-message]').textContent,/binding_changed/);assert.equal(v.find('[data-net-check-action="start"]').disabled,false);
 delay=true;const running=v.click('[data-net-check-action="start"]');await entered.promise;await v.change();gate.resolve({ok:true,check:{...plan,state:'running',revision:1}});await running;assert.equal(v.document.querySelector('.network-dialog'),null);await v.event({type:'networkCheck',check:{...plan,state:'done',revision:2}});assert.equal(v.document.querySelector('.network-dialog'),null);
});
test('22f: closing the dialog does not confirm; reopen restores current results without creating another paid run',opts,async()=>{
 let current:any=null,previews=0,starts=0;
 const v=networkUi(async(path)=>{if(path.endsWith('/preview')){previews++;current=structuredClone(plan);return {ok:true,check:current}}if(path.endsWith('/start')){starts++;return {ok:true,check:current}}if(path.includes('/checks?'))return {ok:true,check:current};return base(path)});await v.flush();await v.click('[data-net-batch]');await v.window.emit('keydown',{key:'Escape'});assert.equal(starts,0);current={...plan,state:'done',revision:4,rows:[{...row,result:{...row.result,state:'done',response:true,ip:'192.0.2.5',country:'Germany',latencyMs:30}}]};await v.click('[data-net-batch]');assert.equal(previews,1);assert.equal(starts,0);assert.match(v.find('.network-dialog').textContent,/192.0.2.5/);assert.match(v.find('.network-dialog').textContent,/Да/);
});
