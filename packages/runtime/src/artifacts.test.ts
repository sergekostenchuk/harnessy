import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {harness,collect,until,completedActions} from './test-helpers.ts';
import {createRuntime} from './runtime.ts';
import {artifactPaths,conversationHistory} from './state.ts';

test('229: write-tool paths are saved in the result and done event with the exact project, chat and turn',async t=>{
 const h=await harness(t),events=collect(h.runtime);t.after(()=>events.sub.close());h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'tool',name:'Write',detail:join(h.dir,'artifacts/only-in-tool.md')});ctx.publish({type:'tool',name:'Edit',detail:'artifacts/only-in-tool.md, docs/notes.csv'});ctx.publish({type:'done',sessionId:'s1',model:'w1',durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'Готово, документ подготовлен.',sessionId:'s1'}};
 await h.runtime.runTurn('worker','Документ');await until(()=>events.events.some(e=>e.type==='done'));const result=h.runtime.registry.get('worker')!.transcript.at(-1)!,chat=h.runtime.project.state.chats.active.worker!,artifact=result.artifacts!;
 assert.deepEqual(artifact,{project:h.dir,chat,turnInstanceId:(result.runtime as any).turnInstanceId,paths:['artifacts/only-in-tool.md','docs/notes.csv']});assert.equal(result.text.includes('artifacts/'),false);assert.deepEqual(events.events.find(e=>e.type==='done')!.artifacts,artifact);
 const disk=JSON.parse(readFileSync(join(h.dir,'.harness/state/chats.json'),'utf8'));assert.deepEqual(disk.chats[chat].transcript.at(-1).artifacts,artifact);assert.equal(conversationHistory([result])[0]!.artifacts,undefined);
 await h.runtime.close();const next=await createRuntime(h.deps,completedActions);t.after(()=>next.close());assert.deepEqual(next.registry.get('worker')!.transcript.at(-1)!.artifacts,artifact);assert.equal(h.provider.calls.length,1);
});

test('229: saved tool references exclude reads, foreign paths, traversal and control characters; total is bounded',async t=>{
 assert.deepEqual(artifactPaths({name:'Read',detail:'artifacts/a.md'},'/a'),[]);assert.deepEqual(artifactPaths({name:'Write',detail:'/other/artifacts/a.md, artifacts/../secret.md, artifacts/\u0000a.md, /ab/artifacts/a.md'},'/a'),[]);assert.deepEqual(artifactPaths({name:'Write',detail:'/a/artifacts/plan 1.md, ./docs/results.csv'},'/a'),['artifacts/plan 1.md','docs/results.csv']);
 const h=await harness(t);h.provider.onRun=async(_seat,_message,ctx)=>{ctx.modelStarted?.();for(let i=0;i<70;i++)ctx.publish({type:'tool',name:'Write',detail:'artifacts/'+i+'.md'});return {text:'Готово',sessionId:null}};await h.runtime.runTurn('worker','Документы');assert.equal(h.runtime.registry.get('worker')!.transcript.at(-1)!.artifacts!.paths.length,50);
});
