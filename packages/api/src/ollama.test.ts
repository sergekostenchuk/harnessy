import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal} from '@harnessy/providers';
import {ollamaFixture} from '../../providers/src/ollama-test-helpers.ts';
import {fixture,call,sse} from './test-helpers.ts';

function result(stream:Awaited<ReturnType<typeof sse>>){const found=()=>stream.frames.find(e=>e.type==='providers'&&e.provider==='ollama'&&['done','declined','error'].includes(e.status)&&e.event==='probe');if(found())return Promise.resolve(found());return new Promise<any>((resolve,reject)=>{const done=()=>{const e=found();if(e){stream.response.off('data',done);resolve(e)}};stream.response.on('data',done);stream.response.once('error',reject);stream.response.once('end',()=>reject(Error('SSE ended without a probe result')));done()})}

test('334: real HTTP Ollama catalog/check/login, seat/room choice and Codex turns preserve vendor and exclude limits',async t=>{
 const f=await ollamaFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:f.dir,open:async p=>{scripts.push(readFileSync(p,'utf8'))}})}});
 f.setWarning('Model metadata for glm-5.3:cloud not found. Defaulting to fallback metadata.');assert.equal((await call(h.api,'/api/providers/ollama/check',{body:{}})).status,200);const row=(await call(h.api,'/api/providers/catalog')).body.providers.find((p:any)=>p.id==='ollama');assert.equal(row.title,'Ollama');assert.equal(row.subtitle,'облако и локально');assert.equal(row.service.ok,true);assert.equal(row.login.state,'unknown');assert.equal(row.models[0].label,'glm-5.3:cloud · облако');
 const login=await call(h.api,'/api/providers/ollama/login-terminal',{body:{command:'UNTRUSTED',args:['signout']}});assert.equal(login.status,200);assert.match(scripts[0]!,/'signin'/);assert.doesNotMatch(scripts[0]!,/UNTRUSTED|signout|SECRET/);assert.equal(f.capture().length,0);
 for(const path of ['/api/panes/worker','/api/room']){const response=await call(h.api,path,{body:{vendor:'ollama',model:'glm-5.3:cloud',...(path.endsWith('room')?{folder:true}:{})}});assert.equal(response.status,200,response.text);const id=path.endsWith('room')?'room':'worker';assert.equal(h.runtime.registry.get(id)?.vendor,'ollama');await h.runtime.runTurn(id,'fixture only')}
 assert.equal(f.capture().length,2);const notices=(await call(h.api,'/api/trace')).body.records.filter((r:any)=>r.kind==='provider.warning');assert.equal(notices.length,2);assert.deepEqual(notices.map((r:any)=>r.pane).sort(),['room','worker']);assert.ok(notices.every((r:any)=>r.actor==='model:'+r.pane&&r.turnInstanceId&&/Model metadata/.test(r.data.error)));for(const id of ['room','worker'])assert.notEqual(h.runtime.registry.get(id)!.status,'uncertain');const status=(await call(h.api,'/api/status')).body;assert.equal(status.models.ollama.length,2);for(const mode of ['read','edit','all','chat','check','web','ask'])assert.equal(status.turnModes.ollama[mode].ok,true);assert.equal((await call(h.api,'/api/limits')).body.providers.some((p:any)=>p.vendor==='ollama'),false);assert.equal(h.provider.calls.length+h.codex.calls.length,0);
 f.setOffline(true);await call(h.api,'/api/providers/ollama/check',{body:{}});for(const path of ['/api/panes/worker','/api/room']){const id=path.endsWith('room')?'room':'worker',before=h.runtime.registry.get(id)!.settings();const r=await call(h.api,path,{body:{vendor:'ollama',model:'glm-5.3:cloud',...(id==='room'?{folder:true}:{})}});assert.equal(r.status,409);assert.equal(r.body.code,'provider_unavailable');assert.match(r.body.error??r.body.reason,/демон не запущен/);assert.deepEqual(h.runtime.registry.get(id)!.settings(),before)}assert.equal(f.capture().length,2);
});

for(const approve of [false,true])test('334: Ollama probe requires an owner decision and only allow starts Codex: '+approve,async t=>{
 const f=await ollamaFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());
 f.setWarning('Model metadata not found. Defaulting to fallback metadata.');
 const forged=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'},headers:{'X-Pane-Token':'forged'}});assert.equal(forged.status,403);assert.equal(f.capture().length,0);
 const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'}});assert.equal(probe.status,200,probe.text);assert.equal(probe.body.status,'awaiting_approval');assert.equal(probe.body.price.kind,'unknown');assert.equal(f.capture().length,0);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:approve?'allow':'deny',project:h.dir}});
 const event=await result(stream);assert.equal(event.status,approve?'done':'declined',JSON.stringify(event));assert.equal(f.capture().length,approve?1:0);
 const notices=(await call(h.api,'/api/trace')).body.records.filter((r:any)=>r.kind==='provider.warning');assert.equal(notices.length,approve?1:0);if(approve)assert.match(notices[0].data.error,/Model metadata/);

});

test('334: daemon disappears after probe approval; no Codex call and no stale success',async t=>{
 const f=await ollamaFixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'}});assert.equal(probe.status,200);f.setOffline(true);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal((await result(stream)).status,'error');assert.equal(f.capture().length,0);
});

test('344: HTTP-selected uninstalled cloud model pulls only after probe approval; failed pull preserves a seat/session', {timeout:8000},async t=>{
 const f=await ollamaFixture(t);f.setCloud({models:[{name:'gpt-oss:20b'}]});const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());await call(h.api,'/api/providers/ollama/check',{body:{}});
 const select=await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'gpt-oss:20b-cloud'}});assert.equal(select.status,200,select.text);assert.equal(f.pulls.length,0);const pane=h.runtime.registry.get('worker')!;pane.sessionId='previous-session';const before=pane.settings();f.setPullStatus(503);await assert.rejects(h.runtime.runTurn('worker','do not execute'));assert.deepEqual(pane.settings(),before);assert.equal(f.capture().length,0);
 const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'gpt-oss:20b-cloud'}});assert.equal(probe.status,200,probe.text);assert.equal(f.pulls.length,1);assert.equal(f.capture().length,0);f.setPullStatus(200);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal((await result(stream)).status,'done');assert.equal(f.pulls.length,2);assert.equal(f.capture().length,1);assert.deepEqual(pane.settings(),before);
});
