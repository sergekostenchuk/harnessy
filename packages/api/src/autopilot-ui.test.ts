import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {deferred,until} from './test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/autopilot-ui.js',import.meta.url),'utf8');
const state=(on=true,generation=2)=>({on,generation,startedAt:'2026-10-26T01:00:00Z',until:{kind:'morning',at:'2026-10-27T04:00:00Z'},conditions:{operations:['answer_question','answer_blocker','answer_escalation'],stopCases:['payment','external_publish','data_delete','software_install','external_network','spend_over_cap'],maxSpendPercent:7}});
const row=(id='a',project='/a',generation=2,status='applied',at='2026-10-26T02:00:00Z')=>({version:1,project,at,entry:{state:status,generation,decisionId:id.repeat(64)}});
function view(live?:any){const window:any=live?{LIVE:live}:{},listeners=new Map<string,Function[]>(),context=createContext({window,Date,Set,JSON,Number,addEventListener:(name:string,fn:Function)=>listeners.set(name,[...listeners.get(name)||[],fn])});runInContext(source,context);return {ui:window.HARNESS_AUTOPILOT_UI,listeners}}
test('TS-42 conditions and time use engine fields; missing data is not off or zero',()=>{
 const {ui}=view();assert.match(ui.format(null),/не подтверждено/);assert.match(ui.format({on:false}),/условия не подтверждены.*потолок не подтверждён/);
 const off=ui.format(state(false));for(const word of ['выключен','вопросы','блокеры','эскалации','деньги','публикация','удаление','установка','сеть','сверх потолка','7 %'])assert.ok(off.includes(word),word);
 assert.match(ui.format(state()),/консилиумом: оркестратор \+ ревьюер.*читаю журнал/);assert.match(ui.format({...state(),until:{kind:'reply',at:null}}),/до ответа/);assert.match(ui.format(state(),{error:true}),/журнал недоступен/);
});
test('TS-42 count is unique applied decisions of this project, generation and night; unconfirmed is not zero',()=>{
 const {ui}=view(),rows=[row(),row(),row('b','/b'),row('c','/a',1),row('d','/a',2,'intent'),row('e','/a',2,'applied','2026-10-25T01:00:00Z'),row('f'),{...row('g'),at:'bad'},{...row(),entry:{state:'applied',generation:2}}];
 assert.equal(ui.count(state(),rows,'/a'),2);assert.equal(ui.count(state(),null,'/a'),null);assert.match(ui.format(state(),{rows:[],project:'/a'}),/ночь: 0/);
});
test('TS-42 stale project/generation response cannot change the new project, including A→B→A',async()=>{
 const pending=deferred<any>(),calls:string[]=[],H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()},panes:[]};let held=true;
 const L={H,api:async(path:string)=>{calls.push(path);if(path.includes('decisions'))return held?pending.promise:{ok:true,project:H.project,decisions:[]};return {project:H.project,records:[]}},autopilotDraw(){},chatGuidanceDraw(){}};
 const {ui}=view(L);await until(()=>calls.length===2);H.project='/b';H.confirmedProjectGeneration++;held=false;await ui.refresh();H.project='/a';H.confirmedProjectGeneration++;await ui.refresh();
 pending.resolve({ok:true,project:'/a',decisions:[row()]});await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/ночь: 0/);
});
test('TS-42 typed engine refusal is shown, malformed/untrusted/old reasons are excluded; status refresh does not loop',async()=>{
 const H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()},panes:[{kind:'reviewer',model:''}]};let calls=0;
 const note=(text:string,ts='2026-10-26T02:00:00Z',origin='autopilot-owner')=>({text,ts,origin});
 const L={H,api:async(path:string)=>{calls++;return path.includes('decisions')?{ok:true,project:'/a',decisions:[]}:{project:'/a',records:[note(JSON.stringify({code:'reviewer_missing',reason:'В проекте нет подтверждённого ревьюера'})),note('{bad'),note(JSON.stringify({code:'fake',reason:'Подмена'}),undefined,'agent'),note(JSON.stringify({code:'old',reason:'Старое'}),'2026-10-25T01:00:00Z'),{origin:'autopilot-owner',text:JSON.stringify({code:'fake',reason:'Без времени'})}]}},autopilotDraw(){},chatGuidanceDraw(){}};
 const {ui}=view(L);await until(()=>calls===2);await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/Последний отказ движка: В проекте нет подтверждённого ревьюера/);assert.doesNotMatch(ui.text(state()),/Подмена|Старое|Без времени/);await ui.refresh();assert.equal(calls,2);
 H.on=false;await ui.refresh();assert.doesNotMatch(ui.text(state()),/нет подтверждённого ревьюера/);
});
test('TS-42 refuses foreign decision snapshots and distinguishes failed read from empty journal',async()=>{
 const H={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()}};const {ui}=view({H,api:async()=>({ok:true,project:'/b',decisions:[row()]}),autopilotDraw(){},chatGuidanceDraw(){}});await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/журнал недоступен/);assert.doesNotMatch(ui.text(state()),/ночь: 0/);
});
test('TS-42 shipped copy has no retired Autopilot disclaimer; RU/EN live demo and factual article retain clip 02',()=>{
 for(const file of ['ui/deploy/live.js','ui/deploy/proto.js','ui/sketches/disarto/18-overlays.html'])assert.doesNotMatch(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'),/автоматическое исполнение решений ещё не подключено|движок пока не исполняет Автопилот|решения пока (?:ждут вас|остаются владельцу)/i,file);
 const demo=readFileSync(new URL('../../../ui/sketches/disarto/43-demo.html',import.meta.url),'utf8');assert.match(demo,/href="\/sketches\/proto\/18-overlays.html#leave"/);assert.match(demo,/alpha · live window/);assert.doesNotMatch(demo,/Autopilot \(interface\)|Автопилот \(интерфейс\)/);
 const article=readFileSync(new URL('../../../ui/sketches/disarto/42-article.html',import.meta.url),'utf8');assert.match(article,/Деньги, публикация, удаление данных, установка программ и внешняя сеть/);assert.match(article,/Payments, publishing, data deletion, software installation and external networking/);assert.match(article,/Harnessy-autopilot-ru.mp4/);assert.doesNotMatch(article,/Любое решение можно отменить|Any decision can be undone/);
});
