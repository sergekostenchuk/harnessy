import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {createActions,createRuntime,type Runtime} from './index.ts';
import {ACK_TIMEOUT_MS} from './owner-acks.ts';
import {JournalError} from '@harnessy/journal';
import {harness,OWNER,until,collect,FakeProvider} from './test-helpers.ts';
const seats='  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}';
const setup=(t:Parameters<typeof harness>[0],deps:NonNullable<Parameters<typeof harness>[1]>['deps']={})=>harness(t,{seats,actions:createActions(),deps,before:dir=>fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: executor, to: reviewer, kinds: [note], trigger: owner-ack}]\nobserve: {}\n')});
const pending=(r:Runtime,text='текст')=>r.channel.post({to:'peer',kind:'note',text},{seat:'worker',trust:'agent'});
const fail=(e:unknown)=>e instanceof JournalError&&e.code==='write_failed';

test('8/35/59: one replayed card, exact title/detail, allow is durable before approvalResolved, deliverySeq is ack',async t=>{
 const h=await setup(t),{runtime:r}=h;await r.halt(true,OWNER);const rec=pending(r,'🦊'.repeat(601));await until(()=>r.registry.get('worker')!.approvals.size===1);
 const card=r.registry.get('worker')!.approvals.get('ack:'+rec.seq)!;assert.equal(card.title,'Подтвердить отправку #1 note → ревьюер?');assert.equal([...card.detail].length,600);
 const sub=r.subscribe({all:true}),event=await sub.events[Symbol.asyncIterator]().next();assert.deepEqual(event.value,{type:'approval',id:card.id,title:card.title,detail:card.detail,pane:'worker'});sub.close();
 await r.actions.restorePendingAcks({runtime:r,project:r.project});assert.equal(r.registry.get('worker')!.approvals.size,1);
 let durableAtClose=false;
 r.channel.on(e=>{if(e.type==='delivered'&&e.record.seq===rec.seq)durableAtClose=r.journal.repliesTo(rec.seq).some(a=>a.kind==='ack')});
 assert.deepEqual(r.approve('worker',card.id,'allow',OWNER),{ok:true,error:null});assert.equal(durableAtClose,true);const ack=r.journal.repliesTo(rec.seq).find(a=>a.kind==='ack')!;
 assert.equal(r.journal.pendingFor('peer')[0]!.deliverySeq,ack.seq);assert.equal(r.channel.pendingAcks().length,0);assert.deepEqual(r.approve('worker',card.id,'allow',OWNER),{ok:false,error:'вопрос уже закрыт'});assert.equal(r.channel.confirmAck(rec.seq).seq,ack.seq);assert.equal(r.journal.repliesTo(rec.seq).filter(a=>a.kind==='ack').length,1);
});

test('35/59: restart keeps remaining 86400s; closing project records no deny; expired unanswered card rejects once',async t=>{
 const h=await setup(t),{runtime:r,clock}=h;await r.halt(true,OWNER);const rec=pending(r);await until(()=>r.registry.get('worker')!.approvals.size===1);clock.advance(4000);const old=r.registry.get('worker')!.approvals.get('ack:'+rec.seq)!;await r.close();
 assert.equal(h.provider.calls.length,0);const next=await createRuntime({...h.deps,providers:{claude:new FakeProvider()}},createActions());t.after(()=>next.close());const p=next.project;
 assert.equal(p.journal.repliesTo(rec.seq).length,0);assert.equal(old.finish('allow'),false);assert.equal(next.registry.get('worker')!.approvals.size,1);
 clock.advance(ACK_TIMEOUT_MS-4001);assert.equal(p.channel.pendingAcks().length,1);clock.advance(1);assert.equal(p.channel.pendingAcks().length,0);assert.equal(p.journal.repliesTo(rec.seq).filter(a=>a.kind==='rejected').length,1);assert.equal(p.journal.repliesTo(rec.seq).filter(a=>a.origin==='ack').length,1);
});

