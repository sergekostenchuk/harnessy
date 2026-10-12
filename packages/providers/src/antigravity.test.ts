import {fixture} from './test-support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderCatalog,CLI_DESCRIPTORS,cliEntry} from './catalog.ts';
import {ANTIGRAVITY,ANTIGRAVITY_UNAVAILABLE} from './antigravity.ts';
import {antigravityFixture} from './antigravity-test-helpers.ts';

test('260/276: installed agy metadata comes from literal readonly process commands, no secrets or inferred account',async t=>{
 const f=antigravityFixture(t),catalog=new ProviderCatalog([f.entry]),{row}=await catalog.read('antigravity');
 assert.equal(row.installed,true);assert.equal(row.version,'1.2.17');assert.equal(row.login.state,'ok');assert.equal(row.login.account,undefined);
 assert.deepEqual(row.models,[{id:'gemini-3.8-flash-high',label:'Gemini 3.8 Flash (High)'}]);
 assert.equal(row.capabilities.mcp,false);assert.deepEqual(row.capabilities.turn?.all,{ok:true,note:'без инструментов Harnessy'});assert.equal(row.capabilities.turn?.read.ok,false);assert.equal(row.reason,undefined);assert.equal(row.limits,undefined);
 assert.ok(CLI_DESCRIPTORS.includes(ANTIGRAVITY));assert.equal(row.login.command,"'"+f.description.binary+"'");assert.deepEqual(ANTIGRAVITY.login.args,[]);
 assert.deepEqual(f.capture().map(x=>x.args),[['--version'],['--output-format','json','-p','/usage'],['--output-format','json','models']]);
 for(const call of f.capture()){assert.equal(call.home,process.env.HOME);assert.equal(call.apiKey,false);assert.equal(call.endpoint,false);assert.equal(call.paneToken,false)}
 assert.doesNotMatch(JSON.stringify(row),/FIXTURE|secret|TOKEN/);
});
test('260: missing binary and missing login remain distinct from malformed metadata',async t=>{
 const f=antigravityFixture(t,'logged-out'),loggedOut=(await new ProviderCatalog([f.entry]).read('antigravity')).row;
 assert.equal(loggedOut.installed,true);assert.equal(loggedOut.login.state,'none');assert.deepEqual(loggedOut.models,[]);assert.equal(f.capture().length,2);
 const missing=cliEntry({...f.description,binary:f.dir+'/missing'}),row=(await new ProviderCatalog([missing]).read('antigravity')).row;
 assert.equal(row.installed,false);assert.equal(row.login.state,'unknown');assert.equal(row.version,null);
});
for(const scenario of ['malformed','error','spent-turn','forged-command','missing-groups','duplicate-model'])test('260 metadata rejects '+scenario+' without a fake ready state',async t=>{
 const f=antigravityFixture(t,scenario),row=(await new ProviderCatalog([f.entry]).read('antigravity')).row;
 assert.equal(row.installed,true);assert.equal(row.login.state,'error');assert.deepEqual(row.models,[]);assert.doesNotMatch(JSON.stringify(row),/FIXTURE-SECRET/);
});
test('307: descriptor exposes full access without Harnessy MCP and no read/edit fallback',()=>{
 assert.equal(ANTIGRAVITY.mcp,undefined);assert.equal(ANTIGRAVITY.noHarnessMcp,true);assert.equal(ANTIGRAVITY.modes.read,undefined);assert.equal(ANTIGRAVITY.modes.edit,undefined);
});

for(const scenario of ['turn-error','turn-crash'])test('350: Antigravity '+scenario+' exposes the cause without credentials', {timeout:15000},async t=>{
 const f=antigravityFixture(t,scenario),h=fixture();Object.assign(h.seat,{vendor:'antigravity',model:'gemini-3.8-flash-high',mode:'all',cwd:f.dir});Object.assign(h.ctx,{projectDir:f.dir,writableRoots:[]});
 await assert.rejects(f.entry.runTurn(h.seat,'готов',h.ctx),(e:any)=>{assert.equal(e.code,scenario==='turn-error'?'turn_failed':'transport_lost');assert.match(e.message,scenario==='turn-error'?/quota exceeded/:/кодом 7.*service unavailable/);assert.doesNotMatch(e.message,/FIXTURE-SECRET/);return true});assert.doesNotMatch(JSON.stringify(h.events),/FIXTURE-SECRET/);
});
