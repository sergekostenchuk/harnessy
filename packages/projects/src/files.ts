import {readFileSync,mkdirSync,statSync} from 'node:fs';
import {dirname,join,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {atomicWrite,pyTruthy} from '@harnessy/team';
import {parseCompat,compatJson,pythonTrim} from './compat-json.ts';
import {ProjectError} from './errors.ts';
import type {OwnerPaths,JsonObject} from './types.ts';
export function object(v:unknown):v is JsonObject{return !!v&&typeof v==='object'&&!Array.isArray(v)}
export function truthy(v:unknown){return pyTruthy(v)&&(!object(v)||Object.keys(v).length>0)}
export function expandUser(path:string,home=homedir()){return path==='~'?home:path.startsWith('~/')?join(home,path.slice(2)):path}
export function validDir(path:unknown):path is string {if(typeof path!=='string'||!isAbsolute(path))return false;try{return statSync(path).isDirectory()}catch{return false}}
export function ownerPaths(env:NodeJS.ProcessEnv=process.env,home=homedir()):OwnerPaths {
 const file=(key:string,fallback:string)=>expandUser(env[key]||join(home,fallback),home);
 return {projects:file('HARNESS_PROJECTS_FILE','.harness-projects.json'),lastProject:file('HARNESS_LAST_PROJECT_FILE','.harness-last-project'),pins:file('HARNESS_PINS_FILE','.harness-pins.json'),settings:file('HARNESS_SETTINGS_FILE','.harness-settings.json'),connections:file('HARNESS_CONNECTIONS_FILE','.harness-connections.json')}
}
export function readJson(path:string):unknown {try{return parseCompat(readFileSync(path,'utf8'))}catch{return null}}
export function readObject(path:string):JsonObject {const data=readJson(path);return object(data)?data:{}}
export function writeJson(path:string,data:unknown,prefix='не записано: '){try{mkdirSync(dirname(path),{recursive:true});atomicWrite(path,compatJson(data,1))}catch(e){throw new ProjectError('write_failed',prefix+(e instanceof Error?e.message:String(e)),500,e)}}
export function text(value:unknown){return String(value??'')}
export {pythonTrim};
