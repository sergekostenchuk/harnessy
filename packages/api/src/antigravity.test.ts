import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal} from '@harnessy/providers';
import {ANTIGRAVITY_UNAVAILABLE} from '../../providers/src/antigravity.ts';
import {antigravityFixture} from '../../providers/src/antigravity-test-helpers.ts';
import {fixture,call,sse,until,OWNER} from './test-helpers.ts';

test('276: HTTP catalog/check/login share the agy descriptor; probe refuses before approval, metadata or model',async t=>{
 const agy=antigravityFixture(t),scripts:string[]=[],catalog=new ProviderCatalog([agy.entry]);
 const terminal=new LoginTerminal({platform:'darwin',temporaryDirectory:agy.dir,open:async file=>{scripts.push(readFileSync(file,'utf8'))}});
 const h=await fixture(t,{deps:{providerCatalog:catalog,loginTerminal:terminal}}),events=await sse(h.api);t.after(()=>events.close());
 const initial=await call(h.api,'/api/providers/catalog');assert.equal(initial.body.providers[0].capabilities.mcp,false);assert.equal(initial.body.providers[0].reason,ANTIGRAVITY_UNAVAILABLE);
 assert.equal((await call(h.api,'/api/providers/antigravity/check',{body:{}})).body.login.state,'ok');
 await until(()=>events.frames.some(e=>e.type==='providers'&&e.provider==='antigravity'&&e.event==='check'));
 const before=agy.capture().length;
 const rejected=await call(h.api,'/api/providers/antigravity/probe',{body:{model:'gemini-3.8-flash-high'}});
 assert.equal(rejected.status,409);assert.equal(rejected.body.ok,false);assert.equal(rejected.body.code,'capability_unsupported');assert.equal(rejected.body.reason,ANTIGRAVITY_UNAVAILABLE);
 assert.equal(h.runtime.owner.approvals.size,0);assert.equal(agy.capture().length,before);assert.equal(h.provider.calls.length,0);
 await assert.rejects(h.runtime.providerOperations.probe('antigravity','gemini-3.8-flash-high',OWNER),{code:'capability_unsupported'});
 assert.equal((await call(h.api,'/api/providers/antigravity/probe',{body:{model:'x',confirmed:true}})).body.code,'probe_invalid');
 const login=await call(h.api,'/api/providers/antigravity/login-terminal',{body:{command:'touch /OWNER-FILE',args:['login']}});
 assert.equal(login.body.ok,true);assert.equal(scripts.length,1);assert.ok(scripts[0]!.includes(agy.description.binary));assert.doesNotMatch(scripts[0]!,/OWNER-FILE|FIXTURE-SECRET|--mcp-config/);
 assert.equal(agy.capture().some(c=>!['--version','--output-format'].includes(c.args[0])),false);
});
test('276: all agy operations remain owner-only and never run on agent authorization',async t=>{
 const agy=antigravityFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([agy.entry])}});
 for(const route of ['catalog','antigravity/check','antigravity/login-terminal','antigravity/probe']){
  const r=await call(h.api,'/api/providers/'+route,{...(route==='catalog'?{}:{body:{model:'x'}}),headers:{'X-Pane-Token':'forged'}});
  assert.equal(r.status,403);assert.equal(r.body.code,'owner_only');
 }
 assert.equal(agy.capture().length,0);
});
