import test from 'node:test';
import assert from 'node:assert/strict';
import {COPILOT_LIMIT_REASONS} from './limits-reason.ts';
import {copilotLimits} from './copilot-limits.ts';
const read=(quotaSnapshots:unknown)=>copilotLimits.parse({stdout:JSON.stringify({quotaSnapshots}),stderr:'',code:0,signal:null});
test('261: Copilot quota is a measured monthly UTC window, not session usage or a guessed plan',()=>{
 const v=read({premium_interactions:{entitlementRequests:300,remainingPercentage:75,resetDate:'2028-03-01T00:00:00Z'}});assert.equal(v.ok,true);if(v.ok){assert.equal(v.plan,null);assert.deepEqual(v.windows,[{label:'month',percentUsed:25,resetsAt:Date.parse('2028-03-01T00:00:00Z')/1000,windowMinutes:29*1440}])}
});
test('261: missing or malformed quotas never become zero usage',()=>{
 for(const snapshot of [{},{premium_interactions:{entitlementRequests:300,remainingPercentage:50}},{premium_interactions:{entitlementRequests:300,remainingPercentage:50,resetDate:'2026-11-15T00:00:00Z'}}])assert.equal(read(snapshot).ok,false);
 for(const snapshot of [null,{x:{entitlementRequests:300,remainingPercentage:101}},{x:{entitlementRequests:'300',remainingPercentage:10}}])assert.throws(()=>read(snapshot),{code:'protocol'});
});

test('299: observed Copilot 1.0.12 quota shape has a non-calendar reset; no monthly window is invented',()=>{
 const row={entitlementRequests:100,usedRequests:0,remainingPercentage:100,overage:0,overageAllowedWithExhaustedQuota:false,resetDate:'2026-10-11T23:00:14.764-07:00'};
 assert.deepEqual(read({chat:row,completions:row,premium_interactions:{...row,entitlementRequests:0}}),{ok:false,code:'limits_invalid',reason:COPILOT_LIMIT_REASONS.window});
 assert.deepEqual(read({premium_interactions:{entitlementRequests:300,remainingPercentage:50}}),{ok:false,code:'limits_unavailable',reason:COPILOT_LIMIT_REASONS.resetMissing});
 assert.deepEqual(read({}),{ok:false,code:'limits_unavailable',reason:COPILOT_LIMIT_REASONS.empty});
});
