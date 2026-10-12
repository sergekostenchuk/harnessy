import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred} from './test-helpers.ts';
type Data=Record<string,any>;
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const part=(a:string,b:string)=>{const i=live.indexOf(a),j=live.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return live.slice(i,j)};
const messages=()=>[{role:'me',text:'Первое сообщение'},{role:'ai',src:'sys',text:'Служебная строка'},{role:'ai',src:'live',who:'Модель',text:'Ответ модели'},{role:'me',text:'Третье <img src=x> сообщение 🧠'}].map((m,i)=>({...m,seq:i+1}));
function ui(send?:(body:Data)=>Promise<Data>){
 const d=dom('<div class="frame cur"><div class="main"><div class="feed"></div><div class="box"><div class="in"></div><div class="bar2"></div></div></div></div>');Object.assign(d.document,{body:d.body,documentElement:d.html});d.html.setAttribute('data-proto','');d.html.setAttribute('data-page','chat');
 const H:Data={on:true,project:'/a',pane:{id:'worker',label:'Воркер',vendor:'claude',model:'w1',mode:'read'},panes:[{id:'worker',label:'Воркер'},{id:'reviewer',label:'Ревьюер'}],active:{worker:'chat-a'}},S:Data={ui:{pane:'worker'},chat:messages(),cx:{folder:'',modes:{},att:[],conn:{},noFolder:false}},requests:Data[]=[],toasts:string[]=[],notices:Data[]=[];
 const ctx:Data={document:d.document,PAGE:'chat',H,S,setTimeout(){},addEventListener:d.window.addEventListener.bind(d.window),esc:(s:unknown)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),fmtN:String,paneName:(p:Data)=>p.label,
  modelName:String,warningEvent:()=>false,now:()=>1,laMulti:(_anchor:any,_title:any,_items:any,_label:any,choose:any)=>{ctx.choose=choose},toast:(s:string)=>toasts.push(s),save(){},log(){},hStatus(){},pickPane(){H.pane=H.panes.find((p:Data)=>p.id===S.ui.pane)},loadChat:async()=>{},noteHandoff:(r:Data)=>notices.push(r),
  api:async(path:string,body:Data)=>{assert.equal(path,'/api/handoff');requests.push(JSON.parse(JSON.stringify(body)));return send?send(body):{ok:true,seq:1}},
  render(){d.document.querySelector('.feed')!.innerHTML=S.chat.map((m:Data,i:number)=>ctx.selection.ckBox(m,i)).join('');ctx.selection.selBar()}};
 ctx.window=ctx;const context=createContext(ctx);
 runInContext(part('  let bindingGeneration','  function md(')+part('  const ckBox=','  const bubble=')+
  part('  let SEL=null;','  // меню действий под ответом')+part('  function closeLAMenus()','  // TS-09b4: one progress view')+part('  function hEvent(ev)','  const isDirect=')+part("  document.addEventListener('click',async e=>{ const la=",'  function reply(')+'\nglobalThis.selection={selStart,selBar,selChars,ckBox,hEvent,sendBinding,bindingCurrent,invalidateBinding,configureSetting};',context);
 ctx.LIVE={H,S,...ctx.selection,api:ctx.api,esc:ctx.esc,save(){},log(){},toast:ctx.toast,paneName:ctx.paneName,hStatus:ctx.hStatus,pickPane:ctx.pickPane,busy:()=>false,loadChat:ctx.loadChat,refreshStatus:async()=>{}};const ta=d.document.createElement('textarea');d.document.querySelector('.in')!.appendChild(ta);(d.document.querySelector('.box') as any).__cx={ta};runInContext(readFileSync(new URL('../../../ui/deploy/cx.js',import.meta.url),'utf8'),context);
 const find=(selector:string)=>{const node=d.document.querySelector(selector);assert.ok(node,selector);return node};
 const select=async(index:number,on=true)=>{const input:any=find('.live-sel-list [data-ck="'+index+'"]');input.checked=on;await input.emit('click')};
 const start=(sw=false)=>ctx.selection.selStart('reviewer',{sw});
 return {...d,H,S,ctx,requests,toasts,notices,find,start,select};
}

