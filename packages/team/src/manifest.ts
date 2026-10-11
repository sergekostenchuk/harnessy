import {readFileSync,existsSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {TeamError,message} from './errors.ts';
import {MODE_IDS,ROLE_CATALOG,type Mode,type Vendor} from './catalog.ts';
import {SEATS_REQUIRED} from './strings.ts';
import {parseYaml,mapping,pyDefault,pyString,pyTruthy,type YMap} from './yaml-compat.ts';
import type {Seat,Team} from './types.ts';
import {seatKind,legacyKind} from './kinds.ts';
export function readManifest(harnessDir:string):YMap {
 let bytes:Buffer;try{bytes=readFileSync(join(harnessDir,'team.yaml'))}catch(e){throw new TeamError((e as NodeJS.ErrnoException).code==='ENOENT'?'team_missing':'team_unreadable','team.yaml не читается: '+message(e),e)}
 let data:unknown;try{data=parseYaml(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch(e){throw new TeamError('team_yaml','team.yaml не читается: '+message(e),e)}
 if(!mapping(data)||!mapping(data.get('seats')))throw new TeamError('team_invalid',SEATS_REQUIRED);return data
}
export function teamFrom(data:YMap,harnessDir:string):Team {
 const rawSeats=data.get('seats');if(!mapping(rawSeats))throw new TeamError('team_invalid',SEATS_REQUIRED);
 const seats:Record<string,Seat>=Object.create(null),warnings:string[]=[];
 for(const [id,raw] of rawSeats){const sid=pyString(id);
 if(!/^[a-z][a-z0-9_-]{0,30}$/.test(sid)||['owner','harness','all','*'].includes(sid))throw new TeamError('team_invalid','team.yaml: недопустимое имя места «'+sid+'» (латиница, цифры, - и _; не owner/harness/all)');
 if(sid==='room')throw new TeamError('team_invalid','team.yaml: имя room зарезервировано для разговора без роли');
 if(!mapping(raw))throw new TeamError('team_invalid','team.yaml: место '+sid+' должно быть таблицей');
 const role=pyString(pyDefault(raw.get('role'),sid)),vendor=pyString(pyDefault(raw.get('vendor'),''));
 if(vendor!=='claude'&&vendor!=='codex'){warnings.push('место '+sid+': вендор «'+(vendor||'не задан')+'» здесь не ведётся (допустимы claude, codex) — место пропущено');continue}
 const mode=pyString(pyDefault(raw.get('mode'),'chat'));if(!MODE_IDS.includes(mode as Mode))throw new TeamError('team_invalid','team.yaml: у места '+sid+' режим «'+mode+'», допустимы '+MODE_IDS.join(', '));
 const wp=pyDefault(raw.get('write_paths'),[]),wt=raw.get('worktree');
 if(!Array.isArray(wp)||!wp.every(x=>typeof x==='string'&&x&&!x.startsWith('/')&&!x.includes('..')))throw new TeamError('team_invalid','team.yaml: write_paths у места '+sid+' — список относительных путей без ..');
 if(wt!=null&&(typeof wt!=='string'||!wt||wt.startsWith('/')||wt.includes('..')))throw new TeamError('team_invalid','team.yaml: worktree у места '+sid+' — относительный путь внутри проекта');
 const kind=seatKind(raw.get('kind'),raw.get('role'));
 let instructions=raw.get('instructions');if(instructions==null){const template=ROLE_CATALOG.find(c=>legacyKind(c.role)===kind)?.role??kind,candidate=join(harnessDir,'roles',template+'.md');instructions=existsSync(candidate)?candidate:null}
 if(instructions!==null&&typeof instructions!=='string')throw new TeamError('team_invalid','team.yaml не читается: instructions должен быть строкой');
 seats[sid]={id:sid,role,kind,label:pyString(pyDefault(raw.get('label'),sid)),vendor:vendor as Vendor,model:pyString(pyDefault(raw.get('model'),'')),mode:mode as Mode,digest:pyTruthy(raw.get('digest')),writePaths:wp.map(x=>x.replace(/\/+$/,'')),instructions,worktree:typeof wt==='string'?wt.replace(/\/+$/,''):null}
 }
 if(!Object.keys(seats).length&&rawSeats.size)throw new TeamError('team_invalid','team.yaml: нет ни одного места, которое здесь можно вести'+(warnings.length?' ('+warnings.join('; ')+')':''));
 const mr=data.has('merge_roles')?data.get('merge_roles'):['orchestrator'];if(!Array.isArray(mr)||!mr.every(x=>typeof x==='string'))throw new TeamError('team_invalid','team.yaml: merge_roles — список ролей');
 const rawVersion=pyDefault(data.get('version'),1),version=typeof rawVersion==='number'?Math.trunc(rawVersion):typeof rawVersion==='boolean'?Number(rawVersion):typeof rawVersion==='string'&&/^\s*[+-]?\d+\s*$/.test(rawVersion)?Number(rawVersion):NaN;
 if(!Number.isSafeInteger(version))throw new TeamError('team_yaml','team.yaml не читается: invalid version '+pyString(rawVersion));
 const mergeRoles=mr.map(role=>{if(role==='owner')return role;const kind=legacyKind(role);if(!kind)throw new TeamError('kind_invalid','merge_roles: неизвестный kind '+role);return kind});
 return {version,project:pyString(pyDefault(data.get('project'),'')),integrationBranch:pyString(pyDefault(data.get('integration_branch'),'main')),seats,harnessDir,mergeRoles,warnings}
}
export function loadTeam(harnessDir:string):Team{return teamFrom(readManifest(harnessDir),harnessDir)}
export function roleOf(team:Team,id:string):string|null{return team.seats[id]?.kind??null}
export function instructionsFor(team:Team,seat:Seat):string {
 const path=seat.instructions||join(team.harnessDir,'roles',(ROLE_CATALOG.find(c=>legacyKind(c.role)===seat.kind)?.role??seat.kind)+'.md');try{return new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(isAbsolute(path)?path:join(team.harnessDir,path)))}catch(e){if(e instanceof TypeError)throw new TeamError('team_unreadable','team.yaml не читается: '+message(e),e);return ''}
}
