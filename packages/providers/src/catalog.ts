import {CliProvider} from './cli/provider.ts';
import {readCliMetadata,readCliFileMetadata} from './cli/query.ts';
import {ANTIGRAVITY} from './antigravity.ts';
import {COPILOT} from './copilot.ts';
import {GEMINI} from './gemini.ts';
import {KIMI} from './kimi.ts';
import {QWEN} from './qwen.ts';
import {executeCli} from './cli/process.ts';
import {createHmac,randomBytes} from 'node:crypto';
import {ProviderError,record,providerId,type Provider,type Vendor,type TurnContext,type ProviderLimits,type TurnModes,type TurnModeSupport} from './types.ts';
import type {CliDescriptor,CliUnavailableDescriptor,CliDependencies,CliSeat,CliContext,CliAuth,CliModel,CliCommand} from './cli/types.ts';

/** Subscription descriptors are added here by TS-20b/c; credentials are never stored here. */
export const CLI_DESCRIPTORS:readonly (CliDescriptor|CliUnavailableDescriptor)[]=[ANTIGRAVITY,COPILOT,GEMINI,KIMI,QWEN];
export interface CatalogLogin {state:'ok'|'none'|'unknown'|'error';account?:string;command:string;checkedAt?:number;reason?:string}
// Public checkedAt and SSE at are epoch milliseconds (durationMs is elapsed milliseconds).
export interface CatalogRow {id:string;title:string;kind:'subscription'|'apikey'|'local';binary:string;installed:boolean|null;checking:boolean;version:string|null;login:CatalogLogin;models:CliModel[];modelsReason?:string;capabilities:{headless:boolean;resume:boolean;mcp:boolean;limits:boolean;turn?:TurnModes;probe?:TurnModeSupport};limits?:{ref:string};routes?:string;reason?:string}
export interface CatalogRead {row:CatalogRow;changed:boolean;identity:string|null}
export const CATALOG_TTL_MS=300_000;
export interface CatalogEntry {
 id:string;title:string;binary:string;login:CliCommand;forbiddenEnv:readonly string[];capabilities:CatalogRow['capabilities'];routes?:string;
 allowUnverifiedLogin?:boolean;probeMode?:'read'|'all';unavailableReason?:string;modelsReason?:string;staticModels?:readonly CliModel[];
 version():Promise<string>;auth():Promise<CliAuth>;models():Promise<CliModel[]>;
 limits?(signal?:AbortSignal):Promise<ProviderLimits>;
 runTurn(seat:CliSeat,message:string,ctx:CliContext):Promise<{text:string;sessionId:string|null;interrupted?:boolean}>;
 reset?():Promise<void>;listSessions?:Provider['listSessions'];sessionMessages?:Provider['sessionMessages'];
 close?():Promise<void>;
}
export const shellQuote=(text:string)=>"'"+text.replaceAll("'","'\\''")+"'";
export function loginCommand(entry:CatalogEntry){return [entry.binary,...entry.login.args].map(shellQuote).join(' ')}
export const unsupportedTurns=(reason:string):TurnModes=>({read:{ok:false,reason},edit:{ok:false,reason},all:{ok:false,reason}});
const cliTurns=(d:CliDescriptor):TurnModes=>Object.fromEntries(['read','edit','all'].map(mode=>[mode,d.turnUnavailableReason?{ok:false,reason:d.turnUnavailableReason}:typeof d.modes[mode as 'read']==='function'?{ok:true,...(d.turnNotes?.[mode as 'read']?{note:d.turnNotes[mode as 'read']}:{})}:{ok:false,reason:d.turnReasons?.[mode as 'read']??'Программа не гарантирует режим '+mode}])) as TurnModes;
const safeText=(v:unknown):v is string=>typeof v==='string'&&!!v&&!/[\x00-\x1f\x7f]/.test(v);
const maskAccount=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,1)+'•••'+(value.includes('@')?'@'+value.split('@').at(-1):''):undefined;
export function cliEntry(description:CliDescriptor|CliUnavailableDescriptor,deps:Partial<CliDependencies>={}):CatalogEntry{
 if('unavailableReason'in description){
  const d=description,options={...deps,env:{...(deps.env??process.env)}},reason=d.unavailableReason;
  if(!safeText(reason)||'unavailableReason'in d.auth&&!safeText(d.auth.unavailableReason)||'list'in d.models&&!safeText(d.models.reason))throw new ProviderError('protocol','Нет причины недоступности хода');
  return {id:d.id,title:d.name,binary:d.binary,login:{args:[...d.login.args]},forbiddenEnv:[...d.forbiddenEnv],capabilities:{...d.capabilities,turn:unsupportedTurns(reason),probe:{ok:false,reason}},unavailableReason:reason,...('list'in d.models?{modelsReason:d.models.reason,staticModels:d.models.list}:{}),
   version:()=>readCliMetadata(d.binary,d.forbiddenEnv,d.version,options),auth:()=> 'unavailableReason'in d.auth?Promise.resolve({loggedIn:false,state:'unknown' as const,reason:d.auth.unavailableReason}):'file'in d.auth?readCliFileMetadata(d.auth,options.env):readCliMetadata(d.binary,d.forbiddenEnv,d.auth,options),models:()=> 'list'in d.models?Promise.resolve(d.models.list.map(m=>({...m}))):readCliMetadata(d.binary,d.forbiddenEnv,d.models,options),
   runTurn:async()=>{throw new ProviderError('capability_unsupported',reason)}};
 }
 const p=new CliProvider(description,deps),turn=cliTurns(description),probeMode=turn.read.ok?'read':'all',probe:TurnModeSupport=turn[probeMode].ok?{ok:true,...(probeMode==='all'?{note:description.noHarnessMcp?'полный доступ, без инструментов Harnessy':'полный доступ'}:{})}:{ok:false,reason:turn[probeMode].reason??'Нет режима пробного хода'};return {id:p.vendor,probeMode,...(description.allowUnverifiedLogin?{allowUnverifiedLogin:true}:{}),title:description.name,binary:description.binary,login:{args:[...description.login.args]},forbiddenEnv:[...description.forbiddenEnv],capabilities:{headless:true,resume:!!description.resume&&!description.turnUnavailableReason,mcp:!!description.mcp&&!description.turnUnavailableReason,limits:!!description.limits,turn,probe},...(description.turnUnavailableReason?{unavailableReason:description.turnUnavailableReason}:{}),...('list'in description.models?{staticModels:description.models.list,modelsReason:description.models.reason}:{}),version:()=>p.version(),auth:()=>p.auth(),models:()=>p.models(),...(description.limits?{limits:(signal?:AbortSignal)=>p.limits(signal)}:{}),runTurn:(s,m,c)=>p.runTurn(s,m,c),reset:()=>p.reset(),listSessions:cwd=>p.listSessions(cwd),sessionMessages:(cwd,id)=>p.sessionMessages(cwd,id),close:()=>p.close()};
}
export function builtinEntries(providers:Partial<Record<Vendor,Provider>>,models:Partial<Record<Vendor,{id:string;label?:string}[]>>,deps:Partial<CliDependencies>={}):CatalogEntry[]{
 return (['claude','codex'] as const).flatMap(id=>{const p=providers[id];if(!p)return [];const binary=deps.env?.[id==='claude'?'CLAUDE_BIN':'CODEX_BIN']||process.env[id==='claude'?'CLAUDE_BIN':'CODEX_BIN']||id;
 return [{id,title:id==='claude'?'Claude Code':'Codex',binary,login:{args:['login']},forbiddenEnv:id==='claude'?['ANTHROPIC_API_KEY','CLAUDECODE','CLAUDE_CODE_SIMPLE']:['OPENAI_API_KEY'],capabilities:{headless:true,resume:true,mcp:true,limits:!!p.limits,probe:{ok:true},turn:{read:{ok:true},edit:{ok:true},all:{ok:true},chat:{ok:true},check:{ok:true},web:{ok:true},ask:{ok:true}}},routes:'/api/connections#'+id,
 version:async()=>{const r=await (deps.execute??executeCli)({binary,args:['--version'],cwd:deps.cwd??process.cwd(),env:deps.env??process.env,timeoutMs:5000,maxBytes:8192},AbortSignal.timeout(5000));if(r.code!==0||r.signal)throw new ProviderError('protocol','Версия программы не прочитана');return r.stdout.trim()},
 auth:async()=>{const a=await p.auth();return {loggedIn:a.loggedIn,...(typeof a.email==='string'?{email:a.email}:{}),...(typeof a.plan==='string'?{plan:a.plan}:{})}},
 models:async()=>{const found=await p.models();return (found.length?found:models[id]??[]).map(m=>({id:m.id,label:m.label||m.id}))},
 runTurn:(s:CliSeat,m:string,c:CliContext)=>{if(s.vendor!==id)throw new ProviderError('protocol','Несовпадение провайдера');return p.runTurn({...s,vendor:id},m,{...c,peers:c.peers as TurnContext['peers']})}}];
 });
}
/** Metadata reads never run a model or launch login. Public rows contain no credentials. */
export class ProviderCatalog {
 private entries=new Map<string,CatalogEntry>();private snapshots=new Map<string,CatalogRow>();private reading=new Map<string,Promise<{row:CatalogRow;changed:boolean;identity:string|null}>>();
 private identities=new Map<string,string|null>();private salt=randomBytes(32);
 private pending=new Map<string,number>();private attempts=new Map<string,number>();private listeners=new Set<(value:CatalogRead)=>void>();private closed=false;private now:()=>number;
 constructor(entries:readonly CatalogEntry[]=[],now:()=>number=()=>Date.now()){this.now=now;for(const e of entries){if(!e||!providerId(e.id)||this.entries.has(e.id)||!safeText(e.title)||!safeText(e.binary)||!e.login||!Array.isArray(e.login.args)||!e.login.args.every(safeText)||e.login.input!==undefined||!Array.isArray(e.forbiddenEnv)||!e.forbiddenEnv.every(k=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))||!['version','auth','models','runTurn'].every(k=>typeof (e as unknown as Record<string,unknown>)[k]==='function')||!e.capabilities||e.capabilities.probe!==undefined&&(!record(e.capabilities.probe)||typeof e.capabilities.probe.ok!=='boolean'||e.capabilities.probe.ok===false&&!safeText(e.capabilities.probe.reason)||e.capabilities.probe.note!==undefined&&!safeText(e.capabilities.probe.note))||e.capabilities.turn!==undefined&&(!record(e.capabilities.turn)||['read','edit','all'].some(mode=>{const v=e.capabilities.turn?.[mode as 'read'];return !v||typeof v.ok!=='boolean'||v.ok===false&&!safeText(v.reason)||v.note!==undefined&&!safeText(v.note)}))||!['headless','resume','mcp','limits'].every(k=>typeof e.capabilities[k as 'headless']==='boolean'))throw new ProviderError('protocol','Неверный описатель каталога');this.entries.set(e.id,{...e,login:{args:[...e.login.args]},forbiddenEnv:[...e.forbiddenEnv],capabilities:structuredClone(e.capabilities)})}}
 get(id:string){const entry=this.entries.get(id);if(!entry)throw new ProviderError('provider_unknown','Программа отсутствует в каталоге');return entry}
 ids(){return [...this.entries.keys()]}
 peek(id:string):CatalogRow {const old=this.snapshots.get(id);if(old)return {...structuredClone(old),checking:this.pending.has(id)};const e=this.get(id);return {id:e.id,title:e.title,kind:'subscription',binary:e.binary,installed:null,checking:this.pending.has(id),version:null,login:{state:'unknown',command:loginCommand(e),reason:'проверяется…'},models:[],capabilities:{...e.capabilities,turn:e.capabilities.turn??unsupportedTurns('Программа не объявила гарантированные режимы')},...(e.modelsReason?{modelsReason:e.modelsReason}:{}),...(e.unavailableReason?{reason:e.unavailableReason}:{})}}
 snapshot():CatalogRead[]{return this.ids().map(id=>({row:this.peek(id),changed:false,identity:this.identities.get(id)??null}))}
 subscribe(listener:(value:CatalogRead)=>void){this.listeners.add(listener);return ()=>this.listeners.delete(listener)}
 refresh(){if(this.closed)return;for(const id of this.ids()){const at=this.attempts.get(id);if(at===undefined||this.now()-at>=CATALOG_TTL_MS)void (this.reading.get(id)??this.read(id)).catch(()=>{})}}
 provider(id:string):Provider {const e=this.get(id);return {vendor:id,runTurn:(seat,message,ctx)=>e.runTurn(seat,message,ctx),auth:async()=>({...await e.auth()}),models:()=>e.models(),reset:()=>e.reset?.()??Promise.resolve(),close:()=>e.close?.()??Promise.resolve(),listSessions:cwd=>e.listSessions?e.listSessions(cwd):Promise.reject(new ProviderError('capability_unsupported','Программа не предоставляет список сессий')),sessionMessages:(cwd,session)=>e.sessionMessages?e.sessionMessages(cwd,session):Promise.reject(new ProviderError('capability_unsupported','Программа не предоставляет историю сессии'))}}
 limitsEntries(){return [...this.entries.values()].filter(e=>!['claude','codex'].includes(e.id)&&e.capabilities.limits&&typeof e.limits==='function')}
 accountIdentity(auth:CliAuth):string|null{return auth?.loggedIn===true&&typeof auth.email==='string'&&auth.email.trim()?createHmac('sha256',this.salt).update(auth.email.trim().toLowerCase()).digest('hex'):null}
 read(id:string):Promise<CatalogRead>{
  this.get(id);this.pending.set(id,(this.pending.get(id)??0)+1);
  const finish=()=>{const n=(this.pending.get(id)??1)-1;if(n)this.pending.set(id,n);else this.pending.delete(id)};
  const previous=this.reading.get(id)??Promise.resolve(),work=previous.then(()=>this.readNow(id),()=>this.readNow(id)).then(value=>{
   finish();value.row.checking=this.pending.has(id);if(!this.closed)for(const listener of this.listeners)listener(structuredClone(value));return value;
  },error=>{finish();throw error});
  this.reading.set(id,work);void work.finally(()=>{if(this.reading.get(id)===work)this.reading.delete(id)}).catch(()=>{});return work;
 }

 private async readNow(id:string):Promise<{row:CatalogRow;changed:boolean;identity:string|null}>{const e=this.get(id),previous=this.snapshots.get(id),previousIdentity=this.identities.get(id)??null;let identity:string|null=null,authRead=false;let row:CatalogRow;
 row={id:e.id,title:e.title,kind:'subscription',binary:e.binary,installed:false,checking:false,version:null,login:{state:'unknown',command:loginCommand(e)},models:[],capabilities:{...e.capabilities,turn:e.capabilities.turn??unsupportedTurns('Программа не объявила гарантированные режимы')},...(e.capabilities.limits?{limits:{ref:'/api/limits#'+e.id}}:{}),...(e.routes?{routes:e.routes}:{}),...(e.unavailableReason?{reason:e.unavailableReason}:{}),...(e.modelsReason?{modelsReason:e.modelsReason}:{})};
 try{const version=await e.version();row.installed=true;if(!safeText(version)||version.length>128)throw new ProviderError('protocol','Версия программы не прочитана');row.version=version;row.models=e.staticModels?.map(m=>({...m}))??[];
 const auth=await e.auth();if(!record(auth)||typeof auth.loggedIn!=='boolean'||auth.state!==undefined&&(auth.state!=='unknown'||auth.loggedIn)||auth.reason!==undefined&&!safeText(auth.reason))throw new ProviderError('protocol','Состояние входа не прочитано');identity=this.accountIdentity(auth);authRead=true;const account=maskAccount(auth.email);row.login={...row.login,state:auth.state==='unknown'?'unknown':auth.loggedIn?'ok':'none',checkedAt:this.now(),...(account?{account}:{}),...(auth.reason?{reason:auth.reason}:{})};
 if(auth.loggedIn){const ms=await e.models();if(!Array.isArray(ms)||ms.some(m=>!m||!safeText(m.id)||!safeText(m.label))||new Set(ms.map(m=>m.id)).size!==ms.length)throw new ProviderError('models_unavailable','Модели не прочитаны');row.models=ms.map(m=>({id:m.id,label:m.label}))}
 }catch(error){
  const code=error instanceof ProviderError?error.code:'protocol',missing=code==='no_binary',transient=['transport_lost','cancelled','busy'].includes(code);
  const reason=missing?'Программа не установлена':transient?'Временно не удалось обновить данные программы ('+code+')':'Не удалось прочитать программу, вход или список моделей';
  // A failed read is not evidence of logout. Never carry models across an observed account change.
  const sameLogin=!authRead||previousIdentity===identity&&previous?.login.state===row.login.state&&previous?.login.account===row.login.account;
  if(transient&&previous?.installed&&['ok','unknown'].includes(previous.login.state)&&previous.login.checkedAt!==undefined&&sameLogin){
   row=structuredClone(previous);row.login.reason=reason;identity=previousIdentity;
  }else{
   row.installed=!missing;row.login={...(authRead&&!missing?row.login:{}),state:missing?'unknown':'error',command:row.login.command,checkedAt:this.now(),reason};row.models=missing?[]:e.staticModels?.map(m=>({...m}))??[];
  }
 }
 const signature=(v:CatalogRow)=>JSON.stringify({...v,login:{...v.login,checkedAt:0}}),changed=!previous||signature(previous)!==signature(row)||previousIdentity!==identity;
 this.attempts.set(id,this.now());this.snapshots.set(id,row);this.identities.set(id,identity);const value={row:structuredClone(row),changed,identity};
 return value;
 }

 // Notify each completed read immediately; another slow CLI must not delay binding revocation.
 async list(observe?:(value:Awaited<ReturnType<ProviderCatalog['read']>>)=>void){return Promise.all([...this.entries.keys()].map(async id=>{const value=await this.read(id);observe?.(value);return value}))}
 async close(){this.closed=true;this.listeners.clear();await Promise.all([...this.entries.values()].map(e=>e.close?.()))}
}
