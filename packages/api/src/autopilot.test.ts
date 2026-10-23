import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {withPathLock} from '@harnessy/team';
import {fixture,call,OWNER,deferred,until} from './test-helpers.ts';

const conditions={operations:['answer_question','answer_blocker','answer_escalation'],maxSpendPercent:5};
const state=async(api:Parameters<typeof call>[0])=>{const response=await call(api,'/api/status');assert.equal(response.status,200,response.text);return response.body};
const change=(status:any,on:boolean,until:'morning'|'reply'='morning')=>({project:status.project,instance:status.trace.instanceId,revision:status.autopilot.revision,on,...(on?{until,conditions}:{})});

test('TS-38.1: owner state is revisioned, persistent and cannot be forged from a pane or generic settings',async t=>{
 const h=await fixture(t),initial=await state(h.api);
 assert.deepEqual(initial.autopilot.on,false);
 const input=change(initial,true),forged=await call(h.api,'/api/autopilot',{body:input,headers:{'X-Pane-Token':'a'.repeat(64)}});
 assert.equal(forged.status,403);assert.equal((await state(h.api)).autopilot.generation,0);
 const generic=await call(h.api,'/api/settings',{body:{scope:'project',patch:{autopilot:null}}});assert.equal(generic.status,400);
 const enabled=await call(h.api,'/api/autopilot',{body:input});assert.equal(enabled.status,200);assert.equal(enabled.body.autopilot.on,true);assert.equal(enabled.body.autopilot.generation,1);
 const saved=JSON.parse(readFileSync(join(h.dir,'.harness','state','settings.json'),'utf8'));assert.equal(saved.autopilot.revision,1);
 await h.runtime.openProject(h.dir);const reopened=await state(h.api);assert.equal(reopened.autopilot.on,true);assert.equal(reopened.autopilot.generation,1);
 assert.equal((await call(h.api,'/api/autopilot',{body:{...input,revision:1}})).status,409,'a request bound to the old project instance cannot be replayed');
 assert.equal((await state(h.api)).autopilot.generation,1);
 const stale=await call(h.api,'/api/autopilot',{body:{...change(reopened,true),revision:0}});assert.equal(stale.status,409);assert.equal(stale.body.code,'autopilot_conflict');
 const bad=await call(h.api,'/api/autopilot',{body:{...change(await state(h.api),true),conditions:{operations:['delete_files'],maxSpendPercent:5}}});assert.equal(bad.status,400);
 const bypass=await call(h.api,'/api/autopilot',{body:{...change(await state(h.api),true),conditions:{...conditions,stopCases:[]}}});assert.equal(bypass.status,400,'the window cannot disable mandatory stop cases');
 const removed=await call(h.api,'/api/autopilot',{body:change(await state(h.api),false)});assert.equal(removed.body.autopilot.on,false);assert.equal(removed.body.autopilot.generation,2);
});

test('TS-38.1: morning expires at the next local 07:00 and revokes the generation',async t=>{
 const h=await fixture(t),before=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(before,true)})).body.autopilot;
 const at=Date.parse(enabled.until.at),local=new Date(at);assert.equal(local.getHours(),7);assert.equal(local.getMinutes(),0);assert.ok(at>h.clock.now());
 h.clock.advance(at-h.clock.now()-1);assert.equal((await state(h.api)).autopilot.on,true);
 h.clock.advance(1);const after=await state(h.api);assert.equal(after.autopilot.on,false);assert.equal(after.autopilot.generation,enabled.generation+1);
 assert.equal((await state(h.api)).autopilot.generation,after.autopilot.generation);
});

test('TS-38.1: first accepted owner message ends until-reply; rejected or agent action does not',async t=>{
 const h=await fixture(t),before=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(before,true,'reply')})).body.autopilot;
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'missing',message:'не дошло'}})).status,404);
 assert.equal((await state(h.api)).autopilot.on,true);
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'вернулся'}})).status,200);
 const after=await state(h.api);assert.equal(after.autopilot.on,false);assert.equal(after.autopilot.generation,enabled.generation+1);
 const second=(await call(h.api,'/api/autopilot',{body:change(after,true,'reply')})).body.autopilot;
 h.runtime.postOwner({to:'worker',kind:'note',text:'решил'},OWNER);
 assert.equal((await state(h.api)).autopilot.generation,second.generation+1);
});

test('TS-38.1: a provider approval ends until-reply only when the decision is accepted',async t=>{
 const h=await fixture(t),original=h.runtime.providerOperations.approve;
 t.after(()=>{h.runtime.providerOperations.approve=original});
 let current=await state(h.api);
 h.runtime.providerOperations.approve=()=>({ok:false,error:'вопрос уже закрыт'});
 await call(h.api,'/api/autopilot',{body:change(current,true,'reply')});
 assert.equal(h.runtime.approve('owner','provider-probe:closed','allow',OWNER).ok,false);
 assert.equal((await state(h.api)).autopilot.on,true);
 h.runtime.providerOperations.approve=()=>({ok:true,error:null});
 assert.equal(h.runtime.approve('owner','provider-probe:accepted','allow',OWNER).ok,true);
 current=await state(h.api);assert.equal(current.autopilot.on,false);
});

