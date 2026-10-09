import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,call} from './test-helpers.ts';
interface Case {path:string;status:number;response:unknown;body?:unknown;method?:string}
const cases:Case[]=JSON.parse(readFileSync(new URL('./fixtures/errors.json',import.meta.url),'utf8'));
test('1/19/69: independent Python golden error forms for every missing owner operand',async t=>{
 const h=await fixture(t);for(const c of cases){const result=await call(h.api,c.path,{...(c.body===undefined?{}:{body:c.body}),...(c.method?{method:c.method}:{})});assert.equal(result.status,c.status,c.path);assert.deepEqual(result.body,c.response,c.path)}
});
