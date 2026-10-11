import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
const source=readFileSync(new URL('../../../ui/sketches/disarto/00-design-code.html',import.meta.url),'utf8');
function example(){const start=source.indexOf('<section id="connections-spec"'),end=source.indexOf('<!-- End TS-20e connection components. -->',start);assert.ok(start>=0&&end>start);const d=dom(source.slice(start,end)),root=d.document.querySelector('#connections-spec')!,dialog=root.querySelector('dialog')!;
 Object.defineProperty(dialog,'open',{get:()=>dialog.hasAttribute('open')});const external:string[]=[],forbidden=(name:string)=>()=>{external.push(name);throw Error(name+' is not a design-code action')};
 const script=source.match(/<script id="connections-spec-demo">([\s\S]*?)<\/script>/)![1]!;runInContext(script,createContext({document:d.document,fetch:forbidden('fetch'),open:forbidden('open'),localStorage:{getItem:forbidden('read storage'),setItem:forbidden('write storage')},harnessy:{openTerminal:forbidden('terminal')}}));
 const find=(selector:string)=>{const el=root.querySelector(selector);assert.ok(el,selector);return el};return {...d,root,dialog,find,external};}

test('267: subscription examples distinguish missing program, missing login, checking and an unavailable check; repeats are disabled while checking',()=>{
 const v=example();assert.equal(v.root.querySelectorAll('[data-example-program]').length,3);for(const state of ['unchecked','checking','ready','signed-out','unavailable','missing']){const el=v.find('[data-state="'+state+'"]');assert.equal(el.getAttribute('role'),'status');assert.ok(el.querySelector('b')!.textContent.trim())}
 for(const state of ['checking','key-checking','trial-running']){const el=v.find('[data-state="'+state+'"]');assert.equal(el.getAttribute('aria-busy'),'true');assert.equal(el.querySelector('button')!.disabled,true)}
 assert.equal(v.find('[data-example-program="signed-out"] button[disabled]').textContent,'Пробный ход · сначала войдите');assert.match(v.find('[data-state="unavailable"]').textContent,/Состояние входа неизвестно/);assert.match(v.find('.conn-empty-models').textContent,/пустой список моделей/);assert.match(v.find('.conn-models').textContent,/оркестратор · воркер 1|никто/);
});

test('267: every visible design action stays local and never starts a command, an auth check or a paid turn',async()=>{
 const v=example();for(const button of v.root.querySelectorAll('[data-example-action]')){await button.emit('click');assert.match(v.find('[data-example-status]').textContent,/^Макет ·/)}assert.deepEqual(v.external,[]);assert.equal(v.dialog.hasAttribute('open'),false);for(const button of v.root.querySelectorAll('button'))assert.equal(button.getAttribute('type'),'button');
});

test('267: the trial requires its own owner dialog, with unknown price visible before confirmation; cancelling never simulates success',async()=>{
 const v=example(),initial=v.find('[data-example-status]').textContent;for(const button of v.root.querySelectorAll('[data-example-trial]')){assert.match(button.textContent,/цена неизвестна/);await button.emit('click');assert.equal(v.dialog.hasAttribute('open'),true);assert.match(v.find('#dc-trial-price').textContent,/Цена неизвестна/);assert.equal(v.find('[data-example-status]').textContent,initial);await v.find('[data-example-dismiss]').emit('click');assert.equal(v.dialog.hasAttribute('open'),false);assert.equal(v.find('[data-example-status]').textContent,initial)}
 await v.find('[data-example-trial]').emit('click');await v.find('[data-example-run]').emit('click');assert.equal(v.dialog.hasAttribute('open'),false);assert.match(v.find('[data-example-status]').textContent,/настоящий ход не запущен/);assert.deepEqual(v.external,[]);
});

test('267/SEC1: key input stays masked and is never copied to notices, storage or requests; a failed check differs from a rejected key',async()=>{
 const v=example(),input=v.find('#dc-api-key'),secret='test-only-not-a-real-key-do-not-render';assert.equal(input.getAttribute('type'),'password');assert.equal(input.getAttribute('autocomplete'),'off');assert.equal(input.value,'');input.value=secret;
 for(const b of v.root.querySelectorAll('[data-example-action="key"]'))await b.emit('click');assert.equal(input.getAttribute('type'),'password');assert.doesNotMatch(v.root.textContent,new RegExp(secret));assert.doesNotMatch(v.root.innerHTML,new RegExp(secret));assert.deepEqual(v.external,[]);assert.match(v.find('.conn-masked-key').textContent,/^•.*1A2B$/);assert.match(v.find('[data-state="key-rejected"]').textContent,/Ключ отклонён/);assert.match(v.find('[data-state="key-unavailable"]').textContent,/Это не отказ ключа/);
});
