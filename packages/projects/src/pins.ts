import {basename} from 'node:path';
import {readFileSync} from 'node:fs';
import {canonicalPath,withPathLock} from '@harnessy/team';
import {parseCompat} from '@harnessy/journal';
import {ownerPaths,writeJson,expandUser,validDir,object,truthy,pythonTrim} from './files.ts';
import {ProjectError} from './errors.ts';
import type {Pin,ChatMeta} from './types.ts';
export class Pins {
 private path:string;private currentProject:()=>string|null;private chatMeta:(id:string)=>ChatMeta|null;
 constructor(path=ownerPaths().pins,currentProject:()=>string|null=()=>null,chatMeta:(id:string)=>ChatMeta|null=()=>null){this.path=path;this.currentProject=currentProject;this.chatMeta=chatMeta}
 private load(path=canonicalPath(this.path)):Pin[]{
  let raw:unknown;try{raw=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)))}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw new ProjectError('pins_unreadable','файл закреплённых не читается',409,e)}
  if(!Array.isArray(raw)||!raw.every((x):x is Pin=>object(x)&&(x.kind==='folder'||x.kind==='chat')&&typeof x.path==='string'&&!!x.path.trim()&&(x.kind!=='chat'||typeof x.chat==='string'&&!!x.chat.trim())&&['name','chat','title','label','pane'].every(k=>x[k]===undefined||typeof x[k]==='string')))throw new ProjectError('pins_unreadable','файл закреплённых не читается: неверный список закреплений',409);
  return raw;
 }
 get(){const cur=this.currentProject();return {pins:this.load().map(p=>({...p,current:!!cur&&canonicalPath(p.path)===canonicalPath(cur)}))}}
 async set(input:{kind?:unknown;path?:unknown;chat?:unknown;on?:unknown}){return withPathLock(this.path,lock=>{
 const fail=(message:string,status=400):never=>{throw new ProjectError('invalid_pin',message,status)};
 const kind=String(input.kind||'');if(!['folder','chat'].includes(kind)||!truthy(input.path))fail('kind: folder или chat; path обязателен');
 const path=canonicalPath(expandUser(pythonTrim(String(input.path)))),chat=kind==='chat'?pythonTrim(String(input.chat||'')):'';
 if(kind==='chat'&&!chat)fail('для чата нужен chat (id)');
 const pins=this.load(lock.path),idx=pins.findIndex(p=>p.kind===kind&&canonicalPath(p.path)===path&&(p.chat||'')===chat);
 // Removing a saved identity must work even after its folder or chat disappears.
 if(input.on===false){if(idx>=0)pins.splice(idx,1);writeJson(lock.path,pins,'файл закреплённых не записан: ');return {ok:true as const,on:false,pins}}
 if(!validDir(path))fail('нет такой папки',404);
 const entry:Pin={kind:kind as Pin['kind'],path,name:basename(path)||path};
 if(kind==='chat'){const current=this.currentProject();if(!current||canonicalPath(current)!==path)fail('закрепить можно только чат открытой папки');
 const meta=this.chatMeta(chat);if(!meta)fail('нет такого чата',404);Object.assign(entry,{chat,title:[...(meta!.title||'')].slice(0,80).join(''),label:meta!.label,pane:meta!.pane})}
 const on=input.on==null?idx<0:truthy(input.on);
 if(on&&idx<0)pins.push(entry);else if(!on&&idx>=0)pins.splice(idx,1);
 writeJson(lock.path,pins,'файл закреплённых не записан: ');return {ok:true as const,on,pins}
 })}
}
