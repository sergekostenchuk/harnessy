import type {NetworkTurn} from './network-relay.ts';
import {turnFailure} from './turn-failure.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ProviderCatalog,LoginTerminal,ProviderError,type CliContext,type Usage,type TurnEvent,type ToolTrace} from '@harnessy/providers';
import type {Initiator} from '@harnessy/journal';
import {Approval,APPROVAL_TIMEOUT_MS} from './pane.ts';
import {RuntimeError} from './errors.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
import {traceReason,type TraceContext} from './trace.ts';
interface ProviderEvent {provider:string;event:'login'|'check'|'probe';status:'awaiting_approval'|'running'|'done'|'declined'|'error';approvalId?:string;model?:string;bindingGen?:number;turn?:{model:string;usage:Usage;durationMs:number;text:string};error?:{code:string;reason:string;durationMs?:number}}
const subscriptionPrice={kind:'subscription' as const,label:'расходуется подписка'};
interface Probe {project:ProjectState;id:string;model:string;bindingGen:number;approval:Approval;controller:AbortController;status:'awaiting_approval'|'running';done:Promise<void>}
type CatalogRead=Awaited<ReturnType<ProviderCatalog['read']>>;
interface ProviderBinding {signature:string;generation:number}
interface ProbeCard {provider:string;bindingGen:number}
const bindingReason='Привязка программы изменилась; подтвердите новый пробный ход';
export class ProviderOperations {
 private probes=new Map<string,Probe>();
 private bindings=new Map<string,Map<string,ProviderBinding>>();
 // Keep the small receipt after completion: a late deny is idempotent and cannot target a newer probe.
 private cards=new WeakMap<ProjectState,Map<string,ProbeCard>>();
 private activeProject:ProjectState|null=null;private unsubscribe:()=>void;
 private runtime:Runtime;readonly catalog:ProviderCatalog;private terminal:LoginTerminal;
 constructor(runtime:Runtime,catalog:ProviderCatalog,terminal:LoginTerminal){this.runtime=runtime;this.catalog=catalog;this.terminal=terminal;this.unsubscribe=catalog.subscribe(value=>{const p=this.activeProject;if(p&&!p.closed){this.observe(p,value);this.checked(p,value.row.id)}})}
 start(p:ProjectState){this.activeProject=p;this.snapshot()}
 private owner(who:Initiator){if(!who||who.seat!=='owner'||who.trust!=='owner')throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
 private same(p:ProjectState){if(p.closed||this.runtime.project!==p)throw new RuntimeError('project_changed','Проект сменился',409)}
 private event(p:ProjectState,value:ProviderEvent){const card=value.approvalId?this.cards.get(p)?.get(value.approvalId):undefined;if(!p.closed)p.owner.publish({type:'providers',...value,bindingGen:card?.bindingGen??this.generation(p,value.provider),at:this.runtime.clock.now()})}
 private generation(p:ProjectState,id:string){return this.bindings.get(p.dir)?.get(id)?.generation??0}
 private observe(p:ProjectState,{row,identity}:CatalogRead){if(p.closed||this.runtime.project!==p)return;if(!row.checking&&row.id!=='claude'&&row.id!=='codex')p.registry.models[row.id]=row.models.map(m=>({...m}));const bindings=this.bindings.get(p.dir)??new Map<string,ProviderBinding>(),previous=bindings.get(row.id),signature=JSON.stringify([identity,row.login.state,row.service?.ok,row.capabilities.turn,[...row.models].sort((a,b)=>a.id.localeCompare(b.id))]);if(!previous||signature!==previous.signature)bindings.set(row.id,{signature,generation:(previous?.generation??0)+1});this.bindings.set(p.dir,bindings)}
 private async read(p:ProjectState,id:string){const value=await this.catalog.read(id);this.same(p);this.observe(p,value);return value}
 private assertBinding(job:Probe){if(this.generation(job.project,job.id)!==job.bindingGen)throw new RuntimeError('binding_changed',bindingReason,409)}
 approve(p:ProjectState,approvalId:string,decision:'allow'|'deny'){
  const card=this.cards.get(p)?.get(approvalId);if(!card)return {ok:false,error:'вопрос уже закрыт'};
  if(decision==='allow'&&card.bindingGen!==this.generation(p,card.provider)){p.owner.resolveApproval(approvalId,false);return {ok:false,code:'binding_changed',error:bindingReason}}
  const ok=p.owner.resolveApproval(approvalId,decision==='allow');return {ok:ok||decision==='deny',error:ok||decision==='deny'?null:'вопрос уже закрыт'};
 }
 private snapshot(){this.catalog.refresh();const p=this.runtime.project;for(const issue of this.catalog.cacheDiagnostics())p.trace.record('provider.catalog_cache',{outcome:'failed',data:{vendor:issue.vendor,code:issue.code},reason:{code:'storage',text:issue.code==='cache_owner'?'Другой владелец файла снимка':issue.code==='cache_permissions'?'Права файла снимка шире 0600':issue.code==='cache_fields'?'Недопустимые поля снимка':'Снимок не прочитан'}});const values=this.catalog.snapshot();for(const value of values)if(value.row.login.checkedAt!==undefined)this.observe(p,value);return values.map(v=>v.row)}
 modelSnapshot(){const rows=this.snapshot();return {models:Object.fromEntries(rows.map(row=>[row.id,row.models])),turnModes:Object.fromEntries(rows.map(row=>[row.id,row.capabilities.turn]))}}
 private checked(p:ProjectState,id:string){this.event(p,{provider:id,event:'check',status:'done'})}
 async list(who:Initiator):Promise<{ok:true;providers:(CatalogRead['row']&{network:Awaited<ReturnType<Runtime['networkRelay']['status']>>})[]}>{this.owner(who);return {ok:true as const,providers:await Promise.all(this.snapshot().map(async row=>({...row,network:await this.runtime.networkRelay.status(row.id)})))}}

 async check(id:string,who:Initiator){this.owner(who);const p=this.runtime.project,{row}=await this.read(p,id);if(row.installed===null||row.checking)throw new RuntimeError('provider_checking',row.login.reason??'Программа проверяется, повторите через несколько секунд',409);if(row.installed!==true){this.event(p,{provider:id,event:'check',status:'error',error:{code:'not_installed',reason:'Программа не установлена'}});throw new RuntimeError('not_installed','Программа не установлена',409)}return {ok:true as const,login:row.login,bindingGen:this.generation(p,id)}}
 async login(id:string,who:Initiator){this.owner(who);const p=this.runtime.project,entry=this.catalog.get(id),{row}=await this.read(p,id);if(row.installed===null||row.checking)throw new RuntimeError('provider_checking',row.login.reason??'Программа проверяется, повторите через несколько секунд',409);if(row.installed!==true)throw new RuntimeError('not_installed','Программа не установлена',409);
 const span=p.trace.record('provider.login_terminal.start',{actor:'owner',data:{id}});
 try{await this.terminal.launch(entry)}catch(e){p.trace.end(span,'provider.login_terminal',{outcome:'failed',reason:traceReason((e as {code?:string}).code,'Терминал не открыт'),data:{id}});this.event(p,{provider:id,event:'login',status:'error',error:{code:e instanceof ProviderError?e.code:'login_terminal_failed',reason:'Терминал не открыт'}});throw e}
 p.trace.end(span,'provider.login_terminal',{actor:'engine',outcome:'ok',data:{id}});this.event(p,{provider:id,event:'login',status:'done'});
 if(!p.closed)p.channel.postCore({to:['owner'],kind:'note',origin:'provider.login_terminal',text:'Команда входа '+id+' открыта в Терминале.'},{seat:'harness',trust:'harness'});return {ok:true as const,command:row.login.command};
 }
 private price(id:string){return this.catalog.get(id).kind==='local'?{kind:'unknown' as const,label:'локальные ресурсы или облачная подписка'}:{...subscriptionPrice}}
 private receipt(job:Probe,model:string){if(model!==job.model)throw new RuntimeError('probe_conflict','Уже ожидается подтверждение '+job.model,409,{fields:{pending:{approvalId:job.approval.id,model:job.model}}});return {ok:true as const,provider:job.id,model:job.model,approvalId:job.approval.id,bindingGen:job.bindingGen,status:job.status,price:this.price(job.id)}}
 async probe(id:string,model:unknown,who:Initiator){this.owner(who);if(typeof model!=='string'||!model.trim()||model.length>200)throw new RuntimeError('model_required','Выберите модель',400);const p=this.runtime.project,entry=this.catalog.get(id);
 if(entry.capabilities.probe?.ok===false)throw new RuntimeError('capability_unsupported',entry.capabilities.probe.reason??'Пробный ход недоступен',409,{fields:{reason:entry.capabilities.probe.reason??'Пробный ход недоступен'}});
 if(entry.unavailableReason)throw new RuntimeError('capability_unsupported',entry.unavailableReason,409,{fields:{reason:entry.unavailableReason}});
 const previous=this.probes.get(id);if(previous&&previous.project===p)return this.receipt(previous,model);
 const {row,identity}=await this.read(p,id);if(row.installed===null||row.checking)throw new RuntimeError('provider_checking',row.login.reason??'Программа проверяется, повторите через несколько секунд',409);if(row.installed!==true)throw new RuntimeError('not_installed','Программа не установлена',409);if(!row.capabilities.headless)throw new RuntimeError('capability_unsupported','У программы нет безголового режима',409);if(row.service?.ok===false)throw new RuntimeError('provider_unavailable',row.service.reason??'Служба программы недоступна',409);if(row.login.state!=='ok'&&!(row.login.state==='unknown'&&row.login.unverifiedAllowed))throw new RuntimeError('not_logged_in','Сначала войдите в программу',409);if(!row.models.some(m=>m.id===model))throw new RuntimeError('model_unsupported','Модель отсутствует в каталоге',400);
 // Recheck after metadata await: concurrent clicks share one owner decision and one model call.
 const pending=this.probes.get(id);if(pending&&pending.project===p)return this.receipt(pending,model);
 const approval=new Approval('provider-probe:'+randomUUID(),p.owner,'Один пробный ход · '+row.title+'/'+model,'Цена: '+this.price(id).label+'. Один запрос модели; результат появится в карточке подключения.'+(row.capabilities.probe?.note?' Режим: '+row.capabilities.probe.note+'.':''),APPROVAL_TIMEOUT_MS,this.runtime.clock),job:Probe={project:p,id,model,bindingGen:this.generation(p,id),approval,controller:new AbortController(),status:'awaiting_approval',done:Promise.resolve()};
 const cards=this.cards.get(p)??new Map<string,ProbeCard>();cards.set(approval.id,{provider:id,bindingGen:job.bindingGen});this.cards.set(p,cards);
 this.probes.set(id,job);p.owner.approvals.set(approval.id,approval);p.owner.publish(approval.event());this.event(p,{provider:id,model,approvalId:approval.id,event:'probe',status:job.status});job.done=this.finishProbe(job,identity);return this.receipt(job,model);
 }
 private async finishProbe(job:Probe,identity:string|null){const {project:p,id,model,approval,controller}=job;let directory='',span:TraceContext|undefined,outcome:ProviderEvent|undefined,started:number|undefined,networkTurn:NetworkTurn|undefined;
 try{if(!await approval.future){this.assertBinding(job);outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'declined',error:{code:'approval_declined',reason:'Пробный ход не разрешён'}};return}this.same(p);this.assertBinding(job);if(controller.signal.aborted)return;
 const {row:fresh,identity:currentIdentity}=await this.read(p,id);if(!(fresh.login.state==='ok'||fresh.login.state==='unknown'&&fresh.login.unverifiedAllowed)||fresh.service?.ok===false||currentIdentity!==identity)throw new RuntimeError('login_changed','Вход изменился; подтвердите новый пробный ход',409);if(!fresh.models.some(m=>m.id===model))throw new RuntimeError('model_unsupported','Модель больше недоступна',409);this.assertBinding(job);
 job.status='running';this.event(p,{provider:id,model,approvalId:approval.id,event:'probe',status:'running'});span=p.trace.record('turn.start',{actor:'owner',turnInstanceId:randomUUID(),data:{vendor:id,model,action:'provider.probe'}});
 started=this.runtime.clock.now();directory=await mkdtemp(join(tmpdir(),'harnessy-probe-'));this.same(p);let terminal:Extract<TurnEvent,{type:'done'}>|null=null,providerFailure:string|null=null;const toolSpans=new Map<string,TraceContext>();
 const denied=async()=>({ok:false as const,code:'probe_read_only',error:'Пробный ход не изменяет проект и не обращается к участникам'});
 const beginNetwork=()=>this.runtime.networkRelay.begin(id,'probe:'+p.dir+'\0'+approval.id,controller.signal);networkTurn=beginNetwork();let effected=false;const failedExits=new Set<string>();
 const ctx:CliContext={modelResponded:()=>{effected=true},signal:networkTurn.signal,env:id==='ollama'?{}:await this.runtime.networkRelay.environment(id,controller.signal,networkTurn)??this.runtime.connections.proxyEnv(id),roleNote:'Проверка подключения. Ответь одним словом: готов. Не читай файлы, не выполняй команды и не вызывай инструменты.',peers:[],writableRoots:[],projectDir:null,stateProjectDir:p.dir,appUrl:this.runtime.deps.appUrl,relayDepth:0,
 tools:{send:denied,ask:denied,readPane:denied,merge:denied,assignRole:denied,proposeSeats:denied,createSeats:denied},askApproval:async()=>false,session(){},setHandle(){},registerProcessToken(){},revokeProcessToken(){},
 publish:event=>{if(event.type==='tool'||event.type==='delta'&&event.text.length>0)effected=true;if(event.type==='done')terminal=event;else if(event.type==='error')providerFailure=event.text},
 traceEvent:(event:ToolTrace)=>{if(event.phase==='call')effected=true;if(event.phase==='warning'){p.trace.record('provider.warning',{data:{code:event.reason,error:event.error}},span);return}if(event.phase==='call')toolSpans.set(event.id,p.trace.record('tool.call',{data:{name:event.name,args:event.data}},span));else{const call=toolSpans.get(event.id);if(call)p.trace.end(call,'tool.result',{outcome:event.outcome??'ok',data:{name:event.name,result:event.data}});toolSpans.delete(event.id)}},modelStarted:()=>p.trace.record('provider.start',{data:{vendor:id,model}},span)};
 const binding=Object.freeze({project:p,provider:id,model,account:identity,approvalId:approval.id});
 const bound=(run:{provider:string;model:string})=>{this.same(binding.project);this.assertBinding(job);if(controller.signal.aborted||this.probes.get(binding.provider)!==job||job.approval.id!==binding.approvalId||job.status!=='running')throw new ProviderError('cancelled','Пробный ход отменён');if(run.provider!==binding.provider||run.model!==binding.model)throw new ProviderError('login_changed','Привязка пробного хода изменилась')};
 ctx.beforeModel=async run=>{bound(run);const entry=this.catalog.get(binding.provider),auth=await entry.auth();bound(run);const unverified=entry.allowUnverifiedProbe===true&&auth.state==='unknown'&&!auth.loggedIn&&binding.account===null;if(!unverified&&(!auth.loggedIn||binding.account===null&&binding.provider!=='antigravity'||binding.account!==null&&this.catalog.accountIdentity(auth)!==binding.account))throw new ProviderError('login_changed','Вход изменился; подтвердите новый пробный ход');if(id!=='ollama'){const relay=await this.runtime.networkRelay.prepare(id,controller.signal,networkTurn);if(relay&&ctx.env.HARNESS_RELAY_PROXY!==relay.url)throw new ProviderError('network_unavailable','Сетевой маршрут изменился; повторите пробу')}bound(run)};
 // Covers custom entries; process providers repeat the same binding check after their own awaits.
 let result:Awaited<ReturnType<Runtime['providerProbeTurn']>>;
 for(;;){const attempt=networkTurn,valid=()=>{if(attempt!==networkTurn||attempt.signal.aborted)throw new ProviderError('cancelled','Попытка завершена')};
  const attemptCtx:CliContext={...ctx,modelResponded:()=>{if(attempt===networkTurn&&!attempt.signal.aborted)effected=true},beforeModel:async run=>{valid();await ctx.beforeModel!(run);valid()},publish:event=>{if(attempt===networkTurn&&!attempt.signal.aborted)ctx.publish(event)},traceEvent:event=>{if(attempt===networkTurn&&!attempt.signal.aborted)ctx.traceEvent?.(event)}};
  try{await attemptCtx.beforeModel!({provider:id,model});result=await attempt.run(async()=>{const output=await this.runtime.providerProbeTurn({id:'provider-probe',vendor:id,label:'Проверка подключения',model,mode:this.catalog.get(id).probeMode??'read',cwd:directory,writePaths:[],worktree:null,sessionId:null},'Ответь одним словом: готов.',attemptCtx);if(output.text&&!attempt.signal.aborted)effected=true;return output});break}
  catch(e){const exit=attempt.hop?.id;if(!attempt.failure||attempt.retryBlocked||effected||controller.signal.aborted||!exit||failedExits.has(exit)||failedExits.size>=32)throw e;failedExits.add(exit);await attempt.close();networkTurn=beginNetwork();ctx.signal=networkTurn.signal;ctx.env=id==='ollama'?{}:await this.runtime.networkRelay.environment(id,controller.signal,networkTurn)??this.runtime.connections.proxyEnv(id);await networkTurn.ready();if(networkTurn.hop&&failedExits.has(networkTurn.hop.id))throw e;terminal=null;providerFailure=null}
 }
 this.same(p);if(controller.signal.aborted||result.interrupted)throw new ProviderError('cancelled','Пробный ход отменён');
 if(providerFailure!==null)throw new ProviderError('turn_failed',providerFailure);const done=terminal as Extract<TurnEvent,{type:'done'}>|null;if(!done||done.model!==model)throw new ProviderError('protocol','Программа не подтвердила результат хода');const usage:Usage=done.usage;
 if(!usage||[usage.input,usage.output,usage.cacheRead].some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0)))throw new ProviderError('protocol','Программа не подтвердила расход');
 const turn={model,usage,durationMs:Math.max(0,this.runtime.clock.now()-started),text:result.text.slice(0,2000)};p.trace.end(span,'turn.done',{outcome:'ok',durationMs:turn.durationMs,data:{vendor:id,model,usage}});span=undefined;outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'done',turn};
 }catch(e){const failure=turnFailure(e,p.dir,started===undefined?0:this.runtime.clock.now()-started);const diagnostic={outcome:controller.signal.aborted?'cancelled' as const:'failed' as const,reason:traceReason(failure.code,failure.reason),durationMs:failure.durationMs,data:{vendor:id,model,code:failure.code,action:'provider.probe'}};if(span)p.trace.end(span,'turn.failed',diagnostic);else p.trace.record('turn.failed',diagnostic);outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'error',error:failure}}
 finally{await networkTurn?.close();try{if(directory)await rm(directory,{recursive:true,force:true})}catch{p.trace.record('provider.cleanup',{outcome:'failed',reason:{code:'storage',text:'Временная папка пробы не удалена'},data:{id}})}finally{if(this.probes.get(id)===job)this.probes.delete(id);if(outcome)this.event(p,outcome)}}
 }
 async cancel(p:ProjectState){const jobs=[...this.probes.values()].filter(j=>j.project===p);for(const j of jobs){j.controller.abort();j.approval.finish('deny')}await Promise.all(jobs.map(j=>j.done))}
 async close(){this.unsubscribe();await this.catalog.close();await this.terminal.close()}
}
