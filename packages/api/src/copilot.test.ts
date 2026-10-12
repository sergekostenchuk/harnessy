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
// 307 explicitly restores probe after owner approval; state remains private.
test('307: Copilot HTTP probe needs owner approval, preserves state, and keeps metadata available',async t=>{
 const cli=await copilotFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:cli.dir,open:async path=>{scripts.push(readFileSync(path,'utf8'))}})}}),stream=await sse(h.api);t.after(()=>stream.close());
 const store=new CliStateStore('copilot',cli.stateRoot),state=store.acquire(h.dir,'provider-probe');writeFileSync(join(state.path,'session'),'keep');state.release();
 await call(h.api,'/api/providers/copilot/check',{body:{}});const catalog=await call(h.api,'/api/providers/catalog'),row=catalog.body.providers[0];assert.equal(row.login.state,'ok');assert.equal(row.reason,undefined);assert.equal(row.capabilities.resume,true);assert.equal(row.capabilities.mcp,true);assert.equal(row.capabilities.limits,true);assert.equal(row.models[0].id,'cp-model');
 assert.equal((await call(h.api,'/api/providers/copilot/check',{body:{}})).body.login.state,'ok');await until(()=>stream.frames.some(e=>e.type==='providers'&&e.event==='check'));const before=cli.capture().length;
 const first=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'}}),again=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'}});assert.equal(first.status,200);assert.equal(again.body.approvalId,first.body.approvalId);assert.equal(cli.capture().some(c=>c.turn),false);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:first.body.approvalId,decision:'allow',project:h.dir}});await until(()=>stream.frames.some(e=>e.type==='providers'&&e.event==='probe'&&e.status==='done'));assert.equal(cli.capture().filter(c=>c.turn).length,1);
 assert.equal((await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model',confirmed:true}})).body.code,'probe_invalid');
 const login=await call(h.api,'/api/providers/copilot/login-terminal',{body:{command:'touch /OWNER',model:'ignored'}});assert.equal(login.body.ok,true);assert.match(scripts[0]!,/'login'/);assert.doesNotMatch(scripts[0]!,/OWNER|FAKE-SECRET/);
 const forbidden=await call(h.api,'/api/providers/copilot/probe',{body:{model:'cp-model'},headers:{'X-Pane-Token':'forged','X-Harness-Pane':'owner'}});assert.equal(forbidden.body.code,'owner_only');assert.equal(cli.capture().filter(c=>c.turn).length,1);assert.equal(readFileSync(join(state.path,'session'),'utf8'),'keep');await h.runtime.close();assert.ok(existsSync(state.path));
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
