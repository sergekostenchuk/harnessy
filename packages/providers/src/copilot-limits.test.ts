import test from 'node:test';
import assert from 'node:assert/strict';
import {COPILOT_LIMIT_REASONS as reason} from './limits-reason.ts';
import {copilotLimits} from './copilot-limits.ts';
const read=(quotaSnapshots:unknown)=>copilotLimits.parse({stdout:JSON.stringify({quotaSnapshots}),stderr:'',code:0,signal:null});
const row={entitlementRequests:300,usedRequests:75,remainingPercentage:75,overage:0,overageAllowedWithExhaustedQuota:false,resetDate:'2026-10-11T23:00:14.764-07:00'};
test('319: observed quota keys produce separate billing-period windows with offset reset and no invented duration',()=>{
 // Replaces 261/299's calendar-boundary rejection: resetDate is Copilot's period.
 const v=read({premium_interactions:row,chat:{...row,usedRequests:30},completions:{...row,usedRequests:60}});assert.equal(v.ok,true);if(!v.ok)return;
 assert.equal(v.plan,null);assert.deepEqual(v.windows,['премиум-запросы','чат','дополнения'].map((label,i)=>({label:'месяц · '+label,percentUsed:[25,10,20][i],resetsAt:Date.parse(row.resetDate)/1000,windowMinutes:null})));
});
test('319: counts win over rounded remaining percent; percentage-only snapshots and calendar resets remain supported',()=>{
 for(const resetDate of ['2028-03-01T00:00:00Z','2028-03-14T08:30:00+03:30']){
  const v=read({premium_interactions:{...row,resetDate,remainingPercentage:99}});assert.equal(v.ok,true);if(v.ok)assert.equal(v.windows[0]!.percentUsed,25);
  const fallback=read({premium_interactions:{entitlementRequests:300,remainingPercentage:75,resetDate}});assert.equal(fallback.ok,true);if(fallback.ok){assert.equal(fallback.windows[0]!.percentUsed,25);assert.equal(fallback.windows[0]!.windowMinutes,null)}
 }
});
test('319: unlimited or zero-entitlement snapshots are excluded without requiring their unused counters or reset',()=>{
 const v=read({chat:{entitlementRequests:0},completions:{entitlementRequests:100,unlimited:true},premium_interactions:row});assert.equal(v.ok,true);if(v.ok)assert.deepEqual(v.windows.map(w=>w.label),['месяц · премиум-запросы']);
 assert.deepEqual(read({chat:{entitlementRequests:0}}),{ok:false,code:'limits_unavailable',reason:reason.empty});
});
test('319: absent or invalid quota fields refuse rather than masquerading as a measured zero',()=>{
 assert.deepEqual(read({}),{ok:false,code:'limits_unavailable',reason:reason.empty});
 assert.deepEqual(read({premium_interactions:{...row,resetDate:undefined}}),{ok:false,code:'limits_unavailable',reason:reason.resetMissing});
 for(const resetDate of ['bad','0','2026-11-15',null,123])assert.deepEqual(read({premium_interactions:{...row,resetDate}}),{ok:false,code:'limits_invalid',reason:reason.resetInvalid});
 for(const patch of [{entitlementRequests:undefined},{entitlementRequests:'300'},{entitlementRequests:-1},{usedRequests:null},{usedRequests:'75'},{usedRequests:-1},{usedRequests:301},{usedRequests:undefined,remainingPercentage:undefined},{remainingPercentage:101},{unlimited:'yes'}])assert.throws(()=>read({premium_interactions:{...row,...patch}}),{code:'protocol'});
 for(const snapshot of [null,{x:null}])assert.throws(()=>read(snapshot),{code:'protocol'});
});
