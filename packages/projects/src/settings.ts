import {join} from 'node:path';
import {withPathLock,MODE_IDS} from '@harnessy/team';
import {ownerPaths,readObject,writeJson,object,truthy} from './files.ts';
import {orderedClone,orderedKeys} from './compat-json.ts';
import {ProjectError} from './errors.ts';
import {SETTINGS_APPLIES,SETTINGS_SCOPE} from './strings.ts';
function repr(key:string){const quote=key.includes("'")&&!key.includes('"')?'"':"'";return quote+key.replaceAll('\\','\\\\').replaceAll(quote,'\\'+quote).replaceAll('\n','\\n').replaceAll('\r','\\r').replaceAll('\t','\\t')+quote}
export class Settings {
 private ownerFile:string;private currentProject:()=>string|null;private now:()=>number;
 constructor(ownerFile=ownerPaths().settings,currentProject:()=>string|null=()=>null,now=()=>Date.now()){this.ownerFile=ownerFile;this.currentProject=currentProject;this.now=now}
 projectPath(){const path=this.currentProject();return path?join(path,'.harness','state','settings.json'):null}
 get(){const owner=readObject(this.ownerFile),path=this.projectPath(),project=path?readObject(path):{};return {ok:true as const,owner,project,effective:orderedClone(owner,project),applies:SETTINGS_APPLIES}}
 effective(){return this.get().effective}
 async patch(scope:unknown,patch:unknown){
 scope=truthy(scope)?String(scope):'owner';if(!['owner','project'].includes(String(scope))||!object(patch)||!Object.keys(patch).length)throw new ProjectError('invalid_settings',SETTINGS_SCOPE);
 for(const key of orderedKeys(patch)){const value=patch[key];if([...key].length>40||!(/^[\p{L}\p{N}]+$/u.test(key.replaceAll('_',''))))throw new ProjectError('invalid_settings','ключ '+repr(key)+' не годится');
 if(value!==null&&!['string','number','boolean'].includes(typeof value)&&!Array.isArray(value))throw new ProjectError('invalid_settings','значение '+key+': только строка, число, флаг или список');
 if(key==='defaultMode'&&value!==null&&!MODE_IDS.includes(value as never))throw new ProjectError('invalid_settings','defaultMode: '+[...MODE_IDS].sort().join(', '))}
 const project=this.currentProject(),path=scope==='owner'?this.ownerFile:project?join(project,'.harness','state','settings.json'):null;if(!path)throw new ProjectError('invalid_settings','папка не открыта');
 return withPathLock(scope==='project'?project!:path,()=>{
 const cur=readObject(path),saved=orderedClone(cur);for(const key of orderedKeys(patch)){if(patch[key]===null)delete saved[key];else Object.defineProperty(saved,key,{value:patch[key],enumerable:true,configurable:true,writable:true})}
 const ordered=orderedClone(cur,saved);for(const key of orderedKeys(ordered))if(!Object.hasOwn(saved,key))delete ordered[key];writeJson(path,ordered);
 return {ok:true as const,scope,saved:ordered,effective:this.effective(),applies:SETTINGS_APPLIES,ts:Math.floor(this.now()/1000)}
 })
 }
}
