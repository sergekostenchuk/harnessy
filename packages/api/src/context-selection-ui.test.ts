import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred} from './test-helpers.ts';
type Data=Record<string,any>;
const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');
const part=(a:string,b:string)=>{const i=live.indexOf(a),j=live.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return live.slice(i,j)};
const messages=()=>[{role:'me',text:'Первое сообщение'},{role:'ai',src:'sys',text:'Служебная строка'},{role:'ai',src:'live',who:'Модель',text:'Ответ модели'},{role:'me',text:'Третье <img src=x> сообщение 🧠'}];
function ui(send?:(body:Data)=>Promise<Data>){
 const d=dom('<div class="frame"><div class="main"><div class="feed"></div><div class="box"></div></div></div>');Object.assign(d.document,{body:d.body,documentElement:d.html});
 const H:Data={project:'/a',pane:{id:'worker',label:'Воркер'},panes:[{id:'worker',label:'Воркер'},{id:'reviewer',label:'Ревьюер'}],active:{worker:'chat-a'}},S:Data={ui:{pane:'worker'},chat:messages()},requests:Data[]=[],toasts:string[]=[],notices:Data[]=[];
 const ctx:Data={document:d.document,H,S,addEventListener:d.window.addEventListener.bind(d.window),esc:(s:unknown)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),fmtN:String,paneName:(p:Data)=>p.label,
  toast:(s:string)=>toasts.push(s),save(){},log(){},hStatus(){},pickPane(){H.pane=H.panes.find((p:Data)=>p.id===S.ui.pane)},loadChat:async()=>{},noteHandoff:(r:Data)=>notices.push(r),
  api:async(path:string,body:Data)=>{assert.equal(path,'/api/handoff');requests.push(JSON.parse(JSON.stringify(body)));return send?send(body):{ok:true,seq:1}},
  render(){d.document.querySelector('.feed')!.innerHTML=S.chat.map((m:Data,i:number)=>ctx.selection.ckBox(m,i)).join('');ctx.selection.selBar()}};
 ctx.window=ctx;const context=createContext(ctx);
 runInContext(part('  let bindingGeneration','  function md(')+part('  const ckBox=','  const bubble=')+
  part('  let SEL=null;','  // меню действий под ответом')+'\nglobalThis.selection={selStart,selBar,selChars,ckBox};',context);
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
 h.runtime.registry.get('worker')!.record('me','Первое сообщение');h.runtime.registry.get('worker')!.record('ai','Ответ модели');
 const v=ui(async body=>{const r=await call(h.api,'/api/handoff',{body});assert.equal(r.status,200);return r.body});v.start();await v.select(0);await v.select(3);
 const count=[...messages()[0]!.text,...messages()[3]!.text].length;assert.equal(v.find('.live-selbar .ch').textContent,count+' знаков');assert.match(v.find('.live-selbar .n').textContent,/2 из 3/);assert.equal(v.find('[data-sel="go"]').disabled,false);
 await v.find('[data-sel="go"]').emit('click');await h.runtime.idle();assert.equal(v.requests.length,1);assert.match(v.requests[0]!.text,/Владелец: Первое сообщение/);assert.match(v.requests[0]!.text,/Владелец: Третье <img src=x> сообщение/);assert.doesNotMatch(v.requests[0]!.text,/Ответ модели|Служебная/);assert.equal(h.provider.calls.length,1);assert.match(h.provider.calls[0]!.message,/Первое сообщение/);assert.equal(v.document.querySelector('.live-selbar'),null);
 v.start();assert.equal(v.find('[data-sel="go"]').disabled,true);assert.equal(v.document.querySelectorAll('[data-ck][checked]').length,0);
});

test('259: Select all is explicit; unchecking one sends all except that message',async()=>{
 const v=ui();v.start();await v.find('[data-sel="all"]').emit('click');assert.match(v.find('.live-selbar .n').textContent,/3 из 3/);await v.select(2,false);
 assert.match(v.find('.live-selbar .n').textContent,/2 из 3/);await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests.length,1);assert.match(v.requests[0]!.text,/Первое сообщение/);assert.match(v.requests[0]!.text,/Третье/);assert.doesNotMatch(v.requests[0]!.text,/Ответ модели/);
});

test('259: clear and cancel do not preserve a selection; feed checkboxes and summary stay in sync',async()=>{
 const v=ui();v.start();const feed:any=v.find('.feed [data-ck="2"]');feed.checked=true;await feed.emit('click');assert.equal((v.find('.live-sel-list [data-ck="2"]') as any).checked,true);assert.equal(v.find('[data-sel="go"]').disabled,false);
 await v.find('[data-sel="none"]').emit('click');assert.equal(v.find('[data-sel="go"]').disabled,true);await v.select(3);await v.find('[data-sel="cancel"]').emit('click');v.start();assert.equal(v.document.querySelectorAll('[data-ck][checked]').length,0);assert.equal(v.requests.length,0);
});

test('259: selection and volume refer to the visible snapshot, not new or edited messages',async()=>{
 const v=ui();v.start();v.S.chat[0].text='Changed after opening';v.S.chat.push({role:'ai',src:'live',text:'New answer'});
 await v.find('[data-sel="all"]').emit('click');assert.match(v.find('.live-selbar .n').textContent,/3 из 3/);assert.equal(v.document.querySelector('[data-ck="4"]'),null);
 const prompt=v.find('.live-f');prompt.value='Только выбранное';await prompt.emit('input');await v.find('[data-sel="none"]').emit('click');assert.equal(v.find('.live-f').value,'Только выбранное');await v.select(0);await v.find('[data-sel="go"]').emit('click');assert.match(v.requests[0]!.text,/^Только выбранное/);assert.match(v.requests[0]!.text,/Первое сообщение/);assert.doesNotMatch(v.requests[0]!.text,/Changed|New answer/);
});

for(const change of ['project','chat','pagehide'])test('259: '+change+' discards selection and cannot send the previous conversation',async()=>{
 const v=ui();v.start();await v.select(0);const send=v.find('[data-sel="go"]');if(change==='project')v.H.project='/b';if(change==='chat')v.H.active.worker='chat-b';await v.window.emit(change==='pagehide'?'pagehide':'live:status');await send.emit('click');assert.equal(v.requests.length,0);
 if(change!=='pagehide'){v.start();assert.equal(v.find('[data-sel="go"]').disabled,true)}
});

test('259: one transfer is in flight; a late receipt cannot switch a changed chat',async()=>{
 const gate=deferred<Data>();const v=ui(async()=>gate.promise);v.start(true);await v.select(0);const first=v.find('[data-sel="go"]').emit('click');await v.find('[data-sel="go"]').emit('click');assert.equal(v.requests.length,1);
 v.H.active.worker='chat-b';await v.window.emit('live:status');gate.resolve({ok:true,seq:1});await first;assert.equal(v.S.ui.pane,'worker');assert.equal(v.notices.length,0);
});

test('259: a failed transfer keeps the explicit choice for retry; a fabricated index is ignored',async()=>{
 const v=ui(async()=>({ok:false,error:'temporary failure'}));v.start();const input:any=v.find('.live-sel-list input');input.dataset.ck='999';input.checked=true;await input.emit('click');assert.equal(v.find('[data-sel="go"]').disabled,true);
 input.dataset.ck='0';await input.emit('click');await v.find('[data-sel="go"]').emit('click');assert.match(v.toasts.at(-1)!,/temporary failure/);assert.equal(v.find('[data-sel="go"]').disabled,false);assert.match(v.find('.live-selbar .n').textContent,/1 из 3/);
});
