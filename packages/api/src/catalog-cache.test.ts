import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderCatalog,ProviderError,cliEntry,executeCli,type CatalogEntry} from '@harnessy/providers';
import {antigravityFixture} from '../../providers/src/antigravity-test-helpers.ts';
import {fixture,call,deferred} from './test-helpers.ts';

const metadata=():CatalogEntry=>({id:'fixture',title:'Fixture',binary:'/no-real-cli',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,mcp:true,resume:true,limits:false},async version(){return '1'},async auth(){return {loggedIn:true,email:'alice@example.test'}},async models(){return [{id:'m1',label:'Model 1'}]},async runTurn(){throw Error('no models allowed')}});
function update(c:ProviderCatalog){const event=deferred<any>(),off=c.subscribe(v=>{off();event.resolve(v)});return event.promise}

test('290/315: cached HTTP completes while metadata is held; startup and TTL keep one pending read per program',{timeout:60000},async t=>{
 let now=Date.now(),versions=0,gate=deferred();const entry=metadata();entry.version=async()=>{versions++;await gate.promise;return '1'};
 const catalog=new ProviderCatalog([entry],()=>now),first=update(catalog),h=await fixture(t,{deps:{providerCatalog:catalog}});t.after(()=>gate.resolve());
 assert.equal(versions,1,'startup begins metadata without waiting for it');
 // Completion before gate.resolve(), not CPU speed, proves that GET never waits for the CLI.
 const cached=async()=>{const r=await call(h.api,'/api/providers/catalog');assert.equal(r.status,200);return r.body.providers[0]};
 for(let i=0;i<3;i++){const row=await cached();assert.equal(row.installed,null);assert.equal(row.checking,true);assert.equal(row.login.state,'unknown');assert.match(row.login.reason,/проверяется/);assert.deepEqual(row.models,[])}assert.equal(versions,1);
 gate.resolve();await first;const ready=await cached();assert.equal(ready.installed,true);assert.equal(ready.checking,false);assert.equal(ready.login.state,'ok');assert.equal(ready.models[0].id,'m1');
 gate=deferred();now+=300_000;const fresh=update(catalog);const refreshing=await cached();assert.equal(refreshing.installed,true);assert.equal(refreshing.checking,true);assert.equal(refreshing.login.checkedAt,ready.login.checkedAt);await cached();assert.equal(versions,2);
 gate.resolve();await fresh;const updated=await cached();assert.equal(updated.checking,false);assert.equal(updated.login.checkedAt,now);assert.equal(versions,2);
 now++;await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(versions,3,'explicit check bypasses TTL');assert.equal((await cached()).login.checkedAt,now);
});

for(const stage of ['version','auth','models'] as const)test('315: '+stage+' transient failure preserves the same account, models and timestamp; errors do not create a GET retry loop',async t=>{
 let now=Date.now();const entry=metadata(),catalog=new ProviderCatalog([entry],()=>now),h=await fixture(t,{deps:{providerCatalog:catalog}});
 await call(h.api,'/api/providers/fixture/check',{body:{}});const before=catalog.peek('fixture');let failures=0;const real=catalog.get('fixture')[stage];catalog.get('fixture')[stage]=async()=>{failures++;throw new ProviderError('transport_lost','password=DO-NOT-EXPOSE')};
 now+=300_000;const done=update(catalog);await call(h.api,'/api/providers/catalog');await done;
 const row=(await call(h.api,'/api/providers/catalog')).body.providers[0];assert.equal(row.login.state,'ok');assert.equal(row.login.account,before.login.account);assert.equal(row.login.checkedAt,before.login.checkedAt);assert.deepEqual(row.models,before.models);assert.match(row.login.reason,/Временно.*transport_lost/);assert.doesNotMatch(JSON.stringify(row),/DO-NOT-EXPOSE/);
 for(let i=0;i<3;i++)await call(h.api,'/api/providers/catalog');assert.equal(failures,1);
 Object.assign(catalog.get('fixture'),{[stage]:real});now++;await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(catalog.peek('fixture').login.reason,undefined);assert.equal(catalog.peek('fixture').login.checkedAt,now);
});

test('315: an observed account change, logout, corruption or removed binary never inherits old models',async t=>{
 const catalog=new ProviderCatalog([metadata()]),h=await fixture(t,{deps:{providerCatalog:catalog}}),entry=catalog.get('fixture');await call(h.api,'/api/providers/fixture/check',{body:{}});
 const old=catalog.peek('fixture'),models=entry.models;entry.auth=async()=>({loggedIn:true,email:'amy@example.test'});entry.models=async()=>{throw new ProviderError('transport_lost','timeout')};
 await call(h.api,'/api/providers/fixture/check',{body:{}});const changed=catalog.peek('fixture');assert.equal(changed.login.account,old.login.account,'even equal public masks are different accounts');assert.equal(changed.login.state,'unknown','343: interrupted metadata is not a login error, even when old models cannot be reused');assert.deepEqual(changed.models,[]);
 entry.models=models;await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(catalog.peek('fixture').login.state,'ok');
 entry.auth=async()=>({loggedIn:false});await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(catalog.peek('fixture').login.state,'none');assert.deepEqual(catalog.peek('fixture').models,[]);
 entry.auth=async()=>{throw new ProviderError('protocol','malformed')};await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(catalog.peek('fixture').login.state,'error');
 entry.version=async()=>{throw new ProviderError('no_binary','missing')};assert.equal((await call(h.api,'/api/providers/fixture/check',{body:{}})).body.code,'not_installed');const missing=(await call(h.api,'/api/providers/catalog')).body.providers[0];assert.equal(missing.installed,false);assert.equal(missing.checking,false);assert.deepEqual(missing.models,[]);
});

test('315: Antigravity metadata process timeout preserves its successful model list, with no inference or login',async t=>{
 const agy=antigravityFixture(t);let fail=false;const entry=cliEntry(agy.description,{env:agy.env,cwd:agy.dir,execute:async(request,signal,hooks)=>{
  if(fail&&request.args.includes('/usage'))throw new ProviderError('cancelled','metadata timeout');return executeCli(request,signal,hooks);
 }}),catalog=new ProviderCatalog([entry]),h=await fixture(t,{deps:{providerCatalog:catalog}});
 await call(h.api,'/api/providers/antigravity/check',{body:{}});const before=catalog.peek('antigravity');assert.equal(before.models[0]?.id,'gemini-3.8-flash-high');fail=true;
 const check=await call(h.api,'/api/providers/antigravity/check',{body:{}});assert.equal(check.body.login.state,'ok');const row=(await call(h.api,'/api/providers/catalog')).body.providers[0];assert.deepEqual(row.models,before.models);assert.equal(row.login.checkedAt,before.login.checkedAt);assert.match(row.login.reason,/Временно/);assert.ok(agy.capture().every(c=>!c.args.includes('stream-json')));
});
