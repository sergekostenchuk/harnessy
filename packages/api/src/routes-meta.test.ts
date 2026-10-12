import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import net from 'node:net';
import {listen} from '../../runtime/src/network-test-helpers.ts';
import {join} from 'node:path';
import {ProviderError} from '@harnessy/providers';
import {Connections} from '@harnessy/projects';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';

test('79/107: journal HTTP pagination is exclusive, typed and preserves since/limit/thread semantics',async t=>{
 const h=await fixture(t);for(let i=1;i<=805;i++)h.runtime.journal.append({sender:'owner',to:'worker',kind:'note',thread:i%2?'odd':'even',text:'record '+i});
 const latest=await call(h.api,'/api/journal?limit=400'),older=await call(h.api,'/api/journal?limit=400&before=406'),oldest=await call(h.api,'/api/journal?limit=400&before=6');
 assert.equal(latest.status,200);assert.deepEqual([...oldest.body.records,...older.body.records,...latest.body.records].map(r=>r.seq),Array.from({length:805},(_,i)=>i+1));assert.equal(older.body.lastSeq,805);
 const filtered=await call(h.api,'/api/journal?since=100&limit=0&before=110&thread=odd');assert.deepEqual(filtered.body.records.map((r:{seq:number})=>r.seq),[101,103,105,107,109]);assert.deepEqual((await call(h.api,'/api/journal?before=1')).body.records,[]);
 for(const before of ['','0','-1','1.2','1.0','null','Infinity','1e2','9007199254740992','%202','%2B2','2&before=3']){const bad=await call(h.api,'/api/journal?before='+before);assert.equal(bad.status,400,before);assert.deepEqual(bad.body,{ok:false,code:'before_invalid',error:'before: ожидается целое число больше нуля'})}
 const legacy=await call(h.api,'/api/journal?since=bad&limit=bad');assert.equal(legacy.status,200);assert.equal(legacy.body.records.length,100);assert.equal(legacy.body.records[0].seq,706);
});

test('1/16/19/70: status missing values, failed auth/catalog, static Claude models, and no model replacement',async t=>{
 const h=await fixture(t,{seats:'  codex: {role: executor, vendor: codex, model: old-model, mode: read}'});
 h.provider.auth=async()=>{throw new ProviderError('no_binary','claude не найден; задай CLAUDE_BIN')};h.codex.auth=async()=>{throw new ProviderError('not_logged_in','нет входа')};h.codex.models=async()=>{throw new ProviderError('models_unavailable','нечитаемый каталог')};
 const a=await call(h.api,'/api/status');assert.equal(a.status,200);assert.equal('ok' in a.body,false);assert.equal(a.body.defaultDir,h.runtime.defaultDir);assert.equal(a.body.panes[0].model,'old-model');assert.equal(h.runtime.registry.get('codex')!.model,'old-model');
 assert.deepEqual(a.body.auth,{claude:{loggedIn:false,error:'claude не найден; задай CLAUDE_BIN'},codex:{loggedIn:false,email:null,plan:'',error:'нет входа'}});
 assert.deepEqual(a.body.models,{claude:[{id:'claude-opus-5-5',label:'Opus 5.5'},{id:'claude-fable-5-1',label:'Fable 5.1'},{id:'claude-sonnet-5-5',label:'Sonnet 5.5'},{id:'claude-haiku-5-5',label:'Haiku 5.5'},{id:'claude-haiku-4-5-20251001',label:'Haiku 4.5'}],codex:[{id:'gpt-5.6-sol',label:'gpt-5.6-sol'},{id:'gpt-5.3-codex-spark',label:'gpt-5.3-codex-spark'}]});
 assert.deepEqual(Object.keys(a.body.activeChats),['codex']);const chat=await call(h.api,'/api/chats/'+a.body.activeChats.codex);assert.equal(chat.body.chat.messages,0);assert.equal(chat.body.chat.model,'old-model'); // 83: empty chats exist before the first reply.
assert.deepEqual(a.body.threads,{});assert.equal(a.body.repo,null);assert.deepEqual(a.body.journal,{lastSeq:0,path:join(h.dir,'.harness/state/channel.ndjson')});
 const p=h.runtime.project;p.team=null;p.policy=null;const absent=await call(h.api,'/api/status');assert.deepEqual(absent.body.policy,{version:null,path:null});assert.deepEqual(absent.body.team,{path:null,integrationBranch:null,mergeRoles:[]});
 const conn=await call(h.api,'/api/connections');assert.equal(conn.body.providers[0].auth.error,'claude не найден; задай CLAUDE_BIN');assert.deepEqual(conn.body.providers[1].auth,a.body.auth.codex);
});

