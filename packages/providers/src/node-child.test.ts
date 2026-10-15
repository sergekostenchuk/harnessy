import test from 'node:test';
import assert from 'node:assert/strict';
import {electronNodeRuntime,nodeChildEnv} from './node-child.ts';

test('TS-30 r2: ordinary Node child environment is byte-for-byte unchanged',()=>{
 const env:NodeJS.ProcessEnv={PATH:'/usr/bin:/bin',HOME:'/tmp/home'};
 assert.equal(electronNodeRuntime({},{}),false);
 assert.equal(nodeChildEnv(env,{},{}),env);
 assert.deepEqual(env,{PATH:'/usr/bin:/bin',HOME:'/tmp/home'});
});

test('TS-30 r2: Electron version or explicit shell flag keeps every Node child in Node mode',()=>{
 const env:NodeJS.ProcessEnv={PATH:'/usr/bin:/bin',HOME:'/tmp/home'};
 assert.equal(electronNodeRuntime({}, {electron:'44.4.1'}),true);
 assert.equal(electronNodeRuntime({ELECTRON_RUN_AS_NODE:'1'},{}),true);
 assert.deepEqual(nodeChildEnv(env,{}, {electron:'44.4.1'}),{...env,ELECTRON_RUN_AS_NODE:'1'});
 assert.deepEqual(nodeChildEnv(env,{ELECTRON_RUN_AS_NODE:'1'},{}),{...env,ELECTRON_RUN_AS_NODE:'1'});
 assert.equal(env.ELECTRON_RUN_AS_NODE,undefined);
});
