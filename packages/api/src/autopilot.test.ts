import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {withPathLock} from '@harnessy/team';
import type {Initiator} from '@harnessy/journal';
import {AUTOPILOT_OWNER} from '@harnessy/runtime';
import {fixture,call,OWNER,deferred,until} from './test-helpers.ts';

const conditions={operations:['answer_question','answer_blocker','answer_escalation'],maxSpendPercent:5};
const state=async(api:Parameters<typeof call>[0])=>{const response=await call(api,'/api/status');assert.equal(response.status,200,response.text);return response.body};
const change=(status:any,on:boolean,until:'morning'|'reply'='morning')=>({project:status.project,instance:status.trace.instanceId,revision:status.autopilot.revision,on,...(on?{until,conditions}:{})});
const proposedSeats='  lead: {kind: orchestrator, role: lead, label: Ведущий, vendor: claude, model: w1, mode: read}\n  worker: {kind: worker, role: worker, label: Воркер, vendor: claude, model: w1, mode: read}';
async function ownerSeatProposal(t:Parameters<typeof fixture>[0]){
 const h=await fixture(t,{seats:proposedSeats}),end=deferred<{text:string;sessionId:null}>();
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();if(seat.id==='lead'){ctx.registerProcessToken('lead-token');return end.promise}return {text:'готово',sessionId:null}};
 const run=h.runtime.runTurn('lead','Предложи роль').catch(error=>{if(error.code!=='cancelled')throw error});
 await until(()=>h.provider.calls.some(c=>c.seat.id==='lead'));
 const proposal=await call(h.api,'/api/seats/propose',{body:{seats:[{kind:'worker',label:'Юрист',vendor:'claude',model:'w1',mode:'read',intro:'Проверь договор.'}],from:'lead'},headers:{'X-Pane-Token':'lead-token'}});
 assert.equal(proposal.status,200,proposal.text);
 t.after(async()=>{end.resolve({text:'готово',sessionId:null});await run});
 return {...h,seat:{project:h.dir,proposalId:proposal.body.proposalId,version:proposal.body.version,seatIndex:0}};
}

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

test('TS-38.1/38.2: effect holds the settings lock but nested owner API takes the project lock',async t=>{
 const h=await fixture(t),first=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(first,true,'reply')})).body.autopilot;
 assert.throws(()=>h.runtime.postOwner({to:'worker',kind:'note',text:'подделка'},AUTOPILOT_OWNER),error=>(error as {code?:string}).code==='policy_denied');
 const entered=deferred(),release=deferred();
 const applied=h.runtime.withAutopilotGeneration(enabled.generation,async snapshot=>{
  assert.equal(snapshot.generation,enabled.generation);assert.equal(snapshot.revision,enabled.revision);
  assert.deepEqual(snapshot.stopCodes,['payment','external_publish','data_delete','software_install','external_network','spend_over_cap']);
  assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.conditions.operations),true);
  await assert.rejects(h.runtime.attempt('worker',{project:h.dir,turnInstanceId:'missing',action:'retry'},AUTOPILOT_OWNER),error=>(error as {code?:string}).code==='not_waiting','the nested owner API must reach its project lock');
  entered.resolve();await release.promise;
  h.runtime.postOwner({to:'worker',kind:'note',text:'решение консилиума'},AUTOPILOT_OWNER);
  assert.equal(h.runtime.settings.autopilot().on,true,'the autopilot effect is not the owner returning');
  return 'applied';
 });
 await entered.promise;
 assert.throws(()=>h.runtime.chat({pane:'worker',message:'вернулся'},OWNER),error=>(error as {code?:string}).code==='autopilot_busy');
 assert.throws(()=>h.runtime.settings.ownerAutopilotAction(),error=>(error as {code?:string}).code==='autopilot_busy');
 let changed=false;const pendingChange=h.runtime.autopilotSet(change(await state(h.api),false),OWNER).then(value=>{changed=true;return value});
 await Promise.resolve();assert.equal(changed,false,'a concurrent settings change waits for the effect');
 release.resolve();assert.equal(await applied,'applied');
 const off=(await pendingChange).autopilot;assert.equal(off.on,false);
 await assert.rejects(h.runtime.withAutopilotGeneration(enabled.generation,()=>null),error=>(error as {code?:string}).code==='autopilot_off');
 assert.equal(off.generation,enabled.generation+1);
 const again=(await call(h.api,'/api/autopilot',{body:change(await state(h.api),true)})).body.autopilot;
 await assert.rejects(h.runtime.withAutopilotGeneration(enabled.generation,()=>null),error=>(error as {code?:string}).code==='autopilot_generation_mismatch');
 assert.equal((await h.runtime.withAutopilotGeneration(again.generation,snapshot=>snapshot.generation)),again.generation);
});

test('TS-38.1/38.2: expired term refuses application and persists revocation',async t=>{
 const h=await fixture(t),initial=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(initial,true)})).body.autopilot;
 const entered=deferred(),release=deferred(),blocker=withPathLock(join(h.dir,'.harness','state','settings.json'),async()=>{entered.resolve();await release.promise});await entered.promise;
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

