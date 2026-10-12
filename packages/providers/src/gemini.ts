import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {ProviderError,record} from './types.ts';
import type {CliProbe,CliUnavailableDescriptor,CliAuth} from './cli/types.ts';

// 0.55.1: GEMINI_CLI_HOME relocates both settings and OAuth storage; ACP merges MCP servers.
export const GEMINI_UNAVAILABLE='Нет изолированной конфигурации инструментов на ход с сохранением входа Gemini';
export const GEMINI_MODELS_UNAVAILABLE='CLI не даёт безопасного чтения моделей без создания сессии';
export const GEMINI_LOGIN={args:[] as string[]};
export const GEMINI_CAPABILITIES={headless:true,resume:true,mcp:false,limits:false} as const;
export const geminiVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const value=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value))throw new ProviderError('protocol','Gemini: неверный ответ версии');return value;
}};

export const GEMINI:CliUnavailableDescriptor={
 id:'gemini',name:'Gemini CLI',binary:'gemini',login:GEMINI_LOGIN,version:geminiVersion,
 forbiddenEnv:['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_GEMINI_BASE_URL','GEMINI_API_BASE_URL','GEMINI_BASE_URL'],
 capabilities:GEMINI_CAPABILITIES,unavailableReason:GEMINI_UNAVAILABLE,
 auth:{file:env=>join(resolve(env.GEMINI_CLI_HOME||homedir()),'.gemini','google_accounts.json'),parse:(raw:string|null):CliAuth=>{
  if(raw===null)return {loggedIn:false};const value:unknown=JSON.parse(raw);
  if(!record(value))throw new ProviderError('protocol','Gemini: неверная запись аккаунта');
  if(value.active===undefined||value.active===null||value.active==='')return {loggedIn:false};
  if(typeof value.active!=='string'||value.active.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.active))throw new ProviderError('protocol','Gemini: неверная запись аккаунта');
  return {loggedIn:false,state:'unknown',email:value.active,reason:'сохранён аккаунт, вход не проверен'};
 }},
 models:{list:[],reason:GEMINI_MODELS_UNAVAILABLE}
};
