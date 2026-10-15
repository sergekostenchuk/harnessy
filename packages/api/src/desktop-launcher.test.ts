import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';

const main=fs.readFileSync(new URL('../../../ui/desktop/main.js',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../../../ui/desktop/preload.js',import.meta.url),'utf8');
const requireFromTest=createRequire(import.meta.url),{contextMenuTemplate}=requireFromTest('../../../ui/desktop/context-menu.js'),{EngineManager,defaultPaths}=requireFromTest('../../../ui/desktop/engine.js');

class Child extends EventEmitter {
 exitCode:number|null=null;signalCode:string|null=null;kills:string[]=[];
 kill(signal:string){this.kills.push(signal);this.signalCode=signal;queueMicrotask(()=>this.emit('exit',null,signal));return true}
}

test('TS-30: packaged engine uses Electron Node, skips an occupied port and stops the managed child',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-desktop-')),engineRoot=path.join(root,'engine'),entry=path.join(engineRoot,'api.js'),site=path.join(root,'site'),logs=path.join(root,'home','.harnessy');
 fs.mkdirSync(engineRoot,{recursive:true});fs.mkdirSync(site,{recursive:true});fs.writeFileSync(entry,'');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const launches:{file:string;args:string[];options:any;child:Child}[]=[];
 const manager=new EngineManager({paths:{engineRoot,entry,site},execPath:'/Applications/Harnessy-alpha.app/Contents/MacOS/Harnessy-alpha',env:{PATH:'/usr/bin:/bin'},logDirectory:logs,
  portAvailable:async(port:number)=>port!==3777,fetch:async()=>({ok:launches.length>0}),spawn:(file:string,args:string[],options:any)=>{const child=new Child();launches.push({file,args,options,child});return child}});
 const result=await manager.start();assert.equal(result.port,3778);assert.equal(result.url,'http://127.0.0.1:3778/sketches/proto/10-new-chat.html');assert.equal(launches.length,1);
 const launch=launches[0]!;assert.equal(launch.file,'/Applications/Harnessy-alpha.app/Contents/MacOS/Harnessy-alpha');assert.deepEqual(launch.args,[entry]);assert.equal(launch.options.detached,false);assert.equal(launch.options.shell,false);assert.equal(launch.options.env.ELECTRON_RUN_AS_NODE,'1');assert.equal(launch.options.env.PORT,'3778');assert.equal(launch.options.env.HARNESSY_SITE,site);assert.equal(launch.options.stdio[3],'ipc');assert.equal(fs.statSync(path.join(logs,'server-desktop.log')).mode&0o777,0o600);
 const restarted=await manager.restart();assert.equal(restarted.port,3778);assert.equal(launches.length,2);assert.deepEqual(launch.child.kills,['SIGTERM']);
 await manager.stop();assert.deepEqual(launches[1]!.child.kills,['SIGTERM']);
});

test('TS-30: external development URL does not start a child and packaged paths stay inside Resources',async()=>{
 let spawned=false;const manager=new EngineManager({externalUrl:'http://127.0.0.1:4555/custom',fetch:async()=>({ok:true}),spawn:()=>{spawned=true;throw Error('unexpected')}});
 assert.deepEqual(await manager.start(),{origin:'http://127.0.0.1:4555',url:'http://127.0.0.1:4555/custom',managed:false});assert.equal(spawned,false);
 const packaged=defaultPaths('/app.asar','/Bundle/Contents/Resources',true),development=defaultPaths('/repo/ui/desktop','/unused',false);
 assert.equal(packaged.entry,'/Bundle/Contents/Resources/engine/node_modules/@harnessy/api/dist/bin/harnessy.js');assert.equal(packaged.site,'/Bundle/Contents/Resources/site/sketches');assert.equal(development.site,'/repo/ui/deploy/out/site/sketches');
});

test('TS-30: stop during readiness cancels that launch without spawning a replacement',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-desktop-stop-')),engineRoot=path.join(root,'engine'),entry=path.join(engineRoot,'api.js');fs.mkdirSync(engineRoot,{recursive:true});fs.writeFileSync(entry,'');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const children:Child[]=[];const manager=new EngineManager({paths:{engineRoot,entry,site:root},logDirectory:path.join(root,'logs'),readyAttempts:50,readyWaitMs:1,portAvailable:async()=>true,fetch:async()=>({ok:false}),spawn:()=>{const child=new Child();children.push(child);return child}});
 const start=manager.start(),rejected=assert.rejects(start,/запуск движка отменён/);while(children.length===0)await new Promise(resolve=>setTimeout(resolve,0));await manager.stop();await rejected;await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(children.length,1);assert.deepEqual(children[0]!.kills,['SIGTERM']);
});

