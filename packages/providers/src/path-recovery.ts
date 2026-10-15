import {spawnSync} from 'node:child_process';
import {isAbsolute,join} from 'node:path';

const bareMarkers=['.local/bin','/opt/homebrew/bin','/usr/local/bin'];
const clean=(value:string)=>value.split(':').filter(path=>path&&isAbsolute(path)&&path.length<=1024&&!/[\x00-\x1f\x7f]/.test(path));
export interface PathRecovery {path:string;searched:string[];source:'login-shell'|'known-directories'|'existing'}
/** One bounded, non-interactive lookup; no shell text is interpreted as a command. */
export function recoverProgramPath(env:NodeJS.ProcessEnv=process.env,run=spawnSync):PathRecovery{
 const home=env.HOME&&isAbsolute(env.HOME)?env.HOME:'',original=clean(env.PATH??''),bare=!!home&&bareMarkers.every(marker=>!original.includes(marker.startsWith('/')?marker:join(home,marker)));
 let shellPaths:string[]=[];
 if(bare){
  const shell=env.SHELL&&isAbsolute(env.SHELL)?env.SHELL:'/bin/zsh';
  try{const result=run(shell,['-lc','printf %s "$PATH"'],{env,encoding:'utf8',timeout:3000,maxBuffer:32768,stdio:['ignore','pipe','ignore']});if(result.status===0&&typeof result.stdout==='string'&&!/[\r\n]/.test(result.stdout))shellPaths=clean(result.stdout)}catch{}
 }
 const known=home?[join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',join(home,'.npm-global/bin'),join(home,'.volta/bin'),join(home,'.cargo/bin'),join(home,'.hermes/node/bin'),...(env.NVM_BIN&&isAbsolute(env.NVM_BIN)?[env.NVM_BIN]:[]),join(home,'.nvm/current/bin')]:['/opt/homebrew/bin','/usr/local/bin'];
 const searched=[...new Set([...shellPaths,...original,...known])];
 return {path:searched.join(':'),searched,source:shellPaths.length?'login-shell':bare?'known-directories':'existing'};
}
