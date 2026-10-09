import {randomBytes} from 'node:crypto';
import {MODE_IDS,pyTruthy,type Mode,type Seat as TeamSeat} from '@harnessy/team';
import {pythonTrim,Policy} from '@harnessy/journal';
import {statSync} from 'node:fs';
import {RuntimeError} from './errors.ts';
import {systemClock,type Clock,type ModelCatalog,type RuntimeEvent} from './types.ts';
import type {Vendor,TurnHandle,Usage,Seat} from '@harnessy/providers';
import type {EventBus} from './events.ts';
import {timestampMessage,type TranscriptMessage} from './state.ts';
export const APPROVAL_TIMEOUT_MS=900_000;
export type ApprovalDecision='allow'|'deny'|'timeout';
export type DurableDecision=(decision:ApprovalDecision)=>{decision:ApprovalDecision;error?:Error};
export class Approval {
 readonly future:Promise<boolean>;private resolve!:(allow:boolean)=>void;private timer:unknown;private ended=false;
 readonly id:string;readonly pane:Pane;readonly title:string;readonly detail:string;private clock:Clock;private durable:DurableDecision|undefined;
 constructor(id:string,pane:Pane,title:string,detail:string,timeout:number,clock:Clock,durable?:DurableDecision){
 this.id=id;this.pane=pane;this.title=title;this.detail=detail;this.clock=clock;this.durable=durable;
 this.future=new Promise(r=>{this.resolve=r});this.timer=clock.setTimeout(()=>{try{this.finish('timeout')}catch{/* Durable failure keeps the card open; its handler published the error. */}},timeout)
 }
 finish(requested:ApprovalDecision):boolean {if(this.ended)return false;const saved=this.durable?.(requested)??{decision:requested};this.ended=true;this.clock.clearTimeout(this.timer);this.pane.approvals.delete(this.id);this.pane.publish({type:'approvalResolved',id:this.id,decision:saved.decision});this.resolve(saved.decision==='allow');if(saved.error)throw saved.error;return true}
 detach():void {if(this.ended)return;this.ended=true;this.clock.clearTimeout(this.timer);this.pane.approvals.delete(this.id);this.resolve(false)}
 event():RuntimeEvent{return {type:'approval',id:this.id,title:this.title,detail:this.detail}}
}
export interface PaneInit {id:string;vendor:Vendor|'human';label:string;model:string;mode?:Mode;cwd:string;role?:string;writePaths?:string[];digest?:boolean}
export class Pane {
 id:string;vendor:Vendor|'human';label:string;model:string;mode:Mode;cwd:string;role:string;writePaths:string[];digest:boolean;
 worktree:string|null=null;branch:string|null=null;sessionId:string|null=null;busy=false;touched=false;revision=0;
 readonly uncommitted=new Set<TranscriptMessage>();transcript:TranscriptMessage[]=[];seen:Record<string,number>={};carry='';tokens:Usage|null=null;handle:TurnHandle|null=null;
 recoveryNote:string|null=null;recoveryError:RuntimeEvent|null=null;uncertainNote:string|null=null;status:'idle'|'recovering'|'uncertain'='idle';readonly approvals=new Map<string,Approval>();relayDepth=0;
 private bus:EventBus;private clock:Clock;
 constructor(init:PaneInit,bus:EventBus,clock:Clock=systemClock){this.bus=bus;this.clock=clock;this.id=init.id;this.vendor=init.vendor;this.label=init.label;this.model=init.model;this.mode=init.mode??'chat';this.cwd=init.cwd;this.role=init.role??'';this.writePaths=[...(init.writePaths??[])];this.digest=init.digest??false}
 publish(event:RuntimeEvent):void{this.bus.publish(this.id,event)}
 record(role:string,text:string):void{if(pythonTrim(text))this.transcript.push(timestampMessage(role,text,this.clock.now()))}
 settings(){return {id:this.id,vendor:this.vendor,label:this.label,role:this.role,model:this.model,mode:this.mode,cwd:this.cwd,sessionId:this.sessionId,digest:this.digest,busy:this.busy,writePaths:[...this.writePaths],worktree:this.worktree,branch:this.branch,touched:this.touched,pendingApprovals:this.approvals.size}}
 persist(){return {model:this.model,mode:this.mode,sessionId:this.sessionId,digest:this.digest,vendor:this.vendor}}
 providerSeat():Seat{if(this.vendor==='human')throw new RuntimeError('no_provider','нет провайдера: human');return {id:this.id,vendor:this.vendor,label:this.label,model:this.model,mode:this.mode,cwd:this.cwd,sessionId:this.sessionId,writePaths:[...this.writePaths],worktree:this.worktree}}
 askApproval(title:string,detail:string,timeout=APPROVAL_TIMEOUT_MS):Promise<boolean>{let id:string;do{id=randomBytes(6).toString('hex')}while(this.approvals.has(id));const a=new Approval(id,this,title,detail,timeout,this.clock);this.approvals.set(id,a);this.publish(a.event());return a.future}
 resolveApproval(id:string,allow:boolean):boolean{return this.approvals.get(id)?.finish(allow?'allow':'deny')??false}
 denyApprovals():void{for(const a of [...this.approvals.values()])try{a.finish('deny')}catch{/* A failed journal decision stays open; it must not prevent turn cancellation. */}}
}
export function validDir(path:string):boolean{try{return statSync(path).isDirectory()}catch{return false}}
export class Registry {
 readonly panes=new Map<string,Pane>();policy:Policy|null=null;policyChanged:((policy:Policy)=>void)|null=null;
 readonly defaultCwd:string;readonly models:ModelCatalog;private bus:EventBus;private clock:Clock;readonly providers:ReadonlySet<Vendor>;
 constructor(defaultCwd:string,models:ModelCatalog,seats:readonly TeamSeat[],bus:EventBus,clock:Clock,providers:ReadonlySet<Vendor>){this.defaultCwd=defaultCwd;this.models=models;this.bus=bus;this.clock=clock;this.providers=providers;for(const seat of seats)this.add(seat)}
 add(seat:TeamSeat):Pane {const existing=this.panes.get(seat.id);if(existing)return existing;
 const pane=new Pane({id:seat.id,vendor:seat.vendor,label:seat.label,model:seat.model||this.models[seat.vendor]?.find(m=>m.id)?.id||'',mode:seat.mode,cwd:this.defaultCwd,role:seat.role,writePaths:seat.writePaths,digest:seat.digest},this.bus,this.clock);this.panes.set(pane.id,pane);return pane}
 get ids(){return [...this.panes.keys()]}
 get(id:string){return this.panes.get(id)??null}
 others(id:string){return [...this.panes.values()].filter(p=>p.id!==id)}
 roleOf(id:string){return id==='owner'?'owner':this.get(id)?.role??id}
 refreshPolicy():boolean {if(!this.policy)return false;try{if(this.policy.maybeReload())this.policyChanged?.(this.policy)}catch{return false}return !this.policy.broken}
 canObserve(viewer:string,target:string):boolean {if(viewer==='owner')return true;return this.refreshPolicy()&&this.policy!.canObserve(this.roleOf(viewer),this.roleOf(target))}
 update(pane:Pane,body:Record<string,unknown>):boolean {if(pane.busy)return false;pane.touched=true;pane.revision++;
 const model=body.model,known=pane.vendor==='human'?[]:this.models[pane.vendor]??[];
 if(typeof model==='string'&&model&&(known.some(m=>m.id===model)||pane.vendor==='codex'&&known.length<=1))pane.model=model;
 else if(typeof model==='string'&&model){const other=(['claude','codex'] as const).find(v=>this.providers.has(v)&&this.models[v]?.some(m=>m.id===model));if(other&&other!==pane.vendor){pane.vendor=other;pane.model=model;pane.sessionId=null;pane.handle=null}}
 if(MODE_IDS.includes(body.mode as Mode))pane.mode=body.mode as Mode;
 if(typeof body.cwd==='string'&&validDir(body.cwd)){if(body.cwd!==pane.cwd){pane.transcript=[];pane.seen={}}pane.cwd=body.cwd}
 if(Object.hasOwn(body,'sessionId')){const next=typeof body.sessionId==='string'&&body.sessionId?body.sessionId:null;if(next!==pane.sessionId){pane.transcript=[];pane.seen={}}pane.sessionId=next}
 if(Object.hasOwn(body,'digest'))pane.digest=pyTruthy(body.digest);return true
 }
 transcriptOf(id:string,lastN=20):string {const pane=this.get(id);if(!pane)return '';const msgs=pane.transcript.slice(-lastN),out=[pane.id+' · '+pane.label+' · '+pane.vendor+' · '+pane.model+' · режим '+pane.mode+' · последние '+msgs.length+' реплик'];for(const m of msgs){const who=m.role==='me'?'владелец':m.role==='ai'?'агент':m.role==='peer'?'сосед':m.role;out.push(who+': '+[...m.text].slice(0,2000).join(''))}return out.join('\n')}
}
