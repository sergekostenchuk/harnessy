import {randomBytes} from 'node:crypto';
import {ProviderError,snapshot,record,limitPlan,limitCredits,type Seat,type TurnContext,type Provider,type Usage,type ProviderLimits,type LimitWindow} from '../types.ts';
import {asError,requireRecord,vendorError} from '../errors.ts';
import {waitWithSignal} from '../cancellation.ts';
import {childEnv} from '../env.ts';
import {codexMode,MODES} from '../modes.ts';
import {CHAT_INSTRUCTIONS,codexTeamNote,mergeMessages} from '../text.ts';
import {RpcClient,spawnTransport,type TransportFactory} from './client.ts';
import {argumentsFor,BASE_OVERRIDES,overrides,userServers,sparkRouter,tomlKey} from './overrides.ts';
import {serverRequest} from './protocol.ts';
interface ProcessRecord {client:RpcClient;cwd:string;peers:string;network:string;token:string;revoke:()=>void}
interface Active {seat:Seat;ctx:TurnContext;client:RpcClient|null;threadId:string|null;turnId:string|null;stopRequested:boolean;reject:(e:ProviderError)=>void}
export function codexLimits(raw:unknown,now=Date.now()/1000,plan:unknown=null):ProviderLimits{
 const invalid:ProviderLimits={ok:false,code:'limits_invalid',reason:'Codex: неполный ответ лимитов подписки'};
 if(!record(raw))return invalid;
 const value=record(raw.rateLimitsByLimitId)&&record(raw.rateLimitsByLimitId.codex)?raw.rateLimitsByLimitId.codex:raw.rateLimits;
 if(!record(value))return invalid;
 const windows:LimitWindow[]=[];
 for(const key of ['primary','secondary']){
 const w=value[key];if(w===null||w===undefined)continue;
 if(!record(w)||typeof w.usedPercent!=='number'||!Number.isFinite(w.usedPercent)||w.usedPercent<0||w.usedPercent>100||!Number.isSafeInteger(w.windowDurationMins)||Number(w.windowDurationMins)<=0||!(w.resetsAt===null||typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&w.resetsAt>0))return invalid;
 const minutes=Number(w.windowDurationMins);windows.push({label:minutes===300?'5 ч':minutes===10080?'неделя':minutes===43200?'месяц':minutes+' мин',percentUsed:w.usedPercent,resetsAt:w.resetsAt,windowMinutes:minutes});
 }
 const credits=value.credits==null?undefined:limitCredits(value.credits),reset=value.rateLimitResetCredits??raw.rateLimitResetCredits;
 if(credits===null||reset!=null&&(!record(reset)||!Number.isSafeInteger(reset.availableCount)||Number(reset.availableCount)<0))return invalid;
 const resetCredits=record(reset)?Number(reset.availableCount):undefined;
 return windows.length||credits||resetCredits!==undefined?{ok:true,plan:limitPlan(value.planType)??limitPlan(plan),windows,fetchedAt:now,source:'Codex app-server',...(credits?{credits}:{}),...(resetCredits!==undefined?{resetCredits}:{})}:{ok:false,code:'limits_unsupported',reason:'Codex: лимиты провайдер не отдаёт'};
}
export interface CodexDependencies {transportFactory:TransportFactory;servers:()=>Promise<string[]>;router:()=>Promise<string[]|null>;env:NodeJS.ProcessEnv;cwd:string}
export class CodexProvider implements Provider {
 readonly vendor='codex' as const;private deps:CodexDependencies;
 private clients=new Map<string,ProcessRecord>();private lists=new Map<string,RpcClient>();private listStarts=new Map<string,Promise<RpcClient>>();private active=new Map<string,Active>();
 private modelsCache:{id:string;label:string}[]|null=null;private generation=0;
 constructor(deps:Partial<CodexDependencies>={}){this.deps={transportFactory:spawnTransport,servers:userServers,router:sparkRouter,env:process.env,cwd:process.cwd(),...deps}}
 private async dispose(id:string,r:ProcessRecord){if(this.clients.get(id)===r)this.clients.delete(id);r.revoke();await r.client.close()}
 private async process(seat:Seat,ctx:TurnContext){
 const network=JSON.stringify(ctx.env);
 const peers=JSON.stringify(ctx.peers.map(p=>[p.id,p.label,p.vendor]).sort((a,b)=>a[0]!.localeCompare(b[0]!)));
 if(ctx.signal.aborted)throw new ProviderError('cancelled','ход отменён');
 const old=this.clients.get(seat.id);if(old&&old.cwd===seat.cwd&&old.peers===peers&&old.network===network&&!old.client.closed)return old.client;
 if(old)await this.dispose(seat.id,old);
 const generation=this.generation,servers=await waitWithSignal(()=>this.deps.servers(),ctx.signal),router=await waitWithSignal(()=>this.deps.router(),ctx.signal);
 if(ctx.signal.aborted||generation!==this.generation)throw new ProviderError('cancelled','ход отменён');
 const token=randomBytes(32).toString('hex');let registered=false,revoked=false;
 const revoke=()=>{if(registered&&!revoked){revoked=true;ctx.revokeProcessToken(token)}};
 let client:RpcClient|null=null;
 try{
 ctx.registerProcessToken(token);registered=true;
 client=new RpcClient(this.deps.transportFactory({cwd:seat.cwd,args:argumentsFor(overrides(seat,ctx,token,servers,router)),env:childEnv('codex',ctx.env,this.deps.env),secrets:[token]}),[token]);
 client.setServerHandler((m,p)=>serverRequest(m,p,ctx,null,null));
 const entry={client,cwd:seat.cwd,peers,network,token,revoke};this.clients.set(seat.id,entry);
 client.onFailure(()=>{if(this.clients.get(seat.id)===entry)this.clients.delete(seat.id);revoke();void entry.client.close().catch(()=>{})});
 await client.initialize(ctx.signal);
 if(generation!==this.generation||ctx.signal.aborted)throw new ProviderError('cancelled','процесс закрыт во время запуска');
 if(client.closed)throw new ProviderError('transport_lost','процесс закрыт во время запуска');
 return client;
 }catch(e){if(this.clients.get(seat.id)?.client===client)this.clients.delete(seat.id);revoke();await client?.close();if(generation!==this.generation)throw new ProviderError('cancelled','процесс закрыт во время запуска');throw e}
 }
 async runTurn(input:Seat,message:string,ctx:TurnContext){
 const seat=snapshot(input,ctx);if(seat.vendor!=='codex')throw new ProviderError('protocol','wrong provider');
 ctx={...ctx,peers:ctx.peers.map(p=>({...p}))};
 const busy=this.active.get(seat.id);if(busy)throw new ProviderError(busy.seat.cwd===seat.cwd?'busy':'cwd_changed',busy.seat.cwd===seat.cwd?'место занято':'папка окна изменилась во время хода',seat.sessionId);
 let resolve!:(value:{text:string;usage:Usage;durationMs:number;interrupted:boolean})=>void,reject!:(e:ProviderError)=>void;
 const ended=new Promise<{text:string;usage:Usage;durationMs:number;interrupted:boolean}>((a,b)=>{resolve=a;reject=b});void ended.catch(()=>{});
 const active:Active={seat,ctx,client:null,threadId:null,turnId:null,stopRequested:false,reject};this.active.set(seat.id,active);
 let ready!:(id:string|null)=>void;const turnReady=new Promise<string|null>(r=>{ready=r});
 let terminal=false,settled=false,sessionId=seat.sessionId,text='',streamed=false;const items:string[]=[];
 let usage:Usage={input:null,output:null,cacheRead:null};let unsubscribe=()=>{},unfailure=()=>{};
 const started=Date.now(),lifetime=new AbortController(),startup=new AbortController();
 const startupContext={...ctx,signal:AbortSignal.any([ctx.signal,startup.signal])};
 const approvalContext={...ctx,signal:AbortSignal.any([ctx.signal,lifetime.signal])};
 const handle={interrupt:async()=>{if(this.active.get(seat.id)!==active||settled)throw new ProviderError('cancelled','ход не активен',sessionId);if(!active.turnId){active.stopRequested=true;startup.abort();return}if(active.client&&active.threadId)await active.client.request('turn/interrupt',{threadId:active.threadId,turnId:active.turnId})},
 steer:async(text:string)=>{if(this.active.get(seat.id)!==active||settled||!active.client||!active.turnId||!active.threadId||ctx.signal.aborted)throw new ProviderError('cancelled','ход не активен',sessionId);
 await active.client.request('turn/steer',{threadId:active.threadId,input:[{type:'text',text}],expectedTurnId:active.turnId})}};
 const stop=()=>{void handle.interrupt().catch(e=>reject(asError(e,sessionId)))};
 ctx.signal.addEventListener('abort',stop,{once:true});
 try{
 ctx.setHandle(handle);if(startupContext.signal.aborted)throw new ProviderError('cancelled','ход отменён',sessionId);
 const client=await this.process(seat,startupContext);active.client=client;
 const account=requireRecord(await client.request('account/read',{refreshToken:false},startupContext.signal),'account response');
 if(account.account===null)throw new ProviderError('not_logged_in','Codex не вошёл в ChatGPT',sessionId);
 const identity=requireRecord(account.account,'account');if(typeof identity.type!=='string')throw new ProviderError('protocol','missing account type',sessionId);
 if(identity.type!=='chatgpt')throw new ProviderError('not_logged_in','Codex не вошёл в ChatGPT',sessionId);
 const mode=codexMode(seat,ctx),block=ctx.roleNote.trim()?ctx.roleNote.trim()+'\n\n':'';
 const params={cwd:seat.cwd,...(seat.model?{model:seat.model}:{}),sandbox:mode.sandbox,approvalPolicy:mode.approvalPolicy,
 developerInstructions:block+(seat.mode==='chat'?CHAT_INSTRUCTIONS:codexTeamNote(seat,ctx)+MODES[seat.mode].tail)};
 const thread= requireRecord(await client.request(seat.sessionId?'thread/resume':'thread/start',seat.sessionId?{threadId:seat.sessionId,...params}:params,startupContext.signal),'thread response');
 const data=requireRecord(thread.thread,'thread');if(typeof data.id!=='string'||!data.id)throw new ProviderError('protocol','missing thread id',sessionId);
 sessionId=data.id;active.threadId=sessionId;ctx.session(sessionId);
 client.setServerHandler(async(m,p)=>{await turnReady;return serverRequest(m,p,this.active.get(seat.id)===active&&!settled?approvalContext:null,active.threadId,active.turnId)});
 const queued:{method:string;params:unknown}[]=[];
 const receive=(method:string,input:unknown)=>{
 if(settled||!['item/agentMessage/delta','item/reasoning/textDelta','item/reasoning/summaryTextDelta','item/started','item/completed','thread/tokenUsage/updated','turn/completed'].includes(method))return;
 try{
 const p=requireRecord(input,'notification');if(typeof p.threadId!=='string'||!p.threadId)throw new ProviderError('protocol','missing notification thread id',sessionId);if(p.threadId!==sessionId)return;
 if(!active.turnId){queued.push({method,params:input});return}
 if(method!=='turn/completed'){if(typeof p.turnId!=='string'||!p.turnId)throw new ProviderError('protocol','missing notification turn id',sessionId);if(p.turnId!==active.turnId)return}
 if(method==='item/agentMessage/delta'){if(typeof p.delta!=='string')throw new ProviderError('protocol','missing delta',sessionId);if(p.delta)ctx.modelResponded?.();text+=p.delta;streamed=true;ctx.publish({type:'delta',text:p.delta})}
 else if(method==='item/reasoning/textDelta'||method==='item/reasoning/summaryTextDelta'){if(typeof p.delta!=='string')throw new ProviderError('protocol','missing reasoning delta',sessionId);if(p.delta)ctx.modelResponded?.()}
 else if(method==='item/started'||method==='item/completed'){
 const item=requireRecord(p.item,'item');if(item.type==='reasoning'||item.type==='agentMessage'&&typeof item.text==='string'&&item.text)ctx.modelResponded?.();
 if(['commandExecution','fileChange','mcpToolCall','webSearch'].includes(String(item.type))&&typeof item.id==='string'){
 const name=item.type==='mcpToolCall'?String(item.server)+'.'+String(item.tool):String(item.type),status=String(item.status??'').toLowerCase(),error=typeof item.error==='string'?item.error:record(item.error)?String(item.error.message??''):'';
 const denied=/declin|deni|reject|approval|permission/.test(status+' '+error.toLowerCase()),failed=denied||status.includes('fail')||!!error||typeof item.exitCode==='number'&&item.exitCode!==0;
 ctx.traceEvent?.({id:item.id,name,phase:method==='item/started'?'call':'result',data:item,outcome:denied?'rejected':failed?'failed':'ok',...(failed?{reason:denied?'approval_policy':'provider_error',error:error||status}:{})});
 }

 if(method==='item/started'){
 if(item.type==='commandExecution')ctx.publish({type:'tool',name:'Bash',detail:(Array.isArray(item.command)?item.command.join(' '):String(item.command??'')).slice(0,200)});
 else if(item.type==='fileChange')ctx.publish({type:'tool',name:'Edit',detail:Array.isArray(item.changes)?item.changes.filter(record).map(c=>String(c.path??'')).join(', ').slice(0,200):''});
 else if(item.type==='mcpToolCall')ctx.publish({type:'tool',name:String(item.server)+'.'+String(item.tool),detail:JSON.stringify(item.arguments??{}).slice(0,200)});
 else if(item.type==='webSearch')ctx.publish({type:'tool',name:'WebSearch',detail:String(item.query??'').slice(0,200)});
 }else if(item.type==='agentMessage'&&typeof item.text==='string')items.push(item.text);
 else if(item.type==='commandExecution'&&(String(item.status).toLowerCase().includes('fail')||typeof item.exitCode==='number'&&item.exitCode!==0))
 ctx.publish({type:'toolError',text:'команда завершилась ('+String(item.status)+', код '+String(item.exitCode)+'): '+String(item.aggregatedOutput??item.output??'').slice(-300)})
 }else if(method==='thread/tokenUsage/updated'){
 const u=record(p.tokenUsage)&&record(p.tokenUsage.last)?p.tokenUsage.last:{},num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const total=num(u.inputTokens),cached=num(u.cachedInputTokens),inconsistent=total!==null&&cached!==null&&cached>total;
 usage={input:total!==null&&cached!==null&&!inconsistent?total-cached:null,output:num(u.outputTokens),cacheRead:inconsistent?null:cached}
 }else if(method==='turn/completed'){
 const turn=requireRecord(p.turn,'turn');if(typeof turn.id!=='string'||!turn.id)throw new ProviderError('protocol','missing terminal turn id',sessionId);if(turn.id!==active.turnId)return;settled=true;
 if(turn.status==='failed'){const error=requireRecord(turn.error,'turn error');if(typeof error.message!=='string')throw new ProviderError('protocol','missing turn error message',sessionId);
 reject(vendorError('codex',error.message,undefined,error.codexErrorInfo,sessionId));}
 else if(turn.status==='completed'||turn.status==='interrupted'){
 if(!streamed){text=items.join('\n');if(text)ctx.publish({type:'delta',text})}
 resolve({text,usage,durationMs:typeof turn.durationMs==='number'?turn.durationMs:Date.now()-started,interrupted:turn.status==='interrupted'})
 }else throw new ProviderError('protocol','invalid terminal status',sessionId)
 }
 }catch(e){settled=true;reject(asError(e,sessionId))}
 };
 unsubscribe=client.onNotification(receive);unfailure=client.onFailure(e=>reject(e));
 if(ctx.beforeModel)await waitWithSignal(()=>ctx.beforeModel!({provider:this.vendor,model:seat.model}),startupContext.signal);
 if(startupContext.signal.aborted)throw new ProviderError('cancelled','ход отменён',sessionId);
 ctx.modelStarted?.();
 const start=requireRecord(await client.request('turn/start',{threadId:sessionId,input:[{type:'text',text:message}],sandboxPolicy:mode.sandboxPolicy,approvalPolicy:mode.approvalPolicy},startupContext.signal),'turn start');
 const turn=requireRecord(start.turn,'turn');if(typeof turn.id!=='string'||!turn.id)throw new ProviderError('protocol','missing turn id',sessionId);
 active.turnId=turn.id;ready(turn.id);for(const q of queued)receive(q.method,q.params);
 if((active.stopRequested||ctx.signal.aborted)&&!settled)await handle.interrupt();
 const result=await ended;terminal=true;ctx.publish({type:'done',sessionId,model:seat.model,durationMs:result.durationMs,usage:result.usage});
 return {text:result.text,sessionId,...(result.interrupted?{interrupted:true}:{})};
 }catch(e){
 const err=startup.signal.aborted?new ProviderError('cancelled','ход отменён',sessionId):asError(e,sessionId);if(!terminal){terminal=true;ctx.publish({type:'error',text:err.vendorText})}
 if(active.client&&(err.code==='transport_lost'||err.code==='protocol'||err.code==='cancelled'||ctx.signal.aborted)){
 const r=this.clients.get(seat.id);if(r?.client===active.client)await this.dispose(seat.id,r)
 }throw err;
 }finally{
 lifetime.abort();startup.abort();ready(null);unsubscribe();unfailure();active.client?.setServerHandler((m,p)=>serverRequest(m,p,null,null,null));
 ctx.signal.removeEventListener('abort',stop);this.active.delete(seat.id);ctx.setHandle(null)
 }
 }
 private async listClient(cwd:string){
 const old=this.lists.get(cwd);if(old)return old;const pending=this.listStarts.get(cwd);if(pending)return pending;
 const promise=this.createListClient(cwd);this.listStarts.set(cwd,promise);try{return await promise}finally{if(this.listStarts.get(cwd)===promise)this.listStarts.delete(cwd)}
 }
 private async createListClient(cwd:string){
 const old=this.lists.get(cwd);if(old)return old;const generation=this.generation;
 const servers=await this.deps.servers(),off=[...BASE_OVERRIDES,'mcp_servers={}'];   // клиент списков/учётной записи без MCP вовсе, как Python: отключение несуществующих panes/sol-spark-router создавало пустые записи → «invalid transport» (живая проба 09.10)
 const client=new RpcClient(this.deps.transportFactory({cwd,args:argumentsFor(off),env:childEnv('codex',{},this.deps.env)}));
 client.setServerHandler((m,p)=>serverRequest(m,p,null,null,null));
 client.onFailure(()=>{
 if(this.lists.get(cwd)===client){this.lists.delete(cwd);if(cwd===this.deps.cwd)this.modelsCache=null}
 void client.close().catch(()=>{})
 });
 try{await client.initialize();if(generation!==this.generation)throw new ProviderError('cancelled','процесс закрыт');if(client.closed)throw new ProviderError('transport_lost','процесс закрыт во время запуска');this.lists.set(cwd,client);return client}
 catch(e){if(this.lists.get(cwd)===client)this.lists.delete(cwd);await client.close();throw e}
 }
 async listSessions(cwd:string){
 try{const client=await this.listClient(cwd);const out:{id:string;title:string;updated:number}[]=[];let cursor:string|null=null;
 do{const p:Record<string,unknown>={cwd,limit:30,...(cursor?{cursor}:{})};const res=requireRecord(await client.request('thread/list',p),'thread list');
 if(!Array.isArray(res.data))throw new ProviderError('protocol','missing thread list data');
 for(const raw of res.data){const t=requireRecord(raw,'thread list item');if(typeof t.id!=='string')throw new ProviderError('protocol','missing thread id');
 let title=typeof t.name==='string'?t.name.trim():'';if(!title){const messages=await this.sessionMessages(cwd,t.id);title=(messages.find(m=>m.role==='me')?.text??'').replace(/\n/g,' ').slice(0,60)}
 out.push({id:t.id,title:title||'(без названия)',updated:typeof t.updatedAt==='number'?t.updatedAt:typeof t.createdAt==='number'?t.createdAt:0})}
 if(res.nextCursor!==null&&typeof res.nextCursor!=='string')throw new ProviderError('protocol','invalid cursor');if(cursor!==null&&cursor===res.nextCursor)throw new ProviderError('protocol','repeated cursor');cursor=res.nextCursor;
 }while(cursor);return out.sort((a,b)=>b.updated-a.updated);
 }catch(e){throw asError(e)}
 }
 async sessionMessages(cwd:string,id:string){
 try{const res=requireRecord(await (await this.listClient(cwd)).request('thread/read',{threadId:id,includeTurns:true}),'thread read');
 const thread=requireRecord(res.thread,'thread');if(!Array.isArray(thread.turns))throw new ProviderError('protocol','missing turns');
 const out:{role:'me'|'ai';text:string}[]=[];
 for(const t of thread.turns){if(!record(t)||!Array.isArray(t.items))throw new ProviderError('protocol','missing items');
 for(const item of t.items){if(!record(item))throw new ProviderError('protocol','invalid item');
 if(item.type==='userMessage'&&Array.isArray(item.content))out.push({role:'me',text:item.content.filter(record).map(c=>typeof c.text==='string'?c.text:'').join('')});
 else if(item.type==='agentMessage'&&typeof item.text==='string')out.push({role:'ai',text:item.text})}
 }return mergeMessages(out);
 }catch(e){throw asError(e)}
 }
 async auth(){const res=requireRecord(await (await this.listClient(this.deps.cwd)).request('account/read',{refreshToken:false}),'account response');
 if(res.account===null)return {loggedIn:false};const a=requireRecord(res.account,'account');
 if(typeof a.type!=='string')throw new ProviderError('protocol','missing account type');return {loggedIn:a.type==='chatgpt',email:a.email??null,plan:a.planType??null}}
 async limits(signal?:AbortSignal):Promise<ProviderLimits>{
 const timeout=AbortSignal.timeout(10000),stop=signal?AbortSignal.any([signal,timeout]):timeout;
 try{const client=await waitWithSignal(()=>this.listClient(this.deps.cwd),stop);const account=await client.request('account/read',{refreshToken:false},stop);if(record(account)&&record(account.account)&&account.account.type==='apiKey')return {ok:false,code:'limits_not_applicable',reason:'Codex: ключ API не имеет окон подписки'};return codexLimits(await client.request('account/rateLimits/read',{},stop),Date.now()/1000,record(account)&&record(account.account)?account.account.planType:null)}
 catch{return {ok:false,code:stop.aborted?'limits_timeout':'limits_unavailable',reason:stop.aborted?'Codex: чтение лимитов отменено или превысило время ожидания':'Codex: лимиты провайдер не отдаёт'}}
 }
 async models(){if(this.modelsCache)return this.modelsCache;try{
 const client=await this.listClient(this.deps.cwd),out:{id:string;label:string}[]=[];let cursor:string|null=null;
 do{const res=requireRecord(await client.request('model/list',cursor?{cursor}:{}),'model list');if(!Array.isArray(res.data))throw new ProviderError('protocol','missing models');
 for(const raw of res.data){const m=requireRecord(raw,'model');if(typeof m.model!=='string'||typeof m.displayName!=='string')throw new ProviderError('protocol','invalid model');out.push({id:m.model,label:m.displayName})}
 if(res.nextCursor!==null&&typeof res.nextCursor!=='string')throw new ProviderError('protocol','invalid models cursor');if(cursor!==null&&cursor===res.nextCursor)throw new ProviderError('protocol','repeated models cursor');cursor=res.nextCursor;
 }while(cursor);if(this.lists.get(this.deps.cwd)===client&&!client.closed)this.modelsCache=out;return out;
 }catch(e){throw new ProviderError('models_unavailable',asError(e).vendorText)}
 }
 async reset(){this.generation++;this.modelsCache=null;const clients=[...this.clients.entries()];this.clients.clear();
 const lists=[...this.lists.values()];this.lists.clear();const starting=[...this.listStarts.values()];this.listStarts.clear();await Promise.allSettled(starting);await Promise.all([...clients.map(([id,r])=>this.dispose(id,r)),...lists.map(c=>c.close())])}
 async close(){await this.reset()}
}
