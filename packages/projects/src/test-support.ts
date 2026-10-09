import {mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectError} from './errors.ts';
export const failure=(code:string,text?:string)=>(e:unknown)=>e instanceof ProjectError&&e.code===code&&(!text||e.message===text);
export function temp(){const root=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-projects-')));return {root,close:()=>rmSync(root,{recursive:true,force:true})}}
export function git(root:string,...args:string[]){return execFileSync('git',args,{cwd:root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}}).trim()}
export function repo(root:string){git(root,'init','-q','-b','main');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Test');git(root,'config','commit.gpgsign','false');writeFileSync(join(root,'base.txt'),'base\n');git(root,'add','.');git(root,'commit','-qm','base');return git(root,'rev-parse','HEAD')}
export const response=(stdout='',code=0,stderr='')=>({code,stdout,stderr});
