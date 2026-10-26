/* Journal-backed task queue; one binding for reads, forms, menu and drag/drop. */
(function(){
 'use strict';
 const L=window.LIVE,surface=document.querySelector('[data-team-live]');if(!L||!surface||!['work','queue'].includes(surface.dataset.teamLive))return;const H=L.H,esc=L.esc;
 const labels={unassigned:'Без исполнителя',queued:'В очереди',work:'В работе',review:'На ревью',done:'Готово',blocked:'Заблокирована',partial:'Частично',unknown:'Неизвестно'};
 const Q={key:null,request:0,loading:false,again:false,data:null,error:null,actionError:null,sending:false,filter:'all',drafts:new Map(),operations:new Map(),drag:null};
 const binding=()=>H.on&&!H.snapshotOnly&&H.liveStatus?.trace?.instanceId?{project:H.project,instance:H.liveStatus.trace.instanceId,generation:H.confirmedProjectGeneration||0}:null;
 const key=b=>b?JSON.stringify(b):null,current=b=>!!b&&key(binding())===key(b);
 const validRow=t=>t&&typeof t.taskId==='string'&&typeof t.text==='string'&&Object.hasOwn(labels,t.state)&&typeof t.reason==='string'&&typeof t.expectedState==='string'&&(t.n===null||Number.isSafeInteger(t.n)&&t.n>0)&&(t.to===null||typeof t.to==='string')&&typeof t.readonly==='boolean';
 function valid(value,b){return value?.ok===true&&value.project===b.project&&value.instance===b.instance&&Array.isArray(value.tasks)&&value.tasks.every(validRow)&&Array.isArray(value.outsideQueue)&&value.outsideQueue.every(validRow)}
 const ready=()=>Q.data&&key(binding())===Q.key;
 const roles=()=>Array.isArray(H.panes)?H.panes.filter(p=>p.id&&p.id!=='room'&&p.id!=='owner'):[];
 function assignment(t){if(t.readonly||!['unassigned','queued'].includes(t.state))return '';return '<label class="task-assign">Назначить <select data-task-assign="'+esc(t.taskId)+'"'+(Q.sending?' disabled':'')+' aria-label="Назначить задачу '+esc(t.n)+'"><option value="">выбрать роль</option>'+roles().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label||p.id)+'</option>').join('')+'</select></label>'}
 function row(t){return '<div class="tc-task '+({queued:'q',review:'rev'}[t.state]||t.state)+'" data-task-id="'+esc(t.taskId)+'" draggable="'+(!t.readonly&&['queued','unassigned'].includes(t.state)&&!Q.sending)+'"><span class="n">'+(t.n===null?'#'+esc(t.assignedSeq):'№'+t.n)+'</span><div class="t"><b>'+esc(t.text)+'</b><small>'+esc(t.to?roles().find(p=>p.id===t.to)?.label||t.to:'без исполнителя')+' · '+esc(labels[t.state])+'</small><p>'+esc(t.reason)+'</p>'+assignment(t)+'</div></div>'}
 function html(preview){const b=binding(),data=ready()?Q.data:null,draft=b?Q.drafts.get(b.project)||'':'';
  let text='<div class="tc-queue"><div class="hd"><b>Очередь задач</b><span class="m">'+(data?data.tasks.length+' задач':'читаю журнал')+'</span><span class="r"><button class="btn sm ghost" type="button" data-task-refresh>Обновить</button></span></div>';
  text+='<form data-task-form><label>＋ задача<input data-task-text aria-label="Новая задача" placeholder="Что нужно сделать?" value="'+esc(draft)+'"'+(!data||Q.sending?' disabled':'')+'></label><button class="btn sm" type="submit"'+(!data||Q.sending?' disabled':'')+'>Добавить</button></form>';
  if(Q.error||Q.actionError)text+='<p class="tc-task-error" role="alert">'+esc(Q.error||Q.actionError)+'</p>';
  if(!data)return text+'<p>Очередь не подтверждена движком.</p></div>';
  if(!preview)text+='<div class="filt">'+[['all','Все'],...Object.entries(labels)].map(([s,l])=>'<button type="button" class="chip'+(Q.filter===s?' on':'')+'" data-task-filter="'+s+'">'+l+'</button>').join('')+'</div>';
  const rows=data.tasks.filter(t=>preview||Q.filter==='all'||t.state===Q.filter),shown=preview?rows.slice(0,4):rows;
  text+='<div class="rows one">'+(shown.map(row).join('')||'<p>Задач нет.</p>')+'</div>';
  if(!preview&&data.outsideQueue.length)text+='<div class="hd"><b>Вне очереди</b><span class="m">старые поручения · только чтение</span></div><div class="rows one">'+data.outsideQueue.map(row).join('')+'</div>';
  return text+'<div class="src">Источник: журнал проекта. Назначьте через список или перетащите задачу на карточку роли.</div></div>';
 }
 function draw(){document.querySelectorAll('[data-task-queue]').forEach(node=>{const input=node.querySelector('[data-task-text]'),focused=input&&document.activeElement===input,start=focused?input.selectionStart:null,end=focused?input.selectionEnd:null;node.innerHTML=html(node.dataset.taskQueue==='preview');if(focused){const next=node.querySelector('[data-task-text]');next?.focus();if(next&&start!==null)next.setSelectionRange?.(start,end)}});document.querySelectorAll('[data-task-targets]').forEach(node=>{node.innerHTML=ready()?roles().map(p=>'<div class="tc-card" data-key="'+esc(p.id)+'" data-task-target="'+esc(p.id)+'"><div class="hd"><b>'+esc(p.label||p.id)+'</b></div><div class="body"><p>'+esc(p.model||'модель не выбрана')+'</p><small>'+esc(p.status||'состояние неизвестно')+'</small></div></div>').join(''):''})}
 async function refresh(force=false){const b=binding(),k=key(b);if(k!==Q.key){Q.key=k;Q.request++;Q.data=null;Q.actionError=null;Q.error=b?null:'Движок недоступен — очередь не прочитана.';Q.loading=false;Q.again=false;Q.sending=false;Q.drag=null;draw()}
  if(!b)return;if(Q.loading){if(force)Q.again=true;return}Q.loading=true;const request=++Q.request;
  try{const data=await L.api('/api/tasks');if(!current(b)||request!==Q.request)return;if(!valid(data,b))throw Error(data?.error||'Движок не подтвердил очередь этого проекта.');Q.data=data;Q.error=null}catch(e){if(current(b)&&request===Q.request){Q.data=null;Q.error=e.message||'Не удалось прочитать очередь.'}}finally{if(current(b)&&request===Q.request){Q.loading=false;draw();if(Q.again){Q.again=false;void refresh(true)}}}
 }
 const operation=(path,payload)=>{const {instance:_,...identity}=payload,id=JSON.stringify([path,identity]);if(!Q.operations.has(id))Q.operations.set(id,{...payload,opId:crypto.randomUUID()});return {id,body:Q.operations.get(id)}};
 async function post(path,payload){const b=binding();if(!b||!ready()||Q.sending){Q.error='Проект изменился. Обновите очередь.';draw();return false}const op=operation(path,{...payload,project:b.project,instance:b.instance});Q.sending=true;Q.actionError=null;draw();
  try{const answer=await L.api(path,op.body);if(!current(b))return false;if(!answer?.ok){if(answer?.code==='project_changed')Q.operations.delete(op.id);throw Error(answer?.error||'Движок отклонил действие.')}if(answer.project!==b.project||answer.instance!==b.instance)throw Error('Ответ относится к другому проекту.');Q.operations.delete(op.id);return true}catch(e){if(current(b))Q.actionError=e.message||'Нет связи. Повторите действие — его номер сохранён.';return false}finally{if(current(b)){Q.sending=false;draw()}}
 }
 async function create(){const b=binding(),text=b&&Q.drafts.get(b.project)||'';if(!text.trim())return;const success=await post('/api/tasks',{text});if(success&&current(b)&&Q.drafts.get(b.project)===text)Q.drafts.delete(b.project);if(current(b))await refresh(true)}
 async function assign(id,to){const task=ready()&&Q.data.tasks.find(t=>t.taskId===id);if(!task||!['unassigned','queued'].includes(task.state)){Q.error='Задача уже выполняется или её состояние не подтверждено.';draw();return}const b=binding();await post('/api/tasks/'+encodeURIComponent(id)+'/assign',{to,expectedState:task.expectedState});if(current(b))await refresh(true)}
 document.addEventListener('submit',e=>{if(!e.target.matches('[data-task-form]'))return;e.preventDefault();void create()});
 document.addEventListener('input',e=>{if(!e.target.matches('[data-task-text]'))return;const b=binding();if(b)Q.drafts.set(b.project,e.target.value)});
 document.addEventListener('change',e=>{const node=e.target.closest('[data-task-assign]');if(node&&node.value)void assign(node.dataset.taskAssign,node.value)});
 document.addEventListener('click',e=>{if(e.target.closest('[data-task-refresh]'))void refresh(true);const filter=e.target.closest('[data-task-filter]');if(filter){Q.filter=filter.dataset.taskFilter;draw()}});
 document.addEventListener('dragstart',e=>{const t=e.target.closest('[data-task-id][draggable="true"]');if(!t||!ready())return;Q.drag={id:t.dataset.taskId,b:binding()};e.dataTransfer?.setData('text/plain',t.dataset.taskId)});
 document.addEventListener('dragover',e=>{if(Q.drag&&current(Q.drag.b)&&e.target.closest('[data-task-target],.tc-card[data-key],.tc-orch[data-key]'))e.preventDefault()});
 document.addEventListener('drop',e=>{const target=e.target.closest('[data-task-target],.tc-card[data-key],.tc-orch[data-key]'),drag=Q.drag;Q.drag=null;if(!target||!drag||!current(drag.b))return;e.preventDefault();const to=target.dataset.taskTarget||target.dataset.key;if(roles().some(p=>p.id===to))void assign(drag.id,to)});
 document.addEventListener('dragend',()=>Q.drag=null);
 addEventListener('live:status',()=>{void refresh()});addEventListener('pageshow',e=>{if(e.persisted)void refresh(true)});addEventListener('pagehide',()=>{Q.request++;Q.loading=false;Q.sending=false});
 const events=L.subscribeLiveEvents?.(e=>{let data;try{data=JSON.parse(e.data)}catch{return}if(['tasks','state','done','note','queued','autopilotDecision','owner'].includes(data.type))void refresh(true)});
 window.HARNESS_TASK_QUEUE={refresh,draw,state:Q,valid,assign,create};
 if(document.querySelector('[data-team-live]'))void refresh();
})();
