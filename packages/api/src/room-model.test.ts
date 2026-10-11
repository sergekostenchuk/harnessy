import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {initProject} from '@harnessy/projects';
import {fixture,call,OWNER} from './test-helpers.ts';

for(const route of ['select','create','move','move-create'] as const)for(const own of [false,true])test('122/128: '+route+' '+(own?'preserves the destination room model':'copies only the chosen room model')+' across restart',async t=>{
 const h=await fixture(t),r=h.runtime,path=join(h.dir,'destination');
 if(route==='select'||route==='move'||own)await initProject(path,{git:false,orchestrator:false});
 if(own){await r.openProject(path);r.roomSet({model:'w2'},OWNER);r.project.state.savePanes(r.registry,r.journal);await r.openProject(h.dir)}
 r.roomSet({model:'w1'},OWNER);r.chat({pane:'room',message:'source question'},OWNER);await r.idle();const source=r.registry.get('room')!,sourceId=r.project.state.chats.active.room;assert.ok(source.sessionId);assert.equal(source.transcript.length,2);
 const url=route.startsWith('move')?'/api/room/move':route==='create'?'/api/project/create':'/api/project',body=route.startsWith('move')?{path,create:route==='move-create',git:false}:route==='create'?{path,git:false}:{path};
 const response=await call(h.api,url,{body});assert.equal(response.status,200,response.text);assert.equal(response.body.ok,true,response.text);assert.equal(r.project.dir,path);const room=r.registry.get('room')!;
 assert.equal(room.model,own?'w2':'w1');assert.equal(room.sessionId,null);assert.equal(room.cwd,path);assert.equal(room.carry.includes('source question'),route.startsWith('move'));assert.equal(room.transcript.length,route.startsWith('move')?2:0);assert.notEqual(r.project.state.chats.active.room,sourceId);
 if(route.startsWith('move'))assert.equal(room.transcript[1]!.origin,'transferred');
 await r.closeProject();await r.openProject(path);assert.equal(r.registry.get('room')!.model,own?'w2':'w1');assert.equal(r.registry.get('room')!.sessionId,null);assert.equal(h.provider.calls.length,1);
 const disk=JSON.parse(readFileSync(join(path,'.harness','state','panes.json'),'utf8'));assert.equal(disk.room.model,own?'w2':'w1');
});

test('122/128: a fresh project with no previous room leaves the model unselected, never the first catalogue entry',async t=>{
 const h=await fixture(t),path=join(h.dir,'new');await initProject(path,{git:false,orchestrator:false});assert.equal(h.runtime.registry.get('room'),null);
 const response=await call(h.api,'/api/project',{body:{path}});assert.equal(response.status,200);assert.equal(h.runtime.registry.get('room'),null);const status=await call(h.api,'/api/status');assert.ok(status.body.models.claude.length);assert.equal(status.body.panes.some((p:any)=>p.id==='room'),false);
 const rejected=await call(h.api,'/api/chat',{body:{pane:'room',message:'question'}});assert.equal(rejected.status,404);assert.equal(rejected.body.error,'нет окна');assert.equal(h.provider.calls.length,0);
});

test('122/128: an unreadable saved room selection is not overwritten by a catalogue default or another project',async t=>{
 const h=await fixture(t),r=h.runtime,path=join(h.dir,'saved');await initProject(path,{git:false,orchestrator:false});writeFileSync(join(path,'.harness','state','panes.json'),JSON.stringify({room:{model:'not-in-catalogue',mode:'read'}}));r.roomSet({model:'w1'},OWNER);
 await r.projectSet(path,{},OWNER);assert.equal(r.registry.get('room'),null);const saved=JSON.parse(readFileSync(join(path,'.harness','state','panes.json'),'utf8'));assert.equal(saved.room.model,'not-in-catalogue');assert.equal(h.provider.calls.length,0);
});
