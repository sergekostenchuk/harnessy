import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,copyFileSync,fsyncSync} from 'node:fs';
import {join} from 'node:path';
import {Journal} from './journal.ts';
import {JournalError,KINDS} from './types.ts';
import {localIso} from './compat-json.ts';
import {PROTOCOL_TEXT} from './strings.ts';
import {temp,fixture,fixtureDir,error} from './test-support.ts';
process.env.TZ='UTC';
const fixed={now:()=>new Date('2026-10-09T00:00:00.123Z'),id:(ms:number)=>ms.toString(16)+'-abcdef'};

test('[01] protocol first line matches Python bytes and closed kinds',()=>{
 const t=temp();try{const j=new Journal(t.root,fixed),line=readFileSync(j.channelPath,'utf8');
 assert.equal(line,readFileSync(join(fixtureDir,'python-state/channel.ndjson'),'utf8').split('\n')[0]+'\n');
 assert.equal(j.get(0)?.text,PROTOCOL_TEXT);assert.deepEqual(j.get(0)?.kinds,KINDS);assert.equal(j.lastSeq,0)
 }finally{t.close()}
});
test('[02] IDs/time and max valid seq survive reload; immutable record cannot forge history',()=>{
 const t=temp();try{const j=new Journal(t.root),a=j.append({sender:'owner',to:'left',kind:'task',text:'раз'}),b=j.append({sender:'left',to:'right',kind:'question',text:'два'});
 assert.deepEqual([a.seq,b.seq],[1,2]);assert.match(a.id,/^[0-9a-f]+-[0-9a-f]{6}$/);assert.match(a.ts,/\.\d{3}[+-]\d{2}:\d{2}$/);
 assert.throws(()=>{a.text='forged'},TypeError);assert.equal(new Journal(t.root).lastSeq,2);
 const before=process.env.TZ;process.env.TZ='Asia/Kolkata';assert.equal(localIso(new Date('2026-10-09T00:00:00.123Z')),'2026-10-09T05:30:00.123+05:30');process.env.TZ=before
 }finally{t.close()}
});
test('[03] unknown kind keeps Python hint',()=>{
 const t=temp();try{const j=new Journal(t.root);assert.throws(()=>j.append({sender:'left',to:'right',kind:'gossip',text:'x'}),error('kind_unknown','неизвестный вид записи: gossip; есть '+KINDS.join(', ')))}finally{t.close()}
});
test('[04] recipient shape is typed; a string becomes a list',()=>{
 const t=temp();try{const j=new Journal(t.root);for(const to of [undefined,null,[],1,[1],[''],['left',null]])assert.throws(()=>j.append({sender:'owner',to,kind:'note',text:'x'} as never),error('to_invalid','адресат — имя места или список мест'));
 assert.deepEqual(j.append({sender:'owner',to:'left',kind:'note',text:'x'}).to,['left'])}finally{t.close()}
});
test('[05] text emptiness and 100000 limit follow Python Unicode code points',()=>{
 const t=temp();try{const j=new Journal(t.root);for(const text of [undefined,1,'',' \n','\u0085\u001c'])assert.throws(()=>j.append({sender:'owner',to:'left',kind:'note',text} as never),error('text_empty','пустой текст записи'));
 assert.equal(j.append({sender:'owner',to:'left',kind:'note',text:'🙂'.repeat(100000)}).text.length,200000);
 assert.throws(()=>j.append({sender:'owner',to:'left',kind:'note',text:'🙂'.repeat(100001)}),error('text_too_long','текст записи длиннее 100000 символов'));
 assert.equal(j.append({sender:'owner',to:'left',kind:'note',text:'\ufeff'}).text,'\ufeff')
 }finally{t.close()}
});
test('[06] internal append inherits thread and refuses missing reply target',()=>{
 const t=temp();try{const j=new Journal(t.root),q=j.append({sender:'left',to:'right',kind:'question',text:'?',thread:'M-1'});
 assert.equal(j.append({sender:'right',to:'left',kind:'answer',text:'!',reply_to:q.seq}).thread,'M-1');
 assert.throws(()=>j.append({sender:'right',to:'left',kind:'answer',text:'!',reply_to:999}),error('reply_to_missing','нет записи #999'))
 }finally{t.close()}
});
test('[07] evidence is a list of strings or absent',()=>{
 const t=temp();try{const j=new Journal(t.root);for(const evidence of [1,'file',[1],{}])assert.throws(()=>j.append({sender:'left',to:'right',kind:'note',text:'x',evidence} as never),error('evidence_invalid','evidence — список строк'));
 assert.deepEqual(j.append({sender:'left',to:'right',kind:'note',text:'x',evidence:null}).evidence,[])}finally{t.close()}
});
test('[08] pending excludes self/system/unconfirmed and honours wildcard',()=>{
 const t=temp();try{const j=new Journal(t.root);
 j.append({sender:'owner',to:'left',kind:'task',text:'a'});j.append({sender:'left',to:'right',kind:'status',text:'b'});j.append({sender:'right',to:'*',kind:'note',text:'c'});
 const held=j.append({sender:'right',to:'left',kind:'note',text:'held',ack:'pending'});j.append({sender:'harness',to:'left',kind:'policy',text:'policy'});
 j.markAcked(held.seq);assert.deepEqual(j.pendingFor('left').map(e=>e.record.text),['a','c']);
 j.append({sender:'harness',to:'right',kind:'ack',text:'fake actor',reply_to:held.seq});assert.deepEqual(j.pendingFor('left').map(e=>e.record.text),['a','c']);
 j.append({sender:'owner',to:'right',kind:'ack',text:'yes',reply_to:held.seq});assert.deepEqual(j.pendingFor('left').map(e=>e.record.text),['a','c','held'])
 }finally{t.close()}
});
test('[09] Python state opens, continues byte-for-byte and persists cursors/panes',()=>{
 const t=temp();try{const state=join(t.root,'.harness','state');mkdirSync(state,{recursive:true});for(const name of ['channel.ndjson','cursors.json','panes.json'])copyFileSync(join(fixtureDir,'python-state',name),join(state,name));
 const j=new Journal(t.root,fixed);assert.equal(j.lastSeq,2);assert.deepEqual(j.cursors,{left:1,reviewer:2});
 const panes=j.loadPanes();j.savePanes(panes);assert.equal(readFileSync(j.panesPath,'utf8'),readFileSync(join(fixtureDir,'python-state/panes.json'),'utf8'));
 j.append({sender:'owner',to:'left',kind:'note',text:'продолжение 🙂',thread:'M-2',score:0,accepted:false});
 assert.equal(readFileSync(j.channelPath,'utf8'),readFileSync(join(fixtureDir,'python-state/continued.ndjson'),'utf8'));
 j.advance('left',3);j.advance('left',1);assert.equal(readFileSync(j.cursorsPath,'utf8'),'{\n  "left": 3,\n  "reviewer": 2\n}');
 const reloaded=new Journal(t.root);assert.equal(reloaded.lastSeq,3);assert.equal(reloaded.cursors.left,3);assert.deepEqual(reloaded.pendingFor('left'),[])
 }finally{t.close()}
});
test('[10] read filters and last-N/zero-all match Python',()=>{
 const t=temp();try{const j=new Journal(t.root);j.append({sender:'owner',to:'left',kind:'task',text:'a',thread:'T1'});j.append({sender:'owner',to:'left',kind:'note',text:'b',thread:'T2'});
 assert.deepEqual(j.read({thread:'T1'}).map(r=>r.text),['a']);assert.deepEqual(j.read({since:1}).map(r=>r.text),['b']);assert.deepEqual(j.read({kinds:['note']}).map(r=>r.text),['b']);assert.equal(j.read({limit:1}).length,1);assert.equal(j.read({limit:0}).length,2)
 }finally{t.close()}
});
test('[29] panes atomic rename keeps old bytes on failure; broken JSON loads empty',()=>{
 const t=temp();try{const j=new Journal(t.root);j.savePanes({left:{model:'m',sessionId:'s'}});
 const broken=new Journal(t.root,{fs:{renameSync:()=>{throw Error('rename fault')}}});assert.throws(()=>broken.savePanes({left:{model:'new'}}),error('write_failed'));assert.equal((j.loadPanes().left as {model:string}).model,'m');
 writeFileSync(j.panesPath,'{bad');assert.deepEqual(j.loadPanes(),{})
 }finally{t.close()}
});
test('[30] simultaneous callers of single synchronous writer get 100 consecutive seq',async()=>{
 const t=temp();try{const j=new Journal(t.root),records=await Promise.all(Array.from({length:100},(_,i)=>Promise.resolve().then(()=>j.append({sender:'owner',to:'left',kind:'note',text:String(i)}))));
 assert.deepEqual(records.map(r=>r.seq),Array.from({length:100},(_,i)=>i+1));assert.equal(new Journal(t.root).lastSeq,100)
 }finally{t.close()}
});
test('[36] torn tail, valid line without LF and malformed structure preserve history/max seq',()=>{
 const t=temp();try{let j=new Journal(t.root);const first=j.append({sender:'owner',to:'left',kind:'note',text:'first'});
 const fragment='{ "seq": 2, "kind": "no';appendFileSync(j.channelPath,fragment);j=new Journal(t.root);assert.equal(j.tailBroken,true);
 const second=j.append({sender:'owner',to:'left',kind:'note',text:'after fragment'});assert.equal(second.seq,2);assert.ok(readFileSync(j.channelPath,'utf8').includes(fragment+'\n'));
 appendFileSync(j.channelPath,'{}\n'+JSON.stringify({...first,seq:'999'})+'\n'+JSON.stringify({...first,seq:17,text:'tail'}));
 j=new Journal(t.root);assert.equal(j.lastSeq,17);assert.ok(j.diagnostics.skipped>=3);assert.equal(j.append({sender:'owner',to:'left',kind:'note',text:'continued'}).seq,18);
 assert.deepEqual(new Journal(t.root).read({limit:0}).map(r=>r.seq),[1,2,17,18])
 }finally{t.close()}
});
test('[37] failed fsync publishes no event and retains only confirmed in-memory prefix',()=>{
 let fail=false;const f=fixture(undefined,{fs:{fsyncSync:fd=>{if(fail)throw Error('fsync fault');fsyncSync(fd)}}});
 try{fail=true;assert.throws(()=>f.core({to:'worker',kind:'task',text:'uncertain'}),e=>e instanceof JournalError&&e.code==='write_failed'&&e.maybeWritten===true);
 assert.deepEqual(f.events,[]);assert.equal(f.journal.diagnostics.confirmedSeq,0);assert.equal(f.journal.recovering,true);assert.equal(new Journal(f.root).get(1)?.text,'uncertain')
 }finally{f.close()}
});
for(const point of ['append','fsync'] as const)test('[42] '+point+' error after actual write recovers before next seq and restart',()=>{
 let fail=false;const t=temp();try{const j=new Journal(t.root,{fs:{appendFileSync:(...args:Parameters<typeof appendFileSync>)=>{appendFileSync(...args);if(fail&&point==='append')throw Error('append fault')},fsyncSync:fd=>{fsyncSync(fd);if(fail&&point==='fsync')throw Error('fsync fault')}}});
 fail=true;assert.throws(()=>j.append({sender:'owner',to:'left',kind:'task',text:'uncertain'}),e=>e instanceof JournalError&&e.code==='write_failed'&&e.maybeWritten===true);assert.equal(j.recovering,true);
 fail=false;assert.equal(j.append({sender:'owner',to:'left',kind:'task',text:'next'}).seq,2);assert.equal(j.recovering,false);assert.deepEqual(j.read({limit:0}).map(r=>r.seq),[1,2]);assert.deepEqual(new Journal(t.root).read({limit:0}).map(r=>r.seq),[1,2])
 }finally{t.close()}
});
test('cursor save failure cannot advance memory; prototype-like seat ID remains ordinary key',()=>{
 const t=temp();try{const j=new Journal(t.root);j.advance('__proto__',1);const fail=new Journal(t.root,{fs:{renameSync:()=>{throw Error('rename fault')}}});
 assert.equal(fail.cursors.__proto__,1);assert.throws(()=>fail.advance('__proto__',2),error('write_failed'));assert.equal(fail.cursors.__proto__,1);assert.equal(new Journal(t.root).cursors.__proto__,1)
 }finally{t.close()}
});

