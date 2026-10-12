import test from 'node:test';
import assert from 'node:assert/strict';
import {networkUi} from './network-ui-test-helpers.ts';
import {deferred} from './test-helpers.ts';
const opts={timeout:15000};
const exits={ok:true,exits:[{config:{id:'proxy',label:'Основной прокси',type:'proxy',url:'https://proxy.test'},revision:'exit-1',password:{present:false}}]};
const chain=(id:string)=>({ok:true,provider:id,configured:false,exits:[],revision:null});
function button(v:ReturnType<typeof networkUi>,id:string){const holder=v.document.createElement('div');holder.innerHTML=v.L.network.card(id);v.body.appendChild(holder);return '[data-net-chain="'+id+'"]'}
for(const id of ['claude','api:custom']){
 test('22e.1: provider publication before status sync cannot strand chain reading: '+id,opts,async()=>{
  const gate=deferred<any>();let reads=0;
  const v=networkUi(async path=>path.endsWith('/exits')?exits:++reads===1?gate.promise:chain(id));await v.flush();
  v.H.confirmedProjectGeneration++;
  v.L.network.setProviders('test',[{id,title:id}]);
  await v.window.emit('live:status');
  const opening=v.click(button(v,id));
  gate.resolve(chain(id));await opening;await v.flush();
  assert.ok(v.find('[data-net-add]'));assert.match(v.find('.network-empty').textContent,/Цепочка ещё не настроена/);
  assert.equal(v.find('[data-net-action="save"]').disabled,false);
  assert.doesNotMatch(v.find('.network-dialog').textContent,/Читаю маршрут/);
 });
 test('22e.1: discarded snapshot read is retried after status recovery: '+id,opts,async()=>{
  const gate=deferred<any>();let reads=0;
  const v=networkUi(async path=>path.endsWith('/exits')?exits:++reads===1?gate.promise:chain(id));await v.flush();
  v.L.network.setProviders('test',[{id,title:id}]);v.H.snapshotOnly=true;gate.resolve(chain(id));await v.flush();
  v.H.snapshotOnly=false;await v.window.emit('live:status');await v.flush();await v.click(button(v,id));
  assert.ok(reads>=2);assert.ok(v.find('[data-net-add]'));assert.equal(v.find('[data-net-action="save"]').disabled,false);
 });
 test('22e.1: project A→B→A does not revive an old chain, new editor reads current data: '+id,opts,async()=>{
  const gate=deferred<any>();let reads=0;
  const v=networkUi(async path=>path.endsWith('/exits')?exits:++reads===1?gate.promise:chain(id));await v.flush();
  v.L.network.setProviders('test',[{id,title:id}]);const target=button(v,id),oldOpening=v.click(target);
  await v.change();v.H.project='/one';v.H.confirmedProjectGeneration++;
  v.L.network.setProviders('test',[{id,title:id}]);await v.window.emit('live:status');
  gate.resolve({...chain(id),configured:true,exits:['foreign-exit'],revision:'old'});await oldOpening;await v.flush();
  await v.click(target);assert.ok(v.find('[data-net-add]'));assert.doesNotMatch(v.find('.network-dialog').textContent,/foreign-exit/);
  assert.match(v.find('.network-empty').textContent,/Цепочка ещё не настроена/);
 });
}
for(const bad of [null,{loading:true},{ok:true,provider:'claude',configured:false,revision:null},{ok:true,provider:'claude',configured:false,exits:{},revision:null},{ok:true,provider:'other',configured:false,exits:[],revision:null}]){
 test('22e.1: malformed chain stays recoverable, retry opens verified response: '+JSON.stringify(bad),opts,async()=>{
  let broken=true;const v=networkUi(async path=>path.endsWith('/exits')?exits:broken?bad:chain('claude'));await v.flush();
  v.L.network.setProviders('test',[{id:'claude',title:'Claude'}]);await v.flush();await v.click(button(v,'claude'));
  assert.ok(v.find('[role="alert"]'));assert.equal(v.find('[data-net-action="reload"]').textContent,'Повторить');
  assert.equal(v.document.querySelector('[data-net-action="save"]'),null);
  broken=false;await v.click('[data-net-action="reload"]');assert.ok(v.find('[data-net-add]'));assert.equal(v.requests.some(r=>r.body),false);
 });
}
test('22e.1: reread failure preserves edited chain; retry and provider summary recover',opts,async()=>{
 let broken=false;const v=networkUi(async path=>path.endsWith('/exits')?exits:broken?{ok:false,error:'offline'}:chain('claude'));await v.flush();
 v.L.network.setProviders('test',[{id:'claude',title:'Claude'}]);await v.flush();await v.click(button(v,'claude'));
 v.find('[data-net-add]').value='proxy';await v.click('[data-net-action="add"]');broken=true;await v.click('[data-net-action="reload"]');
 assert.match(v.find('[data-net-message]').textContent,/offline/);assert.match(v.find('.network-chain').textContent,/Основной прокси/);
 broken=false;await v.click('[data-net-action="reload"]');assert.match(v.find('.network-empty').textContent,/Цепочка ещё не настроена/);
});
test('22e.1: open editor recovers after snapshot-only status discards its response',opts,async()=>{
 const gate=deferred<any>();let reads=0;
 const v=networkUi(async path=>path.endsWith('/exits')?exits:++reads===1?gate.promise:chain('claude'));await v.flush();
 v.L.network.setProviders('test',[{id:'claude',title:'Claude'}]);const opening=v.click(button(v,'claude'));
 v.H.snapshotOnly=true;await v.window.emit('live:status');gate.resolve(chain('claude'));await opening;await v.flush();
 v.H.snapshotOnly=false;await v.window.emit('live:status');await v.flush();
 assert.ok(v.find('[data-net-add]'));assert.equal(v.find('[data-net-action="save"]').disabled,false);
});
test('22e.1: saved revision wins over a read started before the save',opts,async()=>{
 const gate=deferred<any>(),seen=deferred();let hold=false;
 const v=networkUi(async(path,body)=>{if(path.endsWith('/exits'))return exits;if(body)return {...chain('claude'),configured:true,exits:body.exits,revision:'saved'};if(hold){hold=false;seen.resolve();return gate.promise}return chain('claude')});await v.flush();
 v.L.network.setProviders('test',[{id:'claude',title:'Claude'}]);await v.flush();await v.click(button(v,'claude'));
 v.find('[data-net-add]').value='proxy';await v.click('[data-net-action="add"]');hold=true;
 const refresh=v.click('[data-net-refresh]');await seen.promise;await v.click('[data-net-action="save"]');gate.resolve(chain('claude'));await refresh;await v.flush();
 assert.match(v.L.network.summary('claude'),/Основной прокси/);assert.match(v.find('[data-net-message]').textContent,/Сохранено/);
});