test('59: failure before decision leaves card and emits error; retry saves one ack and closes',async t=>{
 let armed=false;const h=await setup(t,{journalOptions:{fs:{appendFileSync(path,data,options){if(armed&&String(data).includes('"kind": "ack"')){armed=false;throw Error('ack write failed')}fs.appendFileSync(path,data,options)}}}}),{runtime:r}=h;
 await r.halt(true,OWNER);const rec=pending(r),{events}=collect(r);await until(()=>r.registry.get('worker')!.approvals.has('ack:'+rec.seq));armed=true;
 assert.throws(()=>r.approve('worker','ack:'+rec.seq,'allow',OWNER),fail);assert.equal(r.registry.get('worker')!.approvals.size,1);assert.equal(r.journal.repliesTo(rec.seq).some(a=>a.kind==='ack'),false);assert.deepEqual(r.approve('worker','ack:'+rec.seq,'allow',OWNER),{ok:true,error:null});await until(()=>events.some(e=>e.type==='approvalResolved'));
 assert.equal(events.filter(e=>e.type==='approvalResolved').length,1);assert.equal(events.find(e=>e.type==='approvalResolved')!.decision,'allow');assert.ok(events.some(e=>e.type==='error'));assert.equal(r.journal.repliesTo(rec.seq).filter(a=>a.kind==='ack').length,1);
});

test('59/152: durable allow + partial effect failure + restart after deadline remains allow, never timeout',async t=>{
 let armed=false;const names=new Map<number,string>();const h=await setup(t,{journalOptions:{fs:{openSync(path,flags,mode){const fd=fs.openSync(path,flags,mode);names.set(fd,String(path));return fd},fsyncSync(fd){if(armed&&names.get(fd)?.endsWith('ack-events.json.tmp')){armed=false;throw Error('ack event fsync failed')}fs.fsyncSync(fd)}}}}),{runtime:r,clock}=h;
 await r.halt(true,OWNER);const rec=pending(r);await until(()=>r.registry.get('worker')!.approvals.size===1);armed=true;assert.throws(()=>r.approve('worker','ack:'+rec.seq,'allow',OWNER),fail);assert.equal(r.registry.get('worker')!.approvals.size,1);assert.equal(r.journal.repliesTo(rec.seq).filter(a=>a.kind==='ack').length,1);
 // Do not invoke a read that flushes the in-memory event marker before the crash.
 await r.close();clock.advance(ACK_TIMEOUT_MS+1);const actions=createActions();let restored:Runtime|undefined,decisions:string[]=[];
 const original=actions.restorePendingAcks;actions.restorePendingAcks=async ctx=>{const sub=ctx.project.bus.subscribe({all:true});void(async()=>{for await(const e of sub.events)if(e.type==='approvalResolved')decisions.push(String(e.decision))})();await original(ctx);restored=ctx.runtime};
 const next=await createRuntime({...h.deps,providers:{claude:new FakeProvider()}},actions);t.after(()=>next.close());assert.equal(restored,next);await until(()=>decisions.length===1);assert.deepEqual(decisions,['allow']);assert.equal(next.channel.pendingAcks().length,0);assert.equal(next.journal.repliesTo(rec.seq).filter(a=>a.kind==='ack').length,1);assert.equal(next.journal.repliesTo(rec.seq).some(a=>a.kind==='rejected'),false);
});

