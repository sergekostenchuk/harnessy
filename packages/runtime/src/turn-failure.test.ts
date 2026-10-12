import test from 'node:test';
import assert from 'node:assert/strict';
import {turnFailure} from './turn-failure.ts';
test('350 r2: absent or forged failure metadata gets a bounded public fallback',()=>{
 for(const error of [null,undefined,{},'raw error'])assert.deepEqual(turnFailure(error,'',NaN),{code:'internal',reason:'Причина отказа не получена',durationMs:0});
 assert.deepEqual(turnFailure({code:'sk_bad',message:'upstream failed; credential=Tiny!'},'',-1),{code:'internal',reason:'upstream failed; [секрет скрыт]',durationMs:0});
});
