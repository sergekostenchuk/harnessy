import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Connections} from './connections.ts';
import type {CommandResult} from './types.ts';
import {temp,failure,response} from './test-support.ts';
test('[20,29] route errors, proxy env, reset signal and expect/label revision preserve previous check',async()=>{
 const t=temp();try{const c=new Connections(join(t.root,'connections.json'),{now:()=>1000,curl:async args=>response(args.at(-1)!.includes('ipify')?'{"ip":"1.2.3.4"}\n0.123':'{"country_name":"NL","city":"City"}')});assert.equal(c.get('claude').state,'not_checked');assert.deepEqual(c.proxyEnv('claude'),{});
 const r=await c.setRoute('claude','proxy','socks5h://127.0.0.1:1080');assert.equal(r.processRestartNeeded,true);assert.equal(r.rev,1);assert.equal(Object.keys(c.proxyEnv('claude')).length,6);assert.deepEqual(c.proxyEnv('codex'),{});
 const checked=await c.check('claude');assert.equal(checked.state,'checked');assert.equal(checked.ms,123);assert.equal(checked.country,'NL');const same=await c.setRoute('claude','proxy','socks5h://127.0.0.1:1080','','new','1.2.3.4');assert.equal(same.processRestartNeeded,false);assert.equal(same.rev,2);assert.equal(same.lastCheck!.ip,'1.2.3.4');assert.equal((await c.check('claude')).state,'matches');
 const iface=await c.setRoute('claude','iface','','utun4');assert.equal(iface.processRestartNeeded,true);assert.equal(iface.lastCheck,null);assert.deepEqual(c.proxyEnv('claude'),{});
 for(const [args,message] of [
 [['X','direct'],'провайдер: латиница и цифры'],[['claude','tunnel'],'маршрут: direct, proxy или iface'],[['claude','proxy','127.0.0.1:1'],'прокси: адрес вида http://host:port или socks5h://host:port'],[['claude','iface','','UTUN 4'],'интерфейс: имя вида utun4 или en0'],[['claude','direct','','','','bad-ip'],'ожидаемый выход: IP-адрес']
 ] as [string[],string][])await assert.rejects(c.setRoute(args[0]!,args[1],...args.slice(2)),failure('invalid_route',message));
 }finally{t.close()}
});
test('[20,24] fake curl states: changed, mismatch, failed, parse failure; iface is diagnostic only',async()=>{
 const t=temp();try{let reply=response('{"ip":"1.2.3.4"}\n0.2');const calls:string[][]=[],c=new Connections(join(t.root,'connections.json'),{curl:async args=>{calls.push(args);return args.at(-1)!.includes('ipify')?reply:response('',1)}});await c.setRoute('codex','iface','','en0');assert.equal((await c.check('codex')).state,'checked');assert.ok(calls.every(a=>a[0]==='--interface'));assert.deepEqual(c.proxyEnv('codex'),{});
 reply=response('{"ip":"5.6.7.8"}\n0.2');const changed=await c.check('codex');assert.equal(changed.state,'changed');assert.equal(changed.prevIp,'1.2.3.4');await c.setRoute('codex','iface','','en0','','1.2.3.4');assert.equal((await c.check('codex')).state,'mismatch');
 reply=response('',7,'curl: failed');assert.equal((await c.check('codex')).error,'curl: failed');reply=response('bad\n0.1');assert.equal((await c.check('codex')).error,'ответ не разобран');reply=response('');assert.equal((await c.check('codex')).error,'нет ответа');
 }finally{t.close()}
});
test('[24,33] equal-clock route update invalidates in-flight check; reverse completions use completion seq',async()=>{
 const t=temp();try{const path=join(t.root,'connections.json'),pending:((r:CommandResult)=>void)[]=[],c=new Connections(path,{now:()=>1000,curl:args=>args.at(-1)!.includes('ipify')?new Promise(r=>pending.push(r)):Promise.resolve(response('{}'))});
 await c.setRoute('claude','proxy','http://a:1');const old=c.check('claude');await c.setRoute('claude','proxy','http://b:2');const bytes=readFileSync(path);pending[0]!(response('{"ip":"1.1.1.1"}\n0.1'));assert.equal((await old).state,'stale');assert.deepEqual(readFileSync(path),bytes);
 const first=c.check('claude'),second=c.check('claude');pending[2]!(response('{"ip":"2.2.2.2"}\n0.1'));const b=await second;pending[1]!(response('{"ip":"3.3.3.3"}\n0.1'));const a=await first;assert.ok(a.seq!>b.seq!);assert.equal(c.get('claude').lastCheck!.ip,'3.3.3.3');
 writeFileSync(path,'{"codex":{"route":"direct"}}');assert.equal(c.get('codex').rev,0);assert.equal(c.get('codex').seq,0);
 }finally{t.close()}
});