test('TS-38.1: every owner entry refuses a forged autopilot initiator and an external action during application',async t=>{
 const h=await fixture(t),r=h.runtime,seat={project:h.dir,proposalId:'p'+'a'.repeat(24),version:1,seatIndex:0};
 const paths:Array<[string,(initiator:Initiator)=>unknown]>=[
  ['postOwner',who=>r.postOwner({to:'worker',kind:'note',text:'test'},who)],
  ['assign',who=>r.assignRoomRole({role:'worker'},who)],
  ['createOwnerSeat',who=>r.createOwnerSeat(seat,who)],
  ['confirmTeam',who=>r.confirmTeam(seat,who)],
  ['interrupt',who=>r.interrupt('worker',who)],
  ['approve',who=>r.approve('worker','missing','allow',who)],
  ['chat',who=>r.chat({pane:'worker',message:'test'},who)],
  ['projectSet',who=>r.projectSet(h.dir,{},who)],
  ['projectCreate',who=>r.projectCreate({path:h.dir+'/next'},who)],
  ['paneSet',who=>r.paneSet('worker',{mode:'chat'},who)],
  ['halt',who=>r.halt(true,who)],
  ['roomSet',who=>r.roomSet({model:'w1',folder:false},who)],
  ['chatsNew',who=>r.chatsNew({pane:'worker'},who)],
  ['handoff',who=>r.handoff({to:'worker'},who)],
  ['onboard',who=>r.onboard('worker',who)],
  ['pinSet',who=>r.pinSet({} as Parameters<typeof r.pinSet>[0],who)],
  ['openSession',who=>r.openSession('worker','old',who)],
  ['setProgramBinary',who=>r.setProgramBinary('codex','/missing',who)],
  ['settings',who=>r.settingsPatch('owner',{profileName:'Someone'},who)],
 ];
 for(const [name,run] of paths)await assert.rejects(Promise.resolve().then(()=>run(AUTOPILOT_OWNER)),error=>(error as {code?:string}).code==='policy_denied',name);
 const before=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(before,true,'reply')})).body.autopilot;
 const entered=deferred(),release=deferred(),app=r.withAutopilotGeneration(enabled.generation,async()=>{entered.resolve();await release.promise});
 try{await entered.promise;for(const [name,run] of paths)await assert.rejects(Promise.resolve().then(()=>run(OWNER)),error=>(error as {code?:string}).code==='autopilot_busy',name)}
 finally{release.resolve();await app}
 assert.equal((await state(h.api)).autopilot.generation,enabled.generation);
});

test('TS-38.1: a queued role decision rechecks owner authority after the project lock',async t=>{
 const h=await ownerSeatProposal(t),initial=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(initial,true,'reply')})).body.autopilot;
 const locked=deferred(),unlock=deferred(),held=withPathLock(h.dir,async()=>{locked.resolve();await unlock.promise});await locked.promise;
 const busy=(error:unknown)=>(error as {code?:string}).code==='autopilot_busy';
 const create=assert.rejects(h.runtime.createOwnerSeat(h.seat,OWNER),busy),confirm=assert.rejects(h.runtime.confirmTeam(h.seat,OWNER),busy),patch=assert.rejects(h.runtime.settingsPatch('project',{note:'pending'},OWNER),busy);const entered=deferred(),release=deferred();
 const app=h.runtime.withAutopilotGeneration(enabled.generation,async()=>{entered.resolve();await release.promise});
 try{await entered.promise;unlock.resolve();await held;await Promise.all([create,confirm,patch]);assert.equal(h.runtime.registry.ids.length,2)}
 finally{unlock.resolve();release.resolve();await app}
 assert.equal((await call(h.api,'/api/settings')).body.project.note,undefined);
});

test('TS-38.1: accepted role creation and interruption revoke until-reply, rejected interruption does not',async t=>{
 const h=await ownerSeatProposal(t),first=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(first,true,'reply')})).body.autopilot;
 const created=await call(h.api,'/api/seats/owner',{body:h.seat});assert.equal(created.status,200,created.text);assert.equal(created.body.ok,true);
 const afterSeat=await state(h.api);assert.equal(afterSeat.autopilot.on,false);assert.equal(afterSeat.autopilot.generation,enabled.generation+1);
 const second=(await call(h.api,'/api/autopilot',{body:change(afterSeat,true,'reply')})).body.autopilot;
 const rejected=await call(h.api,'/api/interrupt',{body:{pane:'worker'}});assert.equal(rejected.body.ok,false);assert.equal((await state(h.api)).autopilot.generation,second.generation);
 const end=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.setHandle({async interrupt(){},async steer(){}});return end.promise};
 const run=h.runtime.runTurn('worker','работай').catch(error=>{if(error.code!=='cancelled')throw error});t.after(async()=>{end.resolve({text:'готово',sessionId:null});await run});
 await until(()=>!!h.runtime.registry.get('worker')?.handle);
 const accepted=await call(h.api,'/api/interrupt',{body:{pane:'worker'}});assert.equal(accepted.body.ok,true);
 const afterInterrupt=await state(h.api);assert.equal(afterInterrupt.autopilot.on,false);assert.equal(afterInterrupt.autopilot.generation,second.generation+1);
});

test('TS-38.1: an owner settings change revokes reply term, while a confirmed autopilot role does not',async t=>{
 const h=await ownerSeatProposal(t),first=await state(h.api),enabled=(await call(h.api,'/api/autopilot',{body:change(first,true,'reply')})).body.autopilot;
 const role=await h.runtime.withAutopilotGeneration(enabled.generation,()=>h.runtime.createOwnerSeat(h.seat,AUTOPILOT_OWNER));assert.equal(role.ok,true);
 assert.equal((await state(h.api)).autopilot.generation,enabled.generation);
 const changed=await call(h.api,'/api/settings',{body:{scope:'owner',patch:{profileName:'Вернулся'}}});assert.equal(changed.status,200,changed.text);
 const after=await state(h.api);assert.equal(after.autopilot.on,false);assert.equal(after.autopilot.generation,enabled.generation+1);
});
