import {execFileSync} from 'node:child_process';
import {constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,renameSync,lstatSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';

export interface ProcessOwner {pid:number;stamp:string}
export interface SshOwnership {version:1;engine:ProcessOwner;guardian?:ProcessOwner;ssh?:ProcessOwner}
// Targeted process metadata only: no command lines, environment or credentials.
export function processOwner(pid:number):ProcessOwner|null {
 if(!Number.isSafeInteger(pid)||pid<2)return null;
 try{const stamp=execFileSync('/bin/ps',['-p',String(pid),'-o','uid=,pgid=,lstart='],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}}).trim();
  return stamp&&Number(stamp.split(/\s+/)[0])===process.getuid?.()?{pid,stamp}:null;
 }catch{return null}
}
let engine:ProcessOwner|null|undefined;
export const engineOwner=()=>engine===undefined?(engine=processOwner(process.pid)):engine;
export function saveOwnership(directory:string,value:SshOwnership){const file=join(directory,'owner.json'),temporary=file+'.tmp';writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'w'});renameSync(temporary,file)}
export function recoverSshDirectories(root:string,inspect=processOwner){
 const state=(owner:ProcessOwner)=>{const current=inspect(owner.pid);if(current)return current.stamp===owner.stamp?'same':'gone';try{process.kill(owner.pid,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')return 'gone'}return 'unknown'};
 let names:string[];try{names=readdirSync(root)}catch{return}
 for(const name of names){if(!/^hssh-[a-zA-Z0-9]{6}$/.test(name))continue;const dir=join(root,name);let fd:number|undefined;
  try{const s=lstatSync(dir);if(!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)continue;
   fd=openSync(join(dir,'owner.json'),constants.O_RDONLY|constants.O_NOFOLLOW);const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==s.uid||(stat.mode&0o777)!==0o600||stat.size>4096)continue;
   const v=JSON.parse(readFileSync(fd,'utf8')) as SshOwnership;
   const valid=(p:ProcessOwner|undefined)=>!!p&&Number.isSafeInteger(p.pid)&&p.pid>=2&&typeof p.stamp==='string'&&p.stamp.length<256;
   if(v.version!==1||!valid(v.engine)||v.guardian&&!valid(v.guardian)||v.ssh&&!valid(v.ssh)||state(v.engine)!=='gone')continue;
   const children=[v.ssh,v.guardian].filter((p):p is ProcessOwner=>!!p).map(owner=>({owner,state:state(owner)}));
   if(children.some(p=>p.state==='unknown'||p.state==='same'&&Number(p.owner.stamp.split(/\s+/)[1])!==p.owner.pid))continue;
   // Birth stamp and uid prevent a recycled pid from targeting another process.
   for(const {owner,state}of children)if(state==='same')try{process.kill(-owner.pid,'SIGKILL')}catch{}
   rmSync(dir,{recursive:true,force:true});
  }catch{/* A foreign or damaged marker never authorizes a process signal. */}finally{if(fd!==undefined)closeSync(fd)}
 }
}
