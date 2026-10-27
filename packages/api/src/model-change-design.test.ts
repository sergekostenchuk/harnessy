import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const designFile=fileURLToPath(new URL('../../../ui/sketches/disarto/00-design-code.html',import.meta.url));
const design=readFileSync(designFile,'utf8');
const electron=process.env.HARNESSY_TEST_ELECTRON||fileURLToPath(new URL('../../../ui/desktop/node_modules/.bin/electron',import.meta.url));

test('TS-49.1: only confirmed model changes produce a scoped, timed feed example',()=>{
  const begin=design.indexOf('<section id="model-change-spec"');
  const end=design.indexOf('<section id="model-full-access"',begin);
  assert.ok(begin>design.indexOf('<section id="composer-program-models"')&&end>begin);
  const spec=design.slice(begin,end);
  for(const scope of ['chat','seat'])assert.match(spec,new RegExp('data-mc-event="'+scope+'"[^]*?<time datetime="[^"]+" title="[^"]+"'));
  assert.match(spec,/Fable · Claude Code<\/strong> → <strong>Fable · Codex/);
  assert.match(spec,/этот разговор ·/);
  assert.match(spec,/место «Воркер» ·/);
  assert.match(spec,/Ожидание и отказ не создают события/);
  assert.match(spec,/Модель в чипе меняется только после квитанции/);
  const confirmed=spec.slice(spec.indexOf('data-mc-state="confirmed"'),spec.indexOf('data-mc-state="saving"'));
  const saving=spec.slice(spec.indexOf('data-mc-state="saving"'),spec.indexOf('data-mc-state="failed"'));
  const failed=spec.slice(spec.indexOf('data-mc-state="failed"'));
  assert.match(confirmed,/<b>Fable · Codex<\/b>/);
  for(const state of [saving,failed]){
    assert.match(state,/<b>Fable · Claude Code<\/b>/);
    assert.doesNotMatch(state,/data-mc-event=/);
  }
  assert.match(saving,/aria-busy="true"[^]*?сохраняем…[^]*?role="status"/);
  assert.match(failed,/role="alert"[^]*?Не удалось сохранить модель/);
});

test('TS-49.1: specimens remain readable in four viewport sizes',
 {timeout:60_000,skip:existsSync(electron)?false:'Electron is not installed; set HARNESSY_TEST_ELECTRON'},async t=>{
  const profile=mkdtempSync(join(tmpdir(),'harnessy-model-design-'));
  t.after(()=>rmSync(profile,{recursive:true,force:true}));
  const env:NodeJS.ProcessEnv={...process.env,HARNESSY_TEST_WINDOW:'hidden',MODEL_DESIGN_FILE:designFile,MODEL_DESIGN_PROFILE:profile};
  delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[fileURLToPath(new URL('./model-change-design-browser.cjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});
  let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk});child.stderr.on('data',chunk=>{stderr+=chunk});
  const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
  assert.equal(exit,0,'model design browser test: '+stderr+'\n'+stdout);
  assert.match(stdout,/390x844: no overflow/);
});
