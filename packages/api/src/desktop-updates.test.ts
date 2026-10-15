import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {setImmediate as immediate} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';

const requireFromTest=createRequire(import.meta.url);
const {DesktopUpdates,CHECK_INTERVAL_MS,readChannel,RELEASE_REPOSITORY,trustedUpdateOrigin}=requireFromTest('../../../ui/desktop/updates.js');
const {requireSigningEnvironment}=requireFromTest('../../../ui/desktop/signing.js');
const read=(file:string)=>fs.readFileSync(new URL('../../../'+file,import.meta.url),'utf8');

class FakeUpdater extends EventEmitter {
 channel='latest';allowPrerelease=false;allowDowngrade=false;autoDownload=false;autoInstallOnAppQuit=true;
 checks=0;manifest:string|null=null;installed=false;installArgs:unknown[]=[];
 async checkForUpdates(){this.checks++;if(this.manifest)this.emit('update-downloaded',{version:this.manifest});return {updateInfo:this.manifest&&{version:this.manifest}}}
 quitAndInstall(...args:unknown[]){this.installArgs=args;this.installed=true}
}

test('TS-31: signed build fails closed without all five environment inputs and keeps credentials out of errors',()=>{
 const env={CSC_LINK:'certificate-marker',CSC_KEY_PASSWORD:'password-marker',APPLE_API_KEY:'/tmp/fake-auth-key.p8',APPLE_API_KEY_ID:'key-id-marker',APPLE_API_ISSUER:'issuer-marker'};
 for(const key of Object.keys(env)){const partial={...env};delete (partial as Record<string,string>)[key];assert.throws(()=>requireSigningEnvironment(partial,()=>true),new RegExp(key))}
 assert.throws(()=>requireSigningEnvironment(env,()=>false),/APPLE_API_KEY.*\.p8/);
 assert.equal(requireSigningEnvironment(env,()=>true),true);
 const message=(()=>{try{requireSigningEnvironment({},()=>false)}catch(error){return String(error)}return ''})();
 for(const secret of Object.values(env))assert.doesNotMatch(message,new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const packageJson=JSON.parse(read('ui/desktop/package.json')),builder=read('ui/desktop/electron-builder.yml'),entitlements=read('ui/desktop/entitlements.mac.plist'),workflow=read('.github/workflows/desktop-release.yml');
 assert.match(packageJson.scripts.dist,/node signing\.js/);assert.match(builder,/identity: Developer ID Application/);assert.match(builder,/hardenedRuntime: true/);assert.match(builder,/notarize: true/);
 assert.match(entitlements,/com\.apple\.security\.cs\.allow-jit/);assert.match(entitlements,/com\.apple\.security\.network\.client/);assert.match(entitlements,/com\.apple\.security\.network\.server/);
 assert.doesNotMatch(entitlements,/\<key\>com\.apple\.security\.app-sandbox\<\/key\>/);
 assert.match(builder,new RegExp('repo: '+RELEASE_REPOSITORY));assert.match(workflow,/tags:[\s\S]*v\*/);assert.match(workflow,/secrets\.HARNESSY_RELEASE_TOKEN/);
 assert.ok(workflow.includes("git for-each-ref --format='%(contents)'"));assert.match(workflow,/gh release create/);assert.match(workflow,/spctl --assess/);assert.match(workflow,/stapler validate/);
});

test('TS-31: beta/latest selection persists, checks on startup and every six hours, and stable ignores prereleases',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-updates-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.join(directory,'updates.json'),updater=new FakeUpdater(),states:any[]=[];let tick:(()=>void)|null=null,interval=0,cleared=false;
 const updates=new DesktopUpdates({updater,packaged:true,repositoryReady:true,file,notify:(state:any)=>states.push(state),setInterval:(fn:()=>void,ms:number)=>{tick=fn;interval=ms;return 1},clearInterval:()=>{cleared=true}});
 updater.manifest='0.2.0-beta.1';updates.start();await immediate();
 assert.equal(updater.checks,1);assert.equal(interval,CHECK_INTERVAL_MS);assert.equal(updates.state().readyVersion,null);assert.equal(updater.autoDownload,true);assert.equal(updater.autoInstallOnAppQuit,false);
 updater.manifest='0.2.0';tick!();await immediate();assert.equal(updates.state().readyVersion,'0.2.0');
 await updates.setChannel('beta');await immediate();assert.equal(readChannel(file),'beta');assert.equal(updater.channel,'beta');assert.equal(updater.allowPrerelease,true);assert.equal(updater.allowDowngrade,false);assert.equal(updates.state().readyVersion,'0.2.0');
 updater.manifest='0.3.0-beta.1';tick!();await immediate();assert.equal(updates.state().readyVersion,'0.3.0-beta.1');
 await updates.setChannel('latest');await immediate();assert.equal(updates.state().readyVersion,null);assert.equal(updater.allowPrerelease,false);assert.equal(updates.state().channel,'latest');
 assert.deepEqual(states.at(-1)?.channel,'latest');updates.dispose();assert.equal(cleared,true);
 await assert.rejects(updates.setChannel('nightly'),/Неизвестный канал/);
});

