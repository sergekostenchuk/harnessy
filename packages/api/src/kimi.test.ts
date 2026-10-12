import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal,KIMI_LOGIN_UNKNOWN} from '@harnessy/providers';
import {kimiFixture} from '../../providers/src/kimi-test-helpers.ts';
import {fixture,call} from './test-helpers.ts';

test('264 Kimi HTTP: catalog/check/login-terminal stay usable; read/edit refuse while metadata never reads config or runs models',async t=>{
 const f=kimiFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:f.dir,open:async path=>{scripts.push(readFileSync(path,'utf8'))}})}});
 const checked=await call(h.api,'/api/providers/kimi/check',{body:{}});assert.equal(checked.status,200);assert.equal(checked.body.login.state,'unknown');assert.equal(checked.body.login.reason,KIMI_LOGIN_UNKNOWN);
 const catalog=await call(h.api,'/api/providers/catalog'),row=catalog.body.providers.find((p:any)=>p.id==='kimi');assert.equal(row.installed,true);assert.equal(row.version,'2.1.1');assert.deepEqual(row.models,[{id:'default',label:'по умолчанию программы'}]);assert.equal(row.capabilities.probe.ok,true);assert.deepEqual((await call(h.api,'/api/status')).body.models.kimi,row.models);
 const login=await call(h.api,'/api/providers/kimi/login-terminal',{body:{command:'touch /OWNER'}});assert.equal(login.status,200);assert.match(scripts[0]!,/'login'/);assert.doesNotMatch(scripts[0]!,/OWNER|FIXTURE-SECRET/);
 const denied=await call(h.api,'/api/providers/kimi/login-terminal',{body:{},headers:{'X-Pane-Token':'forged','X-Harness-Pane':'owner'}});assert.equal(denied.status,403);assert.equal(denied.body.code,'owner_only');assert.equal(scripts.length,1);
 const panes=h.runtime.registry.get('worker')!,settings=panes.settings();const changed=await call(h.api,'/api/panes/worker',{body:{vendor:'kimi',model:'default'}});assert.equal(changed.status,409);assert.deepEqual(panes.settings(),settings);
 const limits=await call(h.api,'/api/limits');assert.equal(limits.body.providers.some((p:any)=>p.vendor==='kimi'),false);assert.ok(f.capture().every(c=>JSON.stringify(c.args)==='["--version"]'));assert.equal(h.provider.calls.length,0);
});
