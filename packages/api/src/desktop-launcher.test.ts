import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runInNewContext} from 'node:vm';

// Run the shipped startup handler with Electron/process doubles; no desktop or owner server is started.
const main=fs.readFileSync(new URL('../../../ui/desktop/main.js',import.meta.url),'utf8');
function desktop(t:import('node:test').TestContext,override=false,ready=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-desktop-')),bundled=path.join(root,'ui/desktop'),custom=path.join(root,'custom launcher'),directory=override?custom:bundled;
 fs.mkdirSync(directory,{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const launches:{file:string;options:any;detached:boolean}[]=[],descriptors:number[]=[],messages:string[]=[];
 t.after(()=>{for(const fd of descriptors)fs.closeSync(fd)});
 const context:any={__dirname:bundled,process:{env:override?{HARNESS_DIR:custom}:{}},URL,AbortSignal,setTimeout:(fn:()=>void)=>fn(),
  fetch:async()=>({ok:ready||launches.length>0}),require:(name:string)=>{
   if(name==='electron')return {app:{setName(){},requestSingleInstanceLock:()=>true},nativeTheme:{}};
   if(name==='child_process')return {spawn:(file:string,_args:string[],options:any)=>{const launch={file,options,detached:false};launches.push(launch);return {unref(){launch.detached=true}}}};
   if(name==='fs')return {...fs,openSync:(file:string,flags:fs.OpenMode)=>{const fd=fs.openSync(file,flags);descriptors.push(fd);return fd}};
   if(name==='path')return path;if(name==='os')return os;throw Error('unexpected module '+name);
  }};
 runInNewContext(main.slice(0,main.indexOf('const offline ='))+'\nglobalThis.start=ensureHarness;',context);
 return {directory,launches,messages,start:()=>context.start((message:string)=>messages.push(message))};
}
for(const override of [false,true])test('179: Electron starts the relocated engine with a fresh log directory'+(override?' and HARNESS_DIR override':''),async t=>{
 const d=desktop(t,override),launcher=path.join(d.directory,'run.sh');fs.writeFileSync(launcher,'#!/bin/sh\n',{mode:0o755});
 assert.equal(await d.start(),true);assert.equal(d.launches.length,1);assert.equal(d.launches[0]!.file,launcher);assert.equal(d.launches[0]!.options.cwd,d.directory);assert.equal(d.launches[0]!.detached,true);
 assert.equal(fs.existsSync(path.join(d.directory,'logs/server-desktop.log')),true);
});
test('179: existing engine needs no launcher; missing launcher reports failure without spawn or log writes',async t=>{
 const ready=desktop(t,false,true);assert.equal(await ready.start(),true);assert.equal(ready.launches.length,0);assert.equal(fs.existsSync(path.join(ready.directory,'logs')),false);
 const absent=desktop(t);assert.equal(await absent.start(),false);assert.equal(absent.launches.length,0);assert.equal(fs.existsSync(path.join(absent.directory,'logs')),false);assert.match(absent.messages[0]!,/нет .*run\.sh/);
});
