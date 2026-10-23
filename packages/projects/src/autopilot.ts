import {ProjectError} from './errors.ts';

export const AUTOPILOT_OPERATIONS=['answer_question','answer_blocker','answer_escalation','approve','deny','assign_role','continue_pane','stop_pane'] as const;
export type AutopilotOperation=typeof AUTOPILOT_OPERATIONS[number];
// These cases are mandatory. A window may narrow operations, but cannot remove a stop case.
export const AUTOPILOT_STOP_CASES=['payment','external_publish','data_delete','software_install','external_network','spend_over_cap'] as const;
export type AutopilotConditions={operations:AutopilotOperation[];maxSpendPercent:number;stopCases:typeof AUTOPILOT_STOP_CASES[number][]};
export type AutopilotPermissionSnapshot=Readonly<{generation:number;revision:number;conditions:Readonly<{operations:readonly AutopilotOperation[];maxSpendPercent:number;stopCases:readonly typeof AUTOPILOT_STOP_CASES[number][]}>;stopCodes:readonly typeof AUTOPILOT_STOP_CASES[number][]}>;
export type AutopilotUntil={kind:'morning';at:string}|{kind:'reply';at:null};
export type AutopilotState={on:boolean;until:AutopilotUntil|null;conditions:AutopilotConditions;generation:number;revision:number;startedAt:string|null};
const defaultConditions=():AutopilotConditions=>({operations:['answer_question','answer_blocker','answer_escalation'],maxSpendPercent:5,stopCases:[...AUTOPILOT_STOP_CASES]});
export const defaultAutopilot=():AutopilotState=>({on:false,until:null,conditions:defaultConditions(),generation:0,revision:0,startedAt:null});
const invalid=()=>new ProjectError('autopilot_invalid','Условия Автопилота не подходят; обновите карточку и проверьте выбор',400);
const sameKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join('|')===keys.sort().join('|');
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function autopilotConditions(value:unknown):AutopilotConditions {
 if(!record(value)||!sameKeys(value,['operations','maxSpendPercent'])||!Array.isArray(value.operations)||!value.operations.length||value.operations.some(op=>typeof op!=='string'||!AUTOPILOT_OPERATIONS.includes(op as AutopilotOperation))||new Set(value.operations).size!==value.operations.length||typeof value.maxSpendPercent!=='number'||!Number.isFinite(value.maxSpendPercent)||value.maxSpendPercent<0||value.maxSpendPercent>100)throw invalid();
 return {operations:value.operations as AutopilotOperation[],maxSpendPercent:value.maxSpendPercent,stopCases:[...AUTOPILOT_STOP_CASES]};
}
export function autopilotState(value:unknown):AutopilotState {
 if(value===undefined)return defaultAutopilot();
 if(!record(value)||!sameKeys(value,['on','until','conditions','generation','revision','startedAt'])||typeof value.on!=='boolean'||!Number.isSafeInteger(value.generation)||Number(value.generation)<0||!Number.isSafeInteger(value.revision)||Number(value.revision)<0)throw new ProjectError('autopilot_unreadable','Состояние Автопилота не читается',409);
 try {
  const raw=value.conditions;
  const stops=record(raw)?raw.stopCases:undefined;
  if(!record(raw)||!sameKeys(raw,['operations','maxSpendPercent','stopCases'])||!Array.isArray(stops)||stops.length!==AUTOPILOT_STOP_CASES.length||!AUTOPILOT_STOP_CASES.every(c=>stops.includes(c)))throw invalid();
  const conditions=autopilotConditions({operations:raw.operations,maxSpendPercent:raw.maxSpendPercent});
  const until=value.until;
  if(value.on){if(!record(until)||!sameKeys(until,['kind','at'])||!(until.kind==='reply'&&until.at===null||until.kind==='morning'&&typeof until.at==='string'&&Number.isFinite(Date.parse(until.at)))||typeof value.startedAt!=='string'||!Number.isFinite(Date.parse(value.startedAt)))throw invalid()}
  else if(until!==null||value.startedAt!==null)throw invalid();
  return {on:value.on,until:until as AutopilotUntil|null,conditions,generation:Number(value.generation),revision:Number(value.revision),startedAt:value.startedAt as string|null};
 }catch{throw new ProjectError('autopilot_unreadable','Состояние Автопилота не читается',409)}
}
export function nextMorning(now:number):string {
 const morning=new Date(now);morning.setHours(7,0,0,0);if(morning.getTime()<=now)morning.setDate(morning.getDate()+1);return morning.toISOString();
}
export const autopilotExpired=(state:AutopilotState,now:number)=>state.on&&state.until?.kind==='morning'&&Date.parse(state.until.at)<=now;
export function stopAutopilot(state:AutopilotState):AutopilotState {return {...state,on:false,until:null,startedAt:null,revision:state.revision+1,generation:state.generation+1}}
