import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderCatalog,cliEntry,executeCli} from '@harnessy/providers';
import {cliFixture} from '../../providers/src/cli/test-support.ts';
import {fixture,call,sse,deferred,until} from './test-helpers.ts';

function failed(stream:Awaited<ReturnType<typeof sse>>,id:string):Promise<any>{return new Promise((resolve,reject)=>{
 const check=()=>{const row=stream.frames.find(e=>e.type==='providers'&&e.status==='error'&&e.approvalId===id);if(row){clearTimeout(timer);stream.response.off('data',check);resolve(row)}};
 const timer=setTimeout(()=>{stream.response.off('data',check);reject(Error('Нет исхода пробного хода'))},5000);stream.response.on('data',check);check();
})}

for(const blockedRead of [2,3])test('277: HTTP approval binds account through '+(blockedRead===2?'catalog':'process')+' model-list await',async t=>{
 const f=await cliFixture(t,'probe'),account=join(f.dir,'account.json'),setAccount=(email:string|null)=>writeFileSync(account,JSON.stringify({loggedIn:true,email}));setAccount('a@example.test');
 const seen=deferred(),gate=deferred();let models=0,armed=false;
 const entry=cliEntry({...f.description,auth:{file:()=>account,parse:(raw:string|null)=>JSON.parse(raw!)}},{env:f.env,cwd:f.dir,temporaryDirectory:f.dir,execute:async(request,signal,hooks)=>{
  if(request.args[1]==='models'&&armed&&++models===blockedRead){seen.resolve();await gate.promise}
  return executeCli(request,signal,hooks);
 }}),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}}),stream=await sse(h.api);t.after(()=>stream.close());
 await call(h.api,'/api/providers/test-cli/check',{body:{}});armed=true;const response=await call(h.api,'/api/providers/test-cli/probe',{body:{model:'test-model'}});assert.equal(response.status,200);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:response.body.approvalId,decision:'allow',project:h.dir}});await seen.promise;setAccount('b@example.test');gate.resolve();
 const event=await failed(stream,response.body.approvalId);assert.equal(event.error.code,'login_changed');assert.match(event.error.reason,/Вход изменился/);
 assert.equal(f.capture().some(e=>e.action==='turn'),false);assert.equal(stream.frames.some(e=>e.type==='providers'&&e.status==='done'&&e.event==='probe'),false);assert.doesNotMatch(JSON.stringify(event),/[ab]@example/);
});
test('277: account without identity cannot inherit an approval whose identity was also absent',async t=>{
 const f=await cliFixture(t,'probe'),entry=cliEntry({...f.description,auth:{command:f.description.version.command,parse:()=>({loggedIn:true})}},{env:f.env,cwd:f.dir}),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}}),stream=await sse(h.api);t.after(()=>stream.close());
 const r=await call(h.api,'/api/providers/test-cli/probe',{body:{model:'test-model'}});
 await call(h.api,'/api/approve',{body:{pane:'owner',id:r.body.approvalId,decision:'allow',project:h.dir}});
 assert.equal((await failed(stream,r.body.approvalId)).error.code,'login_changed');assert.equal(f.capture().some(e=>e.action==='turn'),false);
});
test('277: API checkedAt and SSE at are epoch milliseconds, never seconds',async t=>{
 const f=await cliFixture(t,'probe'),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([cliEntry(f.description,{env:f.env,cwd:f.dir})])}}),stream=await sse(h.api);t.after(()=>stream.close());
 const before=Date.now();await call(h.api,'/api/providers/test-cli/check',{body:{}});const r=await call(h.api,'/api/providers/catalog'),after=Date.now(),stamp=r.body.providers[0].login.checkedAt;
 assert.ok(stamp>=before&&stamp<=after);assert.equal(new Date(stamp).getFullYear(),new Date(before).getFullYear());
 await until(()=>stream.frames.some(e=>e.type==='providers'&&e.event==='check'));assert.equal(stream.frames.find(e=>e.type==='providers'&&e.event==='check').at,h.runtime.clock.now());assert.ok(h.runtime.clock.now()>1e12);
});
