import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexProvider,codexLimits} from './provider.ts';
import {codexHarness,HOLD} from '../test-support.ts';
const quota={planType:'pro',primary:{usedPercent:94,windowDurationMins:300,resetsAt:1791800000},secondary:{usedPercent:71,windowDurationMins:10080,resetsAt:1791900000}};
test('201: Codex account windows come from rateLimits/read with the codex bucket preferred',async t=>{
 const h=codexHarness(transport=>{const base=transport.responder;transport.responder=(method,params,t)=>method==='account/rateLimits/read'?{rateLimits:{...quota,primary:{...quota.primary,usedPercent:1}},rateLimitsByLimitId:{codex:quota},token:'fixture-secret'}:base(method,params,t)}),p=new CodexProvider(h.deps);t.after(()=>p.close());
 const result=await p.limits();assert.equal(result.ok,true);if(!result.ok)return;assert.equal(result.plan,'Pro');assert.deepEqual(result.windows.map(w=>[w.label,w.percentUsed]),[['5 ч',94],['неделя',71]]);assert.doesNotMatch(JSON.stringify(result),/fixture-secret|token/);assert.ok(h.transports[0]!.requests.some(r=>r.method==='account/rateLimits/read'));assert.ok(!h.transports[0]!.requests.some(r=>r.method==='turn/start'));
});
for(const raw of [{},{rateLimits:{primary:{usedPercent:94}}},{rateLimits:{...quota,primary:{...quota.primary,usedPercent:-1}}},{rateLimits:{...quota,primary:{...quota.primary,resetsAt:'tomorrow'}}}])test('201: malformed quota is a typed refusal '+JSON.stringify(raw),()=>{const r=codexLimits(raw);assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'limits_invalid')});
test('201: unavailable or cancelled account quotas do not expose raw transport errors',async t=>{
 const h=codexHarness(transport=>{const base=transport.responder;transport.responder=(method,params,t)=>{if(method==='account/rateLimits/read')throw Error('fixture-secret');return base(method,params,t)}}),p=new CodexProvider(h.deps);t.after(()=>p.close());const r=await p.limits();assert.equal(r.ok,false);assert.doesNotMatch(JSON.stringify(r),/fixture-secret/);
 h.transports[0]!.responder=()=>HOLD;const abort=new AbortController();abort.abort();const cancelled=await p.limits(abort.signal);assert.equal(cancelled.ok,false);if(!cancelled.ok)assert.equal(cancelled.code,'limits_timeout');
});

test('201: an API-key account has no subscription window; plan can also come from account/read',async t=>{
 const h=codexHarness(transport=>{const base=transport.responder;transport.responder=(method,params,t)=>method==='account/rateLimits/read'?{rateLimits:{...quota,planType:null}}:base(method,params,t)}),p=new CodexProvider(h.deps);t.after(()=>p.close());let result=await p.limits();assert.equal(result.ok,true);if(result.ok)assert.equal(result.plan,'Plus');
 h.transports[0]!.responder=()=>({account:{type:'apiKey'}});const before=h.transports[0]!.requests.filter(r=>r.method==='account/rateLimits/read').length;result=await p.limits();assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_not_applicable');assert.equal(h.transports[0]!.requests.filter(r=>r.method==='account/rateLimits/read').length,before);
});

for(const key of ['primary','secondary'] as const)for(const omitted of ['absent','null'] as const)test('212: Codex keeps '+key+' when its other window is '+omitted,()=>{
 const other=key==='primary'?'secondary':'primary',rateLimits={planType:'pro',[key]:quota[key],...(omitted==='null'?{[other]:null}:{})};const result=codexLimits({rateLimits});assert.equal(result.ok,true);if(!result.ok)return;assert.equal(result.windows.length,1);assert.equal(result.windows[0]!.label,key==='primary'?'5 ч':'неделя');assert.equal(result.windows[0]!.percentUsed,quota[key].usedPercent);
});
for(const rateLimits of [{},{primary:null},{secondary:null},{primary:null,secondary:null}])test('212: no Codex windows is a typed unavailable quota '+JSON.stringify(rateLimits),()=>{const result=codexLimits({rateLimits});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_unsupported')});

for(const balance of [62500,'62500',0])test('215: Codex credits and reset reserve survive a weekly-only primary ('+balance+')',()=>{
 const r=codexLimits({rateLimits:{planType:'pro',primary:{...quota.secondary,usedPercent:21},secondary:null,credits:{hasCredits:true,balance}},rateLimitResetCredits:{availableCount:2,secret:'fixture-secret'}});assert.equal(r.ok,true);if(!r.ok)return;assert.deepEqual(r.windows.map(w=>[w.label,w.percentUsed]),[['неделя',21]]);assert.deepEqual(r.credits,{hasCredits:true,unlimited:false,balance:Number(balance)});assert.equal(r.resetCredits,2);assert.doesNotMatch(JSON.stringify(r),/fixture-secret/);
});
for(const credits of [{hasCredits:true},{hasCredits:true,balance:-1},{hasCredits:true,balance:'secret'},{hasCredits:'yes',balance:62500}])test('215: malformed credit data is a typed refusal '+JSON.stringify(credits),()=>{const r=codexLimits({rateLimits:{...quota,credits}});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'limits_invalid')});
test('215: absent credits are omitted, credits without windows remain usable, and reset counts are validated',()=>{
 const absent=codexLimits({rateLimits:quota});assert.equal(absent.ok,true);if(absent.ok){assert.equal(absent.credits,undefined);assert.equal(absent.resetCredits,undefined)}
 const only=codexLimits({rateLimits:{primary:null,secondary:null,credits:{hasCredits:true,unlimited:true,balance:null},rateLimitResetCredits:{availableCount:0}}});assert.equal(only.ok,true);if(only.ok){assert.equal(only.credits!.unlimited,true);assert.equal(only.resetCredits,0);assert.deepEqual(only.windows,[])}
 for(const availableCount of [-1,1.5,'2',undefined]){const r=codexLimits({rateLimits:quota,rateLimitResetCredits:{availableCount}});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'limits_invalid')}
});
