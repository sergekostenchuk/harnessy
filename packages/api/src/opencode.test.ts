import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal,OPENCODE_UNAVAILABLE} from '@harnessy/providers';
import {opencodeFixture,OPENCODE_TEST_TIMEOUT_MS as timeout} from '../../providers/src/opencode-test-helpers.ts';
import {fixture,call,OWNER} from './test-helpers.ts';

test('333 OpenCode HTTP: catalog/check/status/login; execution refusals preserve chat/session', {timeout},async t=>{
 const f=opencodeFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:f.dir,open:async file=>{scripts.push(readFileSync(file,'utf8'))}})}});
 const checked=await call(h.api,'/api/providers/opencode/check',{body:{}});assert.equal(checked.status,200);assert.equal(checked.body.login.state,'unknown');assert.ok(checked.body.login.reason);
 const catalog=(await call(h.api,'/api/providers/catalog')).body.providers.find((p:any)=>p.id==='opencode');assert.equal(catalog.version,'1.18.4');assert.equal(catalog.models.length,2);assert.equal(catalog.capabilities.probe.ok,false);
 const status=(await call(h.api,'/api/status')).body;assert.deepEqual(status.models.opencode,catalog.models);for(const mode of ['read','edit','all'])assert.equal(status.turnModes.opencode[mode].ok,false);
 const before=f.capture().length,probe=await call(h.api,'/api/providers/opencode/probe',{body:{model:'opencode/free-model'}});assert.equal(probe.status,409);assert.equal(probe.body.code,'capability_unsupported');assert.equal(probe.body.reason,OPENCODE_UNAVAILABLE);assert.equal(h.runtime.owner.approvals.size,0);await assert.rejects(h.runtime.providerOperations.probe('opencode','opencode/free-model',OWNER),{code:'capability_unsupported'});assert.equal(f.capture().length,before);
 const pane=h.runtime.registry.get('worker')!;pane.sessionId='existing-session';const settings=pane.settings(),session=pane.sessionId;
 for(const mode of ['read','edit','all']){assert.throws(()=>h.runtime.validateTurn('opencode',mode),{code:'capability_unsupported'});const response=await call(h.api,'/api/panes/worker',{body:{vendor:'opencode',model:'opencode/free-model',mode}});assert.equal(response.status,409);assert.equal(response.body.code,'login_required');assert.deepEqual(pane.settings(),settings);assert.equal(pane.sessionId,session)}
 for(const folder of [true,false]){const response=await call(h.api,'/api/room',{body:{vendor:'opencode',model:'opencode/free-model',folder}});assert.equal(response.status,409);assert.equal(response.body.code,'login_required')}
 const login=await call(h.api,'/api/providers/opencode/login-terminal',{body:{command:'touch /OWNER',args:['--auto']}});assert.equal(login.status,200);assert.match(scripts[0]!,/'auth' 'login'/);assert.doesNotMatch(scripts[0]!,/OWNER|--auto|fixture-secret/);
 for(const route of ['catalog','opencode/check','opencode/login-terminal','opencode/probe']){const r=await call(h.api,'/api/providers/'+route,{...(route==='catalog'?{}:{body:{model:'opencode/free-model'}}),headers:{'X-Pane-Token':'forged'}});assert.equal(r.status,403);assert.equal(r.body.code,'owner_only')}
 assert.equal(scripts.length,1);assert.equal((await call(h.api,'/api/limits')).body.providers.some((p:any)=>p.vendor==='opencode'),false);assert.equal(h.provider.calls.length,0);assert.equal(h.codex.calls.length,0);assert.ok(f.capture().every(c=>['--version','auth','models'].includes(c.args[0])));
});
