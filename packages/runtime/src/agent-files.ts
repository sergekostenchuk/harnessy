import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readSync,writeSync,ftruncateSync,fsyncSync,mkdirSync,opendirSync} from 'node:fs';
import {resolve,relative,dirname,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

export class AgentFileError extends Error {readonly code:string;constructor(code:string,message:string){super(message);this.code=code}}
const fail=(code:string,message:string):never=>{throw new AgentFileError(code,message)};
const MAX_FILE=1024*1024,MAX_RESULT=64*1024;
const inside=(root:string,path:string)=>{const rel=relative(root,path);return rel===''||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)};
const same=(a:{dev:number;ino:number},b:{dev:number;ino:number})=>a.dev===b.dev&&a.ino===b.ino;

/** Synchronous operations retain an opened, checked file identity across the IO.
 * A write never opens an existing file with O_TRUNC before checking that identity. */
export class AgentFiles {
 readonly root:string;private writePaths:string[];private identity:{dev:number;ino:number};
 constructor(root:string,writePaths:string[]=[]){this.writePaths=writePaths;this.root=realpathSync(root);if(this.root!==resolve(root))fail('path_symlink','Корень проекта изменился или является символической ссылкой');this.identity=lstatSync(this.root);if(!lstatSync(this.root).isDirectory())fail('path_invalid','Папка проекта недоступна')}
 private path(input:unknown,writing=false):string {
  if(typeof input!=='string'||!input||input.length>4096||/[\x00-\x1f]/.test(input))fail('path_invalid','Нужен путь внутри проекта');
  const path=resolve(this.root,input as string),rel=relative(this.root,path);
  if(!inside(this.root,path))fail('path_outside','Путь находится вне проекта');
  if(rel.split(sep).includes('.git')||rel==='.harness'||rel.startsWith('.harness'+sep)&&rel!=='.harness'+sep+'evidence'&&!rel.startsWith('.harness'+sep+'evidence'+sep))fail('path_protected','Служебные файлы движка доступны только через инструменты Harnessy');
  if(writing&&!rel.startsWith('.harness'+sep+'evidence'+sep)&&this.writePaths.length&&!this.writePaths.some(p=>{const allowed=resolve(this.root,p.replace(/[/\\]\*\*$/,''));return inside(this.root,allowed)&&inside(allowed,path)}))fail('path_denied','Путь вне области правки места');
  this.check(path);return path;
 }
 private check(path:string):void {
  if(realpathSync(this.root)!==this.root||!same(lstatSync(this.root),this.identity))fail('path_changed','Папка проекта изменилась');
  let current=this.root;for(const part of relative(this.root,path).split(sep).filter(Boolean)){
   current=resolve(current,part);let stat;try{stat=lstatSync(current)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e}
   if(stat.isSymbolicLink())fail('path_symlink','Символические ссылки недоступны');
  }
  if(!inside(this.root,realpathSync(path)))fail('path_outside','Путь находится вне проекта');
 }
 private open(path:string,writing=false):number {
  this.check(path);const before=lstatSync(path);if(!before.isFile()||before.size>MAX_FILE)fail('file_invalid','Нужен обычный файл не больше 1 МиБ');
  if(writing&&before.nlink!==1)fail('path_linked','Файл имеет несколько жёстких ссылок');
  const fd=openSync(path,(writing?constants.O_RDWR:constants.O_RDONLY)|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{this.check(path);const after=fstatSync(fd);if(!after.isFile()||!same(before,after)||!same(after,lstatSync(path)))fail('path_changed','Файл изменился во время открытия');return fd}catch(e){closeSync(fd);throw e}
 }
 private bytes(fd:number):Buffer {
  const stat=fstatSync(fd);if(stat.size>MAX_FILE)fail('file_too_large','Файл больше 1 МиБ');const buffer=Buffer.alloc(stat.size+1);let count=0;
  while(count<buffer.length){const n=readSync(fd,buffer,count,buffer.length-count,count);if(!n)break;count+=n}
  if(count>stat.size||count>MAX_FILE)fail('file_changed','Размер файла изменился во время чтения');return buffer.subarray(0,count);
 }
 private decode(bytes:Buffer):string {try{const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(value.includes('\0'))throw Error();return value}catch{return fail('file_binary','Нужен текстовый файл UTF-8')}}
 read(input:string,offset=0,limit=MAX_RESULT){const path=this.path(input),fd=this.open(path);try{const bytes=this.bytes(fd);this.check(path);const text=this.decode(bytes),start=Math.min(text.length,Math.max(0,offset));let end=Math.min(text.length,start+Math.min(MAX_RESULT,limit));while(Buffer.byteLength(text.slice(start,end))>MAX_RESULT)end=start+Math.floor((end-start)*.9);if(end>start&&/[\uD800-\uDBFF]/.test(text[end-1]!))end--;return {path:relative(this.root,path),text:text.slice(start,end),truncated:text.length>end,nextOffset:end}}finally{closeSync(fd)}}
 stamp(input:string):string {const path=this.path(input,true);try{const fd=this.open(path);try{return createHash('sha256').update(this.bytes(fd)).digest('hex')}finally{closeSync(fd)}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return 'absent';throw e}}
 write(input:string,text:string,expected?:string){
  if(Buffer.byteLength(text)>MAX_FILE)fail('file_too_large','Текст больше 1 МиБ');const path=this.path(input,true);if(path===this.root)fail('file_invalid','Нужен путь файла');
  if(expected!==undefined&&this.stamp(input)!==expected)fail('file_changed','Файл изменился после запроса разрешения');
  const parent=dirname(path);let current=this.root;for(const part of relative(this.root,parent).split(sep).filter(Boolean)){current=resolve(current,part);this.check(dirname(current));try{mkdirSync(current)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}this.check(current)}
  let fd:number;try{fd=this.open(path,true)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;this.check(parent);fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o644)}
  try{this.check(path);const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||!same(stat,lstatSync(path)))fail('path_changed','Файл изменился во время открытия');const bytes=Buffer.from(text);let at=0;while(at<bytes.length)at+=writeSync(fd,bytes,at,bytes.length-at,at);ftruncateSync(fd,bytes.length);fsyncSync(fd);this.check(path);return {path:relative(this.root,path),bytes:bytes.length}}finally{closeSync(fd)}
 }
 edit(input:string,oldText:string,newText:string,expected?:string){if(!oldText)fail('edit_invalid','Нужен непустой исходный текст');const path=this.path(input,true),fd=this.open(path);let text:string;try{text=this.decode(this.bytes(fd))}finally{closeSync(fd)}
  const at=text.indexOf(oldText);if(at<0||text.indexOf(oldText,at+oldText.length)>=0)fail('edit_ambiguous','Исходный текст должен встречаться ровно один раз');return this.write(input,text.slice(0,at)+newText+text.slice(at+oldText.length),expected);
 }
 directory(){return this.path('.')}
 private entries(path:string,limit:number){const directory=opendirSync(path),entries:import('node:fs').Dirent[]=[];try{for(let i=0;i<limit;i++){const entry=directory.readSync();if(!entry)break;entries.push(entry)}this.check(path);return entries}finally{directory.closeSync()}}
 list(input='.'){const path=this.path(input);if(!lstatSync(path).isDirectory())fail('path_invalid','Нужна папка');const entries=this.entries(path,501);this.check(path);return {path:relative(this.root,path)||'.',entries:entries.slice(0,500).filter(e=>e.name!=='.git'&&e.name!=='.harness').map(e=>({name:e.name,type:e.isSymbolicLink()?'symlink':e.isDirectory()?'directory':e.isFile()?'file':'other'})),truncated:entries.length>500}}
 search(query:string,input='.'){if(!query||query.length>200)fail('search_invalid','Нужна строка поиска до 200 знаков');const start=this.path(input),hits:{path:string;line:number;text:string}[]=[],queue=[start];let visited=0,scanned=0,truncated=false;
  while(queue.length&&visited<2000&&hits.length<100&&scanned<8*MAX_FILE){const path=queue.shift()!;visited++;this.path(relative(this.root,path)||'.');const stat=lstatSync(path);
   if(stat.isDirectory()){const entries=this.entries(path,2001);if(entries.length>2000)truncated=true;for(const entry of entries.slice(0,2000)){if(entry.isSymbolicLink()||entry.name==='.git'||entry.name==='.harness')continue;if(queue.length<2000)queue.push(resolve(path,entry.name));else truncated=true}}
   else if(stat.isFile()&&stat.size<=MAX_FILE){try{const fd=this.open(path);let text:string;try{scanned+=stat.size;text=this.decode(this.bytes(fd))}finally{closeSync(fd)}this.check(path);for(const [index,line]of text.split('\n').entries())if(line.includes(query)){hits.push({path:relative(this.root,path),line:index+1,text:line.slice(0,400)});if(hits.length===100)break}}catch(e){if(!(e instanceof AgentFileError&&e.code==='file_binary'))throw e}}
  }
  return {matches:hits,truncated:truncated||queue.length>0||hits.length===100};
 }
}
