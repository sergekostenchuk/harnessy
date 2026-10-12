import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {OPENCODE,OPENCODE_UNAVAILABLE,OPENCODE_LOGIN_UNKNOWN,opencodeVersion,opencodeAuth,opencodeModels} from './opencode.ts';
import {CLI_DESCRIPTORS,cliEntry,ProviderCatalog} from './catalog.ts';
import {opencodeFixture,opencodeAuthText,opencodeNoAuthText,opencodeModelText,OPENCODE_TEST_TIMEOUT_MS as timeout} from './opencode-test-helpers.ts';
const result=(stdout:string)=>({stdout,stderr:'fixture-secret',code:0,signal:null});

test('333 OpenCode: process metadata lists models without claiming a verified OAuth/API login', {timeout},async t=>{
 const f=opencodeFixture(t),catalog=new ProviderCatalog([f.entry]);const {row,identity}=await catalog.read('opencode');
 assert.ok(CLI_DESCRIPTORS.includes(OPENCODE));assert.equal(row.installed,true);assert.equal(row.version,'1.18.4');assert.equal(row.login.state,'unknown');assert.equal(row.login.reason,OPENCODE_LOGIN_UNKNOWN);assert.equal(row.login.account,undefined);assert.equal(identity,null);
 assert.deepEqual(row.models,[{id:'opencode/free-model',label:'opencode/free-model'},{id:'fixture/~account/models/model:variant',label:'fixture/~account/models/model:variant'}]);
 assert.deepEqual(row.capabilities.probe,{ok:true,note:'полный доступ, без инструментов Harnessy'});for(const mode of ['read','edit'] as const)assert.deepEqual(row.capabilities.turn![mode],{ok:false,reason:OPENCODE_UNAVAILABLE});assert.equal(row.capabilities.limits,false);assert.equal(row.capabilities.resume,true);assert.deepEqual(row.capabilities.turn!.all,{ok:true,note:'без инструментов Harnessy'});assert.equal(row.capabilities.mcp,false);assert.deepEqual(catalog.limitsEntries(),[]);
 assert.doesNotMatch(JSON.stringify(row),/auth\.json|fixture-secret|fixture-token|FIXTURE_API_KEY|Fixture OAuth|Fixture API/);
 assert.deepEqual(f.capture().map(c=>c.args),[['--version'],['auth','list','--pure'],['models','--pure']]);for(const call of f.capture()){assert.equal(call.home,process.env.HOME);assert.deepEqual(call.bridgeKeys,[])}
 f.update({version:'1.19.0'});assert.equal((await catalog.read('opencode')).row.version,'1.19.0');
 // The opt-in is metadata-only; other descriptors retain their login requirement.
 const otherEntry={...f.entry};delete otherEntry.modelsWithoutLogin;delete otherEntry.allowUnverifiedLogin;delete otherEntry.allowUnverifiedProbe;const other=new ProviderCatalog([{...otherEntry,id:'other',models:async()=>{assert.fail('must not read models')}}]);assert.deepEqual((await other.read('other')).row.models,[]);
});

test('333 OpenCode: no saved connections, metadata errors and missing program remain distinct', {timeout},async t=>{
 const f=opencodeFixture(t),catalog=new ProviderCatalog([f.entry]);
 f.update({auth:opencodeNoAuthText});let row=(await catalog.read('opencode')).row;assert.equal(row.login.state,'none');assert.equal(row.models.length,2); // Public/free configured models need no saved credential.
 for(const patch of [{auth:'unexpected fixture-secret'},{authCode:1},{modelsCode:1},{models:'fixture-secret'}]){
  f.update(patch);row=(await catalog.read('opencode')).row;assert.equal(row.login.state,'error');assert.deepEqual(row.models,[]);assert.doesNotMatch(JSON.stringify(row),/fixture-secret/);
 }
 const missing=(await new ProviderCatalog([cliEntry({...OPENCODE,binary:join(f.dir,'absent')},f.deps)]).read('opencode')).row;assert.equal(missing.installed,false);assert.equal(missing.version,null);assert.deepEqual(missing.models,[]);
});

test('333 OpenCode parsers: strict metadata shapes, no stdout echoes, empty models allowed', {timeout},()=>{
 assert.deepEqual(opencodeAuth.parse(result(opencodeAuthText)),{loggedIn:false,state:'unknown',reason:OPENCODE_LOGIN_UNKNOWN});assert.deepEqual(opencodeAuth.parse(result(opencodeNoAuthText)),{loggedIn:false});assert.equal(opencodeAuth.parse(result(opencodeAuthText.replace(' oauth',' wellknown'))).state,'unknown');
 assert.deepEqual(opencodeAuth.parse(result(opencodeAuthText.replace('oauth','\x1b[2moauth\x1b[0m'))),{loggedIn:false,state:'unknown',reason:OPENCODE_LOGIN_UNKNOWN});
 assert.equal(opencodeAuth.parse(result(opencodeNoAuthText+'\n┌  Environment\n│\n●  Fixture TOKEN_NAME\n│\n└  1 environment variable\n')).state,'unknown');
 for(const text of ['', 'Logged in',opencodeAuthText.replace('2 credentials','3 credentials'),opencodeAuthText.replace(' oauth',' token'),opencodeNoAuthText+opencodeNoAuthText,opencodeNoAuthText.replace('└','│'),'┌  Environment\n└  0 environment variables'])assert.throws(()=>opencodeAuth.parse(result(text)),{code:'protocol'});
 for(const text of ['', 'latest','1.18.4\nsecret','OpenCode 1.18.4'])assert.throws(()=>opencodeVersion.parse(result(text)),{code:'protocol'});
 for(const text of ['model-only','provider/','provider/model\nprovider/model','provider/model with space','provider/model\u0000','{"token":"fixture-secret"}',opencodeModelText+'fixture-secret'])assert.throws(()=>opencodeModels.parse(result(text)),{code:'protocol'});
 assert.deepEqual(opencodeModels.parse(result('')),[]);assert.equal(opencodeModels.parse(result(opencodeModelText)).length,2);
});
