import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';

const sketch=readFileSync(new URL('../../../ui/sketches/disarto/40-sidebar.html',import.meta.url),'utf8');
const design=readFileSync(new URL('../../../ui/sketches/disarto/00-design-code.html',import.meta.url),'utf8');

test('TS-48.1: A1 shows the current project as a folder with its chats before other groups',()=>{
  const start=sketch.indexOf('  const I=');
  const end=sketch.indexOf('  // A1 · рейка 56',start);
  assert.ok(start>=0&&end>start,'A1 sketch generator exists');
  const context:{panel?:string}={};
  runInNewContext(sketch.slice(start,end)+'\nglobalThis.panel=panelA1();',context);
  const d=dom('<main>'+context.panel+'</main>');
  const row=d.document.querySelector('.ps2-current-project');
  const chats=d.document.querySelector('.ps2-current-chats');
  assert.ok(row&&chats);
  assert.match(row.textContent,/Alpha-Test.*2 роли.*⋯/);
  assert.ok(row.querySelector('svg'));
  assert.equal(row.querySelector('button')?.getAttribute('aria-label'),'Меню проекта Alpha-Test');
  assert.equal(chats.querySelectorAll('.ps-chat').length,3);
  const rendered=context.panel!;
  assert.ok(rendered.indexOf('ps2-current-project')<rendered.indexOf('ps2-current-chats'));
  assert.ok(rendered.indexOf('ps2-current-chats')<rendered.indexOf('чаты без проекта'));
  assert.ok(rendered.indexOf('чаты без проекта')<rendered.indexOf('Другие проекты'));
  assert.doesNotMatch(rendered,/чаты · Alpha-Test/);
});

test('TS-48.1: design-code specimen preserves the project, standalone and other-project order',()=>{
  const start=design.indexOf('TS-48 · открытый проект в списке');
  const end=design.indexOf('TS-43 · композер и проекты',start);
  assert.ok(start>=0&&end>start);
  const sample=design.slice(start,end);
  const d=dom('<main>'+sample+'</main>');
  assert.equal(d.document.querySelectorAll('.ps2-current-project').length,1);
  assert.equal(d.document.querySelectorAll('.ps2-current-chats .ps-chat').length,3);
  assert.ok(sample.indexOf('ps2-current-project')<sample.indexOf('чаты без проекта'));
  assert.ok(sample.indexOf('чаты без проекта')<sample.indexOf('Другие проекты'));
});
