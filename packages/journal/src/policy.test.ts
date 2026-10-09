import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,unlinkSync,writeFileSync,utimesSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {Policy,PolicyError} from './policy.ts';
import {KINDS} from './types.ts';
import {fixture,temp,fixtureDir} from './test-support.ts';

test('[24] policy validation preserves exact static Python errors and rejects unsafe tags',()=>{
 const t=temp();try{const path=join(t.root,'p.yaml');
 for(const [source,message] of [
 ['routes: nope','comms-policy.yaml: нужен список routes'],['routes: [nope]','comms-policy.yaml: маршрут №1 должен быть таблицей'],
 ['routes: [{kinds: [gossip]}]','comms-policy.yaml: маршрут №1: неизвестный вид gossip'],
 ['routes: [{trigger: later}]','comms-policy.yaml: маршрут №1: триггер «later» не поддерживается'],
 ['routes: [{bounds: x}]','comms-policy.yaml: маршрут №1: bounds должен быть таблицей']
 ]){writeFileSync(path,source!);assert.throws(()=>new Policy(path),e=>e instanceof PolicyError&&e.message===message)}
 for(const source of ['!!python/object/apply:os.system [echo unsafe]','routes: !unknown []','routes: [','version: nope\nroutes: []','routes: [!!python/object:Thing {}]']){writeFileSync(path,source);assert.throws(()=>new Policy(path),PolicyError)}
 }finally{t.close()}
});
test('[24] YAML 1.1 booleans, merge keys, anchors and duplicate keys match safe PyYAML',()=>{
 const t=temp();try{const path=join(t.root,'p.yaml');writeFileSync(path,readFileSync(join(fixtureDir,'yaml11.yaml')));const p=new Policy(path);
 assert.equal(p.version,7);assert.deepEqual(p.routes[0]?.from,['executor']);assert.deepEqual(p.routes[0]?.bounds,{yes_value:true,no_value:false,on_value:true,off_value:false});assert.deepEqual(p.allowedKinds('executor','reviewer'),['review-request'])
 }finally{t.close()}
});
test('[25] first matching route, wildcard kinds and denied-kind hints match Python matrix',()=>{
 const f=fixture();try{const p=f.policy;
 for(const [from,to,kind] of [['owner','executor','task'],['assistant','reviewer','stop'],['orchestrator','executor','task'],['architect','orchestrator','proposal'],['executor','reviewer','review-request'],['tester','executor','report'],['researcher','executor','report']])assert.equal(p.checkSend(from!,to!,kind!).allow,true);
 for(const [from,to,kind] of [['reviewer','executor','task'],['tester','executor','task'],['architect','executor','task'],['executor','architect','task'],['executor','reviewer','verdict']])assert.equal(p.checkSend(from!,to!,kind!).allow,false);
 assert.equal(p.checkSend('reviewer','executor','task').reason,'политика v1: reviewer может писать executor только: verdict, question, answer, note');
 assert.equal(p.checkSend('unknown','executor','note').reason,'политика v1: у роли unknown нет маршрута к executor');
 assert.deepEqual(p.allowedKinds('owner','anything'),KINDS);assert.equal(p.routeFor('reviewer','executor','verdict')?.trigger,'reply-to:review-request');
 f.reload('routes:\n  - {from: a, to: b, kinds: note, trigger: owner-ack}\n  - {from: a, to: b, kinds: "*"}');p.maybeReload();assert.equal(p.checkSend('a','b','note').pending,true);assert.equal(p.checkSend('a','b','note').reason,'ждёт подтверждения владельца')
 }finally{f.close()}
});
test('[26] observing owner/wildcard/list/absent roles honours policy',()=>{
 const f=fixture();try{const p=f.policy;assert.equal(p.canObserve('owner','anything'),true);assert.equal(p.canObserve('assistant','executor'),true);assert.equal(p.canObserve('orchestrator','tester'),true);assert.equal(p.canObserve('reviewer','executor'),true);
 assert.equal(p.canObserve('reviewer','architect'),false);assert.equal(p.canObserve('executor','reviewer'),false);assert.equal(p.canObserve('researcher','executor'),false);assert.equal(p.canObserve('unknown','executor'),false);assert.equal(p.canObserve('__proto__','executor'),false)
 }finally{f.close()}
});
test('[27] summary text and route triggers are verbatim Python',()=>{
 const f=fixture();try{
 assert.equal(f.policy.summaryFor('executor',{orchestrator:'orchestrator',reviewer:'reviewer',executor:'executor'},{orchestrator:'оркестратор',reviewer:'ревьюер',executor:'исполнитель'}),
 'Твои маршруты по политике связи (кому какие виды записей ты можешь отправлять):\n- orchestrator (оркестратор): status, question, blocker, answer, note\n- reviewer (ревьюер): review-request, question, answer, status, note\n- owner (владелец): status, question, blocker, answer, note, escalation\nЧитать чужие разговоры (read_pane, сводка) ты можешь у: никого. Запись вне маршрута сервер отклонит с причиной.');
 assert.match(f.policy.summaryFor('reviewer',{worker:'executor',reviewer:'reviewer'},{}),/verdict: reply-to:review-request/);
 assert.match(f.policy.summaryFor('assistant',{},{}),/у: все окна\./)
 }finally{f.close()}
});
test('[28] reload swaps only fully validated immutable snapshot and retains broken error',()=>{
 const f=fixture();try{const p=f.policy,old=p.snapshot();assert.equal(p.maybeReload(),false);assert.throws(()=>{(old.routes[0]!.from as string[]).push('attacker')},TypeError);
 f.reload('version: 7\nroutes: [{from: a, to: b, kinds: note}, {kinds: [gossip]}]');assert.throws(()=>p.maybeReload(),PolicyError);assert.equal(p.broken,true);assert.equal(p.snapshot(),old);assert.equal(p.version,1);assert.equal(p.checkSend('owner','executor','task').allow,false);assert.ok(p.error);
 unlinkSync(f.policyPath);assert.throws(()=>p.maybeReload(),PolicyError);assert.equal(p.snapshot(),old);
 f.reload('version: 7\nroutes: [{from: a, to: b, kinds: note}]');assert.equal(p.maybeReload(),true);assert.equal(p.broken,false);assert.equal(p.version,7);assert.equal(p.error,null);assert.equal(old.version,1);assert.equal(p.maybeReload(),false)
 }finally{f.close()}
});

for(const fault of ['corrupt','deleted'] as const)test('broken '+fault+' policy denies observation to agents until restored',()=>{
 const f=fixture();try{
 const summary=f.policy.summaryFor('assistant',f.roles,{});assert.equal(f.policy.canObserve('assistant','executor'),true);
 if(fault==='corrupt')f.reload('routes: [');else unlinkSync(f.policyPath);
 assert.throws(()=>f.policy.maybeReload(),PolicyError);assert.equal(f.policy.broken,true);
 assert.equal(f.policy.canObserve('assistant','executor'),false);assert.equal(f.policy.canObserve('owner','executor'),true);
 assert.equal(f.policy.summaryFor('assistant',f.roles,{}),summary);assert.equal(f.policy.snapshot().canObserve('assistant','executor'),true);
 f.reload(readFileSync(join(fixtureDir,'comms-policy.yaml'),'utf8'));assert.equal(f.policy.maybeReload(),true);
 assert.equal(f.policy.canObserve('assistant','executor'),true);assert.equal(f.policy.broken,false);
 }finally{f.close()}
});
