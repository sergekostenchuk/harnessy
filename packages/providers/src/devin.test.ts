import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {DEVIN,DEVIN_UNAVAILABLE,devinVersion,devinAuth,devinModels} from './devin.ts';
import {CLI_DESCRIPTORS,cliEntry,ProviderCatalog} from './catalog.ts';
import {devinFixture,devinAuthText,devinModelPayload,DEVIN_TEST_TIMEOUT_MS as timeout} from './devin-test-helpers.ts';
const result=(stdout:string,code=0)=>({stdout,stderr:'fixture-secret',code,signal:null});

test('333 Devin: process metadata, safe fields and owner-approved full access without Harnessy MCP', {timeout},async t=>{
 const f=devinFixture(t),catalog=new ProviderCatalog([f.entry]);const {row}=await catalog.read('devin');
 assert.ok(CLI_DESCRIPTORS.includes(DEVIN));assert.equal(row.installed,true);assert.equal(row.version,'3000.11.3');assert.equal(row.login.state,'ok');assert.equal(row.login.account,'f•••@example.test');assert.deepEqual(row.models,[{id:'adaptive',label:'Adaptive'},{id:'fixture-model',label:'Fixture Model'}]);assert.deepEqual(row.capabilities.probe,{ok:true,note:'полный доступ, без инструментов Harnessy'});for(const mode of ['read','edit'] as const)assert.deepEqual(row.capabilities.turn![mode],{ok:false,reason:DEVIN_UNAVAILABLE});assert.equal(row.capabilities.limits,false);assert.equal(row.capabilities.resume,true);assert.deepEqual(row.capabilities.turn!.all,{ok:true,note:'без инструментов Harnessy'});assert.deepEqual(catalog.limitsEntries(),[]);
 const serialized=JSON.stringify(row);assert.doesNotMatch(serialized,/credentials|fixture-secret|fixture-token|fixture-user|fixture-team|fixture cost|cost_summary/);
 assert.deepEqual(f.capture().map(c=>c.args),[['--version'],['auth','status'],['models','list','--format','json']]);for(const call of f.capture()){assert.equal(call.home,process.env.HOME);assert.deepEqual(call.keys,[])}
 f.update({version:'devin 3000.12.0 (abcdef123456)'});assert.equal((await catalog.read('devin')).row.version,'3000.12.0');
});

test('333 Devin absent/logged out/errors: no models and no false ready state', {timeout},async t=>{
 const f=devinFixture(t),catalog=new ProviderCatalog([f.entry]);
 for(const authCode of [0,1]){f.update({auth:'Not logged in.',authCode});const row=(await catalog.read('devin')).row;assert.equal(row.login.state,'none');assert.deepEqual(row.models,[])}
 assert.ok(!f.capture().some(c=>c.args[0]==='models'));
 f.update({auth:'unexpected fixture-secret'});let row=(await catalog.read('devin')).row;assert.equal(row.login.state,'error');assert.deepEqual(row.models,[]);assert.doesNotMatch(JSON.stringify(row),/fixture-secret/);
 f.update({modelsCode:1});row=(await catalog.read('devin')).row;assert.equal(row.login.state,'error');assert.deepEqual(row.models,[]);assert.doesNotMatch(JSON.stringify(row),/fixture-secret/);
 const missing=(await new ProviderCatalog([cliEntry({...DEVIN,binary:join(f.dir,'absent')},f.deps)]).read('devin')).row;assert.equal(missing.installed,false);assert.equal(missing.version,null);assert.deepEqual(missing.models,[]);
});

test('333 Devin parsers: missing/duplicate/malformed fields refuse without echoing stdout', {timeout},()=>{
 assert.deepEqual(devinAuth.parse(result(devinAuthText())),{loggedIn:true,email:'fixture@example.test',plan:'Pro'});
 assert.deepEqual(devinAuth.parse(result('Not logged in. Run `devin auth login` first.',1)),{loggedIn:false});
 for(const text of ['', 'Logged in (via Devin).',devinAuthText('bad-email'),devinAuthText().replace('  Email:', '  Token:'),devinAuthText().replace('  User ID:', '  Email:'),devinAuthText()+'\nUser:\n  Email: other@example.test'])assert.throws(()=>devinAuth.parse(result(text)),{code:'protocol'});
 assert.throws(()=>devinAuth.parse(result(devinAuthText(),1)),{code:'protocol'});
 for(const text of ['', '3000.11.3', 'devin 3000.11.3\nsecret','devin latest'])assert.throws(()=>devinVersion.parse(result(text)),{code:'protocol'});
 for(const value of [null,[],{}, {families:{}},{families:[{}]},{families:[{variants:[{model_uid:'x'}]}]},{families:[{variants:[{label:'x'}]}]},{families:[{variants:[{model_uid:'x\nsecret',label:'x'}]}]},{families:[...devinModelPayload.families,...devinModelPayload.families]}])assert.throws(()=>devinModels.parse(result(JSON.stringify(value))),{code:'protocol'});
 assert.deepEqual(devinModels.parse(result('{"families":[]}')),[]);
});
