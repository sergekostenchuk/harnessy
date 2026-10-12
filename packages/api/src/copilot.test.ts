import test from 'node:test';
import {setTimeout as tick} from 'node:timers/promises';
async function until(ready:()=>boolean){for(let n=0;n<800;n++){if(ready())return;await tick(10)}throw Error('Copilot SSE result timed out')}
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal} from '@harnessy/providers';
import {copilotFixture} from '../../providers/src/copilot-test-helpers.ts';
import {fixture,call,sse} from './test-helpers.ts';
test('261/281: Copilot HTTP catalog → approval → process → providers SSE; login cannot inject a command',async t=>{
 const cli=await copilotFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:cli.dir,open:async path=>{scripts.push(readFileSync(path,'utf8'))}})}}),stream=await sse(h.api);t.after(()=>stream.close());
 const catalog=await call(h.api,'/api/providers/catalog');assert.equal(catalog.body.providers[0].id,'copilot');assert.equal(catalog.body.providers[0].login.state,'ok');
 const p=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'}});assert.equal(p.body.status,'awaiting_approval');assert.equal(cli.capture().some(c=>c.turn),false);
 assert.equal((await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model',confirmed:true}})).body.code,'probe_invalid');
 await call(h.api,'/api/approve',{body:{project:h.dir,pane:'owner',id:p.body.approvalId,decision:'allow'}});
 await until(()=>stream.frames.some(e=>e.type==='providers'&&e.approvalId===p.body.approvalId&&['done','error'].includes(e.status)));
 const done=stream.frames.find(e=>e.type==='providers'&&e.approvalId===p.body.approvalId&&e.status==='done');assert.ok(done,JSON.stringify(stream.frames.filter(e=>e.type==='providers')));assert.equal(done.turn.text,'готов');assert.deepEqual(done.turn.usage,{input:null,output:null,cacheRead:null});
 assert.equal(cli.capture().filter(c=>c.turn).length,1);const state=cli.capture().find(c=>c.turn).config;assert.ok(existsSync(state));const turnArgs=cli.capture().find(c=>c.args?.includes('--prompt')).args;assert.equal(turnArgs.includes(h.dir),false,'storage binding does not grant access to the project');assert.equal(turnArgs.includes('--add-dir'),false);for(const c of cli.capture().filter(c=>c.mcp))assert.equal(existsSync(c.mcp),false);
 const login=await call(h.api,'/api/providers/copilot/login-terminal',{body:{command:'touch /OWNER',model:'ignored'}});assert.equal(login.body.ok,true);assert.match(scripts[0]!,/'login'/);assert.doesNotMatch(scripts[0]!,/OWNER|FAKE-SECRET/);
 const forbidden=await call(h.api,'/api/providers/copilot/check',{body:{},headers:{'X-Pane-Token':'forged'}});assert.equal(forbidden.body.code,'owner_only');
 await h.runtime.close();assert.ok(existsSync(state),'engine close preserves the private conversation');
});
test('261: changed GitHub identity after approval request rejects the real Copilot process',async t=>{
 const cli=await copilotFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}}),stream=await sse(h.api);t.after(()=>stream.close());
 const p=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'}});writeFileSync(cli.account,'another');await call(h.api,'/api/approve',{body:{project:h.dir,pane:'owner',id:p.body.approvalId,decision:'allow'}});
 await until(()=>stream.frames.some(e=>e.type==='providers'&&e.approvalId===p.body.approvalId&&e.status==='error'));assert.equal(stream.frames.find(e=>e.type==='providers'&&e.status==='error').error.code,'login_changed');assert.equal(cli.capture().some(c=>c.turn),false);
});
test('283: limits HTTP reads account.getQuota via the process, returns a monthly measurement and never calls a model',async t=>{
 const cli=await copilotFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}});
 const first=await call(h.api,'/api/limits');assert.equal(first.status,200,first.text);const cp=first.body.providers.find((p:any)=>p.vendor==='copilot');assert.ok(cp,JSON.stringify(first.body));assert.equal(cp.windows[0].label,'month');assert.equal(cp.windows[0].percentUsed,25);assert.equal(cp.account,'alice@github.com');assert.equal(cp.checkedAt,h.clock.now());
 await call(h.api,'/api/limits');assert.equal(cli.capture().filter(c=>c.rpc==='account.getQuota').length,1);assert.equal(cli.capture().some(c=>c.turn),false);
 writeFileSync(cli.account,'another');const changed=await call(h.api,'/api/limits');assert.equal(changed.body.providers.find((p:any)=>p.vendor==='copilot').account,'another@github.com');assert.equal(cli.capture().filter(c=>c.rpc==='account.getQuota').length,2);
});

test('283: quota failure is typed over HTTP with no invented Copilot measurement or model call',async t=>{
 const cli=await copilotFixture(t,'bad-quota'),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}}),r=await call(h.api,'/api/limits');
 assert.equal(r.body.ok,false);assert.equal(r.body.code,'limits_unavailable');assert.equal(typeof r.body.reason,'string');assert.equal(r.body.providers.some((p:any)=>p.vendor==='copilot'),false);assert.equal(cli.capture().some(c=>c.turn),false);
});
