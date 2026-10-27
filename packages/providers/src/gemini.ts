import {join} from 'node:path';
import {geminiStream} from './gemini-stream.ts';
import {ProviderError,record} from './types.ts';
import type {CliProbe,CliDescriptor,CliAuth} from './cli/types.ts';
import {geminiHome,prepareGeminiSettings} from './gemini-settings.ts';

// Installed 0.63.0, docs/reference/configuration.md: system settings override lower scopes; mcp.allowed intersects across scopes.
// Plan can exit to YOLO in headless mode, so read/edit are deliberately not advertised.
export const GEMINI_UNAVAILABLE='Нет изолированной конфигурации инструментов на ход с сохранением входа Gemini';
export const GEMINI_MODELS_UNAVAILABLE='CLI не даёт безопасного чтения моделей без создания сессии';
export const GEMINI_LOGIN={args:[] as string[]};
export const GEMINI_CAPABILITIES={headless:true,resume:true,mcp:true,limits:false} as const;
export const geminiVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const value=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value))throw new ProviderError('protocol','Gemini: неверный ответ версии');return value;
}};

export const GEMINI:CliDescriptor={
 id:'gemini',name:'Gemini CLI',binary:'gemini',login:GEMINI_LOGIN,version:geminiVersion,
 forbiddenEnv:['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_GEMINI_BASE_URL','GEMINI_API_BASE_URL','GEMINI_BASE_URL'],
 allowUnverifiedLogin:true,turnReasons:{read:'Безголовый plan может перейти в полный доступ; режим чтения не гарантирован',edit:'Нет гарантии записи только в разрешённые папки'},
 modes:{all:()=>['--approval-mode','yolo']},
 turn:{format:'stream-json',command:i=>({args:['--output-format','stream-json','--prompt',i.roleNote+'\n\n'+i.message]}),decoder:geminiStream},
 resume:id=>{if(!/^[0-9a-f-]{36}$/i.test(id))throw new ProviderError('session_missing','Gemini: неверная сессия');return ['--resume',id]},
 mcp:{serialize:server=>JSON.stringify({mcp:{allowed:['harnessy']},mcpServers:{harnessy:server},hooksConfig:{enabled:false},tools:{discoveryCommand:''}}),args:()=>['--allowed-mcp-server-names','harnessy'],prepare:prepareGeminiSettings},
 failure:r=>{
  const tier=r.stderr.match(/This client is no longer supported for Gemini Code Assist for individuals\./);
  if(/IneligibleTierError/.test(r.stderr)&&tier)return {code:'permission_denied',text:'Подписка/тариф не даёт доступа к Gemini Code Assist через этот клиент. Провайдер: '+tier[0]};
  if(r.code===41&&/login required|no authentication method selected|please authenticate/i.test(r.stderr))return {code:'not_logged_in',text:'Нужен вход в Gemini CLI: откройте программу gemini и выполните вход'};
  return undefined;
 },
 auth:{file:env=>join(geminiHome(env),'.gemini','google_accounts.json'),parse:(raw:string|null):CliAuth=>{
  if(raw===null)return {loggedIn:false};const value:unknown=JSON.parse(raw);
  if(!record(value))throw new ProviderError('protocol','Gemini: неверная запись аккаунта');
  if(value.active===undefined||value.active===null||value.active==='')return {loggedIn:false};
  if(typeof value.active!=='string'||value.active.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.active))throw new ProviderError('protocol','Gemini: неверная запись аккаунта');
  return {loggedIn:false,state:'unknown',email:value.active,reason:'сохранён аккаунт, вход не проверен'};
 }},
 models:{list:[{id:'default',label:'по умолчанию программы'}],reason:GEMINI_MODELS_UNAVAILABLE}
};
