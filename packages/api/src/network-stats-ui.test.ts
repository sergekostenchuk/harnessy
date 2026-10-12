import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
const code=readFileSync(new URL('../../../ui/deploy/network-stats.js',import.meta.url),'utf8');
function ui(search='',hash=''){
 const d=dom('<div class="frame"><div class="top"><div id="seg"><span class="on" data-v="over">Обзор</span><span data-v="proj">Проект</span></div><div data-spend-periods>30 дней</div></div><div class="views"><div data-spend-status>Реальные токены</div><div class="view on" id="v-over">Обзор</div><div class="view" id="v-proj">Проект</div></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});const navigation:string[]=[],requests:any[]=[];
 const context:any={document:d.document,location:{pathname:'/05-spend.html',search,hash,href:'http://test/05-spend.html'+search+hash},URL,URLSearchParams,history:{replaceState:(_:any,__:any,url:string)=>navigation.push(url)},LIVE:{esc:(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),api:(...args:any[])=>requests.push(args)}};context.window=context;runInContext(code,createContext(context));const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};return {...d,navigation,requests,find,click:(s:string)=>find(s).emit('click')};
}
test('22i: proxy tab compares only the requested metrics with clearly labelled samples; all original tabs remain usable',async()=>{
 const v=ui();assert.equal(v.find('#v-over').classList.contains('on'),true);await v.click('[data-v="proxy"]');assert.ok(v.find('#v-proxy').classList.contains('on'));assert.ok(v.find('.frame').classList.contains('net-proxy-active'));assert.equal(v.find('#v-over').classList.contains('on'),false);assert.match(v.find('#v-proxy').textContent,/макет.*Источник статистики.*не измерения/);
 assert.equal(v.find('#v-proxy').querySelectorAll('.net-stats-cards article').length,2);assert.equal(v.find('[data-net-metric]').querySelectorAll('option').length,13);assert.equal(v.find('#v-proxy').querySelectorAll('table').length,3);
 for(const metric of ['Мбит/с','ГБ','Доступность','Падения','Цена','p50','p95','429','Блокировки','Смены IP','Смены страны','На резерве','Перезапуски туннелей'])assert.ok(v.find('#v-proxy').textContent.includes(metric),metric);
 for(const tab of ['proj','over','proxy']){await v.click('[data-v="'+tab+'"]');assert.ok(v.find('#v-'+tab).classList.contains('on'));assert.equal(v.find('.frame').classList.contains('net-proxy-active'),tab==='proxy')}
 assert.equal(v.requests.length,0,'no source and no probes at step 1');
});
test('22i: hour/day/week/month and metric selection update samples without changing the token-spend period',async()=>{
 const v=ui('?period=30&proxyPeriod=week','#proxy');assert.equal(v.find('[data-net-period="week"]').getAttribute('aria-pressed'),'true');assert.ok(v.find('#v-proxy').classList.contains('on'));
 const sample=v.find('.net-stats-cards').textContent;await v.click('[data-net-period="hour"]');assert.notEqual(v.find('.net-stats-cards').textContent,sample);
 for(const period of ['day','week','month']){await v.click('[data-net-period="'+period+'"]');assert.equal(v.find('[data-net-period="'+period+'"]').getAttribute('aria-pressed'),'true');assert.match(v.navigation.at(-1)!,new RegExp('period=30&proxyPeriod='+period));assert.match(v.find('#v-proxy').textContent,/макет/)}
 const metric=v.find('[data-net-metric]');metric.value='p95';await metric.emit('change');assert.match(v.find('.net-stats-chart').getAttribute('aria-label')!,/Задержка p95/);assert.match(v.find('table caption').textContent,/Задержка p95, мс/);assert.equal(v.document.activeElement,v.find('[data-net-metric]'));
 assert.equal(v.requests.length,0);for(const value of ['%3Cimg%3E','__proto__','constructor']){const invalid=ui('?proxyPeriod='+value);assert.equal(invalid.find('[data-net-period="day"]').getAttribute('aria-pressed'),'true');assert.equal(invalid.document.querySelector('img'),null);assert.doesNotMatch(invalid.find('#v-proxy').textContent,/NaN|undefined/)}
});
