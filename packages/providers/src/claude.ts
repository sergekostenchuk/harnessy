import {execFile} from 'node:child_process';
import {query,listSessions,getSessionMessages,type Options,type SDKUserMessage,type Query} from '@anthropic-ai/claude-agent-sdk';
import {ProviderError,snapshot,approval,record,type Seat,type TurnContext,type Provider} from './types.ts';
import {vendorError,asError} from './errors.ts';
import {waitWithSignal} from './cancellation.ts';
import {claudeBinary,childEnv} from './env.ts';
import {MODES,pathRules,SAFE_BASH,PEER_TOOLS} from './modes.ts';
import {SYSTEM_CHAT,peerNote,claudeTeamNote,toolDetail,mergeMessages} from './text.ts';
import {sdkServer} from './tools.ts';
export interface ClaudeDependencies {
 queryFn:typeof query;listSessionsFn:typeof listSessions;getSessionMessagesFn:typeof getSessionMessages;
 findBinary:()=>Promise<string|null>;authStatus:(binary:string,env:NodeJS.ProcessEnv,signal?:AbortSignal)=>Promise<unknown>;env:NodeJS.ProcessEnv
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
 this.deps={queryFn:query,listSessionsFn:listSessions,getSessionMessagesFn:getSessionMessages,findBinary:()=>claudeBinary(),authStatus,env:process.env,...deps}
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
 const u=record(m.usage)?m.usage:{},num=(v:unknown)=>typeof v==='number'?v:null;
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
 async reset(){for(const a of this.active.values()){a.abort.abort();a.query?.close()}}
 async close(){await this.reset()}
}
