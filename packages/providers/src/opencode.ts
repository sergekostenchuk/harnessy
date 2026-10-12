import {ProviderError} from './types.ts';
import type {CliAuth,CliModel,CliProbe,CliUnavailableDescriptor} from './cli/types.ts';

// OpenCode 1.18.4 --help; https://docs.opencode.ai/docs/config/:
// OPENCODE_CONFIG and OPENCODE_CONFIG_CONTENT merge with global/project MCP.
// --pure disables external plugins, not ambient MCP. No isolated turn promised.
export const OPENCODE_UNAVAILABLE='Нет документированной изоляции MCP на ход OpenCode: конфиги объединяются с общими настройками';
export const OPENCODE_LOGIN_UNKNOWN='Сохранены подключения OpenCode; CLI не проверяет срок действия входов';
const invalid=(part:string)=>new ProviderError('protocol','OpenCode: неверный ответ '+part);
export const opencodeVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const version=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw invalid('версии');return version;
}};
// The CLI lists provider names/types and environment-variable NAMES. Never read
// auth.json, retain its path, or treat saved credentials as a verified login.
export const opencodeAuth:CliProbe<CliAuth>={command:{args:['auth','list','--pure']},parse:r=>{
 const lines=r.stdout.replace(/\x1b\[[0-9;]*m/g,'').trim().split(/\r?\n/);let section='',count=0,total=0;const seen=new Set<string>();
 for(const line of lines){
  if(!line.trim()||line==='│')continue;
  if(line.startsWith('┌  Credentials ')||line==='┌  Environment'){
   const next=line==='┌  Environment'?'environment':'credentials';if(section||seen.has(next))throw invalid('входа');seen.add(next);section=next;count=0;continue;
  }
  if((section==='credentials'&&/^●  [^\x00-\x1f\x7f]+ (?:oauth|api|wellknown)$/.test(line)||section==='environment'&&/^●  [^\x00-\x1f\x7f]+ [A-Za-z_][A-Za-z0-9_]*$/.test(line))){count++;continue}
  const end=/^└  (\d+) (credentials?|environment variables?)$/.exec(line);
  if(end&&section&&(section==='credentials'?end[2]!.startsWith('credential'):end[2]!.startsWith('environment'))&&Number(end[1])===count){total+=count;section='';continue}
  throw invalid('входа');
 }
 if(section||!seen.has('credentials'))throw invalid('входа');
 return total?{loggedIn:false,state:'unknown',reason:OPENCODE_LOGIN_UNKNOWN}:{loggedIn:false};
}};
// Documented metadata command, provider/model per line (including nested model
// paths). It neither verifies login nor starts a model. Do not use --verbose.
export const opencodeModels:CliProbe<CliModel[]>={command:{args:['models','--pure']},parse:r=>{
 const text=r.stdout.trim();if(!text)return [];const ids=text.split(/\r?\n/),seen=new Set<string>();
 return ids.map(id=>{if(id.length>512||!/^[A-Za-z0-9._-]+\/[A-Za-z0-9@~._:+/-]+$/.test(id)||seen.has(id))throw invalid('моделей');seen.add(id);return {id,label:id}});
}};
export const OPENCODE:CliUnavailableDescriptor={
 id:'opencode',name:'OpenCode',binary:'opencode',login:{args:['auth','login']},version:opencodeVersion,auth:opencodeAuth,models:opencodeModels,modelsWithoutLogin:true,
 forbiddenEnv:['PANE_TOKEN','APP_URL','PANE_ID','SEATS'],
 capabilities:{headless:true,resume:false,mcp:false,limits:false},unavailableReason:OPENCODE_UNAVAILABLE,
};
