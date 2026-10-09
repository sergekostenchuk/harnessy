import {execFile} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,relative,sep,join,resolve} from 'node:path';
import {canonicalPath,withPathLock} from '@harnessy/team';
import {ProjectError} from './errors.ts';
import type {GitRunner,CommandResult} from './types.ts';
export function execute(binary:string,args:string[],cwd:string|undefined,timeoutMs:number):Promise<CommandResult>{return new Promise((done,fail)=>{
 execFile(binary,args,{...(cwd?{cwd}:{}),timeout:timeoutMs,encoding:'utf8',maxBuffer:16*1024*1024},(error,stdout,stderr)=>{
 if(error){const e=error as NodeJS.ErrnoException&{killed?:boolean};if(e.code==='ENOENT')return fail(new ProjectError('tool_missing',binary+': '+e.message,500,e));if(e.killed||e.code==='ETIMEDOUT')return fail(new ProjectError('tool_timeout',binary+': время ожидания истекло',500,e))}
 done({code:error?typeof error.code==='number'?error.code:1:0,stdout,stderr})
 })
})}
const systemGit:GitRunner=async(args,cwd,timeout=60)=>{const r=await execute('git',args,cwd,timeout*1000);return {...r,stdout:r.stdout.trim(),stderr:r.stderr.trim()}};
export type MergeResult={ok:true;mergeSha:string|null;sha:string;alreadyMerged?:true}|{ok:false;code:'merge_failed';error:string};
export class GitOps {
 private runner:GitRunner;constructor(runner:GitRunner=systemGit){this.runner=runner}
 run(args:string[],cwd:string,timeout=60):Promise<CommandResult>{return withPathLock(cwd,()=>this.runner(args,cwd,timeout))}
 async isRepo(path:string){const r=await this.run(['rev-parse','--is-inside-work-tree'],path);return r.code===0&&r.stdout==='true'}
 async repoRoot(path:string){const r=await this.run(['rev-parse','--show-toplevel'],path);return r.code===0?r.stdout:null}
 async ownRepo(path:string){const root=await this.repoRoot(path);return root!==null&&canonicalPath(root)===canonicalPath(path)}
 async head(path:string){const r=await this.run(['rev-parse','HEAD'],path);return r.code===0?r.stdout:null}
 async currentBranch(path:string){const r=await this.run(['rev-parse','--abbrev-ref','HEAD'],path);return r.code===0?r.stdout:null}
 async branchExists(root:string,branch:string){return (await this.run(['show-ref','--verify','--quiet','refs/heads/'+branch],root)).code===0}
 async commitExists(root:string,sha:string){return /^[0-9a-f]{7,40}$/.test(sha)&&(await this.run(['cat-file','-e',sha+'^{commit}'],root)).code===0}
 async resolveSha(root:string,sha:string){const r=await this.run(['rev-parse','--verify','--end-of-options',sha+'^{commit}'],root);return r.code===0?r.stdout:null}
 private async common(root:string){const r=await this.run(['rev-parse','--git-common-dir'],root);return r.code===0?canonicalPath(isAbsolute(r.stdout)?r.stdout:join(root,r.stdout)):null}
 async ensureExclude(root:string,pattern:string):Promise<void>{return withPathLock(root,async()=>{
 const common=await this.common(root);if(!common)return;const path=join(common,'info','exclude');try{mkdirSync(dirname(path),{recursive:true});const text=existsSync(path)?readFileSync(path,'utf8'):'';
 if(!text.split(/\r?\n/).includes(pattern))writeFileSync(path,text+(text&&!text.endsWith('\n')?'\n':'')+pattern+'\n')
 }catch(e){throw new ProjectError('write_failed','не записано: '+String(e),500,e)}
 })}
 async ensureWorktree(root:string,seat:string,relPath:string,baseBranch:string):Promise<{path:string|null;note:string|null}>{return withPathLock(root,async()=>{
 const canonicalRoot=canonicalPath(root),path=canonicalPath(root+sep+relPath),rel=relative(canonicalRoot,path),branch='seat/'+seat;
 if(isAbsolute(relPath)||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))return {path:null,note:'worktree '+relPath+' вне проекта'};
 const belongs=async()=>{const top=await this.repoRoot(path);if(!top||canonicalPath(top)!==path||await this.common(root)!==await this.common(path)||await this.currentBranch(path)!==branch)return false;
 const listed=await this.run(['worktree','list','--porcelain','-z'],root);return listed.code===0&&listed.stdout.split('\0').some(line=>line==='worktree '+path)};
 if(existsSync(path)){if(await belongs())return {path,note:null};return {path:null,note:relPath+' существует, но это не worktree этого репозитория'}}
 if(!await this.branchExists(root,baseBranch))return {path:null,note:'нет ветки '+baseBranch+': сделай первый коммит, потом worktree появятся'};
 await this.run(['worktree','prune'],root);mkdirSync(dirname(path),{recursive:true});
 const args=await this.branchExists(root,branch)?['worktree','add',path,branch]:['worktree','add','-b',branch,path,baseBranch];
 const result=await this.run(args,root);if(result.code!==0)return {path:null,note:'worktree '+relPath+' не создан: '+(result.stderr.split('\n').at(-1)||'ошибка git')};
 if(!await belongs())return {path:null,note:relPath+' существует, но это не worktree этого репозитория'};
 await this.ensureExclude(root,relPath.includes('/')?relPath.split('/')[0]+'/':relPath);return {path,note:null}
 })}
 async mergeCommitFor(root:string,sha:string,branch:string):Promise<string|null>{
 if((await this.run(['merge-base','--is-ancestor',sha,branch],root)).code!==0)return null;
 const r=await this.run(['rev-list','--merges','--ancestry-path','--reverse',sha+'..'+branch],root);return r.code===0?r.stdout.split(/\s+/)[0]||sha:sha
 }
 async mergeInto(root:string,sha:string,branch:string,message:string):Promise<MergeResult>{return withPathLock(root,async()=>{
 const failure=(error:string):MergeResult=>({ok:false,code:'merge_failed',error});const br=await this.currentBranch(root);
 if(br!==branch)return failure('корень проекта на ветке '+(br??'None')+', а не '+branch+'; переключи ветку и повтори');
 const status=await this.run(['status','--porcelain','--untracked-files=no'],root);if(status.code!==0)return failure('git status не отвечает');if(status.stdout)return failure('в корне проекта есть незакоммиченные правки; сначала закоммить или убери их');
 const full=await this.resolveSha(root,sha);if(!full)return failure('коммита '+sha+' нет в репозитории');
 if((await this.run(['merge-base','--is-ancestor',full,branch],root)).code===0)return {ok:true,sha:full,alreadyMerged:true,mergeSha:await this.mergeCommitFor(root,full,branch)};
 const before=await this.head(root),r=await this.run(['merge','--no-ff','--no-edit','-m',message,full],root);
 if(r.code!==0){const abort=await this.run(['merge','--abort'],root);return failure(abort.code===0?'слияние не прошло, откачено: '+(r.stderr.split('\n').at(-1)||'конфликт'):'слияние не прошло, откат не удался: '+(abort.stderr.split('\n').at(-1)||r.stderr||'ошибка git'))}
 const after=await this.head(root),current=await this.currentBranch(root),parents=after?await this.run(['rev-list','--parents','-n','1',after],root):null;
 if(current!==branch)return failure('слияние не подтверждено: текущая ветка '+String(current)+', ожидалась '+branch);
 if(!after||after===before)return failure('слияние не подтверждено: HEAD не изменился');
 if(!parents||parents.code!==0||parents.stdout!==[after,before,full].join(' '))return failure('слияние не подтверждено: родители HEAD не совпадают с прежним HEAD и sha');
 return {ok:true,mergeSha:after,sha:full}
 })}
}
export const gitops=new GitOps();
export const run=gitops.run.bind(gitops),isRepo=gitops.isRepo.bind(gitops),ownRepo=gitops.ownRepo.bind(gitops),repoRoot=gitops.repoRoot.bind(gitops),head=gitops.head.bind(gitops),currentBranch=gitops.currentBranch.bind(gitops),branchExists=gitops.branchExists.bind(gitops),commitExists=gitops.commitExists.bind(gitops),resolveSha=gitops.resolveSha.bind(gitops),ensureExclude=gitops.ensureExclude.bind(gitops),ensureWorktree=gitops.ensureWorktree.bind(gitops),mergeCommitFor=gitops.mergeCommitFor.bind(gitops),mergeInto=gitops.mergeInto.bind(gitops);
