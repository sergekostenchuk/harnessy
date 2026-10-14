import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';

// Run the shipped startup handler with Electron/process doubles; no desktop or owner server is started.
const main=fs.readFileSync(new URL('../../../ui/desktop/main.js',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../../../ui/desktop/preload.js',import.meta.url),'utf8');
const requireFromTest=createRequire(import.meta.url),{contextMenuTemplate}=requireFromTest('../../../ui/desktop/context-menu.js');
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

test('TS-25: desktop menu follows edit state and keeps quote/image actions on their exact context',()=>{
 const editable=contextMenuTemplate({isEditable:true,editFlags:{canCut:false,canCopy:true,canPaste:true,canSelectAll:false}},{},{});
 assert.deepEqual(editable.map((item:any)=>[item.label,item.role,item.enabled]),[['Вырезать','cut',false],['Копировать','copy',true],['Вставить','paste',true],['Выделить всё','selectAll',false]]);
 const actions:string[]=[],params={isEditable:false,selectionText:'точная цитата',mediaType:'image',x:4,y:7,editFlags:{canCopy:true,canCopyImage:true}},menu=contextMenuTemplate(params,{quote:true,text:'точная цитата',image:true},{quote:(text:string)=>actions.push('quote:'+text),copyImage:()=>actions.push('image')});
 assert.deepEqual(menu.map((item:any)=>item.label),['Копировать','Ответить цитатой','Копировать картинку']);menu[1].click();menu[2].click();assert.deepEqual(actions,['quote:точная цитата','image']);
 const padded=contextMenuTemplate({...params,selectionText:'  точная цитата\r\n'},{quote:true,text:'точная цитата',image:false},{quote:(text:string)=>actions.push('padded:'+text)});padded[1].click();assert.equal(actions.at(-1),'padded:точная цитата');
 assert.deepEqual(contextMenuTemplate({...params,selectionText:''},{quote:true,text:'старая цитата',image:false},{}).map((item:any)=>[item.label,item.enabled]),[['Копировать',false]]);
 assert.deepEqual(contextMenuTemplate(params,{quote:true,text:'другая цитата',image:false},{}).map((item:any)=>item.label),['Копировать']);
 assert.match(main,/webContents\.on\('context-menu'/);assert.match(main,/copyImageAt\(params\.x, params\.y\)/);
});

test('TS-25: preload proves same-message selection before exposing quote and never exposes Node',()=>{
 const listeners:Record<string,Function>={},ipc:Record<string,Function>={},sent:any[]=[],exposed:Record<string,any>={};
 const messageA={},messageB={},content=(message:any,image=false)=>({nodeType:1,closest(selector:string){if(selector==='.live-message-text,.md-body')return this;if(selector==='.live-msg'||selector==='.live-msg[data-message-index]')return message;if(selector==='.live-message-images img')return image?this:null;return null}}),a=content(messageA),b=content(messageB),selection:any={isCollapsed:false,rangeCount:1,anchorNode:{nodeType:3,parentElement:a},focusNode:{nodeType:3,parentElement:a},toString:()=> 'выделенная цитата'};
 const context:any={document:{getSelection:()=>selection,addEventListener:(type:string,fn:Function)=>listeners[type]=fn},require:(name:string)=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(name:string,value:any)=>exposed[name]=value},ipcRenderer:{invoke(){},sendSync:(channel:string,value:any)=>{sent.push([channel,value]);return true},on:(channel:string,fn:Function)=>ipc[channel]=fn,removeListener:(channel:string)=>delete ipc[channel]}}}};
 runInNewContext(preload,context);listeners.contextmenu!({target:a});assert.deepEqual(JSON.parse(JSON.stringify(sent[0])),['harnessy:context-meta',{quote:true,text:'выделенная цитата',image:false}]);
 selection.focusNode={nodeType:3,parentElement:b};listeners.contextmenu!({target:b});assert.equal(sent[1][1].quote,false);
 selection.focusNode=selection.anchorNode={nodeType:3,parentElement:{nodeType:1,closest:()=>null}};listeners.contextmenu!({target:a});assert.equal(sent[2][1].quote,false);
 let quote='';const dispose=exposed.harnessy.onQuote((text:string)=>quote=text);ipc['harnessy:quote-selection']!({},'из меню');assert.equal(quote,'из меню');dispose();assert.equal(ipc['harnessy:quote-selection'],undefined);assert.equal(exposed.harnessy.ipcRenderer,undefined);assert.equal(exposed.harnessy.desktop,true);
});
