import {CliProvider} from './cli/provider.ts';
import {executeCli} from './cli/process.ts';
import {createHmac,randomBytes} from 'node:crypto';
import {ProviderError,record,type Provider,type Vendor,type TurnContext} from './types.ts';
import type {CliDescriptor,CliDependencies,CliSeat,CliContext,CliAuth,CliModel,CliCommand} from './cli/types.ts';

/** Subscription descriptors are added here by TS-20b/c; credentials are never stored here. */
export const CLI_DESCRIPTORS:readonly CliDescriptor[]=[];
export interface CatalogLogin {state:'ok'|'none'|'unknown'|'error';account?:string;command:string;checkedAt?:number;reason?:string}
// Public checkedAt and SSE at are epoch milliseconds (durationMs is elapsed milliseconds).
export interface CatalogRow {id:string;title:string;kind:'subscription'|'apikey'|'local';binary:string;installed:boolean;version:string|null;login:CatalogLogin;models:CliModel[];capabilities:{headless:boolean;resume:boolean;mcp:boolean;limits:boolean};limits?:{ref:string};routes?:string}
export interface CatalogEntry {
 id:string;title:string;binary:string;login:CliCommand;forbiddenEnv:readonly string[];capabilities:CatalogRow['capabilities'];routes?:string;
 version():Promise<string>;auth():Promise<CliAuth>;models():Promise<CliModel[]>;
 runTurn(seat:CliSeat,message:string,ctx:CliContext):Promise<{text:string;sessionId:string|null;interrupted?:boolean}>;
 close?():Promise<void>;
}
export const shellQuote=(text:string)=>"'"+text.replaceAll("'","'\\''")+"'";
export function loginCommand(entry:CatalogEntry){return [entry.binary,...entry.login.args].map(shellQuote).join(' ')}
const safeText=(v:unknown):v is string=>typeof v==='string'&&!!v&&!/[\x00-\x1f\x7f]/.test(v);
const maskAccount=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,1)+'•••'+(value.includes('@')?'@'+value.split('@').at(-1):''):undefined;
export function cliEntry(description:CliDescriptor,deps:Partial<CliDependencies>={}):CatalogEntry{
 const p=new CliProvider(description,deps);return {id:p.vendor,title:description.name,binary:description.binary,login:{args:[...description.login.args]},forbiddenEnv:[...description.forbiddenEnv],capabilities:{headless:true,resume:!!description.resume,mcp:true,limits:!!description.limits},version:()=>p.version(),auth:()=>p.auth(),models:()=>p.models(),runTurn:(s,m,c)=>p.runTurn(s,m,c),close:()=>p.close()};
}
export function builtinEntries(providers:Partial<Record<Vendor,Provider>>,models:Partial<Record<Vendor,{id:string;label?:string}[]>>,deps:Partial<CliDependencies>={}):CatalogEntry[]{
 return (['claude','codex'] as const).flatMap(id=>{const p=providers[id];if(!p)return [];const binary=deps.env?.[id==='claude'?'CLAUDE_BIN':'CODEX_BIN']||process.env[id==='claude'?'CLAUDE_BIN':'CODEX_BIN']||id;
 return [{id,title:id==='claude'?'Claude Code':'Codex',binary,login:{args:['login']},forbiddenEnv:id==='claude'?['ANTHROPIC_API_KEY','CLAUDECODE','CLAUDE_CODE_SIMPLE']:['OPENAI_API_KEY'],capabilities:{headless:true,resume:true,mcp:true,limits:!!p.limits},routes:'/api/connections#'+id,
 version:async()=>{const r=await (deps.execute??executeCli)({binary,args:['--version'],cwd:deps.cwd??process.cwd(),env:deps.env??process.env,timeoutMs:5000,maxBytes:8192},AbortSignal.timeout(5000));if(r.code!==0||r.signal)throw new ProviderError('protocol','Версия программы не прочитана');return r.stdout.trim()},
 auth:async()=>{const a=await p.auth();return {loggedIn:a.loggedIn,...(typeof a.email==='string'?{email:a.email}:{}),...(typeof a.plan==='string'?{plan:a.plan}:{})}},
 models:async()=>{const found=await p.models();return (found.length?found:models[id]??[]).map(m=>({id:m.id,label:m.label||m.id}))},
 runTurn:(s:CliSeat,m:string,c:CliContext)=>{if(s.vendor!==id||c.peers.some(peer=>peer.vendor!=='claude'&&peer.vendor!=='codex'))throw new ProviderError('protocol','Несовпадение провайдера');return p.runTurn({...s,vendor:id},m,{...c,peers:c.peers as TurnContext['peers']})}}];
 });
}
/** Metadata reads never run a model or launch login. Public rows contain no credentials. */
export class ProviderCatalog {
 private entries=new Map<string,CatalogEntry>();private snapshots=new Map<string,CatalogRow>();private reading=new Map<string,Promise<{row:CatalogRow;changed:boolean;identity:string|null}>>();
 private identities=new Map<string,string|null>();private salt=randomBytes(32);
 constructor(entries:readonly CatalogEntry[]=[]){for(const e of entries){if(!e||!safeText(e.id)||!/^[a-z][a-z0-9-]*$/.test(e.id)||this.entries.has(e.id)||!safeText(e.title)||!safeText(e.binary)||!e.login||!Array.isArray(e.login.args)||!e.login.args.every(safeText)||e.login.input!==undefined||!Array.isArray(e.forbiddenEnv)||!e.forbiddenEnv.every(k=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))||!['version','auth','models','runTurn'].every(k=>typeof (e as unknown as Record<string,unknown>)[k]==='function')||!e.capabilities||!['headless','resume','mcp','limits'].every(k=>typeof e.capabilities[k as 'headless']==='boolean'))throw new ProviderError('protocol','Неверный описатель каталога');this.entries.set(e.id,{...e,login:{args:[...e.login.args]},forbiddenEnv:[...e.forbiddenEnv],capabilities:{...e.capabilities}})}}
 get(id:string){const entry=this.entries.get(id);if(!entry)throw new ProviderError('provider_unknown','Программа отсутствует в каталоге');return entry}
 accountIdentity(auth:CliAuth):string|null{return auth?.loggedIn===true&&typeof auth.email==='string'&&auth.email.trim()?createHmac('sha256',this.salt).update(auth.email.trim().toLowerCase()).digest('hex'):null}
 read(id:string):Promise<{row:CatalogRow;changed:boolean;identity:string|null}>{this.get(id);const previous=this.reading.get(id)??Promise.resolve(),work=previous.then(()=>this.readNow(id),()=>this.readNow(id));this.reading.set(id,work);void work.finally(()=>{if(this.reading.get(id)===work)this.reading.delete(id)}).catch(()=>{});return work}
 private async readNow(id:string):Promise<{row:CatalogRow;changed:boolean;identity:string|null}>{const e=this.get(id);let identity:string|null=null;
 const row:CatalogRow={id:e.id,title:e.title,kind:'subscription',binary:e.binary,installed:false,version:null,login:{state:'unknown',command:loginCommand(e)},models:[],capabilities:{...e.capabilities},...(e.capabilities.limits?{limits:{ref:'/api/limits#'+e.id}}:{}),...(e.routes?{routes:e.routes}:{})};
 try{const version=await e.version();row.installed=true;if(!safeText(version)||version.length>128)throw new ProviderError('protocol','Версия программы не прочитана');row.version=version;
 const auth=await e.auth();if(!record(auth)||typeof auth.loggedIn!=='boolean')throw new ProviderError('protocol','Состояние входа не прочитано');identity=this.accountIdentity(auth);const account=maskAccount(auth.email);row.login={...row.login,state:auth.loggedIn?'ok':'none',checkedAt:Date.now(),...(account?{account}:{})};
 if(auth.loggedIn){const ms=await e.models();if(!Array.isArray(ms)||ms.some(m=>!m||!safeText(m.id)||!safeText(m.label))||new Set(ms.map(m=>m.id)).size!==ms.length)throw new ProviderError('models_unavailable','Модели не прочитаны');row.models=ms.map(m=>({id:m.id,label:m.label}))}
 }catch(error){const missing=error instanceof ProviderError&&error.code==='no_binary';row.installed=!missing;row.login={state:missing?'unknown':'error',command:row.login.command,checkedAt:Date.now(),reason:missing?'Программа не установлена':'Не удалось прочитать программу, вход или список моделей'};row.models=[]}
 const previous=this.snapshots.get(id),signature=(v:CatalogRow)=>JSON.stringify({...v,login:{...v.login,checkedAt:0}}),changed=!previous||signature(previous)!==signature(row)||this.identities.get(id)!==identity;this.snapshots.set(id,row);this.identities.set(id,identity);return {row:structuredClone(row),changed,identity};
 }
 async list(){return Promise.all([...this.entries.keys()].map(id=>this.read(id)))}
 async close(){await Promise.all([...this.entries.values()].map(e=>e.close?.()))}
}
