import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {RuntimeEvent} from '@harnessy/runtime';
import {fixture,sse,call,until,OWNER} from './test-helpers.ts';

test('3/19/22/71: all replays pending cards, includes new seats, emits UTF8 and 15s keepalive; single events omit pane',async t=>{
 const h=await fixture(t),p=h.runtime.registry.get('worker')!;void p.askApproval('доступ','файл');
 const all=await sse(h.api),single=await sse(h.api,'worker');t.after(()=>{all.close();single.close()});
 await until(()=>all.frames.some(x=>x.type==='approval')&&single.frames.some(x=>x.type==='approval'));
 assert.equal(all.frames[0].pane,'worker');assert.equal('pane' in single.frames[0],false);assert.match(all.raw,/: ok/);assert.match(all.raw,/доступ/);
 h.clock.advance(15_000);await until(()=>all.raw.includes(': ka')&&single.raw.includes(': ka'));
 await call(h.api,'/api/room',{body:{model:'w1'}});const seat=await call(h.api,'/api/assign',{body:{role:'orchestrator'}});assert.equal(seat.status,200);const id=seat.body.pane.id;
 h.runtime.registry.get(id)!.publish({type:'delta',text:'новое место'});await until(()=>all.frames.some(x=>x.pane===id&&x.text==='новое место'));assert.equal(single.frames.some(x=>x.pane===id),false)
});

test('8: project switch closes old SSE subscriptions and client disconnection releases queue',async t=>{
 const h=await fixture(t),old=h.runtime.project,stream=await sse(h.api);await until(()=>old.bus.subscribers===1);stream.close();await until(()=>old.bus.subscribers===0&&h.api.streams===0);
 const next=await sse(h.api),dir=join(h.dir,'next');mkdirSync(dir);const closed=new Promise<void>(resolve=>next.response.once('close',resolve));
 assert.equal((await call(h.api,'/api/project',{body:{path:dir}})).status,200);await closed;assert.equal(old.bus.subscribers,0);assert.equal(h.api.streams,0);
 const fresh=await sse(h.api);t.after(()=>fresh.close());h.runtime.owner.publish({type:'note',text:'новый проект'});await until(()=>fresh.frames.some(x=>x.text==='новый проект'))
});

test('8/71: slow reader overflow destroys the complete socket even while waiting for drain',async t=>{
 const h=await fixture(t),p=h.runtime.project,stream=await sse(h.api);stream.response.pause();
 const closed=new Promise<void>(resolve=>stream.response.once('close',resolve));
 for(let i=0;i<4003;i++)p.bus.publish('worker',{type:'delta',text:'x'.repeat(32768)});
 await until(()=>p.bus.subscribers===0&&h.api.streams===0);stream.response.resume();await closed;assert.equal(stream.response.complete,false)
});

test('18/71: server shutdown closes SSE before waiting for cancelled turns and providers',async t=>{
 const h=await fixture(t),stream=await sse(h.api);const closed=new Promise<void>(resolve=>stream.response.once('close',resolve));await h.api.close();await closed;assert.equal(h.api.streams,0);assert.equal(h.provider.closes,1);assert.equal(h.codex.closes,1);await h.api.close()
});


test('8/71: repeated idle keepalives still deliver next record once and disconnection closes the waiting subscription',async t=>{
 const h=await fixture(t),stream=await sse(h.api);t.after(()=>stream.close());await until(()=>stream.raw.includes(': ok'));
 for(let i=1;i<=30;i++){h.clock.advance(15_000);await until(()=>stream.raw.split(': ka').length===i+1)}
 h.runtime.registry.get('worker')!.publish({type:'delta',text:'после простоя'});await until(()=>stream.frames.some(e=>e.text==='после простоя'));assert.equal(stream.frames.filter(e=>e.text==='после простоя').length,1);
 stream.close();await until(()=>h.runtime.project.bus.subscribers===0&&h.api.streams===0)
});

for(const id of ['all','worker'])test('75/76: malformed events keep '+id+' SSE and other subscribers alive through the next event and keepalive',async t=>{
 const h=await fixture(t),stream=await sse(h.api,id),other=await sse(h.api);t.after(()=>{stream.close();other.close()});
 await until(()=>stream.raw.includes(': ok')&&other.raw.includes(': ok'));
 const cycle:Record<string,unknown>={};cycle.self=cycle;
 const cases:{type:string;event:RuntimeEvent}[]=[
  {type:'error',event:{type:'error',code:undefined,message:'без кода'}},
  {type:'note',event:{type:'note',payload:cycle}},
  {type:'note',event:{type:'note',payload:1n}},
  {type:'note',event:{type:'note',payload:{value:undefined}}},
  {type:'note',event:{type:'note',pane:'поддельное место',get text():string{throw Error('bad getter')}}},
  {type:'unknown',event:{get type():string{throw Error('bad type')}}},
  {type:'note',event:new Proxy({type:'note'},{ownKeys(){throw Error('bad keys')}})}
 ];
 for(let i=0;i<cases.length;i++){
  const bad=cases[i]!;h.runtime.registry.get('worker')!.publish(bad.event);
  await until(()=>stream.frames.length===i*2+1&&other.frames.length===i*2+1);
  assert.deepEqual(stream.frames.at(-1),{type:'error',code:'unserializable',message:'событие не представимо: '+bad.type,...(id==='all'?{pane:'worker'}:{})});
  assert.deepEqual(other.frames.at(-1),{type:'error',code:'unserializable',message:'событие не представимо: '+bad.type,pane:'worker'});
  h.runtime.registry.get('worker')!.publish({type:'note',text:'исправное '+i});
  await until(()=>stream.frames.length===(i+1)*2&&other.frames.length===(i+1)*2);
  assert.equal(stream.frames.at(-1).text,'исправное '+i);assert.equal(other.frames.at(-1).text,'исправное '+i);
  h.clock.advance(15_000);await until(()=>stream.raw.split(': ka').length===i+2&&other.raw.split(': ka').length===i+2);
  assert.equal(stream.response.destroyed,false);assert.equal(other.response.destroyed,false);assert.equal(h.runtime.project.bus.subscribers,2)
 }
});

for(const id of ['all','worker'])test('75/76: a saved malformed recovery error does not close '+id+' SSE on connection',async t=>{
 const h=await fixture(t);h.runtime.registry.get('worker')!.recoveryError={type:'error',message:'сохранённый сбой',code:undefined};
 const stream=await sse(h.api,id);t.after(()=>stream.close());await until(()=>stream.frames.length===1);
 assert.deepEqual(stream.frames[0],{type:'error',code:'unserializable',message:'событие не представимо: error',...(id==='all'?{pane:'worker'}:{})});
 h.runtime.registry.get('worker')!.publish({type:'note',text:'после снимка'});await until(()=>stream.frames.length===2);assert.equal(stream.frames[1].text,'после снимка');
 h.clock.advance(15_000);await until(()=>stream.raw.includes(': ka'));assert.equal(stream.response.destroyed,false);assert.equal(h.runtime.project.bus.subscribers,1)
});
