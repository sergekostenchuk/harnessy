import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ownerPaths} from './files.ts';
import {OWNER_FILE_ENV,testOwnerEnvironment,ownerFilesSnapshot,checkOwnerFiles} from './test-helpers.ts';

function temporary(t:TestContext){const path=mkdtempSync(join(tmpdir(),'harnessy-owner-guard-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path}
test('149/151: preload isolates all five owner paths before imports; inherited owner paths and HOME are never used for writes',t=>{
 const directory=temporary(t),helper=new URL('./test-helpers.ts',import.meta.url),files=new URL('./files.ts',import.meta.url);
 const env={...process.env,...testOwnerEnvironment(directory)};
 const child=spawnSync(process.execPath,['--import',helper.href,'--input-type=module','-e',`import {ownerPaths} from ${JSON.stringify(files.href)};console.log(JSON.stringify({paths:ownerPaths(),home:process.env.HOME}));`],{env,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);assert.equal(result.home,process.env.HOME);
 for(const path of Object.values(result.paths) as string[]){assert.notEqual(dirname(path),directory);assert.match(dirname(path),/harnessy-test-owner-/);assert.equal(Object.values(ownerPaths(testOwnerEnvironment(directory))).includes(path),false)}
 assert.equal(OWNER_FILE_ENV.length,5);
});
for(const mode of ['strict','warn','invalid'])test('149/151: '+mode+' guard detects changed owner files after successful or failed runs without restoring bytes',t=>{
 const home=temporary(t);writeFileSync(join(home,'.harness-last-project'),'before');writeFileSync(join(home,'unrelated'),'untouched');
 for(const exit of [0,17]){
  const messages:string[]=[],result=checkOwnerFiles(()=>{writeFileSync(join(home,'.harness-last-project'),'after '+exit);writeFileSync(join(home,'.harness-projects.json'),'[]');return exit},{home,mode,report:message=>messages.push(message)});
  assert.equal(result,exit||(mode==='warn'?0:1));assert.match(messages.join('\n'),/\.harness-last-project/);assert.equal(readFileSync(join(home,'.harness-last-project'),'utf8'),'after '+exit);
 }
 const before=ownerFilesSnapshot(home);writeFileSync(join(home,'unrelated'),'allowed');assert.deepEqual(ownerFilesSnapshot(home),before);
 assert.equal(checkOwnerFiles(()=>0,{home,mode,report(){}}),0);
});
test('149/151: guard covers deletion, creation, nested files and exceptions; failed tests retain their nonzero result',t=>{
 const home=temporary(t);mkdirSync(join(home,'.harness-folder'));writeFileSync(join(home,'.harness-folder','state'),'old');writeFileSync(join(home,'.harness-settings.json'),'{}');
 const messages:string[]=[];const result=checkOwnerFiles(()=>{rmSync(join(home,'.harness-settings.json'));writeFileSync(join(home,'.harness-folder','state'),'changed');writeFileSync(join(home,'.harness-new'),'new');throw Error('test failed')},{home,report:message=>messages.push(message)});
 assert.equal(result,1);assert.match(messages.join('\n'),/test failed/);for(const name of ['.harness-settings.json','.harness-folder/state','.harness-new'])assert.ok(messages.join('\n').includes(name));
 assert.equal(checkOwnerFiles(()=>19,{home,mode:'warn',report(){}}),19);
});

for(const mode of ['strict','warn'])test('151: '+mode+' unreadable snapshot still runs tests once and keeps their failure',t=>{
 const home=join(temporary(t),'missing');let calls=0;const messages:string[]=[];
 assert.equal(checkOwnerFiles(()=>{calls++;return 0},{home,mode,report:m=>messages.push(m)}),mode==='warn'?0:1);assert.equal(calls,1);assert.match(messages.join('\n'),/снимок не прочитан/);
 assert.equal(checkOwnerFiles(()=>17,{home,mode,report(){}}),17);
});
