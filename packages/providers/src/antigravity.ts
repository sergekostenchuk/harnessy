import {AntigravityStream} from './antigravity-stream.ts';
import {ProviderError,record} from './types.ts';
import type {CliDescriptor,CliProcessResult} from './cli/types.ts';

export const ANTIGRAVITY_UNAVAILABLE='нет изолированного MCP-конфига и политики read/edit/all на ход';
const invalid=()=>new ProviderError('protocol','Antigravity: неверный ответ метаданных');
const label=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=200&&!/[\x00-\x1f\x7f]/.test(v);
// agy 1.2.17: readonly commands return a result envelope and spend zero turns.
function metadata(r:CliProcessResult,name:string){
 const v:unknown=JSON.parse(r.stdout);
 if(r.code!==0||!record(v)||v.status!=='SUCCESS'||v.num_turns!==0||v.conversation_id!==''||!record(v.command)||v.command.name!==name||!record(v.command.data))throw invalid();
 return v.command.data;
}
export const ANTIGRAVITY:CliDescriptor={
 id:'antigravity',name:'Antigravity',binary:'agy',login:{args:[]},
 forbiddenEnv:['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GEMINI_BASE_URL','GOOGLE_APPLICATION_CREDENTIALS','AGY_ADC_AUTH'],
 noHarnessMcp:true,turnReasons:{read:ANTIGRAVITY_UNAVAILABLE,edit:ANTIGRAVITY_UNAVAILABLE},turnNotes:{all:'без инструментов Harnessy'},
 modes:{all:()=>['--dangerously-skip-permissions']},
 turn:{format:'stream-json',command:i=>({args:['--output-format','stream-json','--model',i.seat.model,'-p',i.roleNote+'\n\n'+i.message]}),decoder:()=>{const stream=new AntigravityStream();return v=>stream.push(v)}},
 resume:id=>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new ProviderError('session_missing','Antigravity: неверная сессия');return ['--conversation',id]},
 version:{command:{args:['--version']},parse:r=>{const v=r.stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(v))throw invalid();return v}},
 auth:{command:{args:['--output-format','json','-p','/usage']},exitCodes:[0,1],parse:(r:CliProcessResult)=>{
  if(r.code===1&&/^\s*(?:Error:\s*)?authentication required\b/i.test(r.stderr||r.stdout))return {loggedIn:false};
  const v=metadata(r,'usage');if(!Array.isArray(v.groups)||v.groups.some(g=>!record(g)||!label(g.name)||!Array.isArray(g.buckets)))throw invalid();
  // No account identifier is exposed by this command; do not infer one from a model or quota.
  return {loggedIn:true};
 }},
 models:{command:{args:['--output-format','json','models']},parse:r=>{
  const v=metadata(r,'models');if(!Array.isArray(v.models)||v.models.some(m=>!record(m)||!label(m.id)||!label(m.label))||new Set(v.models.map(m=>m.id)).size!==v.models.length)throw invalid();
  return v.models.map(m=>({id:m.id as string,label:m.label as string}));
 }}
};
