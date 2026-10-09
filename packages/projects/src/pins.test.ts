import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,symlinkSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pins} from './pins.ts';
import {temp,failure} from './test-support.ts';
test('[18,21,31] folder/chat pins enforce canonical project and server chat metadata, toggles and exact errors',async()=>{
 const t=temp();try{const current=join(t.root,'current'),other=join(t.root,'other'),alias=join(t.root,'alias'),path=join(t.root,'pins.json');mkdirSync(current);mkdirSync(other);symlinkSync(current,alias,'dir');
 const pins=new Pins(path,()=>current,id=>id==='chat'?{title:'real 😀',label:'воркер',pane:'worker'}:null);
 await pins.set({kind:'folder',path:other});assert.equal(pins.get().pins[0]!.current,false);
 assert.equal((await pins.set({kind:'folder',path:other})).on,false);await pins.set({kind:'folder',path:other,on:true});await pins.set({kind:'folder',path:other,on:true});assert.equal(pins.get().pins.length,1);
 const r=await pins.set({kind:'chat',path:alias+'/../alias',chat:'chat',title:'spoof'} as never);assert.equal(r.pins[1]!.path,current);assert.equal(r.pins[1]!.title,'real 😀');assert.equal(pins.get().pins[1]!.current,true);assert.equal(readFileSync(path,'utf8').includes('current'),true);assert.equal(readFileSync(path,'utf8').includes('"current":'),false);
 for(const [input,text,status] of [
 [{kind:'x',path:current},'kind: folder или chat; path обязателен',400],[{kind:'folder'},'kind: folder или chat; path обязателен',400],[{kind:'folder',path:join(t.root,'missing')},'нет такой папки',404],
 [{kind:'chat',path:current},'для чата нужен chat (id)',400],[{kind:'chat',path:other,chat:'chat'},'закрепить можно только чат открытой папки',400],[{kind:'chat',path:current,chat:'missing'},'нет такого чата',404]
 ] as const)await assert.rejects(pins.set(input),e=>failure('invalid_pin',text)(e)&&(e as {status:number}).status===status);
 }finally{t.close()}
});
