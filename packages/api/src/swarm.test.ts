import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';

test('166: swarm reads real seats, pending channel records and context without starting models',async t=>{
 const h=await fixture(t),pane=h.runtime.registry.get('worker')!;pane.tokens={input:100,output:20,cacheRead:50};
 const record=h.runtime.journal.append({sender:'owner',to:'worker',kind:'task',text:'actual queue',thread:'current'});
 const result=await call(h.api,'/api/swarm');assert.equal(result.status,200);assert.equal(result.body.project,h.dir);assert.equal(result.body.panes.length,1);const row=result.body.panes[0];
 assert.equal(row.id,'worker');assert.equal(row.model,pane.model);assert.equal(row.busy,false);assert.equal(row.pending,1);assert.equal(row.queue[0].seq,record.seq);assert.equal(row.queue[0].text,'actual queue');assert.equal(row.turn,null);assert.equal(row.context.used,170);assert.equal(row.context.measured,true);assert.equal(result.body.team.path,join(h.dir,'.harness/team.yaml'));assert.equal(result.body.journal.total,1);assert.equal(h.provider.calls.length,0);
 const other=join(h.dir,'other');mkdirSync(other);await h.runtime.projectSet(other,{},OWNER);const next=(await call(h.api,'/api/swarm')).body;assert.equal(next.project,other);assert.deepEqual(next.panes,[]);assert.deepEqual(next.journal.records,[]);
});

test('166: current turn and pending approval are a snapshot, and disappear on completion',async t=>{
 const h=await fixture(t),entered=deferred(),release=deferred();t.after(()=>release.resolve());h.provider.onRun=async()=>{entered.resolve();await release.promise;return {text:'done',sessionId:'fixture'}};
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'current goal',direct:true}})).status,200);await entered.promise;
 const pane=h.runtime.registry.get('worker')!,approval=pane.askApproval('actual approval','fixture');const row=(await call(h.api,'/api/swarm')).body.panes[0];
 assert.equal(row.busy,true);assert.equal(row.pending,0);assert.deepEqual(row.queue,[]);assert.equal(row.pendingApprovals,1);assert.ok(row.turn.id);assert.equal(typeof row.turn.startedAt,'number');assert.match(row.turn.message,/current goal/);assert.ok(row.turn.records.some((r:{text:string})=>r.text==='current goal'));
 pane.resolveApproval([...pane.approvals.keys()][0]!,false);await approval;release.resolve();await until(()=>!pane.busy);const done=(await call(h.api,'/api/swarm')).body.panes[0];assert.equal(done.turn,null);assert.equal(done.pendingApprovals,0);assert.equal(h.provider.calls.length,1);
});

test('166: queued records are separate from the active turn records',async t=>{
 const h=await fixture(t),gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async()=>gate.promise;t.after(()=>gate.resolve({text:'done',sessionId:null}));await call(h.api,'/api/chat',{body:{pane:'worker',message:'in flight',direct:true}});await until(()=>h.provider.calls.length===1);const queued=h.runtime.journal.append({sender:'owner',to:'worker',kind:'task',text:'next'});const row=(await call(h.api,'/api/swarm')).body.panes[0];assert.equal(row.pending,1);assert.deepEqual(row.queue.map((r:any)=>r.seq),[queued.seq]);assert.equal(row.turn.records.some((r:any)=>r.seq===queued.seq),false);gate.resolve({text:'done',sessionId:null});
});
