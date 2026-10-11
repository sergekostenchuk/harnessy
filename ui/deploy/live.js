/* live.js — «рабочий» слой прототипа (подключается сборкой после proto.js, только в режиме <html data-proto>).
   Что делает: действия в прототипе по-настоящему меняют состояние и запоминаются в браузере (localStorage):
   решения в «Сейчас» со счётчиками и отменой, ввод и разговор в чате (ответы — по сценарию; если страницу отдал харнесс ~/HARNESS на :3777 — настоящая модель по подписке),
   журнал действий, поиск ⌘K, запоминание переключателей. Экраны-скетчи при этом не меняются. */
(function(){
  if(!document.documentElement.hasAttribute('data-proto')) return;
  const KEY='harnessy-live-v1', PAGE=document.documentElement.dataset.page||'';
  const WAIT=['m0','limit'];      // решения, которые считаются «ждут вас»
  const DEC={m0:'Подпись M0 по D8.4d',limit:'Воркер 2 упёрся в лимит Codex',defects:'Три класса дефектов — чинить все сейчас?',w4:'W4 проверена — подтвердить?',mine:'Правка README — моя задача или воркера?',restore:'Снос данных вне рабочей копии'};
  let S;
  function load(){ try{ S=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ S=null; } if(!S||S.v!==1) S={v:1,dec:{},log:[],chat:[],pending:null,ui:{}};delete S.away; }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  const now=()=>Date.now(), hhmm=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function log(kind,text){ S.log.unshift({t:now(),kind,text,page:PAGE}); S.log=S.log.slice(0,200); save(); if(window.renderJournal) window.renderJournal(); }
  const waiting=()=>WAIT.filter(d=>!S.dec[d]);
  const plural=n=>n===1?'ждёт':'ждут';
  const rolesN=n=>n+' '+(n%10===1&&n%100!==11?'роль':(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'роли':'ролей'));
  load();

  // ── всплывающая строка с «Отменить»
  let toastEl,toastT;
  function toast(html,undo){ if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='live-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML='<span>'+html+'</span>'+(undo?'<a data-undo>Отменить</a>':''); toastEl.classList.add('on');
    toastEl.onclick=e=>{ if(e.target.closest('[data-undo]')&&undo){ undo(); toastEl.classList.remove('on'); } };
    clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove('on'),undo?6500:2600); }

  // ── счётчики «ждут вас» на всех экранах: рейка, выдвижная панель, плашка нового чата
  // при подключённом движке «ждут вас» — только настоящие карточки мест (pendingApprovals из /api/status); демо-решения — лишь без движка (Kimi UX-1 №85 п.1)
  function waitList(){ const L=window.LIVE; if(L&&L.H&&L.H.on) return (L.H.panes||[]).filter(p=>p.id!=='room'&&p.pendingApprovals>0).map(p=>'карточка у «'+paneName(p)+'»'); return waiting().map(d=>DEC[d].toLowerCase()); }
  function badges(){ const list=waitList(), n=list.length;
    document.querySelectorAll('aside.side .nav[data-go="now"]').forEach(el=>{ let b=el.querySelector('.b'); if(!b){ b=document.createElement('span'); b.className='b'; el.appendChild(b); } b.textContent=n; b.style.display=n?'':'none'; });
    document.querySelectorAll('.m-drawer a.m-i[href="14-now.html"]').forEach(el=>{ let b=el.querySelector('small'); if(!b){ b=document.createElement('small'); el.appendChild(b); } b.textContent=n||''; });
    document.querySelectorAll('.ret').forEach(r=>{ r.style.display=n?'':'none'; const p=r.querySelector('.pill'); if(p) p.textContent='◆ '+n+' '+plural(n)+' вас';
      const tx=r.querySelector('span:not(.pill):not(.btn)'); if(tx&&n) tx.innerHTML='Пока вас не было: '+list.map(t=>'<b>'+esc(t)+'</b>').join(' и ');
      const b=r.querySelector('.btn'); if(b&&!b.dataset.live){ b.dataset.live=1; b.style.cursor='pointer'; b.addEventListener('click',()=>location.href=(window.LIVE&&window.LIVE.H.on)?'01-chat.html':'14-now.html'); } }); }

  // ── «Сейчас»: решение принимается кнопкой в строке или в раскрытой карточке
  let curD=null;
  function applyNow(){ if(PAGE!=='now') return; const n=waiting().length;
    document.querySelectorAll('.li[data-d]').forEach(li=>{ const r=S.dec[li.dataset.d], view=(li.closest('.view')||{}).id; li.classList.toggle('live-done',!!r);
      const btn=li.querySelector('.btn'); if(btn){ if(btn.dataset.label===undefined){ btn.dataset.label=btn.textContent.trim(); btn.dataset.p=btn.classList.contains('p')?'1':''; btn.style.cursor='pointer'; }
        btn.textContent=r?'✓ '+r.result:btn.dataset.label; btn.classList.toggle('ghost',!!r); btn.classList.toggle('p',!r&&btn.dataset.p==='1'); btn.title=r?'Нажмите, чтобы вернуть в очередь':''; }
      const st=li.querySelector('.m.hot, .m[data-hot]'); if(st){ if(st.dataset.hot===undefined){ st.dataset.hot=st.textContent; } st.classList.toggle('hot',!r); if(view==='v-week') st.textContent=r?(r.state==='later'?'отложено':'решено · '+hhmm(r.at)):st.dataset.hot; } });
    document.querySelectorAll('#v-turn .nums b.acc, #v-away .nums b.acc').forEach(b=>b.textContent=n);
    const st=document.querySelector('.top .st'); if(st) st.innerHTML=n?'<i style="background:var(--accent)"></i>'+n+' '+plural(n)+' вас':'<i></i>никто не ждёт — всё решено'; }
  const hooks=[];   // план и стая добавляют сюда свою перерисовку
  function refresh(){ badges(); applyNow(); hooks.forEach(f=>f()); }
  function resolve(d,label){ const prev=S.dec[d], later=/отлож/i.test(label); S.dec[d]={state:later?'later':'done',result:label,at:now()}; save(); log('решение',DEC[d]+' → '+label); refresh();
    toast('Записано: <b>'+esc(label)+'</b>',()=>{ if(prev) S.dec[d]=prev; else delete S.dec[d]; save(); log('решение','Отменено: '+DEC[d]); refresh(); }); }
  document.addEventListener('click',e=>{ if(PAGE!=='now') return; const li=e.target.closest('.li[data-d]'); if(li) curD=li.dataset.d;
    const b=e.target.closest('.btn'); if(!b) return;
    if(li&&li.contains(b)){ e.stopPropagation(); e.preventDefault(); const d=li.dataset.d; if(!DEC[d]) return;
      if(S.dec[d]){ delete S.dec[d]; save(); log('решение','Возвращено в очередь: '+DEC[d]); refresh(); toast('Возвращено в очередь'); } else resolve(d,b.dataset.label||b.textContent.trim()); return; }
    if(b.closest('.panel .acts')&&curD&&DEC[curD]){ const lab=b.textContent.trim(); if(/объясни/i.test(lab)){ toast('Объяснение — в карточке: что будет при «да» и при «нет»'); return; } resolve(curD,lab); if(window.HX) HX.close(); } },true);

  // ── мост к харнессу: если страницу отдал сам харнесс (~/HARNESS, :3777), чат идёт к настоящей модели по подписке, ответ — потоком событий
  const H={on:false,panes:[],pane:null,cur:null,asks:{}};
  const api=(p,body)=>{ const project=H.project,changing=!!body&&/^\/api\/(?:project(?:\/create)?|room\/move|assign)$/.test(p);if(changing)H.projectLinkChange=true; return fetch(p,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined).then(r=>r.json()).then(r=>{
    if(changing&&(!r.ok||r.project===project))H.projectLinkChange=false;
    if(r.waiting&&(r.project||project)===H.project){ const id=typeof r.pane==='string'?r.pane:(r.pane&&r.pane.id)||body&&body.pane||(p.match(/^\/api\/panes\/([^/]+)/)||[])[1]; const pane=(H.panes||[]).find(x=>x.id===id); if(pane){ pane.waiting=r.waiting; showWaiting(pane,r.waiting,r.project||project); } }
    if(r.code==='restore_failed'&&r.project===H.project) showRestore(r.project,r.error);
    return r; }).catch(error=>{if(changing)H.projectLinkChange=false;throw error}); };
  // TS-07: waiting controls bind the click to the displayed project and episode.
  const warningSeen=new Set();
  function warningEvent(ev){ if(!ev.warning) return false; const key=H.project+'\u0000'+ev.pane+'\u0000'+ev.warning; if(warningSeen.has(key)) return true; warningSeen.add(key); return false; }
  function consumeState(ev){ const pane=(H.panes||[]).find(p=>p.id===ev.pane); if(pane) Object.assign(pane,ev);
    if(PAGE==='chat'&&pane&&H.pane&&H.pane.id===ev.pane&&ev.busy&&!H.cur){H.cur={text:'',tools:[],model:ev.model,pane:ev.pane,who:ev.label||paneName(pane)};drawLive()}
    if(ev.status==='idle'){ const prefix=H.project+'\u0000'+ev.pane+'\u0000'; for(const key of warningSeen) if(key.startsWith(prefix)) warningSeen.delete(key); const card=document.getElementById('live-waiting'); if(card&&card.dataset.pane===ev.pane&&card.dataset.project===H.project) card.remove(); }
    else if(pane&&ev.waiting) showWaiting(pane,ev.waiting,H.project); if(typeof sideChats==='function') sideChats(); }
  function waitingControls(p,info,project,compact=false){ const seqs=info.recordSeqs||[],range=seqs.length?'#'+seqs[0]+'–#'+seqs[seqs.length-1]:'вся очередь',damaged=String(info.turnInstanceId).startsWith('unreadable:'),name=paneName(p);
    const detail=info.status==='recovering'?'Ответ сохранён. Восстановление завершит местные действия без вызова модели.':damaged?'Состав прежней попытки неизвестен: attempts.json повреждён; модель получит всю очередь места заново.':!(info.actions||[]).includes('skip')?'Граница прежней доставки неизвестна; повтор отправит модели всю очередь места.':'Записи '+range+' будут отправлены «'+name+'» ещё раз при повторе. При пропуске уйдут только более поздние задания.';
    const buttons=(info.actions||[]).map(action=>'<button type="button" class="btn sm ghost" data-attempt-action="'+esc(action)+'" data-attempt-pane="'+esc(p.id)+'" data-attempt-project="'+esc(project)+'" data-attempt-id="'+esc(info.turnInstanceId)+'">'+({retry:'Повторить',skip:'Пропустить',finish:'Повторить восстановление'}[action]||esc(action))+'</button>').join('');
    return '<div class="live-attempt-controls" style="white-space:normal"><small>'+esc((compact?name+' · '+range+'. ':'')+detail)+'</small><div class="act" style="display:flex;flex-wrap:wrap;gap:4px">'+buttons+'</div></div>'; }
  function showWaiting(p,info,project){ if(!info||project!==H.project) return; let card=document.getElementById('live-waiting'); if(!card){ card=document.createElement('div'); card.id='live-waiting'; card.className='live-toast on'; document.body.appendChild(card); }
    card.style.maxWidth='520px';card.style.whiteSpace='normal';card.style.display='block';card.dataset.pane=p.id; card.dataset.project=project; card.innerHTML='<b>'+esc(paneName(p))+' · '+(info.status==='recovering'?'восстановление ответа':'итог хода неизвестен')+'</b>'+waitingControls(p,info,project); }
  function showRestore(project,error){ let card=document.getElementById('live-waiting'); if(!card){card=document.createElement('div');card.id='live-waiting';card.className='live-toast on';document.body.appendChild(card)}card.dataset.pane='';card.dataset.project=project;card.innerHTML='<span>'+esc(error)+'</span><button type="button" class="btn sm ghost" data-attempt-reload="'+esc(project)+'">Повторить восстановление проекта</button>'; }
  document.addEventListener('click',async e=>{ const button=e.target.closest('[data-attempt-action], [data-attempt-reload]'); if(!button) return; e.preventDefault(); e.stopImmediatePropagation(); if(button.disabled) return; const requestedProject=button.dataset.attemptReload||button.dataset.attemptProject;button.disabled=true;
    let r=null; try{ r=button.dataset.attemptReload?await api('/api/project',{path:button.dataset.attemptReload,reload:true}):await api('/api/panes/'+encodeURIComponent(button.dataset.attemptPane)+'/attempt',{project:button.dataset.attemptProject,turnInstanceId:button.dataset.attemptId,action:button.dataset.attemptAction}); }catch(x){} finally{button.disabled=false}
    if(H.project!==requestedProject) return; if(!r||!r.ok){ toast('Не вышло: '+esc(r&&r.error||'нет связи')); return; } const card=document.getElementById('live-waiting'); if(card) card.remove(); await refreshStatus(); await refreshChats(); sideChats(); });
  // End TS-07 waiting controls.
  let bindingGeneration=0,bindingIdentity='';
  const settingJobs=new Map();
  function sendBinding(){ const pane=S.ui.pane||(H.pane&&H.pane.id)||'room',chat=(H.active||{})[pane]||null,project=H.project||'',identity=JSON.stringify([project,pane,chat]);
    if(identity!==bindingIdentity){ bindingIdentity=identity; bindingGeneration++; settingJobs.clear(); }
    return {project,pane,chat,generation:bindingGeneration}; }
  function invalidateBinding(){ bindingIdentity=''; bindingGeneration++; settingJobs.clear(); }
  let leftPage=false;addEventListener('pagehide',()=>{leftPage=true;invalidateBinding()});
  function bindingCurrent(binding){ const current=sendBinding(); return current.project===binding.project&&current.pane===binding.pane&&current.chat===binding.chat&&current.generation===binding.generation; }
  const settingKey=b=>JSON.stringify([b.project,b.pane,b.chat,b.generation]);
  function configureSetting(perform){ const binding=sendBinding(),key=settingKey(binding),previous=settingJobs.get(key),job={promise:null};
    job.promise=Promise.resolve(previous&&previous.promise).then(()=>bindingCurrent(binding)?perform(binding):false).catch(()=>{ if(bindingCurrent(binding)) toast('Нет связи: настройка не применена'); return false; });
    settingJobs.set(key,job);return job.promise; }
  async function settingsReady(binding){ let last=null;
    while(bindingCurrent(binding)){ const job=settingJobs.get(settingKey(binding)); if(!job||job===last) return true; const ok=await job.promise;
      if(!ok){ if(settingJobs.get(settingKey(binding))===job) settingJobs.delete(settingKey(binding)); return false; } last=job; }
    return false; }
  function md(t){ const parts=esc(t).split(/```/); let out='';          // минимальная разметка ответа: абзацы, списки, **жирный**, `код`, блоки кода
    parts.forEach((p,i)=>{ if(i%2){ out+='<pre>'+p.replace(/^[a-zA-Z0-9_-]*\n/,'')+'</pre>'; return; }
      out+=p.split(/\n{2,}/).map(par=>{ par=par.replace(/^\n+|\n+$/g,''); if(!par) return '';
        if(/^(?:\s*[-*•] .*(?:\n|$))+$/.test(par)) return '<ul>'+par.split('\n').map(l=>'<li>'+l.replace(/^\s*[-*•] /,'')+'</li>').join('')+'</ul>';
        if(/^(?:\s*\d+[.)] .*(?:\n|$))+$/.test(par)) return '<ol>'+par.split('\n').map(l=>'<li>'+l.replace(/^\s*\d+[.)] /,'')+'</li>').join('')+'</ol>';
        if(/^#{1,4} /.test(par)) return '<p><b>'+par.replace(/^#{1,4} /,'')+'</b></p>';
        return '<p>'+par.replace(/\n/g,'<br>')+'</p>'; }).join(''); });
    return out.replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/`([^`\n]+)`/g,'<code>$1</code>'); }
  const paneName=p=>p?p.label.charAt(0).toUpperCase()+p.label.slice(1):'';
  function pickPane(){ let p=H.panes.find(x=>x.id===(S.ui.pane||'')); if(!p&&S.ui.pane==='room'){ H.pane=null; return; }   // «без роли» выбрано, комнаты ещё нет — модель предстоит выбрать
    if(!p){ const b=document.querySelector('.frame .top b'); const lab=((b&&b.textContent)||'').split('·')[0].trim().toLowerCase(); p=H.panes.find(x=>x.label.toLowerCase()===lab)||H.panes.find(x=>x.id!=='room'&&x.vendor==='claude')||H.panes.find(x=>x.id!=='room')||H.panes[0]; } H.pane=p||null; }
  const modelName=id=>{ for(const v of Object.values(H.models||{})){ const m=(v||[]).find(x=>x.id===id); if(m&&m.label) return m.label; } return id||'модель не выбрана'; };   // человеческое имя модели из каталога движка (Kimi UX-3 №106 п.4)
  function hStatus(){ if(PAGE!=='chat') return; const p=H.pane; if(H.on) document.querySelectorAll('.frame .top > b').forEach(b=>b.textContent=(p?(p.id==='room'?'Без роли':paneName(p)):'Без роли')+' · '+((H.project||'').split('/').filter(Boolean).pop()||'проект'));
    document.querySelectorAll('.frame .top .st').forEach(s=>{ if(!p) return;
      s.innerHTML='<i></i>'+(H.link==='lost'?'связь потеряна · переподключение…':(H.cur?'думает':'подключено'))+' · '+esc(p.label)+' · '+esc(modelName(p.model))+' · '+esc(p.mode)+' <span class="live-pick" title="Выбрать место">▾</span>'; s.classList.toggle('live-busy',!!H.cur); });
    if(!p&&H.on) document.querySelectorAll('.frame .top .st').forEach(s=>{ s.innerHTML='<i></i>подключено · без роли · модель не выбрана <span class="live-pick" title="Выбрать место">▾</span>'; }); }
  function pickMenu(st){ document.querySelectorAll('.st .live-menu').forEach(m=>m.remove()); const m=document.createElement('div'); m.className='live-menu'; st.style.position='relative';
    m.innerHTML=H.panes.map(p=>'<div data-pane="'+p.id+'"'+(H.pane&&p.id===H.pane.id?' class="on"':'')+'>'+(H.pane&&p.id===H.pane.id?'✓ ':'')+esc(p.id==='room'?'Без роли':paneName(p))+' <small>· '+esc(p.vendor==='claude'?'Claude':'Codex')+' · '+esc(modelName(p.model))+'</small></div>').join(''); st.appendChild(m);
    const off=e=>{ if(!m.contains(e.target)){ m.remove(); document.removeEventListener('click',off,true); } }; setTimeout(()=>document.addEventListener('click',off,true),0); }
  document.addEventListener('click',e=>{ const pk=e.target.closest('.live-pick'); if(pk&&H.on){ e.stopPropagation(); pickMenu(pk.closest('.st')); return; }
    const it=e.target.closest('.live-menu [data-pane]'); if(it){ invalidateBinding(); S.ui.pane=it.dataset.pane; save(); pickPane(); hStatus(); it.closest('.live-menu').remove(); toast('Собеседник: '+esc(paneName(H.pane))+' · '+esc(modelName(H.pane.model))); if(window.CX) CX.render(); loadChat(); return; }
    const ap=e.target.closest('[data-approve]'); if(ap&&H.pane){ const id=ap.closest('.live-ask').dataset.ask; api('/api/approve',{pane:H.pane.id,id,decision:ap.dataset.approve}); return; }
    if(e.target.closest('.live-stop')&&H.pane){ stop(); } });
  addEventListener('keydown',e=>{ if(e.key==='Escape'&&H.cur&&!document.querySelector('.cx-pop, .live-menu')) stop(); });   // Esc во время хода — стоп (как в Claude Desktop/Codex)
  async function stop(){ if(!H.pane) return; let r=null; try{ r=await api('/api/interrupt',{pane:H.pane.id}); }catch(x){}
    if(r&&r.ok){ toast('Останавливаю…'); setTimeout(()=>{ if(H.cur){ finish({type:'error',text:'остановлено владельцем'}); } },4000); return; }   // движок прервёт ход и пришлёт done/error; страховка на 4 с
    if(H.cur){ finish({type:'error',text:'остановлено: ход уже не шёл ('+esc((r&&r.error)||'нет связи')+')'}); } toast('Остановлено'); }
  const toolLine=t=>'<div class="live-tool'+(t.err?' err':'')+'">'+esc(t.text)+'</div>';
  function curHTML(){ const c=H.cur; return '<div class="ai live-msg live-cur'+(c.text?'':' live-typing')+'"><span class="orb"></span><div><div class="thought">'+esc(c.who||paneName(H.pane))+' · '+esc(c.model||'модель не сохранена')+' · '+(c.text?'отвечает':'думает…')+'<span class="live-stop">■ стоп</span></div>'+c.tools.map(toolLine).join('')+md(c.text)+'</div></div>'; }
  const askHTML=a=>'<div class="live-msg live-ask'+(a.done?' done':'')+'" data-ask="'+a.id+'"><b>'+esc(a.title)+'</b><small>'+esc(a.detail||'')+'</small>'+(a.done?'<span class="mono">'+(a.done==='allow'?'разрешено':a.done==='deny'?'отказано':'время вышло')+'</span>':'<div class="act"><span class="btn sm p" data-approve="allow">Разрешить</span><span class="btn sm ghost" data-approve="deny">Отказать</span></div>')+'</div>';
  function drawLive(){ if(!H.on) return; if(window.CX&&CX.setBusy) CX.setBusy(!!H.cur); cols().forEach(c=>{ c.querySelectorAll('.live-cur, .live-ask').forEach(x=>x.remove()); if(H.cur) c.insertAdjacentHTML('beforeend',curHTML()); Object.values(H.asks).forEach(a=>c.insertAdjacentHTML('beforeend',askHTML(a))); }); hStatus(); if(H.cur||Object.keys(H.asks).length) scrollEnd(); }
  function finish(ev){ const c=H.cur; H.cur=null; if(window.CX&&CX.setBusy) CX.setBusy(false); setTimeout(()=>dispatchEvent(new CustomEvent('live:done')),0);
    if(c&&(c.text||c.tools.length)){ const u=ev&&ev.usage; S.chat.push({role:'ai',html:c.tools.map(toolLine).join('')+md(c.text),text:c.text,t:now(),src:'live',who:c.who||(H.pane.id==='room'?'Без роли':paneName(H.pane)),pane:c.pane||H.pane.id,nf:!!(S.cx&&S.cx.noFolder),model:ev&&typeof ev.model==='string'&&ev.model?ev.model:null,cost:u?{i:u.input,o:u.output,c:u.cacheRead,ms:ev.durationMs}:null}); S.chat=S.chat.slice(-40); save(); }
    if(ev&&ev.type==='error'){ const msg=ev.message||ev.text||ev.error||'ошибка'; S.chat.push({role:'ai',html:'<p>'+esc(msg)+'</p>'+(/not supported|unsupported|недоступн/i.test(msg)?'<p class="live-hint">Эта модель недоступна на подписке — выберите другую в чипе модели.</p>':''),t:now(),src:'err'}); save(); } render(); }
  function hEvent(ev){ const t=ev.type, cur=()=>H.cur||(H.cur={text:'',tools:[]});
    if(t==='error'&&ev.code==='unserializable'){ toast(ev.message||'Событие не удалось показать; ответ продолжается'); return; }
    if((t==='note'||t==='error')&&warningEvent(ev)) return;
    if(t==='delta'){ cur().text+=ev.text||''; drawLive(); }
    else if(t==='tool'){ cur().tools.push({text:'▸ '+ev.name+(ev.detail?': '+ev.detail:'')}); drawLive(); }
    else if(t==='toolError'){ cur().tools.push({text:'✕ '+(ev.text||''),err:true}); drawLive(); }
    else if(t==='approval'){ H.asks[ev.id]={id:ev.id,title:ev.title,detail:ev.detail}; drawLive(); }
    else if(t==='approvalResolved'){ const a=H.asks[ev.id]; if(a){ a.done=ev.decision; drawLive(); setTimeout(()=>{ delete H.asks[ev.id]; drawLive(); },2500); } }
    else if(t==='done'){ finish(ev); log('чат','Ответ: '+paneName(H.pane)+' · '+(ev.model||'модель не сохранена')); }
    else if(t==='error'){ finish(ev); }
    else if(t==='note'){ S.chat.push({role:'ai',src:'sys',who:'харнесс',pane:H.pane?H.pane.id:'room',html:'<p>'+esc(ev.text||'')+'</p>',text:'[от харнесс] '+(ev.text||''),t:now()}); S.chat=S.chat.slice(-40); save(); render(); } }
  const isDirect=()=>!!(S.ui.direct&&H.pane&&S.ui.direct[H.pane.id]);
  async function ask(q,binding=sendBinding()){ if(!bindingCurrent(binding)) return false; const target=(H.panes||[]).find(p=>p.id===binding.pane)||H.pane;
    if(!H.cur){ H.cur={text:'',tools:[],model:target&&target.model,pane:binding.pane,who:target&&(target.id==='room'?'Без роли':paneName(target))}; drawLive(); } let r=null; try{ r=await api('/api/chat',{pane:binding.pane,message:q,kind:'question',direct:!!(S.ui.direct&&S.ui.direct[binding.pane])}); }catch(e){}
    if(!bindingCurrent(binding)) return false;
    if(r&&r.needDirect){ H.cur=null; S.chat.pop(); S.draft=q; save(); render();   // чат роли читается свободно; писать мимо оркестратора — явно, с записью в журнал
      cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg live-direct"><span class="orb"></span><div><div class="thought">обращение к роли напрямую</div><p>«'+esc(paneName(H.pane))+'» — не оркестратор. По умолчанию с ролями говорит оркестратор, вы их чаты читаете. Написать напрямую — явное действие, оно запишется в журнал линии.</p><div class="act"><span class="btn sm p" data-direct="on">Обратиться напрямую к «'+esc(paneName(H.pane))+'»</span><span class="btn sm ghost" data-direct="orch">Написать оркестратору</span></div></div></div>')); scrollEnd(); return; }
    if(!r||!r.ok){ H.cur=null; S.chat.push({role:'ai',html:'<p>Харнесс не принял сообщение: '+esc((r&&r.error)||'нет связи')+'</p>',t:now(),src:'err'}); save(); render(); return; }
    if(r.queued) toast('Место занято — сообщение встало в очередь'); return true; }
  function applyStatus(st){ const changed=H.project!==(st.project||''),previousRoom=(H.panes||[]).find(p=>p.id==='room');H.panes=st.panes; H.models=st.models||{}; H.modes=st.modes||[]; H.project=st.project||''; H.defaultDir=st.defaultDir||''; H.roleCatalog=st.roleCatalog||[]; H.noProject=!!st.noProject; H.projectsRoot=st.projectsRoot||''; H.active=st.activeChats||{}; H.hasOrch=!!st.hasOrchestrator; H.halted=!!st.halted; H.kinds=st.kinds||[]; H.threads=st.threads||{};
    if(changed){H.projects=null;const selectedRoom=(H.panes||[]).find(p=>p.id==='room');if(previousRoom&&selectedRoom&&previousRoom.model!==selectedRoom.model)toast('у проекта своя настройка модели: '+esc(modelName(selectedRoom.model)));}
    if(changed&&typeof resetJournal==='function'){resetJournal(H.project);if(H.on&&window.psKey==='log')journalFetch()}setTimeout(()=>dispatchEvent(new CustomEvent('live:status')),0);
    if(PAGE==='new') document.querySelectorAll('.status > span:first-child').forEach(el=>{ el.textContent=(H.noProject||!!(S.cx&&S.cx.noFolder))?'без проекта · модель ничего не читает':'папка '+((H.project||'').split('/').filter(Boolean).pop()||'проект')+(st.repo?' · git':'')+' · ролей '+(H.panes||[]).filter(p=>p.id!=='room').length; });   // строка папки — от движка, не статика скетча (Kimi UX-1 №85 п.2)
    badges();
    if(PAGE==='new'){ S.ui.pane='room'; S.ui.fresh=true; S.ui.switched=false; save(); }   // стартовый экран — ВСЕГДА без роли · новый чат; выбор роли или чата отсюда = переход в чат (слово владельца 08.10)
    if(!S.ui.pane){ S.ui.pane='room'; save(); } pickPane(); if(H.pane&&H.pane.waiting) showWaiting(H.pane,H.pane.waiting,H.project); }
  async function refreshChats(){ const binding=sendBinding();try{ const r=await api('/api/chats');if(!bindingCurrent(binding))return; H.chatList=r.chats||[]; H.active=r.active||H.active||{}; }catch(e){ H.chatList=H.chatList||[]; } if(typeof sideChats==='function') await sideChats(); }
  async function refreshStatus(){ let st=null; try{ st=await api('/api/status'); }catch(e){} if(st&&Array.isArray(st.panes)){ applyStatus(st); await refreshChats(); hStatus(); if(window.CX) CX.render(); } return st; }
  // лента активного чата — из харнесса (один источник правды для Electron, браузера и сервера); цена хода у старых реплик неизвестна
  let LOADED=null; const ONB={};
  // вводная роли при первом открытии её чата — в том числе когда чата ещё нет (место посеяно при создании проекта; Kimi UX-1 №85 п.4); движок повторно не шлёт
  async function onboardOnce(p){ if(!p||p.id==='room'||ONB[p.id]) return; ONB[p.id]=1; try{ const o=await api('/api/onboard',{pane:p.id}); if(o&&o.sent){ toast('Роль получает вводную: кто она, где, с кем работает'); await refreshStatus(); if(H.pane&&H.pane.busy){if(!H.cur)H.cur={text:'',tools:[]};drawLive(); } else await loadChat(); } }catch(e){} }
  async function loadChat(){ if(!H.on||PAGE!=='chat') return; const p=H.pane, cid=p?(H.active||{})[p.id]:null,binding=sendBinding();
    if(!cid){ S.chat=[]; save(); LOADED=cid||'none'; render(); if(p&&!p.busy) await onboardOnce(p); return; }
    if(LOADED!==cid){S.chat=[];save();render()}
    let r=null; try{ r=await api('/api/chats/'+cid); }catch(e){} if(!r||!Array.isArray(r.messages)){ return; }
    const who=p.id==='room'?'Без роли':paneName(p);
    const hsys=m=>m.role==='peer'&&/^\[от харнесс\]/.test(m.text);   // заметки харнесса (вводная, передача) — системные: без модели, расхода и действий
    if(!bindingCurrent(binding)) return;
    S.chat=r.messages.map(m=>m.role==='me'?{role:'me',text:m.text,t:(m.ts||0)*1000}:{role:'ai',src:hsys(m)?'sys':'live',who:hsys(m)?(/контекст передан/.test(m.text)?'харнесс · передача':'харнесс · вводная'):(m.role==='peer'?'сосед':who),pane:p.id,model:typeof m.model==='string'&&m.model?m.model:null,html:md(m.text.replace(/^\[от [^\]]+\]\s*/,'')),text:m.text,t:(m.ts||0)*1000,cost:{i:m.usage&&m.usage.input,o:m.usage&&m.usage.output,c:m.usage&&m.usage.cacheRead,ms:m.durationMs}});   // цена и модель — из реплики, не из настройки чата
    LOADED=cid; save(); render();
    if(p.id!=='room'&&!r.messages.length&&!p.busy) await onboardOnce(p); }   // роль без вводной получает её при первом открытии чата (правило движка)
  // подключение к движку на всех экранах: боковая панель, настройки, подключения живут его данными (08.10)
  async function hConnect(){ let st=null; try{ st=await api('/api/status'); }catch(e){ } if(!st||!Array.isArray(st.panes)){ return; }   /* движок подключён, если статус есть — даже без единого места: иначе чистая машина (первый запуск) остаётся в демо-режиме и проект создать нельзя */
    H.on=true; applyStatus(st); if(!H.pane&&S.ui.pane!=='room'){ H.on=false; return; }
    await refreshChats();
    if(PAGE==='chat'){ if(H.pane&&H.pane.busy) H.cur={text:'',tools:[]};
      let linkedProject=H.project;const es=new EventSource('/api/events/all'); es.onmessage=e=>{ let ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if(ev.type==='state') consumeState(ev); if(!H.pane||ev.pane!==H.pane.id) return; hEvent(ev); };
      es.onerror=()=>{ if(H.link!=='lost'){ H.link='lost'; hStatus(); if(!H.projectLinkChange)toast('Связь с движком потеряна — переподключаюсь…'); } };   // плановая смена проекта тоже закрывает SSE — это не потеря движка
      es.onopen=async()=>{ if(H.link==='lost'){ const switching=H.projectLinkChange;H.link='ok'; hStatus(); await refreshStatus();if(!switching&&H.project===linkedProject)toast('Связь восстановлена');linkedProject=H.project;H.projectLinkChange=false; } };
      hStatus(); await loadChat(); }
    if(/21-journal\.html$/.test(location.pathname)) journalLive();
    if(PAGE==='now') nowLive();   // «Сейчас» — открытые карточки подтверждений из движка, не демо-решения (Kimi UX-7 №133 п.5)   // экран «Журнал» — лента линии из движка, не заготовка (Kimi UX-7 №133 п.1)
    if(window.CX) CX.render(); }

  // ── чат: настоящее поле ввода; разговор хранится; ответы — по сценарию и так и подписаны (или от настоящей модели через мост)
  const link=(href,t,p)=>'<a class="btn sm'+(p?' p':'')+'" href="'+href+'" style="text-decoration:none">'+t+'</a>';
  function answer(q){ const s=q.toLowerCase(), w=waiting(), n=w.length;
    if(/жд[её]т|ждут|команд|кто работает|что сейчас|статус|состояни/.test(s)) return '<p>'+(n?'Вас '+plural(n)+' <b>'+n+'</b> '+(n===1?'решение':'решения')+': '+w.map(d=>'«'+esc(DEC[d])+'»').join(' и ')+'.':'Сейчас вас никто не ждёт: все решения приняты.')+' Работают 4 места из 6, прогон H1.5 на шаге 3 из 7.</p><div class="act">'+link('14-now.html','Открыть «Сейчас»',1)+link('04-swarm.html','Стая')+'</div>';
    if(/план|задач|карт/.test(s)) return '<p>В плане OMG <b>87 задач</b>, уровень L1: падают 3, в работе 12.</p><div class="act">'+link('02-plan.html','Открыть план',1)+link('17-doc.html','Документ стадии')+'</div>';
    if(/расход|лимит|оплат|токен|стоит|деньг|подписк/.test(s)) return '<p>Claude Max — <b>62 %</b> недели, Codex — <b>94 %</b> пятичасового окна (сброс в 19:58), ближайшая оплата 07.10.</p><div class="act">'+link('05-spend.html','Открыть расход',1)+link('11-connections.html','Подключения')+'</div>';
    if(/ста[яеи]|агент|воркер|ревьюер|хранител/.test(s)) return '<p>В стае 6 мест: оркестратор, два воркера, ревьюер, хранитель и ресёрчер. Воркер 2 стоит на лимите Codex.</p><div class="act">'+link('04-swarm.html','Открыть стаю',1)+link('13-sensors.html','Датчики')+'</div>';
    if(/памят|правил/.test(s)) return '<p>В памяти проекта 12 правил, 2 спорных.</p><div class="act">'+link('16-memory.html','Открыть память',1)+'</div>';
    if(/артефакт|диф|отч[её]т/.test(s)) return '<p>К проверке готовы 3 артефакта, ещё 2 вы проверили сами, но не влили.</p><div class="act">'+link('15-artifacts.html','Открыть артефакты',1)+'</div>';
    if(/исслед|рес[её]рч|источник/.test(s)) return '<p>Идёт исследование про вход и подключение подписок: 6 из 12 источников, 2 ответа готовы.</p><div class="act">'+link('12-research.html','Открыть ресёрч',1)+'</div>';
    if(/журнал|истори|что я делал/.test(s)) return '<p>В журнале '+S.log.length+' ваших действий в этом браузере.</p><div class="act">'+link('21-journal.html','Открыть журнал',1)+'</div>';
    return '<p>Это прототип: настоящей модели за ним пока нет, поэтому я отвечаю по сценарию и поручений не выполняю. Вопрос записан в журнал.</p><p>Спросите про команду, план, расход, стаю, память или артефакты — покажу, где это лежит.</p><div class="act">'+link('14-now.html','Сейчас')+link('02-plan.html','План')+link('21-journal.html','Журнал')+'</div>'; }
  const fmtN=n=>n==null?null:String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const costLine=m=>{ if(m.src!=='live') return ''; const c=m.cost,known=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
    if(!c||![c.i,c.o,c.c,c.ms].some(known)) return '<div class="live-cost">расход недоступен</div>';
    return '<div class="live-cost">'+(known(c.i)&&known(c.o)?'расход: '+fmtN(c.i+c.o)+' токенов':'расход: неполные данные')+' · вход '+(known(c.i)?fmtN(c.i):'—')+' · выход '+(known(c.o)?fmtN(c.o):'—')+' · кэш '+(known(c.c)?fmtN(c.c):'—')+(known(c.ms)?' · '+(c.ms>=60000?Math.round(c.ms/60000)+' мин':Math.round(c.ms/1000)+' с'):' · время не сохранено')+'</div>'; };
  const actsLine=(m,i)=>{ if(m.src!=='live') return ''; const a=['<span data-la="copy" data-i="'+i+'">копировать</span>'];
    const others=(H.panes||[]).filter(p=>p.id!=='room'&&p.id!==m.pane).length, ho='<span data-la="'+(others?'handoff':'handoff-none')+'" data-i="'+i+'"'+(others?'':' class="dis" title="в команде пока один собеседник — сначала назначьте роль"')+'>передать контекст</span>';   // без адресатов — причина, не пустое меню (Kimi UX-3 №106 п.2)
    if(m.pane==='room'){ if(m.nf) a.push('<span data-la="assign" data-i="'+i+'">назначить оркестратора</span>','<span data-la="mkdir" data-i="'+i+'">создать проект и git</span>','<span data-la="move" data-i="'+i+'">перейти в проект…</span>'); else a.push('<span data-la="assign" data-i="'+i+'">назначить роль</span>',ho); } else a.push(ho);   // из чата роли контекст тоже передаётся — владелец остаётся
    return '<div class="live-acts">'+a.join('<i>·</i>')+'</div>'; };
  const ckBox=(m,i)=>SEL&&(m.role==='me'||m.src==='live')?'<label class="live-ck"><input type="checkbox" data-ck="'+i+'"'+(SEL.checked.has(i)?' checked':'')+'></label>':'';
  const bubble=(m,i)=>m.role==='me'?'<div class="me live-msg">'+ckBox(m,i)+esc(m.text)+'</div>':'<div class="ai live-msg">'+ckBox(m,i)+'<span class="orb"></span><div><div class="thought">'+(m.src==='live'?esc(m.who||'')+' · '+esc(m.model||'модель не сохранена')+' · ':m.src==='sys'?esc(m.who||'харнесс')+' · ':m.src==='err'?'ошибка · ':'прототип · ответ по сценарию · ')+(typeof m.t==='number'&&m.t>0?hhmm(m.t):'время не сохранено')+'</div>'+m.html+costLine(m)+actsLine(m,i)+'</div></div>';
  const cols=()=>document.querySelectorAll('.feed .col');
  function scrollEnd(){ document.querySelectorAll('.feed').forEach(f=>f.scrollTop=f.scrollHeight); if(document.documentElement.hasAttribute('data-m')) window.scrollTo(0,document.documentElement.scrollHeight); }
  function render(){ cols().forEach(c=>{ c.querySelectorAll('.live-msg, .live-sep').forEach(x=>x.remove()); c.classList.toggle('live-demo-off',H.on||!S.ui.demo);
      c.insertAdjacentHTML('beforeend','<div class="live-sep">'+(H.on?(S.chat.length?'ваш разговор · через харнесс':'разговор пуст'):(S.chat.length?'ваш разговор в прототипе · <a data-clear>очистить</a> · ':'разговор пуст · ')+'<a data-demo>'+(S.ui.demo?'скрыть пример':'пример разговора')+'</a>')+'</div>'+S.chat.map(bubble).join('')); }); selBar(); drawLive(); if(S.chat.length) scrollEnd(); }
  document.addEventListener('click',e=>{ if(e.target.closest('[data-demo]')){ S.ui.demo=!S.ui.demo; save(); render(); } });
  document.addEventListener('click',e=>{ const d=e.target.closest('[data-direct]'); if(!d||!H.pane) return; const q=S.draft||''; document.querySelectorAll('.live-direct').forEach(x=>x.remove());
    if(d.dataset.direct==='on'){ const binding=sendBinding(); S.ui.direct=S.ui.direct||{}; S.ui.direct[binding.pane]=true; save(); log('чат','Обращение напрямую к «'+paneName(H.pane)+'», минуя оркестратора'); toast('Напрямую к «'+esc(paneName(H.pane))+'» — записано в журнал'); if(window.CX) CX.render(); return q?onSend(q,null,binding):false; }
    if(d.dataset.direct==='orch'){ const o=(H.panes||[]).find(p=>p.role==='orchestrator'); if(o){invalidateBinding();S.ui.pane=o.id; save(); pickPane(); hStatus(); const binding=sendBinding(); if(window.CX) CX.render(); return loadChat().then(()=>q?onSend(q,null,binding):false); } } });
  // ── переключение собеседника с контекстом: чекбоксы у реплик, промпт, передача текстом (между моделями и вендорами переносится только текст)
  let SEL=null;
  const plain=m=>m.text||String(m.html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  function selStart(to,opts){ opts=opts||{}; const ids=Array.isArray(to)?to:[to]; const idx=S.chat.map((m,i)=>i).filter(i=>S.chat[i].role==='me'||S.chat[i].src==='live'); if(!idx.length){ toast('Передавать нечего — разговор пуст'); return; } SEL={to:ids,sw:opts.sw!==false,checked:new Set(idx)}; render(); }   // sw: переключиться после передачи (свитчер ролей) или остаться (меню под ответом)
  const selChars=()=>[...(SEL?SEL.checked:[])].reduce((a,i)=>a+plain(S.chat[i]||{}).length,0);   // объём передачи (Kimi UX-4 №126 п.7)
  function selBar(){ document.querySelectorAll('.live-selbar').forEach(x=>x.remove()); if(!SEL) return; const tos=(H.panes||[]).filter(p=>SEL.to.includes(p.id)); if(!tos.length){ SEL=null; return; } const toName=tos.map(p=>esc(paneName(p))).join(', '); const from=H.pane?(H.pane.id==='room'?'разговора без роли':paneName(H.pane)):'разговора без роли';
    document.querySelectorAll('.frame .box').forEach(box=>{ const bar=document.createElement('div'); bar.className='live-selbar';
      bar.innerHTML='<div class="t">передать контекст → <b>'+toName+'</b> · выбрано <b class="n">'+SEL.checked.size+'</b> · <span class="ch">≈ '+fmtN(selChars())+' знаков</span> · адресат прочитает и ответит (один ход) · отметьте реплики галочками</div><input class="live-f" value="'+esc('Прочитай контекст чата от '+from+' и жди команду.')+'"><div class="acts"><span class="btn sm p" data-sel="go">'+(SEL.sw?'Передать и переключиться':'Передать')+'</span><span class="btn sm ghost" data-sel="all">Все</span><span class="btn sm ghost" data-sel="none">Ничего</span><span class="btn sm ghost" data-sel="cancel">Отмена</span></div>';
      const top=box.previousElementSibling&&box.previousElementSibling.classList.contains('cx-top')?box.previousElementSibling:box; top.before(bar); }); }
  document.addEventListener('click',async e=>{ const ck=e.target.closest('[data-ck]'); if(ck&&SEL){ const i=+ck.dataset.ck; if(ck.checked) SEL.checked.add(i); else SEL.checked.delete(i); document.querySelectorAll('.live-selbar .n').forEach(n=>n.textContent=SEL.checked.size); document.querySelectorAll('.live-selbar .ch').forEach(x=>x.textContent='≈ '+fmtN(selChars())+' знаков'); return; }
    const sb=e.target.closest('[data-sel]'); if(!sb||!SEL) return; const k=sb.dataset.sel;
    if(k==='cancel'){ SEL=null; render(); return; }
    if(k==='all'||k==='none'){ SEL.checked=new Set(k==='all'?S.chat.map((m,i)=>i).filter(i=>S.chat[i].role==='me'||S.chat[i].src==='live'):[]); render(); return; }
    if(k==='go'){ const to=SEL.to, bar=sb.closest('.live-selbar'), prompt=(bar.querySelector('input').value||'').trim(); const picked=[...SEL.checked].sort((a,b)=>a-b).map(i=>S.chat[i]); if(!picked.length){ toast('Ничего не выбрано'); return; }
      const body=picked.map(m=>(m.role==='me'?'Владелец':(m.who||'Ответ'))+': '+plain(m)).join('\n\n'); const text=(prompt?prompt+'\n\n':'')+'--- контекст чата ---\n'+body;
      const names=(H.panes||[]).filter(p=>to.includes(p.id)).map(paneName).join(', '); let r=null; try{ r=await api('/api/handoff',{to,text,kind:'note',from:H.pane?H.pane.id:'room'}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
      const sw=SEL.sw; SEL=null;
      if(sw){ invalidateBinding(); S.ui.pane=to[0]; save(); pickPane(); hStatus(); if(window.CX) CX.render(); await loadChat(); log('чат','Контекст передан: '+names+' · '+picked.length+' реплик'); toast('Контекст передан: '+esc(names)+' · '+picked.length+' реплик · запись №'+r.seq+' — собеседник переключён'); }
      else { noteHandoff(r); log('чат','Контекст передан: '+names+' · '+picked.length+' реплик'); toast('Контекст передан: '+esc(names)+' · '+picked.length+' реплик · запись №'+r.seq+' — вы остались в этом чате'); } } });
  // меню действий под ответом: роли и папки — настоящие вызовы харнесса
  function closeLAMenus(){ document.querySelectorAll('.live-menu.la').forEach(m=>m.__close?m.__close():m.remove()); }
  function dismissLAMenu(m){ const close=()=>{ m.remove(); document.removeEventListener('click',off,true); document.removeEventListener('keydown',key,true); };
    const off=e=>{ if(!m.contains(e.target)) close(); },key=e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    m.__close=close; document.addEventListener('keydown',key,true); setTimeout(()=>{ if(m.isConnected) document.addEventListener('click',off,true); },0); return close; }
  function laMenu(anchor,title,items,onPick){ closeLAMenus(); const m=document.createElement('div'); m.className='live-menu la'; anchor.style.position='relative';
    m.innerHTML='<div class="h">'+title+'</div>'+(items.length?items.map((it,i)=>'<div data-k="'+i+'"'+(it.dis?' class="dis"':'')+'>'+it.t+(it.r?' <small>'+it.r+'</small>':'')+'</div>').join(''):'<div class="dis">нечего предложить</div>'); anchor.appendChild(m);
    const close=dismissLAMenu(m); m.addEventListener('click',e=>{ const d=e.target.closest('[data-k]'); if(!d||d.classList.contains('dis')) return; close(); onPick(items[+d.dataset.k]); }); }
  function laPath(anchor,title,def,onOk,btn){ closeLAMenus(); const m=document.createElement('div'); m.className='live-menu la'; anchor.style.position='relative';
    m.innerHTML='<div class="h">'+title+'</div><input class="live-f" placeholder="/Users/…/имя-проекта" value="'+esc(def||'')+'">'+(window.harnessy&&window.harnessy.pickFolder?'<div data-finder>Выбрать в Finder…</div>':'')+'<div data-ok>'+(btn||'Создать и перейти')+'</div>'; anchor.appendChild(m); const inp=m.querySelector('input'); setTimeout(()=>{ inp.focus(); inp.setSelectionRange(inp.value.length,inp.value.length); },0);
    const fd=m.querySelector('[data-finder]'); if(fd) fd.addEventListener('click',async()=>{ let p=null; try{ p=await window.harnessy.pickFolder({title,message:'Выберите папку или создайте новую кнопкой диалога',defaultPath:(def||'').replace(/\/[^/]*$/,'/')}); }catch(x){} if(p){ inp.value=p; inp.focus(); } });
    const close=dismissLAMenu(m),go=()=>{ const v=inp.value.trim(); if(!v) return; close(); onOk(v); }; m.querySelector('[data-ok]').addEventListener('click',go); inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); }); }
  // запись «контекст передан» в текущем чате — то же, что движок записал в чат-источник (владелец остаётся здесь)
  function noteHandoff(r){ const t='контекст передан: '+(r.names||'')+' · запись №'+r.seq; S.chat.push({role:'ai',src:'sys',who:'харнесс · передача',pane:H.pane?H.pane.id:'room',html:'<p>'+esc(t)+'</p>',text:'[от харнесс] '+t,t:now()}); S.chat=S.chat.slice(-40); save(); render(); }
  // меню с несколькими адресатами: галочки и кнопка
  function laMulti(anchor,title,items,okLabel,onPick){ closeLAMenus(); const m=document.createElement('div'); m.className='live-menu la multi'; anchor.style.position='relative'; const sel=new Set();
    const draw=()=>{ m.innerHTML='<div class="h">'+title+'</div>'+(items.length?items.map((it,i)=>'<div data-k="'+i+'" class="'+(sel.has(i)?'on':'')+(it.dis?' dis':'')+'"><i class="ck"></i>'+it.t+(it.r?' <small>'+it.r+'</small>':'')+'</div>').join('')+'<div class="ft"><span class="btn sm p" data-go>'+okLabel+(sel.size?' ('+sel.size+')':'')+'</span><span class="btn sm ghost" data-x>Отмена</span></div>':'<div class="dis">нечего предложить</div>'); };
    draw(); anchor.appendChild(m);
    const close=dismissLAMenu(m); m.addEventListener('click',e=>{ const d=e.target.closest('[data-k]'); if(d&&!d.classList.contains('dis')){ const i=+d.dataset.k; if(sel.has(i)) sel.delete(i); else sel.add(i); draw(); return; } if(e.target.closest('[data-x]')){ close(); return; } if(e.target.closest('[data-go]')){ if(!sel.size){ toast('Отметьте хотя бы один чат'); return; } close(); onPick([...sel].sort((a,b)=>a-b).map(i=>items[i])); } }); }
  document.addEventListener('click',async e=>{ const la=e.target.closest('[data-la]'); if(!la) return; e.stopPropagation(); const m=S.chat[+la.dataset.i]; if(!m) return; const kind=la.dataset.la, anchor=la.closest('.live-acts');
    if(kind==='copy'){ try{ await navigator.clipboard.writeText(m.text||la.closest('.ai').innerText); toast('Скопировано'); }catch(x){ toast('Не удалось скопировать'); } return; }
    if(!H.on) { toast('Харнесс не подключён'); return; }
    if(kind==='handoff-none'){ toast('В команде пока один собеседник — сначала назначьте роль'); return; }
    if(kind==='assign'){ const nf=H.noProject||!!(S.cx&&S.cx.noFolder); const taken=nf?[]:(H.panes||[]).filter(p=>p.id!=='room'); const items=(H.roleCatalog||[]).map(r=>{ const n=taken.filter(p=>p.role===r.role).length; const busy=n>0&&!r.multi, off=r.available===false; return {t:esc(r.label)+(n>0&&r.multi?' '+(n+1):''),r:off?esc(r.reason||'сначала оркестратор'):busy?'занята · передайте контекст':(n?'ещё одно место':(H.noProject?'создаст проект по разговору':'свободна')),dis:busy||off,role:r.role}; });
      laMenu(anchor,'назначить роль разговору',items,async it=>{invalidateBinding();let r=null; try{ r=await api('/api/assign',{role:it.role}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
        const pn=(r.project||'').split('/').pop(); if(r.created){ if(S.cx) S.cx.noFolder=false; S.chat.forEach(x=>{ if(x.pane==='room') x.nf=false; }); H.projects=null; }
        S.ui.pane=r.pane.id; save(); await refreshStatus(); await loadChat(); log('настройка',(r.created?'Проект создан по разговору: '+pn+' · ':'')+'Роль назначена: '+r.pane.label+' · '+r.pane.model); toast(r.created?'Проект «'+esc(pn)+'» создан по разговору — оркестратор отвечает':'Роль назначена: '+esc(r.pane.label)+' — разговор продолжается от её имени'); }); return; }
    if(kind==='handoff'){ const me=H.pane?H.pane.id:'room'; const items=(H.panes||[]).filter(p=>p.id!=='room'&&p.id!==me).map(p=>({t:esc(paneName(p)),r:esc(modelName(p.model))+(p.busy?' · отвечает':''),id:p.id}));
      // правило — в движке: один ответ → уходит целиком сразу; два и больше → 409 needSelection → плашка выбора, владелец остаётся здесь
      laMulti(anchor,'передать контекст в чат · адресат прочитает и ответит (один ход модели)',items,'Передать',async picked=>{ const ids=picked.map(x=>x.id), names=picked.map(x=>x.t).join(', '); let r=null; try{ r=await api('/api/handoff',{to:ids,from:me,kind:'note'}); }catch(x){}
        if(r&&r.needSelection){ selStart(ids,{sw:false}); toast('В чате '+r.answers+' ответа(ов) — отметьте, что передать, и поправьте промпт'); return; }
        if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
        noteHandoff(r); log('чат','Контекст передан: '+names); toast('Контекст передан: '+names+' · запись №'+r.seq+' — вы остались в этом чате'); }); return; }
    // новые проекты — в корень проектов движка, не рядом с текущим (урок 08.10: проект лёг внутрь репозитория harnessy)
    if(kind==='mkdir'){ const def=(H.projectsRoot?H.projectsRoot+'/':(H.project||'').replace(/\/[^/]*$/,'/'))+'novyi-proekt'; laPath(anchor,'создать проект и git',def,async path=>{invalidateBinding();let r=null; try{ r=await api('/api/room/move',{path,create:true,git:true}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
        if(S.cx) S.cx.noFolder=false; S.ui.pane='room'; save(); await refreshStatus(); S.chat.forEach(x=>{ if(x.pane==='room') x.nf=false; }); save(); render(); log('настройка','Разговор переехал в новый проект '+path.split('/').pop()); toast('Проект создан (git, память, оркестратор), разговор переехал: '+esc(path.split('/').pop())+(r.carried?' · прежний разговор уйдёт следующим сообщением':'')); }); return; }
    if(kind==='move'){ let pr=null; try{ pr=await api('/api/projects'); }catch(x){} const items=((pr&&pr.projects)||[]).map(p=>({t:esc(p.name),r:(p.seats==null?'? ролей':rolesN(p.seats))+(p.git?' · git':''),path:p.path}));
      laMenu(anchor,'перейти с разговором в проект',items,async it=>{invalidateBinding();let r=null; try{ r=await api('/api/room/move',{path:it.path}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
        if(S.cx) S.cx.noFolder=false; S.ui.pane='room'; save(); await refreshStatus(); S.chat.forEach(x=>{ if(x.pane==='room') x.nf=false; }); save(); render(); log('настройка','Разговор переехал в проект '+it.t); toast('Разговор переехал: '+it.t+(r.carried?' · прежний разговор уйдёт следующим сообщением':'')); }); return; } });
  function reply(q,binding=sendBinding()){ if(H.on&&!H.pane){ cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg"><span class="orb"></span><div><div class="thought">без роли · модель не выбрана</div><p>Выберите модель в строке ввода — тогда отправлю.</p></div></div>')); scrollEnd(); S.draft=q; save(); return; }
    if(H.on&&H.pane) return ask(q,binding); cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg live-typing"><span class="orb"></span><div><div class="thought">думает…</div></div></div>')); scrollEnd();
    setTimeout(()=>{ S.chat.push({role:'ai',html:answer(q),t:now()}); S.chat=S.chat.slice(-40); save(); render(); },850); }
  async function onSend(v,ta,binding=sendBinding()){S.draft=ta&&ta.value||v;save();if(H.on&&(!await settingsReady(binding)||!bindingCurrent(binding))){if(leftPage)return false;S.draft=ta&&ta.value||v;save();toast('Настройка или разговор изменились; сообщение осталось в черновике');return false; }
    if(H.on&&!(H.panes||[]).some(p=>p.id===binding.pane&&p.model)){S.draft=ta&&ta.value||v;save();toast('Сначала выберите модель разговора');return false}
    if(ta&&ta.value.trim()!==v){S.draft=ta.value;save();return false} if(ta){ta.value='';ta.style.height=''} log('чат','Вопрос: '+v.slice(0,90));
    if(!cols().length){ S.pending={text:v,t:now(),target:binding}; save(); location.href='01-chat.html'; return true; }
    S.draft=null;S.chat.push({role:'me',text:v,t:now()}); save(); render(); return reply(v,binding); }
  function composer(){ document.querySelectorAll('.box').forEach(box=>{ const inEl=box.querySelector(':scope > .in'); if(!inEl||inEl.querySelector('textarea')) return;
      const ta=document.createElement('textarea'); ta.className='live-in'; ta.rows=PAGE==='new'?2:1; ta.placeholder=PAGE==='new'?'Спросите или поручите: «что сейчас делает команда?», «покажи расход», «что с планом»':(inEl.textContent.trim()||'Написать…'); inEl.textContent=''; inEl.appendChild(ta);
      let sending=false;const send=async()=>{if(sending)return;const v=ta.value.trim();if(!v){ta.focus();return}sending=true;try{await onSend(v,ta)}finally{sending=false}};
      ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } });
      ta.addEventListener('input',()=>{ ta.style.height='auto'; ta.style.height=Math.min(160,ta.scrollHeight)+'px'; });
      const go=box.querySelector('.go'); if(go){ go.style.cursor='pointer'; go.title='Отправить'; go.addEventListener('click',send); }
      box.__cx={ta,send};   // строку (папка · роль · режимы / ＋ · права · модель · усилие · ⓘ) строит cx.js по варианту C′; клавиши — в ⓘ
      if(PAGE==='new'){ const st=box.closest('.main')&&box.closest('.main').querySelector('.starts'); if(st) ta.addEventListener('input',()=>st.classList.toggle('live-hidden',!!ta.value.trim())); } });   // п.2: быстрые старты уступают место тексту
    if(S.draft&&cols().length){ document.querySelectorAll('.live-in').forEach(ta=>ta.value=S.draft); S.draft=null; save(); const f=document.querySelector('.frame.cur .live-in'); if(f) setTimeout(()=>{ f.focus(); f.setSelectionRange(f.value.length,f.value.length); },60); }
    document.querySelectorAll('.starts .st').forEach(s=>{ s.style.cursor='pointer'; s.addEventListener('click',()=>{ const ta=document.querySelector('.frame.cur .live-in')||document.querySelector('.live-in'); const b=s.querySelector('b'); if(ta&&b){ ta.value=b.textContent.trim(); ta.focus(); } }); });
    if(PAGE==='new'&&S.first){ document.querySelectorAll('.box .bar2').forEach(bar=>{ const ch=bar.querySelectorAll('.chip'), setT=(c,x)=>{ if(!c) return; const tn=[...c.childNodes].find(n=>n.nodeType===3&&n.textContent.trim()); if(tn) tn.textContent=x; }; setT(ch[0],S.first.place); setT(ch[1],S.first.model+' · усилие среднее'); }); }
    document.querySelectorAll('.recent .chip').forEach(c=>{ c.style.cursor='pointer'; c.addEventListener('click',()=>location.href='01-chat.html'); }); }
  document.addEventListener('click',e=>{ if(e.target.closest('[data-clear]')){ S.chat=[]; save(); render(); toast('Разговор очищен'); } });

  // ── поиск ⌘K: экраны, открытые решения, действия
  const SCREENS=[['Новый чат','10-new-chat.html'],['Сейчас · чей ход и решения','14-now.html'],['Чат','01-chat.html'],['План · карта','02-plan.html'],['Документ стадии','17-doc.html'],['Артефакты','15-artifacts.html'],['Память проекта','16-memory.html'],['Ресёрч','12-research.html'],['Стая агентов','04-swarm.html'],['Датчики','13-sensors.html'],['Расход','05-spend.html'],['Подключения и лимиты','11-connections.html'],['Журнал','21-journal.html'],['Настройки','06-settings.html'],['Уйти','18-overlays.html#leave'],['Первый запуск','19-first-run.html'],['Вход','20-login-pour.html'],['Дизайн-код','../disarto/00-design-code.html']];
  let pal,palSel=0,palItems=[];
  function palList(q){ q=q.trim().toLowerCase(); const it=SCREENS.map(x=>({t:x[0],k:'экран',go:()=>location.href=x[1]}))
      .concat(waiting().map(d=>({t:DEC[d],k:'ждёт вас',go:()=>location.href='14-now.html'})))
      .concat([{t:'Сбросить прототип к началу',k:'действие',go:reset},{t:'Очистить разговор',k:'действие',go:()=>{ S.chat=[]; save(); render(); closePal(); toast('Разговор очищен'); }}]);
    palItems=q?it.filter(x=>x.t.toLowerCase().includes(q)||x.k.includes(q)):it; palSel=0;
    pal.querySelector('.lp-list').innerHTML=palItems.slice(0,12).map((x,i)=>'<div class="lp-i'+(i===0?' on':'')+'" data-i="'+i+'">'+esc(x.t)+'<small>'+x.k+'</small></div>').join('')||'<div class="lp-i">Ничего не найдено</div>'; }
  function openPal(){ if(!pal){ pal=document.createElement('div'); pal.className='live-pal'; pal.innerHTML='<div class="lp-box"><input placeholder="Найти экран, решение или действие…" aria-label="Поиск"><div class="lp-list"></div><div class="lp-foot">↑ ↓ выбрать · ⏎ открыть · esc закрыть</div></div>'; document.body.appendChild(pal);
      const inp=pal.querySelector('input'); inp.addEventListener('input',()=>palList(inp.value));
      inp.addEventListener('keydown',e=>{ const n=Math.min(12,palItems.length); if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); palSel=(palSel+(e.key==='ArrowDown'?1:-1)+n)%Math.max(1,n); pal.querySelectorAll('.lp-i').forEach((x,i)=>x.classList.toggle('on',i===palSel)); } else if(e.key==='Enter'&&palItems[palSel]){ palItems[palSel].go(); } });
      pal.addEventListener('click',e=>{ const i=e.target.closest('.lp-i[data-i]'); if(i) palItems[+i.dataset.i].go(); else if(e.target===pal) closePal(); }); }
    document.documentElement.classList.remove('m-open'); pal.classList.add('on'); const inp=pal.querySelector('input'); inp.value=''; palList(''); inp.focus(); }
  function closePal(){ if(pal) pal.classList.remove('on'); }
  addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); e.stopPropagation(); openPal(); } else if(e.key==='Escape') closePal(); },true);
  function wireSearch(){ document.querySelectorAll('aside.side .search').forEach(el=>{ if(el.dataset.live) return; el.dataset.live=1; delete el.dataset.go; el.style.cursor='pointer'; el.addEventListener('click',e=>{ e.stopPropagation(); openPal(); }); });
    const dr=document.querySelector('.m-drawer'); if(dr&&!dr.querySelector('.m-find')){ const a=document.createElement('a'); a.className='m-i m-find'; a.href='#'; a.innerHTML='<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/></svg>Найти…<small style="color:#66666e">⌘K</small>'; a.addEventListener('click',e=>{ e.preventDefault(); openPal(); }); dr.insertBefore(a,dr.children[2]||null); } }
  function reset(){ try{ localStorage.removeItem(KEY); }catch(e){} location.reload(); }

  // ── переключатели и сегменты вне карточек: работают и запоминаются
  const statics=sel=>PAGE==='set'||PAGE==='spend'?[]:[...document.querySelectorAll(sel)].filter(el=>!el.closest('.panel, .live-pal, .m-drawer'));
  function saveUI(){ S.ui[PAGE]={t:statics('.tog').map(t=>t.classList.contains('on')?1:0), s:statics('.seg').filter(s=>!s.querySelector('[data-v]')).map(s=>[...s.children].findIndex(x=>x.classList.contains('on')))}; save(); }
  function restoreUI(){ if(PAGE==='set'||PAGE==='spend') return; const u=S.ui[PAGE]; if(!u) return; statics('.tog').forEach((t,i)=>{ if(u.t&&u.t[i]!==undefined) t.classList.toggle('on',!!u.t[i]); });
    statics('.seg').filter(s=>!s.querySelector('[data-v]')).forEach((s,i)=>{ const k=u.s&&u.s[i]; if(k>=0&&s.children[k]) [...s.children].forEach((x,j)=>x.classList.toggle('on',j===k)); }); }
  let pre=null;
  document.addEventListener('click',e=>{ if(PAGE==='set'||PAGE==='spend') return; const t=e.target.closest('.tog, .seg > span'); pre=(t&&!t.closest('.panel, .live-pal')&&!t.dataset.v)?{el:t,on:t.classList.contains('on')}:null; },true);
  document.addEventListener('click',()=>{ if(!pre) return; const el=pre.el, was=pre.on; pre=null; if(!document.contains(el)) return;
    if(el.matches('.tog')){ if(el.classList.contains('on')===was) el.classList.toggle('on'); }
    else [...el.parentElement.children].forEach(x=>x.classList.toggle('on',x===el));
    saveUI(); const row=el.closest('.opt, .row, .li, .card, .blk'); let name=el.matches('.tog')?'Переключатель':'Выбор';
    if(row){ const c=row.cloneNode(true); c.querySelectorAll('small, .tog, .seg, .btn, .chip, .pill').forEach(x=>x.remove()); name=((c.querySelector('b')||c).textContent.replace(/\s+/g,' ').trim().slice(0,60))||name; }
    log('настройка',name+' → '+(el.matches('.tog')?(el.classList.contains('on')?'включено':'выключено'):el.textContent.trim())); });

  // ══ ПЛАН: состояния задач, фильтр по вкладкам, новая задача ══
  const P=window.PLAN, strip=s=>String(s).replace(/<[^>]+>/g,'');
  if(P&&PAGE==='plan'){
    const ST={plan:['в плане',''],run:['идёт','acc'],review:['на ревью','warn'],done:['готово','ok'],bad:['падает','bad'],wait:['ждёт вас','warn'],hold:['ждёт','']};
    const NEXT={plan:[['Взять в работу','run','p']],hold:[['Взять в работу','run','p']],run:[['Сдать ревьюеру','review','p'],['Вернуть в план','plan','']],bad:[['Перезапустить прогон','run','p'],['Вернуть в план','plan','']],review:[['Принять и влить','done','p'],['Вернуть с замечанием','run','']],done:[['Вернуть в работу','run','']],wait:[]};
    const DUE={run:'в работе',review:'у ревьюера',done:'готово сегодня',plan:'в плане',bad:'падает',hold:'ждёт'};
    const BASE={all:87,bad:3,run:12,wait:2,done:70}, SLOTS=[[420,484],[16,500],[16,194]], T=P.T;
    S.plan=S.plan||{st:{},add:[]};
    const ORIG=Object.keys(T); ORIG.forEach(k=>{ T[k].pill0=T[k].pill.slice(); T[k].due0=T[k].due; });
    const byLabel=l=>Object.keys(ST).find(s=>ST[s][0]===l)||'plan', init0=k=>byLabel(T[k].pill0[0]);
    const stOf=k=>(k==='m0'&&S.dec.m0)?'done':(S.plan.st[k]||init0(k)), inTab=(k,f)=>stOf(k)===f||(f==='run'&&stOf(k)==='review');
    const mk=a=>({pr:a.pr,title:esc(a.title),id:a.id,pill:['в плане',''],pill0:['в плане',''],due:'добавлена вами',due0:'добавлена вами',tags:[esc(a.who),'черновик'],cnt:'0/3',ticks:[0,0,0],acts:[['Открыть договор','']],kv:[['исполнитель',esc(a.who)],['добавлена','сегодня · вами'],['состояние плана','черновик — не утверждён']],health:'- - - - - - - -',hl:'0',steps:[['','—','Добавлена вами, ещё не запускалась','']]});
    let filter='all', curN=null;
    function hydrate(){ S.plan.add.forEach(a=>{ if(!T[a.k]){ T[a.k]=mk(a); P.L[a.k]=[0,0,0,0,0]; } if(!P.order.includes(a.k)) P.order.unshift(a.k); });
      P.order.slice().forEach(k=>{ if(!ORIG.includes(k)&&!S.plan.add.some(a=>a.k===k)){ P.order.splice(P.order.indexOf(k),1); delete T[k]; } }); }
    function apply(){ hydrate();
      P.order.forEach(k=>{ const d=T[k], s=stOf(k), ch=s!==init0(k); d.pill=ch?(k==='m0'?['подписано','ok']:ST[s].slice()):d.pill0.slice(); d.due=ch?(DUE[s]||d.due0):d.due0; });
      const keys=P.order.filter(k=>filter==='all'||inTab(k,filter));
      const cnt=f=>f==='all'?BASE.all+S.plan.add.length:BASE[f]+P.order.filter(k=>inTab(k,f)).length-ORIG.filter(k=>init0(k)===f).length;
      document.querySelectorAll('.tabs [data-f]').forEach(x=>{ x.classList.toggle('on',x.dataset.f===filter); const b=x.querySelector('b'); if(b) b.textContent=cnt(x.dataset.f); });
      const hidden=cnt(filter)-keys.length;
      P.renderList(keys,hidden>0?'и ещё '+hidden+' — в полной карте; в прототипе показаны '+keys.length:(keys.length?'':'в прототипе таких задач нет')); renderTable(keys,hidden>0?'и ещё '+hidden+' — в полной карте; в прототипе показаны '+keys.length:'');
      const map=document.getElementById('map');
      S.plan.add.forEach(a=>{ if(!map||map.querySelector('.node[data-n="'+a.k+'"]')) return; const used=[...map.querySelectorAll('.node')].map(n=>n.style.left+'|'+n.style.top), sl=SLOTS.find(s=>!used.includes(s[0]+'px|'+s[1]+'px')); if(!sl) return;
        const d=T[a.k], n=document.createElement('div'); n.className='node dim'; n.dataset.n=a.k; n.style.left=sl[0]+'px'; n.style.top=sl[1]+'px';
        n.innerHTML='<div class="meta"><span class="pr '+d.pr+'">'+d.pr.toUpperCase()+'</span><span class="pill" style="height:18px">в плане</span><span class="id">'+d.id+'</span></div><div class="t">'+d.title+'</div><div class="prog"><div class="ticks thin"><i></i><i></i><i></i></div><b>0/3</b></div><div class="tags">'+d.tags.map(x=>'<span>'+x+'</span>').join('')+'</div><div class="foot"><span class="due">добавлена вами</span></div>'; map.appendChild(n); });
      document.querySelectorAll('.node[data-n]').forEach(n=>{ const k=n.dataset.n; if(!T[k]){ n.remove(); return; } const d=T[k], s=stOf(k), p=n.querySelector('.meta .pill'), du=n.querySelector('.due');
        if(p){ p.className='pill '+d.pill[1]; p.textContent=d.pill[0]; p.style.height='18px'; } if(du) du.textContent=d.due;
        if(n.dataset.dim0===undefined) n.dataset.dim0=n.classList.contains('dim')?'1':''; n.classList.toggle('dim',s!==init0(k)?(s==='plan'||s==='done'):n.dataset.dim0==='1'); n.classList.toggle('live-off',filter!=='all'&&!keys.includes(k)); }); }
    // режим «таблица»: те же задачи плотной таблицей, сортировка по клику на заголовок
    let sortKey='', sortDir=1, tableOn=false;
    const whoOf=d=>{ const r=(d.kv||[]).find(x=>/исполнитель|просит/.test(x[0])); return r?strip(r[1]).split(' · ')[0]:'—'; }, PRW={h:0,m:1,l:2};
    const tmode=[...document.querySelectorAll('.mode span')].find(s=>/таблица/.test(s.textContent)), tlist=document.getElementById('tlist');
    if(tmode&&tlist){ tmode.dataset.m='table'; tmode.style.opacity=''; tmode.style.cursor='pointer'; const host=document.createElement('div'); host.id='ttable'; host.className='tlist'; host.innerHTML='<div class="lst" id="tt-rows" style="--cols:58px 1.7fr 84px 130px 100px 64px 130px 16px"></div>'; tlist.after(host);
      document.querySelector('.mode').addEventListener('click',e=>{ const s=e.target.closest('[data-m]'); if(!s) return; tableOn=s.dataset.m==='table'; host.classList.toggle('on',tableOn); });
      host.addEventListener('click',e=>{ const h=e.target.closest('[data-sort]'); if(!h) return; e.stopPropagation(); sortDir=sortKey===h.dataset.sort?-sortDir:1; sortKey=h.dataset.sort; apply(); }); }
    function renderTable(keys,note){ const host=document.getElementById('tt-rows'); if(!host) return; const val={id:k=>T[k].id,title:k=>strip(T[k].title).toLowerCase(),pr:k=>PRW[T[k].pr],who:k=>whoOf(T[k]).toLowerCase(),st:k=>T[k].pill[0],steps:k=>{ const c=T[k].cnt.split('/'); return (+c[0]||0)/(+c[1]||1); },due:k=>T[k].due}[sortKey];
      const ks=val?keys.slice().sort((a,b)=>{ const x=val(a), y=val(b); return (x>y?1:x<y?-1:0)*sortDir; }):keys, H=(k,l)=>'<span data-sort="'+k+'" style="cursor:pointer">'+l+(sortKey===k?(sortDir>0?' ↑':' ↓'):'')+'</span>';
      host.innerHTML='<div class="li head">'+H('id','№')+H('title','задача')+H('pr','приоритет')+H('who','исполнитель')+H('st','состояние')+H('steps','шаги')+H('due','срок')+'<span></span></div>'+
        ks.map(k=>{ const d=T[k]; return '<div class="li'+(d.pill[0]==='в плане'||d.pill[0]==='готово'||d.pill[0]==='подписано'?' dim':'')+'" data-n="'+k+'"><span class="m">'+d.id+'</span><div><b>'+d.title+'</b><small>'+d.tags.join(' · ')+'</small></div><span class="m">'+({h:'высокий',m:'средний',l:'низкий'}[d.pr]||'')+'</span><span class="m">'+esc(whoOf(d))+'</span><span><span class="pill '+d.pill[1]+'" style="height:18px">'+d.pill[0]+'</span></span><span class="m">'+d.cnt+'</span><span class="m">'+d.due+'</span><span class="chev">›</span></div>'; }).join('')+(ks.length?'':'<div class="li dim" style="cursor:default"><div><small>в прототипе таких задач нет</small></div></div>')+(note?'<div class="li dim" style="cursor:default"><span></span><div><small>'+note+'</small></div></div>':''); }
    hooks.push(apply);
    const tabs=document.querySelector('.tabs'); if(tabs) tabs.addEventListener('click',e=>{ const x=e.target.closest('[data-f]'); if(x){ filter=x.dataset.f; if(window.HX) HX.close(); apply(); } });
    // карточка задачи: блок «состояние задачи» с действиями
    document.addEventListener('click',e=>{ const el=e.target.closest('.node[data-n], .li[data-n]'); if(!el||!T[el.dataset.n]) return; curN=el.dataset.n;
      const inner=document.querySelector('.ovl.on .panel .inner'); if(!inner||inner.querySelector('.live-plan')) return; const s=stOf(curN), A=NEXT[s]||[];
      inner.insertAdjacentHTML('beforeend','<div class="blk live-plan" style="margin-top:12px"><div class="t"><span>состояние задачи</span><span>'+(curN==='m0'&&S.dec.m0?'подписано':ST[s][0])+'</span></div><div class="acts" style="margin-top:0">'+(A.map(a=>'<span class="btn sm '+a[2]+'" data-pst="'+a[1]+'">'+a[0]+'</span>').join('')||'<span class="mono">решается в блоке «нужно ваше решение»</span>')+(S.plan.add.some(a=>a.k===curN)?'<span class="btn sm ghost" data-pdel>Убрать из плана</span>':'')+'</div></div>'); });
    document.addEventListener('click',e=>{ const b=e.target.closest('[data-pst], [data-pdel], .panel .decide .btn, .panel .psub .btn'); if(!b||!curN||!T[curN]) return; const k=curN, lab=b.textContent.trim();
      if(b.dataset.pst){ const prev=S.plan.st[k], to=b.dataset.pst; S.plan.st[k]=to; save(); log('план',T[k].id+' «'+strip(T[k].title)+'» → '+ST[to][0]); HX.close(); apply();
        toast(T[k].id+': <b>'+ST[to][0]+'</b>',()=>{ if(prev) S.plan.st[k]=prev; else delete S.plan.st[k]; save(); log('план','Отменено: '+T[k].id); apply(); }); }
      else if(b.hasAttribute('data-pdel')){ S.plan.add=S.plan.add.filter(a=>a.k!==k); delete S.plan.st[k]; save(); log('план','Убрана из плана: '+T[k].id); HX.close(); apply(); toast('Задача убрана из плана'); }
      else if(b.closest('.decide')){ const d=k==='m0'?'m0':k==='d84e'?'limit':null; if(d) resolve(d,lab); }
      else if(/^Написать/.test(lab)){ S.draft='@'+lab.replace(/^Написать\s*/,'').replace(/у$/,'')+' · по задаче '+T[k].id+': '; save(); location.href='01-chat.html'; } },true);
    // «+ задача»
    const addBtn=[...document.querySelectorAll('.top .r .btn')].find(b=>/задача/.test(b.textContent));
    if(addBtn){ addBtn.style.cursor='pointer'; addBtn.addEventListener('click',()=>{ curN=null; HX.open(addBtn,'<div class="from">добавить в план · черновик</div><div class="ch"><h3>Новая задача</h3></div><div class="csub">Попадёт в план черновиком: воркеры её не увидят, пока план не утверждён.</div>'+
        '<input class="live-f" id="pt-title" placeholder="Что нужно сделать" maxlength="90">'+
        HX.blk('приоритет','<span class="seg" id="pt-pr"><span data-pick data-val="h">высокий</span><span class="on" data-pick data-val="m">средний</span><span data-pick data-val="l">низкий</span></span>')+
        HX.blk('исполнитель','<label class="pick on" data-pick data-val="не назначен">Не назначен<small>назначит оркестратор при утверждении</small></label><label class="pick" data-pick data-val="воркер 1">Воркер 1<small>Opus 5.5 · занят H1.5 до 18:40</small></label><label class="pick" data-pick data-val="воркер 2">Воркер 2<small>Sonnet 5.5 · занят D8.4e</small></label><label class="pick" data-pick data-val="Devin">Devin<small>нет связи 9 минут</small></label>')+
        '<div class="ft"><span class="btn ghost" data-close style="cursor:pointer">Отмена</span><span class="btn p" data-padd style="margin-left:auto;cursor:pointer">Добавить в план</span></div>',{w:560,h:570,hide:false});
        setTimeout(()=>{ const i=document.getElementById('pt-title'); if(i){ i.focus(); i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const b=document.querySelector('[data-padd]'); if(b) b.click(); } }); } },380); }); }
    document.addEventListener('click',e=>{ if(!e.target.closest('[data-padd]')) return; const inp=document.getElementById('pt-title'), title=(inp&&inp.value||'').trim(); if(!title){ if(inp){ inp.classList.add('err'); inp.focus(); } return; }
      const pr=(document.querySelector('#pt-pr .on')||{dataset:{val:'m'}}).dataset.val, who=(document.querySelector('.panel .pick.on')||{dataset:{val:'не назначен'}}).dataset.val;
      S.seq=(S.seq||0)+1; const a={k:'n'+S.seq,title,pr,who,id:'T'+(48+S.seq)}; S.plan.add.push(a); save(); log('план','Добавлена задача '+a.id+': '+title.slice(0,70)); HX.close(); filter='all'; apply();
      toast('В план добавлена <b>'+a.id+'</b>',()=>{ S.plan.add=S.plan.add.filter(x=>x.k!==a.k); save(); log('план','Отменено добавление '+a.id); apply(); }); });
  }

  // ══ СТАЯ: пауза, смена модели, «написать», добавить и освободить место ══
  if(PAGE==='swarm'){
    S.swarm=S.swarm||{a:{},add:[]};
    const MODELS=['Opus 5.5','Sonnet 5.5','Astra (Codex)','Qwen 3 Coder','Kimi K2.5'], SLOT=[[780,430],[420,500],[76,340]], ROLES={'Воркер':2,'Ревьюер':1,'Ресёрчер':1,'Хранитель':1,'Тестер':0};
    const KEYS=[...new Set([...document.querySelectorAll('.seat[data-a]')].map(s=>s.dataset.a))];
    const q=(k,c)=>document.querySelector('.'+c+'[data-a="'+k+'"]'), keep=(el,key,val)=>{ if(el&&el.dataset[key]===undefined) el.dataset[key]=val; };
    const nameOf=k=>((q(k,'seat')||q(k,'win')||document).querySelector('.h b')||{}).textContent||k;
    const A=k=>S.swarm.a[k]||(S.swarm.a[k]={});
    let curA=null, curSeat=null, orig=null;
    function stOf(k){ const a=S.swarm.a[k]||{}; if(a.free) return 'free'; if(a.paused) return 'paused'; if(k==='w2'&&S.dec.limit&&/ждать/i.test(S.dec.limit.result)) return 'paused'; if(k==='rev') return S.dec.m0?'run':'need'; const s=q(k,'seat'); return s&&s.dataset.o0==='idle'?'free':'run'; }
    const orb=(k,st,o0)=>'o '+(st==='paused'||st==='free'?'idle':st==='need'?'need':(k==='rev'?'done':o0));
    function apply(){
      KEYS.forEach(k=>{ const seat=q(k,'seat'), win=q(k,'win'), a=S.swarm.a[k]||{};
        if(seat){ const o=seat.querySelector('.h .o'), t=seat.querySelector('.f .t'), md=seat.querySelector('.md'); keep(seat,'o0',[...o.classList].find(c=>c!=='o')||''); keep(seat,'t0',t?t.innerHTML:''); keep(seat,'md0',md?md.textContent:''); }
        if(win){ const o=win.querySelector('.h .o'), msg=win.querySelector('.msg'), role=win.querySelector('.role'); keep(win,'o0',[...o.classList].find(c=>c!=='o')||''); keep(win,'msg0',msg?msg.innerHTML:''); keep(win,'role0',role?role.textContent:''); }
        const st=stOf(k), signed=k==='rev'&&S.dec.m0, onSonnet=k==='w2'&&S.dec.limit&&/sonnet/i.test(S.dec.limit.result);
        if(seat){ const o=seat.querySelector('.h .o'), t=seat.querySelector('.f .t'), md=seat.querySelector('.md'); o.className=orb(k,st,seat.dataset.o0);
          if(t){ t.innerHTML=st==='paused'?'на паузе':st==='free'?'свободно':signed?'подпись получена':seat.dataset.t0; t.classList.toggle('hot',st==='need'); }
          seat.classList.toggle('need',st==='need'); if(md) md.textContent=a.model?a.model+' · сменена вами':onSonnet?'Sonnet 5.5 · до сброса Codex':seat.dataset.md0; }
        if(win){ const o=win.querySelector('.h .o'), msg=win.querySelector('.msg'), role=win.querySelector('.role'); o.className=orb(k,st,win.dataset.o0);
          if(msg) msg.innerHTML=st==='paused'?'На паузе'+(a.at?' с '+hhmm(a.at):'')+'. Место держит задачу и контекст; продолжит по вашей команде.':st==='free'?'Место свободно: задача снята, модель и права сохранены.':signed?'Подпись M0 получена — D8.4d уходит в слияние.':win.dataset.msg0;
          if(role) role.textContent=a.model?win.dataset.role0.split(' · ')[0]+' · '+a.model.split(' ')[0].toLowerCase():win.dataset.role0; }
        const li=document.querySelector('.li[data-seat="'+k+'"]'); if(li){ const m=li.querySelector('.m'); if(m){ keep(li,'m0',m.textContent); keep(li,'hot0',m.classList.contains('hot')?'1':''); m.textContent=st==='paused'?'на паузе':st==='free'?'свободно':li.dataset.m0; m.classList.toggle('hot',st!=='paused'&&st!=='free'&&li.dataset.hot0==='1'); } } });
      // добавленные места
      document.querySelectorAll('[data-live-a]').forEach(x=>x.remove());
      S.swarm.add.forEach((a,i)=>{ const h='<div class="h"><span class="o idle"></span><b>'+esc(a.name)+'</b><span class="role">'+esc(a.role.toLowerCase())+'</span></div>', board=document.getElementById('board'), over=document.querySelector('#v-cards .over'), lst=document.querySelector('#v-seats .lst');
        if(board&&SLOT[i]){ const s=document.createElement('div'); s.className='seat'; s.dataset.liveA=a.k; s.style.left=SLOT[i][0]+'px'; s.style.top=SLOT[i][1]+'px'; s.innerHTML=h+'<div class="md">'+esc(a.model)+'</div><div class="f"><span>нет задачи</span><span class="t">свободно</span></div>'; board.appendChild(s); }
        if(over){ const w=document.createElement('div'); w.className='win'; w.dataset.liveA=a.k; w.innerHTML=h+'<div class="msg">Место добавлено вами в '+hhmm(a.at)+'. Задачи нет: дайте её из плана или из чата.</div><div class="f">свободно</div>'; over.appendChild(w); }
        if(lst){ const li=document.createElement('div'); li.className='li'; li.dataset.liveA=a.k; li.innerHTML='<span><b>'+esc(a.name)+'</b></span><div>'+esc(a.model)+'<small>добавлено вами</small></div><span>права роли «'+esc(a.role.toLowerCase())+'» · push запрещён</span><span class="m">свободно</span><span class="chev">›</span>'; lst.appendChild(li); } });
      // счётчики
      const all=KEYS.map(stOf).concat(S.swarm.add.map(()=>'free')), n=s=>all.filter(x=>x===s).length, run=n('run'), need=n('need'), free=n('free'), paused=n('paused');
      const stripEl=document.querySelector('.strip'); if(stripEl){ const b=stripEl.querySelectorAll('span:not(.live-p) b'); [run,need,free].forEach((v,i)=>{ if(b[i]) b[i].textContent=v; }); let p=stripEl.querySelector('.live-p'); if(!p){ p=document.createElement('span'); p.className='live-p'; stripEl.insertBefore(p,stripEl.children[3]||null); } p.innerHTML='<b>'+paused+'</b> на паузе'; p.style.display=paused?'':'none'; }
      const sum=document.querySelector('#v-cards .sum'); if(sum){ const b=sum.querySelectorAll('span b'); [all.length,run,need,free].forEach((v,i)=>{ if(b[i]) b[i].textContent=v; }); }
      const top=document.getElementById('topst'), v=(document.querySelector('#seg .on')||{dataset:{}}).dataset.v; if(top&&(v==='board'||v==='cards')) top.innerHTML='<i></i>'+all.length+' мест · '+run+' работают'+(need?' · '+need+' '+plural(need)+' вас':'')+(paused?' · '+paused+' на паузе':'');
      // блок «кто кого ждёт»: решённое гаснет
      document.querySelectorAll('.waits .w').forEach((r,i)=>{ const d=['m0','limit'][i]; if(!d) return; r.style.opacity=S.dec[d]?'.35':''; r.title=S.dec[d]?'решено: '+S.dec[d].result:''; });
      sheet(); }
    // раскрытая карточка агента: состояние, подпись кнопки паузы, модель
    function sheet(){ const ov=document.getElementById('ovl'); if(!ov||!ov.classList.contains('on')||!curA||!orig) return; const a=S.swarm.a[curA]||{}, st=stOf(curA), pill=document.getElementById('a-pill'), sub=document.getElementById('a-sub'), btn=ov.querySelector('.head2 .r .btn');
      if(pill){ const v=st==='paused'?['на паузе','']:st==='free'?['свободно','']:(curA==='rev'&&S.dec.m0)?['подпись получена','ok']:[orig.t,orig.c]; pill.textContent=v[0]; pill.className=v[1].indexOf('pill')===0?v[1]:'pill '+v[1]; }
      if(btn){ btn.textContent=st==='paused'?'▶ Продолжить':'⏸ Пауза'; btn.style.display=st==='free'?'none':''; }
      if(sub){ if(a.model){ const p=orig.sub.split(' · '); p[1]=a.model.toLowerCase(); sub.textContent=p.join(' · '); } else sub.textContent=orig.sub; } }
    hooks.push(apply);
    document.addEventListener('click',e=>{ const el=e.target.closest('.seat[data-a], .win[data-a]'); if(el){ curA=el.dataset.a; const pill=document.getElementById('a-pill'), sub=document.getElementById('a-sub'); orig={t:pill?pill.textContent:'',c:pill?pill.className:'',sub:sub?sub.textContent:''}; document.querySelectorAll('.live-menu').forEach(x=>x.remove()); sheet(); }
      const sl=e.target.closest('.li[data-seat]'); if(sl) curSeat=sl.dataset.seat;
      const seg=e.target.closest('#seg [data-v]'); if(seg) setTimeout(apply,0);
      const la=e.target.closest('[data-live-a]'); if(la&&window.HX){ const a=S.swarm.add.find(x=>x.k===la.dataset.liveA); if(a) HX.open(la,'<div class="from">раскрытая карточка · место · добавлено вами</div><div class="ch"><h3>'+esc(a.name)+'</h3><span class="pill">свободно</span></div><div class="csub">'+esc(a.role.toLowerCase())+' · '+esc(a.model)+' · добавлено в '+hhmm(a.at)+'</div>'+HX.blk('что дальше','<p>У места есть роль, модель и права, но нет задачи. Дайте задачу из плана или напишите в чат — оркестратор назначит.</p>')+HX.acts([['Дать задачу из плана','p','data-lgo="02-plan.html"'],['Написать','','data-lwrite="'+esc(a.name)+'"'],['Освободить место','ghost','data-ldel="'+a.k+'"']]),{w:600,h:380}); } });
    document.addEventListener('click',e=>{ const hb=e.target.closest('#ovl .head2 .r .btn'), mi=e.target.closest('.live-menu [data-model]'), sb=e.target.closest('.panel .acts .btn'), go=e.target.closest('[data-lgo]'), wr=e.target.closest('[data-lwrite]'), del=e.target.closest('[data-ldel]'), sign=e.target.closest('.panel [data-step="3"] .btn.p'), to3=e.target.closest('.panel [data-go="3"]');
      if(go){ location.href=go.dataset.lgo; return; }
      if(wr){ S.draft='@'+wr.dataset.lwrite+': '; save(); location.href='01-chat.html'; return; }
      if(del){ const a=S.swarm.add.find(x=>x.k===del.dataset.ldel); S.swarm.add=S.swarm.add.filter(x=>x.k!==del.dataset.ldel); save(); if(a) log('стая','Место освобождено: '+a.name); HX.close(); apply(); toast('Место освобождено'); return; }
      if(mi&&curA){ const k=curA, a=A(k), prev=a.model, m=mi.dataset.model; a.model=m; save(); log('стая',nameOf(k)+': модель → '+m); document.querySelectorAll('.live-menu').forEach(x=>x.remove()); apply(); if(k==='w2'&&!S.dec.limit) resolve('limit','Модель сменена на '+m); else toast(nameOf(k)+': модель <b>'+esc(m)+'</b>',()=>{ a.model=prev; save(); log('стая','Отменена смена модели: '+nameOf(k)); apply(); }); return; }
      if(hb&&curA){ const k=curA, a=A(k), i=[...hb.parentElement.querySelectorAll('.btn')].indexOf(hb), name=nameOf(k);
        if(i===0){ a.paused=!a.paused; a.at=now(); save(); log('стая',name+(a.paused?': пауза':': продолжает')); apply(); toast(name+(a.paused?' на паузе':' продолжает'),()=>{ a.paused=!a.paused; save(); log('стая','Отменено: '+name); apply(); }); }
        else if(i===1){ const open=hb.parentElement.querySelector('.live-menu'); document.querySelectorAll('.live-menu').forEach(x=>x.remove()); if(!open){ const m=document.createElement('div'); m.className='live-menu'; m.innerHTML=MODELS.map(x=>'<div data-model="'+x+'">'+x+'</div>').join(''); hb.parentElement.style.position='relative'; hb.parentElement.appendChild(m); } }
        else { S.draft='@'+name+': '; save(); location.href='01-chat.html'; } return; }
      if(sb&&curSeat&&/Освободить место/.test(sb.textContent)){ const k=curSeat, a=A(k), name=nameOf(k); a.free=!a.free; save(); log('стая',name+(a.free?': место освобождено':': место занято снова')); HX.close(); apply(); toast(name+(a.free?': место освобождено':': возвращён'),()=>{ a.free=!a.free; save(); apply(); }); return; }
      if(sb&&curSeat&&/Сменить модель/.test(sb.textContent)){ toast('Модель меняется в карточке агента — вид «Стая» или «Карточки»'); return; }
      const pk=role=>{ const p=document.querySelector('.panel [data-step="'+role+'"] .pick.on'); return p?p.childNodes[0].textContent.trim():''; };
      if(to3){ const b=document.querySelector('.panel [data-step="3"] .kv b'), role=pk(1), n=(ROLES[role]||0)+S.swarm.add.filter(x=>x.role===role).length+1; if(b) b.textContent=role+' '+n+' · '+pk(2); const bs=document.querySelectorAll('.panel [data-step="3"] .kv b'); if(bs[3]) bs[3].textContent=(KEYS.length+S.swarm.add.length)+' → '+(KEYS.length+S.swarm.add.length+1)+' мест'; return; }
      if(sign&&/Подписать состав/.test(sign.textContent)){ const role=pk(1)||'Воркер', model=pk(2)||'Sonnet 5.5', n=(ROLES[role]||0)+S.swarm.add.filter(x=>x.role===role).length+1; S.seq=(S.seq||0)+1; const a={k:'s'+S.seq,role,model,name:role+' '+n,at:now()}; S.swarm.add.push(a); save(); log('стая','Добавлено место: '+a.name+' · '+model); apply();
        toast('Добавлено место <b>'+esc(a.name)+'</b>',()=>{ S.swarm.add=S.swarm.add.filter(x=>x.k!==a.k); save(); log('стая','Отменено добавление: '+a.name); apply(); }); } },true);
  }

  // ══ ПАМЯТЬ: новое правило, изменить, сузить область, отозвать, разобрать спор, фильтр по области ══
  const MEM=window.MEM;
  if(MEM&&PAGE==='mem'){
    S.mem=S.mem||{rev:{},scope:{},text:{},ok:{},add:[]};
    const R=MEM.R, R0=JSON.parse(JSON.stringify(R)), ORD0=MEM.order.slice(), NARROW={'везде':'проект OMG','проект OMG':'этот разговор'}, SC=['все','везде','проект OMG','этот разговор'];
    let filter='все', curR=null;
    const disputed=k=>R0[k]&&R0[k][3]==='спор'&&!S.mem.ok[k]&&!S.mem.rev[k];
    function build(){ Object.keys(R).forEach(k=>{ delete R[k]; }); Object.keys(R0).forEach(k=>{ R[k]=R0[k].slice(); });
      S.mem.add.forEach(a=>{ R[a.k]=[esc(a.text),a.scope,'вы · сегодня','✓',esc(a.text),'Добавлено вами в прототипе.','все роли']; });
      Object.keys(R).forEach(k=>{ const r=R[k]; if(S.mem.text[k]){ r[0]=esc(S.mem.text[k]); r[4]=esc(S.mem.text[k]); } if(S.mem.scope[k]) r[1]=S.mem.scope[k]; if(S.mem.rev[k]) r[3]='отозвано'; else if(R0[k]&&R0[k][3]==='спор'&&S.mem.ok[k]) r[3]='✓'; });
      MEM.order.length=0; S.mem.add.slice().reverse().forEach(a=>MEM.order.push(a.k)); ORD0.forEach(k=>MEM.order.push(k)); }
    function apply(){ build(); const act=MEM.order.filter(k=>!S.mem.rev[k]), dis=MEM.order.filter(disputed), cnt=s=>s==='все'?act.length:act.filter(k=>R[k][1]===s).length;
      MEM.render(MEM.order.filter(k=>filter==='все'||R[k][1]===filter));
      document.querySelectorAll('#rows .li[data-r]').forEach(li=>li.classList.toggle('dim',!!S.mem.rev[li.dataset.r]));
      document.querySelectorAll('#v-rules .filters .chip').forEach((c,i)=>{ if(!SC[i]) return; c.dataset.sc=SC[i]; c.textContent=SC[i]+' · '+cnt(SC[i]); c.classList.toggle('on',SC[i]===filter); c.style.cursor='pointer'; });
      const nb=document.querySelectorAll('#v-rules .nums b'); if(nb[0]) nb[0].textContent=act.length; if(nb[1]) nb[1].textContent=new Set(act.map(k=>R[k][1])).size; if(nb[2]) nb[2].textContent=dis.length;
      const st=document.querySelector('.top .st'); if(st) st.innerHTML='<i></i>'+act.length+' правил · '+(dis.length?dis.length+' '+(dis.length===1?'спорное':'спорных'):'спорных нет');
      const sg=document.querySelector('#seg [data-v="dis"]'); if(sg) sg.textContent='Спорные · '+dis.length;
      document.querySelectorAll('#v-dis .li[data-r]').forEach(li=>{ li.style.display=disputed(li.dataset.r)?'':'none'; });
      const dl=document.querySelector('#v-dis .lst'); if(dl){ let e=dl.querySelector('.live-empty'); if(!e){ e=document.createElement('div'); e.className='li dim live-empty'; e.style.cursor='default'; e.innerHTML='<div><small>Спорных правил нет — все разобраны.</small></div>'; dl.appendChild(e); } e.style.display=dis.length?'none':''; } }
    hooks.push(apply);
    const fl=document.querySelector('#v-rules .filters'); if(fl) fl.addEventListener('click',e=>{ const c=e.target.closest('[data-sc]'); if(c){ filter=c.dataset.sc; apply(); } });
    const addB=document.getElementById('add'); if(addB) addB.addEventListener('click',()=>{ curR=null; setTimeout(()=>{ const ta=document.querySelector('.panel [data-step="1"] textarea'); if(ta){ ta.readOnly=false; ta.focus(); ta.select(); } },80); });
    document.addEventListener('click',e=>{ const el=e.target.closest('.li[data-r]'); if(!el) return; curR=el.dataset.r; const inner=document.querySelector('.ovl.on .panel .inner'), acts=inner&&inner.querySelector('.acts'); if(acts&&S.mem.rev[curR]) acts.innerHTML='<span class="btn sm p" data-mback>Вернуть правило</span><span class="btn sm ghost" data-close>Закрыть</span>'; });
    document.addEventListener('click',e=>{ const b=e.target.closest('.panel .acts .btn, .panel [data-step="3"] .btn.p'); if(!b) return; const lab=b.textContent.trim(), k=curR;
      if(b.closest('[data-step="3"]')){ if(!/Добавить правило/.test(lab)) return; const ta=document.querySelector('.panel [data-step="1"] textarea'), text=(ta&&ta.value||'').trim(); if(!text) return;
        const pk=document.querySelector('.panel [data-step="2"] .pick.on'), sc={'Этот разговор':'этот разговор','Проект OMG':'проект OMG','Везде':'везде'}[pk?pk.childNodes[0].textContent.trim():'']||'проект OMG';
        S.seq=(S.seq||0)+1; const a={k:'u'+S.seq,text,scope:sc}; S.mem.add.push(a); save(); log('память','Новое правило: '+text.slice(0,70)); filter='все'; apply();
        toast('Правило добавлено · '+sc,()=>{ S.mem.add=S.mem.add.filter(x=>x.k!==a.k); save(); log('память','Отменено добавление правила'); apply(); }); return; }
      if(!k||!R[k]) return; const name=strip(R[k][0]).slice(0,60), done=(msg,undo)=>{ save(); HX.close(); apply(); toast(msg,undo?()=>{ undo(); save(); apply(); }:null); };
      if(b.hasAttribute('data-mback')){ delete S.mem.rev[k]; log('память','Правило возвращено: '+name); done('Правило снова действует'); }
      else if(b.hasAttribute('data-msave')){ const ta=document.getElementById('m-edit'), v=(ta&&ta.value||'').trim(); if(!v) return; const prev=S.mem.text[k]; S.mem.text[k]=v; log('память','Правило изменено: '+v.slice(0,70)); done('Правило изменено',()=>{ if(prev) S.mem.text[k]=prev; else delete S.mem.text[k]; }); }
      else if(/^Отозвать/.test(lab)){ S.mem.rev[k]=1; log('память','Правило отозвано: '+name); done('Правило отозвано',()=>{ delete S.mem.rev[k]; }); }
      else if(/^Сузить/.test(lab)){ const to=NARROW[R[k][1]]; if(!to){ toast('Уже самая узкая область — этот разговор'); return; } const prev=S.mem.scope[k]; S.mem.scope[k]=to; log('память','Область сужена до «'+to+'»: '+name); done('Область: <b>'+to+'</b>',()=>{ if(prev) S.mem.scope[k]=prev; else delete S.mem.scope[k]; }); }
      else if(/^Разобрать/.test(lab)){ S.mem.ok[k]=1; log('память','Спор разобран, оставлено: '+name); done('Спор разобран: правило оставлено',()=>{ delete S.mem.ok[k]; }); }
      else if(/^Оставить другое/.test(lab)){ S.mem.rev[k]=1; S.mem.ok[k]=1; log('память','Спор разобран, отозвано: '+name); done('Спор разобран: это правило отозвано',()=>{ delete S.mem.rev[k]; delete S.mem.ok[k]; }); }
      else if(/^Изменить/.test(lab)){ const pr=document.querySelector('.panel .rule'); if(pr&&!document.getElementById('m-edit')){ const cur=S.mem.text[k]||strip(R[k][4]); pr.outerHTML='<textarea class="live-f" id="m-edit" style="height:84px;padding:10px 12px;resize:none">'+esc(cur)+'</textarea>'; b.textContent='Сохранить'; b.setAttribute('data-msave',''); const ta=document.getElementById('m-edit'); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); } } },true);
  }

  // ══ АРТЕФАКТЫ: «проверил сам», «влить», «вернуть», фильтр и счётчики ══
  if(PAGE==='art'){
    S.art=S.art||{st:{},shared:{}};
    const LAB={check:'готово к проверке',self:'проверил сам',merged:'влито',back:'возвращён автору',gone:'удалён'}, FL=['all','check','self','merged'], rows=[...document.querySelectorAll('#v-list .li[data-a]')], cellOf=li=>li.querySelectorAll(':scope > .m')[1];
    rows.forEach(li=>{ const c=cellOf(li), x=c?c.textContent:''; li.dataset.st0=/проверке/.test(x)?'check':/сам/.test(x)?'self':/влит/.test(x)?'merged':'check'; li.dataset.lab0=x; });
    const stOf=k=>S.art.st[k]||(rows.find(l=>l.dataset.a===k)||{dataset:{}}).dataset.st0, M0=rows.filter(l=>l.dataset.st0==='merged').length;
    let filter='all', curArt=null;
    function apply(){ const n=s=>rows.filter(l=>stOf(l.dataset.a)===s).length;
      rows.forEach(li=>{ const k=li.dataset.a, s=stOf(k), c=cellOf(li); if(c){ c.textContent=S.art.st[k]?LAB[s]:li.dataset.lab0; c.classList.toggle('hot',s==='check'); } li.classList.toggle('dim',s==='merged'||s==='back'); li.style.display=(s==='gone'||(filter!=='all'&&s!==filter))?'none':''; });
      const nb=document.querySelectorAll('#v-list .nums b'); if(nb[0]) nb[0].textContent=n('check'); if(nb[1]) nb[1].textContent=n('self'); if(nb[2]) nb[2].textContent=111+n('merged')-M0;
      const st=document.querySelector('.top .st'), c=n('check'); if(st) st.innerHTML=c?'<i style="background:var(--accent)"></i>'+c+' '+(c===1?'готов':'готовы')+' к проверке':'<i></i>всё проверено';
      const total=rows.filter(l=>stOf(l.dataset.a)!=='gone').length; document.querySelectorAll('#v-list .filters .chip').forEach((ch,i)=>{ if(!FL[i]) return; ch.dataset.fl=FL[i]; ch.style.cursor='pointer'; ch.classList.toggle('on',FL[i]===filter); ch.textContent=['все · '+total,'к проверке · '+n('check'),'проверил сам · '+n('self'),'влито · '+n('merged')][i]; }); }
    hooks.push(apply);
    document.addEventListener('click',e=>{ const li=e.target.closest('#v-list .li[data-a]'); if(li) curArt=li.dataset.a; const fc=e.target.closest('#v-list .filters [data-fl]'); if(fc){ filter=fc.dataset.fl; apply(); return; }
      const b=e.target.closest('.panel .acts .btn'); if(!b||!curArt||!document.querySelector('#v-list.on')) return; const k=curArt, lab=b.textContent.trim(), row=rows.find(l=>l.dataset.a===k), name=((row&&row.querySelector('b'))||{}).textContent||k, prev=S.art.st[k];
      const set=(to,msg)=>{ S.art.st[k]=to; save(); log('артефакты',name+' → '+LAB[to]); HX.close(); apply(); toast(msg,()=>{ if(prev) S.art.st[k]=prev; else delete S.art.st[k]; save(); log('артефакты','Отменено: '+name); apply(); }); };
      if(/^Проверил сам|^Обновить и проверить/.test(lab)) set('self','Отмечено: <b>проверил сам</b>');
      else if(/^Влить/.test(lab)){ if(k==='d84d'&&!S.dec.m0){ toast('Сначала нужна подпись M0 — она ждёт вас в «Сейчас»'); return; } set('merged','Влито в om/module'); }
      else if(/^Вернуть/.test(lab)) set('back','Возвращено автору');
      else if(/^Удалить/.test(lab)) set('gone','Копия удалена');
      else if(/витрин/i.test(lab)){ S.art.shared[k]=1; save(); log('артефакты',name+' → на витрину'); toast('Отправлено на витрину'); }
      else if(/^Доделать риски/.test(lab)) location.href='17-doc.html';
      else toast('В прототипе «'+esc(lab)+'» ничего не открывает'); },true);
  }

  // ══ ПОДКЛЮЧЕНИЯ: довести «Подключить» до провайдера в списке, отключить, проверить связь, настройки карточки ══
  if(PAGE==='conn'){
    S.conn=S.conn||{on:{},off:{},opt:{}};
    const g=id=>document.getElementById(id), rows=[...document.querySelectorAll('.row[data-p]')]; let curP=null;
    rows.forEach(r=>{ r.dataset.html0=r.innerHTML; r.dataset.off0=r.classList.contains('off')?'1':''; });
    const connected=k=>k==='openrouter'?(!!S.conn.on.openrouter&&!S.conn.off[k]):!S.conn.off[k];
    function apply(){ rows.forEach(r=>{ const k=r.dataset.p; r.innerHTML=r.dataset.html0; r.classList.toggle('off',r.dataset.off0==='1');
        if(k==='openrouter'&&connected(k)){ r.classList.remove('off'); r.querySelector('small').textContent='ключ api · подключён в '+hhmm(S.conn.on.openrouter.at); r.querySelector('.st').innerHTML='<i></i>работает'; const n=r.querySelector('.num'); n.style.color=''; n.innerHTML='$25,00 <small>остаток</small>'; r.querySelector('.pay').textContent='по балансу · порог $5'; r.querySelector('.chev').textContent='›'; }
        else if(S.conn.off[k]&&k!=='openrouter'){ r.classList.add('off'); r.querySelector('.st').innerHTML='<i class="no"></i>отключён'; const pay=r.querySelector('.pay'); if(pay) pay.classList.remove('hot'); } });
      const b=document.querySelectorAll('.sum b'), on=rows.filter(r=>connected(r.dataset.p)).length; if(b[0]) b[0].textContent=on-1; if(b[1]) b[1].textContent=S.conn.off.codex?0:1; }
    hooks.push(apply);
    function flowState(){ const done=connected('openrouter'); if(done){ ['1','2'].forEach(i=>g('f-'+i).style.display='none'); g('f-3').style.display=''; g('f-n').textContent='3'; g('f-steps').querySelectorAll('i').forEach(s=>s.classList.add('on')); }
      const ft=g('f-3').querySelectorAll('.ft .btn'); if(ft[0]){ ft[0].textContent=done?'Отключить':'Пока никому'; ft[0].dataset.live=done?'disc':''; } if(ft[1]) ft[1].textContent=done?'Закрыть':'Готово';
      const f2=g('f-2'); if(f2&&!f2.querySelector('.live-note')) f2.querySelector('.inp').insertAdjacentHTML('afterend','<div class="live-note">В прототипе ключ не вводится и нигде не хранится — показан пример.</div>'); }
    const addbtn=g('addbtn'); if(addbtn) addbtn.addEventListener('click',()=>{ curP=null; flowState(); });
    document.addEventListener('click',e=>{ const r=e.target.closest('.row[data-p]'); if(!r) return; curP=r.dataset.p; if(curP==='openrouter'){ flowState(); return; }
      const acts=g('p-acts'); if(acts&&!acts.querySelector('[data-cdisc]')) acts.insertAdjacentHTML('beforeend','<span class="btn sm ghost" data-cdisc style="cursor:pointer">'+(S.conn.off[curP]?'Подключить снова':'Отключить')+'</span>');
      const pill=g('p-pill'); if(pill&&S.conn.off[curP]){ pill.textContent='отключён'; pill.className='pill'; }
      document.querySelectorAll('#p-opts .tog').forEach((x,i)=>{ const o=(S.conn.opt[curP]||{})[i]; if(o!==undefined) x.classList.toggle('on',!!o); }); });
    document.addEventListener('click',e=>{ const fb=e.target.closest('#flow [data-f]'), disc=e.target.closest('[data-cdisc]'), pa=e.target.closest('#p-acts .btn'), tg=e.target.closest('#p-opts .tog');
      if(fb){ const f=fb.dataset.f;
        if(fb.dataset.live==='disc'){ const prev=S.conn.on.openrouter; delete S.conn.on.openrouter; save(); log('подключения','OpenRouter отключён'); apply(); toast('OpenRouter отключён',()=>{ S.conn.on.openrouter=prev; save(); apply(); }); return; }
        if(f==='2'){ const op=document.querySelector('#flow .op.on'); if(op&&op.dataset.m!=='key'){ document.querySelectorAll('#flow .op').forEach(o=>o.classList.toggle('on',o.dataset.m==='key')); toast('В прототипе доведён путь «по ключу API» — показываю его'); } }
        if((f==='done'||(f==='close'&&g('f-3').style.display!=='none'))&&!connected('openrouter')){ const roles=f==='done'; S.conn.on.openrouter={at:now(),roles}; delete S.conn.off.openrouter; save(); log('подключения','Подключён OpenRouter по ключу API'+(roles?' · запасной для ресёрчера и хранителя':'')); apply();
          toast('OpenRouter подключён',()=>{ delete S.conn.on.openrouter; save(); log('подключения','Отменено подключение OpenRouter'); apply(); }); } return; }
      if(disc&&curP){ const k=curP, name=g('p-name').textContent, was=S.conn.off[k]; if(was) delete S.conn.off[k]; else S.conn.off[k]=1; save(); log('подключения',name+(was?' подключён снова':' отключён')); g('x').click(); apply(); toast(name+(was?' подключён снова':' отключён'),()=>{ if(was) S.conn.off[k]=1; else delete S.conn.off[k]; save(); apply(); }); return; }
      if(pa&&curP){ const lab=pa.textContent.trim(), name=g('p-name').textContent; if(/^Проверить/.test(lab)){ if(S.conn.off[curP]){ toast(name+' отключён — проверять нечего'); return; } const ms=120+Math.round(Math.random()*240); log('подключения',name+': проверка связи · '+ms+' мс'); toast(name+': связь есть · <b>'+ms+' мс</b>'); } else toast('В прототипе «'+esc(lab)+'» не выполняется: входы и ключи не меняются'); return; }
      if(tg&&curP){ tg.classList.toggle('on'); const i=[...document.querySelectorAll('#p-opts .tog')].indexOf(tg); (S.conn.opt[curP]=S.conn.opt[curP]||{})[i]=tg.classList.contains('on')?1:0; save(); const c=tg.closest('.opt').cloneNode(true); c.querySelectorAll('small, .tog').forEach(x=>x.remove()); log('настройка',g('p-name').textContent+': '+c.textContent.trim()+' → '+(tg.classList.contains('on')?'включено':'выключено')); } },true);
  }

  // ══ ДАТЧИКИ: проверить, перезапустить место, порог, выключить, «＋ сторож / ＋ вахта» ══
  const SN=window.SENS;
  if(SN&&PAGE==='sens'){
    S.sens=S.sens||{off:{},fixed:{},thr:{},opt:{},chk:{},add:[]};
    const D=SN.S, D0=JSON.parse(JSON.stringify(D)), ORD0=SN.order.slice(); let curS=null, addKind='';
    function build(){ Object.keys(D).forEach(k=>{ delete D[k]; }); Object.keys(D0).forEach(k=>{ D[k]=D0[k].slice(); });
      S.sens.add.forEach(a=>{ D[a.k]=[esc(a.name),a.kind,'работает','','только что','0,01 %','qqqqqqqqqqqqqqqqqqqqqqqg',esc(a.src),'молчание > 30 мин','оркестратору · вам при повторе']; });
      Object.keys(D).forEach(k=>{ const s=D[k]; if(S.sens.fixed[k]){ s[2]='работает'; s[3]=''; s[4]='только что'; s[6]=s[6].replace(/b+$/,m=>'g'.repeat(m.length)); } if(S.sens.thr[k]) s[8]=esc(S.sens.thr[k]); if(S.sens.chk[k]&&s[3]!=='bad') s[4]='только что'; if(S.sens.off[k]){ s[2]='выключен вами'; s[3]=''; } });
      SN.order.length=0; S.sens.add.slice().reverse().forEach(a=>SN.order.push(a.k)); ORD0.forEach(k=>SN.order.push(k)); }
    function apply(){ build(); SN.render(); const on=SN.order.filter(k=>!S.sens.off[k]), bad=on.filter(k=>D[k][3]==='bad').length, sil=on.filter(k=>/^молчит/.test(D[k][2])).length;
      document.querySelectorAll('#rows .li[data-s]').forEach(li=>li.classList.toggle('dim',!!S.sens.off[li.dataset.s]||li.classList.contains('dim')));
      const st=document.querySelector('.top .st'); if(st) st.innerHTML='<i></i>'+SN.order.length+' датчиков · '+(bad||sil?[bad?bad+' без связи':'',sil?sil+' молчит':''].filter(Boolean).join(' · '):'все на связи');
      const nb=document.querySelectorAll('#v-all .nums b'); if(nb[2]) nb[2].textContent=bad+sil;
      document.querySelectorAll('#v-fail .li[data-s]').forEach(li=>{ const c=li.querySelectorAll(':scope > .m')[1]; if(!c) return; if(li.dataset.c0===undefined){ li.dataset.c0=c.textContent; li.dataset.b0=c.classList.contains('bad')?'1':''; } const fx=S.sens.fixed[li.dataset.s]&&li.dataset.b0==='1'; c.textContent=fx?'закрыт · место перезапущено':li.dataset.c0; c.classList.toggle('bad',!fx&&li.dataset.b0==='1'); li.classList.toggle('dim',!!fx||li.dataset.b0!=='1'&&li.classList.contains('dim')); }); }
    hooks.push(apply);
    for(const [id,kind] of [['add1','сторож'],['add2','вахта']]){ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>{ curS=null; addKind=kind; setTimeout(()=>{ const sub=document.querySelector('.ovl.on .panel .csub'); if(sub&&!document.getElementById('sn-name')){ sub.insertAdjacentHTML('afterend','<input class="live-f" id="sn-name" placeholder="Название — за чем следит" maxlength="60">'); document.getElementById('sn-name').focus(); } },60); }); }
    document.addEventListener('click',e=>{ const el=e.target.closest('.li[data-s]'); if(!el||!D[el.dataset.s]) return; curS=el.dataset.s; addKind=''; const inner=document.querySelector('.ovl.on .panel .inner'), acts=inner&&inner.querySelector('.acts'); if(!acts) return;
      if(S.sens.off[curS]) acts.innerHTML='<span class="btn sm p">Включить</span><span class="btn sm ghost" data-close>Закрыть</span>';
      if(S.sens.add.some(a=>a.k===curS)&&!acts.querySelector('[data-sdel]')) acts.insertAdjacentHTML('beforeend','<span class="btn sm ghost" data-sdel>Удалить датчик</span>');
      inner.querySelectorAll('.opt .tog').forEach((x,i)=>{ const o=(S.sens.opt[curS]||{})[i]; if(o!==undefined) x.classList.toggle('on',!!o); }); });
    document.addEventListener('click',e=>{ const tg=e.target.closest('.panel .opt .tog'); if(tg&&curS){ const k=curS; setTimeout(()=>{ const all=[...document.querySelectorAll('.panel .opt .tog')], i=all.indexOf(tg); if(i<0) return; (S.sens.opt[k]=S.sens.opt[k]||{})[i]=tg.classList.contains('on')?1:0; save(); const c=tg.closest('.opt').cloneNode(true); c.querySelectorAll('small, .tog').forEach(x=>x.remove()); log('настройка',strip(D[k][0])+': '+c.textContent.trim()+' → '+(tg.classList.contains('on')?'включено':'выключено')); },0); return; }
      const b=e.target.closest('.panel .acts .btn'); if(!b) return; const lab=b.textContent.trim();
      if(!curS&&addKind){ if(!/^Добавить/.test(lab)) return; const inp=document.getElementById('sn-name'), name=(inp&&inp.value||'').trim(); if(!name){ e.stopPropagation(); e.preventDefault(); if(inp){ inp.classList.add('err'); inp.focus(); } return; }
        const pk=document.querySelector('.panel .pick.on'), src=pk?pk.childNodes[0].textContent.trim():'Файл или журнал'; S.seq=(S.seq||0)+1; const a={k:'x'+S.seq,name,kind:addKind,src}; S.sens.add.push(a); save(); log('датчики','Добавлен '+addKind+': '+name); apply();
        toast('Добавлен '+addKind+' <b>'+esc(name)+'</b>',()=>{ S.sens.add=S.sens.add.filter(x=>x.k!==a.k); save(); log('датчики','Отменено добавление: '+name); apply(); }); return; }
      const k=curS; if(!k||!D[k]) return; const name=strip(D[k][0]), done=(msg,undo)=>{ save(); HX.close(); apply(); toast(msg,undo?()=>{ undo(); save(); apply(); }:null); };
      if(b.hasAttribute('data-sdel')){ S.sens.add=S.sens.add.filter(x=>x.k!==k); log('датчики','Удалён датчик: '+name); done('Датчик удалён'); }
      else if(b.hasAttribute('data-tsave')){ const inp=document.getElementById('sn-thr'), v=(inp&&inp.value||'').trim(); if(!v) return; const prev=S.sens.thr[k]; S.sens.thr[k]=v; log('датчики',name+': порог → '+v); done('Порог изменён',()=>{ if(prev) S.sens.thr[k]=prev; else delete S.sens.thr[k]; }); }
      else if(/^Проверить/.test(lab)){ if(D[k][3]==='bad'){ log('датчики',name+': проверка — ответа нет'); toast(name+': ответа нет — место не отвечает. Поможет «Перезапустить место»'); return; } S.sens.chk[k]=now(); log('датчики',name+': проверка — сигнал получен'); done(name+': сигнал получен'); }
      else if(/^Перезапустить/.test(lab)){ S.sens.fixed[k]=1; log('датчики',name+': место перезапущено, связь есть'); done(name+': место перезапущено',()=>{ delete S.sens.fixed[k]; }); }
      else if(/^Выключить/.test(lab)){ S.sens.off[k]=1; log('датчики',name+': выключен'); done(name+' выключен',()=>{ delete S.sens.off[k]; }); }
      else if(/^Включить/.test(lab)){ delete S.sens.off[k]; log('датчики',name+': включён'); done(name+' включён'); }
      else if(/^Изменить порог/.test(lab)){ const row=[...document.querySelectorAll('.panel .kv span')].find(x=>x.textContent.trim()==='порог'), val=row&&row.nextElementSibling; if(val&&!document.getElementById('sn-thr')){ val.innerHTML='<input class="live-f" id="sn-thr" style="height:32px;margin:0" value="'+esc(S.sens.thr[k]||strip(D[k][8]))+'">'; b.textContent='Сохранить порог'; b.setAttribute('data-tsave',''); document.getElementById('sn-thr').focus(); } } },true);
  }

  // ══ РЕСЁРЧ: стоп и продолжение, глубина, применить / свести / уточнить / отклонить ══
  if(PAGE==='res'){
    S.res=S.res||{stop:false,deep:false,q:{},title:{}};
    const rows=[...document.querySelectorAll('#v-cur .li[data-q]')], pg=document.querySelector('.pg'), btns=pg?[...pg.querySelectorAll('.btn')]:[], sub=document.querySelector('.rh small'); let curQ=null;
    rows.forEach(li=>{ const c=li.querySelector(':scope > .m'); li.dataset.c0=c.textContent; li.dataset.col0=c.style.color||''; li.dataset.hot0=c.classList.contains('hot')?'1':''; li.dataset.dim0=li.classList.contains('dim')?'1':''; li.dataset.t0=li.querySelector('b').textContent; li.dataset.conf0=li.querySelector('.conf').innerHTML; });
    if(sub) sub.dataset.t0=sub.textContent;
    const kind=li=>{ const q=S.res.q[li.dataset.q]; if(q) return q; return /готов/.test(li.dataset.c0)?'ready':/расход/.test(li.dataset.c0)?'split':'search'; };
    function apply(){ const depth=S.res.deep?20:12;
      rows.forEach(li=>{ const k=li.dataset.q, s=kind(li), c=li.querySelector(':scope > .m'), over=S.res.q[k]; li.querySelector('b').textContent=S.res.title[k]||li.dataset.t0;
        c.textContent=over?({applied:'применено к проекту',merged:'сведено · ответ готов',rejected:'отклонён'}[over]):(s==='search'&&S.res.stop?'поиск остановлен':li.dataset.c0);
        c.style.color=(over==='applied'||over==='merged')?'var(--ok)':over?'':li.dataset.col0; c.classList.toggle('hot',!over&&li.dataset.hot0==='1'); li.classList.toggle('dim',over==='applied'||over==='rejected'||(!over&&li.dataset.dim0==='1'));
        li.querySelector('.conf').innerHTML=over==='merged'?'<i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i>':li.dataset.conf0; });
      const tk=pg&&pg.querySelector('.ticks'); if(tk) tk.innerHTML=Array.from({length:depth},(_,i)=>'<i'+(i<6?' class="on"':'')+'></i>').join(''); const b=pg&&pg.querySelector('b'); if(b) b.textContent='6 / '+depth;
      if(btns[0]) btns[0].textContent=S.res.stop?'▶ Продолжить':'■ Стоп'; if(btns[1]) btns[1].textContent=S.res.deep?'Вернуть глубину 12':'Углубить до 20'; btns.forEach(x=>x.style.cursor='pointer');
      if(sub) sub.textContent=S.res.deep?sub.dataset.t0.replace('глубина 12','глубина 20'):sub.dataset.t0;
      const st=document.querySelector('.top .st'); if(st) st.innerHTML=S.res.stop?'<i style="background:var(--ink3)"></i>остановлено · 6 из '+depth+' источников':'<i></i>идёт · 6 из '+depth+' источников';
      const n=x=>rows.filter(li=>kind(li)===x).length, nb=document.querySelector('#v-cur .note-bar span'); if(nb) nb.textContent=rows.length+' вопроса · '+(n('ready')+n('merged'))+' готовы · '+n('split')+' расходится · '+n('search')+' в поиске'+(n('applied')?' · '+n('applied')+' применено':'')+(n('rejected')?' · '+n('rejected')+' отклонено':''); }
    hooks.push(apply);
    document.addEventListener('click',e=>{ const li=e.target.closest('#v-cur .li[data-q]'); if(li){ curQ=li.dataset.q; const h=document.querySelector('.ovl.on .panel .ch h3'); if(h&&S.res.title[curQ]) h.textContent=S.res.title[curQ]; }
      const tb=e.target.closest('.pg .btn'); if(tb){ const i=btns.indexOf(tb); if(i===0){ S.res.stop=!S.res.stop; save(); log('ресёрч',S.res.stop?'Исследование остановлено':'Исследование продолжено'); apply(); toast(S.res.stop?'Исследование остановлено':'Исследование продолжено'); } else if(i===1){ S.res.deep=!S.res.deep; save(); log('ресёрч',S.res.deep?'Глубина увеличена до 20 источников':'Глубина возвращена к 12'); apply(); toast(S.res.deep?'Глубина: <b>20 источников</b>':'Глубина: 12 источников'); } return; }
      const b=e.target.closest('.panel .acts .btn'); if(!b||!curQ||!document.querySelector('#v-cur.on')) return; const k=curQ, lab=b.textContent.trim(), row=rows.find(r=>r.dataset.q===k), name=(S.res.title[k]||row.dataset.t0).slice(0,60), prev=S.res.q[k];
      const set=(to,msg)=>{ S.res.q[k]=to; save(); log('ресёрч',msg+': '+name); HX.close(); apply(); toast(msg,()=>{ if(prev) S.res.q[k]=prev; else delete S.res.q[k]; save(); apply(); }); };
      if(b.hasAttribute('data-rsave')){ const inp=document.getElementById('rq-edit'), v=(inp&&inp.value||'').trim(); if(!v) return; S.res.title[k]=v; save(); log('ресёрч','Вопрос уточнён: '+v.slice(0,70)); HX.close(); apply(); toast('Вопрос уточнён'); }
      else if(/^Применить/.test(lab)) set('applied','Применено к проекту');
      else if(/^Свести/.test(lab)) set('merged','Ответы сведены');
      else if(/^Отклонить/.test(lab)) set('rejected','Вопрос отклонён');
      else if(/^Уточнить/.test(lab)){ const h=document.querySelector('.panel .ch h3'); if(h&&!document.getElementById('rq-edit')){ h.outerHTML='<input class="live-f" id="rq-edit" style="margin:0" value="'+esc(S.res.title[k]||row.dataset.t0)+'">'; b.textContent='Сохранить вопрос'; b.setAttribute('data-rsave',''); document.getElementById('rq-edit').focus(); } }
      else toast('В прототипе «'+esc(lab)+'» ничего не открывает'); },true);
  }

  // ══ ДОКУМЕНТ СТАДИИ: доделать разделы, подписать переход ══
  if(PAGE==='doc'){
    S.doc=S.doc||{fill:{},text:{},signed:0};
    const FILLT={risk:'Действие и владелец добавлены: при лимите Codex проход переходит на Sonnet (владелец — оркестратор); при недоступном ревьюере ревью идёт на Opus (владелец — вы).',budget:'Смета на остаток стадии: +1,4 % недели Claude по среднему 0,13 % на влитую задачу; порог остановки — 95 % недели.'}, NAME={risk:'Раздел 5 · Риски',budget:'Раздел 6 · Бюджет',sign:'Раздел 7 · Переход'};
    const wait=k=>document.querySelector('.paper .wait[data-w="'+k+'"]'), toc=k=>document.querySelector('.toc .it[data-w="'+k+'"]'); let curW=null;
    ['risk','budget','sign'].forEach(k=>{ const w=wait(k), t=toc(k); if(w){ w.dataset.t0=w.textContent; const p=w.closest('h4').nextElementSibling; if(p) p.dataset.h0=p.innerHTML; } if(t) t.dataset.h0=t.innerHTML; });
    const filled=k=>k==='sign'?!!S.doc.signed:!!S.doc.fill[k];
    function apply(){ const n=['risk','budget','sign'].filter(filled).length, open=3-n, ver=6+Object.keys(S.doc.fill).length+(S.doc.signed?1:0);
      ['risk','budget','sign'].forEach(k=>{ const w=wait(k), t=toc(k), f=filled(k), p=w&&w.closest('h4').nextElementSibling;
        if(t){ t.classList.toggle('w',!f); t.classList.toggle('d',f); t.innerHTML=f?'<i>✓</i>'+t.dataset.h0.replace(/<i><\/i>/,'').replace(/<span class="n">.*?<\/span>/,''):t.dataset.h0; }
        if(w){ w.textContent=f?(k==='sign'?'подписано вами · '+hhmm(S.doc.signed):S.doc.fill[k]==='self'?'заполнено вами':'заполнено оркестратором · черновик'):w.dataset.t0; w.style.color=f?'var(--ok)':''; w.style.background=f?'var(--ok-soft)':''; w.style.cursor=f?'default':''; }
        if(p&&k!=='sign') p.innerHTML=p.dataset.h0+(f?' <b>'+esc(S.doc.text[k]||FILLT[k])+'</b>':''); });
      const pg=document.querySelector('.toc .pg'); if(pg){ const b=pg.querySelector('b'); if(b) b.textContent=(4+n)+' из 7'; const tk=pg.querySelector('.ticks'); if(tk) tk.innerHTML=Array.from({length:7},(_,i)=>'<i class="'+(i<4+n?'ok':i<6?'on':'')+'"></i>').join(''); }
      const st=document.querySelector('.top .st'); if(st) st.innerHTML=S.doc.signed?'<i></i>версия '+ver+' · подписана · стадия закрыта':'<i style="background:var(--accent)"></i>версия '+ver+' · '+(open?'ждёт в '+open+' '+(open===1?'месте':'местах'):'всё заполнено');
      const nx=document.getElementById('next'), fx=document.getElementById('fix'); if(nx){ nx.textContent=S.doc.signed?'Рубеж открыт ✓':'Перейти к рубежу'; nx.classList.toggle('p',!S.doc.signed); nx.style.cursor='pointer'; } if(fx){ fx.style.display=(filled('risk')&&filled('budget'))?'none':''; fx.style.cursor='pointer'; } const vb=document.getElementById('vers'); if(vb){ vb.textContent='Версии · '+(ver+1); vb.style.cursor='pointer'; } }
    hooks.push(apply);
    const fill=(keys,how,text)=>{ const prev=JSON.parse(JSON.stringify(S.doc)); keys.forEach(k=>{ S.doc.fill[k]=how; if(text) S.doc.text[k]=text; }); save(); log('документ',keys.map(k=>NAME[k]).join(', ')+' — '+(how==='self'?'заполнено вами':'поручено оркестратору, заполнено черновиком')); HX.close(); apply(); toast(keys.length>1?'Разделы 5 и 6 заполнены':NAME[keys[0]]+': заполнено',()=>{ S.doc=prev; save(); log('документ','Отменено заполнение'); apply(); }); };
    document.addEventListener('click',e=>{ const w=e.target.closest('[data-w]'); if(w) curW=w.dataset.w;
      const nx=e.target.closest('#next'); if(nx&&S.doc.signed){ e.stopPropagation(); e.preventDefault(); toast('Стадия уже закрыта: переход подписан в '+hhmm(S.doc.signed)); return; }
      if(w&&filled(w.dataset.w)&&!e.target.closest('.panel')){ e.stopPropagation(); e.preventDefault(); toast(NAME[w.dataset.w]+' — уже заполнен'); return; }
      const b=e.target.closest('.panel .acts .btn, .panel [data-step="2"] .btn.p, .panel [data-step="1"] .btn'); if(!b) return; const lab=b.textContent.trim();
      if(b.hasAttribute('data-dsave')){ const ta=document.getElementById('d-edit'), v=(ta&&ta.value||'').trim(); if(!v) return; fill([curW],'self',v); return; }
      if(/^Подписать и перейти/.test(lab)){ const prev=S.doc.signed; S.doc.signed=now(); save(); log('документ','Переход к рубежу подписан — стадия «Карта блоков L1» закрыта'); apply(); toast('Переход подписан: рубеж открыт',()=>{ S.doc.signed=prev||0; save(); log('документ','Отменена подпись перехода'); apply(); }); return; }
      if(/^Доделать 5 и 6/.test(lab)){ fill(['risk','budget'].filter(k=>!filled(k)),'orch'); return; }
      if(/^Доделать — поручить/.test(lab)&&curW){ fill([curW],'orch'); return; }
      if(/^Заполнить самому/.test(lab)&&curW){ const blkEl=document.querySelector('.panel .blk'); if(blkEl&&!document.getElementById('d-edit')){ blkEl.insertAdjacentHTML('afterend','<textarea class="live-f" id="d-edit" style="height:84px;padding:10px 12px;resize:none;margin-top:12px" placeholder="Что делаем и кто отвечает"></textarea>'); b.textContent='Сохранить раздел'; b.setAttribute('data-dsave',''); document.getElementById('d-edit').focus(); } return; }
      if(/^Перейти к подписи/.test(lab)){ setTimeout(()=>{ const n=document.getElementById('next'); if(n) n.click(); },380); return; }
      if(/^Открыть раздел 5/.test(lab)){ HX.close(); const w5=wait('risk'); if(w5) w5.scrollIntoView({block:'center',behavior:'smooth'}); return; }
      if(/^Доделать$/.test(lab)&&b.closest('[data-step="1"]')){ setTimeout(()=>{ const f=document.getElementById('fix'); if(f&&f.style.display!=='none') f.click(); },380); return; }
      if(/^Спросить оркестратора/.test(lab)){ S.draft='@оркестратор · по документу стадии L1, раздел 7: '; save(); location.href='01-chat.html'; } },true);
    const nxb=document.getElementById('next'); if(nxb) nxb.addEventListener('click',()=>setTimeout(()=>{ const s1=document.querySelector('.panel [data-step="1"]'); if(!s1) return; const both=filled('risk')&&filled('budget'), h=s1.querySelector('h4'), p=s1.querySelector('p'), kvb=s1.querySelectorAll('.kv b');
      if(both){ if(h) h.textContent='Документ доделан'; if(p) p.textContent='Все разделы заполнены — можно подписывать переход.'; if(kvb[0]) kvb[0].textContent='заполнен'; if(kvb[1]) kvb[1].textContent='заполнен'; if(kvb[2]) kvb[2].textContent='рубеж начнётся со сметой и с действиями по рискам'; }
      else { if(kvb[0]&&filled('risk')) kvb[0].textContent='заполнен'; if(kvb[1]&&filled('budget')) kvb[1].textContent='заполнен'; } },60));
  }

  // TS-10: one owner for real spend data, periods and CSV.
  const SP={period:'all',group:'byPane',project:null,generation:0,data:null,error:null,loading:false};
  const spendGroups={byPane:'по местам',byChat:'по чатам',byModel:'по моделям'};
  function spendDraw(){ if(PAGE!=='spend'||!H.on)return;
    if(window.HX)HX.close();
    const data=SP.data,rows=data?data[SP.group]:[],name=row=>SP.group==='byPane'?row.label:SP.group==='byChat'?row.title||row.chat:row.model||'модель не сохранена';
    const table='<table class="tbl"><thead><tr><th>'+spendGroups[SP.group]+'</th><th>ходы</th><th>вход</th><th>выход</th><th>кэш</th><th>время, мс</th><th>среднее, мс</th><th>ok / остановки / сбои / неизвестно</th><th>без измерений</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(name(row))+'</td>'+[row.turns,row.input,row.output,row.cacheRead,row.durationMs,row.averageDurationMs==null?'—':Math.round(row.averageDurationMs),[row.outcomes.ok,row.outcomes.interrupted,row.outcomes.error,row.outcomes.unknown].join(' / '),row.missingMeasurements].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    const html='<div class="view on" data-spend-root style="display:block;overflow:auto;padding:20px"><div class="card">'+
      '<div class="h"><b>История ходов</b></div><p>данных нет: движок отдаёт только историю ходов</p><p>история — из записей ходов; лимиты движок не отдаёт</p><p>учтено только с известным происхождением</p>'+
      '<div>'+['7','30','90','all'].map(period=>'<button type="button" class="btn sm '+(period===SP.period?'p':'ghost')+'" data-spend-period="'+period+'">'+(period==='all'?'всё':period+' дн')+'</button>').join(' ')+'</div><div style="margin-top:10px">'+Object.entries(spendGroups).map(([group,label])=>'<button type="button" class="btn sm '+(SP.group===group?'p':'ghost')+'" data-spend-group="'+group+'">'+label+'</button>').join(' ')+' <button class="btn sm ghost" type="button" data-spend-refresh>Обновить</button> <button class="btn sm ghost" type="button" data-spend-csv'+(!data||SP.loading?' disabled':'')+'>CSV</button></div>'+
      (SP.loading?'<p>Читаю историю…</p>':'')+(SP.error?'<p role="alert">'+esc(SP.error)+(data?' · показан прежний снимок за период '+esc(data.period):'')+'</p>':'')+
      (data?'<p>Источник: chats.json · проект '+esc(base(data.project))+' · период '+esc(data.period)+' · снимок '+new Date(data.generatedAt*1000).toLocaleString('ru-RU')+'</p><p>Ходов: '+data.totals.turns+' · вход '+fmtN(data.totals.input)+' · выход '+fmtN(data.totals.output)+' · кэш '+fmtN(data.totals.cacheRead)+'</p><p>перенесено: '+data.transferred+' ответов, не учтены · без происхождения: '+data.unknownOrigin+' · без даты: '+data.undated+'</p><p>Стоимость не считается: '+esc(data.costReason)+'</p><div style="overflow:auto">'+(rows.length?table:'За этот период учтённых ходов нет')+'</div>':'')+'</div></div>';
    document.querySelectorAll('.frame .views').forEach(view=>{view.innerHTML=html});
    document.querySelectorAll('.frame .top').forEach(top=>{top.innerHTML='<b>Расход · '+esc(base(H.project))+'</b><span class="st">история — из записей ходов; лимиты движок не отдаёт</span>'});
  }
  async function spendFetch(){ if(PAGE!=='spend'||!H.on)return false;const project=H.project,period=SP.period,generation=++SP.generation;
    if(SP.project!==project){SP.project=project;SP.data=null}SP.loading=true;SP.error=null;spendDraw();
    try{const data=await api('/api/spend?period='+period);if(H.project!==project||SP.period!==period||SP.generation!==generation)return false;
      if(!data||!data.ok)throw Error(data&&data.error||'история недоступна');
      if(data.project!==project||data.period!==period||data.source!=='chats.json'||!data.totals||!Array.isArray(data.byPane)||!Array.isArray(data.byChat)||!Array.isArray(data.byModel))throw Error('ответ аналитики не соответствует проекту и периоду');
      SP.data=data;return true;
    }catch(error){if(H.project!==project||SP.period!==period||SP.generation!==generation)return false;SP.error=error.message||'нет связи';return false;
    }finally{if(H.project===project&&SP.period===period&&SP.generation===generation){SP.loading=false;spendDraw()}}
  }
  function spendCsv(){if(!SP.data||SP.loading)return null;const data=SP.data,columns=['turns','input','output','cacheRead','durationMs','averageDurationMs','missingMeasurements'];
    const rows=[['source',data.source,'project',data.project,'period',data.period,'generatedAt',data.generatedAt,'transferred',data.transferred,'unknownOrigin',data.unknownOrigin,'undated',data.undated,'costReason',data.costReason],['group','id','title',...columns,'ok','interrupted','error','unknown']];
    for(const [group,items] of [['byPane',data.byPane],['byChat',data.byChat],['byModel',data.byModel]])for(const row of items)rows.push([group,(group==='byPane'?row.pane:group==='byChat'?row.chat:row.model)||'',row.label||row.title||row.model||'модель не сохранена',...columns.map(k=>row[k]??''),row.outcomes.ok,row.outcomes.interrupted,row.outcomes.error,row.outcomes.unknown]);
    const cell=value=>{let text=String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
    return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
  }
  if(PAGE==='spend'){
    document.querySelectorAll('.frame .views').forEach(view=>view.insertAdjacentHTML('beforeend','<div data-spend-demo>макет</div>'));
    addEventListener('live:status',()=>{if(H.on)void spendFetch()});addEventListener('pagehide',()=>{SP.generation++});
    document.addEventListener('click',async event=>{if(!H.on)return;const button=event.target.closest('[data-spend-period], [data-spend-group], [data-spend-refresh], [data-spend-csv]');
      if(!button){if(event.target.closest('.frame .views, .frame .top, .panel')){event.preventDefault();event.stopImmediatePropagation()}return}
      event.preventDefault();event.stopImmediatePropagation();if(button.disabled)return;
      if(button.dataset.spendPeriod){SP.period=button.dataset.spendPeriod;await spendFetch()}
      else if(button.dataset.spendGroup){SP.group=button.dataset.spendGroup;spendDraw()}
      else if(button.hasAttribute('data-spend-refresh'))await spendFetch();
      else {const csv=spendCsv();if(csv===null)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='harnessy-spend-'+SP.data.period+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}
    },true);
  }
  // End TS-10 real spend.
  // ══ РАСХОД: вторые экраны — политика роутера, решения по лимиту, правило из причины, смета, выгрузка ══
  if(PAGE==='spend'){
    S.spend=S.spend||{policy:0,revOpus:0,est:{},cap:'',remind:0,warn:0};
    const dirty=document.querySelector('.dirty'); if(dirty) dirty.dataset.h0=dirty.innerHTML; let curKey='';
    const csv=(name,rows)=>{ const data='﻿'+rows.map(r=>r.map(c=>'"'+String(c).replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"').join(';')).join('\r\n'), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); };
    const exportView=()=>{ const v=document.querySelector('.view.on'), id=v?v.id:'v-over'; let rows;
      if(id==='v-over') rows=[...document.querySelectorAll('.hist .tbl tr')].map(tr=>[...tr.children].map(c=>c.textContent));
      else rows=[...v.querySelectorAll('.lst .li')].map(li=>[...li.children].slice(0,-1).map(c=>c.textContent));
      csv('harnessy-rashod-'+id.replace('v-','')+'.csv',rows); log('расход','Выгружен CSV: '+({'v-over':'история по моделям','v-proj':'проекты','v-role':'причины','v-est':'смета'}[id]||id)+' · '+(rows.length-1)+' строк'); toast('CSV выгружен · '+(rows.length-1)+' строк'); };
    function apply(){ if(dirty){ if(S.spend.policy){ dirty.innerHTML='<span class="m" style="color:var(--ok)">политика применена в '+hhmm(S.spend.policy)+'</span><span>Sonnet 35 % · Opus 50 %</span><span class="btn sm ghost" style="margin-left:auto;cursor:pointer" data-pol="undo">Вернуть прежнюю</span>'; } else dirty.innerHTML=dirty.dataset.h0; dirty.querySelectorAll('.btn').forEach(b=>b.style.cursor='pointer'); }
      const tb=document.querySelector('[data-c="router"] .tbl'); if(tb){ const c=tb.querySelectorAll('tr td:nth-child(2)'); if(c[0]) c[0].textContent=S.spend.policy?'50 %':'58 %'; if(c[1]) c[1].textContent=S.spend.policy?'35 %':'27 %'; }
      document.querySelectorAll('[data-c="router"] .nd small').forEach((s,i)=>{ if(s.dataset.t0===undefined) s.dataset.t0=s.textContent; s.textContent=S.spend.policy&&i===0?s.dataset.t0.replace('58 %','50 %'):S.spend.policy&&i===1?s.dataset.t0.replace('27 %','35 %'):s.dataset.t0; });
      document.querySelectorAll('#v-est .li[data-es]').forEach(li=>{ const c=li.querySelectorAll(':scope > .m'), last=c[c.length-1]; if(!last) return; if(last.dataset.t0===undefined){ last.dataset.t0=last.textContent; last.dataset.col0=last.style.color||''; } const r=S.spend.est[li.dataset.es]; last.textContent=r?'пересчитана':last.dataset.t0; last.style.color=r?'var(--accent)':last.dataset.col0; });
      const cap=document.querySelector('#cap small'); if(cap){ if(cap.dataset.t0===undefined) cap.dataset.t0=cap.textContent; cap.textContent=S.spend.cap?'порог недели · '+S.spend.cap+' ›':cap.dataset.t0; } }
    hooks.push(apply);
    document.addEventListener('click',e=>{if(H.on)return; const c=e.target.closest('[data-c], [data-pj], [data-rs], [data-es], #cap'); if(c&&!e.target.closest('.panel')) curKey=c.dataset.c||(c.dataset.pj?'pj:'+c.dataset.pj:c.dataset.rs?'rs:'+c.dataset.rs:c.dataset.es?'es:'+c.dataset.es:'cap');
      const db=e.target.closest('.dirty .btn'); if(db){ e.stopPropagation(); e.preventDefault(); const lab=db.textContent.trim();
        if(db.dataset.pol==='undo'||/^Отменить/.test(lab)){ if(S.spend.policy){ S.spend.policy=0; save(); log('расход','Политика роутера возвращена к прежней'); apply(); toast('Политика возвращена'); } else { dirty.style.display='none'; log('расход','Изменения политики роутера отменены'); toast('Изменения отменены'); } }
        else { S.spend.policy=now(); save(); log('расход','Политика роутера применена: Sonnet 27 → 35 %'); apply(); toast('Политика применена',()=>{ S.spend.policy=0; save(); apply(); }); } return; }
      const b=e.target.closest('.panel .acts .btn'); if(!b) return; const lab=b.textContent.trim(), goto=u=>{ location.href=u; };
      if(/^Перевести на Sonnet/.test(lab)){ resolve('limit','Продолжить на Sonnet'); HX.close(); }
      else if(/^Ждать 19:58/.test(lab)) resolve('limit','Ждать 19:58');
      else if(/^Перевести ревью на Opus/.test(lab)){ S.spend.revOpus=now(); save(); log('расход','Ревью переведено на Opus до сброса Codex'); toast('Ревью переведено на Opus до 19:58'); }
      else if(/^Применить политику/.test(lab)){ S.spend.policy=now(); save(); log('расход','Политика роутера применена: Sonnet 27 → 35 %'); apply(); toast('Политика применена',()=>{ S.spend.policy=0; save(); apply(); }); }
      else if(/^Отменить$/.test(lab)&&curKey==='router'){ toast('Изменения политики не применены'); }
      else if(/^Применить$/.test(lab)&&curKey==='cap'){ const pk=document.querySelector('.panel .pick.on'), v=pk?pk.childNodes[0].textContent.trim():''; S.spend.cap=v; save(); log('расход','Порог недели: '+v); apply(); toast('Порог недели: <b>'+esc(v)+'</b>'); }
      else if(/^Создать правило/.test(lab)){ const h=document.querySelector('.panel .ch h3'), text=h?h.textContent.trim():'Причина расхода'; S.mem=S.mem||{rev:{},scope:{},text:{},ok:{},add:[]}; S.seq=(S.seq||0)+1; S.mem.add.push({k:'u'+S.seq,text:'Не допускать: '+text.charAt(0).toLowerCase()+text.slice(1),scope:'проект OMG'}); save(); log('расход','Из причины создано правило памяти: '+text.slice(0,60)); HX.close(); toast('Правило добавлено в память проекта · <a href="16-memory.html" style="text-decoration:none">открыть</a>'); }
      else if(/^Пересчитать смету/.test(lab)){ const k=curKey.replace('es:',''); S.spend.est[k]=now(); save(); log('расход','Смета пересчитана по факту'); HX.close(); apply(); toast('Смета пересчитана по факту',()=>{ delete S.spend.est[k]; save(); apply(); }); }
      else if(/^Экспорт CSV|^Экспорт$/.test(lab)){ HX.close(); exportView(); }
      else if(/^Напомнить за день/.test(lab)){ S.spend.remind=S.spend.remind?0:now(); save(); log('расход',S.spend.remind?'Включено напоминание за день до списания':'Напоминание о списании выключено'); toast(S.spend.remind?'Напомню за день до списания':'Напоминание выключено'); }
      else if(/^Предупреждать при/.test(lab)){ S.spend.warn=S.spend.warn?0:now(); save(); log('расход',S.spend.warn?'Включено предупреждение при остатке $10':'Предупреждение об остатке выключено'); toast(S.spend.warn?'Предупрежу при остатке $10':'Предупреждение выключено'); }
      else if(/^Открыть в подключениях|^Управлять планом|^Настройки оплаты|^Сменить ключ/.test(lab)) goto('11-connections.html');
      else if(/^Открыть задачи на карте|^Показать задачи|^Открыть задачу/.test(lab)) goto('02-plan.html');
      else if(/^Открыть правило в памяти/.test(lab)) goto('16-memory.html');
      else if(/^Назначить роли/.test(lab)) goto('04-swarm.html');
      else if(/^Пополнить/.test(lab)) toast('В прототипе оплата не выполняется — пополнение делается у провайдера');
      else if(/^Обновить данные/.test(lab)) toast('Данные в прототипе заготовлены — обновлять нечего');
      else if(/^Экспорт в календарь|^Сравнить со сметой|^Оставить незаданной/.test(lab)) toast('В прототипе «'+esc(lab)+'» не выполняется'); },true);
  }

  // ══ ПОДКЛЮЧЕНИЯ · вкладки «Роли» и «Ключи» ══
  if(PAGE==='conn'){
    S.conn.rev=S.conn.rev||{}; S.swarm=S.swarm||{a:{},add:[]};
    const RK={'Оркестратор':'orch','Воркер 1':'w1','Воркер 2':'w2','Ревьюер':'rev','Хранитель':'keep','Ресёрчер':'res'}, ML=[['Opus 5.5','c','C'],['Sonnet 5.5','c','C'],['Astra (Codex)','o','X'],['Qwen 3 Coder','q','Q'],['Kimi K2.5','k','K']];
    const rr=[...document.querySelectorAll('#v-roles .rr:not(.head)')], note=document.querySelector('#v-roles .note'), kvw=document.querySelector('#v-keys .wrap'); let pend={}, curRR=null;
    rr.forEach(r=>{ const s=r.querySelector('.sel'); r.dataset.sel0=s.innerHTML; r.dataset.hot0=s.classList.contains('hot')?'1':''; r.dataset.key=RK[r.querySelector('.n b').textContent.trim()]||''; s.style.cursor='pointer'; s.style.position='relative'; });
    if(note) note.dataset.h0=note.innerHTML;
    const selHTML=m=>{ const x=ML.find(a=>a[0]===m)||ML[0]; return '<span class="lg '+x[1]+'">'+x[2]+'</span>'+m+'<span class="chev">▾</span>'; }, rname=k=>rr.find(r=>r.dataset.key===k).querySelector('.n b').textContent;
    function applyRoles(){ rr.forEach(r=>{ const k=r.dataset.key, s=r.querySelector('.sel'), m=pend[k]||((S.swarm.a[k]||{}).model); s.innerHTML=m?selHTML(m):r.dataset.sel0; s.classList.toggle('hot',!!pend[k]||(!m&&r.dataset.hot0==='1')); });
      if(!note) return; const ks=Object.keys(pend); note.style.display='';
      if(ks.length) note.innerHTML='<span class="m">не применено</span><span>'+ks.map(k=>rname(k)+' → '+pend[k]).join(' · ')+'</span><span class="btn sm ghost" style="margin-left:auto;cursor:pointer" data-rl="undo">Отменить</span><span class="btn sm p" style="cursor:pointer" data-rl="ok">Применить</span>';
      else if(S.conn.rolesAt) note.innerHTML='<span class="m" style="color:var(--ok)">применено в '+hhmm(S.conn.rolesAt)+'</span><span>действует со следующего хода каждой роли</span>';
      else { note.innerHTML=note.dataset.h0; note.querySelectorAll('.btn').forEach((b,i)=>{ b.style.cursor='pointer'; b.dataset.rl=i?'ok':'undo'; }); } }
    const KEYL=()=>[['qwen','q','Q','Qwen · Alibaba','ключ api · sk-…8f2a','связка ключей · с 15.09','key']].concat(S.conn.on.openrouter||S.conn.rev.openrouter?[['openrouter','r','R','OpenRouter','ключ api · sk-or-…(маска)','связка ключей · с сегодня','key']]:[],
      [['claude','c','C','Claude','вход через аккаунт · 2 места','сессия браузера · с 29.09','login'],['codex','o','X','Codex','вход через аккаунт','сессия · с 22.09','login'],['kimi','k','K','Kimi','cli · диспетчер kimi_seat','сессия cli · с 27.09','login'],['devin','d','D','Devin','сессия lydian-cowbell','хук stop · с 27.09','login']]);
    function applyKeys(){ if(!kvw) return; const list=KEYL(), rv=list.filter(x=>S.conn.rev[x[0]]).length;
      kvw.innerHTML='<div class="sum"><div><b>'+list.filter(x=>x[6]==='key').length+'</b><small>ключей api в связке</small></div><div><b>'+list.filter(x=>x[6]==='login').length+'</b><small>входов через аккаунт</small></div><div><b'+(rv?' class="bad"':'')+'>'+rv+'</b><small>отозвано</small></div><div><b>'+(S.conn.keysChk?hhmm(S.conn.keysChk):'12 мин')+'</b><small>'+(S.conn.keysChk?'последняя проверка':'назад проверены')+'</small></div></div>'+
        '<div class="list"><div class="row head"><span></span><span>что</span><span>где хранится</span><span>состояние</span><span>действие</span><span></span></div>'+list.map(x=>{ const r=S.conn.rev[x[0]]; return '<div class="row'+(r?' off':'')+'" data-key="'+x[0]+'" style="cursor:default"><span class="lg '+x[1]+'">'+x[2]+'</span><div><b>'+x[3]+'</b><small>'+x[4]+'</small></div><div class="st">'+x[5]+'</div><div class="num" style="font-size:12px">'+(r?'отозван в '+hhmm(r):'<span style="color:var(--ok)">действует</span>')+'</div><div class="pay"><span class="btn sm'+(r?' p':'')+'" data-kact="'+(r?'back':'rev')+'" style="cursor:pointer">'+(r?'Вернуть':(x[6]==='key'?'Отозвать':'Выйти'))+'</span></div><span class="chev"></span></div>'; }).join('')+'</div>'+
        '<div class="foot-note" style="display:flex;gap:12px;align-items:center;margin-top:12px"><span class="mono">ключи лежат в связке ключей этой машины · в прототипе показаны маски, настоящих ключей нет</span><span class="btn sm" data-kact="check" style="margin-left:auto;cursor:pointer">Проверить все</span></div>'; }
    hooks.push(applyRoles); hooks.push(applyKeys);
    document.addEventListener('click',e=>{ const mi=e.target.closest('#v-roles .live-menu [data-model]'), s=e.target.closest('#v-roles .sel'), nb=e.target.closest('#v-roles .note [data-rl]'), kb=e.target.closest('#v-keys [data-kact]');
      if(mi&&curRR){ e.stopPropagation(); pend[curRR]=mi.dataset.model; applyRoles(); return; }
      if(s){ e.stopPropagation(); const r=s.closest('.rr'), open=s.querySelector('.live-menu'); document.querySelectorAll('.live-menu').forEach(x=>x.remove()); if(!open){ curRR=r.dataset.key; const m=document.createElement('div'); m.className='live-menu'; m.style.cssText='left:0;right:auto'; m.innerHTML=ML.map(x=>'<div data-model="'+x[0]+'">'+x[0]+'</div>').join(''); s.appendChild(m); } return; }
      if(nb){ e.stopPropagation(); const ks=Object.keys(pend);
        if(nb.dataset.rl==='undo'){ pend={}; applyRoles(); if(!ks.length&&note) note.style.display='none'; toast('Изменения ролей отменены'); return; }
        if(ks.length){ const prev={}, txt=ks.map(k=>rname(k)+' → '+pend[k]).join(', '); ks.forEach(k=>{ prev[k]=(S.swarm.a[k]||{}).model; (S.swarm.a[k]=S.swarm.a[k]||{}).model=pend[k]; }); pend={}; S.conn.rolesAt=now(); save(); log('подключения','Модели ролей применены: '+txt); applyRoles(); toast('Модели ролей применены — в стае они уже такие',()=>{ ks.forEach(k=>{ if(prev[k]) S.swarm.a[k].model=prev[k]; else delete S.swarm.a[k].model; }); save(); applyRoles(); }); }
        else { S.conn.rolesAt=now(); save(); log('подключения','Роли: воркер 2 вернётся на Codex после сброса'); applyRoles(); toast('Применено: воркер 2 вернётся на Codex после сброса'); } return; }
      if(kb){ e.stopPropagation(); const a=kb.dataset.kact, row=kb.closest('[data-key]'), k=row&&row.dataset.key, name=row&&row.querySelector('b').textContent;
        if(a==='check'){ S.conn.keysChk=now(); save(); log('подключения','Ключи и входы проверены'); applyKeys(); toast('Проверено: все действующие ключи и входы отвечают'); }
        else if(a==='rev'){ S.conn.rev[k]=now(); S.conn.off[k]=1; save(); log('подключения',name+': доступ отозван'); refresh(); toast(name+': доступ отозван, провайдер отключён',()=>{ delete S.conn.rev[k]; delete S.conn.off[k]; save(); refresh(); }); }
        else { delete S.conn.rev[k]; delete S.conn.off[k]; save(); log('подключения',name+': доступ возвращён'); refresh(); toast(name+': доступ возвращён'); } } },true);
  }

  // ══ АРТЕФАКТЫ · витрина ══
  if(PAGE==='art'){
    S.art.show=S.art.show||{upd:{},off:{}}; S.art.shared=S.art.shared||{};
    const box=document.querySelector('#v-show .show'), cards=[...document.querySelectorAll('#v-show .sc[data-s]')], names={}; let curSh=null;
    cards.forEach(c=>{ c.dataset.h0=c.innerHTML; }); document.querySelectorAll('#v-list .li[data-a]').forEach(li=>{ names[li.dataset.a]=li.querySelector('b').textContent; });
    function applyShow(){ cards.forEach(c=>{ const k=c.dataset.s; c.innerHTML=c.dataset.h0; const f=c.querySelectorAll('.f span'), pp=c.querySelector('p');
        if(S.art.show.upd[k]){ if(k==='rep'&&pp) pp.textContent='закреплена версия 3 — актуальна'; if(f[0]) f[0].textContent=(k==='rep'?'версия 3 · ':'')+'проверено в '+hhmm(S.art.show.upd[k]); if(f[1]){ f[1].textContent='в норме'; f[1].style.color='var(--ok)'; } }
        c.style.opacity=S.art.show.off[k]?'.38':''; if(S.art.show.off[k]&&f[1]){ f[1].textContent='снято с витрины'; f[1].style.color='var(--ink3)'; } });
      if(box){ box.querySelectorAll('[data-live-s]').forEach(x=>x.remove()); Object.keys(S.art.shared).forEach(k=>{ if(!names[k]) return; const d=document.createElement('div'); d.className='sc'; d.dataset.liveS=k; d.style.cursor='pointer'; d.innerHTML='<b>'+esc(names[k])+'</b><p>отправлено вами на витрину из списка артефактов</p><div class="f"><span>сегодня</span><span style="color:var(--ok)">в норме</span></div>'; box.appendChild(d); }); } }
    hooks.push(applyShow);
    document.addEventListener('click',e=>{ const c=e.target.closest('#v-show .sc[data-s]'); if(c){ curSh=c.dataset.s; setTimeout(()=>{ const acts=document.querySelector('.ovl.on .panel .acts'); if(acts&&S.art.show.off[curSh]) acts.innerHTML='<span class="btn sm p">Вернуть на витрину</span><span class="btn sm ghost" data-close>Закрыть</span>'; },0); }
      const ls=e.target.closest('#v-show [data-live-s]'); if(ls&&window.HX){ const k=ls.dataset.liveS; curSh='live:'+k; HX.open(ls,'<div class="from">раскрытая карточка · витрина</div><div class="ch"><h3>'+esc(names[k])+'</h3></div><div class="csub">отправлено вами · видно всем, у кого есть ссылка и вход</div>'+HX.acts([['Снять с витрины','p'],['Закрыть','ghost','data-close']]),{w:560,h:260}); return; }
      const b=e.target.closest('.panel .acts .btn'); if(!b||!curSh||!document.querySelector('#v-show.on')) return; const lab=b.textContent.trim();
      if(curSh.indexOf('live:')===0){ if(/^Снять/.test(lab)){ const k=curSh.slice(5); delete S.art.shared[k]; save(); log('артефакты',names[k]+' снят с витрины'); HX.close(); applyShow(); toast('Снято с витрины'); } return; }
      const k=curSh, name=((cards.find(x=>x.dataset.s===k)||document).querySelector('b')||{}).textContent;
      if(/^Обновить и проверить/.test(lab)){ S.art.show.upd[k]=now(); save(); log('артефакты','Витрина: «'+name+'» обновлена и проверена'); applyShow(); toast('Витрина обновлена: <b>'+esc(name)+'</b>'); }
      else if(/^Снять с витрины/.test(lab)){ S.art.show.off[k]=1; save(); log('артефакты','Витрина: «'+name+'» снята'); HX.close(); applyShow(); toast('Снято с витрины',()=>{ delete S.art.show.off[k]; save(); applyShow(); }); }
      else if(/^Вернуть на витрину/.test(lab)){ delete S.art.show.off[k]; save(); log('артефакты','Витрина: «'+name+'» возвращена'); HX.close(); applyShow(); toast('Возвращено на витрину'); }
      else if(/^Открыть как внешний/.test(lab)){ if(k==='ds') location.href='../design-system.html'; else if(k==='map'&&/autoiflow/.test(location.hostname)) location.href='/map/#/om-map'; else toast('Внешние видят это по ссылке с входом; в прототипе страница не открывается'); } },true);
  }

  // ══ РЕСЁРЧ · прошлые исследования: поиск и «продолжить» ══
  if(PAGE==='res'){
    S.res.cont=S.res.cont||{}; const prow=[...document.querySelectorAll('#v-past .li[data-p]')], sr=document.querySelector('#v-past .srch'); let curPast=null;
    prow.forEach(li=>{ const c=li.querySelectorAll(':scope > .m')[2]; li.dataset.ap0=c?c.textContent:''; li.dataset.apc0=c?c.style.color:''; });
    if(sr){ sr.innerHTML='<input class="live-in" placeholder="⌕ Поиск по объектам: продукт, метод, термин…" style="font-size:13px">'; const inp=sr.querySelector('input'); inp.addEventListener('input',()=>{ const qv=inp.value.trim().toLowerCase(); let n=0; prow.forEach(li=>{ const ok=!qv||li.textContent.toLowerCase().includes(qv); li.style.display=ok?'':'none'; if(ok) n++; });
        let em=document.querySelector('#v-past .live-empty'); if(!em){ em=document.createElement('div'); em.className='li dim live-empty'; em.style.cursor='default'; em.innerHTML='<div><small>Среди прошлых исследований ничего не найдено.</small></div>'; document.querySelector('#v-past .lst').appendChild(em); } em.style.display=n?'none':''; }); }
    function applyPast(){ prow.forEach(li=>{ const c=li.querySelectorAll(':scope > .m')[2]; if(!c) return; const x=S.res.cont[li.dataset.p]; c.textContent=x?'продолжено сегодня в '+hhmm(x):li.dataset.ap0; c.style.color=x?'var(--accent)':li.dataset.apc0; }); }
    hooks.push(applyPast);
    document.addEventListener('click',e=>{ const li=e.target.closest('#v-past .li[data-p]'); if(li) curPast=li.dataset.p; const b=e.target.closest('.panel .acts .btn'); if(!b||!curPast||!document.querySelector('#v-past.on')) return; const lab=b.textContent.trim(), k=curPast, name=prow.find(r=>r.dataset.p===k).querySelector('b').textContent;
      if(/^Продолжить это исследование/.test(lab)){ S.res.cont[k]=now(); save(); log('ресёрч','Продолжено прошлое исследование: '+name.slice(0,60)); HX.close(); applyPast(); toast('Исследование продолжено — ресёрчер получит его вопросы',()=>{ delete S.res.cont[k]; save(); applyPast(); }); }
      else toast('В прототипе «'+esc(lab)+'» ничего не открывает: отчёты лежат в папке проекта'); },true);
  }

  // ══ ДОКУМЕНТ СТАДИИ · версии: новые версии от ваших правок, «Открыть» и «Сравнить» ══
  if(PAGE==='doc'){
    const vb=document.getElementById('vers'); if(vb) vb.addEventListener('click',()=>setTimeout(()=>{ const inner=document.querySelector('.ovl.on .panel .inner'), first=inner&&inner.querySelector('.vrow'); if(!first||inner.querySelector('.live-v')) return;
      const live=[]; let n=6; ['risk','budget'].forEach(k=>{ if(S.doc.fill[k]){ n++; live.push(['v'+n,({risk:'раздел 5 · риски',budget:'раздел 6 · бюджет'}[k])+' — '+(S.doc.fill[k]==='self'?'заполнен вами':'заполнен оркестратором'),'сегодня']); } }); if(S.doc.signed){ n++; live.push(['v'+n,'переход подписан · стадия закрыта','вы · '+hhmm(S.doc.signed)]); }
      if(!live.length) return; live.reverse(); first.insertAdjacentHTML('beforebegin',live.map((v,i)=>'<div class="vrow live-v"><b>'+v[0]+'</b><span>'+v[1]+'</span><span class="m">'+v[2]+'</span><span>'+(i===0?'<span class="pill acc">текущая</span>':'<span class="btn sm ghost">Открыть</span>')+'</span></div>').join(''));
      const old=inner.querySelector('.vrow:not(.live-v) .pill.acc'); if(old) old.outerHTML='<span class="btn sm ghost">Открыть</span>'; const h=inner.querySelector('.ch h3'); if(h) h.textContent='Версии документа · '+(n+1); },60));
    document.addEventListener('click',e=>{ const b=e.target.closest('.panel .vrow .btn'); if(!b) return; const row=b.closest('.vrow'), v=row.querySelector('b').textContent, nx=row.nextElementSibling, was=nx&&nx.classList.contains('live-vd'); document.querySelectorAll('.live-vd').forEach(x=>x.remove()); if(was) return;
      const cmp=/^Сравнить/.test(b.textContent.trim()), what=row.children[1].textContent;
      row.insertAdjacentHTML('afterend','<div class="blk live-vd" style="margin:6px 0 10px">'+(cmp?'<div class="t"><span>чем '+v+' отличается от v6</span><span>3 изменения</span></div><ul><li><b>+ раздел 5 · Риски:</b> добавлены риски 1–3</li><li><b>+ раздел 6 · Бюджет:</b> внесён факт — 14,2 % недели Claude и 31 $ Codex</li><li><b>~ раздел 3 · Состав блоков:</b> 87 задач, без изменений</li></ul>':'<div class="t"><span>версия '+v+'</span><span>только описание</span></div><p>'+esc(what)+'. В прототипе у прошлых версий хранится описание; полный текст есть у текущей.</p>')+'</div>'); },true);
  }

  // ══ НАСТРОЙКИ: элементы и подтверждения принадлежат set.js ══
  // ══ ПЕРВЫЙ ЗАПУСК: выбор запоминается, первый вопрос уходит в чат ══
  if(PAGE==='first'){
    const s3=document.querySelector('.st[data-s="3"]'), inEl=s3&&s3.querySelector('.in'); let fi=null;
    const pick=n=>{ const pk=document.querySelector('.st[data-s="'+n+'"] .pick.on'); return pk?pk.childNodes[0].textContent.replace(/^[^A-Za-zА-Яа-яЁё]+/,'').trim():''; };
    function begin(){ const qv=(fi&&fi.value||'').trim(), room=/Комната/.test(pick(1)); S.first={place:room?'без проекта':'в проекте: HARNESS',model:pick(2).split(' — ')[0]||'Claude',at:now()}; if(qv) S.pending={text:qv,t:now()}; save(); log('чат','Первый запуск: '+S.first.place+' · '+S.first.model); location.href=qv?'01-chat.html':'10-new-chat.html'; }
    if(inEl){ const def=inEl.childNodes[0].textContent.trim(); inEl.innerHTML='<input class="live-in" style="font-size:13.5px" value="'+esc(def)+'"><span class="k">⏎</span>'; fi=inEl.querySelector('input'); fi.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); begin(); } }); }
    document.addEventListener('click',e=>{ const b=e.target.closest('.st[data-s="3"] .btn.p'); if(b){ e.stopPropagation(); e.preventDefault(); begin(); return; }
      if(e.target.closest('[data-go="3"]')){ const kb=document.querySelectorAll('.st[data-s="3"] .kv b'), room=/Комната/.test(pick(1)), m=pick(2).split(' — ')[0]||'Claude'; if(kb[0]) kb[0].textContent=room?'комната без проекта':'~/HARNESS · только чтение'; if(kb[1]) kb[1].textContent=m+(m==='Claude'?' · Sonnet · усилие среднее':''); } },true);
  }

  // ══ УЙТИ: мастер условий, без исполнения и фиктивной подписи ══
  if(PAGE==='away'){
    const segVal=i=>{ const sg=document.querySelectorAll('.panel [data-step="2"] .seg')[i]; return sg&&sg.querySelector('.on')?sg.querySelector('.on').textContent.trim():''; };
    document.addEventListener('click',e=>{ const kk=e.target.closest('#k'), b=e.target.closest('.panel .btn');
      if(kk){ e.stopPropagation(); e.preventDefault(); openPal(); return; }
      if(!b) return; const lab=b.textContent.trim();
      if(b.closest('[data-step="2"]')&&b.dataset.go==='3'){ const kb=document.querySelectorAll('.panel [data-step="3"] .kv b'), d=segVal(1)||'Fable'; if(kb[0]) kb[0].textContent=segVal(0)||'до 09:00'; if(kb[1]) kb[1].textContent=/никому/.test(d)?'никто — всё ждёт вас':d+' · права из шага 2'; }
      else if(/^Подписать уход/.test(lab)){e.preventDefault();e.stopImmediatePropagation();toast('условия ухода движок пока не исполняет')} },true);
    setTimeout(()=>{const button=document.getElementById('leave');if(button)button.click()},0);
  }

  // ── боковая панель: чаты папки из харнесса под пунктом «Чат» и «недавние» на стартовом — выбор открывает чат (та же логика, что в свитчере; слово владельца 08.10)
  // ── боковая панель: данные движка поверх каркаса proto.js — папка в шапке, закреплённые, папки с проектными пунктами и чатами
  const base=p=>(p||'').replace(/\/+$/,'').split('/').pop()||p;
  const pl=(n,a,b,c)=>{ const m=n%10, h=n%100; return (h>=11&&h<=14)?c:(m===1?a:(m>=2&&m<=4?b:c)); };
  const PIN='<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v5"/></svg>';
  const PROJ_ITEMS=[['doc','Документ стадии'],['art','Артефакты'],['mem','Память проекта'],['res','Ресёрч']];   // относятся к папке проекта — лежат внутри раскрытой папки
  const ico=k=>window.psIcon?window.psIcon(k):'';
  const PROJECT_FOLD_KEY='harnessy-project-fold:';
  function projectExpanded(project){try{const value=localStorage.getItem(PROJECT_FOLD_KEY+project.path);if(value==='1'||value==='0')return value==='1'}catch(e){}return !!project.current}
  function projectFolder(project,projectHTML,chatsHTML,pinBtn){const current=!!project.current,open=projectExpanded(project),path=esc(project.path);
    return '<div class="ps-folder pinnable'+(current?' cur':'')+'" data-folder="'+path+'" data-cur="'+(current?1:0)+'" title="'+path+'"><button type="button" class="chev" data-folder-toggle="'+path+'" aria-expanded="'+open+'" aria-label="Свернуть или развернуть проект '+esc(project.name)+'">'+(open?'⌄':'›')+'</button>'+ico('folder')+'<span class="t">'+esc(project.name)+'</span><span class="m">'+(project.seats==null?'':project.seats+' '+pl(project.seats,'роль','роли','ролей'))+(project.git?' · git':'')+'</span>'+pinBtn('folder',project.path)+'</div><div class="ps-fold-body"'+(open?'':' style="display:none"')+'>'+(current?projectHTML+chatsHTML:'<div class="ps-chat more">Откройте проект, чтобы увидеть его чаты</div>')+'</div>'}
  function toggleProjectFolder(path){const project=(H.projects||[]).find(project=>project.path===path);if(!project)return;const open=!projectExpanded(project);try{localStorage.setItem(PROJECT_FOLD_KEY+path,open?'1':'0')}catch(e){}
    document.querySelectorAll('.ps-folder[data-folder]').forEach(row=>{if(row.dataset.folder!==path)return;const button=row.querySelector('[data-folder-toggle]');if(button){button.textContent=open?'⌄':'›';button.setAttribute('aria-expanded',String(open))}const body=row.nextElementSibling;if(body&&body.classList.contains('ps-fold-body'))body.style.display=open?'':'none'})}
  let sideGeneration=0;
  async function sideChats(){ if(!H.on) return; const project=H.project,generation=++sideGeneration,current=()=>H.project===project&&sideGeneration===generation;let r=null; try{ r=await api('/api/chats'); }catch(e){} if(!current()||!r||!Array.isArray(r.chats)) return; const all=r.chats.filter(c=>c.messages>0);
    if(!H.projects){ try{ const pr=await api('/api/projects');if(!current())return; H.projects=(pr.projects||[]).filter(p=>p.path!==H.defaultDir); H.homeHint=(pr.current||'').replace(/\/[^/]*$/,'/'); }catch(e){if(!current())return; H.projects=[]; } }
    let pins=[]; try{ pins=(await api('/api/pins')).pins||[]; }catch(e){}
    if(!current())return;
    if(S.ui.openChat){ const id=S.ui.openChat; S.ui.openChat=null; save(); if(all.some(c=>c.id===id)){ await openChatRow(id,null); return; } }   // после смены папки — открыть закреплённый чат
    const seats=(H.panes||[]).filter(p=>p.id!=='room'), rooms=all.filter(c=>c.pane==='room').sort((a,b)=>(b.last||0)-(a.last||0)), cur=H.project||'';
    const pinned=(kind,path,chat)=>kind==='chat'?pins.some(p=>p.kind==='chat'&&p.chat===chat):pins.some(p=>p.kind==='folder'&&(path===cur?p.current:p.path===path));   // пути не сравниваем строкой — у движка флаг current (realpath)
    const pinBtn=(kind,path,chat)=>'<span class="ps-pin'+(pinned(kind,path,chat)?' on':'')+'" data-pin-toggle="'+kind+'" data-path="'+esc(path)+'"'+(chat?' data-chat-id="'+chat+'"':'')+' title="'+(pinned(kind,path,chat)?'Снять закрепление':'Закрепить')+'">'+PIN+'</span>';
    // роль → её активный чат (один на роль); закрытые — счётчиком; роль без чата открывается с вводной (правило движка)
    const roleRow=p=>{ const c=all.find(x=>x.pane===p.id&&x.active), closed=all.filter(x=>x.pane===p.id&&!x.active).length;
      return '<div class="ps-chat role pinnable'+(c?' act':'')+(p.busy?' busy':'')+'" data-chat="'+(c?c.id:'')+'" data-pane="'+p.id+'" title="'+esc(paneName(p))+' · '+esc(c?(c.title||'вводная роли'):'чата ещё нет — откроется с вводной')+(closed?' · закрытых: '+closed:'')+'"><i></i><span class="t">'+esc(paneName(p))+'</span><span class="s">'+esc(c?(c.title||'вводная роли'):'новый чат')+'</span>'+(closed?'<span class="m">+'+closed+'</span>':'')+(c?pinBtn('chat',cur,c.id):'')+'</div>'+(p.waiting?waitingControls(p,p.waiting,cur,true):''); };
    const roomRow=c=>{ const room=H.panes.find(p=>p.id==='room'); return '<div class="ps-chat pinnable'+(c.active?' act':'')+'" data-chat="'+c.id+'" data-pane="room" title="'+esc(c.title||'без названия')+' · без роли"><i></i><span class="s one">'+esc(c.title||'без названия')+'</span>'+pinBtn('chat',cur,c.id)+'</div>'+(c.active&&room&&room.waiting?waitingControls(room,room.waiting,cur,true):''); };
    const shown=rooms.slice(0,5);
    const waitingRoom=H.panes.find(p=>p.id==='room'&&p.waiting),roomDoor=waitingRoom&&!shown.some(c=>c.active)?'<div class="ps-chat" data-chat="" data-pane="room"><i></i><span class="t">Без роли</span><span class="s">'+(waitingRoom.waiting.status==='recovering'?'восстановление ответа':'итог хода неизвестен')+'</span></div>'+waitingControls(waitingRoom,waitingRoom.waiting,cur,true):'';
    const chatsHTML=seats.map(roleRow).join('')+(seats.length&&rooms.length?'<div class="ps-chat hdr">без роли</div>':'')+shown.map(roomRow).join('')
      +roomDoor+(rooms.length>shown.length?'<div class="ps-chat more">ещё '+(rooms.length-shown.length)+' — в списке чатов у поля ввода</div>':'')+(seats.length||rooms.length||waitingRoom?'':'<div class="ps-chat more">в проекте пока нет ролей и чатов</div>');
    const projHTML=PROJ_ITEMS.map(([k,t])=>'<div class="nav psub'+(window.psKey===k?' on':'')+'" data-go="'+k+'" title="'+t+'">'+ico(k)+'<span class="t">'+t+'</span></div>').join('');
    const folderRow=pr=>projectFolder(pr,projHTML,chatsHTML,pinBtn);
    const pinRow=p=>p.kind==='folder'?'<div class="ps-chat pin'+(p.current?' act':'')+'" data-pin-folder="'+esc(p.path)+'" data-cur="'+(p.current?1:0)+'" title="'+esc(p.path)+'"><i></i><span class="t">'+esc(p.name)+'</span><span class="m">проект</span></div>'
      :'<div class="ps-chat pin'+(p.current&&all.some(c=>c.id===p.chat&&c.active)?' act':'')+'" data-pin-chat="'+p.chat+'" data-pin-path="'+esc(p.path)+'" data-cur="'+(p.current?1:0)+'" title="'+esc(p.title||'без названия')+' · '+esc(p.label||'')+(p.current?'':' · '+esc(p.name))+'"><i></i><span class="s one">'+esc(p.title||'без названия')+'</span><span class="m">'+esc(p.label||'')+(p.current?'':' · '+esc(p.name))+'</span></div>';
    document.querySelectorAll('aside.side.ps .nav[data-go="chat"] .m').forEach(m=>m.textContent=all.length||'');
    // честная панель при подключённом движке (Kimi UX-5 №129): квот подписок движок не отдаёт — без выдуманных процентов; план — демо; «Новый чат» — без роли
    document.querySelectorAll('aside.side.ps .limits').forEach(el=>{ el.innerHTML='<div class="row"><span>Расход</span><b>открыть →</b></div>'; el.title='Расход по ходам — под ответами; квоты подписок движок пока не отдаёт'; });
    document.querySelectorAll('aside.side.ps .nav[data-go="plan"]').forEach(n=>{ const m=n.querySelector('.m'); if(m) m.textContent='демо'; n.title='План · карта — демо-полотно, живого плана в движке пока нет'; });
    document.querySelectorAll('aside.side.ps .newbtn[data-go="new"], aside.side.ps .logo[data-go="new"]').forEach(b=>b.title='Новый разговор без роли (стартовый экран). Новый чат с ролью — чип «чат» у поля ввода');
    document.querySelectorAll('aside.side.ps .ps-pins').forEach(box=>{ box.innerHTML=pins.map(pinRow).join('')||'<div class="ps-chat more">закреплённых пока нет</div>'; });
    document.querySelectorAll('aside.side.ps .ps-folders').forEach(box=>{ box.innerHTML=(H.projects||[]).map(folderRow).join('')||'<div class="ps-chat more">папок пока нет</div>'; });
    document.querySelectorAll('aside.side.ps .ps-proj').forEach(b=>{ b.innerHTML=esc(cur?base(cur):'без проекта')+' <i>▾</i>'; b.title=(cur||'проект не выбран')+' — нажмите, чтобы сменить'; });
    document.querySelectorAll('.recent').forEach(rc=>{ rc.innerHTML='<span>недавние:</span>'+(all.slice(0,4).map(c=>'<span class="chip ps-chat'+(c.active?' act':'')+'" data-chat="'+c.id+'" data-pane="'+c.pane+'"><i></i>'+esc((c.title||'без названия').slice(0,38))+' <small>'+esc(c.label)+'</small></span>').join('')||'<span class="chip" style="opacity:.6">пока нет</span>'); }); }
  async function openChatRow(chatId,paneId){ invalidateBinding();if(chatId){ let r=null; try{ r=await api('/api/chats/open',{chat:chatId,carry:'text'}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; } S.ui.pane=r.pane.id; if(!r.already) toast('Открыт чат: '+esc((r.chat&&r.chat.title)||'без названия')+(r.carried?' · прежний чат закрыт, контекст передан текстом':'')); }   // то же, что чип чата: смена ленты не молчит (Kimi UX-5 №129 п.2)
    else S.ui.pane=paneId;   // у роли чата ещё нет — чат начнётся с вводной (движок: /api/onboard один раз)
    S.ui.fresh=false; S.ui.switched=true; save(); if(PAGE==='chat'){ await refreshStatus(); await loadChat(); sideChats(); } else location.href='01-chat.html'; }
  async function sideSwitchProject(path,openChat){ invalidateBinding();let r=null; try{ r=await api('/api/project',{path}); }catch(x){} if(!r||!r.ok){ toast('Проект не открылся: '+esc((r&&r.error)||'нет связи')); return; }
    if(S.cx) S.cx.noFolder=false; S.ui.pane='room'; S.ui.fresh=true; S.ui.switched=false; S.ui.openChat=openChat||null; save(); H.projects=null; log('настройка','Проект: '+base(path)); toast('Проект: '+esc(base(path))); if(PAGE==='new') await refreshStatus(); else location.href='10-new-chat.html'; }
  document.addEventListener('click',async e=>{ const toggle=e.target.closest('[data-folder-toggle]');if(toggle&&H.on){e.preventDefault();e.stopImmediatePropagation();toggleProjectFolder(toggle.dataset.folderToggle);return}
    const pt=e.target.closest('[data-pin-toggle]'); if(pt){ e.preventDefault(); e.stopPropagation(); let r=null; try{ r=await api('/api/pins',{kind:pt.dataset.pinToggle,path:pt.dataset.path,chat:pt.dataset.chatId||''}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; } toast(r.on?'Закреплено':'Закрепление снято'); sideChats(); return; }
    const pf=e.target.closest('[data-pin-folder]'); if(pf){ e.preventDefault(); e.stopPropagation(); if(pf.dataset.cur!=='1') await sideSwitchProject(pf.dataset.pinFolder); return; }
    const pc=e.target.closest('[data-pin-chat]'); if(pc){ e.preventDefault(); e.stopPropagation(); if(pc.dataset.cur==='1') await openChatRow(pc.dataset.pinChat,null); else await sideSwitchProject(pc.dataset.pinPath,pc.dataset.pinChat); return; }
    const fr=e.target.closest('.ps-folder[data-folder]'); if(fr){ e.preventDefault(); e.stopPropagation(); await sideSwitchProject(fr.dataset.folder); return; }
    const c=e.target.closest('.ps-chat[data-pane]'); if(!c||c.classList.contains('hdr')||c.classList.contains('more')) return; e.preventDefault(); e.stopPropagation(); await openChatRow(c.dataset.chat||'',c.dataset.pane); });
  // меню профиля (скетч 07): всплывает из кнопки профиля в панели; отдельный кадр #f2 не открываем
  document.addEventListener('click',e=>{ const u=e.target.closest('aside.side.ps [data-go="profile"]'); if(!u) return; e.preventDefault(); e.stopImmediatePropagation();
    const items=[{t:'<b>Локальное окно</b> <small>без входа</small>',dis:true},{t:'Проект: '+esc((H.project||'').split('/').pop()||'не выбрана'),r:'сменить',act:'proj'},{t:'Облик',r:'A · Графит',href:'06-settings.html#p=look'},{t:'Клавиши',r:'⌘/',href:'06-settings.html#p=keys'},{t:'Настройки',r:'⌘,',href:'06-settings.html#p=profile'},{t:'Выйти',r:'на сайте harnessy.ai',dis:true}];
    laMenu(u.closest('.ps-foot')||u,'профиль',items.filter(it=>!(H.on&&it.dis)),it=>{ if(it.href) location.href=it.href; else if(it.act==='proj'){ const pj=document.querySelector('aside.side.ps .ps-proj'); if(pj) pj.click(); } }); },true);
  // папка проекта: строка в шапке (и значок папки в рейке) — меню смены
  document.addEventListener('click',async e=>{ const pj=e.target.closest('aside.side.ps .ps-proj, aside.side.ps [data-folders]'); if(!pj||!H.on) return; e.preventDefault(); e.stopPropagation();
    const items=(H.projects||[]).map(pr=>({t:esc(pr.name)+(pr.current?' <small>текущая</small>':''),r:(pr.seats==null?'':pr.seats+' '+pl(pr.seats,'роль','роли','ролей'))+(pr.git?' · git':''),path:pr.path,dis:!!pr.current})).concat([{t:'Открыть другой проект…',open:true}]);
    const hd=pj.closest('.ps-head')||pj;   // якорь — вся шапка: aside режет по краю, меню шириной в панель
    laMenu(hd,'проект',items,async it=>{ if(it.open){ laPath(hd,'открыть проект',H.homeHint||'',p=>sideSwitchProject(p),'Открыть'); return; } await sideSwitchProject(it.path); }); });
  let RSZ; addEventListener('resize',()=>{ clearTimeout(RSZ); RSZ=setTimeout(()=>sideChats(),300); });   // не ходить в движок на каждый пиксель ресайза (Kimi UX-5 №129)
  // ── запуск
  composer(); restoreUI(); wireSearch(); refresh(); sideChats();
  hConnect().finally(async()=>{ S.ui.switched=false; if(cols().length){ if(S.pending){ const pending=S.pending,q=pending.text;S.pending=null;
        const target=sendBinding();if(pending.target&&(pending.target.project!==target.project||pending.target.pane!==target.pane||pending.target.chat!==target.chat)){S.draft=q;save();render();toast('Разговор изменился; сообщение осталось в черновике');return}
        if(S.ui.fresh&&H.on&&H.pane&&H.pane.id==='room'){ try{ const r=await api('/api/chats/new',{pane:'room',carry:'none'}); if(!r||!r.ok)throw Error(r&&r.error||'нет связи');await refreshChats();S.chat=[]; }catch(e){S.draft=q;save();render();toast('Не вышло: '+esc(e.message));return} }   // новый чат без роли — параллельный прежним
        const binding=sendBinding();if(binding.project!==target.project||binding.pane!==target.pane){S.draft=q;save();render();toast('Разговор изменился; сообщение осталось в черновике');return}
        S.ui.fresh=false;save();await onSend(q,null,binding); } else render(); } });
  addEventListener('resize',()=>{ wireSearch(); badges(); });
  addEventListener('storage',()=>{ load(); refresh(); if(cols().length) render(); if(window.CX) CX.render(); });
  // ── «Журнал» при подключённом движке: записи /api/journal в разметке экрана (строки .li), фильтры по видам движка, карточка записи, тред целиком, слияние принятого вердикта владельцем
  let JR={records:[],threads:{},kind:'все',thread:null,timer:null,project:null,epoch:0,ranges:[],loadingMore:false,refreshId:0};
  function resetJournal(project){JR.project=project;JR.epoch++;JR.records=[];JR.threads={};JR.kind='все';JR.thread=null;JR.ranges=[];JR.loadingMore=false;JR.refreshId=0;journalDraw()}
  function journalBefore(){const ranges=JR.ranges;for(let i=ranges.length-1;i>0;i--)if(ranges[i][0]>ranges[i-1][1]+1)return ranges[i][0];return ranges.length&&ranges[0][0]>1?ranges[0][0]:null}
  function journalRange(low,high){if(low>high)return;const merged=[];for(const range of [...JR.ranges,[low,high]].sort((a,b)=>a[0]-b[0])){const previous=merged[merged.length-1];if(previous&&range[0]<=previous[1]+1)previous[1]=Math.max(previous[1],range[1]);else merged.push([...range])}JR.ranges=merged}
  const kindCls=r=>r.kind==='verdict'?((JR.threads[r.thread]||{}).accepted?'ok':'dec'):(r.kind==='blocker'||r.kind==='escalation')?'bad':(r.kind==='question'||r.kind==='decision'||r.kind==='review-request')?'dec':'';
  const who=id=>id==='owner'?'владелец':id==='harness'?'харнесс':(((H.panes||[]).find(p=>p.id===id)||{}).label||id);
  const jtime=ts=>{ const d=new Date(ts); return isNaN(d)?'':d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); };
  const jdate=ts=>{const d=new Date(ts);return isNaN(d)?'':d.toLocaleString('ru-RU',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})};
  const jrow=r=>'<div class="li jl'+(r.from==='owner'?' mine':'')+'" data-seq="'+r.seq+'"><span class="m">#'+r.seq+' · '+jtime(r.ts)+'</span><span><span class="jk '+kindCls(r)+'">'+esc(r.kind)+'</span></span><div><b>'+esc(String(r.text||'').split('\n')[0].slice(0,140))+'</b></div><span class="m">'+esc(who(r.from))+' → '+esc((r.to||[]).map(who).join(', '))+(r.thread?' · '+esc(r.thread):'')+'</span><span class="chev">›</span></div>';
  function journalDraw(){ const rows=document.getElementById('jrows');if(!rows)return;const all=JR.records, list=all.filter(r=>(JR.kind==='все'||r.kind===JR.kind)&&(!JR.thread||r.thread===JR.thread)).slice().sort((a,b)=>b.seq-a.seq);
    const kinds=['все',...new Set([...(H.kinds||[]),...all.map(r=>r.kind)])];
    const jf=document.getElementById('jf'); if(jf) jf.innerHTML=kinds.map(k=>'<span class="chip'+(k===JR.kind?' on':'')+'" data-jk="'+k+'">'+k+' · '+(k==='все'?all.length:all.filter(r=>r.kind===k).length)+'</span>').join('')+(JR.thread?'<span class="chip on" data-jthread="">тред '+esc(JR.thread)+' ×</span>':'')+'<span class="sp"></span><span class="mono">журнал линии · '+esc((H.project||'').split('/').pop()||'')+'</span>';
    const head='<div class="li head"><span>№ · когда</span><span>вид</span><span>что</span><span>кто → кому · тред</span><span></span></div>';
    rows.innerHTML=head+(list.length?list.map(jrow).join(''):'<div class="empty">'+(JR.kind!=='все'?'Среди загруженных записей нет вида '+esc(JR.kind)+'.':JR.thread?'Среди загруженных записей нет этого треда.':'Журнал линии пока пуст: первая запись появится с первым сообщением или назначением.')+'</div>');
    const more=document.getElementById('jmore');if(more)more.innerHTML=journalBefore()!==null?'<button type="button" class="btn sm ghost" data-jmore'+(JR.loadingMore?' disabled':'')+'>'+(JR.loadingMore?'Загружаю…':'Показать ещё')+'</button>':'<span class="mono">'+(all.length?'Все записи загружены':'')+'</span>';
    const mine=all.filter(r=>r.from==='owner').length, bad=all.filter(r=>r.kind==='blocker'||r.kind==='escalation').length, set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
    set('n-all',all.length); set('n-mine',mine); set('n-bad',bad); const lab=(id,t)=>{ const el=document.getElementById(id); const sm=el&&el.parentElement&&el.parentElement.querySelector('small'); if(sm) sm.textContent=t; }; lab('n-all','загружено записей'); lab('n-mine','от владельца среди загруженных'); lab('n-bad','среди загруженных');
    const newest=all.reduce((a,b)=>!a||b.seq>a.seq?b:a,null),st=document.getElementById('jst'); if(st) st.innerHTML='<i></i>'+(all.length===400&&journalBefore()!==null?'последние 400 записей':'загружено '+all.length+' записей')+(newest?' · последняя #'+newest.seq+' в '+jtime(newest.ts):''); const top=document.querySelector('.frame .top > b'); if(top) top.textContent='Журнал · '+((H.project||'').split('/').pop()||'проект');
    const jm=document.getElementById('jmine'); if(jm&&!jm.querySelector('.jnote')) jm.insertAdjacentHTML('afterbegin','<div class="li head jnote"><span></span><span></span><span>действия этого окна — локальная память браузера, не журнал линии</span><span></span><span></span></div>'); }
  async function journalFetch(more=false){const project=H.project||'';if(JR.project!==project)resetJournal(project);const epoch=JR.epoch,before=more?journalBefore():null,refreshId=more?JR.refreshId:++JR.refreshId;
    if(more&&(JR.loadingMore||before===null))return false;if(more){JR.loadingMore=true;journalDraw()}
    let r=null;try{r=await api('/api/journal?limit=400'+(more?'&before='+before:''))}catch(e){}
    if(JR.project!==project||H.project!==project||JR.epoch!==epoch||!more&&refreshId!==JR.refreshId)return false;
    if(more)JR.loadingMore=false;if(!r||!Array.isArray(r.records)){if(more)toast('Не удалось загрузить записи; уже загруженные сохранены');journalDraw();return false}
    const records=new Map(JR.records.map(record=>[record.seq,record]));for(const record of r.records)records.set(record.seq,record);JR.records=[...records.values()].sort((a,b)=>a.seq-b.seq);if(!more)JR.threads=r.threads||{};
    const low=r.records.length===400?Math.min(...r.records.map(record=>record.seq)):1,high=more?Math.min(before-1,r.lastSeq):r.lastSeq;journalRange(low,high);journalDraw();return true}
  function journalLive(){ const jf=document.getElementById('jf'); if(!jf||!H.on) return; jf.replaceWith(jf.cloneNode(false));   // снять слушатели заготовки
    window.renderJournal=journalDraw; journalFetch(); clearInterval(JR.timer); JR.timer=setInterval(()=>{ if(document.visibilityState==='visible') journalFetch(); },30000); addEventListener('storage',journalDraw); }
  const jcard=r=>{ const th=r.thread?(JR.threads[r.thread]||null):null, canMerge=r.kind==='verdict'&&r.sha&&th&&th.accepted&&th.sha===r.sha&&!th.merged;
    return '<div class="from">раскрытая карточка · запись журнала</div><div class="ch"><h3>#'+r.seq+' · '+esc(r.kind)+' · '+esc(who(r.from))+' → '+esc((r.to||[]).map(who).join(', '))+'</h3></div><div class="csub"><span class="jk '+kindCls(r)+'">'+esc(r.kind)+'</span> &nbsp;'+esc(jdate(r.ts))+(r.thread?' · тред '+esc(r.thread):'')+(r.reply_to?' · ответ на #'+r.reply_to:'')+(r.score!=null?' · балл '+r.score+(r.round?' · раунд '+r.round:''):'')+(r.sha?' · sha '+esc(String(r.sha).slice(0,10)):'')+'</div>'+
      '<div class="blk"><div class="t"><span>текст</span></div><pre style="white-space:pre-wrap;font:inherit;margin:0;max-height:260px;overflow:auto">'+esc(r.text||'')+'</pre></div>'+(th?'<div class="blk"><div class="t"><span>тред</span></div><p>раундов '+(th.rounds||0)+' · '+(th.accepted?'принят':'не принят')+(th.lastScore!=null?' · последний балл '+th.lastScore:'')+(th.merged?' · влит '+esc(String(th.merged).slice(0,10)):'')+'</p></div>':'')+
      '<div class="acts">'+(r.thread?'<span class="btn sm" data-jthread="'+esc(r.thread)+'">Тред целиком</span>':'')+(canMerge?'<span class="btn sm p" data-jmerge="'+esc(r.sha)+'" data-jseq="'+r.seq+'">Слить '+esc(String(r.sha).slice(0,7))+'</span>':'')+'<span class="btn sm ghost" data-close>Закрыть</span></div>'; };
  document.addEventListener('click',async e=>{ if(!H.on||!/21-journal\.html$/.test(location.pathname)) return;
    const more=e.target.closest('[data-jmore]');if(more){e.preventDefault();if(!more.disabled)await journalFetch(true);return}
    const k=e.target.closest('[data-jk]'); if(k){ JR.kind=k.dataset.jk; journalDraw(); return; }
    const tf=e.target.closest('[data-jthread]'); if(tf){ e.stopPropagation(); JR.thread=tf.dataset.jthread||null; if(window.HX&&HX.close) HX.close(); journalDraw(); return; }
    const mg=e.target.closest('[data-jmerge]'); if(mg){ e.stopPropagation(); if(!confirm('Слить '+mg.dataset.jmerge.slice(0,7)+' в интеграционную ветку по вердикту #'+mg.dataset.jseq+'? Движок пропустит только SHA с принятым вердиктом; корень проекта должен быть без незакоммиченных правок.')) return; mg.textContent='Сливаю…'; let r=null; try{ r=await api('/api/owner/merge',{sha:mg.dataset.jmerge,message:'слияние из окна по вердикту #'+mg.dataset.jseq}); }catch(x){} if(!r||!r.ok){ toast('Слияние не прошло: '+esc((r&&r.error)||'нет связи')); mg.textContent='Слить '+mg.dataset.jmerge.slice(0,7); return; } toast('Влито: '+esc(String(r.mergeSha||r.sha||'').slice(0,10))); if(window.HX&&HX.close) HX.close(); journalFetch(); return; }
    const li=e.target.closest('.li.jl[data-seq]'); if(li&&window.HX){ e.stopPropagation(); const r=JR.records.find(x=>String(x.seq)===li.dataset.seq); if(r) HX.open(li,jcard(r),{w:660,h:520}); } },true);
  // ── «Сейчас» при подключённом движке: «Чей ход» = открытые карточки подтверждений (SSE approval/approvalResolved, при подключении движок шлёт открытые), «Разрешить/Отказать» → /api/approve
  const NOW={cards:new Map(),es:null};
  function nowDraw(){ const lst=(document.querySelector('#v-turn .li.head')||{}).parentElement; if(!lst) return; const cards=[...NOW.cards.values()];
    const head='<div class="li head"><span>кто просит</span><span>что</span><span>ждёт</span><span>главное действие</span><span></span></div>';
    lst.innerHTML=head+(cards.length?cards.map(c=>'<div class="li" data-ap="'+esc(c.id)+'" data-ap-pane="'+esc(c.pane)+'"><span><span class="o need"></span>&nbsp; '+esc(who(c.pane))+'</span><div><b>'+esc(c.title||'подтверждение')+'</b><small>'+esc((c.detail||'').slice(0,160))+'</small></div><span class="m">с '+esc(c.since)+'</span><span><span class="btn sm p" data-ap-decision="allow">Разрешить</span> <span class="btn sm ghost" data-ap-decision="deny">Отказать</span></span><span></span></div>').join(''):'<div class="empty">Сейчас вас никто не ждёт: открытых карточек подтверждения нет. Вопросы и решения ролей — в журнале линии (экран «Журнал»).</div>');
    document.querySelectorAll('#v-turn .nums b.acc, #v-away .nums b.acc').forEach(b=>b.textContent=cards.length);
    document.querySelectorAll('#v-turn .nums b, #v-away .nums b, #v-week .nums b').forEach(b=>{ if(!b.classList.contains('acc')) b.textContent='—'; });   // прочие цифры экрана — демо, движок их не отдаёт
    document.querySelectorAll('#v-week .chip').forEach(c=>{ const box=c.parentElement; if(box&&!box.dataset.live){ box.dataset.live='1'; box.innerHTML='<span class="mono">недельные счётчики появятся из журнала линии</span>'; } });
    ['#v-week','#v-away'].forEach(sel=>{ const l=(document.querySelector(sel+' .li.head')||{}).parentElement; if(l&&!l.dataset.live){ l.dataset.live='1'; l.innerHTML='<div class="empty">При подключённом движке этот список не рисуется: решения и события линии — в журнале (экран «Журнал»), карточки подтверждений — во вкладке «Чей ход».</div>'; } });
    const st=document.querySelector('.frame .top .st'); if(st) st.innerHTML='<i'+(cards.length?' style="background:var(--accent)"':'')+'></i>'+(cards.length?cards.length+' '+plural(cards.length)+' вас':'никто не ждёт')+' · движок'; }
  function nowLive(){ if(!H.on||NOW.es) return; NOW.es=new EventSource('/api/events/all'); nowDraw();
    NOW.es.onmessage=e=>{ let ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if(ev.type==='approval'){ NOW.cards.set(ev.pane+'|'+ev.id,{pane:ev.pane,id:ev.id,title:ev.title,detail:ev.detail,since:new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}); nowDraw(); }
      else if(ev.type==='approvalResolved'){ NOW.cards.delete(ev.pane+'|'+ev.id); nowDraw(); } };
    NOW.es.onerror=()=>{ const st=document.querySelector('.frame .top .st'); if(st) st.innerHTML='<i></i>связь потеряна · переподключение…'; }; }
  document.addEventListener('click',async e=>{ const b=e.target.closest('[data-ap-decision]'); if(!b||PAGE!=='now'||!H.on) return; e.preventDefault(); e.stopPropagation(); const li=b.closest('[data-ap]'); if(!li) return;
    let r=null; try{ r=await api('/api/approve',{pane:li.dataset.apPane,id:li.dataset.ap,decision:b.dataset.apDecision}); }catch(x){} if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; } toast(b.dataset.apDecision==='allow'?'Разрешено':'Отказано'); NOW.cards.delete(li.dataset.apPane+'|'+li.dataset.ap); nowDraw(); },true);
  window.LIVE={stop,busy:()=>!!(H.cur||(H.pane&&H.pane.busy)),get S(){ return S; },save,H,api,esc,toast,log,paneName,hStatus,pickPane,openPal,md,refreshStatus,refreshChats,loadChat,selStart,laMenu,laPath,laMulti,sendBinding,bindingCurrent,invalidateBinding,configureSetting};   // для cx.js (поле ввода)
})();
