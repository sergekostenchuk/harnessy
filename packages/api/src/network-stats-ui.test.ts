import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {deferred} from './test-helpers.ts';
import {dom} from './ui-dom-test-helpers.ts';
const code=readFileSync(new URL('../../../ui/deploy/network-stats.js',import.meta.url),'utf8');
function ui(search='',hash='',fetcher?: (path:string)=>Promise<any>){
 const d=dom('<div class="frame"><div class="top"><div id="seg"><span class="on" data-v="over">Обзор</span><span data-v="proj">Проект</span></div><div data-spend-periods>30 дней</div></div><div class="views"><div data-spend-status>Реальные токены</div><div class="view on" id="v-over">Обзор</div><div class="view" id="v-proj">Проект</div></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});const navigation:string[]=[],requests:any[]=[];
 const H:any={on:!!fetcher,project:'/one',confirmedProjectGeneration:0};const context:any={addEventListener:d.window.addEventListener.bind(d.window),document:d.document,location:{pathname:'/05-spend.html',search,hash,href:'http://test/05-spend.html'+search+hash},URL,URLSearchParams,history:{replaceState:(_:any,__:any,url:string)=>navigation.push(url)},LIVE:{H,esc:(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:(path:string)=>{requests.push(path);return fetcher?.(path)}}};context.window=context;runInContext(code,createContext(context));const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};return {...d,H,L:context.LIVE,navigation,requests,find,click:(s:string)=>find(s).emit('click')};
}
test('22i.1: disconnected proxy tab shows an honest empty state without fabricated cards, charts or numbers',async()=>{
 const v=ui();assert.equal(v.find('#v-over').classList.contains('on'),true);await v.click('[data-v="proxy"]');assert.ok(v.find('#v-proxy').classList.contains('on'));assert.ok(v.find('.frame').classList.contains('net-proxy-active'));assert.match(v.find('#v-proxy').textContent,/Измерений ещё нет.*Появятся после первых ходов через прокси или VPS/);
 for(const selector of ['.net-stats-cards','.net-stats-chart','table','[data-net-stats-mock]'])assert.equal(v.document.querySelector('#v-proxy '+selector),null);
 assert.doesNotMatch(v.find('#v-proxy').textContent,/24|1,2|99,8|0,40|макет|образец/);
 for(const tab of ['proj','over','proxy']){await v.click('[data-v="'+tab+'"]');assert.ok(v.find('#v-'+tab).classList.contains('on'));assert.equal(v.find('.frame').classList.contains('net-proxy-active'),tab==='proxy')}
 assert.equal(v.requests.length,0,'a disconnected source makes no measurements or probes');
});
test('22i.1: empty periods preserve token period; measured periods retain every metric without invented chart points',async()=>{
 const v=ui('?period=30&proxyPeriod=week','#proxy');assert.equal(v.find('[data-net-period="week"]').getAttribute('aria-pressed'),'true');
 for(const period of ['hour','day','week','month']){await v.click('[data-net-period="'+period+'"]');assert.equal(v.find('[data-net-period="'+period+'"]').getAttribute('aria-pressed'),'true');assert.match(v.navigation.at(-1)!,new RegExp('period=30&proxyPeriod='+period));assert.match(v.find('#v-proxy').textContent,/Измерений ещё нет/);assert.equal(v.document.querySelector('.net-stats-chart'),null)}
 const live=ui('?period=30','#proxy',async path=>measured(12,path.split('=').at(-1)));await live.L.networkStats.refresh();assert.equal(live.find('[data-net-metric]').querySelectorAll('option').length,13);
 for(const period of ['hour','day','week','month']){await live.click('[data-net-period="'+period+'"]');await live.L.networkStats.refresh();assert.match(live.find('.net-stats-cards').textContent,/12 Мбит/);assert.match(live.navigation.at(-1)!,new RegExp('period=30&proxyPeriod='+period))}
 const metric=live.find('[data-net-metric]');metric.value='p95';await metric.emit('change');assert.equal(live.document.querySelector('.net-stats-chart'),null);assert.match(live.find('#v-proxy').textContent,/Нет измерений выбранного показателя/);assert.equal(live.document.activeElement,live.find('[data-net-metric]'));
 for(const value of ['%3Cimg%3E','__proto__','constructor']){const invalid=ui('?proxyPeriod='+value);assert.equal(invalid.find('[data-net-period="day"]').getAttribute('aria-pressed'),'true');assert.equal(invalid.document.querySelector('img'),null);assert.doesNotMatch(invalid.find('#v-proxy').textContent,/NaN|undefined/)}
});

const cells=(overrides:any={})=>Object.fromEntries(['speedBps','bytes','bytesUp','bytesDown','availabilityPct','failures','costUsd','latencyP50Ms','latencyP95Ms','http429','blocks','ipChanges','countryChanges','reserveMs','tunnelRestarts'].map(k=>[k,{value:null,reason:'Нет измерения'}]).concat(Object.entries(overrides)));
const measured=(n=12,period='day')=>({ok:true,source:'connected',period,from:100000,to:200000,generatedAt:200000,exits:[{exitId:'a',label:'Выход A',metrics:cells({speedBps:{value:n*1e6/8,reason:null},bytes:{value:1e9,reason:null},availabilityPct:{value:99,reason:null},failures:{value:0,reason:null},costUsd:{value:1,reason:null}}),series:[{from:100000,to:160000,metrics:cells({speedBps:{value:n*1e6/8,reason:null}})}]}],providers:[]});
test('22h: connected source shows measurements, absent fields stay empty, refresh failures retain dated snapshot',async()=>{
 let response:any=measured();const v=ui('','',async()=>response);await v.L.networkStats.refresh();await v.click('[data-v="proxy"]');assert.doesNotMatch(v.find('#v-proxy').textContent,/макет|образец/);assert.match(v.find('.net-stats-cards').textContent,/12 Мбит\/с.*1 ГБ/);assert.match(v.find('#v-proxy').textContent,/—/);
 response={ok:false,error:'Чтение недоступно'};await v.L.networkStats.refresh();assert.match(v.find('#v-proxy').textContent,/Чтение недоступно.*прежний снимок/);assert.match(v.find('.net-stats-cards').textContent,/12 Мбит\/с/);
 response={...measured(),exits:[],providers:[]};await v.L.networkStats.refresh();assert.equal(v.document.querySelector('.net-stats-cards'),null);assert.match(v.find('#v-proxy').textContent,/Измерений ещё нет.*Появятся после первых ходов через прокси или VPS/);assert.doesNotMatch(v.find('#v-proxy').textContent,/макет|Выход A/);
 response=measured();delete response.exits[0].metrics.bytes;await v.L.networkStats.refresh();assert.match(v.find('#v-proxy').textContent,/неполный ответ/);assert.doesNotMatch(v.find('#v-proxy').textContent,/макет/);
});
test('22h: late period/project/pagehide responses cannot replace current data; pageshow restarts the reader',async()=>{
 const late=deferred<any>();let initial=true;const v=ui('','',async path=>{if(initial){initial=false;return late.promise}return measured(90,path.split('=').at(-1))});await v.click('[data-net-period="hour"]');await v.L.networkStats.refresh();assert.match(v.find('.net-stats-cards').textContent,/90 Мбит\/с/);late.resolve(measured(12));await Promise.resolve();await Promise.resolve();assert.match(v.find('.net-stats-cards').textContent,/90 Мбит\/с/);
 const old=deferred<any>();let hold=false;const w=ui('','',async()=>hold?old.promise:measured(24));await w.L.networkStats.refresh();hold=true;const reading=w.L.networkStats.refresh();await w.window.emit('pagehide');old.resolve(measured(99));await reading;assert.match(w.find('.net-stats-cards').textContent,/24 Мбит\/с/);hold=false;w.H.project='/two';w.H.confirmedProjectGeneration++;await w.window.emit('pageshow',{persisted:true});await w.L.networkStats.refresh();assert.match(w.find('.net-stats-cards').textContent,/24 Мбит\/с/);
});

test('22h: project A → B → A never revives an earlier statistics response',async()=>{
 const old=deferred<any>();let hold=false;
 const v=ui('','',async()=>hold?old.promise:measured(16));await v.L.networkStats.refresh();hold=true;
 const reading=v.L.networkStats.refresh();v.H.project='/two';v.H.confirmedProjectGeneration++;
 hold=false;await v.window.emit('live:status');v.H.project='/one';v.H.confirmedProjectGeneration++;
 await v.window.emit('live:status');await v.L.networkStats.refresh();old.resolve(measured(99));await reading;
 assert.match(v.find('.net-stats-cards').textContent,/16 Мбит\/с/);assert.doesNotMatch(v.find('.net-stats-cards').textContent,/99 Мбит\/с/);
});

test('22i.1: compact metrics keep unavailable values muted and reasons in escaped tooltips',async()=>{
 let response:any={ok:true,source:'not_connected',period:'day',reason:'not connected'};const v=ui('','',async()=>response);await v.L.networkStats.refresh();const holder=v.document.createElement('div');holder.innerHTML=v.L.networkStats.mini('a');v.body.appendChild(holder);assert.equal(holder.querySelectorAll('.net-stat-missing').length,5);assert.equal(holder.querySelector('br'),null);assert.doesNotMatch(holder.textContent,/24|1,2|99,8|макет|образец/);
 response=measured();response.exits[0].metrics.bytes={value:null,reason:'<img src=x> missing'};await v.L.networkStats.refresh();assert.match(holder.textContent,/12 Мбит.*— ГБ/);assert.equal(holder.querySelectorAll('.net-stat-missing').length,1);assert.equal(holder.querySelector('img'),null);assert.match(holder.querySelector('.net-stats-compact')!.getAttribute('title')!,/<img src=x> missing/);
 response={ok:false,error:'Обновление не удалось'};await v.L.networkStats.refresh();assert.match(holder.textContent,/12 Мбит/);assert.match(holder.querySelector('.net-stats-compact')!.getAttribute('title')!,/Обновление не удалось/);assert.equal(holder.querySelector('br'),null);
});
