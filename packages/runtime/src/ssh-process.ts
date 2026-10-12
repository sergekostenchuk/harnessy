import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {processOwner,saveOwnership,type SshOwnership} from './ssh-ownership.ts';

export interface SshCommand {binary:string;args:string[];cwd:string;env:NodeJS.ProcessEnv;cleanupDirectory?:string;ownership?:SshOwnership}
export interface SshExit {code:number|null;stderr:string;error?:'missing'|'spawn'|'overflow'}
export interface SshProcess {done:Promise<SshExit>;stop():Promise<void>}
export type SshSpawn=(command:SshCommand)=>SshProcess;
const active=new Set<()=>void>();const engineExit=()=>{for(const stop of active)stop()};

/** Private diagnostics only; no shell, inherited proxy settings or unbounded output. */
export const spawnSsh:SshSpawn=command=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('./ssh-guardian.ts',import.meta.url))],{cwd:command.cwd,env:command.env,stdio:['pipe','ignore','ignore','ipc'],shell:false,detached:true});
 let error:SshExit['error'],result:SshExit|undefined;
 const exit=()=>child.stdin!.destroy();if(!active.size)process.once('exit',engineExit);active.add(exit);
 const done=new Promise<SshExit>(resolve=>{
  child.once('spawn',()=>{try{if(command.cleanupDirectory&&command.ownership){const guardian=processOwner(child.pid!);if(!guardian)throw Error();saveOwnership(command.cleanupDirectory,{...command.ownership,guardian})}child.send(command,e=>{if(e){error='spawn';exit()}})}catch{error='spawn';exit()}});
  child.stdin!.on('error',()=>{});
  child.once('message',value=>{result=value as SshExit});
  child.once('error',(e:NodeJS.ErrnoException)=>{error=e.code==='ENOENT'?'missing':'spawn'});
  child.once('close',()=>{active.delete(exit);if(!active.size)process.removeListener('exit',engineExit);resolve(result??{code:null,stderr:'',error:error??'spawn'})});
 });
 return {done,async stop(){exit();await done}};
};