test('259: dialog opens with concrete messages, none checked, zero volume and disabled Send',async()=>{
 const v=ui();v.start();assert.equal(v.document.querySelectorAll('.live-sel-list input').length,3);assert.equal(v.document.querySelectorAll('[data-ck][checked]').length,0);
 assert.match(v.find('.live-selbar .n').textContent,/0 из 3 сообщений/);assert.equal(v.find('.live-selbar .ch').textContent,'0 знаков');assert.equal(v.find('[data-sel="go"]').disabled,true);
 await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests.length,0);assert.match(v.find('.live-sel-list').textContent,/Третье <img src=x> сообщение/);assert.equal(v.document.querySelector('img'),null);assert.doesNotMatch(v.find('.live-sel-list').textContent,/Служебная/);
});

test('259: selecting two sends exactly those two through HTTP; the next dialog is empty again',async t=>{
 const h=await fixture(t,{seats:'  worker: {role: worker, vendor: claude, model: w1, mode: read}\n  reviewer: {role: reviewer, vendor: claude, model: w1, mode: read}'});
 for(const m of messages())h.runtime.registry.get('worker')!.record(m.src==='sys'?'peer':m.role,m.text);const chat=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker;
 const v=ui(async body=>{const r=await call(h.api,'/api/handoff',{body});assert.equal(r.status,200);return r.body});v.H.active.worker=chat;v.start();await v.select(1);await v.select(4);
 const count=[...messages()[0]!.text,...messages()[3]!.text].length;assert.equal(v.find('.live-selbar .ch').textContent,count+' знаков');assert.match(v.find('.live-selbar .n').textContent,/2 из 3/);assert.equal(v.find('[data-sel="go"]').disabled,false);
 await v.find('[data-sel="go"]').emit('click');await h.runtime.idle();assert.equal(v.requests.length,1);assert.deepEqual(v.requests[0]!.seqs,[1,4]);assert.equal(Object.hasOwn(v.requests[0]!,'text'),false);assert.doesNotMatch(h.runtime.journal.get(1)!.text,/Ответ модели|Служебная/);assert.match(h.runtime.journal.get(1)!.text,/Третье <img src=x> сообщение/);assert.equal(h.provider.calls.length,1);assert.match(h.provider.calls[0]!.message,/Первое сообщение/);assert.equal(v.document.querySelector('.live-selbar'),null);
 v.start();assert.equal(v.find('[data-sel="go"]').disabled,true);assert.equal(v.document.querySelectorAll('[data-ck][checked]').length,0);
});

test('259: Select all is explicit; unchecking one sends all except that message',async()=>{
 const v=ui();v.start();await v.find('[data-sel="all"]').emit('click');assert.match(v.find('.live-selbar .n').textContent,/3 из 3/);await v.select(3,false);
 assert.match(v.find('.live-selbar .n').textContent,/2 из 3/);await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests.length,1);assert.deepEqual(v.requests[0]!.seqs,[1,4]);
});

test('259: clear and cancel do not preserve a selection; feed checkboxes and summary stay in sync',async()=>{
 const v=ui();v.start();const feed:any=v.find('.feed [data-ck="3"]');feed.checked=true;await feed.emit('click');assert.equal((v.find('.live-sel-list [data-ck="3"]') as any).checked,true);assert.equal(v.find('[data-sel="go"]').disabled,false);
 await v.find('[data-sel="none"]').emit('click');assert.equal(v.find('[data-sel="go"]').disabled,true);await v.select(4);await v.find('[data-sel="cancel"]').emit('click');v.start();assert.equal(v.document.querySelectorAll('[data-ck][checked]').length,0);assert.equal(v.requests.length,0);
});

