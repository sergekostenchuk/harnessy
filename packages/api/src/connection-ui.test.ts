import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/connection-ui.js',import.meta.url),'utf8');
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
for(const page of ['new','chat','inbox','swarm','constructor'])test('TS-43 connection failure and recovery: '+page,async()=>{
 const d=dom('<div class="frame"><main class="main"><p>sketch</p></main></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');d.html.dataset.page=page;
 const timers=new Map<number,()=>void>();let seq=0,calls=0,finish!:()=>void;const H:any={on:false},L={H,connect:async()=>{calls++;await new Promise<void>(resolve=>finish=resolve);H.on=true;await d.window.emit('live:status')}};
 const context:any={document:d.document,LIVE:L,addEventListener:d.window.addEventListener.bind(d.window),setTimeout:(fn:()=>void)=>{timers.set(++seq,fn);return seq},clearTimeout:(id:number)=>timers.delete(id)};context.window=context;runInContext(source,createContext(context));
 assert.equal(d.html.dataset.liveConnection,'loading');await d.window.emit('live:offline');assert.equal(d.html.dataset.liveConnection,'error');assert.match(d.document.querySelector('[data-live-connection]')!.textContent,/Не удалось прочитать/);assert.equal(timers.size,1);
 await d.document.querySelector('[data-live-retry]')!.emit('click');await d.document.querySelector('[data-live-retry]')!.emit('click');await tick();assert.equal(calls,1);finish();await tick();assert.equal(d.html.dataset.liveConnection,'ready');assert.equal(timers.size,0);
 H.project='/known';await d.window.emit('live:offline');assert.match(d.document.querySelector('[data-live-connection]')!.textContent,/Последний снимок устарел/);await d.window.emit('pagehide');assert.equal(timers.size,0);
});
