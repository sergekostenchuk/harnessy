import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {billingConfig,billingSnapshot} from '@harnessy/projects';
import {fixture,call,deferred,OWNER,FakeProvider} from './test-helpers.ts';
const prices=[{vendor:'claude',plan:'Max 5x',amount:100,currency:'USD'},{vendor:'codex',plan:'Pro',amount:200,currency:'EUR'}];
test('218: provider plans and owner dates/prices generate monthly payments, without tokens or credentials',async t=>{
 const p=Object.assign(new FakeProvider(),{auth:async()=>({loggedIn:true,subscriptionType:'max',email:'a@example.test',token:'fixture-secret'}),limits:async()=>({ok:true as const,plan:'Max',planLevel:'5x' as const,extraUsageEnabled:true,fetchedAt:Date.now()/1000,source:'fixture',windows:[{label:'неделя',percentUsed:31,windowMinutes:10080,resetsAt:Date.now()/1000+3600}]})});
 const h=await fixture(t,{deps:{providers:{claude:p}}});h.clock.time=Date.now();h.codex.auth=async()=>({loggedIn:true,plan:'pro',email:'b@example.test'});await h.runtime.limits();
 const empty=await call(h.api,'/api/billing');assert.equal(empty.status,200);assert.equal(empty.body.config.subscriptionPrices.every((r:any)=>r.amount===null),true);assert.equal(empty.body.payments.length,0);
 const patch={subscriptionPrices:prices,subscriptionDates:[{vendor:'claude',date:'2024-01-31',plan:null,account:'a@example.test'},{vendor:'codex',date:'2024-02-01',plan:null,account:'b@example.test'}],limitWarn80:true,limitSwitchCheaper:false};
 assert.equal((await call(h.api,'/api/settings',{body:{scope:'owner',patch}})).status,200);const result=await call(h.api,'/api/billing');assert.equal(result.status,200);assert.doesNotMatch(result.text,/fixture-secret|token/);
 assert.deepEqual(result.body.subscriptions.map((s:any)=>[s.vendor,s.plan,s.amount,s.currency]),[['claude','Max 5x',100,'USD'],['codex','Pro',200,'EUR']]);assert.equal(result.body.subscriptions[0].extraUsageEnabled,true);assert.equal(result.body.payments.length,10);assert.ok(result.body.payments.every((p:any)=>p.source==='owner'));
 assert.equal(h.provider.calls.length,0);assert.equal(h.codex.calls.length,0);
});
test('218: monthly anchor survives February and a leap year, resumes day 31, and never creates earlier payments',()=>{
 const config=billingConfig({subscriptionPrices:prices,subscriptionDates:[{vendor:'claude',date:'2024-01-31',plan:null,account:'a@example.test'}]}),source=[{vendor:'claude',connected:true,account:'a@example.test',plan:'Max',level:'5x'}];
 const dates=billingSnapshot(config,source,Date.parse('2024-02-15')/1000).payments.map(p=>p.date);assert.deepEqual(dates,['2024-01-31','2024-02-29','2024-03-31','2024-04-30','2024-05-31']);
 assert.equal(billingSnapshot(config,[{...source[0]!,connected:false}],Date.parse('2024-02-15')/1000).payments.length,0);
 assert.equal(billingSnapshot(config,[{...source[0]!,level:null}],Date.parse('2024-02-15')/1000).payments[0]!.amount,null,'unknown Max tier is never guessed');
});
test('218: invalid, duplicate and project-scoped billing settings are refused without changing the owner file',async t=>{
 const h=await fixture(t);await h.runtime.settings.patch('owner',{keep:'untouched',subscriptionPrices:prices});const path=join(h.dir,'owner-settings.json'),before=readFileSync(path,'utf8');
 for(const patch of [{subscriptionPrices:[...prices,prices[0]]},{subscriptionPrices:[{...prices[0],amount:-1}]},{subscriptionPrices:[{...prices[0],currency:'<x>'}]},{subscriptionDates:[{vendor:'claude',date:'2024-02-31',plan:null}]},{subscriptionDates:[{vendor:'router',date:'2024-02-01',plan:null}]},{subscriptionDates:[{vendor:'claude',date:'2024-02-01'}]},{limitWarn80:'yes'}]){
  const r=await call(h.api,'/api/settings',{body:{scope:'owner',patch}});assert.equal(r.status,400);assert.equal(r.body.code,'billing_invalid');assert.equal(readFileSync(path,'utf8'),before);
 }
 assert.equal((await call(h.api,'/api/settings',{body:{scope:'project',patch:{subscriptionPrices:[]}}})).body.code,'billing_invalid');
 writeFileSync(join(h.dir,'.harness/state/settings.json'),JSON.stringify({subscriptionPrices:[],limitWarn80:true}));assert.deepEqual(h.runtime.settings.effective().subscriptionPrices,prices);assert.equal(h.runtime.settings.effective().limitWarn80,undefined);
 writeFileSync(path,JSON.stringify({keep:'retained',subscriptionPrices:'bad'}));const broken=await call(h.api,'/api/billing');assert.equal(broken.status,409);assert.equal(broken.body.code,'billing_unreadable');assert.equal((await call(h.api,'/api/settings',{body:{scope:'owner',patch:{subscriptionPrices:prices}}})).status,200);assert.equal(h.runtime.settings.effective().keep,'retained');
});
test('218: a late provider-plan response cannot be labelled as another project',async t=>{
 const h=await fixture(t),entered=deferred(),gate=deferred<{loggedIn:boolean}>();h.provider.auth=async()=>{entered.resolve();return gate.promise};
 const reading=call(h.api,'/api/billing');await entered.promise;const next=join(h.dir,'next');mkdirSync(next);await h.runtime.projectSet(next,{},OWNER);gate.resolve({loggedIn:true});const r=await reading;assert.equal(r.status,409);assert.equal(r.body.code,'project_changed');
});