test('259: selection and volume refer to the visible snapshot, not new or edited messages',async()=>{
 const v=ui();v.start();v.S.chat[0].text='Changed after opening';v.S.chat.push({role:'ai',src:'live',text:'New answer'});
 await v.find('[data-sel="all"]').emit('click');assert.match(v.find('.live-selbar .n').textContent,/3 из 3/);assert.equal(v.document.querySelector('[data-ck="5"]'),null);
 const prompt=v.find('.live-f');prompt.value='Только выбранное';await prompt.emit('input');await v.find('[data-sel="none"]').emit('click');assert.equal(v.find('.live-f').value,'Только выбранное');await v.select(1);await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests[0]!.prompt,'Только выбранное');assert.deepEqual(v.requests[0]!.seqs,[1]);assert.equal(Object.hasOwn(v.requests[0]!,'text'),false);
});

for(const change of ['project','chat','pagehide'])test('259: '+change+' discards selection and cannot send the previous conversation',async()=>{
 const v=ui();v.start();await v.select(1);const send=v.find('[data-sel="go"]');if(change==='project')v.H.project='/b';if(change==='chat')v.H.active.worker='chat-b';await v.window.emit(change==='pagehide'?'pagehide':'live:status');await send.emit('click');assert.equal(v.requests.length,0);
 if(change!=='pagehide'){v.start();assert.equal(v.find('[data-sel="go"]').disabled,true)}
});

test('259: one transfer is in flight; a late receipt cannot switch a changed chat',async()=>{
 const gate=deferred<Data>();const v=ui(async()=>gate.promise);v.start(true);await v.select(1);const first=v.find('[data-sel="go"]').emit('click');await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests.length,1);
 v.H.active.worker='chat-b';await v.window.emit('live:status');gate.resolve({ok:true,seq:1});await first;assert.equal(v.S.ui.pane,'worker');assert.equal(v.notices.length,0);
});

test('259: a failed transfer keeps the explicit choice for retry; a fabricated seq is ignored',async()=>{
 const v=ui(async()=>({ok:false,error:'temporary failure'}));v.start();const input:any=v.find('.live-sel-list input');input.dataset.ck='999';input.checked=true;await input.emit('click');assert.equal(v.find('[data-sel="go"]').disabled,true);
 input.dataset.ck='1';await input.emit('click');await v.find('[data-sel="go"]').emit('click');assert.match(v.toasts.at(-1)!,/temporary failure/);assert.equal(v.find('[data-sel="go"]').disabled,false);assert.match(v.find('.live-selbar .n').textContent,/1 из 3/);
});

for(const answers of [1,2])test('260: footer with '+answers+' answers opens an empty selector before any request',async()=>{
 const v=ui();v.S.chat=[{seq:1,role:'me',text:'Личное'},...Array.from({length:answers},(_,i)=>({seq:i+2,role:'ai',src:'live',text:'Ответ '+i}))];
 const button=v.document.createElement('button');button.setAttribute('data-la','handoff');button.setAttribute('data-i','1');const actions=v.document.createElement('div');actions.className='live-acts';actions.appendChild(button);v.body.appendChild(actions);await button.emit('click');
 await v.find('.la.multi [data-k="0"]').emit('click');await v.find('.la.multi [data-go]').emit('click');assert.equal(v.requests.length,0);assert.match(v.find('.live-selbar .n').textContent,new RegExp('0 из '+(answers+1)));assert.equal(v.find('[data-sel="go"]').disabled,true);
});

