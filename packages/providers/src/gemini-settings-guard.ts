import {constants,lstatSync,fstatSync,openSync,closeSync,readSync,writeFileSync,ftruncateSync,fchmodSync,unlinkSync,readdirSync,readlinkSync,type BigIntStats} from 'node:fs';
import {dirname,basename,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ProviderError} from './types.ts';

const changed=()=>new ProviderError('state_dir_tampered','Gemini: подготовленные настройки изменены; запуск отменён');
const same=(a:BigIntStats,b:BigIntStats)=>a.dev===b.dev&&a.ino===b.ino;
const stat=(path:string)=>lstatSync(path,{bigint:true});
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function geminiSettingsGuard(directory:string){
 const paths:string[]=[];for(let p=directory;;p=dirname(p)){paths.unshift(p);if(p===dirname(p))break}
 const chain=paths.map(path=>{const identity=stat(path);if(!identity.isDirectory()||identity.isSymbolicLink())throw changed();return {path,identity}});
 let fd:number|undefined,fileIdentity:BigIntStats|undefined,expected:Buffer|undefined;
 const directories=()=>{try{for(const {path,identity} of chain){const now=stat(path);if(!now.isDirectory()||now.isSymbolicLink()||!same(now,identity))throw changed()}}catch{throw changed()}};
 const ownFile=(path:string)=>{try{const now=stat(path);return now.isFile()&&!now.isSymbolicLink()&&!!fileIdentity&&same(now,fileIdentity)}catch{return false}};
 // Resolve renamed components by identity, without following replacement links.
 const originalDirectory=()=>{let current=chain[0]!.path;for(const entry of chain.slice(1)){
  const matches=(path:string)=>{try{const now=stat(path);return now.isDirectory()&&!now.isSymbolicLink()&&same(now,entry.identity)}catch{return false}};
  const direct=join(current,basename(entry.path)),found=matches(direct)?direct:readdirSync(current).map(name=>join(current,name)).find(matches);
  if(!found)return null;current=found;
 }return current};
 return {
  directories,
  write(contents:string){directories();expected=Buffer.from(contents);const path=join(directory,'settings.json');
   // Replace a stale name, never truncate a pre-existing inode (it may be a
   // hard link to data outside this private configuration directory).
   try{unlinkSync(path)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
   fd=openSync(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);fileIdentity=fstatSync(fd,{bigint:true});if(!fileIdentity.isFile())throw changed();directories();fchmodSync(fd,0o600);writeFileSync(fd,expected);
  },
  validate(){directories();if(fd===undefined||!fileIdentity||!expected)throw changed();try{
   const path=join(directory,'settings.json'),now=stat(path),held=fstatSync(fd,{bigint:true});
   if(!now.isFile()||now.isSymbolicLink()||!same(now,fileIdentity)||!same(held,fileIdentity)||now.size!==BigInt(expected.length)||held.size!==now.size)throw changed();
   const bytes=Buffer.alloc(expected.length);let n=0;while(n<bytes.length){const got=readSync(fd,bytes,n,bytes.length-n,n);if(!got)throw changed();n+=got}
   if(hash(bytes)!==hash(expected)||!same(stat(path),fileIdentity))throw changed();directories();
  }catch{throw changed()}},
  dispose(){if(fd===undefined)return;const held=fd;fd=undefined;try{
   // The descriptor still names our inode after rename/replacement. Erase the
   // token even if the attacker moved its last pathname outside the state tree.
   ftruncateSync(held,0);
   let original:string|null=null;try{original=originalDirectory()}catch{}
   let removed=false;if(original)for(const name of readdirSync(original)){const path=join(original,name);if(ownFile(path)){unlinkSync(path);removed=true}}
   // A cross-directory move cannot be found through the captured parent chain.
   // Kernel descriptor metadata supplies its new pathname; only our inode may
   // be unlinked. No shell, directory traversal or deletion of replacements.
   if(removed)return;let moved:string|undefined;
   if(process.platform==='linux'){try{moved=readlinkSync('/proc/self/fd/'+held)}catch{}}
   else if(process.platform==='darwin'){
    const result=spawnSync('/usr/sbin/lsof',['-a','-p',String(process.pid),'-d',String(held),'-F0n'],{encoding:'utf8',maxBuffer:64*1024,timeout:2000});
    moved=result.stdout?.split('\0').map(field=>field.replace(/^\n/,'' )).find(field=>field.startsWith('n/'))?.slice(1);
   }
   if(moved&&isAbsolute(moved)&&ownFile(moved))unlinkSync(moved);
  }finally{closeSync(held)}}
 };
}
