import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ensureLineLocked,seedOrchestratorLocked,withPathLock,MODE_IDS,type Seat,type Mode,type Vendor,type FileOptions} from '@harnessy/team';
import {gitops,GitOps,withGitLock} from './gitops.ts';
import {expandUser,validDir,writeDirectory} from './files.ts';
import {ProjectError} from './errors.ts';
export type Catalog=Partial<Record<Vendor,{id:string;label?:string}[]>>;
export function defaultModel({roomModel,catalog}:{roomModel?:string;catalog:Catalog}):string {if(roomModel)return roomModel;for(const vendor of ['claude','codex'] as const){const model=catalog[vendor]?.find(m=>m.id);if(model)return model.id}return ''}
export function projectsRoot(settings:Record<string,unknown>,env:NodeJS.ProcessEnv=process.env){return expandUser(String(settings.projectsRoot||env.HARNESS_PROJECTS_ROOT||'~/Harnessy-Projects'))}
export interface InitDeps {validatePath?:()=>void;gitops?:GitOps;defaultModel?:()=>string;vendorOf?:(model:string)=>Vendor|null;catalog?:Catalog;roomModel?:string;settings?:Record<string,unknown>;files?:FileOptions}
export async function initProject(path:string,options:{git?:boolean;model?:string;orchestrator?:boolean}={},deps:InitDeps={}){return withGitLock(deps.gitops??gitops,path,async(git,lock)=>{
 deps.validatePath?.();const created=!validDir(path);writeDirectory(path);let gitOk=await git.ownRepo(path);
 deps.validatePath?.();if(options.git!==false&&!gitOk){const result=await git.run(['init','-q'],path);if(result.code!==0)throw new ProjectError('tool_failed','git init: '+[...result.stderr.trim()].slice(0,200).join(''));gitOk=true}
 deps.validatePath?.();const h=ensureLineLocked(lock,path,deps.files);let seeded=false;
 if(options.orchestrator!==false){const model=options.model||deps.defaultModel?.()||defaultModel({...(deps.roomModel?{roomModel:deps.roomModel}:{}),catalog:deps.catalog??{}}),vendor=deps.vendorOf?.(model)??(['claude','codex'] as const).find(v=>deps.catalog?.[v]?.some(m=>m.id===model));
 if(vendor){const mode=String(deps.settings?.defaultMode||'read');if(!MODE_IDS.includes(mode as Mode))throw new ProjectError('invalid_settings','defaultMode: '+[...MODE_IDS].sort().join(', '));seeded=(seedOrchestratorLocked(lock,h,vendor,model,mode as Mode,deps.files)).seeded}}
 return {created,git:gitOk,orchestrator:seeded,memory:join(h,'MEMORY.md')}
}).catch(error=>{deps.validatePath?.();throw error})}
export async function uniqueProject(root:string,name:string,options:Parameters<typeof initProject>[1]={},deps:InitDeps={}){return withPathLock(root,async()=>{
 writeDirectory(root);let path=join(root,name),n=2;while(existsSync(path))path=join(root,name+'-'+n++);const result=await initProject(path,options,deps);return {path,...result}
})}
export function writableRoots(repo:string|null,hasWorktree:boolean):string[]{return repo?[...(hasWorktree?[join(repo,'.git')]:[]),join(repo,'.harness','evidence')]:[]}
export async function openProjectGit(projectDir:string,seats:readonly Seat[]|Record<string,Seat>,integrationBranch:string,git:GitOps=gitops){return withGitLock(git,projectDir,async(git)=>{
 const list=Array.isArray(seats)?seats:Object.values(seats),repo=await git.ownRepo(projectDir)?await git.repoRoot(projectDir):null,lineErrors:string[]=[];
 const cwdBySeat:Record<string,string>={},worktreeBySeat:Record<string,string|null>={},branchBySeat:Record<string,string|null>={};
 for(const s of list){cwdBySeat[s.id]=projectDir;worktreeBySeat[s.id]=null;branchBySeat[s.id]=null}
 if(!repo&&await git.isRepo(projectDir))lineErrors.push('папка лежит внутри чужого git-репозитория ('+await git.repoRoot(projectDir)+'): свой git не создан — создайте проект заново или выполните git init в папке');
 const wanted=list.filter(s=>s.worktree);if(wanted.length&&!repo)lineErrors.push('папка проекта не git-репозиторий: worktree не созданы, все места работают в корне');
 if(repo){writeDirectory(join(repo,'.harness','evidence'));for(const p of ['.harness/state/','.harness/evidence/','.harness/digests/','.harness/logs/'])await git.ensureExclude(repo,p);
 for(const s of wanted){const r=await git.ensureWorktree(repo,s.id,s.worktree!,integrationBranch);if(r.path){cwdBySeat[s.id]=r.path;worktreeBySeat[s.id]=r.path;branchBySeat[s.id]='seat/'+s.id}else lineErrors.push(s.id+': '+r.note)}}
 return {repoRoot:repo,cwdBySeat,worktreeBySeat,branchBySeat,lineErrors}
})}
