import {AsyncLocalStorage} from 'node:async_hooks';
import {lstatSync,realpathSync,readlinkSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {isAbsolute,parse,sep,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
// Preserve symlink/.. order for existing prefixes, including paths not created yet.
export function canonicalPath(path:string,links={count:0}):string {
 const full=isAbsolute(path)?path:process.cwd()+sep+path;let current=parse(full).root;
 for(const part of full.slice(current.length).split(sep)){
 if(!part||part==='.')continue;if(part==='..'){current=dirname(current);continue}
 const next=current.endsWith(sep)?current+part:current+sep+part;
 try{const st=lstatSync(next);if(st.isSymbolicLink()){
 if(++links.count>40)throw Error('слишком много символических ссылок');
 const target=readlinkSync(next);current=canonicalPath(isAbsolute(target)?target:current+sep+target,links)
 }else current=realpathSync(next)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;current=next}
 }return current
}
const tails=new Map<string,Promise<void>>(),held=new AsyncLocalStorage<ReadonlySet<string>>();
export async function withPathLock<T>(path:string,fn:()=>T|Promise<T>):Promise<T>{
 const key=canonicalPath(path),parent=held.getStore();if(parent?.has(key))return fn();
 const previous=tails.get(key)??Promise.resolve();let release!:()=>void;
 const current=new Promise<void>(r=>{release=r});tails.set(key,current);await previous;
 try{return await held.run(new Set([...(parent??[]),key]),fn)}finally{release();if(tails.get(key)===current)tails.delete(key)}
}
export function atomicWrite(path:string,text:string,replace:(from:string,to:string)=>void=renameSync):void {
 const temp=path+'.'+randomUUID()+'.tmp';let fd:number|undefined;
 try{fd=openSync(temp,'wx');writeFileSync(fd,text,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;replace(temp,path)}
 finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
}
