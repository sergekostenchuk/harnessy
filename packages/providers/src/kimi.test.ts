import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ProviderCatalog,CLI_DESCRIPTORS,cliEntry} from './catalog.ts';
import {KIMI,kimiVersion,KIMI_UNAVAILABLE,KIMI_LOGIN_UNKNOWN,KIMI_MODELS_UNAVAILABLE} from './kimi.ts';
import {kimiFixture} from './kimi-test-helpers.ts';

test('264 Kimi: live version, explicit unknown login and unsupported capabilities; metadata only invokes --version',async t=>{
 const f=kimiFixture(t),catalog=new ProviderCatalog([f.entry]);const row=(await catalog.read('kimi')).row;
 assert.ok(CLI_DESCRIPTORS.includes(KIMI));assert.equal(row.version,'2.1.1');assert.equal(row.installed,true);assert.equal(row.login.state,'unknown');assert.equal(row.login.reason,KIMI_LOGIN_UNKNOWN);assert.equal(row.login.account,undefined);assert.deepEqual(row.models,[]);assert.equal(row.modelsReason,KIMI_MODELS_UNAVAILABLE);
 assert.deepEqual(row.capabilities.probe,{ok:false,reason:KIMI_UNAVAILABLE});for(const mode of ['read','edit','all'] as const)assert.deepEqual(row.capabilities.turn![mode],{ok:false,reason:KIMI_UNAVAILABLE});assert.equal(row.capabilities.mcp,false);assert.equal(row.capabilities.limits,false);assert.equal(row.capabilities.resume,false);assert.deepEqual(catalog.limitsEntries(),[]);
 for(const run of [f.entry.runTurn,catalog.provider('kimi').runTurn])await assert.rejects(run(undefined as never,'no turn',undefined as never),{code:'capability_unsupported'});
 assert.deepEqual(f.capture().map(c=>c.args),[['--version']]);for(const call of f.capture()){assert.equal(call.home,process.env.HOME);assert.equal(call.key,false);assert.equal(call.moonshot,false);assert.equal(call.pane,false)}assert.doesNotMatch(JSON.stringify(row),/FIXTURE-SECRET|FIXTURE-PANE/);
 const upgraded=cliEntry(f.description,{cwd:f.dir,env:{...f.env,KIMI_FIXTURE_VERSION:'2.2.0-preview.1'}});assert.equal(await upgraded.version(),'2.2.0-preview.1');
});

test('264 Kimi: missing or malformed version never becomes a ready program',async t=>{
 const f=kimiFixture(t),missing=cliEntry({...f.description,binary:join(f.dir,'absent')},{env:f.env,cwd:f.dir});const row=(await new ProviderCatalog([missing]).read('kimi')).row;assert.equal(row.installed,false);assert.equal(row.version,null);assert.equal(f.capture().length,0);
 for(const stdout of ['', '{}', 'answer 2.1.1', '2.1.1\nsecret'])assert.throws(()=>kimiVersion.parse({code:0,signal:null,stdout,stderr:''}),{code:'protocol'});
 const malformed=cliEntry(f.description,{cwd:f.dir,env:{...f.env,KIMI_FIXTURE_VERSION:'FIXTURE-SECRET'}});const bad=(await new ProviderCatalog([malformed]).read('kimi')).row;assert.equal(bad.login.state,'error');assert.equal(bad.version,null);assert.doesNotMatch(JSON.stringify(bad),/FIXTURE-SECRET/);
});

test('264 Kimi: unavailable auth needs a nonempty public explanation',()=>{
 for(const unavailableReason of ['', '\n', undefined])assert.throws(()=>cliEntry({...KIMI,auth:{unavailableReason}} as any),{code:'protocol'});
});
