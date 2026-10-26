import {constants} from 'node:fs';
import {open,realpath,stat} from 'node:fs/promises';
import {basename,extname,isAbsolute,relative,resolve,sep} from 'node:path';
import type {Runtime} from '@harnessy/runtime';
import {RuntimeError} from '@harnessy/runtime';
import type {Route} from './routes.ts';
import {failure,json,type Reply} from './responses.ts';

export const PROJECT_FILE_LIMIT=32*1024*1024;
const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8','.json':'application/json; charset=utf-8','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const within=(root:string,file:string)=>{const rel=relative(root,file);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)};
const denied=()=>new RuntimeError('file_outside','Файл должен находиться внутри проекта.',403);
export function projectFileRoutes(r:Runtime):Route[]{return [{method:'GET',path:'/api/project/file',style:'J',handle:async({query})=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"};
 let file:Awaited<ReturnType<typeof open>>|undefined;
 try{
  const p=r.project,current=()=>{if(p.closed||r.project!==p||query.get('project')!==p.dir)throw new RuntimeError('project_changed','Проект изменился. Откройте файл из текущего проекта.',409)};current();
  const path=query.get('path');if(!path||path.length>4096||/[\x00-\x1f\\]/.test(path))throw new RuntimeError('file_invalid','Нужен путь к файлу проекта.',400);
  if(query.get('text')==='1'){const instruction=r.instructionFile(path);if(instruction)return {...json(instruction),headers}}
  const root=await realpath(p.dir),requested=resolve(root,path);if(!within(root,requested))throw denied();
  const canonical=await realpath(requested);if(!within(root,canonical))throw denied();
  file=await open(canonical,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const info=await file.stat();if(!info.isFile())throw new RuntimeError('file_invalid','Можно открыть только файл, не каталог.',400);
  if(info.size>PROJECT_FILE_LIMIT)throw new RuntimeError('file_too_large','Размер файла превышает 32 МБ.',413);
  const verify=async()=>{current();const resolved=await realpath(requested);if(!within(root,resolved))throw denied();const actual=await stat(resolved),opened=await file!.stat();if(resolved!==canonical||actual.dev!==info.dev||actual.ino!==info.ino||opened.size!==info.size||opened.mtimeMs!==info.mtimeMs||opened.ctimeMs!==info.ctimeMs)throw new RuntimeError('file_changed','Файл изменился. Откройте его снова.',409);current()};
  await verify();const name=basename(canonical),type=types[extname(name).toLowerCase()]??'application/octet-stream';
  if(query.get('meta')==='1')return {...json({ok:true,project:p.dir,path,name,size:info.size,type}),headers};
  const bytes=Buffer.alloc(info.size+1);let length=0;while(length<bytes.length){const part=await file.read(bytes,length,bytes.length-length,length);if(!part.bytesRead)break;length+=part.bytesRead}
  await verify();if(length!==info.size)throw new RuntimeError('file_changed','Файл изменился. Откройте его снова.',409);
  if(query.get('text')==='1'){
   if(!['.md','.txt','.csv'].includes(extname(name).toLowerCase()))throw new RuntimeError('file_invalid','Предпросмотр доступен для Markdown, CSV и текста.',400);
   if(length>256*1024)throw new RuntimeError('file_too_large','Для предпросмотра нужен файл не больше 256 КБ.',413);
   return {...json({ok:true,project:p.dir,path,name,size:length,text:bytes.subarray(0,length).toString('utf8')}),headers};
  }
  const inline=/^(?:image\/|video\/|application\/pdf$|text\/)/.test(type);
  return {status:200,value:null,bytes:bytes.subarray(0,length),headers:{...headers,'Content-Type':type,'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}} satisfies Reply;
 }catch(error){let reply:Reply;if(error instanceof RuntimeError)reply=failure(error,'J');else{const code=(error as NodeJS.ErrnoException).code;reply=json({ok:false,code:code==='ENOENT'?'file_missing':'file_unreadable',error:code==='ENOENT'?'Файл не найден.':'Не удалось прочитать файл.'},code==='ENOENT'?404:409)}return {...reply,headers:{...reply.headers,...headers}}}
 finally{await file?.close()}
 }}]}
