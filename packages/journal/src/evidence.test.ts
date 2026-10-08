import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {Evidence,resolveEvidence,checkReport,evidenceDir} from './evidence.ts';
import {temp,fixture,error} from './test-support.ts';
test('[14] report contract checks four headings, empty/missing/unreadable and strict UTF-8',()=>{
 const f=fixture();try{const relative=f.report(),path=join(f.root,relative),e=new Evidence(f.root);assert.equal(e.checkReport(path),null);
 assert.equal(checkReport(join(f.root,'absent')),'файла отчёта нет: '+join(f.root,'absent'));
 writeFileSync(path,'');assert.equal(checkReport(path),'отчёт пуст: '+path);
 writeFileSync(path,'# Ran\n');assert.equal(checkReport(path),'в отчёте report.md нет разделов: Skipped, Planned, Manual (контракт Ran / Skipped / Planned / Manual)');
 writeFileSync(path,Buffer.from([0xff,0xfe]));assert.equal(checkReport(path),'отчёт не читается: '+path);
 writeFileSync(path,'**ran**\n# SKIPPED\n__Planned\nManual: —');assert.equal(checkReport(path),null)
 }finally{f.close()}
});
test('report heading cannot masquerade as prefix of Unicode word or BOM-stripped text',()=>{
 const f=fixture();try{const rel=f.report('T',1,'# Ranж\n# Skipped\n# Planned\n# Manual'),path=join(f.root,rel);assert.match(checkReport(path)!,/нет разделов: Ran/);
 writeFileSync(path,'\ufeff# Ran\n# Skipped\n# Planned\n# Manual');assert.match(checkReport(path)!,/нет разделов: Ran/)
 }finally{f.close()}
});
test('[39] evidence realpath rejects traversal, external symlinks and dangling external links',()=>{
 const f=fixture(),outside=temp();try{const rel=f.report(),link=join(f.root,'linked');symlinkSync(outside.root,link,'dir');writeFileSync(join(outside.root,'report.md'),'# Ran\n# Skipped\n# Planned\n# Manual');
 assert.equal(resolveEvidence(f.root,rel),join(f.root,rel));assert.equal(resolveEvidence(f.root,'linked/report.md'),null);assert.equal(resolveEvidence(f.root,'linked/missing.md'),null);assert.equal(resolveEvidence(f.root,'../escape'),null);
 symlinkSync(join(outside.root,'missing.md'),join(f.root,'dangling'));assert.equal(resolveEvidence(f.root,'dangling'),null);
 assert.equal(evidenceDir(f.root,'T',1),join(f.root,'.harness','evidence','T','r1'));assert.throws(()=>evidenceDir(f.root,'../../../../escape',1),error('evidence_outside'));assert.throws(()=>evidenceDir(f.root,outside.root,1),error('evidence_outside'));
 }finally{f.close();outside.close()}
});
