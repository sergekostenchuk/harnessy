import {constants,readFileSync} from 'node:fs';
import {lstat,open,readdir,realpath,stat} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,sep} from 'node:path';
import {TEMPLATES} from '@harnessy/team';
import {compatJson} from '@harnessy/journal';
import {ProjectError} from './errors.ts';

export const SECTION_PATHS={docs:'docs',artifacts:'evidence',memory:'MEMORY.md',research:'research'} as const;
export type ProjectSection=keyof typeof SECTION_PATHS;
export interface SectionItem {path:string;name:string;stage:string|null;bytes:number;modifiedAt:string;format:'text'|'binary';text:string|null;truncated:boolean}
export const SECTION_LIMITS={files:1000,depth:16,textBytes:256*1024,responseBytes:4*1024*1024} as const;
export interface SectionData {empty:boolean;items:SectionItem[];limited:('files'|'depth'|'response')[];limits:typeof SECTION_LIMITS;memoryState:'missing'|'empty'|'template'|'content'|null}
export function projectSection(value:string):ProjectSection {
 if(!Object.hasOwn(SECTION_PATHS,value))throw new ProjectError('section_invalid','неизвестный раздел проекта',400);
 return value as ProjectSection;
}
const compact=(s:string)=>s.replace(/\s/gu,'');
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const seed=compact(readFileSync(join(TEMPLATES,'MEMORY.md'),'utf8'));
const seedPattern=new RegExp('^'+seed.split(/(\{name\}|\{date\})/).map(s=>s==='{name}'?'.+?':s==='{date}'?'\\d{2}\\.\\d{2}\\.\\d{4}':escape(s)).join('')+'$','u');
const wireSize=(value:unknown)=>Buffer.byteLength(compatJson(value).replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
const unreadable=(cause?:unknown)=>new ProjectError('section_unreadable','материалы раздела не удалось прочитать',409,cause);
const inside=(root:string,path:string)=>{const r=relative(root,path);return r!== '..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)};

/** Read-only reader. Every followed link, including .harness itself, stays in the captured project. */
export async function readProjectSection(project:string,section:ProjectSection):Promise<SectionData> {
 projectSection(section);
 const result:SectionData={empty:true,items:[],limited:[],limits:SECTION_LIMITS,memoryState:section==='memory'?'missing':null};
 const limit=(name:SectionData['limited'][number])=>{if(!result.limited.includes(name))result.limited.push(name)};
 try{
 const root=await realpath(project),seen=new Set<string>();let bytes=0,stopped=false;
 const resolve=async(path:string,optional=false):Promise<string|null>=>{
  try{await lstat(path)}catch(e){if(optional&&(e as NodeJS.ErrnoException).code==='ENOENT'){
   if(await realpath(project)!==root)throw unreadable();
   if(!inside(root,await realpath(dirname(path))))throw new ProjectError('section_outside','материалы раздела находятся вне папки проекта',403);
   return null;
  }throw e}
  const actual=await realpath(path);if(!inside(root,actual))throw new ProjectError('section_outside','материалы раздела находятся вне папки проекта',403);
  if(await realpath(project)!==root)throw unreadable();return actual;
 };
 const harness=await resolve(join(root,'.harness'),true);if(!harness)return result;
 if(!(await stat(harness)).isDirectory())throw unreadable();
 const start=join(harness,SECTION_PATHS[section]),actual=await resolve(start,true);if(!actual)return result;
 const add=async(path:string,actual:string)=>{
  if(result.items.length>=SECTION_LIMITS.files){limit('files');stopped=true;return}
  const before=await stat(actual);if(!before.isFile())throw unreadable();
  const file=await open(actual,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let text:string|null=null,truncated=false;
  try{
   const opened=await file.stat();if(opened.dev!==before.dev||opened.ino!==before.ino||!opened.isFile())throw unreadable();
   const buffer=Buffer.alloc(Math.min(opened.size,SECTION_LIMITS.textBytes+4));let length=0;
   while(length<buffer.length){const r=await file.read(buffer,length,buffer.length-length,length);if(!r.bytesRead)break;length+=r.bytesRead}
   truncated=opened.size>SECTION_LIMITS.textBytes;
   let end=Math.min(length,SECTION_LIMITS.textBytes);
   // A truncated UTF-8 prefix must not turn a text file into binary halfway through a character.
   if(truncated)while(end>0&&(buffer[end]!&0xc0)===0x80)end--;
   try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer.subarray(0,end));if(/[\u0000-\u0008\u000e-\u001f]/u.test(text))text=null}catch{text=null}
   const after=await file.stat(),current=await resolve(path);
   if(current!==actual||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw unreadable();
   const currentStat=await stat(current);if(currentStat.dev!==after.dev||currentStat.ino!==after.ino)throw unreadable();
  }finally{await file.close()}
  if(section==='memory'){
   if(text===null)throw unreadable();
   result.memoryState=truncated?'content':!text.trim()?'empty':seedPattern.test(compact(text))?'template':'content';
  }
  const p=relative(root,path).split(sep).join('/'),within=relative(start,path).split(sep).join('/');
  const item:SectionItem={path:p,name:basename(path),stage:section==='docs'&&within.includes('/')?within.slice(0,within.lastIndexOf('/')):null,bytes:before.size,modifiedAt:before.mtime.toISOString(),format:text===null?'binary':'text',text,truncated};
  let size=wireSize(item);
  // Reserve space for the response envelope, project path, orchestrator and explicit limits.
  if(bytes+size>SECTION_LIMITS.responseBytes-16*1024){item.text=text===null?null:'';item.truncated=true;size=wireSize(item);limit('response');stopped=true}
  if(bytes+size<=SECTION_LIMITS.responseBytes-16*1024){result.items.push(item);bytes+=size+2}else{limit('response');stopped=true}
 };
 const walk=async(path:string,actual:string,depth:number):Promise<void>=>{
  const info=await stat(actual);
  if(info.isFile()){await add(path,actual);return}
  if(!info.isDirectory()){if(section==='memory')throw unreadable();return}
  if(section==='memory')throw unreadable();
  if(depth>SECTION_LIMITS.depth){limit('depth');return}
  if(seen.has(actual))throw unreadable();seen.add(actual);
  const names=(await readdir(actual)).sort();
  if(await resolve(path)!==actual)throw unreadable();
  for(const name of names){if(stopped)break;const child=join(path,name),resolved=await resolve(child);await walk(child,resolved!,depth+1)}
  seen.delete(actual);
 };
 await walk(start,actual,0);
 if(await resolve(join(root,'.harness'))!==harness||await resolve(start)!==actual)throw unreadable();
 result.items.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 result.empty=!result.limited.length&&(section==='memory'?result.memoryState!=='content':!result.items.length);
 return result;
 }catch(e){if(e instanceof ProjectError)throw e;throw unreadable(e)}
}
