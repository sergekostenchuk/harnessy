import {readCliMetadata} from './cli/query.ts';
import {OllamaModels,ollamaRequest,OLLAMA_URL,OLLAMA_CLOUD_REASON,isOllamaCloudModel} from './ollama-models.ts';
export {OLLAMA_URL} from './ollama-models.ts';
import {ProviderError,record,type TurnModes} from './types.ts';
import {API_TURN_MODES} from './modes.ts';
import type {CliDependencies,CliAuth,CliModel} from './cli/types.ts';
import type {CatalogEntry,CatalogService} from './catalog.ts';
export const OLLAMA_LOGIN_UNKNOWN='локальный демон · вход не требуется';
// Measured 2026-10-12: --version 16 ms, /api/version 10 ms, /api/tags 6 ms. No inference in discovery.
export const OLLAMA_TIMEOUT_MS=3000;
const forbidden=['OLLAMA_API_KEY','OLLAMA_HOST','OLLAMA_BASE_URL','OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_OSS_BASE_URL','CODEX_OSS_PORT'];
// Only OS/process context is inherited. Provider addresses, proxy variables and turn env cannot override loopback.
const ambientNames=new Set(['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','TMP','TEMP','LANG','LC_ALL','LC_CTYPE','TERM','COLORTERM','NO_COLOR','SSH_AUTH_SOCK','__CF_USER_TEXT_ENCODING','SystemRoot','SYSTEMROOT']);
const ambientEnv=(env:NodeJS.ProcessEnv)=>Object.fromEntries(Object.entries(env).filter(([key,value])=>ambientNames.has(key)&&value!==undefined));
const versionText=(v:unknown):v is string=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v);
// CLI reports its client version as a warning when the daemon is absent or differs.
// https://github.com/ollama/ollama/blob/main/cmd/cmd.go (versionHandler)
export function ollamaVersion(raw:string):string{let server='',client='';for(const line of raw.trim().split(/\r?\n/)){if(line==='Warning: could not connect to a running Ollama instance')continue;const match=/^(ollama version is|Warning: client version is) (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(line);if(!match)throw new ProviderError('protocol','Ollama: неверная версия программы');if(match[1]==='ollama version is'){if(server)throw new ProviderError('protocol','Ollama: неоднозначная версия');server=match[2]!}else{if(client)throw new ProviderError('protocol','Ollama: неоднозначная версия');client=match[2]!}}if(!client&&!server)throw new ProviderError('protocol','Ollama: версия отсутствует');return client||server}
export interface OllamaOptions extends Partial<CliDependencies>{fetch?:typeof fetch;binary?:string;httpTimeoutMs?:number}
export class OllamaProvider {
 private options:OllamaOptions;private modelCatalog:OllamaModels;
 get modelsReason(){return this.modelCatalog.reason}
 constructor(options:OllamaOptions={}){this.options=options;this.modelCatalog=new OllamaModels(options.fetch??fetch,options.httpTimeoutMs??OLLAMA_TIMEOUT_MS)}
 async close(){}
 private async read(path:string,signal?:AbortSignal){try{return await ollamaRequest(this.options.fetch??fetch,OLLAMA_URL+path,this.options.httpTimeoutMs??OLLAMA_TIMEOUT_MS,signal)}catch(e){if(e instanceof ProviderError&&e.code==='transport_lost')throw new ProviderError(e.code,'демон не запущен · '+e.vendorText+'; запустите ollama serve');throw e}}
 async prepareModel(model:string,signal:AbortSignal){await this.modelCatalog.prepare(model,signal)}
 async service():Promise<CatalogService>{try{const v=await this.read('/api/version');if(!record(v)||!versionText(v.version))throw new ProviderError('protocol','Ollama: неверная версия демона');return {ok:true,version:v.version}}catch(e){return {ok:false,reason:e instanceof ProviderError?e.vendorText:'демон не запущен',command:'ollama serve'}}}
 async version(signal?:AbortSignal){return readCliMetadata(this.options.binary??'ollama',forbidden,{command:{args:['--version']},parse:r=>ollamaVersion(r.stdout)},{...this.options,env:ambientEnv(this.options.env??process.env),probeTimeoutMs:this.options.probeTimeoutMs??OLLAMA_TIMEOUT_MS},signal)}

 async auth(signal?:AbortSignal):Promise<CliAuth>{const v=await this.read('/api/version',signal);if(!record(v)||!versionText(v.version))throw new ProviderError('protocol','Ollama: неверный ответ демона');return {loggedIn:false,state:'unknown',reason:OLLAMA_LOGIN_UNKNOWN}}
 async models(signal?:AbortSignal,refresh=false):Promise<CliModel[]>{return this.modelCatalog.list(signal)}
}
export function ollamaEntry(options:OllamaOptions={}):CatalogEntry{
 const p=new OllamaProvider(options);return {id:'ollama',title:'Ollama',subtitle:'локально',kind:'local',binary:options.binary??'ollama',login:{args:['serve']},forbiddenEnv:forbidden,allowUnverifiedLogin:true,allowUnverifiedProbe:true,
 capabilities:{headless:true,resume:true,mcp:true,limits:false,probe:{ok:true},turn:API_TURN_MODES as TurnModes},modelsReason:OLLAMA_CLOUD_REASON,cachedModels:models=>models.filter(m=>!isOllamaCloudModel(m.id)&&!m.label.includes(' · облако')),modelsWarning:()=>p.modelsReason,version:signal=>p.version(signal),service:()=>p.service(),auth:signal=>p.auth(signal),models:(signal,refresh=true)=>p.models(signal,refresh),prepareModel:(model,signal)=>p.prepareModel(model,signal),runTurn:async()=>{throw new ProviderError('capability_unsupported','Ход Ollama требует агентного цикла Harnessy')},close:()=>p.close()};
}
