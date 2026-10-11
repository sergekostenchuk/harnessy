import test from 'node:test';
import assert from 'node:assert/strict';
import type {ProviderLimits} from '@harnessy/providers';
import {FakeProvider,fixture,call} from './test-helpers.ts';
test('144/147: limits GET and HEAD expose only normalized quotas; foreign Host and mutation are refused',async t=>{
 const provider=Object.assign(new FakeProvider(),{limits:async():Promise<ProviderLimits>=>({ok:true,plan:null,fetchedAt:1791500000,source:'fixture-secret',windows:[{label:'неделя',percentUsed:62.4,windowMinutes:10080,resetsAt:1791800000}]})});
 const h=await fixture(t,{deps:{providers:{claude:provider}}});const result=await call(h.api,'/api/limits');assert.equal(result.status,200);assert.equal(result.body.ok,true);assert.equal(result.body.project,h.dir);assert.equal(result.body.providers[0].windows[0].percentUsed,62.4);assert.equal(result.body.providers[0].source,'claude.ai /usage');assert.doesNotMatch(result.text,/fixture-secret|accessToken|refreshToken/);
 const head=await call(h.api,'/api/limits',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.text,'');assert.equal((await call(h.api,'/api/limits',{headers:{Host:'foreign.invalid'}})).status,403);assert.equal((await call(h.api,'/api/limits',{body:{percentUsed:0}})).status,405);assert.equal((await call(h.api,'/api/status')).body.limits.providers[0].windows[0].percentUsed,62.4);
});
test('144/147: a provider without a quota source returns a typed reason and no fabricated measurements',async t=>{
 const h=await fixture(t);const result=await call(h.api,'/api/limits');assert.equal(result.status,200);assert.equal(result.body.updatedAt,null);for(const p of result.body.providers){assert.deepEqual(p.windows,[]);assert.equal(p.code,'limits_unsupported');assert.equal(p.stale,true)}
});
