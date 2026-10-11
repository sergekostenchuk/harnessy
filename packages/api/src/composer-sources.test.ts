import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8');
function composer(on:boolean){
 const d=dom('<div class="frame cur"><div class="main"><span data-cx="plus">＋</span></div></div>');d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','new');Object.assign(d.document,{documentElement:d.html,body:d.body});
 const state={ui:{},chat:[],cx:{folder:'p1',rights:null,model:'w1',modes:{},att:[],conn:{},noFolder:false}},H={on,project:'/projects/p1',projects:[],panes:[],models:{claude:[{id:'w1',label:'W1'}]},modes:[]};let saves=0;
 const context:any={document:d.document,LIVE:{S:state,H,esc:(s:any)=>String(s??''),save(){saves++},toast(){},log(){},api:async()=>({ok:true}),sendBinding:()=>({project:H.project,pane:'room',chat:null,generation:0}),bindingCurrent:()=>true,busy:()=>false},addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{fn();return 1}};context.window=context;
 runInContext(source,createContext(context));const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};
 const open=async(k:string)=>{await find('[data-cx="plus"]').emit('click');const nav=d.document.querySelector('[data-cx-nav="'+k+'"]');if(nav){await nav.emit('click');return}
  // TS-08 disabled attachments in the current menu; an older open surface must also stay truthful.
  assert.equal(k,'sources');const row=d.document.querySelectorAll('.cx-row.dis').find(n=>n.textContent.includes('Другие источники'));assert.ok(row);await row.emit('click');assert.equal(d.document.querySelectorAll('[data-cx-src]').length,0);
  const stale=d.document.createElement('span');stale.setAttribute('data-cx',k);d.document.querySelector('.main')!.appendChild(stale);await stale.emit('click')};
 return {...d,H,state,find,open,get saves(){return saves}};
}

for(const menu of ['sources','tools'])test('119/123: connected '+menu+' hides fictitious rows and uses the common empty-data label',async()=>{
 const v=composer(true);await v.open(menu);const pop=v.find('.cx-pop');assert.match(pop.textContent,/данных нет: движок отдаёт только историю ходов/);
 assert.equal(pop.querySelectorAll('[data-cx-src], [data-cx-tog]').length,0);assert.doesNotMatch(pop.textContent,/OMG|45telega|YouTube|youtube|ChatGPT|perplexity|context7|Jeanneau|Поиск оптимизации/);assert.equal(v.saves,0);
});

for(const menu of ['sources','tools'])test('119/123: offline '+menu+' is explicitly a mock and stale selections cannot mutate a connected chat',async()=>{
 const v=composer(false);await v.open(menu);const pop=v.find('.cx-pop');assert.match(pop.textContent,/макет/);const control=v.find(menu==='sources'?'[data-cx-src]':'[data-cx-tog]'),before=JSON.stringify(v.state);
 v.H.on=true;await control.emit('click');assert.equal(JSON.stringify(v.state),before);assert.equal(v.saves,0);
});

test('118/119: actual plus paths retain model and project choices, with a root-folder explanation',async()=>{
 const v=composer(true);await v.find('[data-cx="plus"]').emit('click');assert.ok(v.document.querySelector('[data-cx-nav="model"]'));assert.ok(v.document.querySelector('[data-cx-nav="folder"]'));
 await v.find('[data-cx-nav="folder"]').emit('click');await v.find('[data-cx-nav="mkdir"]').emit('click');assert.match(v.find('.cx-pop').textContent,/Общая папка проектов не является проектом/);
});
