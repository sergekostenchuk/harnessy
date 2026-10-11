import {reserve,free,waiting,waitingError,locked} from './operations.ts';
import {isAbsolute} from 'node:path';
import {expandUser,initProject} from '@harnessy/projects';
import {pyTruthy} from '@harnessy/team';
import {askDeliveryDepth} from './action-state.ts';
import {makeRoom,makeRoomIn,roomSet,roomMove,assignRoomRole} from './rooms.ts';
import {createSeat,ensureSeatMaterialized,onboard,restoreAssignments,roleCatalog,type CreateSeatInput} from './roles.ts';
import {chatsList,chatGet,chatsNew,chatsOpen,meta} from './chats.ts';
import {handoff} from './handoff.ts';
import {chat} from './owner-chat.ts';
import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensureLine,loadTeam,instructionsFor,canonicalPath,type Vendor} from '@harnessy/team';
import {Journal,Channel,Policy,JournalError,pythonTrim,type AgentPostInput,type Initiator,type Record_,type DeliveryEntry,type ChannelEvent} from '@harnessy/journal';
import {openProjectGit,writableRoots,Connections,ProjectRegistry,Settings,Pins,gitops} from '@harnessy/projects';
import {digest,roleNote,contextCard} from '@harnessy/context';
import {ProviderError,type TurnContext,type PeerTools,type SendArgs,type AskArgs,type ReadPaneArgs,type MergeArgs,type AssignRoleArgs} from '@harnessy/providers';
import {Pane,Registry,validDir} from './pane.ts';
import {EventBus,type Selector} from './events.ts';
import {StateStore,diskIO,timestampMessage,type ResultMessage,type TranscriptMessage} from './state.ts';
import {Scopes,ProcessTokens} from './scope.ts';
import {renderInbox,queueNote} from './inbox.ts';
import {RuntimeError,message,slice,deepFreeze,object} from './errors.ts';
import {systemClock,type RuntimeDeps,type RuntimeActions,type ProjectState,type TurnScope,type ActiveTurn,type ActionContext,type RuntimeEvent,type TurnRecords,type BridgeSendArgs,type BridgeFailure,type SendResult,type ReadPaneResult,type AskResult,type MergeResult,type AssignRoleResult} from './types.ts';
const OWNER:Initiator & {trust:'owner'}={seat:'owner',trust:'owner'},HARNESS:Initiator & {trust:'harness'}={seat:'harness',trust:'harness'};
type AttemptDecision=NonNullable<Record_['attempt']>;
export class Runtime {
 readonly clock;readonly connections;readonly projectRegistry;readonly settings;readonly pins;readonly defaultDir:string;readonly scopes=new Scopes();private tokens=new ProcessTokens(this.scopes);
 private generation=0;private current:ProjectState|null=null;private opening=Promise.resolve();
 readonly deps:RuntimeDeps;readonly actions:RuntimeActions;
 constructor(deps:RuntimeDeps,actions:RuntimeActions){this.deps=deps;this.actions=actions;
 if(!actions||['ask','merge','assignRole','afterTurn','restorePendingAcks','cancelAsks'].some(k=>typeof (actions as unknown as Record<string,unknown>)[k]!=='function'))throw new RuntimeError('actions_required','порт действий обязателен',500);
 this.clock=deps.clock??systemClock;this.connections=deps.connections??new Connections();this.projectRegistry=deps.projectRegistry??new ProjectRegistry();this.defaultDir=canonicalPath(deps.defaultDir??process.env.CHAT_WORK_DIR??'/Users/Shared/simple-claude-chat');
 const current=()=>this.current&&!this.current.closed?this.current.dir:null;
 this.settings=typeof deps.settings==='function'?deps.settings(current):deps.settings??new Settings(undefined,current);
 this.pins=typeof deps.pins==='function'?deps.pins(current,id=>this.chatMeta(id)):deps.pins??new Pins(undefined,current,id=>this.chatMeta(id))
 }
 get project():ProjectState{if(!this.current||this.current.closed)throw new RuntimeError('project_closed','проект закрыт');return this.current}
 get registry(){return this.project.registry}get owner(){return this.project.owner}get journal(){return this.project.journal}get channel(){return this.project.channel}get lineErrors(){return [...this.project.lineErrors]}get halted(){return this.project.halted}
 private provider(vendor:Vendor|'human'){const provider=vendor==='human'?null:this.deps.providers[vendor];if(!provider)throw new RuntimeError('no_provider','нет провайдера: '+vendor,503);return provider}
 private requireOwner(initiator:Initiator):void {if(initiator?.seat!=='owner'||initiator.trust!=='owner')throw new RuntimeError('policy_denied','действие доступно только владельцу',403)}
 private same(p:ProjectState):void{if(this.current!==p||p.closed)throw new RuntimeError('project_changed','проект сменился',409)}
 private pane(id:string,p=this.project):Pane{const pane=p.registry.get(id);if(!pane)throw new RuntimeError('pane_unknown','нет окна',404);return pane}
 labelOf(id:string,p=this.project){return id==='owner'?'владелец':id==='harness'?'харнесс':p.registry.get(id)?.label??id}
 subscribe(selector:Selector){if('pane' in selector)this.pane(selector.pane!);return this.project.bus.subscribe(selector)}
 private async changeProject<T>(operation:()=>Promise<T>):Promise<T> {
 const previous=this.opening;let release!:()=>void;this.opening=new Promise(r=>{release=r});await previous;
 try{return await operation()}finally{release()}
 }
 async openProject(dir:string,options:{expected?:ProjectState;initialize?:(p:ProjectState)=>void|Promise<void>;deferPumps?:boolean}={}):Promise<void> {
 return this.changeProject(()=>this.openProjectLocked(dir,options))
 }
 private async openProjectLocked(dir:string,options:{expected?:ProjectState;initialize?:(p:ProjectState)=>void|Promise<void>;deferPumps?:boolean}):Promise<void> {
 if(options.expected)this.same(options.expected);await this.closeProjectLocked();const generation=++this.generation,path=realpathSync(dir),harness=await ensureLine(path),lineErrors:string[]=[];let team=null,policy=null;
 try{team=loadTeam(harness);lineErrors.push(...team.warnings)}catch(e){lineErrors.push(message(e))}
 try{policy=new Policy(join(harness,'comms-policy.yaml'))}catch(e){lineErrors.push(message(e))}
 let registry!:Registry,owner!:Pane;
 const bus=new EventBus(()=>{const panes=[owner,...registry.panes.values()];return [...panes.flatMap(p=>[...p.approvals.values()].map(a=>({pane:p.id,event:a.event()}))),...panes.filter(p=>p.uncertainNote).map(p=>({pane:p.id,replay:true,event:{type:'note',text:p.uncertainNote,warning:this.warningId(this.project,p,'uncertain')}})),...panes.filter(p=>p.recoveryNote).map(p=>({pane:p.id,replay:true,event:{type:'note',text:p.recoveryNote,warning:this.warningId(this.project,p,'recovery')}})),...panes.filter(p=>p.recoveryError).map(p=>({pane:p.id,replay:true,event:p.recoveryError!}))]});
 const models=this.deps.models??{};if(!this.deps.models){const entries=Object.entries(this.deps.providers) as [Vendor,import('@harnessy/providers').Provider][];const results=await Promise.allSettled(entries.map(([,provider])=>provider.models()));for(let i=0;i<entries.length;i++){const result=results[i]!;if(result.status==='fulfilled')models[entries[i]![0]]=result.value;else lineErrors.push(message(result.reason))}}
 registry=new Registry(path,models,Object.values(team?.seats??{}),bus,this.clock,new Set(Object.keys(this.deps.providers) as Vendor[]));registry.policy=policy;
 owner=new Pane({id:'owner',vendor:'human',label:'владелец',model:'',cwd:path,role:'owner'},bus,this.clock);
 const journal=new Journal(path,{now:()=>new Date(this.clock.now()),...this.deps.journalOptions});
 registry.policyChanged=policy=>{journal.append({sender:'harness',to:['*'],kind:'policy',text:'политика связи перечитана: версия '+policy.version,policy:policy.version})};
 const git=await openProjectGit(path,Object.values(team?.seats??{}),team?.integrationBranch??'main',this.deps.gitops??gitops);lineErrors.push(...git.lineErrors);
 for(const pane of registry.panes.values()){pane.cwd=git.cwdBySeat[pane.id]??path;pane.worktree=git.worktreeBySeat[pane.id]??null;pane.branch=git.branchBySeat[pane.id]??null}
 const gitFact=(args:string[]):string|null=>{if(!git.repoRoot)return null;try{return execFileSync('git',['-C',git.repoRoot,...args],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim()||null}catch{return null}};
 const channel=new Channel({journal,policy,projectDir:path,liveSeats:()=>registry.ids,roleOf:id=>id==='owner'?'owner':registry.get(id)?.role??null,labelOf:id=>id==='owner'?'владелец':id==='harness'?'харнесс':registry.get(id)?.label??id,hasRepo:()=>!!git.repoRoot,resolveSha:sha=>gitFact(['rev-parse','--verify','--end-of-options',sha+'^{commit}']),mergeCommitFor:sha=>{if(!git.repoRoot)return null;const branch=team?.integrationBranch??'main';try{execFileSync('git',['-C',git.repoRoot,'merge-base','--is-ancestor',sha,branch],{stdio:'ignore',timeout:5000})}catch{return null}return gitFact(['rev-list','--merges','--ancestry-path','--reverse',sha+'..'+branch])?.split(/\s+/)[0]??sha}});
 const saved=journal.loadPanes();if(object(saved.room)&&typeof saved.room.model==='string'&&typeof saved.room.mode==='string')makeRoomIn({registry,dir:path,bus},this,saved.room.model,saved.room.mode,saved.room.vendor==='claude'||saved.room.vendor==='codex'?saved.room.vendor:undefined);for(const pane of registry.panes.values()){const st=saved[pane.id];if(!object(st))continue;if(st.vendor==='claude'||st.vendor==='codex')pane.vendor=st.vendor;registry.update(pane,{model:st.model,mode:st.mode,sessionId:st.sessionId??null,digest:st.digest??false})}
 const state=new StateStore(path,this.deps.stateIO??diskIO,this.clock,this.deps.id);const halted=state.load(registry,lineErrors);
 const p:ProjectState={generation,dir:path,closed:false,starting:true,now:()=>this.clock.now(),editing:new Map(),materializing:new Set(),restoreFailed:new Map(),team,repoRoot:git.repoRoot,policy,journal,channel,registry,owner,bus,state,lineErrors,halted,active:new Map(),pumps:new Map(),resets:new Map(),routeJobs:new Map(),processEpoch:new Map(),wakeups:new Set()};
 this.current=p;channel.on(event=>{if(!p.closed)this.onChannel(p,event)});
 try{await this.projectRegistry.rememberProject(path)}catch(e){lineErrors.push(message(e))}
 await this.actions.restorePendingAcks({runtime:this,project:p});
 try{await restoreAssignments(this,p)}catch(e){lineErrors.push(message(e));for(const id of registry.ids)p.restoreFailed.set(id,message(e))}
 for(const id of p.materializing){p.restoreFailed.set(id,[...lineErrors].reverse().find(text=>text.startsWith('назначение '+id+' '))??lineErrors.at(-1)??'восстановление назначения не завершено')}p.materializing.clear();
 try{await options.initialize?.(p)}catch(e){p.starting=false;throw e}
 try{await this.restoreAttemptDecisions(p)}catch(e){lineErrors.push(message(e));for(const id of registry.ids)p.restoreFailed.set(id,message(e))}
 for(const pane of registry.panes.values()){
 const attempt=state.attempts[pane.id],matched=attempt&&state.results(pane).some(r=>object(r.runtime)&&r.runtime.turnInstanceId===attempt.turnInstanceId);
 if(attempt&&!matched){pane.status='uncertain';try{state.uncertain(pane.id)}catch(e){lineErrors.push(message(e))}pane.uncertainNote=waitingError(p,pane).message;pane.publish({type:'note',text:pane.uncertainNote,warning:this.warningId(p,pane,'uncertain')})}
 else {await this.recover(p,pane)}
 }
 p.starting=false;if(!halted&&!options.deferPumps)for(const pane of registry.panes.values())if(pane.status==='idle'&&!p.materializing.has(pane.id)&&!p.restoreFailed.has(pane.id))await this.resumeQueue(pane.id,p);
 }
 async projectSet(path:string,options:{reload?:boolean},initiator:Initiator){
 this.requireOwner(initiator);const p=this.project;
 if(!validDir(path))throw new RuntimeError('path_invalid','папки нет или это не папка: '+path,400);
 return this.changeProject(async()=>{
 this.same(p);if(path===p.dir&&!options.reload)return {ok:true as const,project:path,changed:false as const};
 const hold=reserve(p,[...p.registry.panes.values()],'идёт ход: смени папку, когда все окна свободны',true);
 try{if(!validDir(path))throw new RuntimeError('path_invalid','папки нет или это не папка: '+path,400);await this.openProjectLocked(path,{expected:p});const next=this.project;return {ok:true as const,project:next.dir,changed:true as const,lineErrors:[...next.lineErrors],panes:[...next.registry.panes.values()].map(p=>p.settings())}}
 finally{hold.release()}
 })
 }
 async projectCreate(input:{path?:unknown;git?:unknown;model?:unknown},initiator:Initiator){
 this.requireOwner(initiator);const p=this.project,path=expandUser(pythonTrim(String(input.path||'')));
 if(!path||!isAbsolute(path)||[...path].length>400)throw new RuntimeError('path_invalid','нужен абсолютный путь папки',400);
 return this.changeProject(async()=>{
 this.same(p);const busyText='идёт ход: создай папку, когда все окна свободны';let hold=reserve(p,[...p.registry.panes.values()],busyText,true);
 try{
 let info:Awaited<ReturnType<typeof initProject>>;
 try{info=await initProject(path,{git:input.git===undefined||pyTruthy(input.git),model:String(input.model||'')},{...(this.deps.gitops?{gitops:this.deps.gitops}:{}),catalog:structuredClone(p.registry.models),...(p.registry.get('room')?.model?{roomModel:p.registry.get('room')!.model}:{}),settings:structuredClone(this.settings.effective())})}
 catch(e){throw new RuntimeError('project_failed','проект не создан: '+message(e),400,{cause:e})}
 this.same(p);
 // Reacquire for the current seats synchronously; closing marks the project closed before the next await.
 hold.release();hold=reserve(p,[...p.registry.panes.values()],busyText,true);
 await this.openProjectLocked(path,{expected:p});const next=this.project;
 return {ok:true as const,project:next.dir,...info,seats:[...next.registry.panes.values()].filter(p=>p.id!=='room').length}
 }finally{hold.release();if(this.current===p&&!p.closed)for(const id of p.registry.ids)void this.kick(id)}
 })
 }
 async closeProject():Promise<void>{return this.changeProject(()=>this.closeProjectLocked())}
 private async closeProjectLocked():Promise<void>{const p=this.current;if(!p||p.closed)return;if(p.state.undurable.size){try{p.state.saveChats(p.registry);p.state.undurable.clear()}catch(e){throw new RuntimeError('write_failed','ответ модели не сохранён: '+p.state.chatsPath+': '+message(e),409,{cause:e,fields:{path:p.state.chatsPath}})}}p.closed=true;this.actions.closeProject?.(p);const turns=[...p.active.values()];
 for(const turn of turns)this.cancelTurn(turn.pane.id,'project_closed',p);
 p.owner.denyApprovals();p.bus.close();this.tokens.clear();this.scopes.clear();
 let failure:unknown;try{await Promise.all(Object.values(this.deps.providers).map(provider=>provider.close()))}catch(e){failure=e}
 for(const turn of turns)turn.releaseReset();await Promise.all(turns.map(t=>t.finished));if(failure)throw failure
 }
 private onChannel(p:ProjectState,event:ChannelEvent):void {
 if(event.type==='posted')p.registry.get(event.initiator.seat)?.publish({type:'sent',record:event.record});
 if(event.type==='rejected')p.registry.get(event.sender)?.publish({type:'toolError',text:'политика: '+event.reason});
 if(event.type==='pendingAck'){void this.actions.restorePendingAcks({runtime:this,project:p}).catch(e=>this.report(p,p.owner,e));return}
 if(event.type!=='delivered'||event.record.origin==='steer')return;
 for(const id of event.record.to){if(id==='owner'){p.owner.publish({type:'owner',record:event.record});continue}const pane=p.registry.get(id);if(!pane)continue;
 pane.publish({type:'queued',record:event.record,pending:p.journal.pendingFor(id).length});
 if(event.record.kind==='stop')this.cancelTurn(id,'stop',p);
 if(pane.status==='uncertain'){this.stateEvent(p,pane);continue}void this.kick(id)
 }
 }
 waiting(id:string){const p=this.project,pane=this.pane(id,p);if(p.restoreFailed.has(id))return null;const info=waiting(p,pane);if(info)return info;const pending=this.attemptDecisions(p).find(d=>d.record.attempt!.pane===id&&!d.done);if(!pending)return null;const a=pending.record.attempt!,result=p.state.results(pane).find(r=>r.runtime?.turnInstanceId===a.turnInstanceId);return {status:a.action==='finish'?'recovering' as const:'uncertain' as const,recordSeqs:Array.isArray(result?.runtime.recordSeqs)?[...result.runtime.recordSeqs]:[],startedAt:null,turnInstanceId:a.turnInstanceId,actions:[a.action]}}
 publishState(id:string):void {const p=this.project;this.stateEvent(p,this.pane(id,p))}
 private warningId(p:ProjectState,pane:Pane,kind:string):string {return pane.id+':'+(waiting(p,pane)?.turnInstanceId??p.active.get(pane.id)?.scope.turnInstanceId??'episode:'+p.generation)+':'+kind}
 postOwner(input:AgentPostInput,initiator:Initiator):Record_ {this.requireOwner(initiator);const p=this.project;p.registry.refreshPolicy();return p.channel.postCore({...input,thread:input.thread??(input.kind==='task'?'T'+(p.journal.lastSeq+1):null)},OWNER)}
 private report(p:ProjectState,pane:Pane,error:unknown):void{if(!p.closed){const event={type:'error',message:slice(message(error),600),sessionId:pane.sessionId,code:error instanceof RuntimeError?error.code:'internal',warning:this.warningId(p,pane,'error')};if(pane.status==='recovering'||pane.status==='uncertain')pane.recoveryError=event;pane.publish(event)}}
 private stateEvent(p:ProjectState,pane:Pane){if(!p.closed)pane.publish({type:'state',...pane.settings(),pending:p.journal.pendingFor(pane.id).length,status:pane.status,waiting:this.waiting(pane.id)})}
 private attemptDecisions(p:ProjectState):{record:Record_;done:Record_|null}[] {
  const entries:{record:Record_;done:Record_|null}[]=[];
  for(const record of p.journal.read({limit:0})){if(record.from!=='harness'||record.kind!=='note'||record.origin!=='attempt')continue;
   const a=record.attempt,invalid=()=>new RuntimeError('decision_invalid','решение попытки не читается: #'+record.seq,409);
   if(!a||typeof a.pane!=='string'||!a.pane||typeof a.turnInstanceId!=='string'||!a.turnInstanceId||!['retry','skip','finish'].includes(a.action)||typeof a.done!=='boolean'||a.deliverySeq!==null&&(!Number.isSafeInteger(a.deliverySeq)||a.deliverySeq<0)||a.action==='skip'&&a.deliverySeq===null||record.thread!=='attempt:'+a.turnInstanceId||record.to.length!==1||record.to[0]!=='owner')throw invalid();
   if(!a.done){if(record.reply_to!==null||entries.some(d=>d.record.attempt!.pane===a.pane&&d.record.attempt!.turnInstanceId===a.turnInstanceId))throw invalid();entries.push({record,done:null})}
   else {const decision=entries.find(d=>d.record.seq===record.reply_to&&d.record.attempt!.pane===a.pane&&d.record.attempt!.turnInstanceId===a.turnInstanceId&&d.record.attempt!.action===a.action&&d.record.attempt!.deliverySeq===a.deliverySeq);if(!decision)throw invalid();decision.done??=record}
  }return entries
 }
 private decisionResult(record:Record_){const a=record.attempt!;return {ok:true as const,pane:a.pane,turnInstanceId:a.turnInstanceId,action:a.action,seq:record.seq}}
 private async finishDecision(p:ProjectState,record:Record_):Promise<void> {
  const a=record.attempt!,pane=this.pane(a.pane,p),current=p.state.attempts[a.pane];
  if(current&&current.turnInstanceId!==a.turnInstanceId)throw new RuntimeError('stale_attempt','ожидание этого места уже изменилось');
  if(a.action==='finish'){if(!p.state.results(pane).some(r=>r.runtime?.turnInstanceId===a.turnInstanceId))throw new RuntimeError('stale_attempt','сохранённый результат уже изменился');if(!await this.recover(p,pane,true))throw waitingError(p,pane);this.same(p)}
  else {if(a.action==='skip')p.journal.advance(a.pane,a.deliverySeq!);if(current)p.state.clearAttempt(a.pane)}
  const range=record.text.match(/ #\d+–#\d+$/)?.[0].trim()??'',text=a.action==='skip'?'пропущено владельцем'+(range?': '+range:''):'решение владельца выполнено: '+(a.action==='retry'?'повторить':'завершить восстановление')+(range?' '+range:'');
  if(!this.attemptDecisions(p).find(d=>d.record.seq===record.seq)?.done)p.journal.append({sender:'harness',to:['owner'],kind:'note',origin:'attempt',thread:record.thread,reply_to:record.seq,text,attempt:{...a,done:true}});
  pane.status='idle';pane.uncertainNote=null;pane.recoveryNote=null;pane.recoveryError=null;this.stateEvent(p,pane)
 }
 private async restoreAttemptDecisions(p:ProjectState,only?:Pane):Promise<void> {
  for(const decision of this.attemptDecisions(p)){if(decision.done||only&&decision.record.attempt!.pane!==only.id)continue;const pane=p.registry.get(decision.record.attempt!.pane);if(!pane)throw new RuntimeError('decision_invalid','место решения больше не существует');
   await locked(this,p,async()=>{const hold=reserve(p,[pane],'место занято: завершается решение владельца',true);try{await this.finishDecision(p,decision.record)}finally{hold.release()}})
  }
 }
 async attempt(id:string,input:Record<string,unknown>,initiator:Initiator){
  this.requireOwner(initiator);const p=this.project;
  if(typeof input.project!=='string'||typeof input.turnInstanceId!=='string'||!input.turnInstanceId||typeof input.action!=='string'||!['retry','skip','finish'].includes(input.action))throw new RuntimeError('attempt_invalid','нужны project, turnInstanceId и action: retry|skip|finish',400);
  if(input.project!==p.dir)throw new RuntimeError('project_changed','проект сменился');
  const result=await locked(this,p,async()=>{this.requireOwner(initiator);const pane=this.pane(id,p),previous=this.attemptDecisions(p).find(d=>d.record.attempt!.pane===id&&d.record.attempt!.turnInstanceId===input.turnInstanceId);
   if(previous){if(previous.record.attempt!.action!==input.action)throw new RuntimeError('decision_exists','для этой попытки уже сохранено другое решение');if(previous.done)return this.decisionResult(previous.record)}
   if(p.restoreFailed.has(id))free(p,pane);
   const hold=reserve(p,[pane],'место занято: идёт ход',true);
   try{p.state.refreshDamage(p.registry);for(const [sid,a] of Object.entries(p.state.attempts))if(a.turnInstanceId.startsWith('unreadable:')){const other=p.registry.get(sid);if(other)other.status='uncertain'}
    const info=waiting(p,pane);if(!previous){if(!info)throw new RuntimeError('not_waiting','место не ждёт итога хода');if(info.turnInstanceId!==input.turnInstanceId)throw new RuntimeError('stale_attempt','ожидание этого места уже изменилось',409,{fields:{pane:id,project:p.dir,waiting:info}});if(!info.actions.includes(input.action as 'retry'|'skip'|'finish'))throw new RuntimeError('attempt_invalid','это решение недоступно для текущего ожидания',409,{fields:{pane:id,project:p.dir,waiting:info}})}
    const action=input.action as AttemptDecision['action'],deliverySeq=previous?previous.record.attempt!.deliverySeq:action==='finish'?p.state.results(pane).find(r=>r.runtime?.turnInstanceId===input.turnInstanceId)!.deliverySeq:p.state.deliveryBoundary(id,p.journal);
    const seqs=info?.recordSeqs??[],range=seqs.length?' #'+seqs[0]+'–#'+seqs.at(-1):'',label=action==='retry'?'повторить':action==='skip'?'пропустить':'завершить восстановление';
    const record=previous?.record??p.journal.append({sender:'harness',to:['owner'],kind:'note',origin:'attempt',thread:'attempt:'+input.turnInstanceId,text:'владелец решил: '+label+range,attempt:{pane:id,turnInstanceId:input.turnInstanceId as string,action,deliverySeq,done:false}});
    await this.finishDecision(p,record);return this.decisionResult(record)
   }catch(e){const pending=this.attemptDecisions(p).find(d=>d.record.attempt!.pane===id&&!d.done);if(pending){pane.status=pending.record.attempt!.action==='finish'?'recovering':'uncertain';this.report(p,pane,e)}throw e}finally{hold.release()}
  });if(!p.closed)void this.kick(id);return result
 }
 kick(id:string):Promise<void> {const p=this.project,pane=this.pane(id,p),running=p.pumps.get(id);p.wakeups.add(id);if(running)return running;
 let again=false;
 const promise=Promise.resolve().then(async()=>{do{p.wakeups.delete(id);again=await this.pump(p,pane)}while(again&&p.wakeups.has(id)&&!p.closed)}).catch(e=>{again=false;this.report(p,pane,e)}).finally(()=>{if(p.pumps.get(id)===promise)p.pumps.delete(id);if(again&&p.wakeups.has(id)&&!p.closed)void this.kick(id)});p.pumps.set(id,promise);return promise
 }
 async resumeQueue(id:string,p=this.project):Promise<void> {await p.pumps.get(id);if(this.current===p&&!p.closed)void this.kick(id)}
 async idle():Promise<void>{const p=this.project;while(p.pumps.size)await Promise.all([...p.pumps.values()])}
 private async pump(p:ProjectState,pane:Pane):Promise<boolean>{
 if(p.closed||p.starting||pane.busy||p.editing.has(pane.id)||p.materializing.has(pane.id)||p.restoreFailed.has(pane.id))return false;
 await this.restoreAttemptDecisions(p,pane);
 if(!await this.recover(p,pane))return false;
 while(!p.closed&&!p.halted&&!pane.busy){if(p.state.attempts[pane.id]?.status==='uncertain'||pane.status==='uncertain')return false;
 const entries=p.journal.pendingFor(pane.id).filter(e=>e.record.origin!=='steer');if(!entries.length)return true;
 const records=entries.map(e=>e.record),work=records.filter(r=>r.kind!=='stop');pane.publish({type:'delivered',records});
 if(!work.length){p.journal.advance(pane.id,Math.max(...entries.map(e=>e.deliverySeq)));continue}
 try{await this.runTurn(pane.id,renderInbox(work,id=>this.labelOf(id,p)),{entries,project:p})}catch(e){if(!p.closed){pane.publish({type:'note',text:queueNote(work.length)});this.stateEvent(p,pane)}return false}
 if(pane.status==='recovering')return false
 }return true
 }
 private async recover(p:ProjectState,pane:Pane,throwErrors=false):Promise<boolean>{
 if(p.closed)return false;
 const results=p.state.results(pane);let complete=true;
 try{for(const result of results){const rt=result.runtime;
 if(rt&&Number.isSafeInteger(result.deliverySeq)&&result.deliverySeq<=(p.journal.cursors[pane.id]??0)&&rt.effectsPending===false&&!p.state.undurable.has(rt.turnInstanceId)&&p.state.attempts[pane.id]?.turnInstanceId!==rt.turnInstanceId)continue;
 p.state.validate(result,pane,p.journal);
 const replaying=!throwErrors||pane.status==='recovering';pane.status='recovering';if(replaying){pane.recoveryNote='ответ модели сохранён; завершается восстановление доставки';pane.publish({type:'note',text:pane.recoveryNote,warning:this.warningId(p,pane,'recovery')})}
 if(p.state.undurable.has(result.runtime.turnInstanceId)){p.state.saveChats(p.registry);p.state.undurable.delete(result.runtime.turnInstanceId)}
 if(p.state.attempts[pane.id]?.turnInstanceId===result.runtime.turnInstanceId)p.state.clearAttempt(pane.id);
 p.journal.advance(pane.id,result.deliverySeq);
 const records=deepFreeze(result.runtime.recordSeqs.map(seq=>p.journal.get(seq)!));
 if(result.runtime.interrupted){const thread='turn:'+result.runtime.turnInstanceId;if(!p.journal.read({limit:0,thread}).some(r=>r.origin==='interrupt')){const last=Math.max(0,...records.map(r=>r.seq)),text='ход прерван владельцем'+(last?' после записи #'+last:'');p.channel.postCore({to:['owner'],kind:'note',text,origin:'interrupt',thread},HARNESS);pane.publish({type:'note',text})}}
 const effects=await this.actions.afterTurn({runtime:this,project:p,pane,turnInstanceId:result.runtime.turnInstanceId,records,text:result.text,interrupted:result.runtime.interrupted});
 if(p.closed)return false;
 pane.seen={...result.runtime.nextSeen};pane.carry='';p.state.savePanes(p.registry,p.journal);
 if(effects==='completed')p.state.finishEffects(result,p.registry);else complete=false
 }
 if(p.state.attempts[pane.id]){pane.status='uncertain';return false}pane.status=complete?'idle':'recovering';if(complete){pane.recoveryError=null;pane.recoveryNote=null;pane.uncertainNote=null};this.stateEvent(p,pane);return complete
 }catch(e){pane.status='recovering';if(throwErrors)throw e;this.report(p,pane,e);return false}
 }
 private actionContext(p:ProjectState,turn:ActiveTurn):ActionContext {return Object.freeze({runtime:this,scope:turn.scope,turnRecords:turn.records,relayDepth:turn.relayDepth,assertActive:()=>{this.scopes.assert(turn.scope);this.same(p)}})}
 private async scoped<T>(scope:TurnScope,fn:(p:ProjectState,ctx:ActionContext)=>T|Promise<T>):Promise<T|BridgeFailure> {
 try{this.scopes.assert(scope);const p=this.project,turn=p.active.get(scope.seatId);if(!turn||turn.scope!==scope)throw new RuntimeError('turn_ended','ход не активен',403);const ctx=this.actionContext(p,turn);ctx.assertActive();return await fn(p,ctx)}
 catch(e){return {ok:false,code:e instanceof RuntimeError||e instanceof JournalError||e instanceof ProviderError?e.code:'invalid',error:message(e)}}
 }
 send(scope:TurnScope,a:BridgeSendArgs):Promise<SendResult> {return this.scoped(scope,(p,ctx)=>{
 const to=typeof a.to==='string'?a.to.split(',').map(pythonTrim).filter(Boolean):a.to;
 if(Array.isArray(to)&&to.length&&to.every(t=>t==='owner')&&a.kind==='answer')return {ok:false as const,code:'answer_is_text',error:'владельцу отвечай обычным текстом ответа — он виден ему в чате; send владельцу — только escalation, status или question'};
 ctx.assertActive();const record=p.channel.post({...a,to,reply_to:a.reply_to===0?null:a.reply_to??null}, {seat:scope.seatId,trust:'agent'});
 return {ok:true as const,seq:record.seq,thread:record.thread,to:[...record.to]}
 })}
 readPane(scope:TurnScope,a:ReadPaneArgs):Promise<ReadPaneResult>{return this.scoped(scope,(p,ctx)=>{
 if(a.pane===scope.seatId||!p.registry.get(a.pane))return {ok:false as const,code:'pane_unknown',error:'нет такого окна: '+a.pane};
 if(!p.registry.canObserve(scope.seatId,a.pane))return {ok:false as const,code:'policy_denied',error:'политика: роль '+p.registry.roleOf(scope.seatId)+' не наблюдает разговоры роли '+p.registry.roleOf(a.pane)};
 const n=typeof a.last_n==='number'&&Number.isFinite(a.last_n)?Math.max(1,Math.min(100,Math.trunc(a.last_n||20))):20;ctx.assertActive();return {ok:true as const,text:p.registry.transcriptOf(a.pane,n)}
 })}
 ask(scope:TurnScope,args:AskArgs):Promise<AskResult>{return this.scoped(scope,(_p,ctx)=>this.actions.ask(args,ctx))}
 merge(scope:TurnScope,args:MergeArgs):Promise<MergeResult>{return this.scoped(scope,(_p,ctx)=>this.actions.merge(args,ctx))}
 async mergeOwner(args:MergeArgs,initiator:Initiator):Promise<MergeResult>{this.requireOwner(initiator);const p=this.project;if(!this.actions.mergeOwner)throw new RuntimeError('actions_required','порт действий обязателен',500);try{return await this.actions.mergeOwner(args,{runtime:this,project:p,initiator:Object.freeze({...initiator}),assertActive:()=>{this.same(p);this.requireOwner(initiator)}})}catch(e){return {ok:false,code:e instanceof RuntimeError||e instanceof JournalError?e.code:'merge_failed',error:message(e)}}}
 assignRole(scope:TurnScope,args:AssignRoleArgs):Promise<AssignRoleResult>{return this.scoped(scope,(_p,ctx)=>this.actions.assignRole(args,ctx))}
 toolsFor(scope:TurnScope):PeerTools {
 this.scopes.assert(scope);const p=this.project,turn=p.active.get(scope.seatId);if(!turn||turn.scope!==scope)throw new RuntimeError('turn_ended','ход не активен',403);
 return {
 send:async a=>{const r=await this.send(scope,a);return r.ok?{ok:true,text:'Запись #'+r.seq+' отправлена '+r.to.join(', ')+'; тред '+(r.thread||'без треда')+'.'}:r},
 readPane:a=>this.readPane(scope,a),
 ask:async a=>{const r=await this.ask(scope,a);return r.ok?{ok:true,text:r.reply||'(пустой ответ)'}:{...r,error:'Ответа нет: '+r.error}},
 merge:async a=>{const r=await this.merge(scope,a);return r.ok?{ok:true,text:'Слито: '+r.sha.slice(0,12)+' → '+r.mergeSha.slice(0,12)+' в '+r.branch+'.'}:{...r,error:'Слияние отклонено: '+r.error}},
 assignRole:async a=>{const r=await this.assignRole(scope,a);return r.ok?{ok:true,text:'Назначена роль «'+r.label+'» ('+r.pane+', '+r.model+', '+r.mode+') по поручению №'+r.mandate+'; вводная отправлена.'}:r}
 }
 }
 validateBridge(from:string,token:string):TurnScope{const p=this.current;return this.tokens.validate(from,token,p&&!p.closed?p.generation:-1,p?.active.get(from)?.vendor??p?.registry.get(from)?.vendor??'')}
 private roleNote(p:ProjectState,pane:Pane):string {const roles=Object.fromEntries([...p.registry.panes].map(([id,p])=>[id,p.role])),labels=Object.fromEntries([...p.registry.panes].map(([id,p])=>[id,p.label]));return roleNote(pane,{projectDir:p.dir,repoRoot:p.repoRoot,team:p.team,instructionText:p.team&&p.team.seats[pane.id]?instructionsFor(p.team,p.team.seats[pane.id]!):'',policySummary:p.policy?.summaryFor(pane.role,roles,labels)??null})}
 context(id:string){const p=this.project,pane=this.pane(id,p),chat=p.state.activeChat(pane,false);return contextCard(pane,{instructionText:p.team&&p.team.seats[id]?instructionsFor(p.team,p.team.seats[id]!):'',roleNote:this.roleNote(p,pane),chat:chat?{...meta(p,chat)}:null})}
 private async waitVendor(p:ProjectState,vendor:Vendor|'human'):Promise<void>{if(vendor==='human')return;while(p.resets.has(vendor)||p.routeJobs.has(vendor)){await Promise.all([p.resets.get(vendor),p.routeJobs.get(vendor)]);this.same(p)}}
 async runTurn(id:string,messageText:string,options:{entries?:DeliveryEntry[];project?:ProjectState;relayDepth?:number;reservation?:symbol}={}):Promise<string> {
 const p=options.project??this.project,pane=this.pane(id,p);await this.waitVendor(p,pane.vendor);this.same(p);
 if(p.starting)throw new RuntimeError('project_opening','проект открывается',409);
 if(p.halted)throw new RuntimeError('halted','остановлено владельцем: ходы не идут, сообщения ждут в очереди');
 if(pane.busy||p.editing.has(id)&&p.editing.get(id)!==options.reservation)throw new RuntimeError('busy',pane.label+' занято');
 if(p.restoreFailed.has(id))free(p,pane);
 if(p.materializing.has(id))throw new RuntimeError('recovering','назначение роли не завершено');
 if(pane.status!=='idle')throw new RuntimeError(pane.status,'ход не активен');
 const entries=options.entries??[],records=deepFreeze(entries.map(e=>e.record)),injected:TranscriptMessage[]=[];
 const relayDepth=Math.max(options.relayDepth??0,askDeliveryDepth(p,records));
 pane.busy=true;pane.touched=true;pane.revision++;
 const scope=this.scopes.create(p.dir,id,randomUUID()),controller=new AbortController();let releaseReset!:()=>void,finish!:()=>void;
 const turn:ActiveTurn={scope,controller,pane,vendor:pane.vendor,records,deliverySeq:Math.max(0,...entries.map(e=>e.deliverySeq)),relayDepth,attemptNumber:0,handle:null,started:false,stopRequested:false,terminal:null,partial:'',finished:new Promise(r=>{finish=r}),finish:()=>finish(),timer:undefined,resetWait:new Promise(r=>{releaseReset=r}),releaseReset:()=>releaseReset(),result:null,injected};p.active.set(id,turn);this.stateEvent(p,pane);
 let success=false,terminalSent=false;
 try{
 if(!validDir(pane.cwd))throw new RuntimeError('cwd_changed','папки нет: '+pane.cwd);const provider=this.provider(turn.vendor),vendor=provider.vendor,epoch=p.processEpoch.get(vendor)??0,sessionEpoch=pane.sessionEpoch;
 const summary=digest(pane,p.registry.others(id),(a,b)=>p.registry.canObserve(a,b)),nextSeen=summary.nextSeen;
 let prompt=messageText;if(pane.carry){prompt='Прежний разговор (был без папки, продолжается здесь):\n'+pane.carry+'\n\n---\nНовое сообщение:\n'+prompt;pane.publish({type:'note',text:'в сообщение добавлен прежний разговор'})}
 if(summary.text){prompt=summary.text+'\n\n---\nСообщение тебе:\n'+prompt;pane.publish({type:'note',text:'в сообщение добавлена сводка соседей ('+[...summary.text].length+' символов)'})}
 for(const r of records){const m=timestampMessage(r.from==='owner'?'me':'peer',r.from==='owner'?r.text:'[от '+this.labelOf(r.from,p)+'] '+r.text,this.clock.now());if(pythonTrim(m.text)){pane.transcript.push(m);pane.uncommitted.add(m);injected.push(m)}}
 p.state.startAttempt(pane,{turnInstanceId:scope.turnInstanceId,recordSeqs:records.map(r=>r.seq),startedAt:this.clock.now(),deliverySeq:turn.deliverySeq});
 const current=()=>!p.closed&&p.active.get(id)===turn;
 let attempt=0;
 const ctx:TurnContext={signal:controller.signal,modelStarted:()=>{if(current())turn.started=true},publish:event=>{
 if(!current())return;if(event.type==='done'||event.type==='error'){turn.terminal=event.type==='error'?{type:'error',message:event.text,sessionId:pane.sessionId}:event;return}
 if(turn.stopRequested)return;if(event.type==='delta')turn.partial+=event.text;pane.publish(event)
 },askApproval:(title,detail)=>{try{this.scopes.assert(scope)}catch{return Promise.resolve(false)}return pane.askApproval(title,detail)},session:sid=>{if(!current()||turn.stopRequested||pane.vendor!==vendor||pane.sessionEpoch!==sessionEpoch)return;pane.sessionId=sid;p.state.savePanes(p.registry,p.journal)},setHandle:handle=>{
 if(!current())return;turn.handle=handle;pane.handle=handle;if(handle&&turn.stopRequested)this.interruptHandle(pane,handle)
 },env:this.connections.proxyEnv(vendor),roleNote:this.roleNote(p,pane),peers:[...p.registry.panes.values()].map(p=>({id:p.id,label:p.label,vendor:p.vendor as Vendor})),tools:this.toolsFor(scope),relayDepth:turn.relayDepth,projectDir:p.dir,appUrl:this.deps.appUrl,
 registerProcessToken:token=>{if(!p.closed&&(p.processEpoch.get(vendor)??0)===epoch)this.tokens.register(token,p.generation,id,vendor)},revokeProcessToken:token=>this.tokens.revoke(token,p.generation,id,vendor),writableRoots:writableRoots(p.repoRoot,!!pane.worktree)};
 let result:{text:string;sessionId:string|null;interrupted?:boolean};const launchSeat=pane.providerSeat();
 while(true){attempt++;turn.terminal=null;turn.attemptNumber=attempt;const attemptNumber=attempt,seat=attempt===1?launchSeat:{...launchSeat,sessionId:null},activeAttempt=()=>current()&&turn.attemptNumber===attemptNumber;
 const attemptCtx:TurnContext={...ctx,modelStarted:()=>{if(activeAttempt())ctx.modelStarted?.()},publish:e=>{if(activeAttempt())ctx.publish(e)},session:s=>{if(activeAttempt())ctx.session(s)},setHandle:h=>{if(activeAttempt())ctx.setHandle(h)},askApproval:(title,detail)=>activeAttempt()?ctx.askApproval(title,detail):Promise.resolve(false)};
 try{if(controller.signal.aborted)throw new ProviderError('cancelled','ход отменён');result=await Promise.race([provider.runTurn(seat,prompt,attemptCtx),turn.resetWait.then(()=>{throw new ProviderError('cancelled','ход отменён')})]);break}
 catch(e){if(turn.stopRequested&&turn.started){result={text:turn.partial,sessionId:pane.sessionId,interrupted:true};break}
 if(e instanceof ProviderError&&e.code==='session_missing'&&attempt===1&&seat.sessionId&&!controller.signal.aborted){pane.sessionId=null;p.state.savePanes(p.registry,p.journal);pane.publish({type:'note',text:'сессия модели не найдена — начат новый разговор'});turn.partial='';turn.started=false;continue}throw e}finally{if(turn.attemptNumber===attemptNumber)turn.attemptNumber=0}}
 if(p.closed)throw new ProviderError('cancelled','ход отменён');
 const interrupted=turn.stopRequested&&turn.started||result.interrupted===true;pane.sessionId=pane.vendor===vendor&&pane.sessionEpoch===sessionEpoch?result.sessionId:null;
 for(const m of injected)pane.uncommitted.delete(m);
 const response=timestampMessage('ai',result.text,this.clock.now()) as ResultMessage;const held=(turn as ActiveTurn).terminal;
 if(held?.type==='done'){if(typeof held.model==='string'&&held.model)response.model=held.model;if(object(held.usage))response.usage=structuredClone(held.usage);if(typeof held.durationMs==='number'&&Number.isFinite(held.durationMs))response.durationMs=held.durationMs}
 response.deliverySeq=turn.deliverySeq;response.runtime={turnInstanceId:scope.turnInstanceId,recordSeqs:records.map(r=>r.seq),effectsPending:true,interrupted,nextSeen};turn.result=response;
 p.state.commitResult(pane,p.registry,response);
 const receipt=p.state.attempts[id];if(receipt?.turnInstanceId===scope.turnInstanceId)p.state.clearAttempt(id);
 await this.recover(p,pane,true);
 const terminal=held?.type==='done'?held:{type:'done',sessionId:pane.sessionId,durationMs:0,usage:{input:null,output:null,cacheRead:null}};
 if(terminal.type==='done'&&object(terminal.usage))pane.tokens=terminal.usage as unknown as import('@harnessy/providers').Usage;
 pane.publish({...terminal,...(interrupted?{interrupted:true}:{})});terminalSent=true;
 success=true;return result.text
 }catch(e){
 if(!turn.result){pane.transcript=pane.transcript.filter(m=>!injected.includes(m));for(const m of injected)pane.uncommitted.delete(m);
 if(!turn.started){try{p.state.clearAttempt(id)}catch(error){pane.status='uncertain';p.lineErrors.push(message(error))}}
 else {   // модель уже могла действовать (modelStarted), результата нет: неопределённый исход не повторяется автоматически — долговечный uncertain до действия владельца (ревью №111 п.1)
  try{p.state.uncertain(id)}catch(error){p.lineErrors.push(message(error))}
  pane.status='uncertain';pane.uncertainNote=waitingError(p,pane).message;if(!p.closed)pane.publish({type:'note',text:pane.uncertainNote,warning:this.warningId(p,pane,'uncertain')})}
 }else {pane.status='recovering';pane.recoveryNote='ответ модели сохранён; завершается восстановление доставки';pane.publish({type:'note',text:pane.recoveryNote,warning:this.warningId(p,pane,'recovery')})}
 if(!terminalSent&&!p.closed)this.report(p,pane,e instanceof ProviderError&&e.code==='cancelled'?new RuntimeError('cancelled','ход отменён'):e);
 throw e
 }finally{
 this.scopes.revoke(scope);if(!turn.stopRequested)this.actions.cancelAsks(scope,'turn_ended');this.clock.clearTimeout(turn.timer);
 if(p.active.get(id)===turn){p.active.delete(id);pane.busy=false;pane.handle=null;this.stateEvent(p,pane)}
 if(success&&!p.closed&&!options.entries&&pane.status==='idle')void this.kick(id);turn.finish()
 }
 }
 private interruptHandle(pane:Pane,handle:NonNullable<ActiveTurn['handle']>):void{try{void handle.interrupt().catch(e=>pane.publish({type:'toolError',text:slice(message(e),200)}))}catch(e){pane.publish({type:'toolError',text:slice(message(e),200)})}}
 cancelTurn(id:string,reason:string,p=this.project):boolean {
 const turn=p.active.get(id);if(!turn)return false;this.scopes.revoke(turn.scope);
 if(turn.stopRequested)return true;turn.stopRequested=true;turn.pane.denyApprovals();turn.controller.abort(reason);
 try{this.actions.cancelAsks(turn.scope,reason)}catch(e){turn.pane.publish({type:'toolError',text:message(e)})}
 if(turn.handle)this.interruptHandle(turn.pane,turn.handle);
 turn.timer=this.clock.setTimeout(()=>{if(p.active.get(id)===turn)void this.resetVendor(turn.vendor as Vendor,p).catch(e=>this.report(p,turn.pane,e))},30_000);return true
 }
 interrupt(id:string,initiator:Initiator){this.requireOwner(initiator);const pane=this.pane(id);if(this.cancelTurn(id,'interrupt'))return {ok:true};pane.denyApprovals();return {ok:false,error:'нечего прерывать'}}
 approve(id:string,approvalId:string,decision:'allow'|'deny',initiator:Initiator){this.requireOwner(initiator);const p=this.project,pane=id==='owner'?p.owner:this.pane(id,p),ok=pane.resolveApproval(approvalId,decision==='allow');return {ok,error:ok?null:'вопрос уже закрыт'}}
 async halt(on:boolean,initiator:Initiator){this.requireOwner(initiator);const p=this.project;let failure:unknown;if(on){p.halted=true;try{p.state.saveHalt(true)}catch(e){failure=e}}else{p.state.saveHalt(false);p.halted=false}const interrupted:string[]=[];
 for(const pane of p.registry.panes.values()){if(on&&this.cancelTurn(pane.id,'halt',p))interrupted.push(pane.id);pane.publish({type:'note',text:on?'остановлено владельцем: ходы не идут, сообщения ждут в очереди':'работа возобновлена владельцем'});this.stateEvent(p,pane);if(!on&&pane.status==='idle')void this.kick(pane.id)}
 if(failure)throw failure;return {ok:true,halted:on,interrupted,pending:Object.fromEntries([...p.registry.panes.values()].map(pane=>[pane.id,p.journal.pendingFor(pane.id).length]).filter(([,n])=>n))}
 }
 paneSet(id:string,body:Record<string,unknown>,initiator:Initiator){this.requireOwner(initiator);const p=this.project,pane=this.pane(id,p);if(p.restoreFailed.has(id))free(p,pane);if(pane.status==='recovering')throw waitingError(p,pane);if(p.editing.has(id)||p.materializing.has(id))throw new RuntimeError('busy','место сейчас отвечает — дождитесь ответа');const {cwd:_,...safe}=body;
 const updated=p.registry.update(pane,safe);if(updated){p.state.savePanes(p.registry,p.journal);this.stateEvent(p,pane);if(pane.status==='idle')void this.kick(id)}const info=waiting(p,pane);return {ok:true,pane:pane.settings(),...(updated&&pane.busy?{appliesFrom:'next' as const}:{}),...(info?{waiting:info}:{})}}
 async steer(id:string,text:string,initiator:Initiator){this.requireOwner(initiator);const p=this.project,pane=this.pane(id,p);text=pythonTrim(text);if(!text)throw new RuntimeError('text_empty','пустое сообщение',400);
 const turn=p.active.get(id),record=p.channel.postCore({to:[id],kind:'note',text,origin:'steer'},OWNER);
 try{if(!turn||turn.stopRequested||!turn.handle)throw new RuntimeError('turn_ended','ход не активен');this.scopes.assert(turn.scope);await turn.handle.steer(text);this.same(p);this.scopes.assert(turn.scope);pane.record('me',text);pane.publish({type:'steered',record});return {ok:true,seq:record.seq,steered:true}}
 catch(e){const reason='вмешательство не доставлено: '+slice(message(e),200);if(!p.closed)p.channel.postCore({to:['owner'],kind:'rejected',text:reason,reply_to:record.seq,origin:'steer'},HARNESS);throw new RuntimeError('steer_failed',reason,409,{cause:e})}
 }
 resetVendor(vendor:Vendor,p=this.project):Promise<void>{const existing=p.resets.get(vendor);if(existing)return existing;
 let resolve!:()=>void,reject!:(e:unknown)=>void;const reset=new Promise<void>((a,b)=>{resolve=a;reject=b});p.resets.set(vendor,reset);p.processEpoch.set(vendor,(p.processEpoch.get(vendor)??0)+1);this.tokens.revokeVendor(p.generation,vendor);
 const turns=[...p.active.values()].filter(t=>t.vendor===vendor);for(const t of turns)this.cancelTurn(t.pane.id,'reset',p);
 void (async()=>{try{await this.provider(vendor).reset();for(const t of turns)t.releaseReset();resolve()}catch(e){reject(e)}finally{if(p.resets.get(vendor)===reset)p.resets.delete(vendor)}})();return reset
 }
 async setRoute(vendor:Vendor,config:{route?:string;proxy?:string;iface?:string;label?:string;expect?:string},initiator:Initiator){this.requireOwner(initiator);const p=this.project,previous=p.routeJobs.get(vendor);const job=(async()=>{await previous;this.same(p);const result=await this.connections.setRoute(vendor,config.route??'direct',config.proxy??'',config.iface??'',config.label??'',config.expect??'');this.same(p);if(result.processRestartNeeded)await this.resetVendor(vendor,p);return result})();p.routeJobs.set(vendor,job);try{return await job}finally{if(p.routeJobs.get(vendor)===job)p.routeJobs.delete(vendor)}}
 async auth(vendor:Vendor){await this.waitVendor(this.project,vendor);return this.provider(vendor).auth()}
 async models(vendor:Vendor,fallback?:{id:string;label:string}[]){const p=this.project;await this.waitVendor(p,vendor);let models:{id:string;label:string}[];
 try{models=await this.provider(vendor).models()}catch(e){this.same(p);if(!fallback)throw e;models=structuredClone(fallback)}
 this.same(p);if(!models.length&&fallback)models=structuredClone(fallback);p.registry.models[vendor]=models;return models
 }
 async listSessions(id:string){const p=this.project,pane=this.pane(id,p);await this.waitVendor(p,pane.vendor);return this.provider(pane.vendor).listSessions(pane.cwd)}
 async sessionMessages(id:string,sessionId:string){const p=this.project,pane=this.pane(id,p);await this.waitVendor(p,pane.vendor);return this.provider(pane.vendor).sessionMessages(pane.cwd,sessionId)}
 async openSession(id:string,sessionId:string,initiator:Initiator){this.requireOwner(initiator);const p=this.project,pane=this.pane(id,p);free(p,pane,pane.label+' занято: идёт ход');const {revision,vendor,cwd}=pane;const msgs=await this.provider(vendor).sessionMessages(cwd,sessionId);
 this.same(p);if(p.registry.get(id)!==pane||pane.revision!==revision||pane.vendor!==vendor||pane.cwd!==cwd||pane.busy||p.editing.has(id)||p.materializing.has(id))throw new RuntimeError('stale_session','окно изменилось во время чтения сессии');
 free(p,pane,pane.label+' занято: идёт ход');
 pane.sessionId=sessionId;pane.touched=true;pane.revision++;pane.transcript=msgs.map(m=>({role:m.role,text:m.text,ts:0}));pane.seen={};p.state.savePanes(p.registry,p.journal);return {id:sessionId,messages:msgs}
 }
 roleCatalog(){return roleCatalog(this)}
 createSeat(input:CreateSeatInput,initiator:Initiator){return createSeat(this,input,initiator)}
 async ensureSeatMaterialized(id:string,initiator:Initiator,operationId?:string){this.requireOwner(initiator);if(this.project.restoreFailed.has(id))free(this.project,this.pane(id));return ensureSeatMaterialized(this,id,initiator,operationId)}
 async onboard(id:string,initiator:Initiator){this.requireOwner(initiator);if(this.project.restoreFailed.has(id))free(this.project,this.pane(id));return onboard(this,id,initiator)}
 makeRoom(model:string,mode:string,initiator:Initiator){return makeRoom(this,model,mode,initiator)}
 roomSet(input:{model?:unknown;folder?:unknown},initiator:Initiator){return roomSet(this,input,initiator)}
 roomMove(input:{path?:unknown;create?:unknown;git?:unknown},initiator:Initiator){return roomMove(this,input,initiator)}
 assignRoomRole(input:CreateSeatInput,initiator:Initiator){return assignRoomRole(this,input,initiator)}
 chatMeta(id:string){const p=this.current;if(!p||p.closed)return null;const c=p.state.chats.chats[id];return c?meta(p,c):null}
 chatsList(initiator:Initiator){return chatsList(this,initiator)}
 chatGet(id:string,initiator:Initiator){return chatGet(this,id,initiator)}
 chatsNew(input:{pane?:unknown;carry?:unknown},initiator:Initiator){return chatsNew(this,input,initiator)}
 chatsOpen(input:{chat?:unknown;carry?:unknown},initiator:Initiator){return chatsOpen(this,input,initiator)}
 handoff(input:{to?:unknown;from?:unknown;kind?:unknown;text?:unknown},initiator:Initiator){return handoff(this,input,initiator)}
 chat(input:Record<string,unknown>,initiator:Initiator){return chat(this,input,initiator)}
 pinsGet(initiator:Initiator){this.requireOwner(initiator);return this.pins.get()}
 async pinSet(input:Parameters<Pins['set']>[0],initiator:Initiator){this.requireOwner(initiator);return this.pins.set(input)}
 settingsGet(initiator:Initiator){this.requireOwner(initiator);return this.settings.get()}
 async settingsPatch(scope:unknown,patch:unknown,initiator:Initiator){this.requireOwner(initiator);return this.settings.patch(scope,patch)}
 async close(){await this.closeProject()}
}
export async function createRuntime(deps:RuntimeDeps,actions:RuntimeActions):Promise<Runtime>{const runtime=new Runtime(deps,actions);await runtime.openProject(deps.projectDir);return runtime}
