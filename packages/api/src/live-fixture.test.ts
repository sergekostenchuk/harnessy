import test from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {fixtureSource,fixtureWrapper} from './live-fixture.ts';

test('TS-52: named declarations survive reordering and execute in the original VM context',()=>{
 const one="(function(){const seed=2; function answer(){return nested()+seed} function nested(){return 40}})();";
 const two="(function(){function nested(){return 40} const seed=2; function answer(){return nested()+seed}})();";
 for(const source of [one,two]){
  const context=createContext({});
  runInContext(fixtureSource(source,['seed','answer','nested'])+'\nglobalThis.answer=answer();',context);
  assert.equal(context.answer,42);
 }
});

test('TS-52: syntax-aware extraction handles regex, nested templates and multi-variable statements',()=>{
 const source='(function(){const a=/[{};]/.test(";"), b=`x${(()=>{return `y${1}`})()}`; function read(){return [a,b]} })();';
 const extracted=fixtureSource(source,['a','b','read']);
 const context=createContext({});runInContext(extracted+'\nglobalThis.value=read();',context);
 assert.deepEqual(Array.from(context.value),[true,'xy1']);
 assert.equal((extracted.match(/const a=/g)||[]).length,1);
});

test('TS-52: comments and nested impostors do not satisfy missing declarations',()=>{
 const source='(function(){/* function phantom(){} */ const text="function phantom(){}"; function outer(){function phantom(){} return phantom} })();';
 assert.throws(()=>fixtureSource(source,['phantom'],{filename:'live.js'}),/phantom.*не найдена.*live\.js/);
 assert.throws(()=>fixtureSource(source,['text','absent'],{filename:'cx.js'}),/absent.*не найдена.*cx\.js/);
});

test('TS-52: ambiguous declarations fail instead of picking the wrong scope',()=>{
 const source='(function(){const item=1})(); (function(){const item=2})();';
 assert.throws(()=>fixtureSource(source,['item']),/item.*неоднознач/);
});

test('TS-52: standalone event statements can be selected without surrounding neighbours',()=>{
 const source="(function(){function item(){return 7} document.addEventListener('click',()=>item()); document.addEventListener('keyup',()=>item())})();";
 const handlers:string[]=[];const context=createContext({document:{addEventListener:(name:string)=>handlers.push(name)}});
 runInContext(fixtureSource(source,['item',{statement:"document.addEventListener('click'"}]),context);
 assert.deepEqual(handlers,['click']);
 assert.throws(()=>fixtureSource(source,[{statement:'document.addEventListener('}]),/неоднознач/);
 assert.throws(()=>fixtureSource(source,[{statement:'document.addEventListener("missing"'}]),/не найдена/);
});

test('TS-52: scoped blocks extract only the requested local declarations',()=>{
 const source="(function(){function outer(){const item=0; if(enabled){const item=4; const read=()=>item} if(other){const item=9}}})();";
 const context=createContext({});
 runInContext(fixtureSource(source,['item','read'],{scope:'outer',block:'if(enabled)'})+'globalThis.value=read();',context);
 assert.equal(context.value,4);
 assert.throws(()=>fixtureSource(source,['item'],{scope:'outer',block:'if(missing)'}),/Блок.*не найден/);
 assert.throws(()=>fixtureSource(source,['item'],{scope:'outer',block:'if('}),/Блок.*неоднозначен/);
 assert.throws(()=>fixtureSource(source,['item'],{scope:'missing'}),/Область.*не найдена/);
});

test('TS-52: boot fixture extracts a complete selected IIFE and rejects an absent wrapper',()=>{
 const source='(function(){globalThis.boot=1})(); (function(){globalThis.boot=2})();';
 const context=createContext({});runInContext(fixtureWrapper(source,1,'proto.js'),context);
 assert.equal(context.boot,2);
 assert.throws(()=>fixtureWrapper(source,2,'proto.js'),/Обёртка 2 не найдена в proto\.js/);
});
