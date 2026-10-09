import test from 'node:test';
import assert from 'node:assert/strict';
import {symlinkSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call} from './test-helpers.ts';

test('4/15/20/71: canonical static file, nocache on errors, no listing, encoded paths/symlink boundaries rejected',async t=>{
 const h=await fixture(t);mkdirSync(join(h.dir,'outside'));writeFileSync(join(h.dir,'outside','secret.txt'),'secret');writeFileSync(join(h.dir,'secret.txt'),'secret');symlinkSync(join(h.dir,'outside'),join(h.siteDir,'link'));symlinkSync(join(h.siteDir,'test.js'),join(h.siteDir,'inside.js'));
 const root=await call(h.api,'/');assert.equal(root.status,200);assert.match(root.text,/Harnessy/);
 for(const path of ['/sketches/test.js?v=9','/sketches/inside.js']){const a=await call(h.api,path,{headers:{Host:'any.invalid'}});assert.equal(a.status,200);assert.equal(a.text,'window.test = "готов";');assert.equal(a.headers['cache-control'],'no-cache')}
 for(const path of ['/sketches','/sketches/','/sketches/missing','/sketches/link/secret.txt','/sketches/link/../secret.txt','/sketches/%2e%2e/secret.txt','/sketches/link%2f..%2fsecret.txt','/sketches/..%5csecret.txt','/sketches2/test.js']){const a=await call(h.api,path);assert.equal(a.status,404,path);assert.equal(a.text,'404: Not Found');assert.equal(a.headers['cache-control'],'no-cache')}
 assert.equal((await call(h.api,'/sketches/test.js',{method:'HEAD'})).text,'');assert.equal((await call(h.api,'/sketches/test.js',{body:{}})).status,405);
});
