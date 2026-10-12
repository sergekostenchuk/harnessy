import {ProviderError,record,type ProviderLimits} from './types.ts';
import type {CliProbe} from './cli/types.ts';
/** account.getQuota from Copilot's installed API schema; calendar windows are monthly UTC.
 * https://docs.github.com/en/copilot/reference/copilot-billing/license-changes
 */
export const copilotLimits:CliProbe<ProviderLimits>={privateConfig:true,command:{args:['--headless','--stdio','--no-auto-update','--log-level','none'],rpcMethod:'account.getQuota'},parse:r=>{
 const v:unknown=JSON.parse(r.stdout);if(!record(v)||!record(v.quotaSnapshots))throw new ProviderError('protocol','Copilot: неверный ответ квоты');
 const windows=[];for(const [key,row] of Object.entries(v.quotaSnapshots)){
  if(!/^[a-z_]{1,80}$/.test(key)||!record(row)||typeof row.remainingPercentage!=='number'||!Number.isFinite(row.remainingPercentage)||row.remainingPercentage<0||row.remainingPercentage>100||typeof row.entitlementRequests!=='number'||!Number.isFinite(row.entitlementRequests)||row.entitlementRequests<0)throw new ProviderError('protocol','Copilot: неверная квота');
  if(!row.entitlementRequests)continue;
  if(typeof row.resetDate!=='string')return {ok:false,code:'limits_unavailable',reason:'Copilot не передал дату сброса квоты'};
  const reset=Date.parse(row.resetDate),d=new Date(reset);
  if(!Number.isFinite(reset)||d.getUTCDate()!==1||d.getUTCHours()||d.getUTCMinutes()||d.getUTCSeconds()||d.getUTCMilliseconds())return {ok:false,code:'limits_invalid',reason:'Copilot: неизвестное окно квоты'};
  const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1);
  windows.push({label:key==='premium_interactions'?'month':key,percentUsed:100-row.remainingPercentage,resetsAt:reset/1000,windowMinutes:(reset-start)/60000});
 }
 if(!windows.length)return {ok:false,code:'limits_unavailable',reason:'Copilot не передал измеряемые квоты'};
 return {ok:true,plan:null,windows,fetchedAt:Date.now()/1000,source:'Copilot CLI account.getQuota'};
}};
