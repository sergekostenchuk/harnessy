import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {query,listSessions,getSessionMessages,type Options,type SDKUserMessage,type Query} from '@anthropic-ai/claude-agent-sdk';
import {ProviderError,snapshot,approval,record,limitPlan,type Seat,type TurnContext,type Provider,type ProviderLimits,type LimitWindow} from './types.ts';
import {vendorError,asError} from './errors.ts';
import {waitWithSignal} from './cancellation.ts';
import {claudeBinary,childEnv} from './env.ts';
import {MODES,pathRules,SAFE_BASH,PEER_TOOLS} from './modes.ts';
import {SYSTEM_CHAT,peerNote,claudeTeamNote,toolDetail,mergeMessages} from './text.ts';
import {sdkServer} from './tools.ts';
export interface ClaudeDependencies {
 queryFn:typeof query;listSessionsFn:typeof listSessions;getSessionMessagesFn:typeof getSessionMessages;
 findBinary:()=>Promise<string|null>;authStatus:(binary:string,env:NodeJS.ProcessEnv,signal?:AbortSignal)=>Promise<unknown>;env:NodeJS.ProcessEnv;
 readOauthLogin:(env:NodeJS.ProcessEnv,signal:AbortSignal)=>Promise<{token:string;plan:string|null}|null>;usageFetch:typeof fetch
}
// Read credentials only inside the product; never return credentials or vendor error bodies.
async function readOauthLogin(env:NodeJS.ProcessEnv,signal:AbortSignal):Promise<{token:string;plan:string|null}|null>{
 if(env.CLAUDE_CODE_OAUTH_TOKEN)return {token:env.CLAUDE_CODE_OAUTH_TOKEN,plan:null};
 let raw:string;
 if(process.platform==='darwin'&&!env.CLAUDE_CONFIG_DIR){raw=await new Promise<string>((resolve,reject)=>execFile('/usr/bin/security',['find-generic-password','-s','Claude Code-credentials','-w'],{signal,timeout:5000,maxBuffer:65536},(error,stdout)=>error?reject(Error('credentials unavailable')):resolve(stdout)))}
 else raw=await readFile(join(env.CLAUDE_CONFIG_DIR||join(env.HOME||homedir(),'.claude'),'.credentials.json'),{encoding:'utf8',signal});
 const data:unknown=JSON.parse(raw),oauth=record(data)&&record(data.claudeAiOauth)?data.claudeAiOauth:null;
 return oauth&&typeof oauth.accessToken==='string'&&oauth.accessToken?{token:oauth.accessToken,plan:limitPlan(oauth.subscriptionType)}:null;
}
export function claudeUsage(raw:unknown,now=Date.now()/1000,plan:string|null=null):ProviderLimits{
 const invalid:ProviderLimits={ok:false,code:'limits_invalid',reason:'Claude: неполный ответ лимитов подписки'};
 if(!record(raw)||!('five_hour'in raw)||!('seven_day'in raw))return invalid;
 const windows:LimitWindow[]=[],specs:[string,string,number][]=[['five_hour','5 ч',300],['seven_day','неделя',10080]];
 for(const key of Object.keys(raw).filter(key=>/^seven_day_[a-z][a-z0-9_]*$/.test(key))){
 const model=key.slice('seven_day_'.length),name=model==='oauth_apps'?'приложения':model.split('_').map(part=>part[0]!.toUpperCase()+part.slice(1)).join(' ');
 specs.push([key,'неделя · '+name,10080]);
 }
 for(const [key,name,minutes] of specs){
 const value=raw[key];if(value===null||value===undefined)continue;
 if(!record(value)||typeof value.utilization!=='number'||!Number.isFinite(value.utilization)||value.utilization<0||value.utilization>100||!(value.resets_at===null||typeof value.resets_at==='string'))return invalid;
 const resetsAt=value.resets_at===null?null:Date.parse(value.resets_at)/1000;if(resetsAt!==null&&(!Number.isFinite(resetsAt)||resetsAt<=0))return invalid;
 windows.push({label:name,percentUsed:value.utilization,resetsAt,windowMinutes:minutes});
 }
 return windows.length?{ok:true,plan:limitPlan(plan),windows,fetchedAt:now,source:'claude.ai /usage'}:{ok:false,code:'limits_unavailable',reason:'Claude: окна подписки пока не опубликованы'};
}
function authStatus(binary:string,env:NodeJS.ProcessEnv,signal?:AbortSignal):Promise<unknown>{
 return new Promise((resolve,reject)=>execFile(binary,['auth','status'],{env,timeout:15000,...(signal?{signal}:{})},(error,stdout)=>{
  try{const value:unknown=JSON.parse(stdout);if(!record(value)||typeof value.loggedIn!=='boolean')throw new Error('invalid auth status');resolve(value)}
  catch{reject(new ProviderError(error&&'code'in error&&error.code==='ENOENT'?'no_binary':'protocol','invalid claude auth status'))}
 }))
}
export function claudeOptions(seat:Seat,ctx:TurnContext,binary:string,env:NodeJS.ProcessEnv):Options{
 const row=MODES[seat.mode],role=ctx.roleNote.trim(),block=role?role+'\n\n':'';
 const allowed=[...PEER_TOOLS,...pathRules(seat,ctx.projectDir),...(['check','edit'].includes(seat.mode)?SAFE_BASH:[])];
 const options:Options={cwd:seat.cwd,pathToClaudeCodeExecutable:binary,settingSources:[],strictMcpConfig:true,includePartialMessages:true,
 env:childEnv('claude',ctx.env,env),mcpServers:{panes:sdkServer(ctx)},tools:[...row.tools],allowedTools:allowed,permissionMode:row.permission,
 systemPrompt:seat.mode==='chat'?block+SYSTEM_CHAT+peerNote(seat,ctx):{type:'preset',preset:'claude_code',append:block+claudeTeamNote(seat,ctx)+row.tail}};
 if(seat.model)options.model=seat.model;if(seat.sessionId)options.resume=seat.sessionId;
 if(seat.mode==='all')options.allowDangerouslySkipPermissions=true;
 else if(seat.mode!=='chat')options.canUseTool=async(name,input,{signal})=>{
 const allow=await approval(ctx,'Claude просит: '+name,toolDetail(input)||JSON.stringify(input).slice(0,300),signal);
 return allow&&!ctx.signal.aborted&&!signal.aborted?{behavior:'allow',updatedInput:input}:{behavior:'deny',message:'владелец отказал'}
 };
 return options;
}
export class ClaudeProvider implements Provider {
 readonly vendor='claude' as const;private active=new Map<string,{query:Query|null;abort:AbortController}>();
 private deps:ClaudeDependencies;
 constructor(deps:Partial<ClaudeDependencies>={}){
 this.deps={queryFn:query,listSessionsFn:listSessions,getSessionMessagesFn:getSessionMessages,findBinary:()=>claudeBinary(),authStatus,env:process.env,readOauthLogin,usageFetch:fetch,...deps}
 }
 async runTurn(input:Seat,message:string,ctx:TurnContext){
 const seat=snapshot(input,ctx);if(seat.vendor!=='claude')throw new ProviderError('protocol','wrong provider');
 if(this.active.has(seat.id))throw new ProviderError('busy','место занято',seat.sessionId);
 let sessionId=seat.sessionId,sessionSeen=false,text='',assistant='',streamed=false,terminal=false;
 const abort=new AbortController();const active={query:null as Query|null,abort};this.active.set(seat.id,active);
 const stop=()=>{void active.query?.interrupt().catch(()=>{});abort.abort()};ctx.signal.addEventListener('abort',stop,{once:true});const started=Date.now();
 const turnContext={...ctx,signal:AbortSignal.any([ctx.signal,abort.signal])};
 const handle={interrupt:async()=>{if(this.active.get(seat.id)!==active||terminal)throw new ProviderError('cancelled','ход не активен',sessionId);if(active.query)await active.query.interrupt();else abort.abort()},
 steer:async(text:string)=>{if(this.active.get(seat.id)!==active||terminal||!active.query||turnContext.signal.aborted)throw new ProviderError('cancelled','ход не активен',sessionId);
 const prompt:SDKUserMessage={type:'user',message:{role:'user',content:text},parent_tool_use_id:null,priority:'now',origin:{kind:'human'}};
 await active.query.streamInput((async function*(){yield prompt})())}};
 let release:()=>void=()=>{};
 try{
 ctx.setHandle(handle);if(ctx.signal.aborted||abort.signal.aborted)throw new ProviderError('cancelled','ход отменён',sessionId);
 const binary=await waitWithSignal(()=>this.deps.findBinary(),turnContext.signal);if(!binary)throw new ProviderError('no_binary','claude не найден; задай CLAUDE_BIN',sessionId);
 const auth=await waitWithSignal(()=>this.deps.authStatus(binary,childEnv('claude',ctx.env,this.deps.env),turnContext.signal),turnContext.signal);if(!record(auth)||typeof auth.loggedIn!=='boolean')throw new ProviderError('protocol','invalid claude auth status',sessionId);
 if(!auth.loggedIn)throw new ProviderError('not_logged_in','Claude не вошёл в учётную запись',sessionId);
 if(ctx.signal.aborted||abort.signal.aborted)throw new ProviderError('cancelled','ход отменён',sessionId);
 const keepOpen=new Promise<void>(resolve=>{release=resolve});
 const first:SDKUserMessage={type:'user',message:{role:'user',content:message},parent_tool_use_id:null};
 const options={...claudeOptions(seat,turnContext,binary,this.deps.env),abortController:abort};
 if(turnContext.signal.aborted)throw new ProviderError('cancelled','ход отменён',sessionId);
 ctx.modelStarted?.();
 active.query=this.deps.queryFn({prompt:(async function*(){yield first;await keepOpen})(),options});
 for await(const raw of active.query){
 const m=raw as unknown;if(!record(m)||typeof m.type!=='string')throw new ProviderError('protocol','invalid Claude message',sessionId);
 const main=m.parent_tool_use_id==null;
 if(main&&typeof m.session_id==='string'&&m.session_id&&!sessionSeen){
 if(seat.sessionId!==null&&seat.sessionId!==m.session_id)throw new ProviderError('protocol','unexpected resumed session',sessionId);
 sessionId=m.session_id;sessionSeen=true;ctx.session(sessionId)
 }
 if(!main||typeof m.session_id==='string'&&sessionId!==null&&m.session_id!==sessionId)continue;
 if(m.type==='stream_event'){
 if(!record(m.event))throw new ProviderError('protocol','invalid stream event',sessionId);
 const delta=m.event.delta;if(m.event.type==='content_block_delta'&&record(delta)&&delta.type==='text_delta'){
 if(typeof delta.text!=='string')throw new ProviderError('protocol','invalid text delta',sessionId);
 streamed=true;text+=delta.text;ctx.publish({type:'delta',text:delta.text})
 }
 }else if(m.type==='assistant'){
 if(!record(m.message)||!Array.isArray(m.message.content))throw new ProviderError('protocol','invalid assistant message',sessionId);
 for(const b of m.message.content){if(!record(b))continue;if(b.type==='text'&&typeof b.text==='string')assistant+=b.text;
 else if(b.type==='tool_use'&&typeof b.name==='string')ctx.publish({type:'tool',name:b.name,detail:toolDetail(b.input)})}
 }else if(m.type==='user'){
 const content=record(m.message)?m.message.content:null;if(Array.isArray(content))for(const b of content)if(record(b)&&b.type==='tool_result'&&b.is_error){
 const detail=typeof b.content==='string'?b.content:Array.isArray(b.content)?b.content.filter(record).map(x=>typeof x.text==='string'?x.text:'').join(' '):'';
 ctx.publish({type:'toolError',text:(detail||'ошибка инструмента').slice(0,300)})
 }
 }else if(m.type==='result'){
 if(typeof m.session_id!=='string'||!m.session_id||typeof m.is_error!=='boolean')throw new ProviderError('protocol','invalid Claude result',sessionId);
 if(sessionId===null){sessionId=m.session_id;ctx.session(sessionId)}
 if(m.is_error||m.subtype!=='success'){
 const vendorText=typeof m.result==='string'&&m.result?m.result:Array.isArray(m.errors)?m.errors.map(String).join('\n'):String(m.subtype??'');
 throw vendorError('claude',vendorText,undefined,undefined,sessionId)
 }
 if(!streamed){text=assistant||(typeof m.result==='string'?m.result:'');if(text)ctx.publish({type:'delta',text})}
 const u=record(m.usage)?m.usage:{},num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 terminal=true;ctx.publish({type:'done',sessionId,model:seat.model,durationMs:typeof m.duration_ms==='number'?m.duration_ms:Date.now()-started,
 usage:{input:num(u.input_tokens),output:num(u.output_tokens),cacheRead:num(u.cache_read_input_tokens)}});break
 }
 }
 if(!terminal)throw new ProviderError('transport_lost','Claude stream ended before result',sessionId);
 return {text,sessionId}
 }catch(e){
 let err=asError(e,sessionId);
 if(ctx.signal.aborted||abort.signal.aborted)err=new ProviderError('cancelled','ход отменён',sessionId);
 else if(!(e instanceof ProviderError)){const known=vendorError('claude',err.vendorText,undefined,undefined,sessionId);err=known.code==='turn_failed'?new ProviderError('transport_lost',err.vendorText,sessionId):known}
 if(!terminal){terminal=true;ctx.publish({type:'error',text:err.vendorText})}throw err;
 }finally{
 abort.abort();release();try{active.query?.close()}catch{}ctx.signal.removeEventListener('abort',stop);this.active.delete(seat.id);ctx.setHandle(null)
 }
 }
 async listSessions(cwd:string){
 try{return (await this.deps.listSessionsFn({dir:cwd,limit:40})).map(s=>({id:s.sessionId,title:(s.firstPrompt||s.customTitle||s.summary||'').trim().replace(/\n/g,' ').slice(0,60)||'(без названия)',updated:s.lastModified/1000})).sort((a,b)=>b.updated-a.updated)}
 catch(e){throw asError(e)}
 }
 async sessionMessages(cwd:string,id:string){
 try{
 const msgs:{role:'me'|'ai';text:string}[]=[];
 for(const m of await this.deps.getSessionMessagesFn(id,{dir:cwd})){
 if(m.parent_tool_use_id!==null||!['user','assistant'].includes(m.type)||!record(m.message))continue;
 const c=m.message.content;if(Array.isArray(c)&&c.some(b=>record(b)&&b.type==='tool_result'))continue;
 const text=typeof c==='string'?c:Array.isArray(c)?c.filter(record).filter(b=>b.type==='text').map(b=>String(b.text??'')).join(''):'';
 msgs.push({role:m.type==='user'?'me':'ai',text})
 }return mergeMessages(msgs)
 }catch(e){throw asError(e)}
 }
 async auth(){const binary=await this.deps.findBinary();if(!binary)throw new ProviderError('no_binary','claude не найден; задай CLAUDE_BIN');
 const a=await this.deps.authStatus(binary,childEnv('claude',{},this.deps.env));if(!record(a)||typeof a.loggedIn!=='boolean')throw new ProviderError('protocol','invalid claude auth status');return {...a,loggedIn:a.loggedIn}}
 async models(){return []}
 async limits(signal?:AbortSignal):Promise<ProviderLimits>{
 const timeout=AbortSignal.timeout(10000),stop=signal?AbortSignal.any([signal,timeout]):timeout;
 let login:{token:string;plan:string|null}|null;
 try{login=await waitWithSignal(()=>this.deps.readOauthLogin(this.deps.env,stop),stop)}catch{return {ok:false,code:stop.aborted?'limits_timeout':this.deps.env.ANTHROPIC_API_KEY?'limits_not_applicable':'limits_auth',reason:stop.aborted?'Claude: чтение лимитов отменено или превысило время ожидания':this.deps.env.ANTHROPIC_API_KEY?'Claude: ключ API не имеет окон подписки':'Claude: вход по подписке недоступен'}}
 if(!login&&this.deps.env.ANTHROPIC_API_KEY)return {ok:false,code:'limits_not_applicable',reason:'Claude: ключ API не имеет окон подписки'};
 if(!login)return {ok:false,code:'limits_auth',reason:'Claude: нужен действующий вход по подписке'};
 try{
 const response=await waitWithSignal(()=>this.deps.usageFetch('https://api.anthropic.com/api/oauth/usage',{headers:{Authorization:'Bearer '+login.token,'anthropic-beta':'oauth-2025-04-20',Accept:'application/json'},redirect:'error',signal:stop}),stop);
 if(response.status===401||response.status===403)return {ok:false,code:'limits_auth',reason:'Claude: вход по подписке истёк или недоступен'};
 if(response.status===429)return {ok:false,code:'limits_rate_limited',reason:'Claude: сервис лимитов просит повторить позже'};
 if(!response.ok)return {ok:false,code:'limits_unavailable',reason:'Claude: сервис лимитов временно недоступен'};
 return claudeUsage(await waitWithSignal(()=>response.json(),stop),Date.now()/1000,login.plan);
 }catch{return {ok:false,code:stop.aborted?'limits_timeout':'limits_unavailable',reason:stop.aborted?'Claude: чтение лимитов отменено или превысило время ожидания':'Claude: сервис лимитов временно недоступен'}}
 }
 async reset(){for(const a of this.active.values()){a.abort.abort();a.query?.close()}}
 async close(){await this.reset()}
}
