import {readFileSync,mkdirSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join,dirname,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROLE_CATALOG,type Vendor,type Mode} from './catalog.ts';
import {TeamError,message} from './errors.ts';
import {TEAM_HEADER} from './strings.ts';
import {readManifest,teamFrom} from './manifest.ts';
import {withPathLock,atomicWrite} from './locks.ts';
import {dumpYaml,mapping,pyDefault,pyString,type YMap} from './yaml-compat.ts';
import type {FileOptions,AddSeatArgs,Seat} from './types.ts';
export const TEMPLATES=fileURLToPath(new URL('../templates/',import.meta.url));
const names=['team-empty.yaml','comms-policy.yaml','MEMORY.md',...ROLE_CATALOG.map(r=>'roles/'+r.role+'.md')];
export async function ensureLine(projectDir:string,options:FileOptions={}):Promise<string>{return withPathLock(projectDir,()=>{
 const sources=new Map<string,Buffer>();for(const name of names){try{sources.set(name,readFileSync(join(options.templatesDir??TEMPLATES,name)))}catch(e){throw new TeamError('template_missing','шаблон не найден: '+name,e)}}
 const h=join(projectDir,'.harness');try{mkdirSync(join(h,'roles'),{recursive:true});mkdirSync(join(h,'state'),{recursive:true});
 const now=options.now?.()??new Date(),date=[now.getDate(),now.getMonth()+1,now.getFullYear()].map((v,i)=>String(v).padStart(i===2?4:2,'0')).join('.');
 for(const [name,bytes] of sources){const target=join(h,name==='team-empty.yaml'?'team.yaml':name),body=name==='MEMORY.md'?bytes.toString('utf8').replaceAll('{name}',basename(projectDir)||projectDir).replaceAll('{date}',date):bytes;
 try{writeFileSync(target,body,{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}}
 }catch(e){throw new TeamError('write_failed','не записано: '+message(e),e)}return h
})}
function save(h:string,data:YMap,options:FileOptions){try{atomicWrite(join(h,'team.yaml'),TEAM_HEADER+dumpYaml(data),options.replace)}catch(e){throw new TeamError('write_failed','team.yaml не записан: '+message(e),e)}}
export async function seedOrchestrator(h:string,vendor:Vendor,model:string,mode:Mode='read',options:FileOptions={}):Promise<{seeded:true}|{seeded:false;reason:'seats_present'}>{return withPathLock(dirname(h),()=>{
 const data=readManifest(h),seats=data.get('seats') as YMap;if(seats.size)return {seeded:false,reason:'seats_present'};
 data.set('seats',new Map([['orchestrator',new Map<string,unknown>([['role','orchestrator'],['label','оркестратор'],['vendor',vendor],['model',model],['mode',mode],['digest',false],['instructions','roles/orchestrator.md']])]]));teamFrom(data,h);save(h,data,options);return {seeded:true}
})}
export async function addSeat(h:string,args:AddSeatArgs,options:FileOptions={}):Promise<Seat>{return withPathLock(dirname(h),()=>{
 const cat=ROLE_CATALOG.find(c=>c.role===args.role);if(!cat)throw new TeamError('role_unknown','неизвестная роль '+args.role);
 const data=readManifest(h),seats=data.get('seats') as YMap,same=[...seats].filter(([sid,r])=>mapping(r)&&pyString(pyDefault(r.get('role'),sid))===args.role);
 if(same.length&&!cat.multi){const [sid,raw]=same[0]!;throw new TeamError('role_taken','роль «'+cat.label+'» в этой папке уже есть ('+pyString(pyDefault((raw as YMap).get('label'),sid))+')')}
 const n=same.length+1,sid=args.role+(n===1?'':n);if(seats.has(sid))throw new TeamError('seat_exists','место '+sid+' уже есть в team.yaml');
 const spec=args.specialization;if(spec!==undefined&&(!spec||typeof spec.title!=='string'||[...spec.title].length<1||[...spec.title].length>60||typeof spec.text!=='string'||[...spec.text].length<1||[...spec.text].length>20000))throw new TeamError('specialization_invalid','специализация: title — строка 1–60 символов, text — строка 1–20000 символов');
 const base='roles/'+args.role+'.md',candidate=args.instructions??base;let instructions:string|null=existsSync(isAbsolute(candidate)?candidate:join(h,candidate))?candidate:null;
 const label=(spec?.title||args.label||cat.label)+(n===1?'':' '+n),raw=new Map<string,unknown>([['role',args.role],['label',label],['vendor',args.vendor],['model',args.model],['mode',args.mode],['digest',false]]);
 if(spec)instructions='roles/seats/'+sid+'.md';if(instructions)raw.set('instructions',instructions);seats.set(sid,raw);const seat=teamFrom(data,h).seats[sid]!;
 let created:string|undefined;try{
 if(spec){const path=join(h,instructions!),baseText=existsSync(join(h,base))?readFileSync(join(h,base),'utf8'):'';mkdirSync(dirname(path),{recursive:true});
 try{writeFileSync(path,baseText+'\n\n'+spec.text,{encoding:'utf8',flag:'wx'});created=path}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new TeamError('seat_file_exists','файл места уже существует: '+instructions,e);throw e}}
 save(h,data,options);return seat
 }catch(e){if(created)unlinkSync(created);if(e instanceof TeamError)throw e;throw new TeamError('write_failed','team.yaml не записан: '+message(e),e)}
})}
