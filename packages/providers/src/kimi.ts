import {ProviderError} from './types.ts';
import type {CliProbe,CliUnavailableDescriptor} from './cli/types.ts';

// Kimi Code 2.1.1 --help: no isolated per-turn config or standalone login check.
// provider list --json exports raw configuration, so it is not a metadata source.
// https://moonshotai.github.io/kimi-code/
export const KIMI_UNAVAILABLE='Нет изолированного MCP-конфига и гарантированной политики read/edit/all на ход Kimi';
export const KIMI_LOGIN_UNKNOWN='CLI не предоставляет безопасной отдельной проверки входа';
export const KIMI_MODELS_UNAVAILABLE='Безопасный список моделей недоступен: provider list --json выдаёт сырой конфиг';
export const kimiVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const version=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw new ProviderError('protocol','Kimi: неверный ответ версии');return version;
}};
export const KIMI:CliUnavailableDescriptor={
 id:'kimi',name:'Kimi Code',binary:'kimi',login:{args:['login']},version:kimiVersion,
 forbiddenEnv:['KIMI_API_KEY','MOONSHOT_API_KEY','PANE_TOKEN','APP_URL','PANE_ID','SEATS'],
 auth:{unavailableReason:KIMI_LOGIN_UNKNOWN},models:{list:[],reason:KIMI_MODELS_UNAVAILABLE},
 capabilities:{headless:true,resume:false,mcp:false,limits:false},unavailableReason:KIMI_UNAVAILABLE,
};
