import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {join} from 'node:path';
import {deferred,until,fixture,call,OWNER} from './test-helpers.ts';
import {dom} from './ui-dom-test-helpers.ts';
const source=readFileSync(new URL('../../../ui/deploy/autopilot-ui.js',import.meta.url),'utf8');
const state=(on=true,generation=2)=>({on,generation,startedAt:'2026-10-26T01:00:00Z',until:{kind:'morning',at:'2026-10-27T04:00:00Z'},conditions:{operations:['answer_question','answer_blocker','answer_escalation'],stopCases:['payment','external_publish','data_delete','software_install','external_network','spend_over_cap'],maxSpendPercent:7}});
const row=(id='a',project='/a',generation=2,status='applied',at='2026-10-26T02:00:00Z')=>({version:1,project,at,entry:{state:status,generation,decisionId:id.repeat(64)}});
function view(live?:any){const window:any=live?{LIVE:live}:{},listeners=new Map<string,Function[]>(),context=createContext({window,Date,Set,JSON,Number,addEventListener:(name:string,fn:Function)=>listeners.set(name,[...listeners.get(name)||[],fn])});runInContext(source,context);return {ui:window.HARNESS_AUTOPILOT_UI,listeners}}
test('TS-47.5 F12: off is compact with a stable disclosure; on shows confirmed conditions and errors',()=>{
 const script=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),chunk=script.slice(script.indexOf('  function guidanceState()'),script.indexOf('  function showOrchestratorOffer()'));
 const d=dom('<div class="frame cur"><div class="feed"><div class="col"></div></div></div>'),ap=state(false),H:any={on:true,snapshotOnly:false,panes:[{id:'orch',kind:'orchestrator',model:'m'}],chatList:[],liveStatus:{autopilot:ap}},S:any={chat:[]};
 const context:any=createContext({document:d.document,H,S,PAGE:'chat',sendBinding:()=>({project:'/a',pane:'orch',chat:'c'}),autopilotText:(s:any)=>s?.on?'Стоп-случаи и отказ движка':'Решения и стоп-случаи проекта',esc:(s:any)=>String(s),save(){}});
 runInContext(chunk+';globalThis.draw=chatGuidanceDraw',context);context.draw();let card=d.document.querySelector('[data-autopilot-guidance]')!,details=card.querySelector('details')!;assert.match(card.textContent,/Автопилот выключен.*Настроить.*Условия/);assert.equal(card.querySelector('a')!.getAttribute('href'),'18-overlays.html#leave');
 Reflect.set(details,'open',true);context.draw();assert.equal(d.document.querySelector('details'),details);assert.equal(Reflect.get(details,'open'),true);
 H.liveStatus.autopilot=state(true);context.draw();card=d.document.querySelector('[data-autopilot-guidance]')!;assert.match(card.textContent,/Стоп-случаи и отказ движка/);assert.equal(card.querySelector('details'),null);
 H.on=false;context.draw();assert.equal(d.document.querySelector('[data-autopilot-guidance]'),null);
});
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
 const L={H,api:async(path:string)=>{calls.push(path);if(path.includes('decisions'))return held?pending.promise:{ok:true,project:H.project,decisions:[],lastFailure:null};return {project:H.project,records:[]}},autopilotDraw(){},chatGuidanceDraw(){}};
 const {ui}=view(L);await until(()=>calls.length===1);H.project='/b';H.confirmedProjectGeneration++;held=false;await ui.refresh();H.project='/a';H.confirmedProjectGeneration++;await ui.refresh();
 pending.resolve({ok:true,project:'/a',decisions:[row()],lastFailure:null});await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/ночь: 0/);
});
test('TS-42 typed refusal is generation-bound; missing/malformed refusal metadata is not accepted',async()=>{
 const H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()}};let calls=0,failure:any={code:'reviewer_missing',reason:'В проекте нет подтверждённого ревьюера',generation:2,at:'2026-10-26T02:00:00Z'};
 const L={H,api:async()=>{calls++;return {ok:true,project:'/a',decisions:[],lastFailure:failure}},autopilotDraw(){},chatGuidanceDraw(){}};
 const {ui}=view(L);await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/Последний отказ движка: В проекте нет подтверждённого ревьюера/);await ui.refresh();assert.equal(calls,1);
 for(const value of [undefined,{}, {...failure,generation:1},{...failure,at:'bad'},{...failure,at:'2026-10-25T01:00:00Z'}]){failure=value;await ui.refresh(true);assert.match(ui.text(state()),/журнал недоступен/);assert.doesNotMatch(ui.text(state()),/нет подтверждённого ревьюера/)}
 H.on=false;await ui.refresh();assert.doesNotMatch(ui.text(state()),/нет подтверждённого ревьюера/);
});
test('TS-42 transient 503 recovers on ordinary live status; reconnect refreshes a previously loaded count',async()=>{
 const H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()}};let down=true,calls=0,rows=[row()];const events:any={};
 const {ui,listeners}=view({H,subscribeLiveEvents:()=>events,api:async()=>{calls++;if(down)throw Error('503');return {ok:true,project:'/a',decisions:rows,lastFailure:null}},autopilotDraw(){},chatGuidanceDraw(){}});
 await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/журнал недоступен/);down=false;listeners.get('live:status')![0]!();await until(()=>ui.text(state()).includes('ночь: 1.'));assert.equal(calls,2);assert.match(ui.short(state()),/ · 1 решений$/);assert.doesNotMatch(ui.short(state()),/Решает|стоп-случаи|консилиум/);
 rows=[row(),row('b')];events.onopen();await until(()=>ui.text(state()).includes('ночь: 2.'));assert.equal(calls,3);
});
test('TS-42 real reviewer_missing survives 101 unrelated notes, restart, and cannot leak into another generation',async t=>{
 const h=await fixture(t,{seats:'  orchestrator: {role: orchestrator, vendor: claude, model: w1, mode: chat}\n  worker: {role: executor, vendor: claude, model: w1, mode: chat}',before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),readFileSync(new URL('../../team/templates/comms-policy.yaml',import.meta.url)))});h.clock.time=Date.now();
 await h.runtime.autopilotSet({project:h.dir,instance:h.runtime.project.trace.instanceId,revision:0,on:true,until:'morning',conditions:{operations:['answer_question'],maxSpendPercent:5}},OWNER);h.runtime.channel.post({to:'owner',kind:'question',text:'Как продолжить?',thread:'test-ts42'},{seat:'worker',trust:'agent'});await h.runtime.idle();
 const H:any={on:true,snapshotOnly:false,project:h.dir,confirmedProjectGeneration:1,liveStatus:(await call(h.api,'/api/status')).body},L={H,api:async(path:string)=>(await call(h.api,path)).body,autopilotDraw(){},chatGuidanceDraw(){}};const {ui}=view(L);await until(()=>ui.text(H.liveStatus.autopilot).includes('нет подтверждённого ревьюера'));assert.equal(h.provider.calls.length,0);
 for(let n=0;n<101;n++)h.runtime.journal.append({sender:'harness',to:['owner'],kind:'note',text:'Обычная запись '+n});await ui.refresh(true);assert.match(ui.text(H.liveStatus.autopilot),/нет подтверждённого ревьюера/);
 const current=(await call(h.api,'/api/autopilot/decisions')).body.lastFailure;assert.equal(current.code,'reviewer_missing');assert.equal(current.generation,H.liveStatus.autopilot.generation);
 h.runtime.journal.append({sender:'worker',to:['owner'],kind:'note',origin:'autopilot-owner',text:JSON.stringify({...current,reason:'Подмена'})});assert.equal((await call(h.api,'/api/autopilot/decisions')).body.lastFailure.reason,current.reason);
 await h.runtime.openProject(h.dir);assert.equal((await call(h.api,'/api/autopilot/decisions')).body.lastFailure.reason,current.reason);
 const prior=await h.runtime.autopilotStatus();await h.runtime.autopilotSet({project:h.dir,instance:h.runtime.project.trace.instanceId,revision:prior.revision,on:false},OWNER);assert.equal((await call(h.api,'/api/autopilot/decisions')).body.lastFailure,null);
});
test('TS-42 refuses foreign decision snapshots and distinguishes failed read from empty journal',async()=>{
 const H={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:1,liveStatus:{autopilot:state()}};const {ui}=view({H,api:async()=>({ok:true,project:'/b',decisions:[row()],lastFailure:null}),autopilotDraw(){},chatGuidanceDraw(){}});await new Promise(r=>setImmediate(r));assert.match(ui.text(state()),/журнал недоступен/);assert.doesNotMatch(ui.text(state()),/ночь: 0/);
});
test('TS-42 shipped copy has no retired Autopilot disclaimer; RU/EN live demo and factual article retain clip 02',()=>{
 for(const file of ['ui/deploy/live.js','ui/deploy/proto.js','ui/sketches/disarto/18-overlays.html'])assert.doesNotMatch(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'),/автоматическое исполнение решений ещё не подключено|движок пока не исполняет Автопилот|решения пока (?:ждут вас|остаются владельцу)/i,file);
 const demo=readFileSync(new URL('../../../ui/sketches/disarto/43-demo.html',import.meta.url),'utf8');assert.match(demo,/href="\/sketches\/proto\/18-overlays.html#leave"/);assert.match(demo,/alpha · live window/);assert.doesNotMatch(demo,/Autopilot \(interface\)|Автопилот \(интерфейс\)/);
 const article=readFileSync(new URL('../../../ui/sketches/disarto/42-article.html',import.meta.url),'utf8');assert.match(article,/Деньги, публикация, удаление данных, установка программ и внешняя сеть/);assert.match(article,/Payments, publishing, data deletion, software installation and external networking/);assert.match(article,/Harnessy-autopilot-ru.mp4/);assert.doesNotMatch(article,/Любое решение можно отменить|Any decision can be undone/);
});
