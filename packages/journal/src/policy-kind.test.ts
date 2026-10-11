import test from 'node:test';
import assert from 'node:assert/strict';
import {PolicySnapshot} from './policy.ts';

test('153: executor policies remain compatible with verified worker kinds, including reverse routes and observe',()=>{
 const route={from:['executor'],to:['reviewer'],kinds:['note'],trigger:null,bounds:null,n:1};
 const reverse={from:['reviewer'],to:['executor'],kinds:['question'],trigger:null,bounds:null,n:2};
 const policy=new PolicySnapshot(1,'deny',[route,reverse],{executor:['reviewer'],reviewer:['executor']});
 for(const spelling of ['worker','executor']){assert.equal(policy.checkSend(spelling,'reviewer','note').allow,true);assert.equal(policy.checkSend('reviewer',spelling,'question').allow,true);assert.equal(policy.checkSend(spelling,'owner','status').allow,false);assert.equal(policy.canObserve(spelling,'reviewer'),true);assert.equal(policy.canObserve('reviewer',spelling),true);assert.equal(policy.canObserve(spelling,'orchestrator'),false);assert.match(policy.summaryFor(spelling,{law:'worker',critic:'reviewer'},{critic:'Критик'}),/critic \(Критик\): note/)}
 assert.deepEqual(policy.routes[0],route);assert.deepEqual(policy.observe,{executor:['reviewer'],reviewer:['executor']});
 const modern=new PolicySnapshot(1,'deny',[{...route,from:['worker']}],{worker:['reviewer']});assert.equal(modern.checkSend('executor','reviewer','note').allow,true);assert.equal(modern.canObserve('executor','reviewer'),true);
});
