import {spawn,type ChildProcess} from 'node:child_process';
import {rmSync} from 'node:fs';
import {processOwner,saveOwnership,isOwnedSsh,cleanupDiagnostic,type ProcessOwner,type SshOwnership} from './ssh-ownership.ts';
import {join} from 'node:path';
import type {SshCommand,SshExit} from './ssh-process.ts';

// The engine owns stdin. EOF survives SIGKILL of the engine; SSH never inherits it.
let child:ChildProcess|undefined,owner:ProcessOwner|null=null,command:SshCommand|undefined,closed=false,finished=false,stderr='',bytes=0,error:SshExit['error'];
const kill=()=>{try{if(!child?.pid||!command||!owner||child.exitCode!==null||child.signalCode!==null)return;if(isOwnedSsh(owner,command.binary,join(command.cwd,'s')))process.kill(-child.pid,'SIGKILL');else if(processOwner(child.pid))cleanupDiagnostic(child.pid)}catch{}};
function finish(code:number|null){if(finished)return;finished=true;kill();if(command?.cleanupDirectory)try{rmSync(command.cleanupDirectory,{recursive:true,force:true})}catch{}
 const result:SshExit={code,stderr,...(error?{error}:{})};if(process.connected)process.send!(result,()=>process.exit(0));else process.exit(0);
}
function stop(){closed=true;kill();if(!child)finish(null)}
process.stdin.on('end',stop);process.stdin.on('error',stop);process.stdin.resume();process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
process.once('message',(message:SshCommand&{ownership?:SshOwnership})=>{
 command=message;if(closed){finish(null);return}
 try{
  const guardian=processOwner(process.pid);if(!guardian)throw Error('guardian identity unavailable');
  if(message.cleanupDirectory&&message.ownership)saveOwnership(message.cleanupDirectory,{...message.ownership,guardian});
  child=spawn(message.binary,message.args,{cwd:message.cwd,env:message.env,shell:false,detached:true,stdio:['ignore','ignore','pipe']});
  child.once('error',(e:NodeJS.ErrnoException)=>{error=e.code==='ENOENT'?'missing':'spawn'});
  child.once('spawn',()=>{try{owner=processOwner(child!.pid!);if(!owner)throw Error('ssh identity unavailable');if(message.cleanupDirectory&&message.ownership)saveOwnership(message.cleanupDirectory,{...message.ownership,guardian,ssh:owner});if(closed)kill()}catch{error='spawn';kill()}});
  child.stderr!.on('data',(data:Buffer)=>{bytes+=data.length;if(bytes>65536){error='overflow';kill()}else stderr+=data.toString('utf8')});
  child.once('exit',kill);child.once('close',finish);
 }catch{error='spawn';if(child)kill();else finish(null)}
});
