import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const guard=join(root,'ui/deploy/forbidden_guard.py');
const markers=join(root,'ui/deploy/forbidden-strings.txt');
const require=createRequire(import.meta.url);
const afterPack=require(join(root,'ui/desktop/after-pack.cjs')) as (context:{appOutDir:string;packager:{appInfo:{productFilename:string}}})=>Promise<void>;
const runGuard=(path:string)=>spawnSync('python3',[guard,path],{cwd:root,encoding:'utf8'});

test('TS-32: one marker list rejects owner data, absolute project roots and credential-shaped values with the file name',t=>{
 const dir=mkdtempSync(join(tmpdir(),'harnessy-ts32-guard-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'nested'));
 writeFileSync(join(dir,'masked.txt'),'you@example.com\nsk-…8f2a\n~/Harnessy-Projects\n');assert.equal(runGuard(dir).status,0);
 const cases:ReadonlyArray<readonly [string,string]>=[['profile.html','9616166@gmail.com'],['home.txt','/Users/tester/Harnessy-Projects/demo'],['token.js','const access_token="sk-live-0123456789abcdefghijklmnop"']];
 for(const [name,value] of cases){
  const path=join(dir,'nested',name);writeFileSync(path,value);const blocked=runGuard(dir);assert.equal(blocked.status,1,name);assert.match(blocked.stderr,new RegExp('nested/'+name.replace('.','\\.')));assert.doesNotMatch(blocked.stderr,/9616166|sk-live-0123456789/);rmSync(path);
 }
 const list=readFileSync(markers,'utf8');assert.match(list,/literal:kostenchuksergey/);assert.match(list,/PRIVATE KEY/);
});

test('TS-32: build.py and electron-builder afterPack use the same guard; bundled Resources are checked',async t=>{
 const build=readFileSync(join(root,'ui/deploy/build.py'),'utf8'),builder=readFileSync(join(root,'ui/desktop/electron-builder.yml'),'utf8');assert.match(build,/from forbidden_guard import assert_clean/);assert.match(build,/assert_clean\(\[OUT\]\)/);assert.match(builder,/afterPack: \.\/after-pack\.cjs/);
 const out=mkdtempSync(join(tmpdir(),'harnessy-ts32-pack-')),resources=join(out,'Harnessy-alpha.app','Contents','Resources');t.after(()=>rmSync(out,{recursive:true,force:true}));mkdirSync(resources,{recursive:true});writeFileSync(join(resources,'app.asar'),'clean fixture');
 await afterPack({appOutDir:out,packager:{appInfo:{productFilename:'Harnessy-alpha'}}});writeFileSync(join(resources,'engine.js'),'github_pat_0123456789abcdefghijklmnop');await assert.rejects(afterPack({appOutDir:out,packager:{appInfo:{productFilename:'Harnessy-alpha'}}}),/engine\.js/);
});

test('TS-32: profile specifications are neutral and generated site passes its guard',{timeout:20000},()=>{
 const files=['01-chat.html','06-settings.html','10-new-chat.html','11-connections.html','27-limits-widget.html'].map(name=>join(root,'ui/sketches/disarto',name));
 for(const file of files){const text=readFileSync(file,'utf8');assert.doesNotMatch(text,/9616166@gmail\.com|kostenchuksergey|>Serge</,file);assert.match(text,/Владелец|you@example\.com/,file)}
 const design=readFileSync(join(root,'ui/sketches/disarto/00-design-code.html'),'utf8');assert.match(design,/профиль · учётная запись движка/);assert.match(design,/Без подтверждённой учётной записи строка почты не рисуется/);
 execFileSync('python3',['ui/deploy/build.py'],{cwd:root,stdio:'pipe'});assert.equal(runGuard(join(root,'ui/deploy/out/site')).status,0);
});
