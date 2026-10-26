import {contextWindow} from '@harnessy/context';
import {priceUsage,type ModelPrice} from '@harnessy/projects';
import type {Usage,Mode} from '@harnessy/providers';
import type {TranscriptMessage} from './state.ts';

export interface TurnUsage extends Usage {
 turnId:string;model:string|null;vendor:string;mode:Mode;durationMs:number|null;toolCalls:number|null;stopped:boolean;
 contextAfter:{used:number;window:number|null}|null;cost:number|null;currency:string|null;
}
const measured=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export function turnUsage(input:{turnId:string;model:string|null;vendor:string;mode:Mode;usage?:unknown;usageIncomplete?:boolean;durationMs:unknown;toolCalls:number|null;stopped:boolean},prices:ModelPrice[]):TurnUsage {
 const raw=input.usage&&typeof input.usage==='object'?input.usage as Record<string,unknown>:{},usage={input:measured(raw.input),output:measured(raw.output),cacheRead:measured(raw.cacheRead)};
 const total=Object.values(usage).every(value=>value!==null)?usage.input!+usage.output!+usage.cacheRead!:null;
 const price=priceUsage({...input,usage},prices.find(p=>p.vendor===input.vendor&&p.model===input.model));
 return {turnId:input.turnId,model:input.model,vendor:input.vendor,mode:input.mode,...usage,durationMs:measured(input.durationMs),toolCalls:input.toolCalls,stopped:input.stopped,contextAfter:total!==null&&Number.isFinite(total)&&!input.usageIncomplete?{used:total,window:input.model?contextWindow(input.model):null}:null,cost:price.cost,currency:price.currency};
}
// Spend uses the current owner price list; keep the card on the same pricing basis.
export function currentTurnPrice(message:TranscriptMessage,prices:ModelPrice[]):TranscriptMessage {
 const u=message.usage;if(message.origin==='transferred'||!u||typeof u!=='object'||!('turnId' in u)||typeof u.turnId!=='string')return message;
 const usage=u as TurnUsage,price=priceUsage({vendor:usage.vendor,model:usage.model,usage:{input:measured(usage.input),output:measured(usage.output),cacheRead:measured(usage.cacheRead)},usageIncomplete:message.usageIncomplete===true},prices.find(p=>p.vendor===usage.vendor&&p.model===usage.model));
 return {...message,usage:{...usage,cost:price.cost,currency:price.currency}};
}