for(const path of ['/api/status','/api/connections'])test('65: '+path+' rejects project switch during awaited auth without mixing snapshots',async t=>{
 const h=await fixture(t),gate=deferred<{loggedIn:boolean}>();let entered=false;h.provider.auth=async()=>{entered=true;return gate.promise};const read=call(h.api,path);await until(()=>entered);
 const dir=join(h.dir,'next');mkdirSync(dir);await h.runtime.projectSet(dir,{},OWNER);gate.resolve({loggedIn:true});const a=await read;assert.equal(a.status,409);assert.deepEqual(a.body,{ok:false,code:'project_changed',error:'проект сменился'});
});

test('22c replaces 1/12: legacy writes refuse; saved proxy migrates to relay; legacy read/check survive',{timeout:20000},async t=>{
 let file='';const h=await fixture(t,{deps:{connections:new Connections((file=join('/tmp','harnessy-ts05-connection-'+process.pid+'-'+Math.random()+'.json')),{now:()=>1791500000125,curl:async args=>args.at(-1)==='https://ipapi.co/1.2.3.4/json/'?{code:0,stdout:'{"country_name":"Test"}',stderr:''}:{code:0,stdout:'{"ip":"1.2.3.4"}\n0.025',stderr:''}})}});
 t.after(async()=>{await import('node:fs/promises').then(fs=>fs.rm(file,{force:true}))});h.codex.models=async()=>[{id:'gpt-test',label:'GPT'},{id:'other-model',label:'other'}];
 const all=await call(h.api,'/api/connections');assert.equal(all.body.providers.length,3);assert.deepEqual(all.body.routes,['direct','proxy','iface']);assert.equal(all.body.providers[2].routable,false);assert.equal(all.body.providers[2].route,null);
 assert.deepEqual((await call(h.api,'/api/connections/route',{body:{provider:'router'}})).body,{ok:false,error:'маршрут задаётся только провайдерам, чьи процессы запускает движок: claude, codex'});
 const port=await listen(t,net.createServer()),oldUrl='http://127.0.0.1:'+port;await h.runtime.connections.setRoute('claude','proxy',oldUrl,'','legacy');
 const changed=await call(h.api,'/api/connections/route',{body:{provider:'claude',route:'direct'}});assert.equal(changed.status,409);assert.equal(changed.body.code,'network_route_moved');assert.equal(h.provider.resets,0);assert.equal(h.runtime.connections.get('claude').proxy,oldUrl);
 await h.runtime.runTurn('worker','работа');assert.match(h.provider.calls[0]!.ctx.env.HTTPS_PROXY!,/^http:\/\/harnessy:[A-Za-z0-9_-]{43}@127\.0\.0\.1:\d+$/);assert.notEqual(h.provider.calls[0]!.ctx.env.HTTPS_PROXY,oldUrl);assert.deepEqual(h.runtime.settings.network().chains.claude,['legacy-claude']);
 const check=await call(h.api,'/api/connections/check',{body:{provider:'claude'}});assert.equal(check.status,200);assert.equal(check.body.check.ok,true);assert.equal(check.body.check.ip,'1.2.3.4');assert.equal(check.body.route.lastCheck.ip,'1.2.3.4');
 const iface=await call(h.api,'/api/connections/route',{body:{provider:'codex',route:'iface',iface:'utun4'}});assert.equal(iface.status,409);assert.equal(iface.body.code,'iface_unsupported');assert.equal(h.codex.resets,0);
 assert.deepEqual((await call(h.api,'/api/connections/check',{body:{provider:'router'}})).body,{ok:false,error:'проверка выхода: claude или codex'});
});

