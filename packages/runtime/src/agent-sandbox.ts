import {accessSync,constants,mkdtempSync,realpathSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {executeCli,type CliExecutor,type CliProcessRequest} from '@harnessy/providers';

export class AgentSandboxError extends Error {
 readonly code='sandbox_unavailable';
 constructor(){super('Песочница записи недоступна; команда не запущена без защиты')}
}
export type ShellMode='workspace-write'|'read-only';
export function seatbeltProfile(root:string,temporary:string,mode:ShellMode):string {
 const quote=(path:string)=>{if(/[\x00-\x1f\x7f]/.test(path))throw new AgentSandboxError();return '"'+path.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"'};
 const forms=['(version 1)','(allow default)','(deny file-write*)','(allow file-write* (literal "/dev/null"))'];
 if(mode==='workspace-write')forms.push('(allow file-write* (subpath '+quote(root)+') (subpath '+quote(temporary)+'))');
 return forms.join(' ');
}
/** Seatbelt is inherited by shell children. cwd alone cannot confine their writes. */
export async function sandboxedShell(request:CliProcessRequest,signal:AbortSignal,execute:CliExecutor=executeCli,options:{mode?:ShellMode;platform?:NodeJS.Platform;binary?:string}={}){
 const binary=options.binary??'/usr/bin/sandbox-exec';
 if((options.platform??process.platform)!=='darwin')throw new AgentSandboxError();
 try{accessSync(binary,constants.X_OK)}catch{throw new AgentSandboxError()}
 const root=realpathSync(request.cwd),temporary=mkdtempSync(join(realpathSync(tmpdir()),'harnessy-shell-'));
 chmodSync(temporary,0o700);
 try{
  const profile=seatbeltProfile(root,temporary,options.mode??'workspace-write'),result=await execute({...request,binary,args:['-p',profile,request.binary,...request.args],cwd:root,env:{...request.env,TMPDIR:temporary,TMP:temporary,TEMP:temporary}},signal);
  if(result.code!==0&&/(?:sandbox-exec:|sandbox_init:)/i.test(result.stderr))throw new AgentSandboxError();
  return result;
 }finally{rmSync(temporary,{recursive:true,force:true})}
}
