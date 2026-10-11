import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {withPathLock,canonicalPath,MODE_IDS} from '@harnessy/team';
import {ownerPaths,readObject,writeJson,object,truthy} from './files.ts';
import {orderedClone,orderedKeys,parseCompat} from '@harnessy/journal';
import {priceList,type ModelPrice} from './price-list.ts';
import {ProjectError} from './errors.ts';
import {SETTINGS_APPLIES,SETTINGS_SCOPE} from './strings.ts';
function repr(key:string){
 const quote=key.includes("'")&&!key.includes('"')?'"':"'";
 return quote+[...key].map(ch=>{if(ch===quote||ch==='\\')return '\\'+ch;if(ch==='\n')return '\\n';if(ch==='\r')return '\\r';if(ch==='\t')return '\\t';
 if(ch!==' '&&/[\p{C}\p{Z}]/u.test(ch)){const n=ch.codePointAt(0)!;return '\\'+(n<=0xff?'x':n<=0xffff?'u':'U')+n.toString(16).padStart(n<=0xff?2:n<=0xffff?4:8,'0')}return ch}).join('')+quote
}
export class Settings {
 private ownerFile:string;private currentProject:()=>string|null;private now:()=>number;
 constructor(ownerFile=ownerPaths().settings,currentProject:()=>string|null=()=>null,now=()=>Date.now()){this.ownerFile=ownerFile;this.currentProject=currentProject;this.now=now}
 projectPath(){const path=this.currentProject();return path?join(path,'.harness','state','settings.json'):null}
 private readOwner(writing=false){
  let raw:unknown;try{raw=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(canonicalPath(this.ownerFile))))}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};if(writing&&(e as NodeJS.ErrnoException).code==='EISDIR')throw new ProjectError('write_failed','не записано: '+String(e),500,e);throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается',409,e)}
  if(!object(raw))throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: настройки должны быть объектом',409);
  return raw;
 }
 private prices(owner:Record<string,unknown>):ModelPrice[]{try{return Object.hasOwn(owner,'priceList')?priceList(owner.priceList):[]}catch(e){throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: '+(e as Error).message,409,e)}}
 priceList(){return this.prices(this.readOwner())}
 private merged(owner:Record<string,unknown>,project:Record<string,unknown>){const overrides=orderedClone(project);delete overrides.priceList;return orderedClone(owner,overrides)}
 get(){const owner=this.readOwner(),path=this.projectPath(),project=path?readObject(path):{};this.prices(owner);return {ok:true as const,owner,project,effective:this.merged(owner,project),applies:SETTINGS_APPLIES}}
 // Broken prices must not prevent opening a project or reaching the owner's repair endpoint.
 effective(){const path=this.projectPath();return this.merged(readObject(this.ownerFile),path?readObject(path):{})}
 async patch(scope:unknown,patch:unknown){
 scope=truthy(scope)?String(scope):'owner';if(!['owner','project'].includes(String(scope))||!object(patch)||!Object.keys(patch).length)throw new ProjectError('invalid_settings',SETTINGS_SCOPE);
 const changes=orderedClone(patch);
 for(const key of orderedKeys(changes)){const value=changes[key];if([...key].length>40||!(/^[\p{L}\p{N}]+$/u.test(key.replaceAll('_',''))))throw new ProjectError('invalid_settings','ключ '+repr(key)+' не годится');
 if(key==='priceList'){if(scope!=='owner')throw new ProjectError('invalid_settings','priceList: только область owner');if(value!==null)changes[key]=priceList(value)}
 if(value!==null&&!['string','number','boolean'].includes(typeof value)&&!Array.isArray(value))throw new ProjectError('invalid_settings','значение '+key+': только строка, число, флаг или список');
 if(key==='defaultMode'&&value!==null&&!MODE_IDS.includes(value as never))throw new ProjectError('invalid_settings','defaultMode: '+[...MODE_IDS].sort().join(', '))}
 const project=this.currentProject(),selected=scope==='owner'?this.ownerFile:project?join(project,'.harness','state','settings.json'):null;if(!selected)throw new ProjectError('invalid_settings','папка не открыта');
 const path=canonicalPath(selected);
 return withPathLock(scope==='project'?project!:path,()=>{
 const cur=scope==='owner'?this.readOwner(true):readObject(path),saved=orderedClone(cur);for(const key of orderedKeys(changes)){if(changes[key]===null)delete saved[key];else Object.defineProperty(saved,key,{value:changes[key],enumerable:true,configurable:true,writable:true})}
 const ordered=orderedClone(cur,saved);for(const key of orderedKeys(ordered))if(!Object.hasOwn(saved,key))delete ordered[key];if(scope==='owner')this.prices(ordered);writeJson(path,ordered);
 return {ok:true as const,scope,saved:ordered,effective:this.effective(),applies:SETTINGS_APPLIES,ts:Math.floor(this.now()/1000)}
 })
 }
}
