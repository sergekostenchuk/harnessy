import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal} from '@harnessy/providers';
import {geminiFixture} from '../../providers/src/gemini-test-helpers.ts';
import {GEMINI_UNAVAILABLE,GEMINI_MODELS_UNAVAILABLE} from '../../providers/src/gemini.ts';
import {fixture,call,sse,until,OWNER} from './test-helpers.ts';

test('264/285: Gemini catalog → check → SSE, login terminal and typed probe refusal use no model',async t=>{
 const cli=geminiFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:cli.dir,open:async file=>{scripts.push(readFileSync(file,'utf8'))}})}}),events=await sse(h.api);t.after(()=>events.close());
 let r=await call(h.api,'/api/providers/catalog');assert.equal(r.body.providers[0].login.state,'none');assert.equal(r.body.providers[0].modelsReason,GEMINI_MODELS_UNAVAILABLE);
 writeFileSync(cli.account,JSON.stringify({active:'alice@example.test'}));r=await call(h.api,'/api/providers/gemini/check',{body:{}});assert.equal(r.body.login.state,'unknown');assert.equal(r.body.login.reason,'сохранён аккаунт, вход не проверен');
 await until(()=>events.frames.some(e=>e.type==='providers'&&e.provider==='gemini'&&e.event==='check'&&e.status==='done'));
 const before=cli.capture().length;const probe=await call(h.api,'/api/providers/gemini/probe',{body:{model:'do-not-infer'}});assert.equal(probe.status,409);assert.equal(probe.body.code,'not_logged_in');assert.equal(h.runtime.owner.approvals.size,0);assert.ok(cli.capture().length>before);await assert.rejects(h.runtime.providerOperations.probe('gemini','x',OWNER),{code:'not_logged_in'});
 const login=await call(h.api,'/api/providers/gemini/login-terminal',{body:{command:'touch /OWNER-FILE',args:['--yolo']}});assert.equal(login.body.ok,true);assert.equal(scripts.length,1);assert.ok(scripts[0]!.includes(cli.description.binary));assert.doesNotMatch(scripts[0]!,/OWNER-FILE|--yolo|FIXTURE/);assert.equal(h.provider.calls.length,0);assert.equal(h.codex.calls.length,0);assert.equal(cli.capture().every(c=>JSON.stringify(c.args)==='["--version"]'),true);
});
test('285: all Gemini doors remain owner-only; no metadata process starts for a forged caller',async t=>{
 const cli=geminiFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cli.entry])}});
 for(const route of ['catalog','gemini/check','gemini/login-terminal','gemini/probe']){const r=await call(h.api,'/api/providers/'+route,{...(route==='catalog'?{}:{body:{model:'x'}}),headers:{'X-Pane-Token':'forged'}});assert.equal(r.status,403);assert.equal(r.body.code,'owner_only')}
 assert.equal(cli.capture().length,0);
});
