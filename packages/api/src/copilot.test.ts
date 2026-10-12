import test from 'node:test';
import {setTimeout as tick} from 'node:timers/promises';
async function until(ready:()=>boolean){for(let n=0;n<800;n++){if(ready())return;await tick(10)}throw Error('Copilot SSE result timed out')}
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {CliStateStore} from '../../providers/src/cli/state.ts';
import {ProviderCatalog,LoginTerminal,COPILOT_UNAVAILABLE} from '@harnessy/providers';
import {copilotFixture} from '../../providers/src/copilot-test-helpers.ts';
import {fixture,call,sse,OWNER} from './test-helpers.ts';
// 293: probe no longer creates an approval or a model turn; metadata doors stay live.
test('293: Copilot HTTP and runtime bridge refuse probe, preserve state, and keep catalog/check/login available',async t=>{
 const cli=await copilotFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:cli.dir,open:async path=>{scripts.push(readFileSync(path,'utf8'))}})}}),stream=await sse(h.api);t.after(()=>stream.close());
 const store=new CliStateStore('copilot',cli.stateRoot),state=store.acquire(h.dir,'provider-probe');writeFileSync(join(state.path,'session'),'keep');state.release();
 const catalog=await call(h.api,'/api/providers/catalog'),row=catalog.body.providers[0];assert.equal(row.login.state,'ok');assert.equal(row.reason,COPILOT_UNAVAILABLE);assert.equal(row.capabilities.resume,false);assert.equal(row.capabilities.mcp,false);assert.equal(row.capabilities.limits,true);assert.equal(row.models[0].id,'cp-model');
 assert.equal((await call(h.api,'/api/providers/copilot/check',{body:{}})).body.login.state,'ok');await until(()=>stream.frames.some(e=>e.type==='providers'&&e.event==='check'));const before=cli.capture().length;
 for(let n=0;n<2;n++){const r=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'}});assert.equal(r.status,409);assert.equal(r.body.code,'capability_unsupported');assert.equal(r.body.reason,COPILOT_UNAVAILABLE)}
 await assert.rejects(h.runtime.providerOperations.probe('copilot','cp-model',OWNER),{code:'capability_unsupported'});assert.equal(h.runtime.owner.approvals.size,0);assert.equal(cli.capture().length,before);assert.equal(stream.frames.some(e=>e.type==='providers'&&e.event==='probe'&&e.status==='done'),false);
 assert.equal((await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model',confirmed:true}})).body.code,'probe_invalid');
 const login=await call(h.api,'/api/providers/copilot/login-terminal',{body:{command:'touch /OWNER',model:'ignored'}});assert.equal(login.body.ok,true);assert.match(scripts[0]!,/'login'/);assert.doesNotMatch(scripts[0]!,/OWNER|FAKE-SECRET/);
 const forbidden=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'},headers:{'X-Pane-Token':'forged','X-Harness-Pane':'owner'}});assert.equal(forbidden.body.code,'owner_only');assert.equal(cli.capture().some(c=>c.turn),false);assert.deepEqual(readdirSync(state.path),['session']);assert.equal(readFileSync(join(state.path,'session'),'utf8'),'keep');await h.runtime.close();assert.ok(existsSync(state.path));
});
test('283: limits HTTP reads account.getQuota via the process, returns a monthly measurement and never calls a model',async t=>{
 const cli=await copilotFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}});
 const first=await call(h.api,'/api/limits');assert.equal(first.status,200,first.text);const cp=first.body.providers.find((p:any)=>p.vendor==='copilot');assert.ok(cp,JSON.stringify(first.body));assert.equal(cp.windows[0].label,'month');assert.equal(cp.windows[0].percentUsed,25);assert.equal(cp.account,'alice@github.com');assert.equal(cp.checkedAt,h.clock.now());
 await call(h.api,'/api/limits');assert.equal(cli.capture().filter(c=>c.rpc==='account.getQuota').length,1);assert.equal(cli.capture().some(c=>c.turn),false);
 writeFileSync(cli.account,'another');const changed=await call(h.api,'/api/limits');assert.equal(changed.body.providers.find((p:any)=>p.vendor==='copilot').account,'another@github.com');assert.equal(cli.capture().filter(c=>c.rpc==='account.getQuota').length,2);
});

test('283: quota failure is typed over HTTP with no invented Copilot measurement or model call',async t=>{
 const cli=await copilotFixture(t,'bad-quota'),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}}),r=await call(h.api,'/api/limits');
 assert.equal(r.body.ok,false);assert.equal(r.body.code,'limits_unavailable');assert.equal(typeof r.body.reason,'string');assert.equal(r.body.providers.find((p:any)=>p.vendor==='copilot').ok,false);assert.deepEqual(r.body.providers.find((p:any)=>p.vendor==='copilot').windows,[]);assert.equal(cli.capture().some(c=>c.turn),false);
});