test('TS-31: replacing a downloaded version stops the managed engine before installer restart',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-update-install-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const updater=new FakeUpdater(),events:string[]=[],file=path.join(directory,'updates.json');
 const updates=new DesktopUpdates({updater,packaged:true,repositoryReady:true,file,setInterval:()=>0,stopEngine:async()=>{events.push('engine.stop')},resumeEngine:async()=>{events.push('engine.start')},allowQuit:(yes:boolean)=>events.push('allowQuit='+yes)});
 updater.quitAndInstall=(...args:unknown[])=>{events.push('quitAndInstall');updater.installArgs=args};
 updates.start();updater.emit('update-downloaded',{version:'0.2.0-beta.1'});assert.equal(updates.state().readyVersion,null);
 await updates.setChannel('beta');updater.emit('update-downloaded',{version:'0.2.0-beta.1'});
 await updates.install();assert.deepEqual(events,['engine.stop','allowQuit=true','quitAndInstall']);assert.deepEqual(updater.installArgs,[false,true]);
 assert.match(read('ui/desktop/main.js'),/app\.whenReady\(\)\.then\(async\(\)=>\{await createWindow\(\);updates\.start\(\)\}\)/);
 const failing=new FakeUpdater();const recovery:string[]=[],second=new DesktopUpdates({updater:failing,packaged:true,repositoryReady:true,file,setInterval:()=>0,stopEngine:async()=>recovery.push('stop'),resumeEngine:async()=>recovery.push('restart'),allowQuit:(yes:boolean)=>recovery.push('quit='+yes)});
 failing.quitAndInstall=()=>{throw Error('installer failure')};second.start();failing.emit('update-downloaded',{version:'0.2.0-beta.2'});
 await assert.rejects(second.install(),/Не удалось перезапустить/);assert.deepEqual(recovery,['stop','quit=true','quit=false','restart']);
});

test('TS-31: a delayed native updater failure restores the stopped engine',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'harnessy-update-native-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const updater=new FakeUpdater(),events:string[]=[];
 const updates=new DesktopUpdates({updater,packaged:true,repositoryReady:true,file:path.join(directory,'updates.json'),setInterval:()=>0,
  stopEngine:async()=>{events.push('stop')},resumeEngine:async()=>{events.push('restart')},allowQuit:(yes:boolean)=>events.push('quit='+yes)});
 updates.start();updater.emit('update-downloaded',{version:'0.2.0'});
 await updates.install();assert.equal(updates.state().installing,true);
 updater.emit('error',Error('private installer detail'));
 await immediate();assert.deepEqual(events,['stop','quit=true','quit=false','restart']);
 assert.equal(updates.state().installing,false);assert.match(updates.state().error!,/Не удалось перезапустить/);
 assert.doesNotMatch(JSON.stringify(updates.state()),/private installer detail/);
});

test('TS-31: update IPC is confined to the managed loopback window',()=>{
 assert.equal(trustedUpdateOrigin('http://127.0.0.1:3777/room','http://127.0.0.1:3777'),true);
 assert.equal(trustedUpdateOrigin('http://127.0.0.1:3778/room','http://127.0.0.1:3777'),false);
 assert.equal(trustedUpdateOrigin('https://example.com/room','https://example.com'),false);
 assert.equal(trustedUpdateOrigin('http://evil.test/room','http://127.0.0.1:3777'),false);
});

test('TS-31: desktop banner appears only after download and install click uses narrow IPC',async()=>{
 const d=dom(''),ipc=new Map<string,Function>(),calls:string[]=[],exposed:any={};Object.assign(d.document,{body:d.body,getSelection:()=>null});
 const renderer={on:(name:string,fn:Function)=>ipc.set(name,fn),invoke:async(name:string)=>{calls.push(name);return name==='harnessy:update-state'?{channel:'beta',readyVersion:null}:true},send:()=>{},removeListener:()=>{}};
 runInNewContext(read('ui/desktop/preload.js'),{document:d.document,setTimeout:(fn:Function)=>fn(),require:(name:string)=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(name:string,value:any)=>exposed[name]=value},ipcRenderer:renderer}}});
 await immediate();assert.equal(d.document.querySelector('[data-desktop-update-banner]'),null);
 ipc.get('harnessy:update-state')!({}, {readyVersion:'0.2.0-beta.1',installing:false});
 const banner=d.document.querySelector('[data-desktop-update-banner]');assert.ok(banner);assert.match(banner.textContent,/Обновление готово/);
 await banner.querySelector('button')!.emit('click');assert.ok(calls.includes('harnessy:update-install'));assert.equal(exposed.harnessy.ipcRenderer,undefined);
 ipc.get('harnessy:update-state')!({}, {readyVersion:null});assert.equal(d.document.querySelector('[data-desktop-update-banner]'),null);
});
