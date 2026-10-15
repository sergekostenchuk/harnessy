import {isIP} from 'node:net';
import {validId,validRoute,type Usage} from '@harnessy/llm';
import {safeDiagnostic,hasSecretField,hasPublicSecret} from '@harnessy/providers';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,realpath,rename,lstat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {withPathLock} from '@harnessy/team';

export const TRACE_REASONS=['none','validation','project_changed','approval_policy','owner_denied','provider_error','rate_limited','timeout','cancelled','storage','unavailable','late_response','internal'] as const;
export type TraceReason=typeof TRACE_REASONS[number];
export type TraceOutcome='ok'|'failed'|'rejected'|'timeout'|'cancelled';
export interface TraceRecord {seq:number;ts:string;traceId:string;spanId:string;parentSpanId:string|null;actor:string;kind:string;project:string;chat:string|null;pane:string|null;turnInstanceId:string|null;outcome:TraceOutcome;reason:{code:TraceReason;text:string};refs:{journalSeq?:number;attemptId?:string;proposalId?:string};durationMs:number|null;data:unknown;truncated:boolean}
export interface TraceContext {store:TraceStore;traceId:string;spanId:string;parentSpanId:string|null;chat:string|null;pane:string|null;turnInstanceId:string|null}
export interface TraceInput {traceId?:string;parentSpanId?:string|null;spanId?:string;actor?:string;chat?:string|null;pane?:string|null;turnInstanceId?:string|null;outcome?:TraceOutcome;reason?:{code:TraceReason;text:string};refs?:TraceRecord['refs'];durationMs?:number|null;data?:unknown}
const context=new AsyncLocalStorage<TraceContext>();
export const traceId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const currentTrace=()=>context.getStore();
export function traceReason(code:unknown,text=''):TraceRecord['reason'] {const raw=String(code??'');return {code:TRACE_REASONS.includes(raw as TraceReason)?raw as TraceReason:/approval|policy_denied/.test(raw)?'approval_policy':/rate_limit/.test(raw)?'rate_limited':/timeout/.test(raw)?'timeout':/cancel|interrupt/.test(raw)?'cancelled':/project_|binding_/.test(raw)?'project_changed':/invalid|unknown|protocol|missing/.test(raw)?'validation':/write|storage/.test(raw)?'storage':/unavailable|unsupported/.test(raw)?'unavailable':'provider_error',text:safeDiagnostic(text)}}
function traceText(text:string,project:string,key=''){return safeDiagnostic(text,{project,route:key==='route'})}
// Identity formats are distinct from text redaction. Existing project bindings are checked by the caller.
export function traceBindingId(value:unknown,kind:'chat'|'pane'|'turn'|'proposal'):value is string {
 if(typeof value!=='string')return false;
 if(kind==='turn')return traceId(value);
 if(kind==='proposal')return /^p[0-9a-f]{24}$/.test(value);
 return (kind==='pane'?/^[a-z][a-z0-9_-]{0,30}$/:/^c[0-9a-f]{1,64}$/).test(value);
}
// Free-form payloads are summarized, never copied: tool output may contain credentials without a recognizable prefix.
// HTTP templates come from the engine table. Model/route IDs use the settings schema
// and the shared secret-marker check, not heuristics for file paths or opaque tokens.
function traceMetadataId(value:string,key:string){return !hasPublicSecret(value)&&(key==='model'?validId(value):(key==='vendor'||key==='route')&&validRoute(value))}
const usageCounters:Record<keyof Usage,true>={input:true,output:true,cacheRead:true,cacheWrite:true,totalTokens:true};
// Usage fields are public counters, not credential fields; malformed values remain untrusted.
function secretDataField(key:string,value:unknown){return hasSecretField(key)&&!(Object.hasOwn(usageCounters,key)&&typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)}
// Network-check result fields are public only when their value has the declared shape.
function networkDataField(key:string,value:string){if(hasPublicSecret(value))return false;return key==='ip'?isIP(value)!==0:key==='country'?/^[\p{L}\p{M} .()-]{1,100}$/u.test(value):['exit','from','to'].includes(key)?/^[a-z][a-z0-9_-]{0,63}$/.test(value):key==='checkId'?traceId(value):key==='state'?['starting','up','down','stopped','pending','running','done','failed','skipped','cancelled'].includes(value):false}
function pathId(key:string,value:string){if(hasPublicSecret(value))return false;return key==='paneId'?traceBindingId(value,'pane'):key==='chatId'?traceBindingId(value,'chat'):key==='providerId'||key==='routeId'?validRoute(value):false}
export function traceData(value:unknown,project:string,routes?:ReadonlySet<string>){let truncated=false,budget=2048;const visible=/^(name|action|page|kind|type|status|code|vendor|model|method|route|path|file|filename|binding|id|operationId|proposalId|tool|reason|error)$/;
 const clean=(text:string,key:string)=>traceText(text,project,key);
 const visit=(v:unknown,key='',depth=0):unknown=>{if(depth>4||budget<=0){truncated=true;return '[усечено]'}budget-=8;if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'){if(hasSecretField(key)||!visible.test(key)&&!networkDataField(key,v)&&!pathId(key,v)){truncated=true;return '[усечено: '+v.length+' символов]'}const text=depth===1&&(key==='route'&&routes?.has(v)||traceMetadataId(v,key)||pathId(key,v)||key!=='country'&&networkDataField(key,v))?v:clean(v,key),limit=Math.min(256,budget);budget-=Math.min(text.length,limit);if(text!==v||text.length>limit)truncated=true;return text.slice(0,limit)}if(Array.isArray(v)){if(v.length>16)truncated=true;return v.slice(0,16).map(x=>visit(x,key,depth+1))}if(v&&typeof v==='object'){const entries=Object.entries(v);if(entries.length>24)truncated=true;return Object.fromEntries(entries.slice(0,24).map(([k,x])=>[secretDataField(k,x)?'[секрет]':clean(k,'key').slice(0,60),secretDataField(k,x)?(truncated=true,'[скрыто]'):visit(x,k,depth+1)]))}truncated=true;return '[усечено]'};
 let data:unknown;try{data=visit(value);if(Buffer.byteLength(JSON.stringify(data))>4096){truncated=true;data={info:'[усечено: предел данных 4096 байт]'}}}catch{truncated=true;data={info:'[усечено: данные недоступны]'}}return {data,truncated};
}
// Every write and read selects this schema. The project path comes only from the owning store.
function safeRecord(raw:TraceRecord,project:string,paneExists:(id:string)=>boolean,routes:ReadonlySet<string>):TraceRecord {
 const payload=traceData(raw.data??{},project,routes),reason=traceData({reason:raw.reason?.text??''},project);
 let truncated=raw.truncated===true||payload.truncated||reason.truncated;
 const keep=<T>(value:unknown,valid:(value:unknown)=>boolean,fallback:T):T=>{if(valid(value))return value as T;if(value!==fallback)truncated=true;return fallback};
 const refs:TraceRecord['refs']={};
 if(raw.refs?.journalSeq!==undefined){const value=keep(raw.refs.journalSeq,x=>Number.isSafeInteger(x)&&Number(x)>0,0);if(value)refs.journalSeq=value}
 if(raw.refs?.attemptId!==undefined){const value=keep(raw.refs.attemptId,traceId,null as string|null);if(value)refs.attemptId=value}
 if(raw.refs?.proposalId!==undefined){const value=keep(raw.refs.proposalId,x=>traceBindingId(x,'proposal'),null as string|null);if(value)refs.proposalId=value}
 const paneId=(value:unknown)=>traceBindingId(value,'pane')&&paneExists(value);
 const row:TraceRecord={seq:keep(raw.seq,x=>Number.isSafeInteger(x)&&Number(x)>=0,0),ts:raw.ts,
  traceId:keep(raw.traceId,traceId,randomUUID()),spanId:keep(raw.spanId,traceId,randomUUID()),parentSpanId:keep(raw.parentSpanId,x=>x===null||traceId(x),null),
  actor:keep(raw.actor,x=>typeof x==='string'&&(['owner','engine','window'].includes(x)||x.startsWith('model:')&&paneId(x.slice(6))),'engine'),
  kind:keep(raw.kind,x=>typeof x==='string'&&x.length<=64&&(x==='provider.login_terminal.start'||/^[a-z]+\.[a-z_]+$/.test(x)&&traceText(x,'')===x),'error.internal'),project,
  chat:keep(raw.chat,x=>x===null||traceBindingId(x,'chat'),null as string|null),pane:keep(raw.pane,x=>x===null||paneId(x),null as string|null),turnInstanceId:keep(raw.turnInstanceId,x=>x===null||traceBindingId(x,'turn'),null as string|null),
  outcome:keep(raw.outcome,x=>typeof x==='string'&&['ok','failed','rejected','timeout','cancelled'].includes(x),'failed' as TraceOutcome),
  reason:{code:keep(raw.reason?.code,x=>TRACE_REASONS.includes(x as TraceReason),'internal' as TraceReason),text:String((reason.data as {reason?:string}).reason??'')},refs,
  durationMs:raw.durationMs===null?null:keep(raw.durationMs,x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER,null as number|null),data:payload.data,truncated:false};
 row.truncated=truncated;return row;
}
export class TraceStore {
 readonly project:string;readonly path:string;readonly instanceId=randomUUID();private turns=new Map<string,TraceContext>();private journal=new Map<number,TraceContext>();private options:()=>{enabled:boolean;maxBytes:number};private pending:TraceRecord[]=[];private timer:ReturnType<typeof setTimeout>|undefined;private job=Promise.resolve();private closed=false;private dropped=0;private failure:string|null=null;private now:()=>number;
 private paneExists:(id:string)=>boolean;private routeTemplates:ReadonlySet<string>=new Set();
 // Only the API's static route table supplies these strings; request URLs never register paths.
 setRouteTemplates(paths:readonly string[]){this.routeTemplates=new Set(paths)}
 constructor(project:string,options=()=>({enabled:true,maxBytes:16*1024*1024}),now=Date.now,paneExists:(id:string)=>boolean=()=>true){this.project=project;this.path=join(project,'.harness/state/trace.ndjson');this.options=options;this.now=now;this.paneExists=paneExists}
 get status(){return {enabled:this.options().enabled,maxBytes:this.options().maxBytes,dropped:this.dropped,error:this.failure}}
 run<T>(parent:TraceContext,fn:()=>T):T{return context.run(parent,fn)}
 record(kind:string,input:TraceInput={},parent=currentTrace()):TraceContext {
 const own=parent?.store===this?parent:undefined;
 const row=safeRecord({seq:0,ts:new Date(this.now()).toISOString(),traceId:input.traceId??parent?.traceId??randomUUID(),spanId:input.spanId??randomUUID(),parentSpanId:Object.hasOwn(input,'parentSpanId')?input.parentSpanId??null:parent?.spanId??null,
  actor:input.actor??'engine',kind,project:this.project,chat:Object.hasOwn(input,'chat')?input.chat??null:own?.chat??null,pane:Object.hasOwn(input,'pane')?input.pane??null:own?.pane??null,turnInstanceId:Object.hasOwn(input,'turnInstanceId')?input.turnInstanceId??null:own?.turnInstanceId??null,
  outcome:input.outcome??'ok',reason:input.reason??{code:'none',text:''},refs:input.refs??{},durationMs:input.durationMs??null,data:input.data??{},truncated:false},this.project,this.paneExists,this.routeTemplates);
 const ctx:TraceContext={store:this,traceId:row.traceId,spanId:row.spanId,parentSpanId:row.parentSpanId,chat:row.chat,pane:row.pane,turnInstanceId:row.turnInstanceId};
 if(row.kind==='turn.start'&&ctx.turnInstanceId)this.turns.set(ctx.turnInstanceId,ctx);if(row.kind==='queue.posted'&&row.refs.journalSeq)this.journal.set(row.refs.journalSeq,ctx);for(const map of [this.turns,this.journal])if(map.size>5000)map.delete(map.keys().next().value as never);if(this.closed||!this.options().enabled)return ctx;
 if(this.pending.length>=256){this.dropped++;return ctx}this.pending.push(row);if(!this.timer){this.timer=setTimeout(()=>{this.timer=undefined;void this.flush()},50);this.timer.unref()}return ctx;
 }
 forTurn(id:string|undefined){return id?this.turns.get(id):undefined}
 forJournal(seq:number){return this.journal.get(seq)}
 async restore(){try{const rows=await this.read();for(const row of rows)if(row.kind==='queue.posted'&&Number.isSafeInteger(row.refs.journalSeq)){this.journal.set(row.refs.journalSeq!,{store:this,traceId:row.traceId,spanId:row.spanId,parentSpanId:row.parentSpanId,chat:row.chat,pane:row.pane,turnInstanceId:row.turnInstanceId});if(this.journal.size>5000)this.journal.delete(this.journal.keys().next().value!)}}catch{this.failure='Прежние связи трассы не прочитаны'}}
 parentForJournal(seqs:number[]){for(const seq of seqs){const found=this.journal.get(seq);if(found)return found}return undefined}

 end(span:TraceContext,kind:string,input:TraceInput={}){return this.record(kind,{...input,spanId:span.spanId,parentSpanId:span.parentSpanId},span)}
 async tool<T>(name:string,args:unknown,run:()=>Promise<T>,parent=currentTrace()){const start=this.now(),span=this.record('tool.call',{actor:parent?.pane?'model:'+parent.pane:'engine',data:{name,args}},parent);return this.run(span,async()=>{try{const result=await run(),r=result as {ok?:boolean;code?:string;error?:string;text?:string;proposalId?:string};let receipt:unknown=r;if(r?.text&&r.text.length<65536)try{receipt=JSON.parse(r.text)}catch{}const refs={...(parent?.turnInstanceId?{attemptId:parent.turnInstanceId}:{}),...(typeof (receipt as {proposalId?:unknown})?.proposalId==='string'?{proposalId:(receipt as {proposalId:string}).proposalId}:{})};this.end(span,'tool.result',{refs,outcome:r?.ok===false?'rejected':'ok',reason:r?.ok===false?traceReason(r.code,r.error):{code:'none',text:''},durationMs:this.now()-start,data:{name,result}});return result}catch(e){this.end(span,'tool.result',{outcome:'failed',reason:traceReason((e as Error).name==='ZodError'?'validation':(e as {code?:string}).code,(e as Error).message),durationMs:this.now()-start,data:{name}});throw e}})}
 private async safe(){const root=await realpath(this.project),dir=await realpath(join(this.project,'.harness/state'));if(dir!==join(root,'.harness/state'))throw Error('trace_storage');for(const path of [this.path,this.path+'.1'])try{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('trace_storage')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
 private async rows():Promise<TraceRecord[]>{await this.safe();const rows:TraceRecord[]=[];for(const path of [this.path+'.1',this.path]){let text:string;try{const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{await this.safe();const stat=await fd.stat(),named=await lstat(path),cap=128*1024*1024;if(!stat.isFile()||stat.size>cap||stat.ino!==named.ino||stat.dev!==named.dev)throw Error('trace_storage');const bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const {bytesRead}=await fd.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)break;offset+=bytesRead}text=bytes.subarray(0,offset).toString('utf8')}finally{await fd.close()}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e}for(const line of text.split('\n'))try{const r=JSON.parse(line);if(r.project===this.project&&traceId(r.traceId)&&traceId(r.spanId)&&(r.parentSpanId===null||traceId(r.parentSpanId))&&Number.isSafeInteger(r.seq)&&r.seq>0&&typeof r.ts==='string'&&r.ts.length<=30&&Number.isFinite(Date.parse(r.ts))&&typeof r.kind==='string'&&r.reason&&TRACE_REASONS.includes(r.reason.code)&&typeof r.reason.text==='string'&&r.refs&&['ok','failed','rejected','timeout','cancelled'].includes(r.outcome))rows.push(safeRecord({...r,ts:new Date(r.ts).toISOString()},this.project,this.paneExists,this.routeTemplates))}catch{}}return rows}

 private async diskLock<T>(run:()=>Promise<T>):Promise<T>{const path=this.path+'.lock',deadline=Date.now()+5000;await this.safe();let fd:Awaited<ReturnType<typeof open>>;for(;;){try{fd=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);break}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;let lock;try{lock=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error}try{const st=await lock.stat();if(!st.isFile()||st.size>100)throw Error('trace_storage');const text=await lock.readFile('utf8');let dead=false;try{const pid=JSON.parse(text).pid;if(!Number.isSafeInteger(pid)||pid<1)throw Error();try{process.kill(pid,0)}catch(error){dead=(error as NodeJS.ErrnoException).code==='ESRCH'}}catch{dead=Date.now()-st.mtimeMs>30000}if(dead){try{const named=await lstat(path);if(named.ino===st.ino&&named.dev===st.dev)await unlink(path)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}}finally{await lock.close()}if(Date.now()>=deadline)throw Error('trace_busy');await new Promise(resolve=>setTimeout(resolve,10))}}
 try{await fd!.writeFile(JSON.stringify({pid:process.pid}));return await run()}finally{const own=await fd!.stat();await fd!.close();try{const named=await lstat(path);if(named.ino===own.ino&&named.dev===own.dev)await unlink(path)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
 }
 flush():Promise<void>{if(this.timer){clearTimeout(this.timer);this.timer=undefined}const batch=this.pending.splice(0);if(!batch.length)return this.job;this.job=this.job.then(()=>withPathLock(this.path,()=>this.diskLock(async()=>{
  await this.safe();const rows=await this.rows();let seq=rows.reduce((max,r)=>Math.max(max,r.seq),0),size=0;try{size=(await lstat(this.path)).size}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  const cap=Math.max(16384,Math.floor(this.options().maxBytes/2));let fd:Awaited<ReturnType<typeof open>>|null=null;
  try{for(const row of batch){row.seq=++seq;const line=JSON.stringify(row)+'\n',bytes=Buffer.byteLength(line);
    if(size&&size+bytes>cap){if(fd){await fd.sync();await fd.close();fd=null}await rename(this.path,this.path+'.1');if(size>cap){let kept='',bytes=0;for(const old of [...rows].reverse()){const line=JSON.stringify(old)+'\n',n=Buffer.byteLength(line);if(bytes+n>cap)break;kept=line+kept;bytes+=n}const rotated=await open(this.path+'.1',constants.O_WRONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{await this.safe();const actual=await rotated.stat(),named=await lstat(this.path+'.1');if(!actual.isFile()||actual.ino!==named.ino||actual.dev!==named.dev)throw Error('trace_storage');await rotated.truncate(0);await rotated.writeFile(kept);await rotated.sync()}finally{await rotated.close()}}size=0}
    if(!fd){fd=await open(this.path,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);await this.safe();const actual=await fd.stat(),named=await lstat(this.path);if(!actual.isFile()||actual.ino!==named.ino||actual.dev!==named.dev)throw Error('trace_storage')}await fd.writeFile(line);size+=bytes;
  }await fd?.sync();this.failure=null}finally{await fd?.close()}
 }))).catch(()=>{this.dropped+=batch.length;this.failure='Трасса не сохранена: хранилище недоступно'});return this.job}
 async read(filter:{traceId?:string;since?:number;outcome?:TraceOutcome;journalSeq?:number}={}){await this.flush();const rows=await withPathLock(this.path,()=>this.diskLock(()=>this.rows()));return rows.filter(r=>(!filter.traceId||r.traceId===filter.traceId)&&(!filter.since||Date.parse(r.ts)>=filter.since)&&(!filter.outcome||r.outcome===filter.outcome)&&(!filter.journalSeq||r.refs.journalSeq===filter.journalSeq))}
 async close(){this.closed=true;await this.flush()}
}
