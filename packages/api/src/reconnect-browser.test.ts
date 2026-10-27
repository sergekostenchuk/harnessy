import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from './server.ts';
import {fixture,OWNER} from './test-helpers.ts';
import {testSite} from './site-test-helpers.ts';
import {systemClock} from '../../runtime/src/types.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const electron=process.env.HARNESSY_TEST_ELECTRON||join(root,'ui/desktop/node_modules/.bin/electron');
test('TS-47.9: real browser restores a turn completed while the SSE socket was disconnected',
 {timeout:60_000,skip:existsSync(electron)?false:'Electron is not installed; set HARNESSY_TEST_ELECTRON'},async t=>{
 const h=await fixture(t,{seats:'  worker: {role: orchestrator, kind: orchestrator, vendor: claude, label: воркер, model: w1, mode: read, digest: true}',deps:{clock:systemClock}}),r=h.runtime;
 await r.settingsPatch('owner',{releaseUnderstood_0_1_0_alpha:true},OWNER);let runs=0;
 h.provider.onRun=async(seat,_text,ctx)=>{runs++;ctx.modelStarted?.();if(runs===1){ctx.publish({type:'delta',text:'начальный фрагмент'});await new Promise<void>((_resolve,reject)=>{if(ctx.signal.aborted)reject(Error('stopped'));else ctx.signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true})})}
  ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'Ответ после восстановления',sessionId:null}};
 const api=createApi({runtime:r,siteDir:join(testSite(),'sketches'),port:0});await api.listen();t.after(()=>api.close());h.deps.appUrl=api.url;
 const env:NodeJS.ProcessEnv={...process.env,HARNESSY_TEST_WINDOW:'hidden',RECONNECT_BROWSER_BASE:api.url,RECONNECT_BROWSER_USER_DATA:join(h.dir,'electron-profile')};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[fileURLToPath(new URL('./reconnect-browser-driver.cjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.equal(exit,0,'browser regression failed: '+stderr+'\n'+stdout);assert.match(stdout,/restored without reload/);assert.equal(runs,2);await r.idle();
});
