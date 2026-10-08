import {realpathSync,lstatSync,readlinkSync,readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,basename,relative,isAbsolute,join} from 'node:path';
import {pythonTrim} from './compat-json.ts';
import {JournalError} from './types.ts';
const SECTIONS=['Ran','Skipped','Planned','Manual'];
// Like Path.resolve(strict=False), resolve existing ancestors of a missing file.
function realPath(path:string,links=0):string {
 if(links>40)throw new Error('слишком много символических ссылок');
 try{return realpathSync(path)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&(e as NodeJS.ErrnoException).code!=='ENOTDIR')throw e;
 try{if(lstatSync(path).isSymbolicLink())return realPath(resolve(dirname(path),readlinkSync(path)),links+1)}catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT'&&(err as NodeJS.ErrnoException).code!=='ENOTDIR')throw err}
 const parent=dirname(path);if(parent===path)return path;return join(realPath(parent,links),basename(path))
 }
}
export function resolveEvidence(projectRoot:string,path:unknown):string|null {
 if(typeof path!=='string'||!pythonTrim(path))return null;
 try{const root=realPath(resolve(projectRoot)),target=realPath(resolve(root,path)),rel=relative(root,target);return rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel)?null:target}catch{return null}
}
export function checkReport(path:string):string|null {
 if(!existsSync(path)||!statSync(path).isFile())return 'файла отчёта нет: '+path;
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(path))}catch{return 'отчёт не читается: '+path}
 if(!pythonTrim(text))return 'отчёт пуст: '+path;
 const found=new Set([...text.matchAll(/^[\p{White_Space}\u001c-\u001f]*(?:#{1,6}[\p{White_Space}\u001c-\u001f]*|\*\*|__)?[\p{White_Space}\u001c-\u001f]*(Ran|Sk[iİı]pped|Planned|Manual)(?![\p{L}\p{N}_])/gimu)].map(m=>m[1]!.replaceAll('ſ','s').replaceAll('İ','i').replaceAll('ı','i').toLowerCase()));
 const missing=SECTIONS.filter(section=>!found.has(section.toLowerCase()));return missing.length?'в отчёте '+basename(path)+' нет разделов: '+missing.join(', ')+' (контракт Ran / Skipped / Planned / Manual)':null
}
export function evidenceDir(projectRoot:string,thread:string,round:number):string {
 const path=resolveEvidence(projectRoot,isAbsolute(thread)?join(thread,'r'+round):join('.harness','evidence',thread,'r'+round));if(!path)throw new JournalError('evidence_outside','путь свидетельства вне проекта: '+thread);return path
}
export class Evidence {
 readonly projectRoot:string;constructor(projectRoot:string){this.projectRoot=projectRoot}
 resolve(path:unknown){return resolveEvidence(this.projectRoot,path)}checkReport(path:string){return checkReport(path)}dir(thread:string,round:number){return evidenceDir(this.projectRoot,thread,round)}
}
