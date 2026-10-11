import {object} from './files.ts';
import {ProjectError} from './errors.ts';
export interface SubscriptionPrice {vendor:'claude'|'codex';plan:string;amount:number|null;currency:string}
export interface SubscriptionDate {vendor:'claude'|'codex';date:string;plan:string|null;account?:string|null;amount?:number|null;currency?:string;enteredAt?:number}
export const BILLING_KEYS=['subscriptionPrices','subscriptionDates','limitSwitchCheaper','limitWarn80'] as const;
const vendor=(v:unknown):v is SubscriptionPrice['vendor']=>v==='claude'||v==='codex';
const label=(v:unknown):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=60;
function bad(message:string):never {throw new ProjectError('billing_invalid',message)}
export function billingDate(v:unknown):v is string {return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v}
export function subscriptionPrices(raw:unknown):SubscriptionPrice[]{
 if(!Array.isArray(raw)||raw.length>50)bad('Цены подписок: ожидается список до 50 строк');const keys=new Set<string>();
 return raw.map(r=>{if(!object(r)||Object.keys(r).some(k=>!['vendor','plan','amount','currency'].includes(k))||!vendor(r.vendor)||!label(r.plan)||!(r.amount===null||typeof r.amount==='number'&&Number.isFinite(r.amount)&&r.amount>=0&&r.amount<=1e9)||typeof r.currency!=='string'||! /^[A-Z]{3}$/.test(r.currency))bad('Цена подписки: нужны провайдер, тариф, сумма (либо null) и валюта из трёх букв');
  const key=JSON.stringify([r.vendor,r.plan]);if(keys.has(key))bad('Цена тарифа повторяется');keys.add(key);return {vendor:r.vendor,plan:r.plan,amount:r.amount,currency:r.currency} as SubscriptionPrice;});
}
export function subscriptionDates(raw:unknown):SubscriptionDate[]{
 if(!Array.isArray(raw)||raw.length>50)bad('Даты подписок: до 50 учётных записей');const keys=new Set<string>();return raw.map(r=>{
  if(!object(r)||Object.keys(r).some(k=>!['vendor','date','plan','account','amount','currency','enteredAt'].includes(k))||!vendor(r.vendor)||!billingDate(r.date)||!(r.plan===null||label(r.plan)))bad('Дата подписки: провайдер, действительная дата ГГГГ-ММ-ДД и тариф (либо null)');
  if(r.account!==undefined&&r.account!==null&&(typeof r.account!=='string'||r.account.length>320||! /^[^\s@]+@[^\s@]+$/.test(r.account)||r.account!==r.account.trim().toLowerCase()))bad('Учётная запись: ожидается почта из входа');
  if(r.amount!==undefined&&r.amount!==null&&(typeof r.amount!=='number'||!Number.isFinite(r.amount)||r.amount<0||r.amount>1e9))bad('Сумма платежа: число от нуля либо null');
  if(r.currency!==undefined&&(typeof r.currency!=='string'||! /^[A-Z]{3}$/.test(r.currency))||r.amount!=null&&r.currency===undefined)bad('Валюта платежа: три заглавные буквы');
  if(r.enteredAt!==undefined&&(!Number.isSafeInteger(r.enteredAt)||Number(r.enteredAt)<=0))bad('Дата ввода: положительное целое время');
  const key=JSON.stringify([r.vendor,r.account??null]);if(keys.has(key))bad('Учётная запись повторяется');keys.add(key);return {...r} as unknown as SubscriptionDate;
 });
}
export function billingConfig(owner:Record<string,unknown>){
 const prices=Object.hasOwn(owner,'subscriptionPrices')?subscriptionPrices(owner.subscriptionPrices):subscriptionPrices([
  ...['Max 5x','Max 20x','Pro'].map(plan=>({vendor:'claude',plan,amount:null,currency:'USD'})),...['Plus','Pro'].map(plan=>({vendor:'codex',plan,amount:null,currency:'USD'}))]);
 const dates=Object.hasOwn(owner,'subscriptionDates')?subscriptionDates(owner.subscriptionDates):[];
 for(const key of ['limitSwitchCheaper','limitWarn80'])if(Object.hasOwn(owner,key)&&typeof owner[key]!=='boolean')bad('Настройка '+key+': нужен флаг');
 return {subscriptionPrices:prices,subscriptionDates:dates,limitSwitchCheaper:owner.limitSwitchCheaper===true,limitWarn80:owner.limitWarn80===true};
}
export function billingSnapshot(config:ReturnType<typeof billingConfig>,sources:{vendor:string;connected:boolean;plan:string|null;level?:string|null;extraUsageEnabled?:boolean|null;account?:string|null}[],now:number){
 const today=new Date(now*1000),month=today.getUTCMonth(),year=today.getUTCFullYear();
 const subscriptions=sources.map(s=>{const account=s.account??null,manual=account?config.subscriptionDates.find(d=>d.vendor===s.vendor&&d.account===account):undefined,detected=s.plan?(s.plan+(s.level?' '+s.level:'')):null,plan=manual?.plan??detected,price=config.subscriptionPrices.find(p=>p.vendor===s.vendor&&p.plan===plan),amount=manual?.amount??price?.amount??null,currency=manual?.amount!=null?manual.currency:price?.currency;
  return {...s,account,plan,detectedPlan:detected,planSource:manual?.plan?'owner':'provider',date:manual?.date??null,amount,currency:currency??null,enteredAt:manual?.enteredAt??null};});
 const bindings=config.subscriptionDates.map(d=>({...d,status:!d.account?'unbound':sources.some(s=>s.connected&&s.vendor===d.vendor&&s.account===d.account)?'current':'other_account'}));
 const payments=subscriptions.flatMap(s=>{if(!s.connected||!s.date)return [];const anchor=new Date(s.date),day=anchor.getUTCDate();
  return Array.from({length:5},(_,i)=>{const first=new Date(Date.UTC(year,month+i-1,1)),lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,lastDay))).toISOString().slice(0,10)}).filter(date=>date>=s.date!).map(date=>({vendor:s.vendor,date,amount:s.amount,currency:s.currency,plan:s.plan,source:'owner' as const}));
 });return {config,subscriptions,payments,bindings,generatedAt:now,timeZone:'UTC' as const};
}
