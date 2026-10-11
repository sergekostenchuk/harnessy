import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventBus,Pane} from './index.ts';
import {harness,FakeClock,OWNER} from './test-helpers.ts';

test('14/22/49: approvals replay before live events; timeout and late decision; newly added pane visible to all',async t=>{
 const {runtime:r,clock}=await harness(t),p=r.registry.get('worker')!,approval=p.askApproval('команда','подробности'),id=[...p.approvals.keys()][0]!;
 const sub=r.subscribe({all:true}),events=sub.events[Symbol.asyncIterator]();p.publish({type:'delta',text:'live'});assert.deepEqual((await events.next()).value,{type:'approval',id,title:'команда',detail:'подробности',pane:'worker'});assert.equal((await events.next()).value.type,'delta');
 const newPane=r.registry.add({id:'extra',role:'tester',kind:'tester',vendor:'claude',label:'тестер',model:'w1',mode:'read',digest:false,writePaths:[],instructions:null,worktree:null});newPane.publish({type:'note',text:'новое место'});assert.equal((await events.next()).value.pane,'extra');
 clock.advance(900_000);assert.equal(await approval,false);assert.equal((await events.next()).value.decision,'timeout');assert.deepEqual(r.approve('worker',id,'allow',OWNER),{ok:false,error:'вопрос уже закрыт'});sub.close();assert.equal(sub.closed.aborted,true)
});

test('22/49: capacity 4000 overflow closes whole subscription, discards queue and detaches every source',async()=>{
 const bus=new EventBus(()=>[]),sub=bus.subscribe({all:true}),iter=sub.events[Symbol.asyncIterator]();for(let i=0;i<4000;i++)bus.publish(i%2?'one':'two',{type:'delta',text:String(i)});assert.equal(sub.closed.aborted,false);bus.publish('new',{type:'delta',text:'overflow'});assert.equal(sub.closed.aborted,true);assert.equal(bus.subscribers,0);assert.equal((await iter.next()).done,true);bus.publish('one',{type:'done'});assert.equal((await iter.next()).done,true);
 const waiting=bus.subscribe({owner:true}),next=waiting.events[Symbol.asyncIterator]().next();waiting.close();assert.equal((await next).done,true)
});

test('22/32/49: project switch closes pane, owner, all streams and resolves their pending next',async t=>{
 const {runtime:r}=await harness(t);const subscriptions=[r.subscribe({pane:'worker'}),r.subscribe({owner:true}),r.subscribe({all:true})],waits=subscriptions.map(s=>s.events[Symbol.asyncIterator]().next());
 const other=mkdtempSync(join(tmpdir(),'harnessy-event-switch-'));t.after(()=>rmSync(other,{recursive:true,force:true}));await r.openProject(other);assert.equal(subscriptions.every(s=>s.closed.aborted),true);assert.equal((await Promise.all(waits)).every(v=>v.done),true);assert.deepEqual(r.registry.ids,['room']);assert.equal(r.registry.get('room')!.model,'')
});

test('14: approval deny resolves once and owner trust cannot be forged by agent',async t=>{
 const {runtime:r}=await harness(t),p=r.registry.get('worker')!,allowed=p.askApproval('вопрос','детали'),id=[...p.approvals.keys()][0]!;
 assert.throws(()=>r.approve('worker',id,'allow',{seat:'owner',trust:'agent'}));assert.equal(p.approvals.size,1);assert.deepEqual(r.approve('worker',id,'deny',OWNER),{ok:true,error:null});assert.equal(await allowed,false);assert.deepEqual(r.approve('worker',id,'allow',OWNER),{ok:false,error:'вопрос уже закрыт'})
});

test('49: missing or masquerading subscription selector refuses',()=>{const bus=new EventBus(()=>[]);for(const value of [{},{all:false},{owner:false},{pane:3},{all:true,pane:'x'}])assert.throws(()=>bus.subscribe(value as never));assert.equal(bus.subscribers,0)});

test('76: a throwing getter cannot interrupt all subscribers or detach their queues',async()=>{
 const bus=new EventBus(()=>[]),first=bus.subscribe({all:true}),single=bus.subscribe({pane:'worker'}),second=bus.subscribe({all:true});
 const iterators=[first,single,second].map(sub=>sub.events[Symbol.asyncIterator]());
 const event={type:'note',get text():string{throw Error('bad payload')}};
 assert.doesNotThrow(()=>bus.publish('worker',event));
 const received=await Promise.all(iterators.map(iter=>iter.next()));
 const fallback={type:'error',code:'unserializable',message:'событие не представимо: note',pane:'worker'};
 assert.deepEqual(received[0]!.value,fallback);assert.equal(received[1]!.value,event);assert.deepEqual(received[2]!.value,fallback);
 bus.publish('worker',{type:'note',text:'следующее'});
 for(const iter of iterators)assert.equal((await iter.next()).value.text,'следующее');
 assert.equal(bus.subscribers,3);assert.equal([first,single,second].some(sub=>sub.closed.aborted),false);bus.close()
});