test('260: an SSE note trims the feed but never changes a selected seq or its count',async()=>{
 const v=ui();v.S.chat=[{seq:1,role:'me',text:'Личное владельца'},...Array.from({length:40},(_,i)=>({seq:i+2,role:'ai',src:'live',text:'Ответ '+i}))];v.start();await v.select(2);
 v.ctx.selection.hEvent({type:'note',text:'сдвиг ленты'});assert.equal(v.S.chat[0].seq,3);assert.match(v.find('.live-selbar .n').textContent,/1 из 41/);
 const visible:any=v.find('.feed [data-ck="3"]');visible.checked=true;await visible.emit('click');assert.match(v.find('.live-selbar .n').textContent,/2 из 41/);
 await v.find('[data-sel="go"]').emit('click');assert.deepEqual(v.requests[0]!.seqs,[2,3]);assert.equal(Object.hasOwn(v.requests[0]!,'text'),false);
});

test('260: HTTP refuses empty, foreign, unknown or malformed seqs and text injection without posting',async t=>{
 const h=await fixture(t,{seats:'  worker: {role: worker, vendor: claude, model: w1, mode: read}\n  reviewer: {role: reviewer, vendor: claude, model: w1, mode: read}'}),r=h.runtime;
 r.registry.get('worker')!.record('me','не выбранное');r.registry.get('worker')!.record('ai','выбранное');
 const other=r.registry.get('reviewer')!;for(let i=0;i<3;i++)other.record('ai','чужое '+i);const active=r.chatsList({seat:'owner',trust:'owner'}).active;
 const valid={from:'worker',to:'reviewer',chat:active.worker,seqs:[2]},before=r.journal.lastSeq;
 for(const change of [{seqs:[]},{seqs:undefined},{seqs:[3]},{seqs:[99]},{seqs:[2,99]},{seqs:['2']},{seqs:[2,2]},{seqs:[-1]},{seqs:[null]},{chat:active.reviewer},{chat:'absent'},{chat:'__proto__'},{text:'поддельная стенограмма'}]){
  const response=await call(h.api,'/api/handoff',{body:{...valid,...change}});assert.equal(response.status,400,JSON.stringify(change));assert.equal(r.journal.lastSeq,before);assert.equal(h.provider.calls.length,0);
 }
 const receipt=await call(h.api,'/api/handoff',{body:valid});assert.equal(receipt.status,200);await r.idle();const sent=r.journal.get(receipt.body.seq)!.text;assert.match(sent,/Ответ: выбранное/);assert.doesNotMatch(sent,/не выбранное|чужое/);assert.equal(h.provider.calls.length,1);
});


test('260: the actual role-switch context door opens empty and sends only explicitly selected ids',async()=>{
 const v=ui();await v.find('[data-cx="role"]').emit('click');await v.find('[data-cx-seat="reviewer"]').emit('click');await v.find('[data-cx-sw="ctx"]').emit('click');
 assert.equal(v.requests.length,0);assert.equal(v.find('[data-sel="go"]').disabled,true);await v.select(3);await v.find('[data-sel="go"]').emit('click');assert.deepEqual(v.requests[0]!.seqs,[3]);assert.equal(v.requests[0]!.chat,'chat-a');assert.equal(v.S.ui.pane,'reviewer');
});

test('261: streamed owner and model replies retain engine ids for selection; an unbound result is not selectable',async()=>{
 const v=ui();Object.assign(v.ctx,{mdFiles:new Map(),now:()=>1,md:String,mdMessageArtifacts:()=>'',toolLine:()=>''});
 runInContext(part('  function finish(ev)','  function hEvent(ev)')+'globalThis.finish=finish;',v.ctx);
 v.S.chat=[{role:'me',text:'Новый вопрос'}];v.H.cur={text:'Новый ответ',tools:[]};v.ctx.finish({type:'done',chat:'chat-a',seq:9,messages:[{role:'me',text:'Новый вопрос',seq:8}]});v.start();await v.find('[data-sel="all"]').emit('click');await v.find('[data-sel="go"]').emit('click');assert.deepEqual(v.requests[0]!.seqs,[8,9]);
 v.S.chat=[];v.H.cur={text:'Без привязки',tools:[]};v.ctx.finish({type:'done',seq:10});v.start();assert.equal(v.document.querySelector('.live-selbar'),null);assert.equal(v.requests.length,1);
});
