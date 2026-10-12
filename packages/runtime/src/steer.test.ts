import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,RuntimeError} from './index.ts';
import {harness,OWNER,collect,until,deferred,FakeProvider,completedActions} from './test-helpers.ts';

for(const accepted of [true,false])test('31/43: steer '+accepted+' does not advance past waiting task, including restart',async t=>{
 const h=await harness(t),{runtime:r,provider:f}=h,release=deferred<{text:string;sessionId:string}>();f.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.setHandle({async interrupt(){},async steer(){if(!accepted)throw Error('не принято')}});return release.promise};
 const first=r.postOwner({to:'worker',kind:'task',text:'первое'},OWNER);await until(()=>f.calls.length===1);const second=r.postOwner({to:'worker',kind:'task',text:'ждущее'},OWNER);const {events}=collect(r);
 if(accepted)assert.equal((await r.steer('worker','вмешательство',OWNER)).steered,true);else await assert.rejects(r.steer('worker','вмешательство',OWNER),(e:unknown)=>e instanceof RuntimeError&&e.status===409&&e.message==='вмешательство не доставлено: не принято');
 assert.equal(r.journal.cursors.worker??0,0);assert.deepEqual(r.journal.pendingFor('worker').map(e=>e.record.seq),[first.seq,second.seq]);assert.equal(events.some(e=>e.type==='steered'),accepted);if(!accepted)assert.ok(r.journal.read({limit:0}).some(v=>v.kind==='rejected'&&v.text==='вмешательство не доставлено: не принято'));
 await r.halt(true,OWNER);release.resolve({text:'часть',sessionId:'s1'});await r.idle();assert.equal(r.journal.cursors.worker,first.seq);await r.close();const next=new FakeProvider(),resumed=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>resumed.close());assert.deepEqual(resumed.journal.pendingFor('worker').map(e=>e.record.seq),[second.seq]);assert.equal(next.calls.length,0);await resumed.halt(false,OWNER);await resumed.idle();assert.equal(next.calls.length,1);assert.match(next.calls[0]!.message,/ждущее/);assert.doesNotMatch(next.calls[0]!.message,/вмешательство/)
});

test('31: idle steer is rejected and journaled, never becomes a task',async t=>{
 const {runtime:r,provider:f}=await harness(t);await assert.rejects(r.steer('worker','нет хода',OWNER),(e:unknown)=>e instanceof RuntimeError&&e.code==='steer_failed');await r.idle();assert.equal(f.calls.length,0);assert.equal(r.journal.pendingFor('worker').length,0);assert.equal(r.journal.read({limit:0}).filter(v=>v.origin==='steer').length,2)
});

test('40: owner-ack deliverySeq drives cursor and receipt, not original record seq',async t=>{
 const {writeFileSync}=await import('node:fs'),{join}=await import('node:path');
 const {runtime:r,provider:f}=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',before:dir=>writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: reviewer, to: executor, kinds: [note], trigger: owner-ack}]\nobserve: {}\n')});
 await r.halt(true,OWNER);const old=r.channel.post({to:'worker',kind:'note',text:'старое с подтверждением'},{seat:'peer',trust:'agent'});const newer=r.postOwner({to:'worker',kind:'task',text:'новее'},OWNER);r.channel.confirmAck(old.seq);const entries=r.journal.pendingFor('worker');assert.deepEqual(entries.map(e=>e.record.seq),[newer.seq,old.seq]);const delivery=entries.at(-1)!.deliverySeq;assert.ok(delivery>newer.seq);await r.halt(false,OWNER);await r.idle();assert.equal(f.calls.length,1);assert.equal(r.journal.cursors.worker,delivery);assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.deliverySeq,delivery);assert.equal(r.journal.pendingFor('worker').length,0)
});

test('350 r2: a failed intervention records only the shared sanitized cause in the journal',{timeout:15000},async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred<{text:string;sessionId:string|null}>();t.after(()=>gate.resolve({text:'done',sessionId:null}));
 f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();ctx.setHandle({async interrupt(){},async steer(){throw Error('steer rejected; credential=CredMarker!')}});return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'work'},OWNER);await until(()=>!!r.registry.get('worker')?.handle);
 await assert.rejects(r.steer('worker','clarification',OWNER),(e:Error)=>{assert.match(e.message,/steer rejected/);assert.doesNotMatch(e.message,/CredMarker/);return true});
 const rows=r.journal.read({limit:0});assert.ok(rows.some(v=>v.kind==='rejected'));assert.doesNotMatch(JSON.stringify(rows),/CredMarker/);gate.resolve({text:'done',sessionId:null});await r.idle();
});

for(const sync of [true,false])test('350 r2: '+(sync?'sync':'async')+' interrupt error uses the shared sanitizer before SSE',{timeout:15000},async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred<{text:string;sessionId:string|null}>(),{events}=collect(r);t.after(()=>gate.resolve({text:'done',sessionId:null}));
 f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();ctx.setHandle({interrupt(){const e=Error('interrupt rejected; credential=CredMarker!');if(sync)throw e;return Promise.reject(e)},async steer(){}});return gate.promise};
 r.postOwner({to:'worker',kind:'task',text:'work'},OWNER);await until(()=>!!r.registry.get('worker')?.handle);assert.equal(r.cancelTurn('worker','owner'),true);
 await until(()=>events.some(e=>e.type==='toolError'));assert.match(JSON.stringify(events),/interrupt rejected/);assert.doesNotMatch(JSON.stringify(events),/CredMarker/);gate.resolve({text:'done',sessionId:null});await r.idle();
});
