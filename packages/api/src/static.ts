import {realpath,stat,open,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,relative,isAbsolute,extname,sep} from 'node:path';
import type {ServerResponse} from 'node:http';
import {plain,writeReply} from './responses.ts';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const inside=(root:string,path:string)=>{const rel=relative(root,path);return !!rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)};
export async function serveFile(res:ServerResponse,path:string,head=false):Promise<void>{const content=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path).toLowerCase()]??'application/octet-stream','Content-Length':String(content.length)});res.end(head?undefined:content)}
export async function serveStatic(res:ServerResponse,rawPath:string,root:string,head=false):Promise<void>{
 res.setHeader('Cache-Control','no-cache');let file:Awaited<ReturnType<typeof open>>|undefined;
 try{
 if(!rawPath.startsWith('/sketches/'))throw Error('prefix');const segments=decodeURIComponent(rawPath.slice('/sketches/'.length)).split('/');
 if(segments.some(s=>s==='.'||s==='..'||s.includes('\\')||s.includes('\0')))throw Error('segment');
 const canonicalRoot=await realpath(root),path=await realpath(join(canonicalRoot,...segments));if(!inside(canonicalRoot,path))throw Error('outside');
 const before=await stat(path);if(!before.isFile())throw Error('not file');file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=await file.stat();
 if(before.dev!==opened.dev||before.ino!==opened.ino||!inside(canonicalRoot,await realpath(path)))throw Error('changed');
 const content=await file.readFile();res.writeHead(200,{'Content-Type':mime[extname(path).toLowerCase()]??'application/octet-stream','Content-Length':String(content.length)});res.end(head?undefined:content)
 }catch{if(!res.headersSent)writeReply(res,plain('404: Not Found',404),head);else res.destroy()}
 finally{await file?.close()}
}
