import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {withPathLock,atomicWrite,parseYaml,mapping} from '@harnessy/team';
import {gitops,GitOps} from './gitops.ts';
import {ownerPaths,readJson,writeJson,validDir} from './files.ts';
import {ProjectError} from './errors.ts';
import type {OwnerPaths,ProjectInfo} from './types.ts';
export class ProjectRegistry {
 private paths:Pick<OwnerPaths,'projects'|'lastProject'>;private options:{noLast?:boolean;gitops?:GitOps;currentSeats?:()=>number};
 constructor(paths:Pick<OwnerPaths,'projects'|'lastProject'>=ownerPaths(),options:{noLast?:boolean;gitops?:GitOps;currentSeats?:()=>number}={}){this.paths=paths;this.options=options}
 async rememberProject(path:string):Promise<void>{if(this.options.noLast??!!process.env.HARNESS_NO_LAST)return;return withPathLock(this.paths.projects,()=>{
 const loaded=readJson(this.paths.projects),known=Array.isArray(loaded)?loaded.filter(x=>typeof x==='string'):[];
 if(!known.includes(path)){known.push(path);writeJson(this.paths.projects,known)}
 return withPathLock(this.paths.lastProject,()=>{try{mkdirSync(dirname(this.paths.lastProject),{recursive:true});atomicWrite(this.paths.lastProject,path)}catch(e){throw new ProjectError('write_failed','не записано: '+String(e),500,e)}})
 })}
 async listProjects(current:string|null):Promise<{current:string|null;projects:ProjectInfo[]}>{
 const raw=readJson(this.paths.projects),known=Array.isArray(raw)?raw:[],out:ProjectInfo[]=[],git=this.options.gitops??gitops;
 for(const path of new Set([current,...known])){if(!validDir(path))continue;const file=join(path,'.harness','team.yaml'),hasTeam=existsSync(file);let seats:number|null=null;
 if(path===current&&this.options.currentSeats)seats=this.options.currentSeats();else if(hasTeam)try{const data=parseYaml(readFileSync(file,'utf8')),s=mapping(data)?data.get('seats'):null;seats=s?mapping(s)?s.size:Array.isArray(s)||typeof s==='string'?s.length:null:0}catch{}
 out.push({path,name:basename(path.replace(/\/+$/,''))||path,hasTeam,seats,git:await git.ownRepo(path),current:path===current})}
 return {current,projects:out}
 }
}
export const rememberProject=(path:string,registry=new ProjectRegistry())=>registry.rememberProject(path);
export const listProjects=(current:string|null,registry=new ProjectRegistry())=>registry.listProjects(current);
