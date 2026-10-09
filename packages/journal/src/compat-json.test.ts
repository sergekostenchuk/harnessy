import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCompat,compatJson,orderedClone} from './index.ts';
test('row49: Python float spellings in chats.json survive parse, clone and serialization',()=>{
 const source=readFileSync(new URL('./fixtures/python-floats.json',import.meta.url),'utf8');const parsed=parseCompat(source) as Record<string,unknown>;
 assert.equal(compatJson(parsed,2),source);assert.equal(compatJson(orderedClone(parsed),2),source);
 const values=parseCompat('{"int": 1, "float": 1.0, "zero": -0.0, "small": 1e-07, "large": 1e+16, "decimal": 1791500000.125}') as Record<string,unknown>;
 assert.equal(compatJson(orderedClone(values)), '{"int": 1, "float": 1.0, "zero": -0.0, "small": 1e-07, "large": 1e+16, "decimal": 1791500000.125}');
 assert.equal(compatJson(orderedClone(values,{float:2})).includes('"float": 2,'),true);
 assert.equal(compatJson([-0,1e-7,1.25]),'[-0.0, 1e-07, 1.25]');
});
