import {traceReason} from './trace.ts';
import {randomUUID} from 'node:crypto';
import {networkRevision} from '@harnessy/projects';
import {routeModels,catalogModels,type ProviderConfig} from '@harnessy/llm';
import type {Initiator} from '@harnessy/journal';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
import {RuntimeError} from './errors.ts';
import {turnFailure} from './turn-failure.ts';
import {untilAbort} from './agent-cancel.ts';
const OWNER={seat:'owner',trust:'owner'} as const;
const PROMPT='Ответь: да.';
interface Price {kind:'estimate'|'unknown'|'subscription'|'none';label:string;usd?:number}
interface Result {state:'pending'|'running'|'done'|'failed'|'skipped'|'cancelled';ip:string|null;country:string|null;latencyMs:number|null;durationMs:number|null;response:boolean|null;code?:string;reason?:string}
interface Row {provider:string;title:string;exit:string;exitLabel:string;model:string|null;action:string;price:Price;skipNetwork?:boolean;skip?:string;result:Result}
interface Snapshot {network:string|null;routes:string|null;generations:Record<string,number>}
interface Job {revision:number;id:string;project:ProjectState;createdAt:number;state:'preview'|'running'|'done'|'cancelled';rows:Row[];snapshot:Snapshot;controller:AbortController;done:Promise<void>}
const result=():Result=>({state:'pending',ip:null,country:null,latencyMs:null,durationMs:null,response:null});
export class NetworkProviderChecks {
 private runtime:Runtime;private jobs=new WeakMap<ProjectState,Job>();
 constructor(runtime:Runtime){this.runtime=runtime}
 private owner(who:Initiator){if(who?.seat!=='owner'||who.trust!=='owner')throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
 private project(path:unknown){const p=this.runtime.project;if(typeof path!=='string'||path!==p.dir||p.closed)throw new RuntimeError('project_changed','Проект изменился; откройте проверку заново',409);return p}
 private snapshot():Snapshot {const r=this.runtime;return {network:networkRevision(r.settings.network()),routes:networkRevision(r.settings.llmProviders()),generations:Object.fromEntries(r.providerOperations.catalog.ids().map(id=>[id,r.providerOperations.networkBinding(id)]))}}
 private current(job:Job){if(job.controller.signal.aborted)throw new RuntimeError('cancelled','Проверка отменена',409);if(job.project.closed||this.runtime.project!==job.project)throw new RuntimeError('project_changed','Проект изменился',409);if(JSON.stringify(job.snapshot)!==JSON.stringify(this.snapshot()))throw new RuntimeError('binding_changed','Выходы, маршруты или вход программы изменились; подтвердите новый список',409)}
 private value(job:Job){return structuredClone({revision:job.revision,id:job.id,project:job.project.dir,createdAt:job.createdAt,state:job.state,rows:job.rows})}
 private event(job:Job){job.revision++;if(!job.project.closed)job.project.owner.publish({type:'networkCheck',check:this.value(job)})}
 private price(id:string,config:ProviderConfig,model:string):Price {const source=config.catalog??(!config.api&&!config.baseURL?id:undefined);if(!source)return {kind:'unknown',label:'Цена неизвестна · ответ до 1 токена'};const entry=catalogModels(source).find(m=>m.id===model);if(!entry)return {kind:'unknown',label:'Цена неизвестна'};const cost=entry.cost,input=Math.ceil(PROMPT.length/4),usd=(input*cost.input+cost.output)/1e6;return {kind:'estimate',usd,label:'≈ $'+usd.toFixed(8)+' · каталог pi-ai, оценка '+input+' входных + 1 выходной токен; фактический расход может отличаться'}}
 async preview(project:unknown,who:Initiator){this.owner(who);const p=this.project(project);await this.runtime.network.migrate();if(this.project(project)!==p)throw new RuntimeError('project_changed','Проект изменился; откройте проверку заново',409);const old=this.jobs.get(p);if(old?.state==='running')throw new RuntimeError('network_check_busy','Проверка уже идёт; отмените её или дождитесь результата',409);const r=this.runtime,network=r.settings.network(),routes=r.settings.llmProviders(),rows:Row[]=[];
  for(const [provider,ids]of Object.entries(network.chains)){
   let skipNetwork=false,title=provider,model:string|null=null,skip:string|undefined,action='IP и страна → пробный ход',price:Price={kind:'subscription',label:'Входит в подписку, расходует лимит'};
   if(provider.startsWith('api:')){const id=provider.slice(4),config=routes[id];title=config?.displayName??provider;if(!config)skip='Маршрут API удалён';else {const models=r.llm.models(id);model=models[0]?.id??null;if(!model)skip='В маршруте нет моделей';else {price=this.price(id,config,model);const host=new URL(routeModels(id,config)[0]!.baseUrl).hostname;if(['127.0.0.1','localhost','[::1]'].includes(host)){skipNetwork=true;skip='Локальный адрес API не маршрутизируется через выход';}}action='IP и страна → ответ до 1 токена'}}
   else if(provider==='ollama'){skipNetwork=true;skip='Локальный демон Ollama не маршрутизируется; облако проверяйте отдельным API-маршрутом';action='Пропуск';price={kind:'none',label:'Без вызова'}}
   else if(!r.providerOperations.catalog.ids().includes(provider))skip='Программа отсутствует в каталоге';
   else {const row=r.providerOperations.catalog.peek(provider);title=row.title;model=row.models[0]?.id??null;if(row.checking||row.installed===null)skip='Программа проверяется; обновите список позже';else if(!row.installed)skip='Программа не установлена';else if(row.capabilities.probe?.ok===false)skip=row.capabilities.probe.reason??'Пробный ход не поддержан';else if(!model)skip='В каталоге программы нет моделей';}
   if(skip){action=skipNetwork?'Пропуск':'IP и страна · без вызова модели';price={kind:'none',label:'Модель не вызывается'}}
   for(const exit of ids){const definition=network.exits[exit]!;rows.push({provider,title,exit,exitLabel:definition.label,model,action,price,...(skipNetwork?{skipNetwork}:{}),...(skip?{skip}:{}),result:result()})}
  }
  const job:Job={revision:0,id:randomUUID(),project:p,createdAt:Date.now(),state:'preview',rows,snapshot:this.snapshot(),controller:new AbortController(),done:Promise.resolve()};this.jobs.set(p,job);return this.value(job)
 }
 private job(id:unknown,project:unknown){const p=this.project(project),job=this.jobs.get(p);if(typeof id!=='string'||job?.id!==id)throw new RuntimeError('network_check_unknown','Проверка не найдена; откройте новый список',404);return job}
 latest(project:unknown,who:Initiator){this.owner(who);const job=this.jobs.get(this.project(project));return job?this.value(job):null}
 get(id:unknown,project:unknown,who:Initiator){this.owner(who);return this.value(this.job(id,project))}
 start(id:unknown,project:unknown,decision:unknown,who:Initiator){this.owner(who);if(decision!=='allow')throw new RuntimeError('approval_required','Подтвердите список вызовов и цену',400);const job=this.job(id,project);if(job.state!=='preview')return this.value(job);if(Date.now()-job.createdAt>10*60*1000)throw new RuntimeError('approval_expired','Список устарел; откройте новый',409);this.current(job);job.state='running';job.done=this.run(job);this.event(job);return this.value(job)}
 cancel(id:unknown,project:unknown,who:Initiator){this.owner(who);const job=this.job(id,project);if(job.state==='preview'){job.state='cancelled';for(const row of job.rows)row.result={...result(),state:'cancelled',code:'cancelled',reason:'Отменено до запуска'}}else if(job.state==='running')job.controller.abort();this.event(job);return this.value(job)}
 async closeProject(p:ProjectState){const job=this.jobs.get(p);if(job){job.controller.abort();await job.done}}
 private async run(job:Job){const r=this.runtime,p=job.project;for(const row of job.rows){const started=performance.now();let turn:ReturnType<Runtime['networkRelay']['beginCheck']>|undefined;
   try{this.current(job);if(row.skipNetwork){row.result={...result(),state:'skipped',reason:row.skip??'Локальный адрес не маршрутизируется через выход'};continue}const exit=r.settings.network().exits[row.exit]!;row.result.state='running';this.event(job);
    const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(90000)]),guard=()=>{signal.throwIfAborted();this.current(job)};
    turn=r.networkRelay.beginCheck(row.provider,job.id+':'+row.provider+':'+row.exit,row.exit,networkRevision(exit)!,signal,guard);
    await untilAbort(signal,()=>turn!.run(async()=>{
     const check=await r.networkChecks.check(row.exit,networkRevision(exit),{fetch:r.networkRelay.fetch(row.provider),signal});guard();Object.assign(row.result,{ip:check.ip,country:check.country,latencyMs:check.durationMs,...(check.reason?{reason:check.reason}:{})});if(!check.ok||check.state==='mismatch')throw new RuntimeError('exit_check_failed',check.state==='mismatch'?'IP не совпадает с ожидаемым':check.reason??'Выход не подтверждён',409);
     if(row.skip){row.result.state='skipped';row.result.reason=[row.skip,check.reason].filter(Boolean).join(' · ');return}const before=turn!.requests;if(row.provider.startsWith('api:')){let complete=false;for await(const event of r.llm.stream({provider:row.provider.slice(4),model:row.model!,messages:[{role:'user',content:[{type:'text',text:PROMPT}]}],maxTokens:1,reasoning:'off',signal})){guard();if(event.type==='finish'){if(event.reason==='error'||event.reason==='cancelled')throw new RuntimeError(event.failure?.code??'probe_failed',event.failure?.reason??'Модель не подтвердила ответ',409);complete=true}}if(!complete)throw new RuntimeError('stream_closed','Модель не подтвердила завершение ответа',409)}
     else await r.providerOperations.probeExit(row.provider,row.model!,turn!,guard,signal,OWNER);
     guard();row.result.response=true;if(turn!.requests<=before)throw new RuntimeError('network_unverified','Ответ получен, но соединение программы через выбранный выход не наблюдалось',409);
    }));if(!row.skip)row.result.state='done';
   }catch(error){const cancelled=job.controller.signal.aborted||p.closed;const failure=turnFailure(error,p.dir,performance.now()-started);Object.assign(row.result,{state:cancelled?'cancelled':'failed',response:row.result.response===true?true:false,code:cancelled?'cancelled':failure.code,reason:cancelled?'Проверка отменена':failure.reason});}
   finally{await turn?.close();row.result.durationMs=Math.round(performance.now()-started);const value=row.result;p.trace.record('network.provider_check',{outcome:value.state==='done'?'ok':value.state==='cancelled'?'cancelled':value.state==='skipped'?'ok':'failed',durationMs:value.durationMs,reason:traceReason(value.code??'none',value.reason??'Ответ получен'),data:{code:value.code,checkId:job.id,vendor:row.provider,exit:row.exit,model:row.model,ip:value.ip,country:value.country,latencyMs:value.latencyMs,response:value.response,state:value.state}});this.event(job)}
  }job.state=job.controller.signal.aborted||p.closed?'cancelled':'done';this.event(job)
 }
}
