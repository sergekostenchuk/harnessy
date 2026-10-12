import {COPILOT_LIMIT_REASONS as reason} from './limits-reason.ts';
import {ProviderError,record,type ProviderLimits,type LimitWindow} from './types.ts';
import type {CliProbe} from './cli/types.ts';
// account.getQuota reports Copilot's billing period, not its start or duration.
const labels:Record<string,string>={premium_interactions:'премиум-запросы',chat:'чат',completions:'дополнения'};
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export const copilotLimits:CliProbe<ProviderLimits>={privateConfig:true,command:{args:['--headless','--stdio','--no-auto-update','--log-level','none'],rpcMethod:'account.getQuota'},parse:r=>{
 const v:unknown=JSON.parse(r.stdout);if(!record(v)||!record(v.quotaSnapshots))throw new ProviderError('protocol',reason.response);
 const windows:LimitWindow[]=[];for(const [key,row] of Object.entries(v.quotaSnapshots)){
  if(!/^[a-z_]{1,60}$/.test(key)||!record(row)||!nonnegative(row.entitlementRequests)||row.unlimited!==undefined&&typeof row.unlimited!=='boolean')throw new ProviderError('protocol',reason.quota);
  if(!row.entitlementRequests||row.unlimited===true)continue;
  if(row.usedRequests!==undefined&&!nonnegative(row.usedRequests)||row.remainingPercentage!==undefined&&(!nonnegative(row.remainingPercentage)||row.remainingPercentage>100))throw new ProviderError('protocol',reason.quota);
  const percentUsed=row.usedRequests!==undefined?100*Number(row.usedRequests)/row.entitlementRequests:typeof row.remainingPercentage==='number'?100-row.remainingPercentage:NaN;
  if(!Number.isFinite(percentUsed)||percentUsed>100)throw new ProviderError('protocol',reason.quota);
  if(row.resetDate===undefined)return {ok:false,code:'limits_unavailable',reason:reason.resetMissing};
  const reset=typeof row.resetDate==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.resetDate)?Date.parse(row.resetDate):NaN;
  if(!Number.isFinite(reset)||reset<=0)return {ok:false,code:'limits_invalid',reason:reason.resetInvalid};
  windows.push({label:'месяц · '+(labels[key]??key),percentUsed,resetsAt:reset/1000,windowMinutes:null});
 }
 if(!windows.length)return {ok:false,code:'limits_unavailable',reason:reason.empty};
 return {ok:true,plan:null,windows,fetchedAt:Date.now()/1000,source:'Copilot CLI account.getQuota'};
}};
