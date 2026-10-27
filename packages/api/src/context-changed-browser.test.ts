import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture,OWNER} from './test-helpers.ts';
import {createApi} from './server.ts';
import {testSite} from './site-test-helpers.ts';
import {systemClock} from '../../runtime/src/types.ts';

const electron=process.env.HARNESSY_TEST_ELECTRON||fileURLToPath(new URL('../../../ui/desktop/node_modules/.bin/electron',import.meta.url));
test('TS-51.E: real SSE receipts survive reload and fit four sizes; summary belongs to the new chat',
 {timeout:60_000,skip:existsSync(electron)?false:'Electron is not installed; set HARNESSY_TEST_ELECTRON'},async t=>{
 const h=await fixture(t,{seats:'  worker: {role: executor, vendor: claude, label: Исполнитель, model: w1, mode: read}',deps:{clock:systemClock}}),r=h.runtime,pane=r.registry.get('worker')!;
 await r.settingsPatch('owner',{releaseUnderstood_0_1_0_alpha:true,contextTransferMessages:100,contextTransferTokens:20000},OWNER);
 pane.record('me','Исходный вопрос');pane.record('ai','Сохранённый ответ');pane.sessionId=null;r.project.state.savePanes(r.registry,r.journal);await r.runTurn('worker','Перенести контекст');
 pane.record('me','длинный текст '.repeat(2000));pane.sessionId=null;r.project.state.savePanes(r.registry,r.journal);await r.settingsPatch('owner',{contextTransferTokens:512},OWNER);await r.runTurn('worker','Продолжить после усечения');
 h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'contextChanged',kind:'provider_compaction',before:120000,after:null,source:'claude'});ctx.publish({type:'delta',text:'Ответ после подтверждённого сжатия'});return {text:'Ответ после подтверждённого сжатия',sessionId:'fixture-session'}};
 const api=createApi({runtime:r,siteDir:join(testSite(),'sketches'),port:0});await api.listen();t.after(()=>api.close());h.deps.appUrl=api.url;
 const env:NodeJS.ProcessEnv={...process.env,HARNESSY_TEST_WINDOW:'hidden',CONTEXT_BROWSER_BASE:api.url,CONTEXT_BROWSER_DATA:join(h.dir,'context-electron')};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[fileURLToPath(new URL('./context-changed-browser-driver.cjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.equal(exit,0,stderr+'\n'+stdout);assert.match(stdout,/CONTEXT_RECEIPTS_OK/);await r.idle();
});
