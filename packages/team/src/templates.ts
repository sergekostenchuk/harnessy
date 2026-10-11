import {readFileSync,mkdirSync,writeFileSync,existsSync,unlinkSync,lstatSync} from 'node:fs';
import {join,dirname,basename,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROLE_CATALOG,type Vendor,type Mode} from './catalog.ts';
import {TeamError,message} from './errors.ts';
import {TEAM_HEADER} from './strings.ts';
import {readManifest,teamFrom} from './manifest.ts';
import {withPathLock,assertPathLock,atomicWrite,canonicalPath,type PathLock} from './locks.ts';
import {dumpYaml,mapping,pyDefault,pyString,type YMap} from './yaml-compat.ts';
import type {FileOptions,AddSeatArgs,Seat} from './types.ts';
import {seatKind,legacyKind} from './kinds.ts';
export const TEMPLATES=fileURLToPath(new URL('../templates/',import.meta.url));
const names=['team-empty.yaml','comms-policy.yaml','MEMORY.md',...ROLE_CATALOG.map(r=>'roles/'+r.role+'.md')];
export async function ensureLine(projectDir:string,options:FileOptions={}):Promise<string>{return withPathLock(projectDir,lock=>ensureLineLocked(lock,projectDir,options))}
/** Internal composition; requires ownership of the project root. */
export function ensureLineLocked(lock:PathLock,projectDir:string,options:FileOptions={}):string{
 assertPathLock(lock,projectDir);
 const sources=new Map<string,Buffer>();for(const name of names){try{sources.set(name,readFileSync(join(options.templatesDir??TEMPLATES,name)))}catch(e){throw new TeamError('template_missing','шаблон не найден: '+name,e)}}
 const h=join(projectDir,'.harness');try{mkdirSync(join(h,'roles'),{recursive:true});mkdirSync(join(h,'state'),{recursive:true});
 const now=options.now?.()??new Date(),date=[now.getDate(),now.getMonth()+1,now.getFullYear()].map((v,i)=>String(v).padStart(i===2?4:2,'0')).join('.');
 for(const [name,bytes] of sources){const target=join(h,name==='team-empty.yaml'?'team.yaml':name),body=name==='MEMORY.md'?bytes.toString('utf8').replaceAll('{name}',basename(projectDir)||projectDir).replaceAll('{date}',date):bytes;
 try{writeFileSync(target,body,{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}}
 }catch(e){throw new TeamError('write_failed','не записано: '+message(e),e)}return h
}
function stampKinds(h:string,data:YMap):void {const team=teamFrom(data,h),seats=data.get('seats') as YMap;for(const seat of Object.values(team.seats)){const raw=seats.get(seat.id) as YMap;if(!raw.has('kind'))raw.set('kind',seat.kind)}}
function save(h:string,data:YMap,options:FileOptions){stampKinds(h,data);try{atomicWrite(join(h,'team.yaml'),TEAM_HEADER+dumpYaml(data),options.replace)}catch(e){throw new TeamError('write_failed','team.yaml не записан: '+message(e),e)}}
export async function seedOrchestrator(h:string,vendor:Vendor,model:string,mode:Mode='read',options:FileOptions={}){return withPathLock(dirname(h),lock=>seedOrchestratorLocked(lock,h,vendor,model,mode,options))}
/** Internal composition; requires ownership of the project root. */
export function seedOrchestratorLocked(lock:PathLock,h:string,vendor:Vendor,model:string,mode:Mode='read',options:FileOptions={}):{seeded:true}|{seeded:false;reason:'seats_present'}{
 assertPathLock(lock,dirname(h));
 const data=readManifest(h),seats=data.get('seats') as YMap;if(seats.size)return {seeded:false,reason:'seats_present'};
 data.set('seats',new Map([['orchestrator',new Map<string,unknown>([['role','orchestrator'],['label','оркестратор'],['vendor',vendor],['model',model],['mode',mode],['digest',false],['instructions','roles/orchestrator.md']])]]));teamFrom(data,h);save(h,data,options);return {seeded:true}
}
/** Only the fixed file of a saved seat can be recovered; unrelated files stay refused. */
export function ensureSeatFileLocked(lock:PathLock,h:string,sid:string,content:string,acceptExisting=false):boolean {
 assertPathLock(lock,dirname(h));
 if(!/^[a-z][a-z0-9_-]{0,30}$/.test(sid))throw new TeamError('team_invalid','недопустимое имя места');
 const relative='roles/seats/'+sid+'.md',path=join(h,relative);
 if(!canonicalPath(path).startsWith(canonicalPath(h)+sep))throw new TeamError('seat_file_exists','файл места уже существует: '+relative);
 mkdirSync(dirname(path),{recursive:true});
 try{writeFileSync(path,content,{encoding:'utf8',flag:'wx'});return true}catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
  if(!acceptExisting||!lstatSync(path).isFile()||readFileSync(path,'utf8')!==content)throw new TeamError('seat_file_exists','файл места уже существует: '+relative,e);
  return false;
 }
}
export interface SeatMaterial {sid:string;instructions:string|null;file:{path:string;content:string}|null;acceptExisting?:boolean}
export async function addSeat(h:string,args:AddSeatArgs,options:FileOptions={}):Promise<Seat>{
 return withPathLock(dirname(h),lock=>addSeatLocked(lock,h,args,options));
}
/** Synchronous composition: the caller owns the project lock and any saved assignment. */
export function addSeatLocked(lock:PathLock,h:string,args:AddSeatArgs,options:FileOptions={},material?:SeatMaterial):Seat {
 assertPathLock(lock,dirname(h));
 const kind=seatKind(args.kind,args.role),cat=ROLE_CATALOG.find(c=>legacyKind(c.role)===kind),multi=args.kind===undefined?cat?.multi:kind!=='orchestrator';
 const data=readManifest(h),seats=data.get('seats') as YMap,same=[...seats].filter(([,r])=>mapping(r)&&seatKind(r.get('kind'),r.get('role'))===kind);
 if(same.length&&!multi){const [sid,raw]=same[0]!;throw new TeamError('role_taken','роль «'+(cat?.label??kind)+'» в этой папке уже есть ('+pyString(pyDefault((raw as YMap).get('label'),sid))+')')}
 const n=same.length+1,baseId=/^[a-z][a-z0-9_-]{0,26}$/.test(args.role)?args.role:kind,sid=args.kind!==undefined&&material?material.sid:baseId+(n===1?'':n);if(!/^[a-z][a-z0-9_-]{0,30}$/.test(sid)||['owner','harness','all','room'].includes(sid))throw new TeamError('team_invalid','недопустимое имя места');if(material&&material.sid!==sid)throw new TeamError('seat_exists','место '+material.sid+' уже есть в team.yaml');if(seats.has(sid))throw new TeamError('seat_exists','место '+sid+' уже есть в team.yaml');
 const spec=args.specialization;if(spec!==undefined&&(!spec||typeof spec.title!=='string'||[...spec.title].length<1||[...spec.title].length>60||typeof spec.text!=='string'||[...spec.text].length<1||[...spec.text].length>20000))throw new TeamError('specialization_invalid','специализация: title — строка 1–60 символов, text — строка 1–20000 символов');
 const base='roles/'+(cat?.role??kind)+'.md',candidate=args.instructions??base;let instructions:string|null=existsSync(isAbsolute(candidate)?candidate:join(h,candidate))?candidate:null;
 if(material)instructions=material.instructions;
 const label=(spec?.title||args.label||cat?.label||kind)+(n===1||args.kind!==undefined?'':' '+n),raw=new Map<string,unknown>([['role',args.role],['label',label],['vendor',args.vendor],['model',args.model],['mode',args.mode],['digest',false],['kind',kind]]);
 if(spec)instructions='roles/seats/'+sid+'.md';if(material&&material.instructions!==instructions)throw new TeamError('team_invalid','не совпадают инструкции сохранённого назначения');if(instructions)raw.set('instructions',instructions);seats.set(sid,raw);const seat=teamFrom(data,h).seats[sid]!;
 let created:string|undefined;try{
 if(spec){const relative='roles/seats/'+sid+'.md',expected=material?.file;
 if(material&&(!expected||expected.path!==relative))throw new TeamError('team_invalid','не совпадает файл сохранённого назначения');
 const content=expected?.content??((existsSync(join(h,base))?readFileSync(join(h,base),'utf8'):'')+'\n\n'+spec.text);
 if(ensureSeatFileLocked(lock,h,sid,content,material?.acceptExisting))created=join(h,relative);
 }
 save(h,data,options);return seat
 }catch(e){if(created)unlinkSync(created);if(e instanceof TeamError)throw e;throw new TeamError('write_failed','team.yaml не записан: '+message(e),e)}
}
