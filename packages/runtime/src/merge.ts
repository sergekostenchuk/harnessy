import {gitops} from '@harnessy/projects';
import type {MergeArgs} from '@harnessy/providers';
import type {Record_} from '@harnessy/journal';
import {RuntimeError,message} from './errors.ts';
import {readActions,saveMerge,type MergeAction} from './action-state.ts';
import type {ActionContext,OwnerMergeContext,MergeResult,ProjectState} from './types.ts';
import type {Runtime} from './runtime.ts';
const HARNESS={seat:'harness',trust:'harness'} as const;
type Context=ActionContext|OwnerMergeContext;
function actor(ctx:Context){const p='project' in ctx?ctx.project:ctx.runtime.project,seat='scope' in ctx?ctx.scope.seatId:'owner',role=seat==='owner'?'owner':p.registry.get(seat)?.role??seat;return {p,seat,role}}
function permission(p:ProjectState,role:string):void {const allowed=new Set([...(p.team?.mergeRoles??['orchestrator']),'owner']);if(!allowed.has(role))throw new RuntimeError('policy_denied','слияние разрешено ролям '+[...allowed].sort().join(', ')+', а не '+role)}
function accepted(p:ProjectState,sha:string):Record_ {
 const threads=p.channel.threads;
 const candidates=p.journal.read({limit:0}).filter(r=>r.kind==='verdict'&&r.accepted&&r.sha===sha&&r.thread&&threads.get(r.thread)?.accepted&&threads.get(r.thread)?.sha===sha&& (r.ack!=='pending'||p.channel.ackDecision(r.seq)?.kind==='ack'));
 const confirmed=(r:Record_)=>r.ack==='pending'?p.channel.ackDecision(r.seq)!.seq:r.seq;
 candidates.sort((a,b)=>confirmed(a)-confirmed(b));const v=candidates.at(-1);if(!v)throw new RuntimeError('not_accepted','у коммита '+sha.slice(0,12)+' нет принятого вердикта; сливать можно только принятое');return v;
}
function announce(p:ProjectState,m:MergeAction):MergeResult {
 if(!m.result)throw new RuntimeError('merge_uncertain','слияние не подтверждено');
 const thread=m.verdict.thread,mergeSha=m.result.mergeSha;
 if(!p.journal.read({limit:0,thread}).some(r=>r.from==='harness'&&r.kind==='status'&&r.origin==='merge'&&r.sha===m.sha&&r.merged===mergeSha)){
 const others=[...p.registry.panes.values()].filter(a=>a.role==='orchestrator'&&a.id!==m.initiator.seat).map(a=>a.id);
 p.channel.postCore({to:['owner',...others],kind:'status',text:'Тред '+thread+': коммит '+m.sha.slice(0,12)+' слит в '+m.branch+' как '+mergeSha.slice(0,12)+' ('+m.initiator.label+').',thread,origin:'merge',sha:m.sha,merged:mergeSha},HARNESS);
 }
 return {ok:true,sha:m.sha,mergeSha,branch:m.branch,thread};
}
function uncertain(p:ProjectState,m:MergeAction):never {
 const error='слияние могло быть выполнено: коммит '+m.sha.slice(0,12)+'; исход в '+m.branch+' не подтверждён, автоматическое повторное слияние запрещено';
 saveMerge(p,{...m,stage:'uncertain',error});const event={type:'error',code:'merge_uncertain',message:error,sessionId:null};p.owner.recoveryError=event;p.owner.publish(event);if(!p.lineErrors.includes(error))p.lineErrors.push(error);throw new RuntimeError('merge_uncertain',error);
}
export class Merges {
 private jobs=new WeakMap<ProjectState,Map<string,Promise<MergeResult>>>();
 private async prove(runtime:Runtime,p:ProjectState,m:MergeAction):Promise<string|null>{
 if(!p.repoRoot)return null;const git=runtime.deps.gitops??gitops;
 if(m.alreadyMerged){const sha=m.result?.mergeSha;if(!sha)return null;const a=await git.run(['merge-base','--is-ancestor',m.sha,sha],p.repoRoot),b=await git.run(['merge-base','--is-ancestor',sha,m.branch],p.repoRoot);return a.code===0&&b.code===0?sha:null}
 return git.confirmMerge(p.repoRoot,m.beforeHead,m.sha,m.branch);
 }
 private async finish(runtime:Runtime,p:ProjectState,m:MergeAction):Promise<MergeResult>{
 if(m.stage==='uncertain'){const event={type:'error',code:'merge_uncertain',message:m.error!,sessionId:null};p.owner.recoveryError=event;p.owner.publish(event);if(!p.lineErrors.includes(m.error!))p.lineErrors.push(m.error!);throw new RuntimeError('merge_uncertain',m.error!)}
 const sha=await this.prove(runtime,p,m);if(!sha||m.result&&m.result.mergeSha!==sha)return uncertain(p,m);
 const done:MergeAction={...m,stage:'completed',result:{sha:m.sha,mergeSha:sha}};if(m.stage!=='completed')saveMerge(p,done);return announce(p,done);
 }
 async restore(runtime:Runtime,p:ProjectState):Promise<void>{
 for(const m of readActions(p).merges.filter(m=>m.stage!=='failed'&&!this.jobs.get(p)?.has(m.key)))try{await this.finish(runtime,p,m)}catch(e){if(!(e instanceof RuntimeError)||e.code!=='merge_uncertain')throw e}
 }
 async merge(a:MergeArgs,ctx:Context):Promise<MergeResult>{
 ctx.assertActive();const {p,seat,role}=actor(ctx);permission(p,role);if(!p.repoRoot)throw new RuntimeError('no_repo','папка проекта не под git');
 const git=ctx.runtime.deps.gitops??gitops,input=typeof a.sha==='string'?a.sha:'',full=/^[0-9a-f]{7,40}$/.test(input)?await git.resolveSha(p.repoRoot,input):null;
 ctx.assertActive();if(!full)throw new RuntimeError('sha_unknown','коммита '+input+' нет в репозитории');
 const branch=p.team?.integrationBranch??'main',key=branch+':'+full;
 let jobs=this.jobs.get(p);if(!jobs){jobs=new Map();this.jobs.set(p,jobs)}
 const existing=jobs.get(key);if(existing)return existing;
 const job=this.perform(a,ctx,p,seat,full,branch,key);jobs.set(key,job);try{return await job}finally{if(jobs.get(key)===job)jobs.delete(key)}
 }
 private async perform(a:MergeArgs,ctx:Context,p:ProjectState,seat:string,full:string,branch:string,key:string):Promise<MergeResult>{
 const saved=readActions(p).merges.find(m=>m.key===key);if(saved&&saved.stage!=='failed')return this.finish(ctx.runtime,p,saved);
 const v=accepted(p,full),thread=v.thread||'без треда',msg=a.message||'merge '+thread+': '+full.slice(0,12)+' (вердикт #'+v.seq+', балл '+v.score+')';
 const git=ctx.runtime.deps.gitops??gitops;let intent:MergeAction|undefined;
 const result=await git.mergeInto(p.repoRoot!,full,branch,msg,facts=>{
 ctx.assertActive();const current=actor(ctx);permission(p,current.role);const verdict=accepted(p,full);
 if(current.p!==p||facts.sha!==full||p.team?.integrationBranch&&p.team.integrationBranch!==branch||verdict.seq!==v.seq)throw new RuntimeError('not_accepted','у коммита '+full.slice(0,12)+' нет принятого вердикта; сливать можно только принятое');
 if(facts.alreadyMerged&&!facts.mergeSha)throw new RuntimeError('merge_failed','слияние не подтверждено: коммит слияния не найден');
 intent={key,stage:facts.alreadyMerged?'completed':'intent',sha:full,branch,message:msg,beforeHead:facts.head,alreadyMerged:facts.alreadyMerged,initiator:{seat,trust:seat==='owner'?'owner':'agent',role:current.role,label:ctx.runtime.labelOf(seat,p)},verdict:{seq:v.seq,thread,score:v.score!},...(facts.alreadyMerged?{result:{sha:full,mergeSha:facts.mergeSha!}}:{})};
 saveMerge(p,intent);
 });
 // Once Git started, finish the original project's facts even if its scope closed.
 if(!result.ok){if(intent){if(result.recovery==='failed')return uncertain(p,intent);saveMerge(p,{...intent,stage:'failed',error:result.error})}throw new RuntimeError('merge_failed',result.error)}
 if(!result.mergeSha||!intent)throw new RuntimeError('merge_failed','слияние не подтверждено: коммит слияния не найден');
 const done:MergeAction={...intent,stage:'completed',result:{sha:full,mergeSha:result.mergeSha}};saveMerge(p,done);return announce(p,done);
 }
}
