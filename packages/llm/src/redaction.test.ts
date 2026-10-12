import test from 'node:test';
import assert from 'node:assert/strict';
import {SecretRedactor} from './redaction.ts';

test('21b redaction: every key boundary and one-character chunks mask the exact key before emission',()=>{
 const secret='fixture-only-key-012345',protection=new SecretRedactor();protection.add(secret);
 for(let split=0;split<=secret.length;split++){const filter=protection.textRedactor();let text=filter.push('before '+secret.slice(0,split));assert.equal(text.includes(secret),false);text+=filter.push(secret.slice(split)+' after '+secret)+filter.finish();assert.equal(text,'before [ключ скрыт] after [ключ скрыт]')}
 const filter=protection.textRedactor();let result='';for(const char of secret+secret+' fixture-only')result+=filter.push(char);result+=filter.finish();assert.equal(result,'[ключ скрыт][ключ скрыт] fixture-only');
});

test('21b redaction: nested values and keys are protected without changing opaque fields or the source object',()=>{
 const protection=new SecretRedactor(),secret='fake"\\credential';protection.add(secret);const raw={text:secret,signature:'opaque',nested:[{[secret]:secret}],replay:{api:'test',model:'model',provider:'route'}};
 assert.deepEqual(protection.redact(raw),{text:'[ключ скрыт]',signature:'opaque',nested:[{'[ключ скрыт]':'[ключ скрыт]'}],replay:raw.replay});assert.equal(raw.text,secret);
 const unkeyed=new SecretRedactor(),stream=unkeyed.textRedactor();assert.equal(stream.push('ordinary')+stream.finish(),'ordinary');
});