test('TS-38.1: a delivered owner intervention ends until-reply',async t=>{
 const h=await fixture(t),done=deferred<{text:string;sessionId:null}>();t.after(()=>done.resolve({text:'готово',sessionId:null}));
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.setHandle({async interrupt(){},async steer(){}});return done.promise};
 h.runtime.postOwner({to:'worker',kind:'task',text:'начни'},OWNER);
 await until(()=>!!h.runtime.registry.get('worker')?.handle);
 const current=await state(h.api),enabled=await call(h.api,'/api/autopilot',{body:change(current,true,'reply')});assert.equal(enabled.status,200);
 const reply=await call(h.api,'/api/steer',{body:{pane:'worker',message:'вернулся'}});assert.equal(reply.status,200,reply.text);
 assert.equal((await state(h.api)).autopilot.on,false);
 done.resolve({text:'готово',sessionId:null});await h.runtime.idle();
});

test('TS-38.1: changing conditions and re-enabling replace the permission generation',async t=>{
 const h=await fixture(t);let current=await state(h.api);
 for(const operations of [['answer_question'],['answer_question','deny'],['answer_question','deny']]){
  const response=await call(h.api,'/api/autopilot',{body:{...change(current,true,'reply'),conditions:{operations,maxSpendPercent:3}}});assert.equal(response.status,200);assert.equal(response.body.autopilot.generation,current.autopilot.generation+1);current=await state(h.api);
 }
 assert.deepEqual(current.autopilot.conditions.operations,['answer_question','deny']);
 assert.equal(current.autopilot.conditions.stopCases.length,6);
});

test('TS-38.1/38.2: generation and effect share the project lock; an owner action cannot cross it',async t=>{
 const h=await fixture(t),first=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(first,true,'reply')})).body.autopilot;
 const entered=deferred(),release=deferred();
 const applied=h.runtime.withAutopilotGeneration(enabled.generation,async snapshot=>{
  assert.equal(snapshot.generation,enabled.generation);assert.equal(snapshot.revision,enabled.revision);
  assert.deepEqual(snapshot.stopCodes,['payment','external_publish','data_delete','software_install','external_network','spend_over_cap']);
  assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.conditions.operations),true);
  entered.resolve();await release.promise;
  h.runtime.postOwner({to:'worker',kind:'note',text:'решение консилиума'},OWNER);
  return 'applied';
 });
 await entered.promise;
 assert.throws(()=>h.runtime.chat({pane:'worker',message:'вернулся'},OWNER),error=>(error as {code?:string}).code==='autopilot_busy');
 release.resolve();assert.equal(await applied,'applied');assert.equal((await state(h.api)).autopilot.on,true);
 const off=(await call(h.api,'/api/autopilot',{body:change(await state(h.api),false)})).body.autopilot;
 await assert.rejects(h.runtime.withAutopilotGeneration(enabled.generation,()=>null),error=>(error as {code?:string}).code==='autopilot_off');
 assert.equal(off.generation,enabled.generation+1);
 const again=(await call(h.api,'/api/autopilot',{body:change(await state(h.api),true)})).body.autopilot;
 await assert.rejects(h.runtime.withAutopilotGeneration(enabled.generation,()=>null),error=>(error as {code?:string}).code==='autopilot_generation_mismatch');
 assert.equal((await h.runtime.withAutopilotGeneration(again.generation,snapshot=>snapshot.generation)),again.generation);
});

test('TS-38.1/38.2: expired term refuses application and persists revocation',async t=>{
 const h=await fixture(t),initial=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(initial,true)})).body.autopilot;
 const entered=deferred(),release=deferred(),blocker=withPathLock(h.dir,async()=>{entered.resolve();await release.promise});await entered.promise;
 const application=h.runtime.withAutopilotGeneration(enabled.generation,()=>{throw Error('must not apply')});
 h.clock.time=Date.parse(enabled.until.at);release.resolve();await blocker;
 await assert.rejects(application,error=>(error as {code?:string}).code==='autopilot_expired');
 const after=await state(h.api);assert.equal(after.autopilot.on,false);assert.equal(after.autopilot.generation,enabled.generation+1);
});

test('TS-38.1/38.2: unreadable project state refuses both display and application',async t=>{
 const h=await fixture(t),path=join(h.dir,'.harness','state','settings.json');
 writeFileSync(path,'{"autopilot":{"on":true}}');
 await assert.rejects(h.runtime.autopilotStatus(),error=>(error as {code?:string}).code==='autopilot_unreadable');
 await assert.rejects(h.runtime.withAutopilotGeneration(1,()=>{throw Error('must not apply')}),error=>(error as {code?:string}).code==='autopilot_unreadable');
});
