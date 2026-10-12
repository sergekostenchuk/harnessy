import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {ProviderError} from './types.ts';
import {shellQuote,type CatalogEntry} from './catalog.ts';
export interface TerminalOptions {platform?:string;temporaryDirectory?:string;open?(file:string):Promise<void>}
/** No request-supplied shell fragments. Terminal, not the engine, runs interactive login. */
export class LoginTerminal {
 private files=new Set<string>();private options:TerminalOptions;constructor(options:TerminalOptions={}){this.options=options}
 async launch(entry:CatalogEntry){if((this.options.platform??process.platform)!=='darwin')throw new ProviderError('platform_unsupported','Вход через Терминал поддерживается только на macOS');
 const directory=await mkdtemp(join(this.options.temporaryDirectory??tmpdir(),'harnessy-login-')),file=join(directory,'login.command');this.files.add(directory);
 try{const command=['/usr/bin/env',...entry.forbiddenEnv.flatMap(key=>['-u',key]),entry.binary,...entry.login.args].map(shellQuote).join(' ');
 await writeFile(file,'#!/bin/sh\n/bin/rm -f -- '+shellQuote(file)+'\n/bin/rmdir -- '+shellQuote(directory)+'\nexec '+command+'\n',{mode:0o700,flag:'wx'});
 await (this.options.open??(path=>new Promise<void>((resolve,reject)=>execFile('/usr/bin/open',['-a','Terminal',path],{timeout:10000},error=>error?reject(error):resolve()))))(file);
 }catch{await rm(directory,{recursive:true,force:true});this.files.delete(directory);throw new ProviderError('login_terminal_failed','Не удалось открыть Терминал')}
 }
 async close(){await Promise.all([...this.files].map(file=>rm(file,{recursive:true,force:true})));this.files.clear()}
}
