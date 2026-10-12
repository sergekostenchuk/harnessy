import {ProviderError} from './types.ts';
import type {CliDescriptor,CliProbe} from './cli/types.ts';
import {qwenStream} from './qwen-stream.ts';

// Qwen Code 0.24.0 --help and bundled docs/features/headless.md,
// docs/support/troubleshooting.md: safe-mode discards ambient MCP/hooks/settings
// customizations but honors explicit --mcp-config and --approval-mode.
// --core-tools is ignored in safe-mode; plan/auto-edit do not guarantee our scopes.
export const QWEN_LOGIN_UNKNOWN='CLI не предоставляет безопасной отдельной проверки входа; вход проверяется при ходе Qwen';
export const QWEN_MODELS_UNAVAILABLE='CLI не предоставляет безопасного списка моделей; используется модель по умолчанию программы';
export const qwenVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const version=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw new ProviderError('protocol','Qwen: неверный ответ версии');return version;
}};
export const QWEN:CliDescriptor={
 id:'qwen',name:'Qwen Code',binary:'qwen',login:{args:['--auth-type','qwen-oauth']},version:qwenVersion,
 auth:{unavailableReason:QWEN_LOGIN_UNKNOWN},allowUnverifiedLogin:true,
 models:{list:[{id:'default',label:'по умолчанию программы'}],reason:QWEN_MODELS_UNAVAILABLE},
 forbiddenEnv:['OPENAI_API_KEY','OPENAI_BASE_URL','QWEN_API_KEY','DASHSCOPE_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'],
 modes:{all:()=>['--approval-mode','yolo']},
 turnReasons:{read:'Plan допускает смену режима; изолированное чтение не гарантировано',edit:'CLI не гарантирует запись только в разрешённые папки'},
 turn:{format:'stream-json',command:i=>({args:['--safe-mode','--auth-type','qwen-oauth','--output-format','stream-json','--chat-recording','true','--prompt',i.roleNote+'\n\n'+i.message]}),decoder:qwenStream},
 resume:id=>{if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new ProviderError('session_missing','Qwen: неверная сессия');return ['--resume',id]},
 mcp:{serialize:server=>JSON.stringify({mcpServers:{harnessy:server}}),args:path=>['--mcp-config',path,'--allowed-mcp-server-names','harnessy']}
};
