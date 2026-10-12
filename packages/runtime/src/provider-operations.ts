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
interface ProviderEvent {provider:string;event:'login'|'check'|'probe';status:'awaiting_approval'|'running'|'done'|'declined'|'error';approvalId?:string;model?:string;turn?:{model:string;usage:Usage;durationMs:number;text:string};error?:{code:string;reason:string}}
const subscriptionPrice={kind:'subscription' as const,label:'расходуется подписка'};
interface Probe {project:ProjectState;id:string;model:string;approval:Approval;controller:AbortController;status:'awaiting_approval'|'running';done:Promise<void>}
export class ProviderOperations {
 private probes=new Map<string,Probe>();private reads=new WeakMap<ProjectState,Set<string>>();
 private runtime:Runtime;readonly catalog:ProviderCatalog;private terminal:LoginTerminal;
 constructor(runtime:Runtime,catalog:ProviderCatalog,terminal:LoginTerminal){this.runtime=runtime;this.catalog=catalog;this.terminal=terminal}
 private owner(who:Initiator){if(!who||who.seat!=='owner'||who.trust!=='owner')throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
 private same(p:ProjectState){if(p.closed||this.runtime.project!==p)throw new RuntimeError('project_changed','Проект сменился',409)}
 private event(p:ProjectState,value:ProviderEvent){if(!p.closed)p.owner.publish({type:'providers',...value,at:this.runtime.clock.now()})}
 private checked(p:ProjectState,id:string){this.event(p,{provider:id,event:'check',status:'done'})}
 async list(who:Initiator){this.owner(who);const p=this.runtime.project,values=await this.catalog.list();this.same(p);const seen=this.reads.get(p)??new Set<string>();for(const v of values){if(v.changed||!seen.has(v.row.id))this.checked(p,v.row.id);seen.add(v.row.id)}this.reads.set(p,seen);return {ok:true as const,providers:values.map(v=>v.row)}}
 async check(id:string,who:Initiator){this.owner(who);const p=this.runtime.project,{row}=await this.catalog.read(id);this.same(p);if(!row.installed){this.event(p,{provider:id,event:'check',status:'error',error:{code:'not_installed',reason:'Программа не установлена'}});throw new RuntimeError('not_installed','Программа не установлена',409)}this.checked(p,id);return {ok:true as const,login:row.login}}
 async login(id:string,who:Initiator){this.owner(who);const p=this.runtime.project,entry=this.catalog.get(id),{row}=await this.catalog.read(id);this.same(p);if(!row.installed)throw new RuntimeError('not_installed','Программа не установлена',409);
 const span=p.trace.record('provider.login_terminal.start',{actor:'owner',data:{id}});
 try{await this.terminal.launch(entry)}catch(e){p.trace.end(span,'provider.login_terminal',{outcome:'failed',reason:traceReason((e as {code?:string}).code,'Терминал не открыт'),data:{id}});this.event(p,{provider:id,event:'login',status:'error',error:{code:e instanceof ProviderError?e.code:'login_terminal_failed',reason:'Терминал не открыт'}});throw e}
 p.trace.end(span,'provider.login_terminal',{actor:'engine',outcome:'ok',data:{id}});this.event(p,{provider:id,event:'login',status:'done'});
 if(!p.closed)p.channel.postCore({to:['owner'],kind:'note',origin:'provider.login_terminal',text:'Команда входа '+id+' открыта в Терминале.'},{seat:'harness',trust:'harness'});return {ok:true as const,command:row.login.command};
 }
 private receipt(job:Probe,model:string){if(model!==job.model)throw new RuntimeError('probe_conflict','Уже ожидается подтверждение '+job.model,409,{fields:{pending:{approvalId:job.approval.id,model:job.model}}});return {ok:true as const,provider:job.id,model:job.model,approvalId:job.approval.id,status:job.status,price:{...subscriptionPrice}}}
 async probe(id:string,model:unknown,who:Initiator){this.owner(who);if(typeof model!=='string'||!model.trim()||model.length>200)throw new RuntimeError('model_required','Выберите модель',400);const p=this.runtime.project;this.catalog.get(id);const previous=this.probes.get(id);if(previous&&previous.project===p)return this.receipt(previous,model);
 const {row,identity}=await this.catalog.read(id);this.same(p);if(!row.installed)throw new RuntimeError('not_installed','Программа не установлена',409);if(!row.capabilities.headless)throw new RuntimeError('capability_unsupported','У программы нет безголового режима',409);if(row.login.state!=='ok')throw new RuntimeError('not_logged_in','Сначала войдите в программу',409);if(!row.models.some(m=>m.id===model))throw new RuntimeError('model_unsupported','Модель отсутствует в каталоге',400);
 // Recheck after metadata await: concurrent clicks share one owner decision and one model call.
 const pending=this.probes.get(id);if(pending&&pending.project===p)return this.receipt(pending,model);
 const approval=new Approval('provider-probe:'+randomUUID(),p.owner,'Один пробный ход · '+row.title+'/'+model,'Цена: расходуется подписка. Один запрос модели; результат появится в карточке подключения.',APPROVAL_TIMEOUT_MS,this.runtime.clock),job:Probe={project:p,id,model,approval,controller:new AbortController(),status:'awaiting_approval',done:Promise.resolve()};
 this.probes.set(id,job);p.owner.approvals.set(approval.id,approval);p.owner.publish(approval.event());this.event(p,{provider:id,model,approvalId:approval.id,event:'probe',status:job.status});job.done=this.finishProbe(job,identity);return this.receipt(job,model);
 }
 private async finishProbe(job:Probe,identity:string|null){const {project:p,id,model,approval,controller}=job;let directory='',span:TraceContext|undefined,outcome:ProviderEvent|undefined;
 try{if(!await approval.future){outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'declined',error:{code:'approval_declined',reason:'Пробный ход не разрешён'}};return}this.same(p);if(controller.signal.aborted)return;
 const {row:fresh,identity:currentIdentity}=await this.catalog.read(id);this.same(p);if(fresh.login.state!=='ok'||currentIdentity!==identity)throw new RuntimeError('login_changed','Вход изменился; подтвердите новый пробный ход',409);if(!fresh.models.some(m=>m.id===model))throw new RuntimeError('model_unsupported','Модель больше недоступна',409);
 job.status='running';this.event(p,{provider:id,model,approvalId:approval.id,event:'probe',status:'running'});span=p.trace.record('turn.start',{actor:'owner',turnInstanceId:randomUUID(),data:{vendor:id,model,action:'provider.probe'}});
 directory=await mkdtemp(join(tmpdir(),'harnessy-probe-'));this.same(p);let terminal:Extract<TurnEvent,{type:'done'}>|null=null,providerFailed=false;const toolSpans=new Map<string,TraceContext>();
 const denied=async()=>({ok:false as const,code:'probe_read_only',error:'Пробный ход не изменяет проект и не обращается к участникам'});
 const ctx:CliContext={signal:controller.signal,env:id==='claude'||id==='codex'?this.runtime.connections.proxyEnv(id):{},roleNote:'Проверка подключения. Ответь одним словом: готов. Не читай файлы, не выполняй команды и не вызывай инструменты.',peers:[],writableRoots:[],projectDir:null,appUrl:this.runtime.deps.appUrl,relayDepth:0,
 tools:{send:denied,ask:denied,readPane:denied,merge:denied,assignRole:denied,proposeSeats:denied,createSeats:denied},askApproval:async()=>false,session(){},setHandle(){},registerProcessToken(){},revokeProcessToken(){},
 publish:event=>{if(event.type==='done')terminal=event;else if(event.type==='error')providerFailed=true},
 traceEvent:(event:ToolTrace)=>{if(event.phase==='call')toolSpans.set(event.id,p.trace.record('tool.call',{data:{name:event.name,args:event.data}},span));else{const call=toolSpans.get(event.id);if(call)p.trace.end(call,'tool.result',{outcome:event.outcome??'ok',data:{name:event.name,result:event.data}});toolSpans.delete(event.id)}},modelStarted:()=>p.trace.record('provider.start',{data:{vendor:id,model}},span)};
 const binding=Object.freeze({project:p,provider:id,model,account:identity,approvalId:approval.id});
 const bound=(run:{provider:string;model:string})=>{this.same(binding.project);if(controller.signal.aborted||this.probes.get(binding.provider)!==job||job.approval.id!==binding.approvalId||job.status!=='running')throw new ProviderError('cancelled','Пробный ход отменён');if(run.provider!==binding.provider||run.model!==binding.model)throw new ProviderError('login_changed','Привязка пробного хода изменилась')};
 ctx.beforeModel=async run=>{bound(run);const auth=await this.catalog.get(binding.provider).auth();bound(run);if(binding.account===null||this.catalog.accountIdentity(auth)!==binding.account)throw new ProviderError('login_changed','Вход изменился; подтвердите новый пробный ход')};
 // Covers custom entries; process providers repeat the same binding check after their own awaits.
 await ctx.beforeModel({provider:id,model});
 const started=this.runtime.clock.now(),result=await this.catalog.get(id).runTurn({id:'provider-probe',vendor:id,label:'Проверка подключения',model,mode:'read',cwd:directory,writePaths:[],worktree:null,sessionId:null},'Ответь одним словом: готов.',ctx);this.same(p);if(controller.signal.aborted||result.interrupted)throw new ProviderError('cancelled','Пробный ход отменён');
 if(providerFailed)throw new ProviderError('turn_failed','Пробный ход завершился с ошибкой');const done=terminal as Extract<TurnEvent,{type:'done'}>|null;if(!done||done.model!==model)throw new ProviderError('protocol','Программа не подтвердила результат хода');const usage:Usage=done.usage;
 if(!usage||[usage.input,usage.output,usage.cacheRead].some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0)))throw new ProviderError('protocol','Программа не подтвердила расход');
 const turn={model,usage,durationMs:Math.max(0,this.runtime.clock.now()-started),text:result.text.slice(0,2000)};p.trace.end(span,'turn.done',{outcome:'ok',durationMs:turn.durationMs,data:{vendor:id,model,usage}});span=undefined;outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'done',turn};
 }catch(e){if(span)p.trace.end(span,'turn.failed',{outcome:controller.signal.aborted?'cancelled':'failed',reason:traceReason((e as {code?:string}).code,'Пробный ход не завершён'),data:{vendor:id,model}});const code=e instanceof RuntimeError||e instanceof ProviderError?e.code:'probe_failed';outcome={provider:id,model,approvalId:approval.id,event:'probe',status:'error',error:{code,reason:code==='login_changed'?'Вход изменился; подтвердите новый пробный ход':'Пробный ход не выполнен'}}}
 finally{try{if(directory)await rm(directory,{recursive:true,force:true})}catch{p.trace.record('provider.cleanup',{outcome:'failed',reason:{code:'storage',text:'Временная папка пробы не удалена'},data:{id}})}finally{if(this.probes.get(id)===job)this.probes.delete(id);if(outcome)this.event(p,outcome)}}
 }
 async cancel(p:ProjectState){const jobs=[...this.probes.values()].filter(j=>j.project===p);for(const j of jobs){j.controller.abort();j.approval.finish('deny')}await Promise.all(jobs.map(j=>j.done))}
 async close(){await this.catalog.close();await this.terminal.close()}
}