test('TS-30: desktop shutdown owns the child and clean first launch keeps the TS-19 path',()=>{
 const engine=fs.readFileSync(new URL('../../../ui/desktop/engine.js',import.meta.url),'utf8'),entry=fs.readFileSync(new URL('../bin/harnessy.ts',import.meta.url),'utf8');
 assert.doesNotMatch(main,/run\.sh|detached:\s*true|\.unref\(\)/);assert.match(main,/app\.on\('before-quit'/);assert.match(main,/19-first-run\.html/);assert.match(main,/\.harness-projects\.json/);
 assert.match(engine,/ELECTRON_RUN_AS_NODE:'1'/);assert.match(engine,/stdio:\['ignore',output,output,'ipc'\]/);assert.match(entry,/process\.once\('disconnect',stop\)/);
});

test('TS-30: alpha acknowledgement is exact-version and build metadata stays visibly alpha',()=>{
 const release=requireFromTest('../../../ui/deploy/release.js'),values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
 const a={channel:'alpha',version:'0.1.0-alpha',label:'alpha · 0.1.0'},b={channel:'alpha',version:'0.1.1-alpha',label:'alpha · 0.1.1'};
 assert.equal(release.accepted(storage,a),false);release.remember(storage,a);assert.equal(release.accepted(storage,a),true);assert.equal(release.accepted(storage,b),false);assert.equal(release.releaseValue({channel:'beta',version:'0.1.0-alpha'}),null);
 const desktop=JSON.parse(fs.readFileSync(new URL('../../../ui/desktop/package.json',import.meta.url),'utf8')),builder=fs.readFileSync(new URL('../../../ui/desktop/electron-builder.yml',import.meta.url),'utf8'),build=fs.readFileSync(new URL('../../../ui/desktop/build-engine.mjs',import.meta.url),'utf8'),testers=fs.readFileSync(new URL('../../../ui/desktop/TESTERS.md',import.meta.url),'utf8');
 assert.match(desktop.version,/^0\.1\.\d+-alpha/);assert.equal(desktop.productName,'Harnessy-alpha');assert.match(desktop.scripts.dist,/electron-builder --mac --arm64/);assert.match(builder,/asar: true/);assert.match(builder,/target: dmg/);assert.match(builder,/target: zip/);assert.match(builder,/from: engine\/node_modules[\s\S]*to: engine\/node_modules/);assert.match(builder,/from: engine[\s\S]*from: \.\.\/deploy\/out\/site/);assert.match(builder,/Harnessy-alpha-/);
 assert.match(build,/rewriteRelativeImportExtensions|tsconfig\.engine/);assert.match(build,/unsafeFiles/);assert.match(testers,/Node\.js не нужен/);assert.match(testers,/связке ключей macOS/);assert.match(testers,/server-desktop\.log/);
});

test('TS-25: desktop menu follows edit state and keeps quote/image actions on their exact context',()=>{
 const editable=contextMenuTemplate({isEditable:true,editFlags:{canCut:false,canCopy:true,canPaste:true,canSelectAll:false}},{},{});
 assert.deepEqual(editable.map((item:any)=>[item.label,item.role,item.enabled]),[['Вырезать','cut',false],['Копировать','copy',true],['Вставить','paste',true],['Выделить всё','selectAll',false]]);
 const actions:string[]=[],params={isEditable:false,selectionText:'точная цитата',mediaType:'image',x:4,y:7,editFlags:{canCopy:true,canCopyImage:true}},menu=contextMenuTemplate(params,{quote:true,text:'точная цитата'},{quote:(text:string)=>actions.push('quote:'+text),transfer:(text:string)=>actions.push('transfer:'+text),copyImage:()=>actions.push('image')});
 assert.deepEqual(menu.map((item:any)=>item.label),['Копировать','Ответить цитатой','Передать','Копировать картинку']);menu[1].click();menu[2].click();menu[3].click();assert.deepEqual(actions,['quote:точная цитата','transfer:точная цитата','image']);
 const padded=contextMenuTemplate({...params,selectionText:'  точная цитата\r\n'},{quote:true,text:'точная цитата'},{quote:(text:string)=>actions.push('padded:'+text)});padded[1].click();assert.equal(actions.at(-1),'padded:точная цитата');
 assert.deepEqual(contextMenuTemplate({...params,selectionText:'',mediaType:'none'},{quote:true,text:'старая цитата'},{}).map((item:any)=>[item.label,item.enabled]),[['Копировать',false]]);
 assert.deepEqual(contextMenuTemplate({...params,mediaType:'none'},{quote:true,text:'другая цитата'},{}).map((item:any)=>item.label),['Копировать']);
 assert.match(main,/webContents\.on\('context-menu'/);assert.match(main,/copyImageAt\(params\.x, params\.y\)/);assert.match(main,/did-start-navigation[\s\S]*contextMeta\.delete/);
});

test('TS-27: preload publishes same-message selection asynchronously and never blocks an older shell',()=>{
 const listeners:Record<string,Function>={},ipc:Record<string,Function>={},sent:any[]=[],exposed:Record<string,any>={};
 const messageA={},messageB={},content=(message:any,image=false)=>({nodeType:1,closest(selector:string){if(selector==='.live-message-text,.md-body')return this;if(selector==='.live-msg'||selector==='.live-msg[data-message-index]')return message;if(selector==='.live-message-images img')return image?this:null;return null}}),a=content(messageA),b=content(messageB),selection:any={isCollapsed:false,rangeCount:1,anchorNode:{nodeType:3,parentElement:a},focusNode:{nodeType:3,parentElement:a},toString:()=> 'выделенная цитата'};
 const context:any={setTimeout:(fn:Function)=>fn(),document:{getSelection:()=>selection,addEventListener:(type:string,fn:Function)=>listeners[type]=fn},require:(name:string)=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(name:string,value:any)=>exposed[name]=value},ipcRenderer:{invoke(){},send:(channel:string,value:any)=>sent.push([channel,value]),on:(channel:string,fn:Function)=>ipc[channel]=fn,removeListener:(channel:string)=>delete ipc[channel]}}}};
 runInNewContext(preload,context);listeners.selectionchange!();assert.deepEqual(JSON.parse(JSON.stringify(sent[0])),['harnessy:context-meta',{quote:true,text:'выделенная цитата'}]);
 selection.focusNode={nodeType:3,parentElement:b};listeners.selectionchange!();assert.equal(sent[1][1].quote,false);
 selection.focusNode=selection.anchorNode={nodeType:3,parentElement:{nodeType:1,closest:()=>null}};listeners.selectionchange!();assert.equal(sent.length,2);assert.equal(sent.at(-1)[1].quote,false);assert.doesNotMatch(preload,/sendSync/);
 let quote='',transfer='';const dispose=exposed.harnessy.onQuote((text:string)=>quote=text),disposeTransfer=exposed.harnessy.onTransfer((text:string)=>transfer=text);ipc['harnessy:quote-selection']!({},'из меню');ipc['harnessy:transfer-selection']!({},'выбранное');assert.equal(quote,'из меню');assert.equal(transfer,'выбранное');dispose();disposeTransfer();assert.equal(ipc['harnessy:quote-selection'],undefined);assert.equal(ipc['harnessy:transfer-selection'],undefined);assert.equal(exposed.harnessy.ipcRenderer,undefined);assert.equal(exposed.harnessy.desktop,true);
});
