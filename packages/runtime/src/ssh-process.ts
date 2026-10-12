import {spawn} from 'node:child_process';

export interface SshCommand {binary:string;args:string[];cwd:string;env:NodeJS.ProcessEnv;onEngineExit?():void}
export interface SshExit {code:number|null;stderr:string;error?:'missing'|'spawn'|'overflow'}
export interface SshProcess {done:Promise<SshExit>;stop():Promise<void>}
export type SshSpawn=(command:SshCommand)=>SshProcess;
const active=new Set<()=>void>();const engineExit=()=>{for(const stop of active)stop()};

/** Private diagnostics only; no shell, inherited proxy settings or unbounded output. */
export const spawnSsh:SshSpawn=command=>{
 const child=spawn(command.binary,command.args,{cwd:command.cwd,env:command.env,stdio:['ignore','ignore','pipe'],shell:false,detached:process.platform!=='win32'});
 let stderr='',bytes=0,ended=false,stopping=false,error:SshExit['error'],timer:NodeJS.Timeout|undefined;
 const kill=(signal:NodeJS.Signals)=>{try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,signal);else child.kill(signal)}catch{}};
 const exit=()=>{kill('SIGKILL');try{command.onEngineExit?.()}catch{}};if(!active.size)process.once('exit',engineExit);active.add(exit);
 const done=new Promise<SshExit>(resolve=>{
  child.stderr!.on('data',(data:Buffer)=>{bytes+=data.length;if(bytes>65536){error='overflow';kill('SIGKILL')}else stderr+=data.toString('utf8')});
  child.once('error',(e:NodeJS.ErrnoException)=>{error=e.code==='ENOENT'?'missing':'spawn'});
  child.once('exit',()=>kill('SIGKILL'));
  child.once('close',code=>{ended=true;if(timer)clearTimeout(timer);active.delete(exit);if(!active.size)process.removeListener('exit',engineExit);resolve({code,stderr,...(error?{error}:{})})});
 });
 return {done,async stop(){if(!ended&&!stopping){stopping=true;kill('SIGTERM');timer=setTimeout(()=>kill('SIGKILL'),250);timer.unref()}await done}};
};
