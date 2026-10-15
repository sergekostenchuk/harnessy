const {spawnSync}=require('node:child_process');
const path=require('node:path');
const clean=value=>String(value||'').split(':').filter(part=>part&&path.isAbsolute(part)&&part.length<=1024&&!/[\x00-\x1f\x7f]/.test(part));
function recoverProgramPath(env=process.env,run=spawnSync){
 const home=env.HOME&&path.isAbsolute(env.HOME)?env.HOME:'',original=clean(env.PATH),bare=!!home&&![path.join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin'].some(part=>original.includes(part));
 let shellPaths=[];
 if(bare){try{const shell=env.SHELL&&path.isAbsolute(env.SHELL)?env.SHELL:'/bin/zsh',result=run(shell,['-lc','printf %s "$PATH"'],{env,encoding:'utf8',timeout:3000,killSignal:'SIGKILL',maxBuffer:32768,stdio:['ignore','pipe','ignore']});if(result.status===0&&typeof result.stdout==='string'&&!/[\r\n]/.test(result.stdout))shellPaths=clean(result.stdout)}catch{}}
 const known=home?[path.join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',path.join(home,'.npm-global/bin'),path.join(home,'.volta/bin'),path.join(home,'.cargo/bin'),path.join(home,'.hermes/node/bin'),...(env.NVM_BIN&&path.isAbsolute(env.NVM_BIN)?[env.NVM_BIN]:[]),path.join(home,'.nvm/current/bin')]:['/opt/homebrew/bin','/usr/local/bin'];
 const searched=[...new Set([...shellPaths,...original,...known])];return {path:searched.join(':'),searched,source:shellPaths.length?'login-shell':bare?'known-directories':'existing'};
}
module.exports={recoverProgramPath};