test('59/152: durable reject + missing note + late allow finishes reject and returns ack_closed',async t=>{
 let failNote=false;const h=await setup(t,{journalOptions:{fs:{appendFileSync(path,data,options){if(failNote&&String(data).includes('"origin": "ack"'))throw Error('note failed');fs.appendFileSync(path,data,options)}}}}),{runtime:r}=h;
 await r.halt(true,OWNER);const rec=pending(r),{events}=collect(r);await until(()=>r.registry.get('worker')!.approvals.size===1);failNote=true;assert.throws(()=>r.approve('worker','ack:'+rec.seq,'deny',OWNER),fail);
 await r.close();const next=await createRuntime({...h.deps,providers:{claude:new FakeProvider()}},createActions());t.after(()=>next.close());assert.equal(next.registry.get('worker')!.approvals.size,1);const now=collect(next);failNote=false;
 assert.throws(()=>next.approve('worker','ack:'+rec.seq,'allow',OWNER),(e:unknown)=>!!e&&typeof e==='object'&&'code' in e&&e.code==='ack_closed');await until(()=>now.events.some(e=>e.type==='approvalResolved'));assert.equal(now.events.find(e=>e.type==='approvalResolved')!.decision,'deny');assert.equal(next.channel.pendingAcks().length,0);assert.equal(next.journal.repliesTo(rec.seq).filter(a=>a.kind==='rejected').length,1);assert.equal(next.journal.repliesTo(rec.seq).filter(a=>a.origin==='ack').length,1);assert.equal(next.journal.repliesTo(rec.seq).some(a=>a.kind==='ack'),false);void events;
});

test('59: removed sender card belongs to owner and rejection skips impossible notification',async t=>{
 const h=await setup(t),r=h.runtime;await r.halt(true,OWNER);const rec=pending(r);await until(()=>r.registry.get('worker')!.approvals.size===1);await r.close();fs.writeFileSync(join(h.dir,'.harness','team.yaml'),'seats:\n  peer: {role: reviewer, vendor: claude, model: w1, mode: read}\n');
 const next=await createRuntime(h.deps,createActions());t.after(()=>next.close());assert.equal(next.owner.approvals.size,1);assert.deepEqual(next.approve('owner','ack:'+rec.seq,'deny',OWNER),{ok:true,error:null});assert.equal(next.channel.pendingAcks().length,0);assert.equal(next.journal.repliesTo(rec.seq).some(a=>a.origin==='ack'),false);
});


test('32/59: failed journal denial keeps card but cannot prevent signal/handle cancellation',async t=>{
 let armed=false,interrupted=0;const h=await setup(t,{journalOptions:{fs:{appendFileSync(path,data,options){if(armed&&String(data).includes('"kind": "rejected"')){armed=false;throw Error('deny failed')}fs.appendFileSync(path,data,options)}}}}),r=h.runtime;
 h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();if(s.id==='worker'&&r.project.active.get('worker')!.records.some(r=>r.from==='owner')){c.setHandle({async interrupt(){interrupted++},async steer(){}});pending(r);await new Promise<void>(resolve=>c.signal.addEventListener('abort',()=>resolve(),{once:true}))}return {text:'часть',sessionId:null}};
 r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>r.registry.get('worker')!.approvals.size===1);armed=true;assert.deepEqual(r.interrupt('worker',OWNER),{ok:true});await r.idle();assert.equal(interrupted,1);assert.equal(h.provider.calls[0]!.ctx.signal.aborted,true);assert.equal(r.registry.get('worker')!.approvals.size,1);const card=[...r.registry.get('worker')!.approvals.values()][0]!;assert.deepEqual(r.approve('worker',card.id,'allow',OWNER),{ok:true,error:null});await r.idle();
});

test('59: an externally completed rejection closes an existing card with its saved outcome',async t=>{
 const h=await setup(t),r=h.runtime;await r.halt(true,OWNER);const rec=pending(r),{events}=collect(r);await until(()=>r.registry.get('worker')!.approvals.size===1);r.channel.rejectAck(rec.seq);
 assert.throws(()=>r.approve('worker','ack:'+rec.seq,'allow',OWNER),(e:unknown)=>!!e&&typeof e==='object'&&'code' in e&&e.code==='ack_closed');await until(()=>events.some(e=>e.type==='approvalResolved'));assert.equal(r.registry.get('worker')!.approvals.size,0);assert.equal(events.find(e=>e.type==='approvalResolved')!.decision,'deny');assert.equal(r.journal.repliesTo(rec.seq).filter(a=>a.kind==='rejected').length,1);
});
