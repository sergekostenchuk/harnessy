import {CliProvider} from './cli/provider.ts';
import {readCliMetadata} from './cli/query.ts';
import {waitWithSignal} from './cancellation.ts';
import {ProviderError,record,type TurnModes} from './types.ts';
import {MODES} from './modes.ts';
import {CHAT_INSTRUCTIONS,codexTeamNote} from './text.ts';
import {overrides,tomlValue} from './codex/overrides.ts';
import {codexExecStream} from './codex/exec-stream.ts';
import type {CliDescriptor,CliDependencies,CliAuth,CliModel,CliTurnInput} from './cli/types.ts';
import type {CatalogEntry,CatalogService} from './catalog.ts';
export const OLLAMA_URL='http://127.0.0.1:11434';
export const OLLAMA_LOGIN_UNKNOWN='программа не предоставляет проверку облачного входа без обращения к модели';
// Measured 2026-10-12: --version 16 ms, /api/version 10 ms, /api/tags 6 ms. No inference in discovery.
export const OLLAMA_TIMEOUT_MS=3000;
const forbidden=['OLLAMA_API_KEY','OLLAMA_HOST','OLLAMA_BASE_URL','OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY'];
const versionText=(v:unknown):v is string=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v);
const modelId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,179}$/.test(v);
// CLI reports its client version as a warning when the daemon is absent or differs.
// https://github.com/ollama/ollama/blob/main/cmd/cmd.go (versionHandler)
export function ollamaVersion(raw:string):string{let server='',client='';for(const line of raw.trim().split(/\r?\n/)){if(line==='Warning: could not connect to a running Ollama instance')continue;const match=/^(ollama version is|Warning: client version is) (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(line);if(!match)throw new ProviderError('protocol','Ollama: неверная версия программы');if(match[1]==='ollama version is'){if(server)throw new ProviderError('protocol','Ollama: неоднозначная версия');server=match[2]!}else{if(client)throw new ProviderError('protocol','Ollama: неоднозначная версия');client=match[2]!}}if(!client&&!server)throw new ProviderError('protocol','Ollama: версия отсутствует');return client||server}
export interface OllamaOptions extends Partial<CliDependencies>{fetch?:typeof fetch;binary?:string;codexBinary?:string;httpTimeoutMs?:number}
export class OllamaProvider extends CliProvider {
 private options:OllamaOptions;
 constructor(options:OllamaOptions={}){
  const descriptor:CliDescriptor={id:'ollama',name:'Ollama',binary:options.codexBinary??options.env?.CODEX_BIN??process.env.CODEX_BIN??'codex',login:{args:['signin']},version:{command:{args:['--version']},parse:r=>r.stdout},auth:{unavailableReason:OLLAMA_LOGIN_UNKNOWN},models:{list:[],reason:'модели из демона Ollama'},allowUnverifiedLogin:true,forbiddenEnv:forbidden,
   modes:Object.fromEntries(Object.entries(MODES).map(([mode,row])=>[mode,(i:CliTurnInput)=>['-s',mode==='check'&&i.seat.worktree?'workspace-write':row.sandbox,'-c','approval_policy='+tomlValue(row.approval)]])),
   turn:{format:'stream-json',decoder:codexExecStream,command:i=>({args:['exec','--oss','--local-provider','ollama','--json','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-m',i.seat.model,'-c','developer_instructions='+tomlValue(i.roleNote+'\n'+(i.seat.mode==='chat'?CHAT_INSTRUCTIONS:codexTeamNote(i.seat,{peers:i.peers})+MODES[i.seat.mode].tail))],input:i.message})},
   resume:id=>{if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new ProviderError('session_missing','Ollama: неверная сессия Codex');return ['resume',id,'-']},
   mcp:{serialize:s=>JSON.stringify(s),args:(_path,s,i)=>overrides(i.seat,{appUrl:s.env.APP_URL,peers:i.peers,writableRoots:i.writableRoots},s.env.PANE_TOKEN,[]).flatMap(v=>['-c',v])}
  };super(descriptor,options);this.options=options;
 }
 private async read(path:string,signal?:AbortSignal):Promise<unknown>{
  const stop=signal?AbortSignal.any([signal,AbortSignal.timeout(this.options.httpTimeoutMs??OLLAMA_TIMEOUT_MS)]):AbortSignal.timeout(this.options.httpTimeoutMs??OLLAMA_TIMEOUT_MS);
  try{return await waitWithSignal(async()=>{const r=await (this.options.fetch??fetch)(OLLAMA_URL+path,{signal:stop,redirect:'error'});if(!r.ok)throw new ProviderError('transport_lost','демон не запущен · HTTP '+r.status+'; запустите ollama serve');const reader=r.body?.getReader();if(!reader)throw new ProviderError('protocol','Ollama: пустой ответ');const chunks:Uint8Array[]=[];let n=0;for(;;){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>1_048_576){await reader.cancel();throw new ProviderError('protocol','Ollama: ответ слишком велик')}chunks.push(part.value)}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new ProviderError('protocol','Ollama: неверный JSON демона')}},stop)}
  catch(e){if(signal?.aborted)throw new ProviderError('cancelled','Ollama: чтение отменено');if(e instanceof ProviderError&&e.code!=='cancelled')throw e;throw new ProviderError('transport_lost','демон не запущен · нет связи с 127.0.0.1:11434; запустите ollama serve')}
 }
 async service():Promise<CatalogService>{try{const v=await this.read('/api/version');if(!record(v)||!versionText(v.version))throw new ProviderError('protocol','Ollama: неверная версия демона');return {ok:true,version:v.version}}catch(e){return {ok:false,reason:e instanceof ProviderError?e.vendorText:'демон не запущен',command:'ollama serve'}}}
 override async version(){return readCliMetadata(this.options.binary??'ollama',forbidden,{command:{args:['--version']},parse:r=>ollamaVersion(r.stdout)},{...this.options,probeTimeoutMs:this.options.probeTimeoutMs??OLLAMA_TIMEOUT_MS})}

 override async auth(signal?:AbortSignal):Promise<CliAuth>{const v=await this.read('/api/version',signal);if(!record(v)||!versionText(v.version))throw new ProviderError('protocol','Ollama: неверный ответ демона');return {loggedIn:false,state:'unknown',reason:OLLAMA_LOGIN_UNKNOWN}}
 override async models(signal?:AbortSignal):Promise<CliModel[]>{const v=await this.read('/api/tags',signal);if(!record(v)||!Array.isArray(v.models)||v.models.length>1000)throw new ProviderError('models_unavailable','Ollama: список моделей не прочитан');const seen=new Set<string>();return v.models.map(m=>{if(!record(m)||!modelId(m.name)||seen.has(m.name)||m.remote_model!==undefined&&!modelId(m.remote_model))throw new ProviderError('models_unavailable','Ollama: неверная модель');seen.add(m.name);return {id:m.name,label:m.name+' · '+(m.remote_model||/(?:[:\-])cloud$/.test(m.name)?'облако':'локально')}})}
}
export function ollamaEntry(options:OllamaOptions={}):CatalogEntry{
 const p=new OllamaProvider(options);return {id:'ollama',title:'Ollama',subtitle:'облако и локально',kind:'local',binary:options.binary??'ollama',login:{args:['signin']},forbiddenEnv:forbidden,allowUnverifiedLogin:true,allowUnverifiedProbe:true,
 capabilities:{headless:true,resume:true,mcp:true,limits:false,probe:{ok:true},turn:Object.fromEntries(Object.keys(MODES).map(m=>[m,{ok:true}])) as TurnModes},version:()=>p.version(),service:()=>p.service(),auth:()=>p.auth(),models:()=>p.models(),runTurn:(s,m,c)=>p.runTurn(s,m,c),reset:()=>p.reset(),close:()=>p.close()};
}
