import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProviderCatalog,type CatalogEntry,type ProviderLimits} from '@harnessy/providers';
import {ProviderLimitsStore} from './provider-limits.ts';
import {FakeClock,deferred,until,harness,collect} from './test-helpers.ts';
const live=(clock:FakeClock):ProviderLimits=>({ok:true,plan:null,source:'not copied',fetchedAt:clock.now()/1000,windows:[{label:'month',percentUsed:25,resetsAt:clock.now()/1000+86400,windowMinutes:44640}]});
function setup(t:any){const dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-cli-limits-'))),clock=new FakeClock();let identity='a@github.com',reads=0,result:()=>Promise<ProviderLimits>=async()=>live(clock),events=0;
 const entry:CatalogEntry={id:'copilot',title:'GitHub Copilot',binary:'fake',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,resume:true,mcp:true,limits:true},version:async()=>'',auth:async()=>({loggedIn:true,email:identity}),models:async()=>[],runTurn:async()=>{throw Error('no model allowed')},limits:async()=>{reads++;return result()}};
 const catalog=new ProviderCatalog([entry]),stores:ProviderLimitsStore[]=[];const create=()=>{const s=new ProviderLimitsStore(catalog,clock,()=>events++,dir);stores.push(s);return s};
 t.after(()=>{stores.forEach(s=>s.close());rmSync(dir,{recursive:true,force:true})});return {dir,clock,catalog,entry,create,get reads(){return reads},get events(){return events},identity:(s:string)=>{identity=s},result:(fn:()=>Promise<ProviderLimits>)=>{result=fn},disk:()=>JSON.parse(readFileSync(join(dir,'copilot.json'),'utf8'))};
}
test('283: two engines share one account-bound monthly measurement and five-minute TTL',async t=>{
 const h=setup(t),gate=deferred<ProviderLimits>();h.result(()=>gate.promise);const a=h.create(),b=h.create(),first=a.refresh(),second=b.refresh();await until(()=>h.reads===1);gate.resolve(live(h.clock));await Promise.all([first,second]);
 for(const s of [a,b]){const row=s.snapshot().providers[0]!;assert.equal(row.vendor,'copilot');assert.equal(row.windows[0]!.label,'month');assert.equal(row.windows[0]!.percentUsed,25);assert.equal(row.checkedAt,h.clock.now());assert.equal(row.account,'a@github.com')}
 assert.equal(h.reads,1);h.clock.advance(299999);await h.create().refresh();assert.equal(h.reads,1);h.clock.advance(1);await b.refresh();assert.equal(h.reads,2);assert.doesNotMatch(readFileSync(join(h.dir,'copilot.json'),'utf8'),/not copied|token|secret/);
 h.identity('b@github.com');await a.refresh();assert.equal(h.reads,3);assert.equal(a.snapshot().providers[0]!.account,'b@github.com');assert.ok(h.events>0);
});
test('283: account change during quota read rejects the measurement without invented zero',async t=>{
 const h=setup(t),gate=deferred<ProviderLimits>(),s=h.create();h.result(()=>gate.promise);const job=s.refresh();await until(()=>h.reads===1);h.identity('b@github.com');gate.resolve(live(h.clock));await job;
 assert.deepEqual(s.snapshot().providers,[]);assert.equal(s.snapshot().errors[0]!.code,'login_changed');assert.equal(h.disk().value,null);await s.refresh();assert.equal(s.snapshot().providers[0]!.account,'b@github.com');assert.equal(h.reads,2);
});
test('283: unavailable/throwing quota persists bounded backoff, Retry-After and recovery across engines',async t=>{
 const h=setup(t),s=h.create();h.result(async()=>({ok:false,code:'limits_rate_limited',reason:'private response',retryAfterSeconds:720}));await s.refresh();assert.equal(h.disk().nextAttemptAt,h.clock.now()+720000);assert.equal(h.disk().backoff,300000);
 assert.deepEqual(s.snapshot().providers,[]);assert.equal(s.snapshot().errors[0]!.code,'limits_unavailable');assert.doesNotMatch(JSON.stringify(s.snapshot()),/private response/);
 h.clock.advance(719999);await h.create().refresh();assert.equal(h.reads,1);h.clock.advance(1);h.result(async()=>{throw Error('private transport')});await s.refresh();assert.equal(h.disk().backoff,600000);assert.equal(h.disk().pending,null);
 for(const delay of [600000,1200000,1800000]){h.clock.advance(delay);await s.refresh();assert.equal(h.disk().backoff,Math.min(delay*2,1800000))}
 h.clock.advance(1800000);h.result(async()=>live(h.clock));await s.refresh();assert.equal(h.disk().backoff,0);assert.equal(s.snapshot().providers[0]!.windows[0]!.percentUsed,25);
});
test('283: timeout ends a pending attempt; close prevents late publication and cache completion',async t=>{
 const h=setup(t),gate=deferred<ProviderLimits>(),s=h.create();h.result(()=>gate.promise);const job=s.refresh();await until(()=>h.reads===1);h.clock.advance(15000);await job;assert.equal(h.disk().pending,null);assert.equal(s.snapshot().errors[0]!.code,'limits_unavailable');
 h.clock.advance(300000);const next=s.refresh();await until(()=>h.reads===2);const before=readFileSync(join(h.dir,'copilot.json'),'utf8'),events=h.events;s.close();await next;gate.resolve(live(h.clock));await Promise.resolve();assert.equal(h.events,events);assert.equal(readFileSync(join(h.dir,'copilot.json'),'utf8'),before);
});
test('283: corrupt bytes, missing measurement fields and symlinks cannot masquerade as a quota',async t=>{
 const h=setup(t),s=h.create(),file=join(h.dir,'copilot.json');const corrupt=Buffer.from([0xff,123]);writeFileSync(file,corrupt);await s.refresh();assert.deepEqual(readFileSync(file),corrupt);assert.equal(h.reads,0);assert.equal(s.snapshot().errors[0]!.code,'limits_unavailable');unlinkSync(file);
 const outside=join(h.dir,'untouched');writeFileSync(outside,'untouched');symlinkSync(outside,file);await s.refresh();assert.equal(readFileSync(outside,'utf8'),'untouched');assert.equal(h.reads,0);unlinkSync(file);
 h.result(async()=>({ok:true,plan:null,windows:[{label:'month'}],fetchedAt:h.clock.now()/1000}) as any);await s.refresh();assert.deepEqual(s.snapshot().providers,[]);assert.equal(h.disk().value,null);
});
test('283: CLI measurement survives base-provider SSE; closing the project invalidates outstanding reads',async t=>{
 const h=setup(t),runtime=await harness(t,{deps:{providerCatalog:h.catalog,clock:h.clock,limitsCacheDir:h.dir}}),events=collect(runtime.runtime);t.after(()=>events.sub.close());const first=await runtime.runtime.limits();assert.equal(first.providers.find(p=>p.vendor==='copilot')!.windows[0]!.percentUsed,25);
 await until(()=>events.events.some(e=>e.type==='limits'));for(const e of events.events.filter(e=>e.type==='limits'))if((e as any).providers.some((p:any)=>p.vendor==='copilot'))assert.equal((e as any).providers.find((p:any)=>p.vendor==='copilot').windows[0].percentUsed,25);
 const gate=deferred<ProviderLimits>();h.result(()=>gate.promise);h.clock.advance(300000);const job=runtime.runtime.limits(),rejected=assert.rejects(job,{code:'project_changed'});await until(()=>h.reads===2);await runtime.runtime.close();await rejected;gate.resolve(live(h.clock));
});

test('283: absent capability is excluded; absent account never calls quota or invents a row',async t=>{
 const h=setup(t),noLimits=new ProviderCatalog([{...h.entry,capabilities:{...h.entry.capabilities,limits:false}}]);
 const s=new ProviderLimitsStore(noLimits,h.clock,()=>{},h.dir);t.after(()=>s.close());await s.refresh();assert.deepEqual(s.snapshot().providers,[]);assert.equal(h.reads,0);
 h.identity('');const enabled=h.create();await enabled.refresh();assert.deepEqual(enabled.snapshot().providers,[]);assert.equal(enabled.snapshot().errors[0]!.code,'limits_unavailable');assert.equal(h.reads,0);
});
