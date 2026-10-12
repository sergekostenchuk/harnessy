import {ProviderError,record} from './types.ts';
import type {CliAuth,CliModel,CliProbe,CliDescriptor} from './cli/types.ts';

// Devin 3000.11.3 --help: --config replaces the user config, not the separate
// user/project MCP files. No documented per-turn MCP isolation:
// https://docs.devin.ai/cli/extensibility/mcp/configuration
export const DEVIN_UNAVAILABLE='Нет документированной изоляции MCP на ход Devin: --config заменяет пользовательские настройки, MCP загружается из отдельных файлов';
const invalid=(what:string)=>new ProviderError('protocol','Devin: неверный ответ '+what);
const publicText=(v:unknown,max=200):v is string=>typeof v==='string'&&!!v.trim()&&v===v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
export const devinVersion:CliProbe<string>={command:{args:['--version']},parse:r=>{
 const match=/^devin (\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)(?: \([0-9a-f]{7,40}\))?$/.exec(r.stdout.trim());if(!match)throw invalid('версии');return match[1]!;
}};
// auth status prints metadata plus the credential FILE LOCATION, never its bytes.
// Only the observed status header, User.Email and Account.Plan are retained.
export const devinAuth:CliProbe<CliAuth>={command:{args:['auth','status']},exitCodes:[0,1],parse:r=>{
 const lines=r.stdout.replace(/\x1b\[[0-9;]*m/g,'').trim().split(/\r?\n/);
 if(/^Not logged in\.(?: Run `[^`]+ auth login` (?:first|to authenticate)\.)?$/.test(lines[0]??''))return {loggedIn:false};
 if(r.code!==0||!/^Logged in \(via (?:Devin|Windsurf)\)\.$/.test(lines[0]??''))throw invalid('входа');
 let section='',email:string|undefined,plan:string|undefined;const sections=new Set<string>();
 for(const line of lines.slice(1)){
  if(/^[^\s].*:$/.test(line)){section=line.slice(0,-1);if(sections.has(section))throw invalid('входа');sections.add(section);continue}
  const match=/^\s+(Email|Plan):\s+(.*?)\s*$/.exec(line);if(!match)continue;
  if(section==='User'&&match[1]==='Email'){if(email!==undefined)throw invalid('входа');email=match[2]}
  if(section==='Account'&&match[1]==='Plan'){if(plan!==undefined)throw invalid('входа');plan=match[2]}
 }
 if(!publicText(email,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||plan!==undefined&&!publicText(plan,100))throw invalid('входа');
 return {loggedIn:true,email,...(plan!==undefined?{plan}:{})};
}};
export const devinModels:CliProbe<CliModel[]>={command:{args:['models','list','--format','json']},parse:r=>{
 let value:unknown;try{value=JSON.parse(r.stdout)}catch{throw invalid('моделей')}
 if(!record(value)||!Array.isArray(value.families))throw invalid('моделей');
 const models:CliModel[]=[],seen=new Set<string>();
 for(const family of value.families){
  if(!record(family)||!Array.isArray(family.variants))throw invalid('моделей');
  for(const variant of family.variants){
   if(!record(variant)||!publicText(variant.model_uid)||!publicText(variant.label)||seen.has(variant.model_uid))throw invalid('моделей');
   seen.add(variant.model_uid);models.push({id:variant.model_uid,label:variant.label});
  }
 }
 return models;
}};
export const DEVIN:CliDescriptor={
 id:'devin',name:'Devin',binary:'devin',login:{args:['auth','login']},version:devinVersion,auth:devinAuth,models:devinModels,
 forbiddenEnv:['DEVIN_API_KEY','WINDSURF_API_KEY','CODEIUM_API_KEY','PANE_TOKEN','APP_URL','PANE_ID','SEATS'],
 noHarnessMcp:true,turnNotes:{all:'без инструментов Harnessy'},turnReasons:{read:DEVIN_UNAVAILABLE,edit:DEVIN_UNAVAILABLE},
 // 3000.11.3 --help: print cannot prompt for workspace trust in the probe folder.
 modes:{all:()=>['--permission-mode','dangerous','--respect-workspace-trust','false']},
 turn:{format:'text',command:i=>({args:['--model',i.seat.model,'--print',i.roleNote+'\n\n'+i.message]}),
  // --export writes ATIF. Retain only this turn's session id, never scan user history.
  sessionFile:{args:path=>['--export',path],parse:raw=>{const v:unknown=JSON.parse(raw);if(!record(v)||typeof v.session_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v.session_id))throw invalid('сессии');return v.session_id}}},
 resume:id=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))throw new ProviderError('session_missing','Devin: неверная сессия');return ['--resume',id]},
 failure:()=>({code:'turn_failed',text:'Devin: ход не выполнен; проверьте вход в программе'}),
};