test('Python numeric/prototype-looking JSON keys retain insertion order on save and cursor update',()=>{
 const t=temp();try{const state=join(t.root,'.harness','state');mkdirSync(state,{recursive:true});copyFileSync(join(fixtureDir,'python-state/numeric-cursors.json'),join(state,'cursors.json'));copyFileSync(join(fixtureDir,'python-state/numeric-panes.json'),join(state,'panes.json'));
 const j=new Journal(t.root);j.savePanes(j.loadPanes());assert.equal(readFileSync(j.panesPath,'utf8'),readFileSync(join(fixtureDir,'python-state/numeric-panes.json'),'utf8'));
 j.advance('2',4);assert.equal(readFileSync(j.cursorsPath,'utf8'),'{\n  "2": 4,\n  "1": 2,\n  "__proto__": 3\n}');assert.equal(new Journal(t.root).cursors.__proto__,3)
 }finally{t.close()}
});

test('write fault before append and partial fragment recover with no lost valid record or reused valid seq',()=>{
 for(const partial of [false,true]){let fail=false;const t=temp();try{const j=new Journal(t.root,{fs:{appendFileSync:(...args:Parameters<typeof appendFileSync>)=>{
 if(fail){if(partial)appendFileSync(args[0],'{"seq": 1,');throw Error('write fault')}appendFileSync(...args)
 }}});
 fail=true;assert.throws(()=>j.append({sender:'owner',to:'left',kind:'note',text:'fail'}),error('write_failed'));assert.equal(j.diagnostics.confirmedSeq,0);
 fail=false;assert.equal(j.append({sender:'owner',to:'left',kind:'note',text:'after'}).seq,1);assert.deepEqual(new Journal(t.root).read({limit:0}).map(r=>r.text),['after'])
 }finally{t.close()}}
});
