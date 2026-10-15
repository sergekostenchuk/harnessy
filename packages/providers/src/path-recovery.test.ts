import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverProgramPath} from './path-recovery.ts';
import type {spawnSync} from 'node:child_process';

test('TS-33: bare Finder PATH gets the login-shell PATH once, then known program directories',()=>{
 let calls=0;const run=((file:string,args:string[],options:any)=>{calls++;assert.equal(file,'/bin/zsh');assert.deepEqual(args,['-lc','printf %s "$PATH"']);assert.equal(options.timeout,3000);return {status:0,stdout:'/test/home/.local/bin:/usr/bin'}}) as unknown as typeof spawnSync;
 const value=recoverProgramPath({HOME:'/test/home',SHELL:'/bin/zsh',PATH:'/usr/bin:/bin'},run);
 assert.equal(calls,1);assert.equal(value.source,'login-shell');assert.equal(value.searched[0],'/test/home/.local/bin');assert.ok(value.searched.includes('/opt/homebrew/bin'));
 assert.equal(value.path.split(':').filter(x=>x==='/usr/bin').length,1);
});

test('TS-33: shell timeout falls back to known directories; complete PATH never starts a shell',()=>{
 const fail=((_file:string,_args:string[],options:any)=>{assert.equal(options.timeout,3000);return {status:null,stdout:''}}) as unknown as typeof spawnSync;
 const fallback=recoverProgramPath({HOME:'/test/home',PATH:'/usr/bin:/bin'},fail);assert.equal(fallback.source,'known-directories');assert.ok(fallback.searched.includes('/test/home/.local/bin'));
 const complete=recoverProgramPath({HOME:'/test/home',PATH:'/test/home/.local/bin:/usr/bin'},(()=>{throw Error('shell must not run')}) as typeof spawnSync);assert.equal(complete.source,'existing');
});
