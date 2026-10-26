import {ProjectError} from './errors.ts';
import {object} from './files.ts';

export interface ModelPrice {vendor:string;model:string;inputPerM:number;outputPerM:number;cacheReadPerM:number;currency:string}
export function priceUsage(turn:{vendor:string|null;model:string|null;usage:{input:number|null;output:number|null;cacheRead:number|null};usageIncomplete?:boolean},entry:ModelPrice|undefined){
 const u=turn.usage;
 let costReason=turn.vendor===null?'провайдер не сохранён':turn.model===null?'модель не сохранена':!entry?'нет цены модели':turn.usageIncomplete||Object.values(u).some(v=>v===null)?'измерения токенов неполны':null;
 const cost=costReason===null?(u.input!/1e6*entry!.inputPerM+u.output!/1e6*entry!.outputPerM+u.cacheRead!/1e6*entry!.cacheReadPerM):null;
 if(cost!==null&&!Number.isFinite(cost))costReason='стоимость вне числового диапазона';
 return {cost:costReason===null?cost:null,currency:costReason===null?entry!.currency:null,costReason};
}
export function priceList(value:unknown):ModelPrice[] {
 const invalid=(reason:string):never=>{throw new ProjectError('invalid_settings','priceList: '+reason)};
 if(!Array.isArray(value))return invalid('ожидается список цен');
 const keys=new Set<string>();
 return value.map((row,index)=>{
  if(!object(row))return invalid('строка '+(index+1)+' — ожидается объект');
  for(const key of ['vendor','model','currency'])if(typeof row[key]!=='string'||!row[key].trim()||row[key]!==row[key].trim())return invalid(key+': ожидается непустая строка без пробелов по краям');
  const {vendor,model,currency}=row as unknown as ModelPrice;
  for(const key of ['inputPerM','outputPerM','cacheReadPerM'])if(typeof row[key]!=='number'||!Number.isFinite(row[key])||Number(row[key])<0)return invalid(key+': ожидается конечное число не меньше нуля');
  const key=JSON.stringify([vendor,model]);if(keys.has(key))return invalid('повтор vendor/model: '+vendor+'/'+model);keys.add(key);
  return {vendor,model,inputPerM:row.inputPerM as number,outputPerM:row.outputPerM as number,cacheReadPerM:row.cacheReadPerM as number,currency};
 });
}
