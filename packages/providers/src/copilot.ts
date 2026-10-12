import {ProviderError,record} from './types.ts';
import type {CliDescriptor,CliProcessResult,CliProbe,CliAuth,CliModel} from './cli/types.ts';
import {CopilotStream} from './copilot-stream.ts';
import {copilotLimits} from './copilot-limits.ts';
const invalid=()=>new ProviderError('protocol','Copilot: неверный ответ метаданных');
const string=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=256&&!/[\x00-\x1f\x7f]/.test(v);
function value(r:CliProcessResult){const v:unknown=JSON.parse(r.stdout);if(!record(v))throw invalid();return v}
const metadata=(rpcMethod:'auth.getStatus'|'models.list')=>({args:['--headless','--stdio','--no-auto-update','--log-level','none'],rpcMethod});
export const copilotAuth:CliProbe<CliAuth>={command:metadata('auth.getStatus'),privateConfig:true,parse:r=>{
 const v=value(r);if(typeof v.isAuthenticated!=='boolean')throw invalid();if(!v.isAuthenticated)return {loggedIn:false};
 if(!string(v.login)||!string(v.host)||!['user','gh-cli','env'].includes(v.authType as string))throw invalid();
 const host=new URL(v.host);if(host.protocol!=='https:'||host.username||host.password||host.pathname!=='/'||host.search||host.hash)throw invalid();
 // Identity includes the GitHub host. Only an opaque HMAC / masked account leaves the catalog.
 return {loggedIn:true,email:v.login.toLowerCase()+'@'+host.host.toLowerCase()};
}};
export const copilotModels:CliProbe<CliModel[]>={command:metadata('models.list'),privateConfig:true,parse:r=>{
 const v=value(r);if(!Array.isArray(v.models)||v.models.some(m=>!record(m)||!string(m.id)||!string(m.name)||!record(m.capabilities)||m.policy!==undefined&&(!record(m.policy)||!string(m.policy.state)))||new Set(v.models.map(m=>m.id)).size!==v.models.length)throw invalid();
 return v.models.filter(m=>m.policy===undefined||m.policy.state==='enabled').map(m=>({id:m.id as string,label:m.name as string}));
}};
const base=['--disable-builtin-mcps','--no-custom-instructions','--no-ask-user','--no-bash-env','--disallow-temp-dir','--excluded-tools=task'];
export const COPILOT:CliDescriptor={
 id:'copilot',name:'GitHub Copilot',binary:'copilot',login:{args:['login']},
 forbiddenEnv:['COPILOT_GITHUB_TOKEN','GH_TOKEN','GITHUB_TOKEN','COPILOT_ALLOW_ALL','COPILOT_HOME','COPILOT_MODEL','COPILOT_PROVIDER_BASE_URL','COPILOT_PROVIDER_TYPE','COPILOT_PROVIDER_API_KEY','COPILOT_PROVIDER_BEARER_TOKEN','COPILOT_OFFLINE','COPILOT_CUSTOM_INSTRUCTIONS_DIRS','GH_HOST','BASH_ENV','ENV'],
 version:{command:{args:['--version']},parse:r=>{const m=/^GitHub Copilot CLI (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\.?$/m.exec(r.stdout);if(!m)throw invalid();return m[1]!}},auth:copilotAuth,models:copilotModels,limits:copilotLimits,
 state:{namespace:'copilot',args:directory=>['--config-dir',directory,'--log-dir',directory+'/logs']},
 modes:{read:()=>[...base,'--deny-tool=write','--deny-tool=shell','--allow-tool=harnessy'],edit:input=>[...base,'--allow-tool=write','--deny-tool=shell','--allow-tool=harnessy',...input.writableRoots.flatMap(p=>['--add-dir',p])],all:()=>[...base,'--allow-all-tools','--allow-all-paths','--allow-all-urls']},
 turn:{format:'stream-json',command:input=>({args:['--no-auto-update','--log-level','none','--output-format','json','--stream','on','--model',input.seat.model,'--prompt',input.roleNote+'\n\n'+input.message]}),decoder:()=>{const stream=new CopilotStream();return v=>stream.push(v)}},
 resume:id=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new ProviderError('session_missing','Copilot: неверный идентификатор сессии');return ['--resume='+id]},
 mcp:{serialize:server=>JSON.stringify({mcpServers:{harnessy:{type:'local',...server,tools:['*']}}}),args:path=>['--additional-mcp-config','@'+path]},
 failure:r=>({code:/not authenticated|no authentication/i.test(r.stderr)?'not_logged_in':/permission.*denied|requires.*approval/i.test(r.stderr)?'permission_denied':/session.*not found/i.test(r.stderr)?'session_missing':'transport_lost',text:'Copilot: процесс не завершил ход'})
};
