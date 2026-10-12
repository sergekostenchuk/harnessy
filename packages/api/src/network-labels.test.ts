import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call,deferred} from './test-helpers.ts';
import {NetworkSettings} from '@harnessy/projects';
import {MemoryKeys} from '../../llm/src/test-helpers.ts';
const opts={timeout:15000},root='/api/network';
for(const vendor of ['claude','codex'])for(const label of ['Выход владельца',vendor])test('22e.2 r2: explicit rename survives reads, restart and next save: '+vendor+' / '+label,opts,async t=>{
 const h=await fixture(t),id='legacy-'+vendor;
 await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.exits[id]={id,type:'direct',label:vendor};c.chains[vendor]=[id];return {result:undefined}});
 const original=(await call(h.api,root+'/exits')).body.exits[0];assert.equal(h.runtime.settings.network().legacyLabelsVersion,1);
 const saved=await call(h.api,root+'/exits/'+id+'/save',{body:{config:{...original.config,label},revision:original.revision}});assert.equal(saved.status,200);
 const file=join(h.dir,'owner-settings.json'),bytes=readFileSync(file,'utf8'),mtime=statSync(file,{bigint:true}).mtimeNs;
 const [read,chain]=await Promise.all([call(h.api,root+'/exits'),call(h.api,root+'/providers/'+vendor)]);
 assert.equal(read.body.exits[0].config.label,label);assert.equal(read.body.exits[0].revision,saved.body.revision);assert.deepEqual(chain.body.exits,[id]);
 const restarted=new NetworkSettings(h.runtime.settings,new MemoryKeys(),h.runtime.connections,()=>['claude','codex']);assert.equal((await restarted.list())[0]!.config.label,label);
 assert.equal(readFileSync(file,'utf8'),bytes);assert.equal(statSync(file,{bigint:true}).mtimeNs,mtime,'reading must not rewrite settings');
 const next=await call(h.api,root+'/exits/'+id+'/save',{body:{config:{...saved.body.config,label:'Следующее имя владельца'},revision:saved.body.revision}});assert.equal(next.status,200);
});
test('22e.2 r2: repair queued behind owner edit rechecks under lock and becomes read-only afterwards',opts,async t=>{
 const h=await fixture(t);await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.exits['legacy-claude']={id:'legacy-claude',type:'direct',label:'claude'};c.chains.claude=['legacy-claude'];return {result:undefined}});
 const entered=deferred(),release=deferred();t.after(()=>release.resolve());
 const save=h.runtime.settings.changeNetwork(async c=>{c.exits['legacy-claude']!.label='Выход владельца';entered.resolve();await release.promise;return {result:undefined}});await entered.promise;
 const change=h.runtime.settings.changeNetwork.bind(h.runtime.settings);let queued=0;
 h.runtime.settings.changeNetwork=async edit=>{queued++;return change(edit)};
 const reading=h.runtime.network.list();assert.equal(queued,1);release.resolve();await save;const result=await reading;assert.equal(result[0]!.config.label,'Выход владельца');
 assert.equal(h.runtime.settings.network().legacyLabelsVersion,1);
 for(let i=0;i<3;i++)assert.equal((await call(h.api,root+'/exits')).body.exits[0].revision,result[0]!.revision);
 assert.equal(queued,1,'completed label migration must not enter a write transaction on read');
});
test('22e.2 r2: label migration marker is strictly versioned and cannot be supplied through an exit save',opts,async t=>{
 const h=await fixture(t);await call(h.api,root+'/exits');const file=join(h.dir,'owner-settings.json'),bytes=readFileSync(file,'utf8');
 for(const bad of [null,false,true,0,2,'1']){await assert.rejects(h.runtime.settings.changeNetwork(async c=>{Object.assign(c,{legacyLabelsVersion:bad});return {result:undefined}}),{code:'network_invalid'});assert.equal(readFileSync(file,'utf8'),bytes)}
 const result=await call(h.api,root+'/exits/direct/save',{body:{config:{id:'direct',type:'direct',label:'Прямой',legacyLabelsVersion:1},revision:null}});assert.equal(result.body.code,'network_invalid');assert.equal(readFileSync(file,'utf8'),bytes);
});

test('22e.2 r2: batch preview completes label migration before capturing the confirmed snapshot',opts,async t=>{
 const h=await fixture(t);await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.exits['legacy-claude']={id:'legacy-claude',type:'direct',label:'claude'};c.chains.claude=['legacy-claude'];return {result:undefined}});
 const preview=await call(h.api,root+'/checks/preview',{body:{project:h.dir}});assert.equal(preview.status,200);assert.equal(preview.body.check.rows[0].exitLabel,'Напрямую · прежний маршрут Claude');assert.equal(h.runtime.settings.network().legacyLabelsVersion,1);
 const file=join(h.dir,'owner-settings.json'),bytes=readFileSync(file,'utf8');await call(h.api,root+'/exits');assert.equal(readFileSync(file,'utf8'),bytes);
});
