/* Входящие: один расчёт карточек и счётчиков для экрана и боковой панели. */
(function(){
  if(!document.documentElement.hasAttribute('data-proto'))return;
  const PAGE=document.documentElement.dataset.page,DAY=86400000,READ_KEY='inboxRead';
  const L=window.LIVE,esc=L?.esc||((v)=>String(v??'')),state={project:null,generation:0,items:[],read:new Set(),filter:'all',loading:false,error:null,sourceErrors:[],request:0,queued:false,pending:new Set(),actionErrors:new Map(),replyOpen:new Set(),replyDrafts:new Map()};
  const recent=(ts,now)=>Number.isFinite(ts)&&ts>=now-7*DAY&&ts<=now+DAY;
  const date=s=>{const n=typeof s==='number'?s:Date.parse(s||'');return Number.isFinite(n)?n:null};
  const validRecord=r=>r&&Number.isSafeInteger(r.seq)&&r.seq>0&&typeof r.kind==='string'&&typeof r.from==='string'&&Array.isArray(r.to);
  const text=s=>typeof s==='string'?s.trim().slice(0,240):'';
  const identity=(project,...parts)=>JSON.stringify([project,...parts]);
  const item=(id,kind,title,detail,ts,need,extra={})=>({id,kind,title,detail,ts,need,done:false,read:false,...extra});
  function collect({project,status,journal,chats=[],trace=[],limits=[],update=null,read=[]},now=Date.now()){
    if(!project||status?.project!==project||journal?.project!==project)return [];
    const records=Array.isArray(journal.records)?journal.records.filter(validRecord):[],bySeq=new Map(records.map(r=>[r.seq,r]));
    const replies=new Set(records.filter(r=>Number.isSafeInteger(r.reply_to)&&r.reply_to>0&&(
      r.from==='owner'&&['answer','note','decision','ack','rejected'].includes(r.kind)||r.from==='harness'&&r.origin==='team-proposal-confirm'
    )).map(r=>r.reply_to));
    const used=new Set(),rows=[],readSet=new Set(Array.isArray(read)?read.filter(v=>typeof v==='string'):[]);
    const add=row=>{if(used.has(row.id))return;used.add(row.id);row.read=readSet.has(row.id);rows.push(row)};
    for(const a of status.approvals||[]){if(!a||typeof a.pane!=='string'||typeof a.id!=='string')continue;
      const seq=/^ack:[1-9][0-9]*$/.test(a.id)?Number(a.id.slice(4)):null,r=seq&&bySeq.get(seq);if(r)used.add(identity(project,'record',r.seq));
      add(item(identity(project,'approval',a.pane,a.id),'решение',text(a.title)||'Нужно подтверждение',text(a.detail),date(r?.ts),true,{type:'approval',pane:a.pane,approval:a}));
    }
    for(const p of status.panes||[])if(p&&typeof p.id==='string'&&p.waiting&&typeof p.waiting.turnInstanceId==='string'){
      const w=p.waiting,title=w.status==='unsent'?'Не отправлено: '+(text(w.failure?.reason)||'проверка перед ходом не прошла'):w.status==='recovering'?'Завершить восстановление хода':'Итог хода неизвестен';
      add(item(identity(project,'waiting',p.id,w.turnInstanceId),'решение',title,text(w.failure?.reason)||'Требуется ваше решение',date(w.startedAt),true,{type:'waiting',pane:p.id,waiting:w}));
    }
    for(const r of records){const ts=date(r.ts);
      if(r.from!=='owner'&&r.to.includes('owner')&&['question','blocker','escalation'].includes(r.kind)&&!replies.has(r.seq))
        add(item(identity(project,'record',r.seq),'решение',text(r.text)||'Вопрос владельцу','Журнал №'+r.seq,ts,true,{type:'question',pane:r.from,record:r}));
      if(r.kind==='verdict'&&(status.panes||[]).some(p=>p.id===r.from&&(p.kind==='reviewer'||p.role==='reviewer'))&&recent(ts,now))
        add(item(identity(project,'verdict',r.seq),'возврат ревьюера',text(r.text)||'Ревьюер вернул результат','Журнал №'+r.seq,ts,false,{type:'verdict',pane:r.from,record:r}));
    }
    for(const result of chats){const c=result?.chat,m=result?.messages?.at(-1);if(!c||!m||m.role!=='ai'||!Number.isSafeInteger(m.seq))continue;
      const ts=typeof m.ts==='number'?m.ts*1000:date(m.ts);if(!recent(ts,now))continue;
      add(item(identity(project,'chat',c.id,m.seq),'итог хода','Завершён ход в чате «'+(text(c.title)||text(c.label)||'Без названия')+'»',text(m.text).slice(0,160),ts,false,{type:'chat',chat:c.id,pane:c.pane}));
    }
    for(const r of trace){if(!r||!['network.failover','network.exit_failed','network.tunnel'].includes(r.kind))continue;const ts=date(r.ts);if(!recent(ts,now))continue;
      const data=r.data&&typeof r.data==='object'?r.data:{},failed=r.kind==='network.exit_failed'||r.kind==='network.tunnel'&&data.state==='down';
      if(r.kind==='network.tunnel'&&!failed)continue;
      const title=r.kind==='network.failover'?'Подключение переключено на резерв':r.kind==='network.tunnel'?'SSH-туннель не отвечает':'Выход не отвечает';
      add(item(identity(project,'network',r.seq), 'подключение',title,text(r.reason?.text)||text(data.code)||'Проверьте подключение',ts,false,{type:'network',vendor:text(data.vendor),failed}));
    }
    for(const p of limits){if(!p||typeof p.vendor!=='string'||p.sourceConnected===false||p.ok===false)continue;
      for(const w of p.windows||[]){if(!w||!Number.isFinite(w.percentUsed)||w.percentUsed<80||w.percentUsed>100)continue;
        const level=w.percentUsed>=95?95:80,remaining=Math.max(0,Math.round(100-w.percentUsed)),reset=Number.isFinite(w.resetsAt)?new Date(w.resetsAt*1000).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):null;
        add(item(identity('owner','limit',p.vendor,w.label,w.resetsAt??null,level),'лимит · оплата',text(p.label)||p.vendor+': осталось '+remaining+' %',text(w.label)+' · осталось '+remaining+' %'+(reset?' · сброс '+reset:''),Number.isFinite(p.fetchedAt)?p.fetchedAt*1000:now,false,{type:'limit',vendor:p.vendor,level}));
      }
    }
    if(update?.readyVersion)add(item(identity('owner','update',update.readyVersion),'обновление','Обновление Harnessy '+text(update.readyVersion)+' готово','Перезапустите приложение, чтобы установить его',now,false,{type:'update'}));
    rows.sort((a,b)=>Number(a.done)-Number(b.done)||Number(a.read)-Number(b.read)||Number(b.need)-Number(a.need)||(b.ts||0)-(a.ts||0));return rows;
  }
  function counts(rows=state.items){return {all:rows.length,need:rows.filter(x=>x.need&&!x.done).length,info:rows.filter(x=>!x.need&&!x.done&&!x.read).length}}
  function panelCounts(){const H=L?.H;if(!H?.on||H.snapshotOnly||!H.project||state.project!==H.project||state.generation!==(H.confirmedProjectGeneration||0))return {all:0,need:0,info:0,unavailable:true};return counts()}
  function bindPanelCounts(){const panel=window.PS2;if(!panel)return;
    panel.inboxSource=panelCounts;if(panel.inboxSourceInstalled)return;panel.inboxSourceInstalled=true;
    if(typeof panel.setInbox==='function'){const setInbox=panel.setInbox;panel.setInbox=function(){return setInbox.call(this,panel.inboxSource())}}
    if(typeof panel.setData==='function'){const setData=panel.setData;panel.setData=function(data){return setData.call(this,data&&Object.prototype.hasOwnProperty.call(data,'inbox')?{...data,inbox:panel.inboxSource()}:data)}}
  }
  function keepCompleted(rows,previous){const byId=new Map(rows.map(x=>[x.id,x]));for(const old of previous){if(!old.need)continue;const next=byId.get(old.id);if(next){if(old.done){next.done=true;next.read=true}}else if(rows.filter(x=>x.done).length<50){const completed={...old,done:true,read:true};rows.push(completed);byId.set(old.id,completed)}}rows.sort((a,b)=>Number(a.done)-Number(b.done)||Number(a.read)-Number(b.read)||Number(b.need)-Number(a.need)||(b.ts||0)-(a.ts||0));return rows}
  function paintBadges(){const n=panelCounts();document.querySelectorAll('aside.side .ps2-inbox').forEach(row=>{
    const action=row.querySelector('.b'),info=row.querySelector('.b2');if(action){action.textContent=n.need;action.hidden=!n.need;action.style.display=n.need?'':'none'}if(info){info.textContent=n.info;info.hidden=!n.info;info.style.display=n.info?'':'none'}
  });document.querySelectorAll('.m-drawer a[href="44-inbox.html"] small').forEach(el=>el.textContent=n.need?String(n.need):'');}
  function signal(){const value=panelCounts();window.PS2?.setInbox?.(value);paintBadges();dispatchEvent(new CustomEvent('inbox:changed',{detail:{project:state.project,counts:value}}))}
  const current=()=>L?.H?.on&&!L.H.snapshotOnly&&!!L.H.project;
  const binding=()=>({project:L.H.project,generation:L.H.confirmedProjectGeneration||0});
  const same=b=>current()&&L.H.project===b.project&&(L.H.confirmedProjectGeneration||0)===b.generation;
  async function chatDetails(chats,b){const list=(chats||[]).filter(c=>c&&typeof c.id==='string'&&Number.isFinite(c.last)&&c.last*1000>=Date.now()-7*DAY),result=[];let index=0,failed=false;
    await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{while(index<list.length&&same(b)){const c=list[index++];try{const row=await L.api('/api/chats/'+encodeURIComponent(c.id));if(row?.chat?.id===c.id&&Array.isArray(row.messages))result.push(row);else failed=true}catch{failed=true}}}));return {rows:result,failed};
  }
  async function refresh(){if(!current())return false;if(state.loading){state.queued=true;return false}
    const b=binding(),request=++state.request;if(state.project!==b.project||state.generation!==b.generation){state.project=null;state.items=[];state.sourceErrors=[];state.pending.clear();state.actionErrors.clear();state.replyOpen.clear();state.replyDrafts.clear();signal()}
    state.loading=true;if(PAGE==='inbox')draw();
    try{const [status,journal,chats,trace,limits,settings,update]=await Promise.all([
      L.api('/api/status'),L.api('/api/journal?limit=0'),L.api('/api/chats'),L.api('/api/trace?since='+encodeURIComponent(new Date(Date.now()-7*DAY).toISOString())).catch(()=>null),
      L.api('/api/limits').catch(()=>null),L.api('/api/settings'),window.harnessy?.updates?.getState().catch(()=>null)??Promise.resolve(null)
    ]);
      if(!same(b)||request!==state.request)return false;
      if(status?.project!==b.project||!Array.isArray(status.approvals)||!Array.isArray(status.panes)||journal?.project!==b.project||!Array.isArray(journal.records)||!Array.isArray(chats?.chats)||settings?.ok!==true||!settings.owner)throw Error('Данные входящих не подтверждены для текущего проекта');
      const details=await chatDetails(chats.chats,b);if(!same(b)||request!==state.request)return false;
      state.project=b.project;state.generation=b.generation;state.read=new Set(Array.isArray(settings.owner[READ_KEY])?settings.owner[READ_KEY].filter(v=>typeof v==='string'):[]);
      state.sourceErrors=[];
      if(trace?.ok!==true||trace.project!==b.project||!Array.isArray(trace.records))state.sourceErrors.push('События подключения недоступны');
      if(limits?.ok!==true||limits.project!==b.project||!Array.isArray(limits.providers))state.sourceErrors.push('Лимиты недоступны');
      if(details.failed)state.sourceErrors.push('История чатов недоступна');
      state.items=keepCompleted(collect({project:b.project,status,journal,chats:details.rows,trace:state.sourceErrors.includes('События подключения недоступны')?[]:trace.records,limits:state.sourceErrors.includes('Лимиты недоступны')?[]:limits.providers,update,read:[...state.read]}),state.items);
      state.error=null;signal();if(PAGE==='inbox')draw();return true;
    }catch(e){if(same(b)){state.error=e?.message||'Нет связи';if(PAGE==='inbox')draw()}return false}
    finally{state.loading=false;if(state.queued){state.queued=false;void refresh()}}
  }
  let readJob=Promise.resolve();
  function mark(ids){const b=binding();if(state.project!==b.project||state.generation!==b.generation)return Promise.resolve(false);readJob=readJob.catch(()=>{}).then(async()=>{
    if(!same(b))return false;const latest=await L.api('/api/settings');if(!same(b)||latest?.ok!==true||!latest.owner)throw Error('Прочитанность не подтверждена');
    const merged=[...new Set([...(Array.isArray(latest.owner[READ_KEY])?latest.owner[READ_KEY].filter(v=>typeof v==='string'):[]),...ids])].slice(-1000);
    const saved=await L.api('/api/settings',{scope:'owner',patch:{[READ_KEY]:merged}});if(!saved?.ok)throw Error(saved?.error||'Прочитанность не сохранена');
    if(same(b)){state.read=new Set(merged);for(const x of state.items)x.read=state.read.has(x.id);signal();if(PAGE==='inbox')draw()}return true;
  });return readJob.catch(e=>{if(same(b)){state.error=e?.message||'Прочитанность не сохранена';draw()}return false})}
  const ago=t=>{if(!t)return 'время неизвестно';const minutes=Math.max(0,Math.floor((Date.now()-t)/60000));return minutes<1?'сейчас':minutes<60?minutes+' мин':minutes<1440?Math.floor(minutes/60)+' ч':Math.floor(minutes/1440)+' д'};
  const icon={approval:'◆',waiting:'◆',question:'◆',verdict:'↳',chat:'✓',network:'⇄',limit:'%',update:'↑'};
  function actions(x){if(x.done)return '<span class="okm">Выполнено</span>';const disabled=state.pending.has(x.id)||!!state.error?' disabled':'';if(x.type==='approval')return '<button class="btn sm p" data-inbox-action="allow"'+disabled+'>Разрешить</button><button class="btn sm" data-inbox-action="deny"'+disabled+'>Отказать</button><button class="btn sm" data-inbox-action="chat">Открыть чат</button>';
    if(x.type==='waiting'){const attrs=' data-attempt-pane="'+esc(x.pane)+'" data-attempt-project="'+esc(state.project)+'" data-attempt-id="'+esc(x.waiting.turnInstanceId)+'"';
      return (x.waiting.actions||[]).filter(a=>['retry','skip','finish'].includes(a)).map(a=>'<button class="btn sm'+(a==='retry'?' p':'')+'" data-attempt-action="'+a+'"'+attrs+'>'+(a==='retry'?(x.waiting.status==='unsent'?'Отправить снова':'Повторить'):a==='skip'?(x.waiting.status==='unsent'?'Убрать':'Пропустить'):'Завершить')+'</button>').join('')+'<button class="btn sm" data-inbox-action="open">Открыть чат</button>'}
    if(x.type==='question')return '<button class="btn sm p" data-inbox-action="open"'+disabled+'>Ответить</button><button class="btn sm" data-inbox-action="chat">Открыть чат</button>';
    if(x.type==='update')return '<button class="btn sm p" data-inbox-action="install">Перезапустить</button>';
    return '<button class="btn sm" data-inbox-action="open">'+(x.type==='chat'?'Открыть чат':x.type==='network'?'Подключения':x.type==='limit'?'Лимиты':'Открыть')+'</button>';
  }
  function card(x){const cls=(x.need?' need':'')+(x.read?' read':' new')+(x.done?' done':'')+(x.failed?' err':'');const error=state.actionErrors.get(x.id),reply=x.type==='question'&&state.replyOpen.has(x.id)&&!x.done;
    return '<article class="ps2-ib'+cls+'" data-inbox-id="'+esc(x.id)+'" tabindex="0" aria-label="'+esc(x.kind+': '+x.title)+'"><span class="ic" aria-hidden="true">'+(icon[x.type]||'•')+'</span><div class="bd"><div class="k"><b>'+esc(x.kind)+'</b><i>'+esc(ago(x.ts))+'</i></div><div class="t">'+esc(x.title)+'</div><div class="f">'+esc(x.detail||'')+'</div>'+(reply?'<div class="ps2-ib-reply"><label for="inbox-reply-'+x.record.seq+'">Ответ владельца на вопрос №'+x.record.seq+'</label><textarea id="inbox-reply-'+x.record.seq+'" data-inbox-reply rows="3" placeholder="Напишите решение…">'+esc(state.replyDrafts.get(x.id)||'')+'</textarea><button class="btn sm p" data-inbox-action="send"'+(state.pending.has(x.id)||state.error?' disabled':'')+'>Отправить ответ</button></div>':'')+(error?'<div class="ps2-ib-action-error" role="status">'+esc(error)+'</div>':'')+'</div><div class="act">'+actions(x)+'</div></article>'}
  function draw(){if(PAGE!=='inbox')return;const feed=document.querySelector('[data-inbox-feed]');if(!feed)return;
    const active=document.activeElement,activeRow=feed.contains(active)?active?.closest('[data-inbox-id]'):null,activeId=active?.matches('[data-inbox-reply]')?activeRow?.dataset.inboxId:null;
    const editor=activeId&&state.replyOpen.has(activeId)?{id:activeId,value:active.value,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,scrollTop:active.scrollTop}:null;
    if(editor)state.replyDrafts.set(editor.id,editor.value);
    const n=counts(),shown=state.filter==='need'?state.items.filter(x=>x.need&&!x.done):state.filter==='info'?state.items.filter(x=>!x.need):state.items;
    for(const [key,value] of Object.entries({all:n.all,need:n.need,info:n.info})){const el=document.querySelector('[data-inbox-'+(key==='all'?'total':key)+']');if(el)el.textContent=state.project?value:'—'}
    document.querySelectorAll('[data-inbox-filter]').forEach(b=>{const active=b.dataset.inboxFilter===state.filter;b.classList.toggle('on',active);b.setAttribute('aria-selected',String(active))});
    const link=document.querySelector('[data-inbox-connection]');if(link)link.textContent=state.error?'Не удалось прочитать':state.sourceErrors.length?'Часть источников недоступна':state.project?'Подключено':'Подключаемся…';
    const mark=document.querySelector('[data-inbox-read-all]');if(mark)mark.disabled=!state.project||!state.items.some(x=>!x.read);
    const unavailable=state.error||state.sourceErrors.length?'<div class="ps2-ib-source" role="status">'+(state.error?'Не удалось подтвердить входящие: '+esc(state.error):esc(state.sourceErrors.join(' · ')))+' <button class="btn sm" data-inbox-retry>Повторить</button></div>':'';
    if(!state.project){feed.innerHTML=unavailable||'<div class="ps2-ibempty"><b>Читаем входящие…</b>Статус, журнал и чаты текущего проекта.</div>';return}
    if(!shown.length){feed.innerHTML=unavailable+(unavailable?'':'<div class="ps2-ibempty"><b>Здесь пока пусто</b>'+(state.filter==='need'?'Никто не ждёт вашего решения.':state.filter==='info'?'Новых сообщений к сведению нет.':'Измерений и событий ещё нет.')+'</div>');return}
    const need=shown.filter(x=>x.need&&!x.done),info=shown.filter(x=>!x.need&&!x.done),done=shown.filter(x=>x.done);
    feed.innerHTML=unavailable+(need.length?'<div class="ps2-ibgrp"><b>требует действия · '+need.length+'</b></div>'+need.map(card).join(''):'')+
      (info.length?'<div class="ps2-ibgrp">к сведению · '+info.length+'</div>'+info.map(card).join(''):'')+
      (done.length?'<div class="ps2-ibgrp">выполнено · '+done.length+'</div>'+done.map(card).join(''):'');
    if(editor){const row=[...feed.querySelectorAll('[data-inbox-id]')].find(x=>x.dataset.inboxId===editor.id),field=row?.querySelector('[data-inbox-reply]');if(field){field.focus({preventScroll:true});if(Number.isSafeInteger(editor.start)&&Number.isSafeInteger(editor.end))field.setSelectionRange(editor.start,editor.end,editor.direction);field.scrollTop=editor.scrollTop}}
  }
  async function open(x){if(x.type==='network')location.href='11-connections.html';else if(x.type==='limit')location.href='05-spend.html';else if(x.type==='update')location.href='06-settings.html#p=about';else if(x.type==='verdict'||!x.pane)location.href='21-journal.html';else{
      const b=binding(),S=L.S;if(x.chat&&L.H.active?.[x.pane]!==x.chat){const r=await L.api('/api/chats/open',{chat:x.chat,carry:'none'});if(!same(b)||!r?.ok)throw Error(r?.error||'Чат не открылся')}
      if(!same(b))return;S.ui.pane=x.pane;S.ui.fresh=false;S.ui.switched=true;if(x.chat)S.ui.openChat=x.chat;L.save();location.href='01-chat.html';
    }}
  async function action(x,kind){if(!x||!current()||x.done||state.project!==L.H.project||state.generation!==(L.H.confirmedProjectGeneration||0))return;const b=binding();
    const writing=kind==='allow'||kind==='deny'||kind==='send';if(writing&&(state.pending.has(x.id)||state.error))return;
    if(writing){state.pending.add(x.id);state.actionErrors.delete(x.id);draw()}
    try{if(kind==='allow'||kind==='deny'){if(x.type!=='approval')return;const result=await L.api('/api/approve',{project:b.project,pane:x.approval.pane,id:x.approval.id,decision:kind});if(!same(b))return;if(!result?.ok)throw Error(result?.error||'Решение не принято');x.done=true;x.read=true;signal();draw();await refresh()}
      else if(kind==='send'){if(x.type!=='question')return;const message=(state.replyDrafts.get(x.id)||'').trim();if(!message)throw Error('Напишите ответ перед отправкой');const result=await L.api('/api/chat',{pane:x.pane,message,kind:'decision',reply_to:x.record.seq,direct:true});if(!same(b))return;if(!result?.ok)throw Error(result?.error||'Ответ не отправлен');x.done=true;x.read=true;state.replyOpen.delete(x.id);state.replyDrafts.delete(x.id);signal();draw();await refresh()}
      else if(kind==='install'){if(x.type!=='update'||!window.harnessy?.updates?.install)throw Error('Обновление недоступно в этом окне');await window.harnessy.updates.install()}
      else if(x.type==='question'&&kind==='open'){state.replyOpen.add(x.id);draw();[...document.querySelectorAll('[data-inbox-id]')].find(row=>row.dataset.inboxId===x.id)?.querySelector('[data-inbox-reply]')?.focus()}
      else {await mark([x.id]);if(!same(b))return;await open(x)}
    }catch(e){if(same(b)){state.actionErrors.set(x.id,e?.message||'Действие не выполнено');draw()}}
    finally{if(writing){state.pending.delete(x.id);if(same(b))draw()}}
  }
  document.addEventListener('click',e=>{const filter=e.target.closest('[data-inbox-filter]');if(filter&&PAGE==='inbox'){state.filter=filter.dataset.inboxFilter;draw();return}
    if(e.target.closest('[data-inbox-retry]')){void refresh();return}
    if(e.target.closest('[data-inbox-read-all]')){void mark(state.items.map(x=>x.id));return}
    const button=e.target.closest('[data-inbox-action]'),row=e.target.closest('[data-inbox-id]');if(!row||PAGE!=='inbox')return;
    const x=state.items.find(i=>i.id===row.dataset.inboxId);if(!x)return;if(button){e.preventDefault();e.stopPropagation();void action(x,button.dataset.inboxAction)}else if(!e.target.closest('[data-attempt-action]'))void action(x,'open');
  });
  document.addEventListener('input',e=>{const field=e.target.closest('[data-inbox-reply]'),row=e.target.closest('[data-inbox-id]');if(field&&row&&state.items.some(x=>x.id===row.dataset.inboxId))state.replyDrafts.set(row.dataset.inboxId,field.value)});
  document.addEventListener('keydown',e=>{if(PAGE!=='inbox'||!['Enter',' '].includes(e.key)||!e.target.matches('[data-inbox-id]'))return;e.preventDefault();const x=state.items.find(i=>i.id===e.target.dataset.inboxId);void action(x,'open')});
  const api=window.HARNESS_INBOX={collect,counts,panelCounts,refresh,paintBadges,get current(){return {project:state.project,items:state.items,counts:counts()}}};
  bindPanelCounts();
  addEventListener('live:status',()=>{if(current())void refresh()});
  addEventListener('pageshow',event=>{if(event.persisted&&current())void refresh()});
  addEventListener('pagehide',()=>{state.request++;state.project=null;state.items=[]});
  const events=L?.subscribeLiveEvents?.();if(events)events.onmessage=e=>{let data;try{data=JSON.parse(e.data)}catch{return}if(['state','done','approval','queued','peerReply','note','networkRoute','limits','network','providers'].includes(data.type)&&current())void refresh()};
  window.harnessy?.updates?.onState?.(()=>{if(current())void refresh()});
  if(current())void refresh();
})();
