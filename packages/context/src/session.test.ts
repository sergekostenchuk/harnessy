import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationTransfer,transferSettings} from './session.ts';
import {estTokens} from './tokens.ts';
const messages=Array.from({length:16},(_,i)=>({role:i%2?'ai':'me',text:'message-'+i+'\nline two '+i+'\nDETAIL-'+i,ts:1791500000+i}));
test('245: last twelve messages are quoted verbatim, older messages are deterministic first lines',()=>{
 const snapshot={project:'/p',chat:'c1',messages,facts:[]},out=conversationTransfer(snapshot,transferSettings({}));
 for(const m of messages.slice(-12))assert.ok(out.content.includes(m.text.split('\n').join('\n> ')));
 for(let i=0;i<4;i++){assert.ok(out.content.includes('message-'+i));assert.ok(!out.content.includes('DETAIL-'+i+'\n'))}
 assert.equal(out.verbatim,12);assert.equal(out.compressed,true);assert.equal(out.tokens,estTokens(out.content));assert.deepEqual(out,conversationTransfer(snapshot,transferSettings({})));
});
test('245/248: token ceiling includes quote overhead, huge lines/newlines/unicode and facts; no refusal',()=>{
 for(const text of ['字😃'.repeat(100000),'\n'.repeat(100000),'x'.repeat(100000)])for(const n of [0,12,100]){
  const out=conversationTransfer({project:'/p',chat:'c',messages:Array.from({length:18},()=>({role:'me',text,ts:0})),facts:[{label:'Вводная',text},{label:'Память',text},{label:'Предложение',text}]},transferSettings({contextTransferTokens:512,contextTransferMessages:n}));
  assert.ok(out.tokens<=512,String(out.tokens));assert.equal(out.compressed,true);assert.match(out.content,/Конец контекста/);
 }
});
test('245: a large recent message remains verbatim if the complete recent window fits',()=>{
 const text='A'.repeat(30000),out=conversationTransfer({project:'p',chat:'c',messages:[{role:'me',text,ts:0},...messages.slice(-11)],facts:[]},transferSettings({}));assert.ok(out.content.includes(text));assert.equal(out.verbatim,12);
});
test('248: absent defaults, explicit opt out and invalid settings are distinct',()=>{
 assert.deepEqual(transferSettings({}),{contextTransferEnabled:true,contextTransferMessages:12,contextTransferTokens:20000});
 const out=conversationTransfer({project:'p',chat:'c',messages,facts:[]},transferSettings({contextTransferEnabled:false}));assert.equal(out.content,'');assert.equal(out.tokens,0);assert.equal(out.enabled,false);
 for(const raw of [{contextTransferTokens:NaN},{contextTransferTokens:0},{contextTransferMessages:1.2},{contextTransferMessages:-1},{contextTransferEnabled:'false'}])assert.throws(()=>transferSettings(raw));
});
