import {ProviderError} from './types.ts';
import type {CliProbe,CliDescriptor} from './cli/types.ts';
import {kimiStream} from './kimi-stream.ts';

// Kimi Code 2.1.1 --help: no isolated per-turn config or standalone login check.
// provider list --json exports raw configuration, so it is not a metadata source.
// https://moonshotai.github.io/kimi-code/
export const KIMI_UNAVAILABLE='Нет изолированного MCP-конфига и гарантированной политики read/edit/all на ход Kimi';
export const KIMI_LOGIN_UNKNOWN='CLI не предоставляет безопасной отдельной проверки входа';
export const KIMI_MODELS_UNAVAILABLE='Безопасный список моделей недоступен: provider list --json выдаёт сырой конфиг';
export const kimiVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const version=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw new ProviderError('protocol','Kimi: неверный ответ версии');return version;
}};
export const KIMI:CliDescriptor={
 id:'kimi',name:'Kimi Code',binary:'kimi',login:{args:['login']},version:kimiVersion,
 forbiddenEnv:['KIMI_API_KEY','MOONSHOT_API_KEY','PANE_TOKEN','APP_URL','PANE_ID','SEATS'],
 auth:{unavailableReason:KIMI_LOGIN_UNKNOWN},allowUnverifiedLogin:true,allowUnverifiedProbe:true,
 models:{list:[{id:'default',label:'по умолчанию программы'}],reason:KIMI_MODELS_UNAVAILABLE},
 noHarnessMcp:true,turnNotes:{all:'без инструментов Harnessy'},turnReasons:{read:KIMI_UNAVAILABLE,edit:KIMI_UNAVAILABLE},
 // 2.1.1, https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html:
 // --prompt is always auto. Combining it with --auto or --yolo is rejected.
 modes:{all:i=>['--prompt',i.roleNote+'\n\n'+i.message]},
 turn:{format:'stream-json',command:()=>({args:['--output-format','stream-json']}),decoder:kimiStream},
 resume:id=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))throw new ProviderError('session_missing','Kimi: неверная сессия');return ['--session',id]},
 failure:()=>({code:'turn_failed',text:'Kimi Code: ход не выполнен; проверьте вход в программе'}),
};
