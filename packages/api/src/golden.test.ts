import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,call} from './test-helpers.ts';
interface Case {path:string;status:number;response:unknown;body?:unknown;method?:string}
const cases:Case[]=JSON.parse(readFileSync(new URL('./fixtures/errors.json',import.meta.url),'utf8'));
test('1/19/69: independent Python golden error forms for every missing owner operand',async t=>{
 const h=await fixture(t);for(const c of cases.filter(c=>!['/api/seats','/api/assign'].includes(c.path))){const result=await call(h.api,c.path,{...(c.body===undefined?{}:{body:c.body}),...(c.method?{method:c.method}:{})});assert.equal(result.status,c.status,c.path);assert.deepEqual(result.body,c.response,c.path)}
});

// 153 replaces these Python-era creation doors with a typed refusal; the old fixture bytes stay historical.
test('153: missing owner operands at the closed assignment doors return the proposal refusal',async t=>{
 const h=await fixture(t);for(const c of cases.filter(c=>['/api/seats','/api/assign'].includes(c.path))){const result=await call(h.api,c.path,{body:c.body});assert.equal(result.status,409,c.path);assert.deepEqual(result.body,{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'},c.path)}
});