test('168/184: journal project summary covers all records; exact filters precede pagination and retain seq boundaries',async t=>{
 const h=await fixture(t);
 for(let i=1;i<=205;i++)h.runtime.journal.append({sender:i%2?'owner':'harness',to:i%3?'worker':['owner','worker'],kind:i%2?'question':'note',thread:i%5?'one':'two',text:'event '+i});
 const page=await call(h.api,'/api/journal?kind=note&from=harness&to=owner&thread=one&limit=4');
 assert.equal(page.body.project,h.dir);assert.deepEqual(page.body.summary,{total:205,byKind:{question:103,note:102}});
 const expected=Array.from({length:205},(_,i)=>i+1).filter(n=>n%2===0&&n%3===0&&n%5!==0);assert.deepEqual(page.body.records.map((r:{seq:number})=>r.seq),expected.slice(-4));
 const before=page.body.records[0].seq,older=await call(h.api,'/api/journal?kind=note&from=harness&to=owner&thread=one&before='+before+'&limit=0');
 assert.deepEqual([...older.body.records,...page.body.records].map(r=>r.seq),expected);assert.deepEqual(older.body.summary,page.body.summary);
 const fresh=await call(h.api,'/api/journal?kind=note&since='+before+'&limit=0');assert.ok(fresh.body.records.every((r:{seq:number;kind:string})=>r.seq>before&&r.kind==='note'));assert.deepEqual(fresh.body.summary,page.body.summary);
 const empty=await call(h.api,'/api/journal?from=nonexistent');assert.deepEqual(empty.body.records,[]);assert.equal(empty.body.summary.total,205);
 assert.equal((await call(h.api,'/api/connections')).body.project,h.dir);
 for(const query of ['kind=unknown','kind=note&kind=question','from=owner&from=harness','to=worker&to=owner']){const r=await call(h.api,'/api/journal?'+query);assert.equal(r.status,400,query);assert.equal(r.body.code,'journal_filter_invalid')}
 const protocol=await call(h.api,'/api/journal?since=-1&before=1&limit=0');assert.deepEqual(protocol.body.records.map((r:{seq:number})=>r.seq),[0]);assert.deepEqual(protocol.body.summary,page.body.summary);
 assert.equal((await call(h.api,'/api/journal?kind=ack')).status,200); // persisted system records use the same filter.
});

test('209: journal from/to/thread match every case without rewriting records or widening exact matches',async t=>{
 const h=await fixture(t);
 h.runtime.journal.append({sender:'Owner',to:['worker','Другой'],kind:'note',thread:'Assignment:AbC',text:'first'});
 h.runtime.journal.append({sender:'owner',to:'WORKER',kind:'note',thread:'assignment:abc',text:'second'});
 h.runtime.journal.append({sender:'owner',to:'worker',kind:'note',thread:'assignment:abcd',text:'different thread'});
 h.runtime.journal.append({sender:'owners',to:'worker-2',kind:'note',text:'no thread'});
 const original=(await call(h.api,'/api/journal?limit=0')).body.records;
 for(const [from,to,thread] of [['owner','worker','assignment:abc'],['OWNER','WORKER','ASSIGNMENT:ABC'],['OwNeR','WoRkEr','AsSiGnMeNt:aBc']]){
  const q=new URLSearchParams({from:from!,to:to!,thread:thread!,kind:'note',limit:'0'}),r=await call(h.api,'/api/journal?'+q);assert.equal(r.status,200);assert.deepEqual(r.body.records,original.slice(0,2));assert.equal(r.body.summary.total,4);
  q.set('before','3');q.set('since','1');assert.deepEqual((await call(h.api,'/api/journal?'+q)).body.records,original.slice(1,2));
 }
 assert.deepEqual((await call(h.api,'/api/journal?to='+encodeURIComponent('дРуГоЙ'))).body.records,original.slice(0,1));
 for(const query of ['from=own','to=work','thread=assignment:ab','thread=absent'])assert.deepEqual((await call(h.api,'/api/journal?'+query)).body.records,[],query);
 assert.deepEqual((await call(h.api,'/api/journal?from=&to=&thread=&limit=0')).body.records,original);
 assert.deepEqual(h.runtime.journal.read({since:0,limit:0}),original);
 assert.equal((await call(h.api,'/api/journal?kind=NOTE')).status,400,'kind remains a typed enumeration');
});
