import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import type {ProviderLimits} from '@harnessy/providers';
import {LimitsStore} from './limits.ts';
import {harness,FakeProvider,FakeClock,deferred,until,collect,OWNER} from './test-helpers.ts';
const live=(now:number,percent=18):ProviderLimits=>({ok:true,plan:null,fetchedAt:now/1000,source:'fixture',windows:[{label:'5 ч',percentUsed:percent,resetsAt:now/1000+60,windowMinutes:300}]});
test('144/200: quotas persist only measurements, throttle reads for 60 seconds, refresh after a turn and emit an event',async t=>{
 const clock=new FakeClock();let reads=0;const provider=Object.assign(new FakeProvider(),{limits:async()=>{reads++;return {...live(clock.now()),token:'fixture-secret'}}});
 const h=await harness(t,{deps:{providers:{claude:provider},clock}}),events=collect(h.runtime);t.after(()=>events.sub.close());
 let result=await h.runtime.limits();assert.equal(reads,1);assert.equal(result.providers[0]!.windows[0]!.percentUsed,18);assert.equal(result.providers[0]!.windows[0]!.resetsIn,60);
 const path=join(h.dir,'.harness/state/limits.json');assert.doesNotMatch(readFileSync(path,'utf8'),/fixture-secret|token|fixture/);await h.runtime.limits();assert.equal(reads,1);
 clock.advance(60000);await until(()=>reads===2);await h.runtime.limits();assert.equal(reads,2);
 await h.runtime.runTurn('worker','hello');await until(()=>reads===3);await h.runtime.limits();assert.ok(events.events.some(e=>e.type==='limits'));
 const store=new LimitsStore(h.dir,clock,{claude:provider},()=>{});assert.equal(store.snapshot().providers[0]!.windows[0]!.percentUsed,18);store.close();
});
test('144/203: unsupported providers and failed refresh retain typed reasons and a dated stale snapshot',async t=>{
 const h=await harness(t);const unavailable=await h.runtime.limits();assert.equal(unavailable.providers[0]!.code,'limits_unsupported');assert.deepEqual(unavailable.providers[0]!.windows,[]);
 const provider=Object.assign(new FakeProvider(),{limits:async():Promise<ProviderLimits>=>live(h.clock.now())});const store=new LimitsStore(h.dir,h.clock,{claude:provider},()=>{});t.after(()=>store.close());await store.refresh();h.clock.advance(901000);assert.equal(store.snapshot().providers[0]!.stale,true);
 provider.limits=async()=>({ok:false,code:'limits_rate_limited',reason:'fixture-secret'});await store.refresh();const stale=store.snapshot().providers[0]!;assert.equal(stale.windows[0]!.percentUsed,18);assert.equal(stale.code,'limits_rate_limited');assert.equal(stale.stale,true);assert.doesNotMatch(JSON.stringify(stale),/fixture-secret/);
});
test('200: closing or switching a project cancels quota reads; late responses cannot write or publish into either project',async t=>{
 const gate=deferred<ProviderLimits>(),provider=Object.assign(new FakeProvider(),{limits:async()=>gate.promise});const h=await harness(t,{deps:{providers:{claude:provider}}}),events=collect(h.runtime);const pending=h.runtime.limits();const changed=assert.rejects(pending,e=>!!e&&typeof e==='object'&&'code'in e&&e.code==='project_changed');
 const next=join(h.dir,'next');mkdirSync(next);await h.runtime.projectSet(next,{},OWNER);await changed;gate.resolve(live(h.clock.now()));await Promise.resolve();assert.equal(existsSync(join(h.dir,'.harness/state/limits.json')),false);assert.equal(existsSync(join(next,'.harness/state/limits.json')),false);assert.ok(!events.events.some(e=>e.type==='limits'));
});
test('200: timeout bounds a stalled provider and leaves a usable typed response',async t=>{
 const provider=Object.assign(new FakeProvider(),{limits:async()=>new Promise<ProviderLimits>(()=>{})}),h=await harness(t,{deps:{providers:{claude:provider}}});const pending=h.runtime.limits();h.clock.advance(10000);const result=await pending;assert.equal(result.providers[0]!.code,'limits_timeout');assert.deepEqual(result.providers[0]!.windows,[]);
});
test('200: missing fields, foreign cache and symlinks never masquerade as current live quota',async t=>{
 const h=await harness(t),path=join(h.dir,'.harness/state/limits.json');for(const payload of [{version:1,project:'/foreign',providers:[]},{version:1,project:h.dir,providers:[{vendor:'claude',fetchedAt:h.clock.now()/1000,windows:[{label:'5 ч',percentUsed:99}]}]}]){writeFileSync(path,JSON.stringify(payload));const store=new LimitsStore(h.dir,h.clock,{claude:h.provider},()=>{});assert.equal(store.snapshot().providers[0]!.code,'limits_invalid');assert.deepEqual(store.snapshot().providers[0]!.windows,[]);store.close()}
 const outside=join(h.dir,'outside.json');writeFileSync(outside,'untouched');const linkDir=join(h.dir,'symlink-project');mkdirSync(join(linkDir,'.harness/state'),{recursive:true});symlinkSync(outside,join(linkDir,'.harness/state/limits.json'));const provider=Object.assign(new FakeProvider(),{limits:async()=>live(h.clock.now())}),store=new LimitsStore(linkDir,h.clock,{claude:provider},()=>{});assert.equal(store.snapshot().providers[0]!.code,'limits_invalid');await store.refresh();assert.equal(readFileSync(outside,'utf8'),'untouched');store.close();
});

test('144: final quota contract distinguishes API-key plans and refuses absent measurement fields',async t=>{
 const h=await harness(t),provider=Object.assign(new FakeProvider(),{limits:async():Promise<ProviderLimits>=>live(h.clock.now())}),store=new LimitsStore(h.dir,h.clock,{claude:provider},()=>{});t.after(()=>store.close());await store.refresh();const row=store.snapshot().providers[0]!;assert.equal(row.status,'ok');assert.equal(row.plan,null);assert.equal(row.fetchedAt,h.clock.now()/1000);
 for(const key of ['plan','fetchedAt','windows']){provider.limits=async()=>{const raw:any=live(h.clock.now());delete raw[key];return raw};await store.refresh('claude',true);assert.equal(store.snapshot().providers[0]!.code,'limits_invalid')}
 provider.limits=async()=>({ok:false,code:'limits_not_applicable',reason:'do not pass through'});await store.refresh('claude',true);assert.equal(store.snapshot().providers[0]!.status,'not_applicable');assert.deepEqual(store.snapshot().providers[0]!.windows,[]);assert.equal(store.snapshot().providers[0]!.plan,null);assert.doesNotMatch(JSON.stringify(store.snapshot()),/do not pass through/);
});