test('219: payments are account-bound; a different or missing login never inherits dates/amounts, legacy stays unbound',async t=>{
 const h=await fixture(t);let email:string|undefined='a@example.test';h.provider.auth=async()=>({loggedIn:true,email,plan:'pro'});
 const rows=[{vendor:'claude',account:'a@example.test',date:'2026-01-31',plan:null,amount:42,currency:'EUR',enteredAt:1791700000},{vendor:'claude',account:'b@example.test',date:'2026-02-01',plan:null,amount:null,enteredAt:1791700001},{vendor:'codex',date:'2026-02-01',plan:null}];
 await h.runtime.settings.patch('owner',{subscriptionDates:rows,subscriptionPrices:[{vendor:'claude',plan:'Pro',amount:20,currency:'USD'}]});
 let b=(await call(h.api,'/api/billing')).body;assert.equal(b.subscriptions[0].account,'a@example.test');assert.equal(b.subscriptions[0].amount,42);assert.equal(b.payments[0].currency,'EUR');assert.equal(b.bindings[1].status,'other_account');assert.equal(b.bindings[2].status,'unbound');
 email='b@example.test';b=(await call(h.api,'/api/billing')).body;assert.equal(b.subscriptions[0].amount,20);assert.equal(b.bindings[0].status,'other_account');assert.ok(b.payments.every((p:any)=>p.amount===20&&p.date.endsWith('-01')));
 email='c@example.test';b=(await call(h.api,'/api/billing')).body;assert.equal(b.payments.length,0);assert.equal(b.subscriptions[0].date,null);
 email=undefined;b=(await call(h.api,'/api/billing')).body;assert.equal(b.payments.length,0);assert.equal(b.subscriptions[0].account,null);assert.deepEqual(h.runtime.settings.billing().subscriptionDates,rows);
 for(const row of [{...rows[0],account:'<bad>'},{...rows[0],amount:3,currency:undefined},{...rows[0],enteredAt:0}])assert.equal((await call(h.api,'/api/settings',{body:{scope:'owner',patch:{subscriptionDates:[row]}}})).body.code,'billing_invalid');
});

test('TS-14c r2: keyed owner patches reject malformed/conflicting edits atomically and preserve neighbours',async t=>{
 const h=await fixture(t);await h.runtime.settings.patch('owner',{keep:'owner',subscriptionPrices:prices});const path=join(h.dir,'owner-settings.json'),before=readFileSync(path,'utf8');
 const change={collection:'subscriptionPrices',before:prices[0],after:{...prices[0],amount:125}};
 for(const changes of [undefined,[{}],[{...change,before:undefined}],[change,change],[{...change,after:{...change.after,plan:'renamed'}}]]){const r=await call(h.api,'/api/billing',{body:{changes}});assert.equal(r.status,400);assert.equal(r.body.code,'billing_invalid');assert.equal(readFileSync(path,'utf8'),before)}
 const conflict=await call(h.api,'/api/billing',{body:{changes:[change,{collection:'subscriptionPrices',before:{...prices[1],amount:999},after:{...prices[1],amount:10}}]}});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'billing_conflict');assert.equal(readFileSync(path,'utf8'),before);
 assert.equal((await call(h.api,'/api/billing',{body:{changes:[change]}})).status,200);assert.equal(h.runtime.settings.effective().keep,'owner');assert.deepEqual(h.runtime.settings.billing().subscriptionPrices[1],prices[1]);
 const deletion={...change,after:null};assert.equal((await call(h.api,'/api/billing',{body:{changes:[deletion]}})).body.code,'billing_conflict','stale deletion cannot erase a concurrent field edit');
});
test('TS-14c r2: account A quota cannot supply account B tier, price or extra-usage flag',async t=>{
 const h=await fixture(t);let email='a@example.test';h.provider.auth=async()=>({loggedIn:true,email,subscriptionType:'max'});
 Object.assign(h.provider,{limits:async()=>({ok:true,plan:'Max',planLevel:email==='a@example.test'?'5x':'20x',extraUsageEnabled:true,source:'fixture',fetchedAt:h.clock.now()/1000,windows:[{label:'неделя',percentUsed:18,windowMinutes:10080,resetsAt:null}]})});
 await h.runtime.settings.patch('owner',{subscriptionPrices:[prices[0],{...prices[0],plan:'Max 20x',amount:200}],subscriptionDates:['a','b'].map(n=>({vendor:'claude',account:n+'@example.test',date:'2026-11-01',plan:null}))});
 await h.runtime.limits();assert.equal(h.runtime.limitsSnapshot().providers[0]!.account,email);assert.equal((await call(h.api,'/api/billing')).body.subscriptions[0].plan,'Max 5x');
 email='b@example.test';let b=(await call(h.api,'/api/billing')).body;assert.equal(b.subscriptions[0].account,email);assert.match(b.subscriptions[0].detectedPlan,/уровень неизвестен/);assert.equal(b.subscriptions[0].amount,null);assert.equal(b.subscriptions[0].extraUsageEnabled,null);assert.ok(b.payments.every((p:any)=>p.amount===null));
 h.clock.advance(300000);await h.runtime.limits();b=(await call(h.api,'/api/billing')).body;assert.equal(b.subscriptions[0].plan,'Max 20x');assert.equal(b.subscriptions[0].amount,200);
});
