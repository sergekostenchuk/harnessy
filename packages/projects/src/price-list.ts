import {ProjectError} from './errors.ts';
import {object} from './files.ts';

export interface ModelPrice {vendor:string;model:string;inputPerM:number;outputPerM:number;cacheReadPerM:number;currency:string}
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
