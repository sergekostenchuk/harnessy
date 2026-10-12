import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cliEntry,ProviderCatalog} from '@harnessy/providers';
import {geminiFixture} from '../../providers/src/gemini-test-helpers.ts';
import {cliFixture} from '../../providers/src/cli/test-support.ts';
import {fixture,call,deferred,OWNER} from './test-helpers.ts';

// These are real HTTP doors and real CLI metadata reads; no owner files or model calls.
for(const state of ['missing','none','error'] as const)test('310: '+state+' refuses both selection doors without changing settings, sessions or saved bytes',async t=>{
 const g=geminiFixture(t);if(state==='error')writeFileSync(g.account,'{');
 const entry=state==='missing'?cliEntry({...g.description,binary:join(g.dir,'absent')},{env:g.env,cwd:g.dir}):g.entry;
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}}),p=h.runtime.project;
 await call(h.api,'/api/room',{body:{vendor:'claude',model:'w1',folder:true}});
 const worker=p.registry.get('worker')!,room=p.registry.get('room')!;worker.mode='all';worker.sessionId='worker-session';room.sessionId='room-session';p.state.savePanes(p.registry,p.journal);
 const before=[worker.settings(),room.settings()],bytes=['panes.json','chats.json'].map(file=>readFileSync(join(h.dir,'.harness','state',file)));
 const catalog=await call(h.api,'/api/providers/catalog');assert.equal(catalog.body.providers[0].installed,state!=='missing');
 const status=(await call(h.api,'/api/status')).body;assert.deepEqual(status.models.gemini,state==='missing'?[]:[{id:'default',label:'по умолчанию программы'}]);
 // The room's read mode is unsupported by Gemini, but readiness is checked first.
 for(const path of ['/api/panes/worker','/api/room'])for(const explicit of state==='missing'?[true]:[true,false]){
  const r=await call(h.api,path,{body:{...(explicit?{vendor:'gemini'}:{}),model:'default',folder:true}});
  assert.equal(r.status,409,r.text);assert.equal(r.body.code,state==='missing'?'provider_not_installed':'login_required');
  if(state!=='missing'){assert.ok(r.body.reason);assert.equal(r.body.command,"'"+g.description.binary+"'")}
  assert.equal(p.registry.get('room'),room);assert.deepEqual([worker.settings(),room.settings()],before);
  for(const [i,file] of ['panes.json','chats.json'].entries())assert.deepEqual(readFileSync(join(h.dir,'.harness','state',file)),bytes[i]);
 }
 assert.ok(g.capture().every(c=>JSON.stringify(c.args)==='["--version"]'));assert.equal(h.provider.calls.length,0);
});

test('310: a cold catalog has no default model and cannot authorize a selection while metadata is pending',async t=>{
 const g=geminiFixture(t),gate=deferred();g.entry.version=async()=>{await gate.promise;return '0.63.0'};
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([g.entry])}});t.after(()=>gate.resolve());
 const pane=h.runtime.registry.get('worker')!,before=pane.settings();
 assert.deepEqual((await call(h.api,'/api/status')).body.models.gemini,[]);
 const r=await call(h.api,'/api/panes/worker',{body:{vendor:'gemini',model:'default',mode:'all'}});
 assert.equal(r.body.code,'provider_not_installed');assert.deepEqual(pane.settings(),before);gate.resolve();
});

test('310: unknown Gemini login permits selection; actual CLI refusal is a turn error without changing selected settings or session',async t=>{
 const g=geminiFixture(t);writeFileSync(g.account,JSON.stringify({active:'alice@example.test'}));
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([g.entry])}});await call(h.api,'/api/providers/catalog');
 const r=await call(h.api,'/api/panes/worker',{body:{vendor:'gemini',model:'default',mode:'all'}});assert.equal(r.status,200,r.text);
 const pane=h.runtime.registry.get('worker')!;pane.sessionId='ab123456-1234-1234-1234-123456789abc';h.runtime.project.state.savePanes(h.runtime.registry,h.runtime.project.journal);
 const selected=()=>({vendor:pane.vendor,model:pane.model,mode:pane.mode,session:pane.sessionId}),before=selected();
 // The process double exits 99 on any turn, just like a saved but expired login.
 await assert.rejects(h.runtime.runTurn('worker','fixture refusal'),{code:'transport_lost'});
 assert.deepEqual(selected(),before);assert.equal(pane.transcript.some(m=>m.role==='ai'),false);assert.equal(g.capture().filter(c=>c.args.includes('--prompt')).length,1);
});

test('310: unknown login is not permission for an arbitrary descriptor',async t=>{
 const f=await cliFixture(t,'probe'),entry=cliEntry(f.description,{env:f.env,cwd:f.dir});entry.auth=async()=>({loggedIn:false,state:'unknown',reason:'not verified'});
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry])}});await call(h.api,'/api/providers/catalog');
 for(const path of ['/api/panes/worker','/api/room']){const r=await call(h.api,path,{body:{vendor:'test-cli',model:'test-model',folder:true}});assert.equal(r.status,409);assert.equal(r.body.code,'login_required')}
 assert.equal(f.capture().some(c=>c.action==='turn'),false);
});

test('310: absent, forged and default models cannot bypass catalog membership through either door',async t=>{
 const f=await cliFixture(t,'probe'),catalog=new ProviderCatalog([cliEntry(f.description,{env:f.env,cwd:f.dir})]),h=await fixture(t,{deps:{providerCatalog:catalog}});
 await call(h.api,'/api/providers/catalog');h.runtime.roomSet({vendor:'claude',model:'w1',folder:true},OWNER);
 const p=h.runtime.project,worker=p.registry.get('worker')!,room=p.registry.get('room')!;worker.sessionId='old-worker';room.sessionId='old-room';p.state.savePanes(p.registry,p.journal);
 const before=[worker.settings(),room.settings()];
 // Registry membership alone is stale/untrusted; selection consumes the catalog snapshot.
 p.registry.models['test-cli']!.push({id:'forged',label:'forged'});
 for(const model of [undefined,'forged','default'])for(const path of ['/api/panes/worker','/api/room']){
  const r=await call(h.api,path,{body:{vendor:'test-cli',...(model===undefined?{}:{model}),folder:true}});assert.equal(r.status,409,r.text);assert.equal(r.body.code,'model_unsupported');assert.deepEqual([worker.settings(),room.settings()],before);assert.equal(p.registry.get('room'),room);
 }
 const valid=await call(h.api,'/api/room',{body:{vendor:'test-cli',model:'test-model',folder:true}});assert.equal(valid.status,200,valid.text);assert.equal(p.registry.get('room')?.vendor,'test-cli');assert.equal(f.capture().some(c=>c.action==='turn'),false);
});
