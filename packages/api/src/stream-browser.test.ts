import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from './server.ts';
import {fixture,deferred,OWNER} from './test-helpers.ts';
import {testSite} from './site-test-helpers.ts';
import {systemClock} from '../../runtime/src/types.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const electron=process.env.HARNESSY_TEST_ELECTRON||join(root,'ui/desktop/node_modules/.bin/electron');
test('TS-47.3: real browser preserves selection, scroll and confirmed queue during streaming',
 {timeout:60_000,skip:existsSync(electron)?false:'Electron is not installed; set HARNESSY_TEST_ELECTRON'},async t=>{
 const h=await fixture(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: true}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}',deps:{clock:systemClock}}),r=h.runtime,first=deferred(),last=deferred();let runs=0;
 t.after(()=>{first.resolve();last.resolve()});await r.settingsPatch('owner',{releaseUnderstood_0_1_0_alpha:true},OWNER);
 const pane=r.registry.get('worker')!;for(let i=0;i<18;i++){pane.record('me','Вопрос '+i+' — достаточно текста для прокрутки.');pane.record('ai','Сохранённый ответ '+i+' — достаточно текста для проверки чтения.')}
 h.provider.onRun=async(seat,_text,ctx)=>{runs++;ctx.modelStarted?.();if(runs===1){ctx.publish({type:'delta',text:'ВИДИМЫЙ текст'});await first.promise;ctx.publish({type:'delta',text:' и продолжение'});await last.promise}ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:runs===1?'ВИДИМЫЙ текст и продолжение':'готово',sessionId:null}};
 const api=createApi({runtime:r,siteDir:join(testSite(),'sketches'),port:0});await api.listen();t.after(()=>api.close());h.deps.appUrl=api.url;
 const env:NodeJS.ProcessEnv={...process.env,HARNESSY_TEST_WINDOW:'hidden',STREAM_BROWSER_BASE:api.url,STREAM_BROWSER_USER_DATA:join(h.dir,'electron-profile')};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[fileURLToPath(new URL('./stream-browser-driver.cjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});let stdout='',stderr='',started=false,continued=false,finished=false;const notes=new Set<string>();
 child.stdout.on('data',data=>{stdout+=data;if(!started&&stdout.includes('STREAM_START')){started=true;void r.runTurn('worker','браузерная проверка')}if(!continued&&stdout.includes('STREAM_CONTINUE')){continued=true;first.resolve()}if(!finished&&stdout.includes('STREAM_FINISH')){finished=true;last.resolve()}for(const marker of ['HANDOFF_SSE_REFUSAL','HANDOFF_SSE_SUCCESS','HANDOFF_SSE_DRAFT'])if(!notes.has(marker)&&stdout.includes(marker)){notes.add(marker);pane.publish({type:'note',text:marker})}});child.stderr.on('data',data=>{stderr+=data});
 const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.equal(exit,0,'browser regression failed: '+stderr+'\n'+stdout);assert.ok(started&&continued&&finished);assert.equal(notes.size,3);await r.idle();
});
