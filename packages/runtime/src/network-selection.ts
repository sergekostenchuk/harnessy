import {networkRevision,defaultNetworkPolicy,type Settings,type NetworkExit,type NetworkPolicy,type ExitCheck} from '@harnessy/projects';
import {NetworkError} from './network-wire.ts';
export type SwitchReason='connection'|'server_error'|'rate_limited'|'silence'|'rotation';
export const switchReason:Record<SwitchReason,string>={connection:'ошибка соединения',server_error:'ответ 5xx',rate_limited:'ответ 429',silence:'нет ответа в заданный срок',rotation:'ротация по времени'};
export interface RouteSnapshot {provider:string;stamp:string|null;exits:NetworkExit[];policy:NetworkPolicy;configured:boolean}
interface Choice {stamp:string|null;index:number;since:number;reason:SwitchReason|null;failed:Map<string,number>}
export interface SelectionMetric {provider:string;exit:string;switches:number;reserveMs:number;rateLimits:number;silences:number}
export class NetworkSelection {
 private states=new Map<string,Choice>();private metrics=new Map<string,SelectionMetric>();
 private settings:Settings;private check:(id:string,revision:string)=>ExitCheck|null;private now:()=>number;
 constructor(settings:Settings,check:(id:string,revision:string)=>ExitCheck|null,now:()=>number=Date.now){this.settings=settings;this.check=check;this.now=now}
 snapshot(provider:string):RouteSnapshot {const config=this.settings.network(),ids=config.chains[provider],policy=config.policies?.[provider]??defaultNetworkPolicy;return {provider,stamp:networkRevision([ids,policy,...(ids??[]).map(id=>config.exits[id])]),configured:ids!==undefined,exits:ids===undefined?[{id:'implicit-direct',label:'Напрямую',type:'direct'}]:ids.map(id=>config.exits[id]!),policy}}
 current(s:RouteSnapshot){if(this.snapshot(s.provider).stamp!==s.stamp)throw new NetworkError('network_unavailable','Цепочка изменилась во время хода; повторите ход')}
 private state(s:RouteSnapshot){let state=this.states.get(s.provider);if(!state||state.stamp!==s.stamp){if(state)this.finish(s.provider,state);state={stamp:s.stamp,index:0,since:this.now(),reason:null,failed:new Map()};this.states.set(s.provider,state)}return state}
 private row(provider:string,exit:string){const key=provider+'\0'+exit;let row=this.metrics.get(key);if(!row){row={provider,exit,switches:0,reserveMs:0,rateLimits:0,silences:0};this.metrics.set(key,row)}return row}
 private activeExit=new Map<string,string>();
 private finish(provider:string,state:Choice){const id=this.activeExit.get(provider);if(id&&state.index>0)this.row(provider,id).reserveMs+=Math.max(0,this.now()-state.since);this.activeExit.delete(provider)}
 private checked(exit:NetworkExit){const c=this.check(exit.id,networkRevision(exit)!);return c?.revision===networkRevision(exit)&&c.ok&&c.ip&&c.country&&c.state!=='mismatch'?c:null}
 private country(exit:NetworkExit){return this.checked(exit)?.country?.normalize('NFKC').trim().toLowerCase()??null}
 candidates(s:RouteSnapshot){this.current(s);const state=this.state(s),primary=s.exits[0];if(!primary)throw new NetworkError();
  for(const exit of s.exits){const failed=state.failed.get(exit.id),check=this.checked(exit);if(failed!==undefined&&check&&check.checkedAt>failed)state.failed.delete(exit.id)}
  const rotate=s.policy.mode==='rotation'&&this.now()-state.since>=s.policy.rotationMinutes*60000;
  const start=rotate?(state.index+1)%s.exits.length:state.index;
  let missing=false;const ids:number[]=[];
  for(let n=0;n<s.exits.length;n++){const i=(start+n)%s.exits.length,exit=s.exits[i]!;if(state.failed.has(exit.id))continue;
   if(i>0){const a=this.country(primary),b=this.country(exit);if(!a||!b){missing=true;continue}if(a!==b)continue}ids.push(i);
  }
  if(!ids.length)throw missing?new NetworkError('network_country_unverified','Резерв недоступен: страна основного или резервного выхода не проверена'):new NetworkError('network_no_reserve','Нет живого выхода той же страны; проверьте цепочку');
  return {ids,reason:rotate?'rotation' as const:state.reason};
 }
 allowed(s:RouteSnapshot,index:number){this.current(s);if(index===0)return;const a=this.country(s.exits[0]!),b=this.country(s.exits[index]!);if(!a||!b)throw new NetworkError('network_country_unverified','Страна резервного выхода не подтверждена');if(a!==b)throw new NetworkError('network_no_reserve','Резервный выход находится в другой стране')}
 selected(s:RouteSnapshot,index:number,reason:SwitchReason|null){this.allowed(s,index);const state=this.state(s),exit=s.exits[index]!;
  if(state.index!==index){this.finish(s.provider,state);this.row(s.provider,exit.id).switches++;state.index=index;state.since=this.now();state.reason=reason;}
  this.activeExit.set(s.provider,exit.id);return {reserve:index>0,reason:state.reason};
 }
 failed(s:RouteSnapshot,index:number,reason:SwitchReason){if(this.snapshot(s.provider).stamp!==s.stamp)return;const state=this.state(s),exit=s.exits[index]!;state.failed.set(exit.id,this.checked(exit)?.checkedAt??this.now());state.reason=reason;const row=this.row(s.provider,exit.id);if(reason==='rate_limited')row.rateLimits++;if(reason==='silence')row.silences++;}
 stats(){const rows=new Map([...this.metrics].map(([k,v])=>[k,{...v}]));for(const [provider,state]of this.states){const id=this.activeExit.get(provider);if(id&&state.index>0){const key=provider+'\0'+id,row=rows.get(key)??{...this.row(provider,id)};row.reserveMs+=Math.max(0,this.now()-state.since);rows.set(key,row)}}return [...rows.values()]}
}
