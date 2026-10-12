import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProviderCatalog,LoginTerminal,QWEN_LOGIN_UNKNOWN,ProviderError} from '@harnessy/providers';
import {qwenFixture,QWEN_TEST_TIMEOUT_MS as timeout} from '../../providers/src/qwen-test-helpers.ts';
import {fixture,call,OWNER} from './test-helpers.ts';

test('333 Qwen HTTP: check/catalog/status/default selection; unsupported modes preserve seat/session; probe needs verified login', {timeout},async t=>{
 const f=qwenFixture(t),scripts:string[]=[],h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:f.dir,open:async path=>{scripts.push(readFileSync(path,'utf8'))}})}});
 const checked=await call(h.api,'/api/providers/qwen/check',{body:{}});assert.equal(checked.status,200);assert.equal(checked.body.login.state,'unknown');assert.equal(checked.body.login.reason,QWEN_LOGIN_UNKNOWN);
 const status=(await call(h.api,'/api/status')).body;assert.equal(status.models.qwen[0].id,'default');assert.equal(status.turnModes.qwen.all.ok,true);assert.equal(status.turnModes.qwen.read.ok,false);
 const pane=h.runtime.registry.get('worker')!,settings=pane.settings(),session=pane.sessionId;
 for(const body of [{vendor:'qwen',model:'default'},{vendor:'qwen',model:'invented',mode:'all',binding:h.runtime.paneBinding('worker')}]){const r=await call(h.api,'/api/panes/worker',{body});assert.equal(r.status,409);assert.deepEqual(pane.settings(),settings);assert.equal(pane.sessionId,session)}
 const room=await call(h.api,'/api/room',{body:{vendor:'qwen',model:'default',folder:true}});assert.equal(room.status,409);assert.equal(room.body.code,'capability_unsupported');
 const selected=await call(h.api,'/api/panes/worker',{body:{vendor:'qwen',model:'default',mode:'all',binding:h.runtime.paneBinding('worker')}});assert.equal(selected.status,200);assert.equal(pane.vendor,'qwen');
 const forged=await call(h.api,'/api/providers/qwen/probe',{body:{model:'default',confirmed:true}});assert.equal(forged.status,400);
 const probe=await call(h.api,'/api/providers/qwen/probe',{body:{model:'default'}});assert.equal(probe.status,409);assert.equal(probe.body.code,'not_logged_in');assert.equal(h.runtime.owner.approvals.size,0);
 const login=await call(h.api,'/api/providers/qwen/login-terminal',{body:{command:'touch /OWNER',args:['--openai-api-key','INJECT']}});assert.equal(login.status,200);assert.match(scripts[0]!,/'--auth-type' 'qwen-oauth'/);assert.doesNotMatch(scripts[0]!,/OWNER|INJECT|fixture-secret/);
 for(const route of ['catalog','qwen/check','qwen/login-terminal','qwen/probe']){const r=await call(h.api,'/api/providers/'+route,{...(route==='catalog'?{}:{body:{model:'default'}}),headers:{'X-Pane-Token':'forged'}});assert.equal(r.status,403)}
 assert.equal(scripts.length,1);assert.ok(f.capture().every(c=>JSON.stringify(c.args)==='["--version"]'));assert.equal((await call(h.api,'/api/limits')).body.providers.some((p:any)=>p.vendor==='qwen'),false);
 const sent=await call(h.api,'/api/chat',{body:{pane:'worker',message:'ответь',direct:true}});assert.equal(sent.status,200);await h.runtime.idle();
 const chat=h.runtime.chatGet(h.runtime.chatsList(OWNER).active.worker!,OWNER);assert.ok(chat.messages.some(m=>m.role==='ai'&&m.text==='готов'));assert.equal(pane.sessionId,'123e4567-e89b-12d3-a456-426614174000');assert.equal(f.capture().filter(c=>c.args?.includes('--prompt')).length,1);
});

test('333 Qwen absent: no default model and both selection doors refuse without mutation', {timeout},async t=>{
 const f=qwenFixture(t),entry={...f.entry,binary:f.dir+'/absent',version:async()=>{throw new ProviderError('no_binary','missing')}},h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}});await call(h.api,'/api/providers/qwen/check',{body:{}});
 const catalog=(await call(h.api,'/api/providers/catalog')).body.providers[0];assert.equal(catalog.installed,false);assert.deepEqual(catalog.models,[]);const pane=h.runtime.registry.get('worker')!,before=pane.settings(),session=pane.sessionId;
 for(const [path,body] of [['/api/panes/worker',{vendor:'qwen',model:'default',mode:'all',binding:h.runtime.paneBinding('worker')}],['/api/room',{vendor:'qwen',model:'default',folder:false}]] as const){const r=await call(h.api,path,{body});assert.equal(r.status,409);assert.equal(r.body.code,'provider_not_installed')}
 assert.deepEqual(pane.settings(),before);assert.equal(pane.sessionId,session);assert.equal(f.capture().length,0);
});
