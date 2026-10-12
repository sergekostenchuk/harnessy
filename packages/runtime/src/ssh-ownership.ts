import {execFileSync} from 'node:child_process';
import {constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,renameSync,lstatSync,readdirSync,rmSync,readSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';

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
export const cleanupDiagnostic=(pid:number)=>process.stderr.write('[ssh.cleanup] ssh_cleanup_unverified pid='+pid+'; process left untouched\n');
/** Check the executable in the process table, its birth identity and this engine's private ControlPath. */
export function isOwnedSsh(owner:ProcessOwner,binary:string,control:string,inspect=processOwner){
 let fd:number|undefined;
 try{
  const current=inspect(owner.pid);if(!current||current.stamp!==owner.stamp||Number(current.stamp.split(/\s+/)[1])!==owner.pid)return false;
  const program=realpathSync(binary),header=Buffer.alloc(512);fd=openSync(program,constants.O_RDONLY);const size=readSync(fd,header,0,header.length,0);closeSync(fd);fd=undefined;
  // A configured script double must also match its interpreter and exact script path; arbitrary Node processes are never SSH.
  const line=header.subarray(0,size).toString().split('\n')[0]!,script=line.startsWith('#!'),interpreter=script?/^#!(\/[^\s]+)\s*$/.exec(line)?.[1]:undefined;
  if(script&&!interpreter)return false;
  const query=(field:string)=>execFileSync('/bin/ps',['-ww','-p',String(owner.pid),'-o',field+'='],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}}).trim();
  if(realpathSync(query('comm'))!==realpathSync(interpreter??program))return false;
  const command=query('command'),token=(s:string)=>new RegExp('(?:^|\\s)'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s|$)').test(command);
  if(!token(control)||script&&!token(resolve(binary)))return false;
  return inspect(owner.pid)?.stamp===owner.stamp;
 }catch{return false}finally{if(fd!==undefined)closeSync(fd)}
}
export function saveOwnership(directory:string,value:SshOwnership){const file=join(directory,'owner.json'),temporary=file+'.tmp';writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'w'});renameSync(temporary,file)}
export function recoverSshDirectories(root:string,inspect=processOwner,options:{binary?:string;report?:(pid:number)=>void}={}){
 const state=(owner:ProcessOwner)=>{const current=inspect(owner.pid);if(current)return current.stamp===owner.stamp?'same':'gone';try{process.kill(owner.pid,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')return 'gone'}return 'unknown'};
 let names:string[];try{names=readdirSync(root)}catch{return}
 for(const name of names){if(!/^hssh-[a-zA-Z0-9]{6}$/.test(name))continue;const dir=join(root,name);let fd:number|undefined;
  try{const s=lstatSync(dir);if(!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)continue;
   fd=openSync(join(dir,'owner.json'),constants.O_RDONLY|constants.O_NOFOLLOW);const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==s.uid||(stat.mode&0o777)!==0o600||stat.size>4096)continue;
   const v=JSON.parse(readFileSync(fd,'utf8')) as SshOwnership;
   const valid=(p:ProcessOwner|undefined)=>!!p&&Number.isSafeInteger(p.pid)&&p.pid>=2&&typeof p.stamp==='string'&&p.stamp.length<256;
   if(v.version!==1||!valid(v.engine)||v.guardian&&!valid(v.guardian)||v.ssh&&!valid(v.ssh)||state(v.engine)!=='gone')continue;
   const ssh=v.ssh,status=ssh?state(ssh):'gone';
   if(ssh&&(status==='unknown'||status==='same'&&!isOwnedSsh(ssh,options.binary??'/usr/bin/ssh',join(dir,'s'),inspect))){(options.report??cleanupDiagnostic)(ssh.pid);continue}
   if(ssh&&status==='same')try{process.kill(-ssh.pid,'SIGKILL')}catch{}
   // The guardian exits on engine EOF / SSH close; recovery never signals a non-SSH process.
   if(v.guardian&&state(v.guardian)!=='gone'){(options.report??cleanupDiagnostic)(v.guardian.pid);continue}
   rmSync(dir,{recursive:true,force:true});
  }catch{/* A foreign or damaged marker never authorizes a process signal. */}finally{if(fd!==undefined)closeSync(fd)}
 }
}
