import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {ProviderCatalog} from '@harnessy/providers';
import {devinFixture} from '../../providers/src/devin-test-helpers.ts';
import {kimiFixture} from '../../providers/src/kimi-test-helpers.ts';
import {opencodeFixture} from '../../providers/src/opencode-test-helpers.ts';
import {fixture,call,sse} from './test-helpers.ts';

function probeResult(stream:Awaited<ReturnType<typeof sse>>,id:string){const found=()=>stream.frames.find(e=>e.type==='providers'&&e.approvalId===id&&e.event==='probe'&&['done','error','declined'].includes(e.status));return new Promise<any>((resolve,reject)=>{const done=()=>{const e=found();if(e){stream.response.off('data',done);resolve(e)}};stream.response.on('data',done);stream.response.once('error',reject);stream.response.once('end',()=>reject(Error('SSE ended without probe result')));done()})}
for(const p of [{id:'devin',model:'adaptive',fixture:devinFixture},{id:'kimi',model:'default',fixture:kimiFixture},{id:'opencode',model:'opencode/free-model',fixture:opencodeFixture}]){
 test('345 '+p.id+': HTTP all selection/turn, read/edit 409, failed login keeps place and session',async t=>{
  const f=p.fixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}});await call(h.api,'/api/providers/'+p.id+'/check',{body:{}});
  const isTurn=(c:any)=>c.args.includes('--print')||c.args.includes('--prompt')||c.args[0]==='run';
  for(const mode of ['read','edit']){const before=h.runtime.registry.get('worker')!.settings();const r=await call(h.api,'/api/panes/worker',{body:{vendor:p.id,model:p.model,mode}});assert.equal(r.status,409,r.text);assert.equal(r.body.code,'capability_unsupported');assert.deepEqual(h.runtime.registry.get('worker')!.settings(),before)}
  const choose=await call(h.api,'/api/panes/worker',{body:{vendor:p.id,model:p.model,mode:'all'}});assert.equal(choose.status,200,choose.text);await h.runtime.runTurn('worker','fixture message');const pane=h.runtime.registry.get('worker')!,session=pane.sessionId,settings=pane.settings();assert.equal(session,p.id+'-session');assert.equal(f.capture().filter(isTurn).length,1);
  f.update({turnError:true});await assert.rejects(h.runtime.runTurn('worker','fixture failure'),{code:'turn_failed'});assert.equal(pane.sessionId,session);assert.deepEqual(pane.settings(),settings);assert.equal(f.capture().filter(isTurn).length,2);
  const status=(await call(h.api,'/api/status')).body;assert.deepEqual(status.turnModes[p.id].all,{ok:true,note:'без инструментов Harnessy'});assert.equal((await call(h.api,'/api/limits')).body.providers.some((v:any)=>v.vendor===p.id),false);
 });
 for(const decision of ['deny','allow'])test('345 '+p.id+': '+decision+' probe runs only in an empty disposable directory',async t=>{
  const f=p.fixture(t),h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry])}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());
  const isTurn=(c:any)=>c.args.includes('--print')||c.args.includes('--prompt')||c.args[0]==='run';
  const forged=await call(h.api,'/api/providers/'+p.id+'/probe',{body:{model:p.model},headers:{'X-Pane-Token':'forged'}});assert.equal(forged.status,403);assert.equal(f.capture().filter(isTurn).length,0);
  const request=await call(h.api,'/api/providers/'+p.id+'/probe',{body:{model:p.model}});assert.equal(request.status,200,request.text);assert.equal(request.body.status,'awaiting_approval');assert.equal(f.capture().filter(isTurn).length,0);assert.match(h.runtime.owner.approvals.get(request.body.approvalId)!.detail,/полный доступ/);
  await call(h.api,'/api/approve',{body:{pane:'owner',id:request.body.approvalId,decision,project:h.dir}});const result=await probeResult(stream,request.body.approvalId);assert.equal(result.status,decision==='allow'?'done':'declined',JSON.stringify(result));
  const turns=f.capture().filter(isTurn);assert.equal(turns.length,decision==='allow'?1:0);if(turns.length){const turn=turns[0];assert.notEqual(turn.cwd,h.dir);assert.deepEqual(turn.files,[]);assert.equal(existsSync(turn.cwd),false);assert.ok(turn.args.some((s:string)=>s.endsWith('\n\nОтветь одним словом: готов.')));assert.doesNotMatch(JSON.stringify(turn.args),/mcp|pane-mcp/)}
 });
}
