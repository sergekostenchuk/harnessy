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
  function load(){ try{ S=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ S=null; } if(!S||S.v!==1) S={v:1,dec:{},log:[],chat:[],pending:null,ui:{}};if(!S.attachmentDrafts||typeof S.attachmentDrafts!=='object'||Array.isArray(S.attachmentDrafts))S.attachmentDrafts={};delete S.away; }
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
  function waitList(){ const L=window.LIVE; if(L&&L.H&&L.H.on) return (L.H.panes||[]).filter(p=>p.waiting||(p.id!=='room'&&p.pendingApprovals>0)).map(p=>'карточка у «'+paneName(p)+'»'); return waiting().map(d=>DEC[d].toLowerCase()); }
  function badges(){ const list=waitList(), n=list.length;
    document.querySelectorAll('aside.side .nav[data-go="now"]').forEach(el=>{ let b=el.querySelector('.b'); if(!b){ b=document.createElement('span'); b.className='b'; el.appendChild(b); } b.textContent=n; b.style.display=n?'':'none'; });
    document.querySelectorAll('.m-drawer a.m-i[href="14-now.html"]').forEach(el=>{ let b=el.querySelector('small'); if(!b){ b=document.createElement('small'); el.appendChild(b); } b.textContent=n||''; });
    document.querySelectorAll('.ret').forEach(r=>{ r.style.display=n?'':'none'; const p=r.querySelector('.pill'); if(p) p.textContent='◆ '+n+' '+plural(n)+' вас';
      const tx=r.querySelector('span:not(.pill):not(.btn)'); if(tx&&n) tx.innerHTML='Пока вас не было: '+list.map(t=>'<b>'+esc(t)+'</b>').join(' и ');
      const b=r.querySelector('.btn'); if(b&&!b.dataset.live){ b.dataset.live=1; b.style.cursor='pointer'; b.addEventListener('click',()=>location.href=(window.LIVE&&window.LIVE.H.on)?'01-chat.html':'14-now.html'); } }); }

  // ── «Сейчас»: решение принимается кнопкой в строке или в раскрытой карточке
  let curD=null;
  function applyNow(){ if(PAGE!=='now') return;if(H.on){nowDraw();return} const n=waiting().length;
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
  document.addEventListener('click',e=>{ if(PAGE!=='now'||H.on) return; const li=e.target.closest('.li[data-d]'); if(li) curD=li.dataset.d;
    const b=e.target.closest('.btn'); if(!b) return;
    if(li&&li.contains(b)){ e.stopPropagation(); e.preventDefault(); const d=li.dataset.d; if(!DEC[d]) return;
      if(S.dec[d]){ delete S.dec[d]; save(); log('решение','Возвращено в очередь: '+DEC[d]); refresh(); toast('Возвращено в очередь'); } else resolve(d,b.dataset.label||b.textContent.trim()); return; }
    if(b.closest('.panel .acts')&&curD&&DEC[curD]){ const lab=b.textContent.trim(); if(/объясни/i.test(lab)){ toast('Объяснение — в карточке: что будет при «да» и при «нет»'); return; } resolve(curD,lab); if(window.HX) HX.close(); } },true);

  // ── мост к харнессу: если страницу отдал сам харнесс (~/HARNESS, :3777), чат идёт к настоящей модели по подписке, ответ — потоком событий
  const H={on:false,panes:[],pane:null,cur:null,asks:{}};
  // TS-18: each owner action carries an immutable project/engine binding.
  const TRACE={current:null,alive:true,last:new WeakMap(),controller:null};
  const traceUUID=()=>globalThis.crypto.randomUUID();
  function traceBinding(){const trace=H.liveStatus&&H.liveStatus.trace;return H.on&&!H.snapshotOnly&&trace&&trace.instanceId?{project:H.project,instanceId:trace.instanceId,pane:H.pane&&H.pane.id||null,chat:H.pane&&(H.active||{})[H.pane.id]||null}:null}
  function traceSame(b){const current=traceBinding();return !!current&&current.project===b.project&&current.instanceId===b.instanceId}
  function tracePost(ctx,kind='ui.action',outcome='ok',reason='none',error='',parent=null){if(!ctx||!traceSame(ctx.binding))return;
    const body={action:ctx.action,page:PAGE||'new',binding:ctx.binding,traceId:ctx.traceId,spanId:kind==='ui.action'?ctx.spanId:traceUUID(),parentSpanId:kind==='ui.action'?null:parent||ctx.spanId,kind,...(kind==='ui.outcome'?{outcome,reason,error}:{})};
    void fetch('/api/trace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{});
  }
  const traceFailures=[];
  function traceWindowFailure(action){const binding=traceBinding();if(!binding){if(traceFailures.length<10)traceFailures.push(action);return}const ctx={action,at:Date.now(),traceId:traceUUID(),spanId:traceUUID(),binding};tracePost(ctx,'ui.outcome','failed','internal',action)}
  addEventListener('error',()=>traceWindowFailure('Ошибка окна'));
  addEventListener('unhandledrejection',()=>traceWindowFailure('Необработанный отказ окна'));
  addEventListener('live:status',()=>{if(!traceBinding())return;for(const action of traceFailures.splice(0))traceWindowFailure(action)});
  function traceAction(action,element){if(!TRACE.alive)return null;const binding=traceBinding();if(!binding)return null;const label=String(action).replace(/[\x00-\x1f<>]/g,'').trim().slice(0,100)||'Открыть',last=element&&TRACE.last.get(element);if(last&&last.ctx.action===label&&Date.now()-last.at<500&&traceSame(last.ctx.binding)){TRACE.current=last.ctx;setTimeout(()=>{if(TRACE.current===last.ctx)TRACE.current=null},0);return last.ctx}
    const ctx={at:Date.now(),traceId:traceUUID(),spanId:traceUUID(),binding,action:label};TRACE.current=ctx;if(element)TRACE.last.set(element,{ctx,at:Date.now()});tracePost(ctx);setTimeout(()=>{if(TRACE.current===ctx)TRACE.current=null},0);return ctx;
  }
  function traceCapture(){return TRACE.current&&traceSame(TRACE.current.binding)?TRACE.current:null}
  function traceRequest(operation){const ctx=operation&&operation.trace||traceCapture();if(!ctx||!traceSame(ctx.binding))return null;return {ctx,headers:{'X-Harness-Trace-Id':ctx.traceId,'X-Harness-Span-Id':ctx.spanId,'X-Harness-Project':encodeURIComponent(ctx.binding.project),'X-Harness-Instance':ctx.binding.instanceId}}}
  function traceReply(trace,result,late=false,response=null){if(!trace)return;const code=late?'late_response':result&&result.code||'',reason=late?'late_response':/project|binding/.test(code)?'project_changed':/denied|approval/.test(code)?'approval_policy':/invalid|missing/.test(code)?'validation':result&&result.ok!==false?'none':'unavailable';tracePost(trace.ctx,'ui.outcome',late?'cancelled':result&&result.ok===false?'rejected':'ok',reason,result&&result.error||'',response&&response.headers.get('X-Harness-Span-Id'))}
  const traceControls='button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[onclick],.btn,.tog,summary,[data-v],[data-tab],[data-href],[data-p],[data-to],[data-action],[data-go],[data-col],[data-cx],[data-cx-seat],[data-cx-mode],[data-cx-model],[data-cx-tog],[data-cx-cmd],[data-cx-chat],[data-cx-newchat],[data-cx-off],[data-cx-back],[data-cx-proj],[data-cx-folder],[data-cx-nav],[data-cx-team-open],[data-cx-team-request],[data-cx-team-refresh],[data-k],[data-jthread],[data-jk],[data-la],[data-m],[data-c],[data-f],[data-pj],[data-rs],[data-es],[data-live-a],[data-passport],[data-sel],.ps-folder,.ps-chat,.ps-foot,.ps-head,.grp.fold,.live-stop,.live-pick,.lp-i,.opt,.seat[data-a],.win[data-a],.node[data-n],.li[data-n],.li[data-r],.li[data-s],.li[data-d],.li[data-q]';
  // Select actions describe the current choice on change, not the option list on click.
  function traceSelectLabel(el){
    const text=node=>{if(node===el||node.matches&&node.matches('input,select,textarea,button'))return '';const children=node.childNodes||node.children;return children&&children.length?Array.from(children).map(text).join(' '):node.textContent||''};
    const named=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)).filter(Boolean);
    const labels=el.labels?Array.from(el.labels):Array.from(document.querySelectorAll('label')).filter(label=>el.id&&label.getAttribute('for')===el.id||label.contains(el));
    return (el.dataset.action||el.getAttribute('aria-label')||named.map(text).join(' ').trim()||labels.map(text).join(' ').trim()||el.title||el.name||el.id||'Выбрать').trim().replace(/\s+/g,' ');
  }
  function traceSelectAction(el){
    const selected=el.selectedOptions?Array.from(el.selectedOptions):Array.from(el.querySelectorAll('option')).filter(option=>option.value===el.value);
    const field=traceSelectLabel(el).slice(0,30),label=selected.map(option=>option.label||option.getAttribute('label')||option.textContent).join(', ').trim().replace(/\s+/g,' ').slice(0,32),value=selected.map(option=>option.value).join(', ').slice(0,28);
    return field+': '+(selected.length?label+' ('+(value||'""')+')':'выбор отсутствует');
  }
  function traceMark(root=document){const mark=el=>{if(!el.dataset.action){const label=el.tagName==='SELECT'?traceSelectLabel(el):el.getAttribute('aria-label')||el.title||el.getAttribute('placeholder')||(el.tagName==='INPUT'||el.tagName==='TEXTAREA'?'Написать сообщение':el.textContent)||'Открыть';el.dataset.action=label.trim().replace(/\s+/g,' ').slice(0,100)||'Открыть'}};if(root.matches&&root.matches(traceControls))mark(root);root.querySelectorAll&&root.querySelectorAll(traceControls).forEach(mark)}
  traceMark();if(typeof MutationObserver!=='undefined'){TRACE.controller=new MutationObserver(rows=>{for(const row of rows)for(const node of row.addedNodes)if(node.nodeType===1)traceMark(node)});TRACE.controller.observe(document.body,{childList:true,subtree:true})}
  addEventListener('click',e=>{const el=e.target.closest&&e.target.closest(traceControls);if(!el||el.tagName==='SELECT'||el.disabled||el.getAttribute('aria-disabled')==='true')return;traceMark(el);const ctx=traceAction(el.dataset.action,el);if(el.closest('form'))el.closest('form').__traceSubmit=ctx;if(el.matches('a[href],[data-href],[data-v],[data-tab],[data-p],summary'))tracePost(ctx,'ui.outcome')},true);
  addEventListener('submit',e=>{if(e.target.__traceSubmit&&Date.now()-e.target.__traceSubmit.at<1000&&traceSame(e.target.__traceSubmit.binding)){TRACE.current=e.target.__traceSubmit;delete e.target.__traceSubmit;setTimeout(()=>{TRACE.current=null},0)}else traceAction(e.submitter&&e.submitter.dataset.action||'Отправить',e.target)},true);
  addEventListener('change',e=>{if(e.target.matches&&e.target.matches('input,select')){traceMark(e.target);traceAction(e.target.tagName==='SELECT'?traceSelectAction(e.target):e.target.dataset.action,e.target)}},true);
  addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&e.target.matches&&e.target.matches('textarea'))traceAction('Отправить',e.target);if(e.key==='Escape')tracePost(traceAction('Закрыть'),'ui.outcome')},true);
  addEventListener('popstate',()=>tracePost(traceAction('Назад'),'ui.outcome'));
  addEventListener('pagehide',()=>{tracePost(traceAction('Закрыть окно'),'ui.outcome');TRACE.alive=false;TRACE.current=null;TRACE.controller&&TRACE.controller.disconnect()});
  addEventListener('pageshow',e=>{if(e.persisted){TRACE.alive=true;traceMark();TRACE.controller&&TRACE.controller.observe(document.body,{childList:true,subtree:true})}});
  window.HARNESS_TRACE={action:traceAction,outcome:(ctx,outcome='ok',reason='none')=>tracePost(ctx,'ui.outcome',outcome,reason),capture:traceCapture};
  // End TS-18 action tracing.

  const api=(p,body,operation)=>{
    if(body&&H.snapshotOnly)return Promise.resolve({ok:false,code:'live_pending',error:'движок ещё не подтвердил проект'});
    const project=H.project,changing=!!body&&/^\/api\/(?:project(?:\/create)?|room\/move|assign|chats\/[^/]+\/orchestrator)$/.test(p);
    if(changing){H.projectRequestGeneration=(H.projectRequestGeneration||0)+1;H.projectLinkChange=true}
    const captured=Object.assign(operation||{},captureProjectOperation(p,body)),trace=typeof traceRequest==='function'?traceRequest(operation):null;let response=null;
    const init=body?{method:'POST',headers:{'Content-Type':'application/json',...(trace?trace.headers:{})},body:JSON.stringify(body)}:trace?{headers:trace.headers}:undefined;
    return fetch(p,operation?.signal?{...init,signal:operation.signal}:init).then(r=>{response=r;if(operation)operation.httpStatus=r.status;return r.json()}).then(r=>{
      if(!projectOperationCurrent(captured,r)){if(trace)traceReply(trace,r,true,response);return {ok:false,code:'binding_changed',error:'Привязка изменилась; ответ относится к прежнему выбору'}}if(trace)traceReply(trace,r,false,response);
      if(changing&&(!r.ok||r.project===project))H.projectLinkChange=false;
      if(changing&&r.ok&&typeof r.project==='string'&&window.HARNESS_BOOT)window.HARNESS_BOOT.select(r.project);
      if(changing&&r.ok&&r.project!==project&&typeof sectionChanging==='function')sectionChanging();
      if(r.waiting&&(r.project||project)===H.project){ const id=typeof r.pane==='string'?r.pane:(r.pane&&r.pane.id)||body&&body.pane||(p.match(/^\/api\/panes\/([^/]+)/)||[])[1]; const pane=(H.panes||[]).find(x=>x.id===id); if(pane){ pane.waiting=r.waiting; showWaiting(pane,r.waiting,r.project||project); } }
      if(r.code==='restore_failed'&&r.project===H.project) showRestore(r.project,r.error);
      return r;
    }).catch(error=>{if(trace)traceReply(trace,{ok:false,error:error.message,code:'unavailable'});if(changing&&projectOperationCurrent(captured))H.projectLinkChange=false;throw error});
  };
  function captureProjectOperation(path,body){const match=body&&path.match(/^\/api\/chats\/([^/]+)\/orchestrator$/);return {project:H.project,confirmed:H.confirmedProjectGeneration||0,request:H.projectRequestGeneration||0,navigation:typeof bindingNavigation==='number'?bindingNavigation:null,chat:match?decodeURIComponent(match[1]):null,revision:body&&body.revision};}
  // Local navigation always invalidates a reply. One remotely confirmed project change is allowed
  // only when status and this response identify this exact promotion of the captured conversation.
  function projectOperationCurrent(op,response){
    if(typeof leftPage!=='undefined'&&leftPage||op.request!==(H.projectRequestGeneration||0)||op.navigation!==null&&op.navigation!==bindingNavigation)return false;
    const confirmed=H.confirmedProjectGeneration||0;if(confirmed===op.confirmed)return true;
    if(confirmed!==op.confirmed+1||!op.chat||!response||!response.ok||response.project!==H.project)return false;
    const result=response.promotion,seen=((H.liveStatus||{}).promotions||[]).find(p=>p.chat===op.chat);
    if(!result||!seen||result.chat!==op.chat||result.target!==H.project||!response.pane||result.pane!==response.pane.id||(H.active||{})[result.pane]!==op.chat)return false;
    const previous=op.previousPromotion;
    return ['operationId','chat','sourceProject','sourceRevision','target','pane'].every(k=>result[k]!==undefined&&result[k]===seen[k])&&
      (previous&&previous.operationId?result.operationId===previous.operationId&&result.sourceProject===previous.sourceProject&&result.sourceRevision===previous.sourceRevision:result.sourceProject===op.project&&result.sourceRevision===op.revision);
  }
  // TS-23d: names and causes come from typed engine evidence, never diagnostic text.
  const networkCodes=new Set(['region_restricted','network_blocked','network_unavailable','network_no_reserve','network_country_unverified','network_proxy_auth','transport_lost','timeout','network_changed']);
  const connectionTitle=id=>({claude:'Claude',codex:'Codex',copilot:'GitHub Copilot',agy:'Antigravity',antigravity:'Antigravity',gemini:'Gemini CLI',ollama:'Ollama',kimi:'Kimi',devin:'Devin',opencode:'OpenCode'}[id]||(window.LIVE?.apiRoutes||[]).find(p=>p.id===id)?.title||id||'Модель');
  const networkLink=(id,project=H.project)=>'11-connections.html?provider='+encodeURIComponent(id)+'&focus=network&project='+encodeURIComponent(project||'');
  const networkCause=code=>code==='network_changed'?'настройки подключения изменились':code==='region_restricted'?'недоступен из вашего региона':code==='network_blocked'?'заблокирован в вашей сети':code==='network_unavailable'?'не отвечает из вашей сети':'не отвечает';
  const exitName=e=>e&&typeof e.label==='string'&&['ssh','proxy','direct'].includes(e.type)?e.type==='direct'?'напрямую':(e.type==='ssh'?'VPS':'прокси')+' «'+e.label+'»':'';
  function networkPath(network){if(!network||!exitName(network.via)||network.via.type==='direct'&&!network.directOnce)return '';return '<span class="proxy-answer-path">'+esc(network.directOnce?'напрямую · только этот ход':'через '+exitName(network.via))+'</span>'}
  function networkWarning(network){const from=network?.reserve?.from,to=network?.via;if(!exitName(from)||!exitName(to))return '';const reason=network.reserve.reason;
    const why=reason==='rotation'?'плановая смена подключения':reason==='rate_limited'?'ограничил запросы':reason==='server_error'?'ответил с ошибкой':'не ответил';
    return '<div class="proxy-answer-warning" role="status">'+esc(reason==='rotation'?'Подключение сменилось: ход пошёл через '+exitName(to):exitName(from)+' '+why+' — ход пошёл через запасной «'+to.label+'»')+'</div>';
  }
  function networkMenu(group){const failed=(H.panes||[]).find(p=>p.vendor===group.vendor&&networkCodes.has(p.waiting?.failure?.code))?.waiting?.failure,login=group.loginFailure,code=failed?.code||({region:'region_restricted',blocked:'network_blocked',offline:'network_unavailable',unresponsive:'transport_lost'}[login]),via=H.network?.[group.vendor],path=via&&via.type!=='direct'?exitName(via):'';
    if(!path&&!code)return H.networkError?'<div class="proxy-model-path">'+esc(H.networkError.reason)+' <a href="'+esc(networkLink(group.vendor))+'">Подключить через прокси или VPS →</a></div>':'';return '<div class="proxy-model-path">'+(path?esc('через '+path):'')+(code?'<div>'+esc(networkCause(code))+'</div><a href="'+esc(networkLink(group.vendor))+'">Подключить через прокси или VPS →</a>':'')+'</div>';
  }
  function networkWaiting(p,info,project){const failure=info.failure;if(!['uncertain','unsent'].includes(info.status)||!failure||!networkCodes.has(failure.code))return null;
    const via=H.network?.[p.vendor],proxy=via&&['ssh','proxy'].includes(via.type),changed=failure.code==='network_changed';
    const exhausted=via?.type!=='direct'&&(['network_no_reserve','network_country_unverified'].includes(failure.code)||['network_unavailable','network_changed'].includes(failure.code)&&proxy);
    const title=info.status==='unsent'?'Не отправлено: '+failure.reason:changed?'Настройки изменились — решите заново':failure.code==='network_country_unverified'?'Не удалось выбрать запасное подключение':exhausted?'Остановились: ни один прокси не отвечает':connectionTitle(p.vendor)+' '+networkCause(failure.code);
    const explanation=changed?'Прямой повтор отменён. Проверьте подключение и выберите действие для этого хода.':failure.code==='network_country_unverified'?'Страна основного или запасного подключения не подтверждена. Проверьте подключения.':exhausted?'Не удалось продолжить через настроенные подключения. Проверьте их или отправьте этот ход напрямую один раз.':failure.code==='region_restricted'?'Сервис сообщил, что из вашего региона он недоступен.':failure.code==='network_blocked'?'Движок подтвердил блокировку соединения с сервисом.':failure.code==='network_unavailable'?'Нет связи с сервисом. Подключите прокси или свой VPS и повторите ход.':'Сервис не ответил. Причина не установлена. Можно повторить ход или настроить подключение.';
    const attrs=' data-attempt-pane="'+esc(p.id)+'" data-attempt-project="'+esc(project)+'" data-attempt-id="'+esc(info.turnInstanceId)+'"';
    const action=(id,label,extra='')=>'<button type="button" class="btn sm ghost" data-attempt-action="'+id+'"'+attrs+extra+'>'+label+'</button>';
    const direct=exhausted&&info.recordSeqs?.length&&typeof p.settingsBinding?.networkGeneration==='string'&&info.actions?.includes('retry')?action('retry','Пустить напрямую один раз',' data-attempt-network="direct_once" data-attempt-binding="'+esc(JSON.stringify(p.settingsBinding))+'"'):'';
    return '<article class="live-attempt-controls proxy-chat-card"><h3>'+esc(title)+'</h3><p>'+esc(explanation)+'</p><div class="proxy-chat-actions"><a class="btn p" href="'+esc(networkLink(p.vendor,project))+'">'+(exhausted?'Настроить':'Подключить через прокси или VPS')+'</a>'+(info.actions||[]).filter(a=>a==='retry'||a==='skip').map(a=>action(a,info.status==='unsent'?(a==='retry'?'Отправить снова':'Убрать'):(a==='retry'?'Повторить':'Пропустить'))).join('')+direct+'</div>'+(direct?'<p class="conn-note">Сервис увидит ваш адрес · только этот ход.</p>':'')+((info.queuedSeqs||[]).length?'<p class="live-queue-wait">Новое сообщение ждёт решения по прошлому ходу</p>':'')+'<details><summary>подробнее</summary>'+esc(failure.code+' · '+failure.reason+' · '+failure.durationMs+' мс')+'</details></article>';
  }
  // TS-07: waiting controls bind the click to the displayed project and episode.
  const warningSeen=new Set();
  function warningEvent(ev){ if(!ev.warning) return false; const key=H.project+'\u0000'+ev.pane+'\u0000'+ev.warning; if(warningSeen.has(key)) return true; warningSeen.add(key); return false; }
  function consumeState(ev){ const pane=(H.panes||[]).find(p=>p.id===ev.pane); if(pane) Object.assign(pane,ev);
    if(PAGE==='chat'&&pane&&H.pane&&H.pane.id===ev.pane&&ev.busy&&!H.cur){H.cur={text:'',tools:[],model:ev.model,pane:ev.pane,who:ev.label||paneName(pane)};drawLive()}
    if(ev.status==='idle'){ const prefix=H.project+'\u0000'+ev.pane+'\u0000'; for(const key of warningSeen) if(key.startsWith(prefix)) warningSeen.delete(key); }
    renderWaiting(); if(typeof sideChats==='function') sideChats(); }
  function waitingControls(p,info,project){const network=networkWaiting(p,info,project);if(network)return network; const seqs=info.recordSeqs||[],range=seqs.length?'№'+seqs[0]+'–№'+seqs[seqs.length-1]:'всю очередь',damaged=String(info.turnInstanceId).startsWith('unreadable:');
    const failure=info.failure,queued=(info.queuedSeqs||[]).length;
    const title=info.status==='unsent'?'Не отправлено: '+(failure?.reason||'причина не сохранена'):info.status==='recovering'?'Завершение доставки сохранённого ответа':failure?'Ход не завершён':seqs.length===1?'Итог хода по записи №'+seqs[0]+' неизвестен':seqs.length?'Итог хода по записям '+range+' неизвестен':'Итог прошлого хода неизвестен';
    const detail=info.status==='unsent'?'Модель ещё не получила сообщение. Оно сохранено.':info.status==='recovering'?'Ответ сохранён; восстановление завершит местные действия без вызова модели.':damaged?'Состав прежней попытки неизвестен: attempts.json повреждён; повтор отправит всю очередь места.':failure?failure.code+' · '+failure.reason+' · '+failure.durationMs+' мс':'движок перезапускался до ответа';
    const labels={retry:'Повторить — отправить '+(seqs.length?'записи '+range:'всю очередь')+' модели снова',skip:'Пропустить — не отправлять, пойдут только более поздние',finish:'Завершить восстановление — завершить местные действия без вызова модели'};
    const buttons=(info.actions||[]).map(action=>'<button type="button" class="btn sm ghost" style="height:auto;white-space:normal;text-align:left" data-attempt-action="'+esc(action)+'" data-attempt-pane="'+esc(p.id)+'" data-attempt-project="'+esc(project)+'" data-attempt-id="'+esc(info.turnInstanceId)+'">'+esc(info.status==='unsent'?(action==='retry'?'Отправить снова':'Убрать'):(labels[action]||action))+'</button>').join('');
    return '<div class="live-attempt-controls" style="padding:12px 14px;border:1px solid var(--line);border-radius:12px;white-space:normal"><small>'+esc(paneName(p))+'</small><b style="display:block;margin:4px 0">'+esc(title)+'</b><small>'+esc(detail)+'</small>'+(queued?'<p class="live-queue-wait" role="status">Новое сообщение '+(queued>1?'('+queued+') ':'')+'ждёт решения по прошлому ходу</p>':'')+'<div class="act" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+buttons+'</div>'+(info.status==='unsent'&&failure?'<details><summary>подробнее</summary>'+esc(failure.code+' · '+failure.durationMs+' мс')+'</details>':'')+'</div>'; }
  function showWaiting(p,info,project){ if(!info||project!==H.project) return; if(PAGE==='now'){nowDraw();return} if(!['chat','first'].includes(PAGE)||!H.pane||H.pane.id!==p.id) return;
    const feed=PAGE==='first'?document.querySelector('.fr .feed'):document.querySelector('.frame.cur .main .feed')||document.querySelector('.frame .main .feed');if(!feed) return;
    let card=document.getElementById('live-waiting'); if(!card){card=document.createElement('div');card.id='live-waiting'}card.className='live-waiting';card.style.cssText='flex:none;margin:10px 20px 0;max-height:40%;overflow:auto';feed.parentElement.insertBefore(card,feed);
    card.dataset.pane=p.id;card.dataset.project=project;card.dataset.attemptId=info.turnInstanceId;card.innerHTML=waitingControls(p,info,project); }
  function unsentJoin(){
    document.querySelectorAll('.live-unsent-join').forEach(row=>row.remove());
    const p=H.pane,info=p?.waiting;if(!H.on||!p||info?.status!=='unsent'||!['chat','first'].includes(PAGE))return;
    const messages=info.messages||[],preview=messages.map(m=>String(m.text||'Сообщение с изображением').slice(0,180)).join(' · ');
    document.querySelectorAll('.box').forEach(box=>{const input=box.querySelector('.live-in');if(!input)return;const row=document.createElement('div');row.className='live-unsent-join';row.setAttribute('role','status');
      row.innerHTML='<span>Уйдут вместе: «'+esc(preview||'Предыдущее сообщение')+'» (не отправлено)</span><button type="button" class="btn sm ghost" aria-label="Убрать неотправленное сообщение" data-attempt-action="skip" data-attempt-pane="'+esc(p.id)+'" data-attempt-project="'+esc(H.project)+'" data-attempt-id="'+esc(info.turnInstanceId)+'">×</button>';box.insertBefore(row,box.firstChild);
    });
  }
  function renderWaiting(){unsentJoin();const card=document.getElementById('live-waiting');if(card&&card.dataset.pane)card.remove();
    if(PAGE==='now'){nowDraw();return}if((PAGE==='chat'||PAGE==='first')&&H.pane&&H.pane.waiting)showWaiting(H.pane,H.pane.waiting,H.project);}
  function showRestore(project,error){ let card=document.getElementById('live-waiting'); if(!card){card=document.createElement('div');card.id='live-waiting';card.className='live-toast on';document.body.appendChild(card)}card.dataset.pane='';card.dataset.project=project;card.innerHTML='<span>'+esc(error)+'</span><button type="button" class="btn sm ghost" data-attempt-reload="'+esc(project)+'">Повторить восстановление проекта</button>'; }
  const attemptRequests=new Set(),attemptKey=b=>JSON.stringify([b.dataset.attemptProject,b.dataset.attemptPane,b.dataset.attemptId]);
  document.addEventListener('click',async e=>{ const button=e.target.closest('[data-attempt-action], [data-attempt-reload]'); if(!button) return; e.preventDefault(); e.stopImmediatePropagation(); if(button.disabled) return;
    const key=button.dataset.attemptReload?null:attemptKey(button);if(key&&(attemptRequests.has(key)||PAGE==='now'&&nowAttemptDisabled(button)))return;
    const requestedProject=button.dataset.attemptReload||button.dataset.attemptProject,generation=PAGE==='now'?NOW.generation:null;button.disabled=true;if(key)attemptRequests.add(key);if(PAGE==='now')nowDraw();
    try{let r=null; try{ r=button.dataset.attemptReload?await api('/api/project',{path:button.dataset.attemptReload,reload:true}):await api('/api/panes/'+encodeURIComponent(button.dataset.attemptPane)+'/attempt',{project:button.dataset.attemptProject,turnInstanceId:button.dataset.attemptId,action:button.dataset.attemptAction,...(button.dataset.attemptNetwork?{network:button.dataset.attemptNetwork,binding:JSON.parse(button.dataset.attemptBinding||'null')}:{})}); }catch(x){}
    if(PAGE==='now'&&!nowCurrent(requestedProject,generation))return;
    if(H.project!==requestedProject) return; if(!r||!r.ok){ toast('Не вышло: '+esc(r&&r.error||'нет связи'));if(r?.code==='binding_changed'){await refreshStatus();renderWaiting()} return; }
    const pane=(H.panes||[]).find(p=>p.id===button.dataset.attemptPane);if(pane&&pane.waiting&&pane.waiting.turnInstanceId===button.dataset.attemptId)pane.waiting=null;
    if(button.dataset.attemptReload){const card=document.getElementById('live-waiting');if(card)card.remove()}else renderWaiting();await refreshStatus();await refreshChats();if(PAGE==='chat')await loadChat();else if(PAGE==='first'){firstSelectPane();await loadChat({onboard:false,visible:true});firstDraw()}sideChats();
    }finally{button.disabled=false;if(key)attemptRequests.delete(key);if(PAGE==='now')nowDraw()} });
  // End TS-07 waiting controls.
  let bindingGeneration=0,bindingIdentity='',bindingNavigation=0;
  const settingJobs=new Map();
  function sendBinding(){ const pane=S.ui.pane||(H.pane&&H.pane.id)||'room',chat=(H.active||{})[pane]||null,project=H.project||'',identity=JSON.stringify([project,pane,chat]);
    if(identity!==bindingIdentity){ bindingIdentity=identity; bindingGeneration++; settingJobs.clear(); }
    return {...(typeof traceCapture==='function'&&traceCapture()?{trace:traceCapture()}:{}),project,pane,chat,generation:bindingGeneration}; }
  function invalidateBinding(){ bindingIdentity=''; bindingGeneration++;bindingNavigation++; settingJobs.clear();if(typeof operationsDraw==='function')operationsDraw(); }
  let leftPage=false,pageGeneration=0;addEventListener('pagehide',()=>{leftPage=true;invalidateBinding();if(window.HARNESS_BOOT)window.HARNESS_BOOT.invalidate();if(typeof suspendPage==='function')suspendPage()});
  function bindingCurrent(binding){ const current=sendBinding(); return current.project===binding.project&&current.pane===binding.pane&&current.chat===binding.chat&&current.generation===binding.generation; }
  const settingKey=b=>JSON.stringify([b.project,b.pane,b.chat,b.generation]);
  function configureSetting(perform){ const binding=sendBinding(),key=settingKey(binding),previous=settingJobs.get(key),job={promise:null};
    job.promise=Promise.resolve(previous&&previous.promise).then(()=>bindingCurrent(binding)?perform(binding):false).catch(()=>{ if(bindingCurrent(binding)) toast('Нет связи: настройка не применена'); return false; });
    settingJobs.set(key,job);return job.promise; }
  async function settingsReady(binding){ let last=null;
    while(bindingCurrent(binding)){ const job=settingJobs.get(settingKey(binding)); if(!job||job===last) return true; const ok=await job.promise;
      if(!ok){ if(settingJobs.get(settingKey(binding))===job) settingJobs.delete(settingKey(binding)); return false; } last=job; }
    return false; }
  function md(text){return '<div class="md-body">'+mdView(text).html+'</div>'}
  function mdView(text){const parser=globalThis.HARNESS_MARKDOWN||(typeof document!=='undefined'&&document.defaultView&&document.defaultView.HARNESS_MARKDOWN);if(!parser||typeof parser.renderMarkdown!=='function')throw new Error('markdown renderer unavailable');return parser.renderMarkdown(text,{escape:esc,path:mdPath,artifact:mdArtifact,link:mdLink})}
  function mdPath(value){let path=String(value||'');try{path=decodeURIComponent(path)}catch{return null}if(!path||/[\x00-\x20\\?#]/.test(path.replace(/ /g,''))||path.startsWith('//'))return null;
    const project=H.project;if(path.startsWith('/')){if(!project||!path.startsWith(project+'/'))return null;path=path.slice(project.length+1)}if(path.startsWith('./'))path=path.slice(2);if(path.split('/').some(p=>!p||p==='.'||p==='..')||/^[a-z][a-z\d+.-]*:/i.test(path)||!/(?:^|\/)[^/]+\.[a-z\d]{1,12}$/i.test(path))return null;return path;
  }
  function mdFileURL(path,project=H.project){return '/api/project/file?project='+encodeURIComponent(project||'')+'&path='+encodeURIComponent(path)}
  function mdArtifact(path,label){const project=H.project;if(!project)return '<code>'+esc(label||path)+'</code>';return '<span class="md-artifact" data-artifact-path="'+esc(path)+'" data-artifact-project="'+esc(project)+'"><a href="'+esc(mdFileURL(path,project))+'" target="_blank" rel="noopener noreferrer"><b>'+esc(label||path.split('/').pop())+'</b> <span>открыть ↗</span></a><small data-artifact-size>Читаю сведения о файле…</small><span data-artifact-preview></span></span>'}
  function mdLink(label,target,image=false){const path=mdPath(target);if(path)return mdArtifact(path,label);if(/^(https?:\/\/|mailto:)[^\s\x00-\x1f]+$/i.test(target)){try{const url=new URL(target);if(['http:','https:','mailto:'].includes(url.protocol))return '<a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label||target)+'</a>'}catch{}}return esc(label||target)}
  const mdFiles=new Map(),mdRequests=new Set();let mdEpoch=0,mdProject=null,mdDialog=null,mdOpener=null;
  function mdReset(){mdEpoch++;mdFiles.clear();for(const controller of mdRequests)controller.abort();mdRequests.clear();if(mdDialog){mdDialog.close();mdDialog.remove();mdDialog=null}mdOpener=null;mdProject=H.project}
  function mdToolPaths(event){if(!/^(?:Write|Edit|MultiEdit|apply_patch|.*[._](?:write_file|edit_file))$/i.test(event.name||''))return [];return String(event.detail||'').split(', ').map(mdPath).filter(p=>p&&/^(artifacts|docs)\//.test(p))}
  function mdMessageArtifacts(message,binding){if(message.artifacts===undefined)return '';const a=message.artifacts;
    if(message.role!=='ai'||!a||a.project!==binding.project||a.chat!==binding.chat||typeof a.turnInstanceId!=='string'||!a.turnInstanceId||a.turnInstanceId!==message.runtime?.turnInstanceId||!Array.isArray(a.paths)||!a.paths.length||a.paths.length>50||a.paths.some(p=>typeof p!=='string'||p.length>4096||/[\x00-\x1f\x7f\\]/.test(p)||(!p.startsWith('artifacts/')&&!p.startsWith('docs/'))||p.split('/').some(x=>!x||x==='.'||x==='..')||!/\.[a-z\d]{1,12}$/i.test(p)))return '<p class="live-hint" role="alert">Ссылки на артефакты не соответствуют этому ответу.</p>';
    return [...new Set(a.paths)].map(p=>mdArtifact(p,p)).join('');
  }
  function mdSize(size){return size<1024?size+' Б':size<1024*1024?(size/1024).toFixed(1)+' КБ':(size/1024/1024).toFixed(1)+' МБ'}
  function mdRead(path,project,text=false){const controller=new AbortController();mdRequests.add(controller);return fetch(mdFileURL(path,project)+(text?'&text=1':'&meta=1'),{signal:controller.signal}).then(r=>r.json()).finally(()=>mdRequests.delete(controller))}
  function hydrateArtifacts(){if(!H.on||H.snapshotOnly)return;if(mdProject!==H.project)mdReset();const epoch=mdEpoch;
    document.querySelectorAll('[data-artifact-path]').forEach(el=>{const project=el.dataset.artifactProject,path=el.dataset.artifactPath;if(project!==H.project||el.dataset.artifactRead)return;el.dataset.artifactRead='1';const key=project+'\n'+path;let read=mdFiles.get(key);if(!read){read=mdRead(path,project);mdFiles.set(key,read)}
      void read.then(data=>{if(epoch!==mdEpoch||project!==H.project||!el.isConnected)return;const info=el.querySelector('[data-artifact-size]'),preview=el.querySelector('[data-artifact-preview]'),link=el.querySelector('a');
        if(!data||!data.ok||data.project!==project||data.path!==path||!Number.isSafeInteger(data.size)||data.size<0||typeof data.type!=='string'){info.textContent=data&&typeof data.error==='string'?data.error:'Сведения о файле не получены';return}
        info.textContent=path+' · '+mdSize(data.size);const url=esc(mdFileURL(path,project));if(/^image\/(png|jpeg|gif|webp)$/.test(data.type))preview.innerHTML='<a href="'+url+'" target="_blank" rel="noopener noreferrer"><img src="'+url+'" loading="lazy" alt="'+esc(data.name||path)+'"></a>';else if(/^video\/(mp4|webm)$/.test(data.type))preview.innerHTML='<video src="'+url+'" controls preload="none" aria-label="'+esc(data.name||path)+'"></video>';else if(/\.(md|csv|txt)$/i.test(path))link.setAttribute('data-artifact-text','');
      }).catch(()=>{if(epoch===mdEpoch&&project===H.project&&el.isConnected)el.querySelector('[data-artifact-size]').textContent='Не удалось прочитать файл.'});
    });
  }
  function mdCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return '<div class="md-table" tabindex="0" role="region" aria-label="CSV"><table>'+rows.map((r,i)=>'<tr>'+r.map(c=>'<'+(i?'td':'th')+'>'+esc(c)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table></div>'}
  function mdClose(){if(mdDialog){mdDialog.close();mdDialog.remove();mdDialog=null}if(mdOpener&&mdOpener.isConnected)mdOpener.focus();mdOpener=null}
  document.addEventListener('click',async event=>{const copy=event.target.closest('[data-md-copy]');if(copy){event.preventDefault();event.stopPropagation();try{await navigator.clipboard.writeText(copy.closest('.md-code').querySelector('code').textContent);copy.textContent='скопировано'}catch{copy.textContent='не удалось скопировать'}return}
    if(event.target.closest('[data-artifact-close]')){event.preventDefault();mdClose();return}const link=event.target.closest('[data-artifact-text]');if(!link)return;event.preventDefault();event.stopPropagation();const card=link.closest('[data-artifact-path]'),project=card.dataset.artifactProject,path=card.dataset.artifactPath;if(project!==H.project)return;mdClose();mdOpener=link;const dialog=mdDialog=document.createElement('dialog');dialog.className='md-file-dialog';dialog.innerHTML='<h3>'+esc(path)+'</h3><div data-artifact-content>Читаю файл…</div><button class="btn" data-artifact-close>Закрыть</button>';document.body.appendChild(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();mdClose()});dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();mdClose()}});dialog.showModal();dialog.querySelector('button').focus();const epoch=mdEpoch;
    try{const data=await mdRead(path,project,true);if(epoch!==mdEpoch||mdDialog!==dialog||!dialog.isConnected||project!==H.project)return;dialog.querySelector('[data-artifact-content]').innerHTML=data&&data.ok&&data.project===project&&data.path===path&&typeof data.text==='string'?(path.toLowerCase().endsWith('.csv')?mdCsv(data.text):path.toLowerCase().endsWith('.md')?md(data.text):'<pre>'+esc(data.text)+'</pre>'):'<p>'+esc(data&&data.error||'Не удалось прочитать файл.')+'</p>';hydrateArtifacts()}catch{if(mdDialog===dialog)dialog.querySelector('[data-artifact-content]').textContent='Не удалось прочитать файл.'}
  });
  addEventListener('pagehide',mdReset);addEventListener('live:status',()=>{if(mdProject!==H.project)mdReset();hydrateArtifacts()});
  // End TS-17 Markdown and project attachments.
  const paneName=p=>p?p.label.charAt(0).toUpperCase()+p.label.slice(1):'';
  function pickPane(){ let p=H.panes.find(x=>x.id===(S.ui.pane||'')); if(!p&&S.ui.pane==='room'){ H.pane=null;renderWaiting();return; }   // «без роли» выбрано, комнаты ещё нет — модель предстоит выбрать
    if(!p){ const b=document.querySelector('.frame .top b'); const lab=((b&&b.textContent)||'').split('·')[0].trim().toLowerCase(); p=H.panes.find(x=>x.label.toLowerCase()===lab)||H.panes.find(x=>x.id!=='room'&&x.vendor==='claude')||H.panes.find(x=>x.id!=='room')||H.panes[0]; } H.pane=p||null;renderWaiting(); }
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
  const toolLine=t=>'<div class="live-tool'+(t.err?' err':'')+'">'+esc(t.text)+(t.detail?'<details><summary>Технические детали</summary><pre>'+esc(t.detail)+'</pre></details>':'')+(t.artifacts||[]).map(p=>mdArtifact(p,p)).join('')+'</div>';
  function curHTML(){ const c=H.cur; return '<div class="ai live-msg live-cur'+(c.text?'':' live-typing')+'"><span class="orb"></span><div><div class="thought">'+esc(c.who||paneName(H.pane))+' · '+esc(c.model||'модель не сохранена')+' · '+(c.text?'отвечает':'думает…')+'<span class="live-stop">■ стоп</span>'+networkPath(c.network)+'</div>'+networkWarning(c.network)+c.tools.map(toolLine).join('')+md(c.text)+'</div></div>'; }
  const askHTML=a=>'<div class="live-msg live-ask'+(a.done?' done':'')+'" data-ask="'+a.id+'"><b>'+esc(a.title)+'</b><small>'+esc(a.detail||'')+'</small>'+(a.done?'<span class="mono">'+(a.done==='allow'?'разрешено':a.done==='deny'?'отказано':'время вышло')+'</span>':'<div class="act"><span class="btn sm p" data-approve="allow">Разрешить</span><span class="btn sm ghost" data-approve="deny">Отказать</span></div>')+'</div>';
  function drawLive(){ if(!H.on) return; if(window.CX&&CX.setBusy) CX.setBusy(!!H.cur); cols().forEach(c=>{ c.querySelectorAll('.live-cur, .live-ask').forEach(x=>x.remove()); if(H.cur) c.insertAdjacentHTML('beforeend',curHTML()); Object.values(H.asks).forEach(a=>c.insertAdjacentHTML('beforeend',askHTML(a))); }); hydrateArtifacts();hStatus(); if(H.cur||Object.keys(H.asks).length) scrollEnd(); }
  function finish(ev){const bound=ev&&typeof ev.chat==='string'&&ev.chat===(H.active||{})[H.pane?.id];if(bound)for(const message of ev.messages||[]){if(message.role!=='me'||!Number.isSafeInteger(message.seq))continue;const row=S.chat.find(m=>m.role==='me'&&!m.seq&&m.text===message.text);if(row)row.seq=message.seq}mdFiles.clear();const c=H.cur; H.cur=null; if(window.CX&&CX.setBusy) CX.setBusy(false); setTimeout(()=>dispatchEvent(new CustomEvent('live:done')),0);
    if(c&&(c.text||c.tools.length)){ const u=ev&&ev.usage,stored=ev&&Object.hasOwn(ev,'artifacts'),attachments=stored?mdMessageArtifacts({role:'ai',artifacts:ev.artifacts,runtime:{turnInstanceId:ev.turnInstanceId}},sendBinding()):''; S.chat.push({seq:bound?ev.seq:undefined,role:'ai',html:c.tools.map(t=>toolLine(stored?{...t,artifacts:[]}:t)).join('')+md(c.text)+attachments,text:c.text,t:now(),src:'live',who:c.who||(H.pane.id==='room'?'Без роли':paneName(H.pane)),pane:c.pane||H.pane.id,nf:!!(S.cx&&S.cx.noFolder),model:ev&&typeof ev.model==='string'&&ev.model?ev.model:null,network:ev?.network||c.network,cost:u?{i:u.input,o:u.output,c:u.cacheRead,ms:ev.durationMs}:null}); S.chat=S.chat.slice(-40); save(); }
    if(ev&&ev.type==='error'&&ev.waiting?.status!=='unsent'&&!(ev.waiting?.failure&&networkCodes.has(ev.code))){ const msg=ev.message||ev.text||ev.error||'ошибка'; S.chat.push({role:'ai',html:'<p>'+esc(msg)+'</p>'+(ev.code==='cloud_api_required'?'<button type="button" class="btn sm" data-llm-ollama-cloud>Подключить Ollama Cloud по API</button>':'')+(/not supported|unsupported|недоступн/i.test(msg)?'<p class="live-hint">Эта модель недоступна на подписке — выберите другую в чипе модели.</p>':''),t:now(),src:'err'}); save(); } render(); }
  function transferHTML(text,transfer){return '<details class="live-context-transfer"><summary>'+esc(text)+'</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(transfer.content||'Перенос выключен владельцем.')+'</pre></details>';}
  function hEvent(ev){ const t=ev.type, cur=()=>{H.streamGeneration=(H.streamGeneration||0)+1;return H.cur||(H.cur={text:'',tools:[]})};
    if(t==='networkRoute'){if(ev.network){if(ev.pane===H.pane?.id&&ev.chat===(H.active||{})[ev.pane]){cur().network=ev.network;drawLive()}return}if(ev.chat!==(H.active||{})[ev.pane]||S.chat.some(m=>m.seq===ev.seq))return;S.chat.push({seq:ev.seq,role:'ai',src:'sys',who:'харнесс · маршрут',pane:ev.pane,html:'<article class="live-context-transfer"><b>'+esc(ev.text)+'</b></article>',text:ev.text,t:(ev.ts||0)*1000});save();render();return;}
    if(t==='contextTransfer'){const transfer=ev.transfer;if(!transfer||transfer.project!==H.project||transfer.chat!==(H.active||{})[ev.pane]||S.chat.some(m=>m.transferId===transfer.turnInstanceId))return;
      S.chat.push({role:'ai',src:'sys',who:'харнесс · передача',pane:ev.pane,html:transferHTML(ev.text,transfer),text:ev.text,t:(ev.ts||0)*1000,transferId:transfer.turnInstanceId});save();render();return;}
    if(t==='error'&&ev.code==='unserializable'){ toast(ev.message||'Событие не удалось показать; ответ продолжается'); return; }
    if((t==='note'||t==='error')&&warningEvent(ev)) return;
    if(t==='delta'){ cur().text+=ev.text||''; drawLive(); }
    else if(t==='tool'){ cur().tools.push({text:'▸ '+ev.name+(ev.detail?': '+ev.detail:''),artifacts:mdToolPaths(ev)}); drawLive(); }
    else if(t==='toolError'){const raw=String(ev.text||''),fallback='Инструмент не выполнил действие';let reason=raw;try{const data=JSON.parse(raw);reason=typeof data.error==='string'?data.error:typeof data.message==='string'?data.message:fallback}catch{}cur().tools.push({text:'✕ '+(reason||fallback),err:true,detail:reason!==raw?raw:null});drawLive();}
    else if(t==='approval'){ H.asks[ev.id]={id:ev.id,title:ev.title,detail:ev.detail}; drawLive(); }
    else if(t==='approvalResolved'){ const a=H.asks[ev.id]; if(a){ a.done=ev.decision; drawLive(); setTimeout(()=>{ delete H.asks[ev.id]; drawLive(); },2500); } }
    else if(t==='done'){ finish(ev); log('чат','Ответ: '+paneName(H.pane)+' · '+(ev.model||'модель не сохранена')); }
    else if(t==='error'){ finish(ev); }
    else if(t==='note'){ S.chat.push({role:'ai',src:'sys',who:'харнесс',pane:H.pane?H.pane.id:'room',html:'<p>'+esc(ev.text||'')+'</p>',text:'[от харнесс] '+(ev.text||''),t:now()}); S.chat=S.chat.slice(-40); save(); render(); } }
  const isDirect=()=>!!(S.ui.direct&&H.pane&&S.ui.direct[H.pane.id]);
  async function ask(q,binding=sendBinding(),attachments=[]){ if(!bindingCurrent(binding)) return false; const target=(H.panes||[]).find(p=>p.id===binding.pane)||H.pane;
    const pending=H.cur?null:(H.cur={text:'',tools:[],model:target&&target.model,pane:binding.pane,who:target&&(target.id==='room'?'Без роли':paneName(target))}),generation=H.streamGeneration||0;
    // A late HTTP reply owns only its placeholder; SSE has already advanced the stream.
    const clearPending=()=>{if(pending&&H.cur===pending&&(H.streamGeneration||0)===generation)H.cur=null};if(pending)drawLive();
    let r=null; try{ r=await api('/api/chat',{pane:binding.pane,message:q,kind:'question',direct:!!(S.ui.direct&&S.ui.direct[binding.pane]),...(attachments.length?{attachments:attachments.map(a=>a.id)}:{})},{trace:binding.trace}); }catch(e){}
    if(!bindingCurrent(binding)) return false;
    if(r&&r.needDirect){ clearPending(); S.chat.pop(); S.draft=q; save(); render();   // чат роли читается свободно; писать мимо оркестратора — явно, с записью в журнал
      cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg live-direct"><span class="orb"></span><div><div class="thought">обращение к роли напрямую</div><p>«'+esc(paneName(H.pane))+'» — не оркестратор. По умолчанию с ролями говорит оркестратор, вы их чаты читаете. Написать напрямую — явное действие, оно запишется в журнал линии.</p><div class="act"><span class="btn sm p" data-direct="on">Обратиться напрямую к «'+esc(paneName(H.pane))+'»</span><span class="btn sm ghost" data-direct="orch">Написать оркестратору</span></div></div></div>')); scrollEnd(); return r; }
    if(!r||!r.ok){ clearPending(); if(!/^(?:images_unsupported|attachment(?:s)?_)/.test(r&&r.code||''))S.chat.push({role:'ai',html:'<p>Харнесс не принял сообщение: '+esc((r&&r.error)||'нет связи')+'</p>',t:now(),src:'err'}); save(); render(); return r||{ok:false,code:'unavailable',error:'нет связи'}; }
    if(r.waiting){target.waiting=r.waiting;const sent=[...S.chat].reverse().find(m=>m.role==='me'&&m.text===q&&!m.journalSeq);if(sent)sent.journalSeq=r.seq;clearPending();render();renderWaiting();toast(r.waiting.status==='unsent'?'Сообщения уйдут вместе':'Сообщение ждёт решения по прошлому ходу');if(r.waiting.status==='unsent'){await refreshStatus();renderWaiting()}}else if(r.queued) toast('Место занято — сообщение встало в очередь'); return true; }
  function rememberLive(){if(!H.snapshotOnly&&window.HARNESS_BOOT&&H.liveStatus&&H.liveStatus.project===H.project)window.HARNESS_BOOT.save({...H.liveStatus,panes:H.panes,activeChats:H.active},H.chatList||[],H.projects,H.pins)}
  // TS-09a: project materials are read from the engine; opening a section never calls a model.
  const SECTION_PAGES={doc:['docs','Документы проекта','.harness/docs/','Документы проекта ещё не подготовлены.','Попросите оркестратора подготовить документы проекта; согласованные стадии можно хранить во вложенных папках docs/<стадия>/.','Подготовь документы проекта: опиши цель, ожидаемый результат и предложи разделы. Стадии согласуй со мной.'],art:['artifacts','Артефакты','.harness/evidence/','Артефактов проекта пока нет.','Оркестратор собирает здесь результаты работы команды и материалы для проверки.','Собери артефакты проекта и материалы для проверки в .harness/evidence/.'],mem:['memory','Память проекта','.harness/MEMORY.md','Решений проекта ещё нет.','Попросите оркестратора записать согласованные цели, решения и правила в память проекта.','Обнови память проекта в .harness/MEMORY.md: запиши согласованные цели, решения и правила.'],res:['research','Ресёрч','.harness/research/','В проекте ещё не проводились исследования.','Опишите вопрос, глубину и ожидаемый результат исследования. Оркестратор назначит исследователя и сохранит материалы в .harness/research/.','Предложи исследование для проекта: уточни вопрос, источники и глубину. Согласуй со мной и сохрани результаты в .harness/research/.']};
  const PS={selected:null,project:null,generation:0,data:null,error:null,loading:false,sending:false,receipt:null,alive:true};
  const sectionCurrent=(project,generation)=>PS.alive&&H.on&&!H.snapshotOnly&&PS.project===project&&H.project===project&&PS.generation===generation;
  function sectionText(text){return String(text).split(/^(#{1,6})[ \t]+(.+)$/m).map((part,i)=>i%3===1?'':i%3===2?'<h3>'+esc(part)+'</h3>':'<pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6">'+esc(part)+'</pre>').join('')}
  function sectionValid(data){return typeof data.empty==='boolean'&&Array.isArray(data.items)&&Array.isArray(data.limited)&&data.limited.every(v=>['files','depth','response'].includes(v))&&Object.hasOwn(data,'memoryState')&&[null,'missing','empty','template','content'].includes(data.memoryState)&&data.limits&&['files','depth','textBytes','responseBytes'].every(k=>Number.isSafeInteger(data.limits[k])&&data.limits[k]>0)&&
    (data.orchestrator===null||data.orchestrator&&typeof data.orchestrator.pane==='string'&&data.orchestrator.pane&&typeof data.orchestrator.label==='string')&&
    data.items.every(item=>item&&['path','name','modifiedAt'].every(k=>typeof item[k]==='string')&&Number.isFinite(Date.parse(item.modifiedAt))&&(item.stage===null||typeof item.stage==='string')&&Number.isSafeInteger(item.bytes)&&item.bytes>=0&&typeof item.truncated==='boolean'&&(item.format==='text'&&typeof item.text==='string'||item.format==='binary'&&item.text===null));}
  const SECTION_LAYOUT={res:['#v-cur .lst','#v-cur .wrap'],art:['#v-list .lst','#v-list .wrap'],mem:['#v-rules .lst','#v-rules .wrap'],doc:['.paper','.paper']};
  const sectionDate=value=>new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const sectionItems=()=>{const items=PS.data&&!(PAGE==='mem'&&PS.data.empty)?PS.data.items:[];return PAGE==='art'||PAGE==='mem'?items.slice().sort((a,b)=>Date.parse(b.modifiedAt)-Date.parse(a.modifiedAt)):items};
  function sectionMock(el,reason){if(!el)return;el.setAttribute('data-spec-mock',reason);if(!el.querySelector('.spec-block')){const label=document.createElement('div');label.className='spec-block';label.textContent='Макет · '+reason;el.insertBefore(label,el.firstChild)}}
  function sectionMissing(el,reason){if(!el)return;sectionMock(el,reason);el.removeAttribute('data-spec-mock');el.setAttribute('data-section-missing','');el.querySelector('.spec-block').textContent='Нет данных · '+reason;el.querySelectorAll('b').forEach(value=>{value.textContent='—'});el.querySelectorAll('.ticks i').forEach(tick=>{tick.className=''})}
  function sectionBody(item){return '<article><h2>'+esc(item.name)+'</h2><div class="meta">'+esc(item.path)+(item.stage?' · стадия: '+esc(item.stage):'')+' · '+item.bytes+' байт · '+esc(sectionDate(item.modifiedAt))+'</div>'+(item.format==='binary'?'<p>Бинарный файл: просмотр содержимого недоступен.</p>':sectionText(item.text))+(item.truncated?'<p role="status">Сокращённый просмотр; полный файл находится в папке проекта.</p>':'')+'</article>'}
  const sectionItemBinding=item=>'data-section-generation="'+PS.generation+'" data-section-project="'+esc(PS.project)+'" data-section-path="'+esc(item.path)+'"';
  function sectionClose(){if(window.HX&&HX.close)HX.close();document.querySelectorAll('[data-project-section] .ovl .inner').forEach(inner=>{inner.innerHTML=''})}
  const sectionKind=item=>/\.(png|jpg|jpeg|webp|gif)$/i.test(item.name)?'снимок':/\.json$/i.test(item.name)?'выгрузка':'документ';
  const sectionCount=n=>n+' '+(n%100>=11&&n%100<=14?'файлов':n%10===1?'файл':n%10>=2&&n%10<=4?'файла':'файлов');
  function sectionRow(item,index){const name='<div><b>'+esc(item.name)+'</b><small>'+esc(item.path)+(item.stage?' · '+esc(item.stage):'')+' · '+item.bytes+' байт</small></div>',unknown='<span class="m">нет данных</span>',kind=sectionKind(item);
    const cells=PAGE==='art'?'<span class="kind">'+kind+'</span>'+name+unknown+unknown+'<span class="m">'+esc(sectionDate(item.modifiedAt))+'</span>':PAGE==='res'?name+unknown+unknown+unknown:name+'<span class="scope">проект '+esc(base(H.project))+'</span><span class="m">'+esc(item.path)+'</span>'+unknown;
    return '<div class="li" role="button" tabindex="0" data-section-item="'+index+'" '+sectionItemBinding(item)+'>'+cells+'<span class="chev">›</span></div>';
  }
  function sectionFooter(){const spec=SECTION_PAGES[PAGE],data=PS.data;if(!data)return '';return (data.limited.length?'<p role="status">Показана часть материалов: достигнут предел '+esc(data.limited.join(', '))+'. Пределы: 1000 файлов, глубина 16, 256 КиБ текста на файл, 4 МиБ ответа.</p>':'')+'<div class="section-request">'+(data.orchestrator?'<h3>Попросить оркестратора</h3><label>Поручение для '+esc(data.orchestrator.label)+'<textarea class="in" data-section-text rows="3">'+esc(spec[5])+'</textarea></label><button type="button" class="btn p" data-section-request>Отправить оркестратору</button>':'<p>В проекте нет оркестратора. Откройте исходный разговор и назначьте оркестратора, когда будете готовы собрать команду.</p><button type="button" class="btn ghost" data-section-conversation>Открыть исходный разговор</button>')+(PS.receipt?'<p role="status">'+esc(PS.receipt)+'</p>':'')+'</div>'}
  function sectionDraw(){const spec=SECTION_PAGES[PAGE];if(!spec||!H.on)return;const data=PS.data,items=sectionItems(),title=spec[1]+' · '+base(H.project),layout=SECTION_LAYOUT[PAGE];document.title='Harnessy · '+title;
    document.querySelectorAll('.frame .main').forEach(main=>{
      const draft=main.dataset.sectionProject===H.project?(main.querySelector('[data-section-text]')?.value??null):null;
      main.setAttribute('data-project-section',spec[0]);main.setAttribute('data-section-project',H.project);
      const top=main.querySelector('.top');if(!top.querySelector('[data-section-refresh]'))top.insertAdjacentHTML('beforeend','<button type="button" class="btn sm ghost" data-section-refresh>Обновить</button>');top.querySelector('b').textContent=title;
      top.querySelector('.st').textContent=spec[2]+(data?' · '+sectionCount(items.length)+(data.limited.length?' · показана часть':''):'');
      let status=PS.error?'<div role="alert"><h2>Не удалось прочитать раздел</h2><p>'+esc(PS.error)+'</p><button type="button" class="btn ghost" data-section-refresh>Повторить чтение</button></div>':PS.loading?'<p role="status">Читаю материалы проекта…</p>':!data?'<p>Подключаюсь к движку…</p>':data.empty?'<div class="section-empty"><h2>'+esc(data.memoryState==='template'?'Начальный шаблон памяти: решений проекта ещё нет':spec[3])+'</h2><p>'+esc(spec[4])+'</p><small>нет данных</small></div>':'';
      const list=main.querySelector(layout[0]);if(PAGE==='doc'){
        if(!items.some(item=>item.path===PS.selected))PS.selected=items[0]?.path||null;
        const toc=main.querySelector('.toc');if(toc.sectionProgress===undefined)toc.sectionProgress=toc.querySelector('.pg')?.outerHTML||'';toc.innerHTML='<div class="t">разделы · '+items.length+'</div>'+items.map((item,index)=>'<div class="it'+(item.path===PS.selected?' on':'')+'" role="button" tabindex="0" data-section-item="'+index+'" '+sectionItemBinding(item)+'>'+esc(item.name)+(item.stage?'<small>'+esc(item.stage)+'</small>':'')+'</div>').join('')+toc.sectionProgress;sectionMissing(toc.querySelector('.pg'),'Заполненность документов движок пока не отдаёт.');
        const selected=items.find(item=>item.path===PS.selected);list.innerHTML=status+(selected?sectionBody(selected):'')+sectionFooter();
        const versions=main.querySelector('#vers');versions.textContent='Версии · макет';versions.setAttribute('data-section-example','Историю версий движок пока не отдаёт.');
        main.querySelector('#next').textContent='Перейти к рубежу · макет';main.querySelector('#next').setAttribute('data-section-example','Переходы между стадиями движок пока не отдаёт.');
      }else{
        if(list.sectionHead===undefined)list.sectionHead=list.querySelector('.head')?.outerHTML||'';
        list.innerHTML=list.sectionHead+status+items.map(sectionRow).join('');
        let footer=main.querySelector('[data-section-footer]');if(!footer){footer=document.createElement('div');footer.setAttribute('data-section-footer','');main.querySelector(layout[1]).appendChild(footer)}footer.innerHTML=sectionFooter();
        main.querySelectorAll('.nums').forEach(el=>sectionMissing(el,'Статистику состояний и применения движок пока не отдаёт.'));
        main.querySelectorAll('.filters').forEach(el=>{el.querySelectorAll('.chip').forEach((chip,index)=>{if(!index){chip.textContent='все · '+items.length;return}if(!chip.dataset.sectionFilter)chip.dataset.sectionFilter=chip.textContent.split(' · ')[0];chip.textContent=chip.dataset.sectionFilter.replace('проект OMG','проект '+base(H.project))+' · макет';chip.title='Макет · фильтры состояний к движку пока не подключены.'})});
        if(PAGE==='res'){sectionMock(main.querySelector('.rh'),'Ход исследования, источники и уверенность пока не подключены.');sectionMock(main.querySelector('#v-past'),'Историю исследований движок пока не отдаёт.');main.querySelector('[data-v="past"]').textContent='Прошлые · макет';main.querySelector('.note-bar').innerHTML='<span>'+items.length+' материалов</span><span>состояние, источники и уверенность: нет данных</span>'}
        if(PAGE==='art')sectionMock(main.querySelector('#v-show'),'Публикация витрины к движку пока не подключена.');
        if(PAGE==='mem'){sectionMock(main.querySelector('#v-dis'),'Противоречия и применение правил движок пока не отдаёт.');main.querySelector('[data-v="dis"]').textContent='Спорные · макет'}
      }
      if(draft!==null&&main.querySelector('[data-section-text]'))main.querySelector('[data-section-text]').value=draft;
      const send=main.querySelector('[data-section-request]');if(send)send.disabled=PS.sending;
    });
  }
  function sectionOpenItem(el){if(!sectionCurrent(PS.project,PS.generation)||el.dataset.sectionProject!==PS.project||Number(el.dataset.sectionGeneration)!==PS.generation)return;const index=Number(el.dataset.sectionItem),item=sectionItems()[index];if(!Number.isInteger(index)||!item||item.path!==el.dataset.sectionPath)return;
    if(PAGE==='doc'){PS.selected=item.path;sectionDraw();return}
    const card=document.createElement('div');card.setAttribute('data-section-card',PS.project);card.innerHTML=PAGE==='mem'?window.MEM.card(1):window.SECTION_SKETCH();
    card.querySelector('.ch h3').textContent=item.name;const kind=card.querySelector('.ch .kind'),scope=card.querySelector('.ch .scope');if(kind)kind.textContent=sectionKind(item);if(scope)scope.textContent='проект '+base(PS.project);card.querySelector('.csub').textContent=item.path+' · '+item.bytes+' байт · '+sectionDate(item.modifiedAt);
    const rule=card.querySelector('.rule');if(rule)rule.textContent=item.text||'Бинарный файл';
    const preview=PAGE==='art'?'p':PAGE==='res'?'a':'w',body=card.querySelector('[data-cp="'+preview+'"]');if(PAGE==='art'){body.querySelector('.prev').innerHTML=sectionBody(item);body.querySelector('.kv').innerHTML='<span>путь</span><b>'+esc(item.path)+'</b><span>размер</span><b>'+item.bytes+' байт</b><span>обновлено</span><b>'+esc(sectionDate(item.modifiedAt))+'</b><span>проверка</span><b>нет данных</b>'}else body.innerHTML=sectionBody(item);
    card.querySelectorAll('[data-cp]').forEach(panel=>{if(panel.dataset.cp===preview)return;sectionMock(panel,'Эти сведения о материале движок пока не отдаёт.');const tab=card.querySelector('[data-ct="'+panel.dataset.cp+'"]');if(tab)tab.textContent=tab.textContent.split(' · ')[0]+' · макет'});
    sectionMock(card.querySelector('.acts'),'Действия с материалом пока не подключены к движку.');
    HX.open(el,card.outerHTML,{w:820,h:560,hide:false});
  }
  async function sectionFetch(){const spec=SECTION_PAGES[PAGE];if(!spec||!H.on||H.snapshotOnly||!PS.alive)return false;const project=H.project,generation=++PS.generation;
    sectionClose();PS.project=project;PS.data=null;PS.error=null;PS.receipt=null;PS.loading=true;PS.sending=false;sectionDraw();
    try{const data=await api('/api/project/sections/'+spec[0]);if(!sectionCurrent(project,generation))return false;
      if(!data||!data.ok)throw Error(data&&data.error||'нет связи с движком');
      if(data.project!==project||data.section!==spec[0])throw Error('проект или раздел ответа не совпадает');
      if(!sectionValid(data))throw Error('неполный ответ движка');
      PS.data=data;
    }catch(error){if(!sectionCurrent(project,generation))return false;PS.error=error.message||'нет связи с движком'}
    if(!sectionCurrent(project,generation))return false;PS.loading=false;sectionDraw();return !!PS.data;
  }
  function sectionSync(){if(!SECTION_PAGES[PAGE]||!H.on||H.snapshotOnly)return;if(PS.project!==H.project||PS.generation===0){if(window.HX&&HX.close)HX.close();void sectionFetch()}}
  function sectionChanging(){if(!SECTION_PAGES[PAGE])return;sectionClose();PS.selected=null;PS.generation++;PS.project=null;PS.data=null;PS.error=null;PS.loading=true;PS.sending=false;PS.receipt=null;sectionDraw()}
  function sectionConversation(){if(!PS.data||PS.project!==H.project)return;S.ui.sectionHint='В проекте нет оркестратора. Продолжайте исходный разговор; назначение оркестратора — следующий шаг создания команды.';S.ui.fresh=false;S.ui.switched=true;save();location.href='01-chat.html'}
  async function sectionRequest(button){if(!PS.data||!PS.data.orchestrator||PS.sending)return false;const project=PS.project,generation=PS.generation,root=button.closest('[data-project-section]');if(!root||root.dataset.sectionProject!==project||!sectionCurrent(project,generation))return false;
    const input=root.querySelector('[data-section-text]'),text=input&&input.value.trim();if(!text){toast('Опишите поручение оркестратору');return false}
    PS.sending=true;button.disabled=true;let reply;
    try{reply=await api('/api/project/sections/'+SECTION_PAGES[PAGE][0]+'/request',{project,text})}catch(error){reply={ok:false,error:'нет связи с движком'}}
    if(!sectionCurrent(project,generation))return false;PS.sending=false;button.disabled=false;
    if(!reply||!reply.ok){toast('Поручение не записано: '+esc(reply&&reply.error||'нет связи'));if(reply&&reply.code==='orchestrator_missing'){PS.data.orchestrator=null;sectionDraw()}return false}
    PS.receipt='Поручение записано в журнал: №'+reply.seq;toast(PS.receipt);input.value='';button.textContent=PS.receipt;return true;
  }
  if(SECTION_PAGES[PAGE]){
    document.addEventListener('click',async event=>{if(!H.on)return;const target=event.target,root=target.closest('[data-project-section]');if(!root)return;
      const item=target.closest('[data-section-item]');if(item){event.preventDefault();event.stopImmediatePropagation();sectionOpenItem(item);return}
      const button=target.closest('[data-section-refresh], [data-section-request], [data-section-conversation]');
      if(button){event.preventDefault();event.stopImmediatePropagation();if(button.disabled)return;if(button.hasAttribute('data-section-refresh')){if(H.snapshotOnly)await resumePage();else await sectionFetch()}else if(button.hasAttribute('data-section-conversation'))sectionConversation();else await sectionRequest(button);return}
      if(target.closest('#fix, #add')){event.preventDefault();event.stopImmediatePropagation();const input=root.querySelector('[data-section-text]');if(input){input.scrollIntoView?.({block:'center'});input.focus()}else root.querySelector('[data-section-conversation]')?.focus();return}
      if(target.closest('.panel [data-ct], .panel [data-go], .panel .x')||target.closest('.panel [data-close]')&&/^(Закрыть|Отмена)$/.test(target.closest('[data-close]').textContent.trim()))return;
      if(target.closest('.panel .btn, .panel a')&&!target.closest('[data-ct], [data-close], .x')){event.preventDefault();event.stopImmediatePropagation();toast('Макет · это действие пока не подключено к движку.');return}
      if(target.closest('[data-spec-mock] .btn, [data-spec-mock] a, [data-section-filter]')){event.preventDefault();event.stopImmediatePropagation();toast('Макет · это действие пока не подключено к движку.')}
    },true);
    document.addEventListener('click',event=>{if(!H.on)return;const mock=event.target.closest('[data-spec-mock], [data-section-example], [data-passport]');if(mock)sectionMock(document.querySelector('.ovl.on .panel .inner'),mock.dataset.specMock||mock.dataset.sectionExample||'Паспорт описывает образец экрана.');});
    document.addEventListener('keydown',event=>{const item=event.target.closest('[data-section-item]');if(H.on&&item&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();sectionOpenItem(item)}});
  }
  // End TS-09a project sections.
  const profileText=(value,max=254)=>typeof value==='string'&&value.trim()&&value.trim().length<=max&&!/[\u0000-\u001f\u007f<>]/.test(value)?value.trim():'';
  function ownerProfile(status=H.liveStatus){
    const auth=status&&status.auth&&typeof status.auth==='object'&&!Array.isArray(status.auth)?status.auth:{},accounts=['claude','codex'].map(id=>auth[id]).filter(account=>account&&account.loggedIn===true);
    const account=accounts.find(value=>{const email=profileText(value.email);return !!email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)})||accounts.find(value=>profileText(value.name,80)||profileText(value.displayName,80));
    if(!account)return {name:'Владелец',email:''};
    const rawEmail=profileText(account.email),email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)?rawEmail:'',name=profileText(account.name,80)||profileText(account.displayName,80)||'Владелец';
    return {name,email};
  }
  function profileDraw(status=H.liveStatus){
    const profile=ownerProfile(status),initial=Array.from(profile.name)[0]?.toLocaleUpperCase('ru-RU')||'В';
    document.querySelectorAll('aside.side.ps [data-owner-profile]').forEach(row=>{const avatar=row.querySelector('[data-owner-avatar]'),name=row.querySelector('[data-owner-name]'),email=row.querySelector('[data-owner-email]');if(avatar)avatar.firstChild?avatar.firstChild.nodeValue=initial:avatar.textContent=initial;if(name)name.textContent=profile.name;if(email){email.textContent=profile.email;if(profile.email)email.removeAttribute('hidden');else email.setAttribute('hidden','')}row.title=profile.email?'Профиль · '+profile.email:'Профиль'});return profile;
  }
  function applyStatus(st,request,connected=false){if(leftPage||window.HARNESS_BOOT&&!window.HARNESS_BOOT.confirm(st.project||'',request))return false;if(connected){H.on=true;H.snapshotOnly=false}H.liveStatus=st;const changed=H.project!==(st.project||''),previousRoom=(H.panes||[]).find(p=>p.id==='room');H.panes=st.panes; H.models=st.models||{}; H.turnModes=st.turnModes||{}; H.network=st.network||{}; H.networkError=st.networkError||null; H.modes=st.modes||[]; H.project=st.project||''; H.defaultDir=st.defaultDir||''; H.roleCatalog=st.roleCatalog||[]; H.noProject=!!st.noProject; H.projectsRoot=st.projectsRoot||''; H.active=st.activeChats||{}; H.hasOrch=!!st.hasOrchestrator; H.halted=!!st.halted; H.kinds=st.kinds||[]; H.threads=st.threads||{};
    if(changed){knowledgeReset();H.confirmedProjectGeneration=(H.confirmedProjectGeneration||0)+1;S.chat=[];H.chatList=[];H.pins=[];H.projects=null;const selectedRoom=(H.panes||[]).find(p=>p.id==='room');if(previousRoom&&selectedRoom&&previousRoom.model!==selectedRoom.model)toast('у проекта своя настройка модели: '+esc(modelName(selectedRoom.model)));}
    if(changed&&typeof eventsReset==='function')eventsReset();if(changed&&typeof swarmReset==='function')swarmReset();
    if(changed&&typeof resetJournal==='function'){resetJournal(H.project);if(H.on&&!H.snapshotOnly&&window.psKey==='log')journalFetch()}setTimeout(()=>dispatchEvent(new CustomEvent('live:status')),0);
    if(PAGE==='new') document.querySelectorAll('.status > span:first-child').forEach(el=>{ el.textContent=(H.noProject||!!(S.cx&&S.cx.noFolder))?'без проекта · модель ничего не читает':'папка '+((H.project||'').split('/').filter(Boolean).pop()||'проект')+(st.repo?' · git':'')+' · ролей '+(H.panes||[]).filter(p=>p.id!=='room').length; });   // строка папки — от движка, не статика скетча (Kimi UX-1 №85 п.2)
    if(typeof sectionSync==='function')sectionSync();if(typeof proposalsSync==='function')proposalsSync();if(typeof profileDraw==='function')profileDraw(st);badges();
    if(PAGE==='new'){ S.ui.pane='room'; S.ui.fresh=true; S.ui.switched=false; save(); }   // стартовый экран — ВСЕГДА без роли · новый чат; выбор роли или чата отсюда = переход в чат (слово владельца 08.10)
    if(!S.ui.pane){ S.ui.pane='room'; save(); } pickPane(); renderWaiting();if(typeof chatGuidanceDraw==='function')chatGuidanceDraw(); }
  async function refreshChats(){ const binding=sendBinding();try{ const r=await api('/api/chats');if(!bindingCurrent(binding))return; H.chatList=r.chats||[]; H.active=r.active||H.active||{}; }catch(e){ H.chatList=H.chatList||[]; } if(typeof sideChats==='function') await sideChats();if(window.HARNESS_BOOT)rememberLive(); }
  async function refreshStatus(connected=false){ const request=window.HARNESS_BOOT&&window.HARNESS_BOOT.capture();let st=null; try{ st=await api('/api/status'); }catch(e){} if(!st||!Array.isArray(st.panes))return null; if(applyStatus(st,request,connected)===false)return null; await refreshChats(); hStatus(); if(window.CX) CX.render(); return st; }
  // лента активного чата — из харнесса (один источник правды для Electron, браузера и сервера); цена хода у старых реплик неизвестна
  let LOADED=null; const ONB={};
  // вводная роли при первом открытии её чата — в том числе когда чата ещё нет (место посеяно при создании проекта; Kimi UX-1 №85 п.4); движок повторно не шлёт
  async function onboardOnce(p){ if(!p||p.id==='room'||ONB[p.id]) return; ONB[p.id]=1; try{ const o=await api('/api/onboard',{pane:p.id}); if(o&&o.sent){ toast('Роль получает вводную: кто она, где, с кем работает'); await refreshStatus(); if(H.pane&&H.pane.busy){if(!H.cur)H.cur={text:'',tools:[]};drawLive(); } else await loadChat(); } }catch(e){} }
  async function loadAttemptNotes(p,binding){if(!p)return;let r=null;try{r=await api('/api/journal?limit=0')}catch(e){}if(!r||!Array.isArray(r.records)||!bindingCurrent(binding))return;
    const done=new Map();for(const record of r.records){const a=record.attempt;if(record.from==='harness'&&record.kind==='note'&&record.origin==='attempt'&&record.to&&record.to.length===1&&record.to[0]==='owner'&&a&&typeof a.turnInstanceId==='string'&&a.turnInstanceId&&a.done===true&&a.pane===p.id&&record.thread==='attempt:'+a.turnInstanceId&&['retry','skip','finish'].includes(a.action))done.set(a.turnInstanceId,record)}
    const notes=[...done.values()].map(record=>{const a=record.attempt,text='владелец решил: '+({retry:'повторить ход',skip:'пропустить записи прежнего хода',finish:'завершить восстановление'}[a.action]);return {role:'ai',src:'sys',who:'харнесс',pane:p.id,text,html:md(text),t:Date.parse(record.ts),attemptId:a.turnInstanceId}});
    S.chat=S.chat.filter(m=>!m.attemptId).concat(notes).sort((a,b)=>a.t-b.t);save();render();}
  async function loadChat({onboard=true,visible=false}={}){ if(!H.on||PAGE!=='chat'&&!(visible&&cols().length)) return; knowledgeReset();const p=H.pane, cid=p?(H.active||{})[p.id]:null,binding=sendBinding();
    if(!cid){ S.chat=[]; save(); LOADED=cid||'none';renderWaiting();render();await loadAttemptNotes(p,binding);if(!bindingCurrent(binding))return;if(onboard&&p&&!p.busy) await onboardOnce(p); return; }
    if(LOADED!==cid){S.chat=[];save();render()}
    let r=null; try{ r=await api('/api/chats/'+cid); }catch(e){} if(!r||!Array.isArray(r.messages)){ return; }
    const who=p.id==='room'?'Без роли':paneName(p);
    const hsys=m=>m.role==='peer'&&/^\[от харнесс\]/.test(m.text);   // заметки харнесса (вводная, передача) — системные: без модели, расхода и действий
    if(!bindingCurrent(binding)) return;
    const messageAttachments=m=>Array.isArray(m.attachments)?m.attachments.filter(a=>a&&typeof a.id==='string'&&/^[0-9a-f]{64}$/.test(a.id)&&['image/png','image/jpeg','image/webp','image/gif'].includes(a.mime)&&Number.isSafeInteger(a.size)&&a.size>0&&Number.isSafeInteger(a.w)&&a.w>0&&Number.isSafeInteger(a.h)&&a.h>0).map(a=>({id:a.id,mime:a.mime,size:a.size,w:a.w,h:a.h})):[];
    S.chat=r.messages.map(m=>m.role==='me'?{seq:m.seq,role:'me',text:m.text,attachments:messageAttachments(m),t:(m.ts||0)*1000}:{seq:m.seq,role:'ai',src:hsys(m)?'sys':'live',who:hsys(m)?(/контекст передан/.test(m.text)?'харнесс · передача':'харнесс · вводная'):(m.role==='peer'?'сосед':who),pane:p.id,model:typeof m.model==='string'&&m.model?m.model:null,network:m.network,html:(m.role==='peer'&&/^\[от харнесс\] Ход ушёл через резервный выход/.test(m.text)?'<article class="live-context-transfer"><b>'+esc(m.text.replace(/^\[от харнесс\]\s*/,''))+'</b></article>':m.contextTransfer?transferHTML(m.text.replace(/^\[от харнесс\]\s*/,''),m.contextTransfer):md(m.text.replace(/^\[от [^\]]+\]\s*/,'')))+mdMessageArtifacts(m,binding),transferId:m.contextTransfer&&m.contextTransfer.turnInstanceId,text:m.text,t:(m.ts||0)*1000,cost:{i:m.usage&&m.usage.input,o:m.usage&&m.usage.output,c:m.usage&&m.usage.cacheRead,ms:m.durationMs}});   // цена, модель и изображения — из реплики, не из настройки чата
    LOADED=cid;save();renderWaiting();render();const known=knowledgeSet(r,binding);await loadAttemptNotes(p,binding);if(!bindingCurrent(binding))return;
    if(onboard&&r.firstOpenPending){if(known)await knowledgeOpen(p,binding);return}
    if(onboard&&p.id!=='room'&&!r.messages.length&&!p.busy) await onboardOnce(p); }   // роль без вводной получает её при первом открытии чата (правило движка)


  // подключение к движку на всех экранах: боковая панель, настройки, подключения живут его данными (08.10)
  // TS-12: one project-bound transport for limits, chat, approvals and journal invalidations.
  const LIVE_EVENTS={source:null,project:null,generation:0,alive:true,listeners:new Set()};
  function stopLiveEvents(){LIVE_EVENTS.generation++;if(LIVE_EVENTS.source)LIVE_EVENTS.source.close();LIVE_EVENTS.source=null;}
  function subscribeLiveEvents(onmessage=null){const listener={onmessage,onopen:null,onerror:null,close(){LIVE_EVENTS.listeners.delete(listener)}};LIVE_EVENTS.listeners.add(listener);syncLiveEvents();return listener;}
  function syncLiveEvents(){
    if(!LIVE_EVENTS.alive||!H.on||H.snapshotOnly||typeof EventSource!=='function'){if(LIVE_EVENTS.source)stopLiveEvents();return;}
    // Opening a stream replays pending approvals immediately, including when live:status starts it.
    if((PAGE==='chat'||PAGE==='first')&&!(H.events&&H.events.onmessage)||PAGE==='now'&&(typeof NOW==='undefined'||!NOW.es||!NOW.es.onmessage))return;
    if(LIVE_EVENTS.source&&LIVE_EVENTS.project===H.project)return;
    stopLiveEvents();const project=LIVE_EVENTS.project=H.project,generation=LIVE_EVENTS.generation,source=LIVE_EVENTS.source=new EventSource('/api/events/all');
    const current=()=>LIVE_EVENTS.alive&&LIVE_EVENTS.source===source&&LIVE_EVENTS.generation===generation&&H.project===project&&!H.snapshotOnly;
    source.onmessage=event=>{if(!current())return;let data;try{data=JSON.parse(event.data)}catch{return}if(!data||typeof data!=='object'||typeof data.type!=='string')return;
      if(data.type==='state'&&typeof consumeState==='function')consumeState(data);
      if(data.type==='limits'&&typeof limitsEvent==='function')limitsEvent(data);if(typeof operationsEvent==='function')operationsEvent(data);
      for(const listener of [...LIVE_EVENTS.listeners])if(current()&&listener.onmessage)listener.onmessage(event);
    };
    source.onopen=async event=>{if(!current())return;if(typeof limitsRestart==='function')void limitsRestart();for(const listener of [...LIVE_EVENTS.listeners])if(current()&&listener.onopen)await listener.onopen(event);};
    source.onerror=event=>{if(!current())return;for(const listener of [...LIVE_EVENTS.listeners])if(current()&&listener.onerror)listener.onerror(event);};
  }
  addEventListener('live:status',syncLiveEvents);
  addEventListener('pagehide',()=>{LIVE_EVENTS.alive=false;stopLiveEvents()});
  addEventListener('pageshow',event=>{if(event.persisted)LIVE_EVENTS.alive=true});
  // End TS-12 shared events.
  async function hConnect(){ const request=window.HARNESS_BOOT&&window.HARNESS_BOOT.capture();let st=null; try{ st=await api('/api/status'); }catch(e){ } if(!st||!Array.isArray(st.panes)){ return; }   /* движок подключён, если статус есть — даже без единого места: иначе чистая машина (первый запуск) остаётся в демо-режиме и проект создать нельзя */
    if(applyStatus(st,request,true)===false)return;H.connected=true;if(window.HARNESS_BOOT)window.HARNESS_BOOT.accept(); if(!H.pane&&S.ui.pane!=='room'){ H.on=false; return; }
    if(PAGE==='chat'||PAGE==='first'){ if(H.pane&&H.pane.busy) H.cur={text:'',tools:[]};
      let linkedProject=H.project;const es=H.events||(H.events=subscribeLiveEvents()); es.onmessage=e=>{ let ev; try{ ev=JSON.parse(e.data); }catch(x){ return; } if(ev.type==='teamProposals'&&ev.project===H.project){void proposalsFetch();void knowledgeFetch();} if(ev.type==='state'&&KN.data)void knowledgeFetch(); if(!H.pane||ev.pane!==H.pane.id) return; hEvent(ev); };
      es.onerror=()=>{ if(H.link!=='lost'){ H.link='lost'; hStatus(); if(!H.projectLinkChange)toast('Связь с движком потеряна — переподключаюсь…'); } };   // плановая смена проекта тоже закрывает SSE — это не потеря движка
      es.onopen=async()=>{ if(H.link==='lost'){ const switching=H.projectLinkChange;H.link='ok'; hStatus(); await refreshStatus();void proposalsFetch();if(!switching&&H.project===linkedProject)toast('Связь восстановлена');linkedProject=H.project;H.projectLinkChange=false; }else void proposalsFetch(); };
      hStatus(); }
    if(PAGE==='new'){const es=H.proposalEvents||(H.proposalEvents=subscribeLiveEvents());es.onmessage=e=>{let ev;try{ev=JSON.parse(e.data)}catch{return}if(ev.type==='teamProposals'&&ev.project===H.project)void proposalsFetch()};es.onopen=()=>proposalsFetch()}
    if(PAGE==='now') nowLive();
    syncLiveEvents();await refreshChats();
    if(PAGE==='chat')await loadChat();else if(PAGE==='first'){firstSelectPane();await loadChat({onboard:false,visible:true});firstDraw()}
    if(/21-journal\.html$/.test(location.pathname)) journalLive();
    if(window.CX) CX.render(); }

  // ── чат: настоящее поле ввода; разговор хранится; ответы — по сценарию и так и подписаны (или от настоящей модели через мост)
  const link=(href,t,p)=>'<a class="btn sm'+(p?' p':'')+'" href="'+href+'" style="text-decoration:none">'+t+'</a>';
  function answer(q){ const s=q.toLowerCase(), w=waiting(), n=w.length;
    if(/жд[её]т|ждут|команд|кто работает|что сейчас|статус|состояни/.test(s)) return '<p>'+(n?'Вас '+plural(n)+' <b>'+n+'</b> '+(n===1?'решение':'решения')+': '+w.map(d=>'«'+esc(DEC[d])+'»').join(' и ')+'.':'Сейчас вас никто не ждёт: все решения приняты.')+' Работают 4 места из 6, прогон H1.5 на шаге 3 из 7.</p><div class="act">'+link('14-now.html','Открыть «Сейчас»',1)+link('04-swarm.html','Стая')+'</div>';
    if(/план|задач|карт/.test(s)) return '<p>В плане OMG <b>87 задач</b>, уровень L1: падают 3, в работе 12.</p><div class="act">'+link('02-plan.html','Открыть план',1)+link('17-doc.html','Документы проекта')+'</div>';
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
  const timePart=n=>String(n).padStart(2,'0');
  function fullMessageTime(value){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return timePart(date.getDate())+'.'+timePart(date.getMonth()+1)+'.'+date.getFullYear()+' '+timePart(date.getHours())+':'+timePart(date.getMinutes())+':'+timePart(date.getSeconds())}
  function messageTime(value,at=now()){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const delta=at-value;if(delta>=0&&delta<60000)return 'только что';if(delta>=0&&delta<3600000)return Math.max(1,Math.floor(delta/60000))+' мин назад';const today=new Date(at);today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);if(value>=yesterday.getTime()&&value<today.getTime())return 'вчера '+timePart(date.getHours())+':'+timePart(date.getMinutes());return timePart(date.getDate())+'.'+timePart(date.getMonth()+1)+' '+timePart(date.getHours())+':'+timePart(date.getMinutes())}
  const messageTimeHTML=value=>{const text=messageTime(value),full=fullMessageTime(value);return text&&full?'<time data-live-time="'+value+'" datetime="'+new Date(value).toISOString()+'" title="'+full+'">'+text+'</time>':''};
  function updateMessageTimes(){document.querySelectorAll('[data-live-time]').forEach(node=>{const value=Number(node.dataset.liveTime),text=messageTime(value),full=fullMessageTime(value);if(!text||!full){node.remove();return}node.textContent=text;node.title=full})}
  if(typeof setInterval==='function')setInterval(updateMessageTimes,30000);
  const actsLine=(m,i)=>{ if(m.role!=='me'&&m.src!=='live') return ''; const a=[];if(typeof m.text==='string'&&m.text)a.push('<span data-la="copy" data-i="'+i+'">копировать</span>');
    if(m.src==='live'&&m.role!=='me'){const others=(H.panes||[]).filter(p=>p.id!=='room'&&p.id!==m.pane).length, ho='<span data-la="'+(others?'handoff':'handoff-none')+'" data-i="'+i+'"'+(others?'':' class="dis" title="в команде пока один собеседник — сначала назначьте роль"')+'>передать контекст</span>';   // без адресатов — причина, не пустое меню (Kimi UX-3 №106 п.2)
      if(((H.chatList||[]).find(c=>c.id===(H.active||{})[m.pane])||{}).promotion?.pending)a.push('<span data-la="assign" data-i="'+i+'">завершить назначение оркестратора</span>');
      else if(m.pane==='room'){ if(m.nf) a.push('<span data-la="assign" data-i="'+i+'">назначить оркестратора</span>','<span data-la="mkdir" data-i="'+i+'">создать проект и git</span>','<span data-la="move" data-i="'+i+'">перейти в проект…</span>'); else a.push('<span data-la="assign" data-i="'+i+'">назначить роль</span>',ho); } else a.push(ho); }   // из чата роли контекст тоже передаётся — владелец остаётся
    const time=messageTimeHTML(m.t);if(time)a.push(time);return a.length?'<div class="live-acts">'+a.join('<i>·</i>')+'</div>':''; };
  const ckBox=(m,i)=>SEL&&SEL.items.has(m.seq)?'<label class="live-ck"><input type="checkbox" data-ck="'+m.seq+'"'+(SEL.checked.has(m.seq)?' checked':'')+(SEL.sending?' disabled':'')+' aria-label="Выбрать сообщение для переноса"></label>':'';
  const bubble=(m,i)=>{const images=Array.isArray(m.attachments)?m.attachments.filter(a=>a&&typeof a.id==='string'&&/^[0-9a-f]{64}$/.test(a.id)&&['image/png','image/jpeg','image/webp','image/gif'].includes(a.mime)):[],gallery=images.length?'<div class="live-message-images">'+images.map((a,n)=>'<button type="button" data-attachment-view="'+a.id+'" aria-label="Открыть изображение '+(n+1)+'"><img src="/api/attachments/'+a.id+'" alt="Вложенное изображение '+(n+1)+'" loading="lazy"></button>').join('')+'</div>':'',latest=i===S.chat.length-1?' live-last':'';
    return m.role==='me'?'<div class="me live-msg'+latest+'" data-message-index="'+i+'" data-message-role="me">'+ckBox(m,i)+gallery+(m.text?'<span class="live-message-text">'+esc(m.text)+'</span>':'')+(H.pane?.waiting?.queuedSeqs?.includes(m.journalSeq)?'<small class="live-queue-wait" role="status">ждёт решения по прошлому ходу</small>':'')+actsLine(m,i)+'</div>':'<div class="ai live-msg'+latest+'" data-message-index="'+i+'" data-message-role="ai">'+ckBox(m,i)+'<span class="orb"></span><div><div class="thought">'+(m.src==='live'?esc(m.who||'')+' · '+esc(m.model||'модель не сохранена'):m.src==='sys'?esc(m.who||'харнесс'):m.src==='err'?'ошибка':'прототип · ответ по сценарию')+networkPath(m.network)+'</div>'+networkWarning(m.network)+m.html+costLine(m)+actsLine(m,i)+'</div></div>'; };
  const selectionElement=node=>node&&node.nodeType===1?node:node&&node.parentElement;
  function messageSelection(selection=globalThis.getSelection&&globalThis.getSelection()){if(!selection||selection.isCollapsed||!selection.rangeCount)return null;const anchor=selectionElement(selection.anchorNode),focus=selectionElement(selection.focusNode);if(!anchor||!focus||!anchor.closest||!focus.closest)return null;const first=anchor.closest('.live-msg[data-message-index]'),last=focus.closest('.live-msg[data-message-index]');if(!first||first!==last)return null;const start=anchor.closest('.live-message-text,.md-body'),end=focus.closest('.live-message-text,.md-body');if(!start||!end||start.closest('.live-msg')!==first||end.closest('.live-msg')!==first)return null;const text=String(selection.toString()||'').replace(/\r\n?/g,'\n').trim(),index=Number(first.dataset&&first.dataset.messageIndex),message=Number.isSafeInteger(index)?S.chat[index]||null:null;return text?{text,index,message,selection}:null}
  function messageSelectionText(selection=globalThis.getSelection&&globalThis.getSelection()){return messageSelection(selection)?.text||''}
  const quoteBlock=(text,index=1)=>String(text||'').replace(/\r\n?/g,'\n').trim().split('\n').map((line,i)=>(i?'':'['+index+'] ') +'> '+line).join('\n');
  function nextQuoteNumber(text){let next=1;for(const match of String(text||'').matchAll(/^\[(\d+)\](?=\s+>\s)/gm))next=Math.max(next,Number(match[1])+1);return next}
  function insertQuote(text){const ta=document.querySelector('.frame.cur .live-in')||document.querySelector('.live-in');if(!ta)return false;const value=String(ta.value||''),quote=quoteBlock(text,nextQuoteNumber(value));if(!quote)return false;const raw=Number.isInteger(ta.selectionStart)&&ta.selectionStart===ta.selectionEnd?ta.selectionStart:value.length,at=Math.max(0,Math.min(value.length,raw)),before=value.slice(0,at),after=value.slice(at),prefix=before&&!before.endsWith('\n')?'\n':'',suffix=after&&!after.startsWith('\n')?'\n':'',insert=prefix+quote+'\n\n';ta.value=before+insert+suffix+after;const caret=(before+insert).length;S.draft=ta.value;save();if(ta.style){ta.style.height='auto';ta.style.height=Math.min(160,ta.scrollHeight||0)+'px'}if(typeof ta.focus==='function')ta.focus();if(typeof ta.setSelectionRange==='function')ta.setSelectionRange(caret,caret);if(typeof ta.dispatchEvent==='function'&&typeof Event==='function')ta.dispatchEvent(new Event('input',{bubbles:true}));return true}
  let quoteButton=null,quoteSnapshot=null;
  function clearQuoteButton(){if(quoteButton){quoteButton.remove();quoteButton=null}quoteSnapshot=null}
  const quoteSource=snapshot=>{const m=snapshot.message,label=m.role==='me'?'из вопроса владельца':'из ответа '+(m.who||paneName(H.pane)),time=fullMessageTime(m.t);return label+(time?', '+time:'')};
  function selectionForText(text){const normalized=String(text||'').replace(/\r\n?/g,'\n').trim(),current=messageSelection();if(current&&current.text===normalized)return current;return quoteSnapshot&&quoteSnapshot.text===normalized?quoteSnapshot:null}
  function transferSelection(snapshot,anchor){if(!H.on){toast('Харнесс не подключён');return}if(!snapshot.message||!Number.isSafeInteger(snapshot.message.seq)||snapshot.message.seq<=0){toast('Источник цитаты ещё не сохранён');return}const me=H.pane?H.pane.id:'room',items=(H.panes||[]).filter(p=>p.id!=='room'&&p.id!==me).map(p=>({t:esc(paneName(p)),r:esc(modelName(p.model))+(p.busy?' · отвечает':''),id:p.id}));if(!items.length){toast('В команде пока один собеседник — сначала назначьте роль');return}const binding=sendBinding();laMulti(anchor,'передать цитату в чат · только выбранный фрагмент и комментарий',items,'Продолжить',picked=>{if(bindingCurrent(binding)&&!leftPage)selStart(picked.map(x=>x.id),{sw:false,quotes:[{seq:snapshot.message.seq,text:snapshot.text,comment:'',source:quoteSource(snapshot)}]})})}
  function positionQuoteButton(rect){quoteButton.style.left=Math.max(8,Math.min((globalThis.innerWidth||1440)-170,rect.right+8))+'px';quoteButton.style.top=Math.max(8,Math.min((globalThis.innerHeight||900)-40,rect.bottom+6))+'px'}
  function drawQuoteButton(event){if(event&&quoteButton&&quoteButton.contains&&quoteButton.contains(event.target))return;const snapshot=messageSelection(),selection=snapshot&&snapshot.selection;if(!snapshot){clearQuoteButton();return}let rect=null;try{rect=selection.getRangeAt(0).getBoundingClientRect()}catch{}if(!rect||!Number.isFinite(rect.left)||!Number.isFinite(rect.right)||!Number.isFinite(rect.bottom)){clearQuoteButton();return}if(quoteButton&&quoteSnapshot&&quoteSnapshot.text===snapshot.text&&quoteSnapshot.index===snapshot.index){quoteSnapshot=snapshot;positionQuoteButton(rect);return}clearQuoteButton();const actions=document.createElement('div');actions.className='live-quote-selection';actions.innerHTML='<button type="button" data-selection-reply>Ответить</button><button type="button" data-selection-transfer>Передать</button>';actions.addEventListener('mousedown',event=>event.preventDefault());actions.querySelector('[data-selection-reply]').addEventListener('click',()=>{const current=selectionForText(snapshot.text);if(!current){clearQuoteButton();return}insertQuote(snapshot.text);if(selection.removeAllRanges)selection.removeAllRanges();clearQuoteButton()});actions.querySelector('[data-selection-transfer]').addEventListener('click',()=>{const current=selectionForText(snapshot.text);if(!current){clearQuoteButton();return}transferSelection(current,actions)});document.body.appendChild(actions);quoteButton=actions;quoteSnapshot=snapshot;positionQuoteButton(rect)}
  document.addEventListener('selectionchange',()=>setTimeout(drawQuoteButton,0));document.addEventListener('mouseup',drawQuoteButton);document.addEventListener('keyup',drawQuoteButton);addEventListener('pagehide',clearQuoteButton);
  if(window.harnessy&&typeof window.harnessy.onQuote==='function')window.harnessy.onQuote(text=>{const snapshot=selectionForText(text);if(snapshot)insertQuote(snapshot.text)});
  if(window.harnessy&&typeof window.harnessy.onTransfer==='function')window.harnessy.onTransfer(text=>{const snapshot=selectionForText(text);if(snapshot)transferSelection(snapshot,quoteButton||document.body)});
  const cols=()=>document.querySelectorAll('.feed .col');
  function scrollEnd(){ document.querySelectorAll('.feed').forEach(f=>f.scrollTop=f.scrollHeight); if(document.documentElement.hasAttribute('data-m')) window.scrollTo(0,document.documentElement.scrollHeight); }
  function guidanceState(){if(!S.chatGuidance||typeof S.chatGuidance!=='object'||Array.isArray(S.chatGuidance))S.chatGuidance={model:{},orchestrator:{}};if(!S.chatGuidance.model||typeof S.chatGuidance.model!=='object'||Array.isArray(S.chatGuidance.model))S.chatGuidance.model={};if(!S.chatGuidance.orchestrator||typeof S.chatGuidance.orchestrator!=='object'||Array.isArray(S.chatGuidance.orchestrator))S.chatGuidance.orchestrator={};return S.chatGuidance}
  function guidanceKey(binding=sendBinding()){return JSON.stringify([binding.project||'',binding.pane||'room',binding.chat||null])}
  let orchestratorOfferForced=null;
  function chatGuidanceDraw(){document.querySelectorAll('[data-model-guidance], [data-orchestrator-guidance]').forEach(node=>node.remove());if(!H.on||H.snapshotOnly||!['new','chat','first'].includes(PAGE))return;const binding=sendBinding(),key=guidanceKey(binding),state=guidanceState(),pane=(H.panes||[]).find(p=>p.id===binding.pane)||null;
    if((PAGE==='new'||PAGE==='chat')&&(!pane||!pane.model)&&!state.model[key]){const html='<section class="live-guidance" data-model-guidance role="status"><button type="button" class="live-guidance-close" data-model-guidance-close aria-label="Закрыть">×</button><b>Подключите модель, когда захотите</b><p>Чат уже доступен. Выберите модель перед первым сообщением.</p><a class="btn sm ghost" href="11-connections.html">Подключения</a></section>',host=PAGE==='new'?document.querySelector('.frame.cur .nc')||document.querySelector('.nc'):document.querySelector('.frame.cur .feed .col')||document.querySelector('.frame .feed .col');if(host){if(PAGE==='new'){const holder=document.createElement('div'),box=host.querySelector('.box');holder.innerHTML=html;host.insertBefore(holder.firstElementChild,box&&box.previousElementSibling||box||host.firstChild)}else host.insertAdjacentHTML('beforeend',html)}}
    const answered=S.chat.some(message=>message&&message.src==='live'&&message.role!=='me'&&message.pane==='room'),forced=orchestratorOfferForced===key,room=binding.pane==='room'&&!!binding.chat,hasOrchestrator=(H.panes||[]).some(p=>p.kind==='orchestrator');if(room&&!hasOrchestrator&&(answered||forced)&&!state.orchestrator[key]){const host=document.querySelector('.frame.cur .feed .col')||document.querySelector('.frame .feed .col');if(host)host.insertAdjacentHTML('beforeend','<section class="live-guidance live-orchestrator-guidance" data-orchestrator-guidance role="status"><b>Назначить оркестратора этому разговору?</b><p>Оркестратор сохранит разговор и сможет предложить команду. Это можно сделать позже.</p><div class="act"><button type="button" class="btn sm p" data-orchestrator-guidance-accept>Назначить</button><button type="button" class="btn sm ghost" data-orchestrator-guidance-later>Не сейчас</button></div></section>')}
  }
  function showOrchestratorOffer(){const binding=sendBinding();if(binding.pane!=='room'||!binding.chat){toast('Выберите разговор без роли');return false}const key=guidanceKey(binding),state=guidanceState();delete state.orchestrator[key];orchestratorOfferForced=key;save();chatGuidanceDraw();document.querySelector('[data-orchestrator-guidance]')?.scrollIntoView?.({block:'nearest'});return true}
  document.addEventListener('click',async event=>{const modelClose=event.target.closest('[data-model-guidance-close]'),later=event.target.closest('[data-orchestrator-guidance-later]'),accept=event.target.closest('[data-orchestrator-guidance-accept]');if(!modelClose&&!later&&!accept)return;event.preventDefault();event.stopImmediatePropagation();const binding=sendBinding(),key=guidanceKey(binding),state=guidanceState();if(modelClose){state.model[key]=true;save();chatGuidanceDraw();return}if(later){state.orchestrator[key]=true;orchestratorOfferForced=null;save();chatGuidanceDraw();return}if(!accept.disabled){accept.disabled=true;let promoted=false;try{promoted=await promoteConversation(accept.closest('[data-orchestrator-guidance]')||accept,binding)}finally{accept.disabled=false;if(promoted)chatGuidanceDraw()}}},true);
  function render(){ cols().forEach(c=>{ c.querySelectorAll('.live-msg, .live-sep').forEach(x=>x.remove()); c.classList.toggle('live-demo-off',H.on||!S.ui.demo);
      c.insertAdjacentHTML('beforeend','<div class="live-sep">'+(H.on?(S.chat.length?'ваш разговор · через харнесс':'разговор пуст'):(S.chat.length?'ваш разговор в прототипе · <a data-clear>очистить</a> · ':'разговор пуст · ')+'<a data-demo>'+(S.ui.demo?'скрыть пример':'пример разговора')+'</a>')+'</div>'+S.chat.map(bubble).join('')); }); updateMessageTimes();hydrateArtifacts();selBar(); drawLive();chatGuidanceDraw();if(typeof operationsDraw==='function')operationsDraw(); if(S.chat.length) scrollEnd(); }
  document.addEventListener('click',e=>{ if(e.target.closest('a[data-demo]')){ S.ui.demo=!S.ui.demo; save(); render(); } });
  let attachmentDialog=null,attachmentOpener=null;
  function closeAttachmentDialog(){if(!attachmentDialog)return;attachmentDialog.close();attachmentDialog.remove();attachmentDialog=null;if(attachmentOpener&&attachmentOpener.isConnected)attachmentOpener.focus();attachmentOpener=null}
  document.addEventListener('click',e=>{if(e.target.closest('[data-attachment-close]')){e.preventDefault();closeAttachmentDialog();return}const opener=e.target.closest('[data-attachment-view]');if(!opener)return;e.preventDefault();const id=opener.dataset.attachmentView;if(!/^[0-9a-f]{64}$/.test(id))return;closeAttachmentDialog();attachmentOpener=opener;attachmentDialog=document.createElement('dialog');attachmentDialog.className='live-image-dialog';attachmentDialog.innerHTML='<button type="button" data-attachment-close aria-label="Закрыть">×</button><img src="/api/attachments/'+id+'" alt="Вложенное изображение крупно">';document.body.appendChild(attachmentDialog);attachmentDialog.addEventListener('cancel',event=>{event.preventDefault();closeAttachmentDialog()});attachmentDialog.addEventListener('click',event=>{if(event.target===attachmentDialog)closeAttachmentDialog()});attachmentDialog.showModal();attachmentDialog.querySelector('[data-attachment-close]').focus()});
  document.addEventListener('click',e=>{ const d=e.target.closest('[data-direct]'); if(!d||!H.pane) return; const q=S.draft||'',source=sendBinding(),sourceKey=attachmentKey(source),images=attachmentRefs(sourceKey); document.querySelectorAll('.live-direct').forEach(x=>x.remove());
    if(d.dataset.direct==='on'){ const binding=sendBinding(); S.ui.direct=S.ui.direct||{}; S.ui.direct[binding.pane]=true; save(); log('чат','Обращение напрямую к «'+paneName(H.pane)+'», минуя оркестратора'); toast('Напрямую к «'+esc(paneName(H.pane))+'» — записано в журнал'); if(window.CX) CX.render(); return q||images.length?onSend(q,null,binding):false; }
    if(d.dataset.direct==='orch'){ const o=(H.panes||[]).find(p=>p.kind==='orchestrator'); if(o){invalidateBinding();S.ui.pane=o.id; save(); pickPane(); hStatus(); const binding=sendBinding(); if(window.CX) CX.render(); return loadChat().then(()=>{if(!q&&!images.length)return false;attachmentSet(sourceKey,[]);attachmentRestore(attachmentKey(binding),images);return onSend(q,null,binding)}); } } });
  // ── переключение собеседника с контекстом: чекбоксы у реплик, промпт, передача текстом (между моделями и вендорами переносится только текст)
  let SEL=null;
  const plain=m=>m.text||String(m.html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  function selStart(to,opts){if(SEL&&SEL.sending)return;opts=opts||{};const ids=Array.isArray(to)?to:[to],items=new Map(),quotes=Array.isArray(opts.quotes)?opts.quotes.filter(q=>q&&Number.isSafeInteger(q.seq)&&q.seq>0&&typeof q.text==='string'&&q.text.trim()).map(q=>({seq:q.seq,text:q.text.replace(/\r\n?/g,'\n').trim(),comment:String(q.comment||''),source:String(q.source||'')})):[];S.chat.forEach(m=>{if(Number.isSafeInteger(m.seq)&&m.seq>0&&(m.role==='me'||m.src==='live'))items.set(m.seq,{role:m.role,who:m.who,text:plain(m)})});
    if(!quotes.length&&!items.size){SEL=null;render();toast('Передавать нечего — разговор пуст');return}const from=H.pane&&H.pane.id!=='room'?paneName(H.pane):'разговора без роли';
    SEL={to:ids,sw:opts.sw!==false,items,checked:new Set(),quotes,binding:sendBinding(),sending:false,prompt:quotes.length?'':'Прочитай контекст чата от '+from+' и жди команду.'};render();}   // Новый обычный диалог начинает с пустого выбора; цитатный содержит только явно выбранные фрагменты.
  const selChars=()=>!SEL?0:SEL.quotes.length?SEL.quotes.reduce((a,q)=>a+[...q.text,...q.comment].length,0):[...SEL.checked].reduce((a,i)=>a+[...SEL.items.get(i).text].length,0);
  function selUpdate(){if(!SEL)return;document.querySelectorAll('[data-ck]').forEach(n=>{n.checked=SEL.checked.has(+n.dataset.ck);n.disabled=SEL.sending});
    document.querySelectorAll('.live-selbar .n').forEach(n=>n.textContent=SEL.quotes.length?SEL.quotes.length+' цитат':SEL.checked.size+' из '+SEL.items.size+' сообщений');document.querySelectorAll('.live-selbar .ch').forEach(n=>n.textContent=fmtN(selChars())+' знаков');
    document.querySelectorAll('[data-sel="go"]').forEach(n=>n.disabled=SEL.sending||!SEL.quotes.length&&!SEL.checked.size);}
  function selBar(){document.querySelectorAll('.live-selbar').forEach(x=>x.remove());if(!SEL)return;if(!bindingCurrent(SEL.binding)){SEL=null;return}const tos=(H.panes||[]).filter(p=>SEL.to.includes(p.id));if(tos.length!==SEL.to.length){SEL=null;return}const toName=tos.map(p=>esc(paneName(p))).join(', ');
    document.querySelectorAll('.frame .box').forEach(box=>{const bar=document.createElement('div');bar.className='live-selbar';bar.setAttribute('role','dialog');bar.setAttribute('aria-label','Перенос контекста');
      bar.innerHTML='<div class="t">'+(SEL.quotes.length?'передать цитату':'передать контекст')+' → <b>'+toName+'</b> · <b class="n">'+(SEL.quotes.length?SEL.quotes.length+' цитат':SEL.checked.size+' из '+SEL.items.size+' сообщений')+'</b> · <span class="ch">'+fmtN(selChars())+' знаков</span></div>'+
        (SEL.quotes.length?'<div class="live-sel-quotes">'+SEL.quotes.map((q,i)=>'<div><pre>'+esc(quoteBlock(q.text,i+1))+'</pre><textarea data-quote-comment="'+i+'" maxlength="4000" placeholder="Комментарий к цитате"'+(SEL.sending?' disabled':'')+'>'+esc(q.comment)+'</textarea><small>Источник: '+esc(q.source)+'</small></div>').join('')+'</div>':'<div class="live-sel-list">'+[...SEL.items].map(([i,m])=>'<label><input type="checkbox" data-ck="'+i+'"'+(SEL.checked.has(i)?' checked':'')+(SEL.sending?' disabled':'')+'><span><b>'+esc(m.role==='me'?'Владелец':m.who||'Ответ')+'</b><span>'+esc(m.text)+'</span></span></label>').join('')+'</div><input class="live-f" aria-label="Вводная для адресата" maxlength="2000" value="'+esc(SEL.prompt)+'"'+(SEL.sending?' disabled':'')+'>')+
        '<div class="acts"><button type="button" class="btn sm p" data-sel="go"'+(!SEL.quotes.length&&!SEL.checked.size||SEL.sending?' disabled':'')+'>'+(SEL.sending?'Отправляю…':SEL.sw?'Отправить и переключиться':'Отправить')+'</button>'+(SEL.quotes.length?'':'<button type="button" class="btn sm ghost" data-sel="all"'+(SEL.sending?' disabled':'')+'>Выбрать все</button><button type="button" class="btn sm ghost" data-sel="none"'+(SEL.sending?' disabled':'')+'>Снять выбор</button>')+'<button type="button" class="btn sm ghost" data-sel="cancel"'+(SEL.sending?' disabled':'')+'>Отмена</button></div><small>'+(SEL.quotes.length?'Отправятся только выбранная цитата, ваш комментарий и источник. Другие сообщения не добавляются.':'Отправятся только отмеченные сообщения. Адресат прочитает и ответит — один ход.')+'</small>';
      const top=box.previousElementSibling&&box.previousElementSibling.classList.contains('cx-top')?box.previousElementSibling:box;top.before(bar);});}
  document.addEventListener('input',e=>{if(!SEL||SEL.sending)return;if(e.target.matches('.live-selbar .live-f'))SEL.prompt=e.target.value;const quote=e.target.closest&&e.target.closest('[data-quote-comment]');if(quote&&SEL.quotes[+quote.dataset.quoteComment]){SEL.quotes[+quote.dataset.quoteComment].comment=quote.value;selUpdate()}});
  addEventListener('live:status',()=>{if(SEL&&!bindingCurrent(SEL.binding)){SEL=null;render()}});addEventListener('pagehide',()=>{SEL=null});
  document.addEventListener('click',async e=>{const ck=e.target.closest('[data-ck]'),sb=e.target.closest('[data-sel]');if(!SEL||!ck&&!sb)return;if(!bindingCurrent(SEL.binding)){SEL=null;render();return}if(SEL.sending)return;
    if(ck){const i=+ck.dataset.ck;if(!SEL.items.has(i))return;if(ck.checked)SEL.checked.add(i);else SEL.checked.delete(i);selUpdate();return}const k=sb.dataset.sel;
    if(k==='cancel'){ SEL=null; render(); return; }
    if(k==='all'||k==='none'){SEL.checked=new Set(k==='all'?SEL.items.keys():[]);render();return}
    if(k==='go'){const selection=SEL,to=selection.to,prompt=selection.prompt.trim(),seqs=[...selection.checked].sort((a,b)=>a-b),quotes=selection.quotes.map(q=>({seq:q.seq,text:q.text,comment:q.comment.trim()})),picked=quotes.length?quotes:seqs.map(i=>selection.items.get(i));if(!picked.length)return;
      const names=(H.panes||[]).filter(p=>to.includes(p.id)).map(paneName).join(', '),body={to,chat:selection.binding.chat,kind:'note',from:selection.binding.pane,...(quotes.length?{quotes,prompt:''}:{seqs,prompt})};selection.sending=true;render();let r=null;try{r=await api('/api/handoff',body)}catch{}if(SEL!==selection||!bindingCurrent(selection.binding))return;
      if(!r||!r.ok){selection.sending=false;render();toast('Не вышло: '+esc((r&&r.error)||'нет связи'));return}const sw=selection.sw;SEL=null;render();
      const unit=quotes.length?' цитат':' реплик';if(sw){ invalidateBinding(); S.ui.pane=to[0]; save(); pickPane(); hStatus(); if(window.CX) CX.render(); await loadChat(); log('чат','Контекст передан: '+names+' · '+picked.length+unit); toast('Контекст передан: '+esc(names)+' · '+picked.length+unit+' · запись №'+r.seq+' — собеседник переключён'); }
      else { noteHandoff(r); log('чат','Контекст передан: '+names+' · '+picked.length+unit); toast('Контекст передан: '+esc(names)+' · '+picked.length+unit+' · запись №'+r.seq+' — вы остались в этом чате'); } } });
  // меню действий под ответом: роли и папки — настоящие вызовы харнесса
  function closeLAMenus(){ document.querySelectorAll('.live-menu.la').forEach(m=>m.__close?m.__close():m.remove()); }
  function dismissLAMenu(m){ const close=()=>{ m.remove(); document.removeEventListener('click',off,true); document.removeEventListener('keydown',key,true); };
    const off=e=>{ if(!m.contains(e.target)) close(); },key=e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    m.__close=close; document.addEventListener('keydown',key,true); setTimeout(()=>{ if(m.isConnected) document.addEventListener('click',off,true); },0); return close; }
  function laMenu(anchor,title,items,onPick){ closeLAMenus(); const m=document.createElement('div'); m.className='live-menu la'; anchor.style.position='relative';
    m.innerHTML='<div class="h">'+title+'</div>'+(items.length?items.map((it,i)=>'<div data-k="'+i+'"'+(it.dis?' class="dis"':'')+'>'+it.t+(it.r?' <small>'+it.r+'</small>':'')+'</div>').join(''):'<div class="dis">нечего предложить</div>'); anchor.appendChild(m);
    const close=dismissLAMenu(m); m.addEventListener('click',e=>{ e.stopPropagation(); const d=e.target.closest('[data-k]'); if(!d||d.classList.contains('dis')) return; close(); onPick(items[+d.dataset.k]); }); }
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
  // TS-09b4: one progress view for bound long operations.
  const OPS={items:new Map()};
  const PROMOTION_STEPS=['папка','вводная и документы','место','первое поручение'];
  function operationIdentity(op,row){const previous=op.previous;return row&&row.chat===op.binding.chat&&typeof row.operationId==='string'&&row.operationId&&
    (previous?['operationId','chat','sourceProject','sourceRevision','target','pane'].every(k=>row[k]===previous[k]):row.sourceProject===op.binding.project&&row.sourceRevision===op.revision)&&(!op.operationId||row.operationId===op.operationId)}
  function operationCurrent(op){if(!op||OPS.items.get(op.key)!==op||leftPage||op.navigation!==bindingNavigation)return false;
    const same=H.project===op.binding.project&&(H.confirmedProjectGeneration||0)===op.confirmed;
    if(same&&(op.projectOnly||bindingCurrent(op.binding)))return true;
    return op.kind==='promotion'&&(H.confirmedProjectGeneration||0)<=op.confirmed+1&&((H.liveStatus||{}).promotions||[]).some(row=>operationIdentity(op,row)&&row.target===H.project);
  }
  function operationHTML(op,inline=false){const completed=Math.min(op.steps.length,op.completed),step=Math.min(op.steps.length,completed+1),caption=op.error?'Операция не завершена':completed===op.steps.length?'Готово':op.preparing||op.steps[step-1];
    return '<div class="operation'+(inline?' operation-inline':'')+(op.error?' operation-error':'')+(op.attention?' operation-attention':'')+'" data-operation="'+esc(op.key)+'" role="status" aria-live="polite"><b>'+esc(op.title)+'</b><div class="operation-meter" role="progressbar" aria-label="'+esc(op.title)+'" aria-valuemin="0" aria-valuemax="'+op.steps.length+'"'+(op.preparing?'':' aria-valuenow="'+completed+'"')+'>'+op.steps.map((_,i)=>'<i'+(i<completed?' class="on"':'')+'></i>').join('')+'</div><small>шаг '+step+' из '+op.steps.length+' · '+esc(caption)+(op.attention?' · уже идёт':'')+'</small>'+(!inline&&op.error?'<p role="alert">'+esc(op.error)+'</p>'+(op.retry?'<button type="button" class="btn sm ghost" data-operation-retry="'+esc(op.key)+'"'+(op.running?' disabled':'')+'>'+esc(op.retryLabel||'Повторить')+'</button>':''):'')+'</div>';
  }
  function operationsDraw(){for(const [key,op]of OPS.items)if(!operationCurrent(op))OPS.items.delete(key);
    const items=[...OPS.items.values()],html=items.map(op=>operationHTML(op)).join('');
    let box=document.querySelector('[data-live-operations]');const host=(PAGE==='first'&&document.querySelector('.fr .st.on'))||document.querySelector('.frame.cur .feed .col')||document.querySelector('.frame .feed .col')||document.querySelector('.frame.cur .main')||document.querySelector('.frame .main')||document.querySelector('.main');
    if(!items.length){if(box)box.remove()}else if(host){if(!box){box=document.createElement('section');box.setAttribute('data-live-operations','');host.appendChild(box)}if(PAGE==='first'&&box.parentElement!==host){box.remove();host.appendChild(box)}if(box.innerHTML!==html)box.innerHTML=html;}
    document.querySelectorAll('.frame .top').forEach(top=>{let line=top.querySelector('[data-operation-header]');if(!items.length){if(line)line.remove();return}if(!line){line=document.createElement('div');line.setAttribute('data-operation-header','');top.appendChild(line)}const content=operationHTML(items[0],true);if(line.innerHTML!==content)line.innerHTML=content});
    const promoting=items.find(op=>op.kind==='promotion'&&op.running),moving=items.find(op=>op.kind==='move'&&op.running);
    document.querySelectorAll('[data-la="assign"], [data-cx="role"], [data-la="move"], [data-la="mkdir"], [data-operation-locked]').forEach(button=>{const active=button.matches('[data-la="assign"], [data-cx="role"]')?promoting:button.matches('[data-la="move"], [data-la="mkdir"]')?moving:null;
      if(active){if(!button.hasAttribute('data-operation-locked')){button.setAttribute('data-operation-locked','');button.__operationLabel=button.innerHTML;button.__operationDisabled=button.disabled}button.innerHTML=active.kind==='promotion'?'Создаём оркестратора…':'Переносим разговор…';button.setAttribute('data-operation-key',active.key);button.setAttribute('aria-disabled','true');if(button.tagName==='BUTTON')button.disabled=true}
      else if(button.hasAttribute('data-operation-locked')){button.innerHTML=button.__operationLabel;button.disabled=button.__operationDisabled;button.removeAttribute('aria-disabled');button.removeAttribute('data-operation-locked');button.removeAttribute('data-operation-key')}
    });
  }
  function operationAttention(key){const op=OPS.items.get(key);if(op&&operationCurrent(op)){op.attention=true;operationsDraw();document.querySelector('[data-operation="'+key+'"]')?.scrollIntoView?.({block:'nearest'});return true}return false}
  function operationStart(key,kind,title,steps,binding=sendBinding(),options={}){const old=OPS.items.get(key);if(old&&old.running&&operationCurrent(old)){operationAttention(key);return null}
    const op={key,kind,title,steps,binding,navigation:bindingNavigation,confirmed:H.confirmedProjectGeneration||0,completed:0,preparing:'подготовка',running:true,error:null,...options};OPS.items.set(key,op);operationsDraw();return op;
  }
  function operationEnd(op,error=null){if(!operationCurrent(op)){if(OPS.items.get(op?.key)===op)OPS.items.delete(op.key);operationsDraw();return}op.running=false;op.preparing=null;op.error=error;if(!error)OPS.items.delete(op.key);operationsDraw()}
  function operationProgress(op,row){if(!operationIdentity(op,row))return;const p={completed:row.completed,error:row.error};
    if(row.stepCount!==4||row.step!==Math.min(row.completed+1,4)||!Number.isInteger(p.completed)||p.completed<0||p.completed>4||!(p.error===null||typeof p.error==='string'))return;
    if(p.completed<op.completed||op.error&&p.error===null&&p.completed===op.completed)return;op.operationId=row.operationId;op.completed=p.completed;op.preparing=null;op.error=p.error;operationsDraw();
  }
  function operationsStatus(){operationsDraw();const rows=(H.liveStatus||{}).promotions||[];if(!leftPage&&!H.snapshotOnly&&!OPS.items.has('promotion')){const binding=sendBinding(),row=rows.find(row=>row.chat===binding.chat&&row.stepCount===4&&Number.isInteger(row.completed)&&row.completed>=0&&row.completed<=4&&(row.completed<4||typeof row.error==='string')&&(row.error===null||typeof row.error==='string'));if(row)operationStart('promotion','promotion','Harnessy создаёт оркестратора…',PROMOTION_STEPS,binding,{previous:row,revision:row.sourceRevision,running:!row.error,retry:()=>promoteConversation(document.querySelector('.main'),sendBinding())})}for(const op of OPS.items.values())if(op.kind==='promotion')for(const row of rows)operationProgress(op,row);if(typeof TP!=='undefined'&&TP.project===H.project)operationsTeams(TP.data);operationsDraw()}
  function operationsEvent(ev){if(!ev||ev.project!==H.project)return;if(ev.type==='promotion')for(const op of OPS.items.values())if(op.kind==='promotion')operationProgress(op,ev.promotion)}
  document.addEventListener('click',event=>{const locked=event.target.closest('[data-operation-locked]');if(locked){event.preventDefault();event.stopImmediatePropagation();operationAttention(locked.dataset.operationKey);return}const retry=event.target.closest('[data-operation-retry]');if(!retry)return;event.preventDefault();event.stopImmediatePropagation();const op=OPS.items.get(retry.dataset.operationRetry);if(operationCurrent(op)&&!op.running&&op.retry){op.retry()}},true);
  addEventListener('live:status',operationsStatus);addEventListener('pagehide',()=>{OPS.items.clear();operationsDraw()});
  function proposalMaterialization(q,s){const rows=q.materializations;if(!Array.isArray(rows)||typeof s.operationId!=='string')return null;const matches=rows.filter(row=>row&&row.sid===s.sid&&row.operationId===s.operationId);if(matches.length!==1)return null;const row=matches[0],keys=['team','seatFile','chat','status','onboarding'];
    if(!['pending','running','failed','complete'].includes(row.state)||!(row.error===null||typeof row.error==='string')||row.stages!==null&&(!row.stages||keys.some(k=>typeof row.stages[k]!=='boolean')))return null;
    if(row.state==='pending'&&(row.stages!==null||row.error!==null)||row.state!=='pending'&&row.stages===null||row.state==='failed'&&!row.error||row.state==='complete'&&(row.error!==null||keys.some(k=>row.stages[k]!==true)))return null;return row;
  }
  function operationsTeams(proposals){for(const op of OPS.items.values()){if(op.kind!=='owner-seat'||!operationCurrent(op))continue;const q=proposals.find(q=>q.proposalId===op.proposalId&&q.version===op.version),s=q&&q.seats[op.seatIndex],row=s&&proposalMaterialization(q,s);if(!row){op.error='Состояние создания роли не получено';continue}op.completed=row.stages?['team','seatFile','chat','status','onboarding'].filter(k=>row.stages[k]).length:0;op.preparing=null;op.error=row.error}for(const q of proposals){if(!q.confirmed)continue;const key='seats:'+q.proposalId+':'+q.version,states=q.seats.map(s=>proposalMaterialization(q,s)),known=states.every(Boolean),completed=states.filter(row=>row?.state==='complete').length;let op=OPS.items.get(key);
    if(!op&&completed===q.seats.length)continue;
    if(!op)op=operationStart(key,'seats','Harnessy создаёт места…',q.seats.map(s=>s.label),sendBinding(),{projectOnly:true,preparing:'ожидаем оркестратора'});
    if(!op||!operationCurrent(op)||op.retrying)continue;const failed=states.findIndex(row=>row?.state==='failed');op.completed=completed;op.error=!known?'Состояние создания мест не получено':failed>=0?states[failed].error:null;op.running=known&&failed<0&&completed<q.seats.length;op.preparing=op.error?null:states.every(row=>row.state==='pending')?'ожидаем оркестратора':null;
    op.retryLabel=failed>=0?'Повторить':'Повторить чтение';op.retry=async()=>{if(!operationCurrent(op)||op.running)return;if(failed<0){await proposalsFetch();return}const project=op.binding.project;op.retrying=true;op.running=true;operationsDraw();
      try{const r=await api('/api/seats/owner',{project,proposalId:q.proposalId,version:q.version,seatIndex:failed,kind:proposalSeatKind(q,failed)});if(!operationCurrent(op))return;if(!r||!r.ok)throw Error(r&&r.error||'Создание места не завершено')}catch(error){operationEnd(op,error.message||'нет связи')}finally{op.retrying=false;op.running=false;if(operationCurrent(op))await proposalsFetch();else operationsDraw()}
    };
  }operationsDraw()}
  async function moveConversation(anchor,input){const old=OPS.items.get('move');if(old&&old.running&&operationCurrent(old)){operationAttention('move');return false}
    invalidateBinding();const binding=sendBinding(),op=operationStart('move','move','Harnessy переносит разговор…',['папка проекта','перенос разговора'],binding,{retry:()=>moveConversation(anchor,input)});
    try{const r=await api('/api/room/move',input);if(!operationCurrent(op))return false;if(!r||!r.ok)throw Error(r&&r.error||'нет связи');
      operationEnd(op);if(S.cx){S.cx.noFolder=false;delete S.cx.noFolderPending}S.ui.pane='room';save();const navigation=bindingNavigation;await refreshStatus();if(leftPage||navigation!==bindingNavigation||H.project!==r.project)return false;
      S.chat.forEach(x=>{if(x.pane==='room')x.nf=false});save();render();log('настройка','Разговор переехал в проект '+r.project.split('/').pop());toast('Разговор переехал: '+esc(r.project.split('/').pop())+(r.carried?' · прежний разговор уйдёт следующим сообщением':''));return true;
    }catch(error){operationEnd(op,error.message||'нет связи');return false}finally{if(op.running)operationEnd(op)}
  }
  // End TS-09b4 operation view.
  // TS-09b2: one bound promotion for both UI entrances.
  let promotionBusy=false;
  async function promoteConversation(anchor,binding=sendBinding()){
    if(promotionBusy||OPS.items.get('promotion')?.running&&operationCurrent(OPS.items.get('promotion'))){operationAttention('promotion');return false}if(!bindingCurrent(binding))return false;
    if((binding.pane!=='room'&&!((H.chatList||[]).find(c=>c.id===binding.chat)||{}).promotion?.pending)||!binding.chat){toast('Выберите разговор без роли');return false}
    if(S.cx&&S.cx.noFolderPending){toast('Сначала выберите модель разговора');return false}
    if(typeof traceCapture==='function'&&traceCapture())binding={...binding,trace:traceCapture()};promotionBusy=true;const progress=operationStart('promotion','promotion','Harnessy создаёт оркестратора…',PROMOTION_STEPS,binding,{retry:()=>promoteConversation(anchor,sendBinding())});
    try{
      if(!await settingsReady(binding)||!bindingCurrent(binding)||leftPage){operationEnd(progress,'Настройка разговора не сохранена');return false;}
      const snapshot=await api('/api/chats/'+encodeURIComponent(binding.chat),null,{trace:binding.trace});
      if(!bindingCurrent(binding)||leftPage)return false;
      const chat=snapshot&&snapshot.chat;
      if(!chat||chat.id!==binding.chat||chat.pane!==binding.pane||!Number.isSafeInteger(chat.revision)||!Array.isArray(chat.documents)){operationEnd(progress,'Не удалось прочитать привязку разговора');toast('Не удалось прочитать привязку разговора');return false}
      if(!chat.model){operationEnd(progress,'Сначала выберите модель разговора');toast('Сначала выберите модель разговора');return false}
      const path='/api/chats/'+encodeURIComponent(chat.id)+'/orchestrator',body={project:binding.project,revision:chat.revision,documents:chat.documents,...(H.noProject&&!chat.promotion?.pending?{createProject:true}:{})},operation={...captureProjectOperation(path,body),previousPromotion:chat.promotion,trace:binding.trace};
      progress.revision=chat.revision;progress.previous=chat.promotion?.operationId?chat.promotion:null;progress.preparing=null;operationsDraw();
      const r=await api(path,body,operation);if(!operationCurrent(progress)||!projectOperationCurrent(operation,r))return false;
      if(!r||!r.ok){
        operationEnd(progress,r&&r.error||'нет связи');toast('Не вышло: '+esc(r&&r.error||'нет связи'));
        if(r&&r.code==='orchestrator_exists'&&r.chat)laMenu(anchor,'В проекте уже есть оркестратор',[{t:'Открыть существующий',id:r.chat}],async()=>{
          if(!bindingCurrent(binding)||leftPage)return;
          const out=await api('/api/chats/open',{chat:r.chat});if(!bindingCurrent(binding)||leftPage)return;
          if(!out||!out.ok){toast(esc(out&&out.error||'Нет связи'));return}
          invalidateBinding();S.ui.pane=r.pane;S.ui.fresh=false;save();const opening=bindingNavigation;await refreshStatus();
          if(leftPage||bindingNavigation!==opening||H.project!==binding.project||(H.active||{})[r.pane]!==r.chat)return;
          S.ui.pane=r.pane;S.ui.fresh=false;S.ui.switched=true;save();pickPane();const selected=sendBinding();await loadChat({onboard:false});
          if(bindingCurrent(selected)&&!leftPage&&PAGE==='new')location.href='01-chat.html';
        });return false;
      }
      operationEnd(progress);invalidateBinding();if(S.cx){S.cx.noFolder=false;delete S.cx.noFolderPending}H.projects=null;S.ui.pane=r.pane.id;S.ui.fresh=false;S.ui.switched=true;save();
      const selectedNavigation=bindingNavigation;await refreshStatus();if(leftPage||bindingNavigation!==selectedNavigation||H.project!==r.project||(H.active||{})[r.pane.id]!==r.chat.id)return false;
      S.ui.pane=r.pane.id;S.ui.fresh=false;S.ui.switched=true;save();pickPane();const selected=sendBinding();await loadChat({onboard:false});if(!bindingCurrent(selected)||leftPage)return false;
      toast((r.created?'Проект создан по разговору · ':'')+'Оркестратор назначен · разговор сохранён');
      if(PAGE==='new')location.href='01-chat.html';return true;
    }catch(e){if(operationCurrent(progress)){operationEnd(progress,e.message||'нет связи');toast('Не удалось назначить оркестратора: '+esc(e.message))}return false}finally{promotionBusy=false;if(progress.running)operationEnd(progress);operationsDraw()}
  }
  // End TS-09b2 promotion.
  document.addEventListener('click',async e=>{ const la=e.target.closest('[data-la]'); if(!la) return; e.stopPropagation(); const m=S.chat[+la.dataset.i]; if(!m) return; const kind=la.dataset.la, anchor=la.closest('.live-acts');
    if(kind==='copy'){ try{ await navigator.clipboard.writeText(m.text||la.closest('.live-msg').innerText);const label=la.textContent;la.textContent='скопировано';setTimeout(()=>{if(la.isConnected)la.textContent=label},1200);toast('Скопировано'); }catch(x){ toast('Не удалось скопировать'); } return; }
    if(!H.on) { toast('Харнесс не подключён'); return; }
    if(kind==='handoff-none'){ toast('В команде пока один собеседник — сначала назначьте роль'); return; }
    if(kind==='assign'){if(promotionBusy){operationAttention('promotion');return}showOrchestratorOffer();return}
    if(kind==='handoff'){ const me=H.pane?H.pane.id:'room'; const items=(H.panes||[]).filter(p=>p.id!=='room'&&p.id!==me).map(p=>({t:esc(paneName(p)),r:esc(modelName(p.model))+(p.busy?' · отвечает':''),id:p.id}));
      const binding=sendBinding();laMulti(anchor,'передать контекст в чат · адресат прочитает и ответит (один ход модели)',items,'Выбрать сообщения',picked=>{if(bindingCurrent(binding)&&!leftPage)selStart(picked.map(x=>x.id),{sw:false})});return;}
    // новые проекты — в корень проектов движка, не рядом с текущим (урок 08.10: проект лёг внутрь репозитория harnessy)
    if(kind==='mkdir'){if(operationAttention('move')&&OPS.items.get('move')?.running)return;const def=(H.projectsRoot?H.projectsRoot+'/':(H.project||'').replace(/\/[^/]*$/,'/'))+'novyi-proekt';laPath(anchor,'создать проект и git',def,path=>moveConversation(anchor,{path,create:true,git:true}));return}
    if(kind==='move'){if(operationAttention('move')&&OPS.items.get('move')?.running)return;const binding=sendBinding();let pr=null;try{pr=await api('/api/projects')}catch(x){}if(!bindingCurrent(binding)||leftPage)return;
      const items=((pr&&pr.projects)||[]).map(p=>({t:esc(p.name),r:(p.seats==null?'? ролей':rolesN(p.seats))+(p.git?' · git':''),path:p.path}));laMenu(anchor,'перейти с разговором в проект',items,it=>bindingCurrent(binding)&&moveConversation(anchor,{path:it.path}));return} });
  function reply(q,binding=sendBinding(),attachments=[]){ if(H.on&&!H.pane){ cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg"><span class="orb"></span><div><div class="thought">без роли · модель не выбрана</div><p>Выберите модель в строке ввода — тогда отправлю.</p></div></div>')); scrollEnd(); S.draft=q; save(); return false; }
    if(H.on&&H.pane) return ask(q,binding,attachments); cols().forEach(c=>c.insertAdjacentHTML('beforeend','<div class="ai live-msg live-typing"><span class="orb"></span><div><div class="thought">думает…</div></div></div>')); scrollEnd();
    setTimeout(()=>{ S.chat.push({role:'ai',html:answer(q),t:now()}); S.chat=S.chat.slice(-40); save(); render(); },850); }
  const ATTACHMENT_LIMIT=8,ATTACHMENT_BYTES=10*1024*1024,ATT={local:new Map(),errors:new Map(),next:0,picker:null};
  const attachmentRef=a=>a&&typeof a.id==='string'&&/^[0-9a-f]{64}$/.test(a.id)&&['image/png','image/jpeg','image/webp','image/gif'].includes(a.mime)&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=ATTACHMENT_BYTES&&Number.isSafeInteger(a.w)&&a.w>0&&Number.isSafeInteger(a.h)&&a.h>0?{id:a.id,mime:a.mime,size:a.size,w:a.w,h:a.h}:null;
  function attachmentKey(binding=sendBinding()){return JSON.stringify([binding.project||'',binding.pane||'room',binding.chat||null,PAGE==='new'&&S.ui.fresh?'fresh':'chat'])}
  function attachmentStore(){if(!S.attachmentDrafts||typeof S.attachmentDrafts!=='object'||Array.isArray(S.attachmentDrafts))S.attachmentDrafts={};return S.attachmentDrafts}
  function attachmentRefs(key=attachmentKey()){const store=attachmentStore(),raw=Array.isArray(store[key])?store[key]:[],refs=[],seen=new Set();for(const value of raw){const ref=attachmentRef(value);if(ref&&!seen.has(ref.id)&&refs.length<ATTACHMENT_LIMIT){seen.add(ref.id);refs.push(ref)}}if(JSON.stringify(raw)!==JSON.stringify(refs))store[key]=refs;return refs}
  function attachmentSet(key,refs){const store=attachmentStore(),safe=[],seen=new Set();for(const value of refs||[]){const ref=attachmentRef(value);if(ref&&!seen.has(ref.id)&&safe.length<ATTACHMENT_LIMIT){seen.add(ref.id);safe.push(ref)}}if(safe.length)store[key]=safe;else delete store[key];save();return safe}
  function attachmentRestore(key,refs){return attachmentSet(key,[...attachmentRefs(key),...(refs||[])])}
  function attachmentPendingRefs(pending){return pending&&Array.isArray(pending.attachments)?pending.attachments.map(attachmentRef).filter(Boolean).slice(0,ATTACHMENT_LIMIT):[]}
  function attachmentLocal(key=attachmentKey()){let rows=ATT.local.get(key);if(!rows){rows=[];ATT.local.set(key,rows)}return rows}
  function attachmentPane(binding=sendBinding()){return (H.panes||[]).find(p=>p.id===binding.pane)||H.pane}
  function attachmentModelSupports(binding=sendBinding()){const pane=attachmentPane(binding);if(!H.on||!pane||!pane.model)return false;const model=(H.models&&H.models[pane.vendor]||[]).find(row=>row.id===pane.model);return !!model&&model.images===true}
  function attachmentFailure(result){const code=result&&result.code;return code==='images_unsupported'?'Эта модель не видит изображения — выберите другую или уберите картинку':code==='attachment_too_large'?'Изображение больше 10 МБ':code==='attachment_not_found'?'Изображение не найдено — добавьте его снова':code==='attachments_invalid'?'Уберите лишние изображения и повторите':code==='attachment_invalid'?'Файл не является картинкой или повреждён':(result&&result.error)||'Изображение не отправлено'}
  function attachmentState(box,binding=sendBinding()){const key=attachmentKey(binding),ready=attachmentRefs(key),local=attachmentLocal(key),pending=local.some(row=>row.state==='uploading'),invalid=local.some(row=>row.state==='error'),unsupported=ready.length>0&&!attachmentModelSupports(binding),fieldError=ATT.errors.get(key)||'',text=box&&box.__cx&&box.__cx.ta?box.__cx.ta.value.trim():'';return {key,ready,local,pending,invalid,unsupported,fieldError,hasContent:!!text||ready.length>0,blocked:pending||invalid||unsupported,reason:pending?'Дождитесь загрузки изображения':invalid?'Уберите файл с ошибкой':unsupported?'Эта модель не видит изображения — выберите другую или уберите картинку':fieldError}}
  function attachmentPreview(row){return row.preview?'<img src="'+esc(row.preview)+'" alt="Предпросмотр изображения">':'<span class="live-attachment-placeholder" aria-hidden="true">▧</span>'}
  function attachmentDraw(box){if(!box||!box.querySelector)return;let host=box.querySelector('.live-attachments'),input=box.querySelector(':scope > .in');if(!host&&input&&box.insertBefore){host=document.createElement('div');host.className='live-attachments';box.insertBefore(host,input)}if(!host)return;const state=attachmentState(box),ready=state.ready.map((a,n)=>'<div class="live-attachment"><img src="/api/attachments/'+a.id+'" alt="Вложенное изображение '+(n+1)+'"><button type="button" data-attachment-remove="'+a.id+'" aria-label="Убрать изображение">×</button></div>'),local=state.local.map(row=>'<div class="live-attachment '+(row.state==='error'?'is-error':'is-uploading')+'">'+attachmentPreview(row)+'<button type="button" data-attachment-local="'+row.token+'" aria-label="Убрать изображение">×</button><span>'+esc(row.state==='error'?row.error:'загрузка…')+'</span></div>'),count=state.ready.length+state.local.length,warning=state.unsupported?'Эта модель не видит изображения — выберите другую или уберите картинку':state.fieldError;host.innerHTML=(count?'<div class="live-attachment-strip">'+ready.concat(local).join('')+'<small>'+count+' из '+ATTACHMENT_LIMIT+'</small></div>':'')+(warning?'<p class="live-attachment-warning" role="alert">'+esc(warning)+'</p>':'');host.style.display=count||warning?'block':'none'}
  function attachmentsDraw(){document.querySelectorAll('.box').forEach(attachmentDraw)}
  function attachmentChanged(key,clearError=false){if(clearError)ATT.errors.delete(key);save();attachmentsDraw();if(window.CX)window.CX.render()}
  function attachmentError(row,message){row.state='error';row.error=message;attachmentChanged(row.key)}
  function attachmentBytes64(buffer){const bytes=new Uint8Array(buffer);let raw='';for(let start=0;start<bytes.length;start+=0x8000)raw+=String.fromCharCode(...bytes.subarray(start,start+0x8000));return btoa(raw)}
  async function attachmentUpload(file,row,binding){const projectChanged=()=>H.project!==binding.project||(H.confirmedProjectGeneration||0)!==row.confirmed;try{const buffer=await file.arrayBuffer();if(row.cancelled)return;if(buffer.byteLength>ATTACHMENT_BYTES){attachmentError(row,'больше 10 МБ');return}if(projectChanged()){attachmentError(row,'проект изменился — добавьте снова');return}const result=await api('/api/attachments',{base64:attachmentBytes64(buffer)});if(row.cancelled)return;if(projectChanged()){attachmentError(row,'проект изменился — добавьте снова');return}const ref=attachmentRef(result);if(!ref){attachmentError(row,result&&result.code==='attachment_too_large'?'больше 10 МБ':result&&result.code==='attachment_invalid'?'не картинка':attachmentFailure(result));return}const rows=attachmentLocal(row.key),at=rows.indexOf(row);if(at>=0)rows.splice(at,1);if(row.preview&&globalThis.URL&&URL.revokeObjectURL)URL.revokeObjectURL(row.preview);const refs=attachmentRefs(row.key);if(!refs.some(item=>item.id===ref.id))attachmentSet(row.key,[...refs,ref]);attachmentChanged(row.key,true)}catch(error){if(!row.cancelled)attachmentError(row,'не удалось загрузить картинку')}}
  function attachmentFiles(files,binding=sendBinding()){const key=attachmentKey(binding),rows=attachmentLocal(key);ATT.errors.delete(key);for(const file of Array.from(files||[])){if(attachmentRefs(key).length+rows.length>=ATTACHMENT_LIMIT){ATT.errors.set(key,'Не больше 8 изображений в одном сообщении');break}let preview='';try{if(file.type&&file.type.startsWith('image/')&&globalThis.URL&&URL.createObjectURL)preview=URL.createObjectURL(file)}catch{}const row={token:String(++ATT.next),key,state:'uploading',error:'',preview,cancelled:false,confirmed:H.confirmedProjectGeneration||0};rows.push(row);if(Number.isFinite(file.size)&&file.size>ATTACHMENT_BYTES){row.state='error';row.error='больше 10 МБ'}else void attachmentUpload(file,row,binding)}attachmentChanged(key);return true}
  function attachmentRemove(button){const key=attachmentKey();if(button.dataset.attachmentRemove){attachmentSet(key,attachmentRefs(key).filter(a=>a.id!==button.dataset.attachmentRemove));ATT.errors.delete(key);attachmentChanged(key);return}const token=button.dataset.attachmentLocal,row=attachmentLocal(key).find(item=>item.token===token);if(!row)return;row.cancelled=true;if(row.preview&&globalThis.URL&&URL.revokeObjectURL)URL.revokeObjectURL(row.preview);ATT.local.set(key,attachmentLocal(key).filter(item=>item!==row));ATT.errors.delete(key);attachmentChanged(key)}
  function pickImages(){if(!H.on){toast('Изображения доступны после подключения к движку');return}const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.multiple=true;input.hidden=true;document.body.appendChild(input);input.addEventListener('change',()=>{attachmentFiles(input.files,sendBinding());input.remove()},{once:true});input.click()}
  function composerState(box){return attachmentState(box)}
  document.addEventListener('click',event=>{const remove=event.target.closest('[data-attachment-remove], [data-attachment-local]');if(remove){event.preventDefault();event.stopPropagation();attachmentRemove(remove)}});
  function renumberQuotes(text){let index=0;return String(text||'').replace(/^\[\d+\](?=\s+>\s)/gm,()=> '['+(++index)+']')}
  async function onSend(v,ta,binding=sendBinding(),providedAttachments=null,providedKey=null){v=renumberQuotes(String(v||'').trim());const provided=Array.isArray(providedAttachments),key=attachmentKey(binding),draftKey=provided&&typeof providedKey==='string'?providedKey:key;let refs=provided?providedAttachments.map(attachmentRef).filter(Boolean).slice(0,ATTACHMENT_LIMIT):[];
    const restoreDraft=reason=>{S.draft=ta&&ta.value||v;if(provided&&refs.length)attachmentRestore(draftKey,refs);if(reason)ATT.errors.set(draftKey,reason);attachmentChanged(draftKey);return false};
    S.draft=ta&&ta.value||v;save();if(H.on&&(!await settingsReady(binding)||!bindingCurrent(binding))){if(leftPage)return restoreDraft();toast('Настройка или разговор изменились; сообщение осталось в черновике');return restoreDraft(); }
    if(H.on&&!(H.panes||[]).some(p=>p.id===binding.pane&&p.model)){toast('Сначала выберите модель');return restoreDraft()}
    const state=attachmentState(ta&&ta.closest?ta.closest('.box'):null,binding);if(!provided)refs=state.ready;
    if(!provided&&(state.pending||state.invalid||state.unsupported)||refs.length&&!attachmentModelSupports(binding))return restoreDraft(state.reason||'Эта модель не видит изображения — выберите другую или уберите картинку');
    if(ta&&renumberQuotes(ta.value.trim())!==v){S.draft=ta.value;save();return false} if(ta){ta.value='';ta.style.height=''} log('чат','Вопрос: '+(v?v.slice(0,90):refs.length+' изображений'));
    if(!provided)attachmentSet(key,[]);ATT.errors.delete(key);attachmentChanged(key);S.draft=null;
    if(!cols().length){ S.pending={text:v,attachments:refs,key,t:now(),target:binding}; save(); location.href='01-chat.html'; return true; }
    const sent={role:'me',text:v,attachments:refs,t:now()};S.chat.push(sent);save();render();const accepted=await reply(v,binding,refs);
    if(H.on&&accepted!==true&&refs.length){S.chat=S.chat.filter(message=>message!==sent);attachmentRestore(draftKey,refs);ATT.errors.set(draftKey,attachmentFailure(accepted));if(bindingCurrent(binding)){S.draft=v;if(ta){ta.value=v;ta.style.height='auto'}}save();render();attachmentChanged(draftKey);return false}return H.on?accepted===true:true; }
  function composer(){ document.querySelectorAll('.box').forEach(box=>{ const inEl=box.querySelector(':scope > .in'); if(!inEl||inEl.querySelector('textarea')) return;
      const ta=document.createElement('textarea'); ta.className='live-in'; ta.rows=PAGE==='new'?2:1; ta.placeholder=PAGE==='new'?'Спросите или поручите: «что сейчас делает команда?», «покажи расход», «что с планом»':(inEl.textContent.trim()||'Написать…'); inEl.textContent=''; inEl.appendChild(ta);
      let sending=false;const send=async()=>{if(sending)return;const v=ta.value.trim(),state=attachmentState(box);if(!v&&!state.ready.length||state.blocked){ta.focus();attachmentDraw(box);return}sending=true;try{await onSend(v,ta)}finally{sending=false}};
      ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } });
      ta.addEventListener('input',()=>{ ta.style.height='auto'; ta.style.height=Math.min(160,ta.scrollHeight)+'px'; });
      ta.addEventListener('paste',e=>{const files=Array.from(e.clipboardData&&e.clipboardData.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();attachmentFiles(files,sendBinding())}});
      if(box.addEventListener){box.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer&&e.dataTransfer.types||[]).includes('Files')){e.preventDefault();box.classList.add('live-image-drag')}});box.addEventListener('dragleave',()=>box.classList.remove('live-image-drag'));box.addEventListener('drop',e=>{box.classList.remove('live-image-drag');const files=Array.from(e.dataTransfer&&e.dataTransfer.files||[]);if(files.length){e.preventDefault();attachmentFiles(files,sendBinding())}})}
      const go=box.querySelector('.go'); if(go){ go.style.cursor='pointer'; go.title='Отправить'; go.addEventListener('click',send); }
      box.__cx={ta,send};   // строку (папка · роль · режимы / ＋ · права · модель · усилие · ⓘ) строит cx.js по варианту C′; клавиши — в ⓘ
      attachmentDraw(box);
      if(PAGE==='new'){ const st=box.closest('.main')&&box.closest('.main').querySelector('.starts'); if(st) ta.addEventListener('input',()=>st.classList.toggle('live-hidden',!!ta.value.trim())); } });   // п.2: быстрые старты уступают место тексту
    if(S.draft&&cols().length){ document.querySelectorAll('.live-in').forEach(ta=>ta.value=S.draft); S.draft=null; save(); const f=document.querySelector('.frame.cur .live-in'); if(f) setTimeout(()=>{ f.focus(); f.setSelectionRange(f.value.length,f.value.length); },60); }
    document.querySelectorAll('.starts .st').forEach(s=>{ s.style.cursor='pointer'; s.addEventListener('click',()=>{ const ta=document.querySelector('.frame.cur .live-in')||document.querySelector('.live-in'); const b=s.querySelector('b'); if(ta&&b){ ta.value=b.textContent.trim(); ta.focus(); } }); });
    document.querySelectorAll('.recent .chip').forEach(c=>{ c.style.cursor='pointer'; c.addEventListener('click',()=>location.href='01-chat.html'); }); }
  document.addEventListener('click',e=>{ if(e.target.closest('[data-clear]')){ S.chat=[]; save(); render(); toast('Разговор очищен'); } });

  // ── поиск ⌘K: экраны, открытые решения, действия
  const SCREENS=[['Новый чат','10-new-chat.html'],['Сейчас · чей ход и решения','14-now.html'],['Чат','01-chat.html'],['План · карта','02-plan.html'],['Документы проекта','17-doc.html'],['Артефакты','15-artifacts.html'],['Память проекта','16-memory.html'],['Ресёрч','12-research.html'],['Стая агентов','04-swarm.html'],['Датчики','13-sensors.html'],['Расход и лимиты','05-spend.html'],['Подключения и лимиты','11-connections.html'],['Журнал','21-journal.html'],['События','09-events.html'],['Настройки','06-settings.html'],['Уйти','18-overlays.html#leave'],['Первый запуск','19-first-run.html'],['Вход','20-login-pour.html'],['Дизайн-код','../disarto/00-design-code.html']];
  let pal,palSel=0,palItems=[];
  function palList(q){ q=q.trim().toLowerCase(); const it=SCREENS.map(x=>({t:x[0],k:'экран',go:()=>location.href=x[1]}))
      .concat(waiting().map(d=>({t:DEC[d],k:'ждёт вас',go:()=>location.href='14-now.html'})))
      .concat([{t:'Сбросить прототип к началу',k:'действие',go:reset},{t:'Очистить разговор',k:'действие',go:()=>{ S.chat=[]; save(); render(); closePal(); toast('Разговор очищен'); }}]);
    palItems=q?it.filter(x=>x.t.toLowerCase().includes(q)||x.k.includes(q)):it; palSel=0;
    pal.querySelector('.lp-list').innerHTML=palItems.map((x,i)=>'<div class="lp-i'+(i===0?' on':'')+'" data-i="'+i+'">'+esc(x.t)+'<small>'+x.k+'</small></div>').join('')||'<div class="lp-i">Ничего не найдено</div>'; }
  function openPal(){ if(!pal){ pal=document.createElement('div'); pal.className='live-pal'; pal.innerHTML='<div class="lp-box"><input placeholder="Найти экран, решение или действие…" aria-label="Поиск"><div class="lp-list"></div><div class="lp-foot">↑ ↓ выбрать · ⏎ открыть · esc закрыть</div></div>'; document.body.appendChild(pal);
      const inp=pal.querySelector('input'); inp.addEventListener('input',()=>palList(inp.value));
      inp.addEventListener('keydown',e=>{ const n=palItems.length; if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); if(!n)return; palSel=(palSel+(e.key==='ArrowDown'?1:-1)+n)%Math.max(1,n); pal.querySelectorAll('.lp-i').forEach((x,i)=>{x.classList.toggle('on',i===palSel);if(i===palSel)x.scrollIntoView({block:'nearest'})}); } else if(e.key==='Enter'&&palItems[palSel]){ palItems[palSel].go(); } });
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

  // TS-15b: project-bound swarm snapshots; demo actions never mutate the live team.
  const SWARM={project:null,generation:0,request:0,confirmed:0,alive:true,data:null,error:null,loading:false,queued:false,checking:null,refreshQueued:false,es:null,selected:null,view:'board',tools:new Map(),proposals:null,proposalError:null};
  const swarmRoot=()=>PAGE==='swarm'?document.querySelector('.frame .main'):null;
  const swCount=n=>Number.isSafeInteger(n)&&n>=0;
  const swNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const swRecord=x=>x&&swCount(x.seq)&&x.seq>0&&typeof x.ts==='string'&&Number.isFinite(Date.parse(x.ts))&&['from','kind','text'].every(k=>typeof x[k]==='string')&&Array.isArray(x.to)&&x.to.every(id=>typeof id==='string')&&(x.thread===null||typeof x.thread==='string');
  function swarmValid(r,project){return r&&r.ok===true&&r.project===project&&swNumber(r.generatedAt)&&typeof r.halted==='boolean'&&r.team&&(r.team.path===null||typeof r.team.path==='string')&&(r.team.integrationBranch===null||typeof r.team.integrationBranch==='string')&&r.journal&&swCount(r.journal.total)&&swCount(r.journal.lastSeq)&&Array.isArray(r.journal.records)&&r.journal.records.every(swRecord)&&r.journal.records.every(x=>x.seq<=r.journal.lastSeq)&&new Set(r.journal.records.map(x=>x.seq)).size===r.journal.records.length&&r.journal.total>=r.journal.records.length&&Array.isArray(r.panes)&&new Set(r.panes.map(p=>p&&p.id)).size===r.panes.length&&r.panes.every(p=>p&&['id','label','model','vendor','role','mode','cwd','status'].every(k=>typeof p[k]==='string')&&p.id&&p.id!=='room'&&typeof p.busy==='boolean'&&swCount(p.pendingApprovals)&&swCount(p.pending)&&Array.isArray(p.writePaths)&&p.writePaths.every(x=>typeof x==='string')&&Array.isArray(p.queue)&&p.pending===p.queue.length&&p.queue.every(swRecord)&&(p.waiting===null||p.waiting&&['uncertain','recovering'].includes(p.waiting.status)&&Array.isArray(p.waiting.recordSeqs)&&p.waiting.recordSeqs.every(swCount)&&(p.waiting.startedAt===null||swNumber(p.waiting.startedAt)))&&(p.turn===null||p.turn&&typeof p.turn.id==='string'&&(p.turn.startedAt===null||swNumber(p.turn.startedAt))&&Array.isArray(p.turn.records)&&p.turn.records.every(swRecord)&&(p.turn.message===null||typeof p.turn.message==='string'))&&p.context&&swNumber(p.context.used)&&(p.context.window===null||swNumber(p.context.window))&&(p.context.pct===null||swNumber(p.context.pct))&&typeof p.context.measured==='boolean'&&swCount(p.context.turns)&&(p.context.last===null||p.context.last&&['input','output','cacheRead'].every(k=>swNumber(p.context.last[k]))));}
  const swarmCurrent=(project,generation)=>SWARM.alive&&H.on&&!H.snapshotOnly&&H.project===project&&SWARM.project===project&&SWARM.generation===generation&&SWARM.request===(H.projectRequestGeneration||0)&&SWARM.confirmed===(H.confirmedProjectGeneration||0);
  function swarmReset(){if(!swarmRoot())return;SWARM.generation++;if(SWARM.es)SWARM.es.close();SWARM.es=null;SWARM.project=H.project;SWARM.request=H.projectRequestGeneration||0;SWARM.confirmed=H.confirmedProjectGeneration||0;SWARM.data=null;SWARM.error=null;SWARM.loading=false;SWARM.queued=false;SWARM.checking=null;SWARM.refreshQueued=false;SWARM.tools.clear();SWARM.proposals=null;SWARM.proposalError=null;swarmClose();swarmDraw();}
  const swState=p=>p.waiting?['need',p.status==='recovering'?'восстановление':'ждёт вас']:p.pendingApprovals?['need','ждёт вас']:SWARM.data&&SWARM.data.halted?['idle','на паузе']:p.busy?['run','работает']:['idle','свободно'];
  const swName=id=>id==='owner'?'вы':id==='harness'?'харнесс':id==='room'?'Без роли':((SWARM.data&&SWARM.data.panes.find(p=>p.id===id))||{}).label||id;
  const swDate=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  const swMock=reason=>'<div class="spec-block">Макет · '+esc(reason)+'</div>';
  const swEmpty=()=>'<div class="empty">'+(SWARM.error?'Данные не прочитаны.':SWARM.data?'Нет данных · в проекте пока нет мест.':'Читаю состав команды…')+' <button type="button" class="btn sm" data-swarm-team>+ место</button></div>';
  function swarmSummary(){if(!SWARM.data)return SWARM.error?'Данные не прочитаны':'Читаю состав команды…';const ps=SWARM.data.panes;return ps.length+' мест · '+ps.filter(p=>swState(p)[0]==='run').length+' работают · '+ps.filter(p=>swState(p)[0]==='need').length+' ждут вас · '+ps.reduce((n,p)=>n+p.pending,0)+' в очереди';}
  function swarmDraw(){const root=swarmRoot();if(!root)return;const data=SWARM.data,ps=data?data.panes:[],summary=swarmSummary(),empty=swEmpty();
    root.querySelector('.top > b').textContent='Стая'+(SWARM.project?' · '+SWARM.project.split('/').pop():'');root.querySelector('#topst').textContent=summary;
    let notice=root.querySelector('[data-swarm-notice]');if(!notice){notice=document.createElement('div');notice.setAttribute('data-swarm-notice','');notice.setAttribute('role','status');root.querySelector('.views').before(notice)}
    notice.innerHTML=(SWARM.error?esc(SWARM.error)+(data?' · показан предыдущий снимок.':''):data?'Текущий проект · '+esc(data.project)+' · снимок '+esc(swDate(data.generatedAt)):'Проект должен быть подтверждён движком.')+' <button type="button" class="btn sm ghost" data-swarm-refresh'+(SWARM.loading?' disabled':'')+'>Обновить</button>';
    const board=root.querySelector('#board');let canvas=board.querySelector('[data-swarm-canvas]');if(!canvas){canvas=document.createElement('div');canvas.setAttribute('data-swarm-canvas','');board.insertBefore(canvas,board.firstChild)}
    board.querySelectorAll('.seat:not([data-swarm-seat]), svg:not([data-swarm-links])').forEach(node=>node.remove());
    const height=Math.max(700,Math.ceil(ps.length/3)*150+310),points=new Map(ps.map((p,i)=>[p.id,{x:[76,420,780][i%3],y:70+Math.floor(i/3)*150}]));points.set('owner',{x:28,y:height-260});
    const routes=new Map();for(const row of data?data.journal.records:[])for(const to of row.to)if(row.from!==to)routes.set(row.from+'\0'+to,{from:row.from,to,seq:row.seq});const edges=new Map([...routes].filter(([,e])=>points.has(e.from)&&points.has(e.to)));
    canvas.style.height=height+'px';canvas.innerHTML='<svg data-swarm-links viewBox="0 0 1180 '+height+'" preserveAspectRatio="none">'+[...edges.values()].map(e=>{const a=points.get(e.from),b=points.get(e.to),x=a.x+112,y=a.y+40,u=b.x+112,v=b.y+40;return '<path class="on" d="M'+x+' '+y+' C '+((x+u)/2)+' '+y+', '+((x+u)/2)+' '+v+', '+u+' '+v+'"><title>'+esc(swName(e.from)+' → '+swName(e.to)+' · №'+e.seq)+'</title></path>'}).join('')+'</svg>'+(ps.length?ps.map(p=>{const point=points.get(p.id),state=swState(p);return '<button type="button" class="seat '+(state[0]==='need'?'need':'')+'" data-swarm-seat="'+esc(p.id)+'" style="left:'+point.x+'px;top:'+point.y+'px"><div class="h"><span class="o '+state[0]+'"></span><b>'+esc(p.label||p.id)+'</b><span class="role">'+esc(p.role)+'</span></div><div class="md">'+esc(modelName(p.model))+' · '+esc(p.vendor)+'</div><div class="f"><span>'+esc(state[1])+'</span><span class="t">'+p.pending+' в очереди</span></div></button>'}).join(''):empty);
    board.querySelector('.strip').textContent=summary;board.querySelector('.you').style.top=(height-260)+'px';
    const needs=ps.filter(p=>p.waiting||p.pendingApprovals||p.pending),waits=board.querySelector('.waits');
    waits.innerHTML='<div class="t"><span>кто кого ждёт</span><span>'+needs.length+'</span></div>'+needs.map(p=>'<div class="w"><span class="lb">'+(p.waiting||p.pendingApprovals?'вас':'очередь')+'</span><div class="bar"><i class="acc" style="width:100%"></i></div><b>'+esc(p.label||p.id)+'</b></div><div class="hint">'+esc(p.waiting?'Итог хода требует решения':p.pendingApprovals?'Время начала неизвестно':p.queue.map(q=>'№'+q.seq+' · '+swName(q.from)).join(', '))+'</div>').join('')+(data&&!needs.length?'<div class="hint">Нет данных об ожиданиях.</div>':'')+swMock('движок не оценивает цену простоя и влияние на задачи.')+'<div class="hint">Самый дорогой простой сейчас — ваш ответ ревьюеру: за ним слияние H1.5 и рубеж.</div>';
    root.querySelector('#v-cards .sum').textContent=summary;root.querySelector('#v-cards .over').innerHTML=ps.length?ps.map(p=>{const state=swState(p);return '<button type="button" class="win" data-swarm-seat="'+esc(p.id)+'"><div class="h"><span class="o '+state[0]+'"></span><b>'+esc(p.label||p.id)+'</b><span class="role">'+esc(p.role)+'</span></div><div class="msg"><b>'+esc(modelName(p.model))+'</b><br>'+esc(p.turn&&p.turn.message?p.turn.message.slice(0,180):p.queue[0]?p.queue[0].text.slice(0,180):state[1])+'</div><div class="f">'+esc(state[1])+' · '+p.pending+' в очереди</div></button>'}).join(''):empty;
    const journal=data&&data.journal;root.querySelector('#v-chan .chan').innerHTML=routes.size?[...routes.values()].map(e=>'<div class="swarm-route"><div class="nd">'+esc(swName(e.from))+'</div><div class="ln on"><span class="q">№'+e.seq+' →</span></div><div class="nd">'+esc(swName(e.to))+'</div></div>').join(''):'<div class="empty">'+(data?'Нет данных · связей в канале пока нет.':'Данные канала не прочитаны.')+'</div>';
    root.querySelector('#v-chan .msgs').innerHTML='<div class="m head"><span>№</span><span>кто → кому</span><span>о чём</span><span>когда</span></div>'+(journal&&journal.records.length?[...journal.records].reverse().map(row=>'<div class="m" data-swarm-seq="'+row.seq+'"><span class="n">'+row.seq+'</span><span class="who">'+esc(swName(row.from))+' → '+esc(row.to.map(swName).join(', '))+'</span><span class="tx"><details><summary>'+esc(row.text.slice(0,160))+'</summary><p>'+esc(row.text)+'</p><small>'+esc(row.kind)+(row.thread?' · '+esc(row.thread):'')+'</small></details></span><span class="t">'+esc(swDate(row.ts))+'</span></div>').join(''):'<div class="empty">'+(data?'Нет данных · канал пока пуст.':'Данные канала не прочитаны.')+'</div>')+'<div class="swarm-source">'+(journal?'Показано '+journal.records.length+' из '+journal.total+' записей. ':'')+'<a href="21-journal.html">Журнал →</a></div>';
    root.querySelector('#v-seats .sum').textContent=summary;
    root.querySelector('#v-seats .lst').innerHTML='<div class="li head"><span>роль</span><span>модель · аккаунт</span><span>права одной строкой</span><span>состояние</span><span></span></div>'+(ps.length?ps.map(p=>'<button type="button" class="li" data-swarm-seat="'+esc(p.id)+'"><span><b>'+esc(p.label||p.id)+'</b><small>'+esc(p.role)+'</small></span><div>'+esc(modelName(p.model))+'<small>'+esc(p.vendor)+'</small></div><span>'+esc(p.mode)+'<small>'+esc(p.cwd)+'</small></span><span class="m">'+esc(swState(p)[1])+'</span><span class="chev">›</span></button>').join(''):empty);
    const proposals=SWARM.proposals,unconfirmed=proposals&&proposals.filter(q=>!q.confirmed),note=root.querySelector('#v-seats .note');
    note.innerHTML='<div><span class="mono">'+(SWARM.proposalError?esc(SWARM.proposalError):unconfirmed&&unconfirmed.length?'● состав не подписан · '+unconfirmed.length+' предложений':proposals?'Нет данных · неподписанных предложений нет.':'Читаю предложения состава…')+'</span><small class="swarm-source">'+esc(data&&data.team.path||'Нет данных о файле состава')+'</small></div><button type="button" class="btn sm ghost" disabled title="Макет: движок не сохраняет шаблоны состава">Сохранить как шаблон · макет</button><a class="btn sm" href="14-now.html">Принять предложение</a><a class="btn sm p" href="14-now.html">Подписать состав</a>';
    if(SWARM.selected&&!ps.some(p=>p.id===SWARM.selected))swarmClose();if(SWARM.selected)swarmSheet();
  }
  function swarmClose(){SWARM.selected=null;const root=swarmRoot();if(!root)return;root.querySelector('#ovl').classList.remove('on');root.querySelector('#ovl').setAttribute('aria-hidden','true');}
  function swarmShow(view){if(!['board','cards','chan','seats','cmp'].includes(view))return;swarmClose();SWARM.view=view;const root=swarmRoot();root.querySelectorAll('.view').forEach(node=>node.classList.toggle('on',node.id==='v-'+view));root.querySelectorAll('#seg [data-v]').forEach(node=>{node.classList.toggle('on',node.dataset.v===view);node.setAttribute('aria-selected',String(node.dataset.v===view))});}
  function swarmSheet(){const root=swarmRoot(),p=SWARM.data&&SWARM.data.panes.find(p=>p.id===SWARM.selected);if(!root||!p)return;const state=swState(p),c=p.context,ov=root.querySelector('#ovl');
    ov.classList.add('on');ov.setAttribute('aria-hidden','false');ov.setAttribute('role','dialog');ov.setAttribute('aria-label',p.label||p.id);root.querySelector('#panel').classList.add('open');
    const capability=H.turnModes&&H.turnModes[p.vendor]&&H.turnModes[p.vendor][p.mode],modeNote=capability&&capability.ok===true&&typeof capability.note==='string'?capability.note:'';
    root.querySelector('#a-from').textContent='раскрытая карточка · '+(SWARM.view==='seats'?'место':'стая');root.querySelector('#a-h').textContent=p.label||p.id;root.querySelector('#a-sub').textContent=p.role+' · '+modelName(p.model)+' · '+p.mode+(modeNote?' · '+modeNote:'');
    root.querySelector('#a-pill').textContent=state[1];root.querySelector('#a-pill').className='pill '+(state[0]==='need'?'warn':state[0]==='run'?'acc':'');
    root.querySelector('#ovl .head2 .r').innerHTML='<button type="button" class="btn sm" disabled title="Макет: отдельной паузы места в движке нет">⏸ Пауза · макет</button><button type="button" class="btn sm" data-swarm-write title="Открыть чат места, где выбирается модель">Сменить модель</button><button type="button" class="btn sm p" data-swarm-write>Написать</button>';
    root.querySelector('#a-goal').textContent='Цель: '+(p.turn&&p.turn.message?p.turn.message:p.queue[0]?p.queue[0].text:'Нет данных · у места нет текущего хода.')+' · '+p.pending+' в очереди';
    const records=p.turn&&p.turn.records.length?p.turn.records:p.queue.length?p.queue:SWARM.data.journal.records.filter(r=>r.from===p.id||r.to.includes(p.id)).slice(-8);
    root.querySelector('#a-cnt').textContent=records.length+' записей канала';root.querySelector('#a-steps').innerHTML=records.length?records.map(r=>'<div><i>·</i><span>'+esc(swDate(r.ts))+'</span><div><b>№'+r.seq+' · '+esc(r.kind)+'</b><small>'+esc(swName(r.from)+' → '+r.to.map(swName).join(', '))+'</small>'+esc(r.text)+'</div></div>').join(''):'<p>Нет данных · записей хода пока нет.</p>';
    const tools=SWARM.tools.get(p.id)||[],box=root.querySelector('#ovl .tools');box.previousElementSibling.innerHTML='<span>инструменты</span><span>с открытия страницы</span>';box.innerHTML=tools.length?tools.map(t=>'<div class="tool"><span>'+esc(t.name)+'<small>'+esc(t.detail)+'</small></span></div>').join(''):'<div class="tool">Нет данных · вызовы ещё не наблюдались.</div>';
    root.querySelector('#ovl .stat').innerHTML='<div><b>48</b><small>действий сегодня · макет</small><small>Движок не хранит дневной счётчик инструментов.</small></div><div><b>'+esc(c.last?c.last.input+c.last.output+c.last.cacheRead:'нет данных')+'</b><small>токенов · последний ход</small></div><div><b>0,3 %</b><small>недели claude · макет</small><small>Нет расхода квоты по месту.</small></div>';
    root.querySelector('#ovl .load .lbl').innerHTML='<span>контекст'+(c.measured?'':' · оценка')+'</span><b>'+esc(c.pct===null?'Нет данных об окне':c.pct+' %')+' · '+c.used+' / '+esc(c.window===null?'нет данных':c.window)+'</b>';
    root.querySelector('#ovl .load .bar i').style.width=Math.min(100,c.pct||0)+'%';
    let rights=root.querySelector('[data-swarm-rights]');if(!rights){rights=document.createElement('div');rights.setAttribute('data-swarm-rights','');rights.className='goal';root.querySelector('#a-goal').parentElement.insertBefore(rights,root.querySelector('#ovl .two'))}rights.textContent='Папка и модель: '+p.cwd+' · '+modelName(p.model)+' · права: '+p.mode+(p.writePaths.length?' · '+p.writePaths.join(', '):'');
  }
  async function swarmFetch(){if(!swarmRoot()||!swarmCurrent(SWARM.project,SWARM.generation))return;if(SWARM.loading){SWARM.queued=true;return}const project=SWARM.project,generation=SWARM.generation;SWARM.loading=true;
    try{const [snapshot,proposals]=await Promise.allSettled([api('/api/swarm'),api('/api/seats/proposals')]);if(!swarmCurrent(project,generation))return;
      if(snapshot.status!=='fulfilled'||!swarmValid(snapshot.value,project))throw Error('Не удалось прочитать состав команды: некорректный снимок или нет связи.');
      SWARM.data=snapshot.value;SWARM.error=null;const r=proposals.status==='fulfilled'&&proposals.value;
      if(r&&r.ok===true&&r.project===project&&Array.isArray(r.proposals)&&r.proposals.every(proposalValid)){SWARM.proposals=r.proposals;SWARM.proposalError=null}else{SWARM.proposals=null;SWARM.proposalError='Не удалось прочитать предложения состава.'}
    }catch(e){if(swarmCurrent(project,generation))SWARM.error=e.message||'Не удалось прочитать состав команды.'}
    finally{if(swarmCurrent(project,generation)){SWARM.loading=false;swarmDraw();if(SWARM.queued){SWARM.queued=false;void swarmFetch()}}}
  }
  async function swarmRefresh(){if(!swarmRoot()||!SWARM.alive)return;if(SWARM.checking){SWARM.refreshQueued=true;return SWARM.checking}const generation=SWARM.generation;
    const job=(async()=>{const confirmed=await refreshStatus(true);if(!SWARM.alive||generation!==SWARM.generation)return;if(!confirmed){SWARM.error='Проект не подтверждён движком.';swarmDraw();return}return swarmSync(true)})();SWARM.checking=job;
    try{return await job}finally{if(SWARM.checking===job){SWARM.checking=null;const queued=SWARM.refreshQueued;SWARM.refreshQueued=false;if(queued&&swarmCurrent(SWARM.project,generation))await swarmRefresh()}}
  }
  function swarmSync(refresh=false){if(!swarmRoot()||!SWARM.alive||!H.on||H.snapshotOnly)return;if(SWARM.project!==H.project||SWARM.request!==(H.projectRequestGeneration||0)||SWARM.confirmed!==(H.confirmedProjectGeneration||0))swarmReset();
    if(!SWARM.es&&typeof EventSource==='function'){const project=SWARM.project,generation=SWARM.generation,es=SWARM.es=subscribeLiveEvents();es.onmessage=e=>{if(!swarmCurrent(project,generation))return;let event;try{event=JSON.parse(e.data)}catch{return}
      if(event.type==='tool'&&SWARM.data&&SWARM.data.panes.some(p=>p.id===event.pane)&&typeof event.name==='string'&&typeof event.detail==='string'){SWARM.tools.set(event.pane,[...(SWARM.tools.get(event.pane)||[]),{name:event.name,detail:event.detail}].slice(-12));if(SWARM.selected===event.pane)swarmSheet();return}
      if(['state','queued','delivered','sent','owner','done','error','note','approval','approvalResolved','teamProposals'].includes(event.type))void swarmRefresh();};
      es.onopen=()=>{if(swarmCurrent(project,generation))void swarmRefresh()};es.onerror=()=>{if(swarmCurrent(project,generation)){SWARM.error='Связь с каналом потеряна. Нажмите «Обновить».';swarmDraw()}};
    }
    if(refresh||!SWARM.data)return swarmFetch();
  }
  if(PAGE==='swarm'){
    const root=swarmRoot(),comparison=root.querySelector('#v-cmp .wrap');const comparisonNote=document.createElement('div');comparisonNote.innerHTML=swMock('движок не связывает принятые задачи, круги ревью и A/B-испытания с исполнителем.');comparison.insertBefore(comparisonNote,comparison.firstChild);comparison.setAttribute('data-swarm-mock','');
    root.querySelector('#seg').setAttribute('role','tablist');root.querySelectorAll('#seg [data-v]').forEach(node=>{node.setAttribute('role','tab');node.setAttribute('tabindex','0')});root.querySelector('#x').setAttribute('role','button');root.querySelector('#x').setAttribute('tabindex','0');root.querySelector('#x').setAttribute('aria-label','Закрыть');
    swarmDraw();addEventListener('live:status',()=>swarmSync());addEventListener('pagehide',()=>{SWARM.alive=false;swarmReset()});addEventListener('pageshow',e=>{if(e.persisted){SWARM.alive=true;swarmReset()}});addEventListener('focus',()=>swarmRefresh());
    root.addEventListener('click',e=>{const target=e.target.closest('#seg [data-v], [data-swarm-seat], [data-swarm-write], [data-swarm-team], [data-swarm-refresh], #addseat, #x');
      if(target){e.preventDefault();e.stopImmediatePropagation();if(target.disabled)return;if(target.dataset.v)return swarmShow(target.dataset.v);if(target.id==='x')return swarmClose();if(target.hasAttribute('data-swarm-refresh'))return swarmRefresh();if(!swarmCurrent(SWARM.project,SWARM.generation))return;
        if(target.hasAttribute('data-swarm-seat')){SWARM.selected=target.dataset.swarmSeat;swarmSheet();root.querySelector('#x').focus();return}
        if(target.hasAttribute('data-swarm-write')&&SWARM.selected)return openChatRow((H.active||{})[SWARM.selected]||'',SWARM.selected);
        if(target.id==='addseat'||target.hasAttribute('data-swarm-team')){const p=(H.panes||[]).find(p=>p.kind==='orchestrator')||(H.panes||[]).find(p=>p.id==='room');if(p){toast('Состав команды предлагает оркестратор в разговоре.');return openChatRow((H.active||{})[p.id]||'',p.id)}toast('Начните разговор и назначьте оркестратора.');location.href='10-new-chat.html';return}
      }
      if(e.target===root.querySelector('#ovl'))swarmClose();
      const mock=e.target.closest('#v-cmp .btn, #v-cmp [data-ex]');if(mock){e.preventDefault();e.stopImmediatePropagation();if(window.HX)HX.open(mock,swMock('сравнение и запуск A/B пока не поддерживаются движком.')+'<div class="ch"><h3>A/B на одной задаче</h3></div><div class="two eq"><div class="blk"><div class="t">последний A/B · R5</div><p>Fable · 1 круг · 2,0 % · принят №2479</p><p>Opus · 2 круга · 1,3 % · возврат №2471</p></div><div class="blk"><div class="t">что ещё измеряем</div><p>Сколько путей закрыл из описи; сколько тестов соседей обновил; сколько раз упёрся в лимит.</p></div></div><button type="button" class="btn p" disabled>Запустить A/B для S1.4 · макет</button>',{h:420,hide:false})}
    },true);
    addEventListener('keydown',e=>{if(e.target&&e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){e.preventDefault();swarmClose()}const tab=e.target&&e.target.closest&&e.target.closest('#seg [data-v]');if(tab&&['Enter',' '].includes(e.key)){e.preventDefault();swarmShow(tab.dataset.v)}if(e.target&&e.target.id==='x'&&['Enter',' '].includes(e.key)){e.preventDefault();swarmClose()}if(/^[1-5]$/.test(e.key)){e.preventDefault();swarmShow(['board','cards','chan','seats','cmp'][Number(e.key)-1])}},true);
  }
  // End TS-15b swarm.

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
    function apply(){if(H.on)return; build(); const act=MEM.order.filter(k=>!S.mem.rev[k]), dis=MEM.order.filter(disputed), cnt=s=>s==='все'?act.length:act.filter(k=>R[k][1]===s).length;
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
    const addB=document.getElementById('add'); if(addB) addB.addEventListener('click',()=>{ curR=null; setTimeout(()=>{if(H.on)return; const ta=document.querySelector('.panel [data-step="1"] textarea'); if(ta){ ta.readOnly=false; ta.focus(); ta.select(); } },80); });
    document.addEventListener('click',e=>{if(H.on)return; const el=e.target.closest('.li[data-r]'); if(!el) return; curR=el.dataset.r; const inner=document.querySelector('.ovl.on .panel .inner'), acts=inner&&inner.querySelector('.acts'); if(acts&&S.mem.rev[curR]) acts.innerHTML='<span class="btn sm p" data-mback>Вернуть правило</span><span class="btn sm ghost" data-close>Закрыть</span>'; });
    document.addEventListener('click',e=>{if(H.on)return; const b=e.target.closest('.panel .acts .btn, .panel [data-step="3"] .btn.p'); if(!b) return; const lab=b.textContent.trim(), k=curR;
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
    function apply(){if(H.on)return; const n=s=>rows.filter(l=>stOf(l.dataset.a)===s).length;
      rows.forEach(li=>{ const k=li.dataset.a, s=stOf(k), c=cellOf(li); if(c){ c.textContent=S.art.st[k]?LAB[s]:li.dataset.lab0; c.classList.toggle('hot',s==='check'); } li.classList.toggle('dim',s==='merged'||s==='back'); li.style.display=(s==='gone'||(filter!=='all'&&s!==filter))?'none':''; });
      const nb=document.querySelectorAll('#v-list .nums b'); if(nb[0]) nb[0].textContent=n('check'); if(nb[1]) nb[1].textContent=n('self'); if(nb[2]) nb[2].textContent=111+n('merged')-M0;
      const st=document.querySelector('.top .st'), c=n('check'); if(st) st.innerHTML=c?'<i style="background:var(--accent)"></i>'+c+' '+(c===1?'готов':'готовы')+' к проверке':'<i></i>всё проверено';
      const total=rows.filter(l=>stOf(l.dataset.a)!=='gone').length; document.querySelectorAll('#v-list .filters .chip').forEach((ch,i)=>{ if(!FL[i]) return; ch.dataset.fl=FL[i]; ch.style.cursor='pointer'; ch.classList.toggle('on',FL[i]===filter); ch.textContent=['все · '+total,'к проверке · '+n('check'),'проверил сам · '+n('self'),'влито · '+n('merged')][i]; }); }
    hooks.push(apply);
    document.addEventListener('click',e=>{if(H.on)return; const li=e.target.closest('#v-list .li[data-a]'); if(li) curArt=li.dataset.a; const fc=e.target.closest('#v-list .filters [data-fl]'); if(fc){ filter=fc.dataset.fl; apply(); return; }
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
    function apply(){if(H.on)return; const depth=S.res.deep?20:12;
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
    document.addEventListener('click',e=>{if(H.on)return; const li=e.target.closest('#v-cur .li[data-q]'); if(li){ curQ=li.dataset.q; const h=document.querySelector('.ovl.on .panel .ch h3'); if(h&&S.res.title[curQ]) h.textContent=S.res.title[curQ]; }
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

  // ══ ДОКУМЕНТЫ ПРОЕКТА: доделать разделы, подписать переход ══
  if(PAGE==='doc'){
    S.doc=S.doc||{fill:{},text:{},signed:0};
    const FILLT={risk:'Действие и владелец добавлены: при лимите Codex проход переходит на Sonnet (владелец — оркестратор); при недоступном ревьюере ревью идёт на Opus (владелец — вы).',budget:'Смета на остаток стадии: +1,4 % недели Claude по среднему 0,13 % на влитую задачу; порог остановки — 95 % недели.'}, NAME={risk:'Раздел 5 · Риски',budget:'Раздел 6 · Бюджет',sign:'Раздел 7 · Переход'};
    const wait=k=>document.querySelector('.paper .wait[data-w="'+k+'"]'), toc=k=>document.querySelector('.toc .it[data-w="'+k+'"]'); let curW=null;
    ['risk','budget','sign'].forEach(k=>{ const w=wait(k), t=toc(k); if(w){ w.dataset.t0=w.textContent; const p=w.closest('h4').nextElementSibling; if(p) p.dataset.h0=p.innerHTML; } if(t) t.dataset.h0=t.innerHTML; });
    const filled=k=>k==='sign'?!!S.doc.signed:!!S.doc.fill[k];
    function apply(){if(H.on)return; const n=['risk','budget','sign'].filter(filled).length, open=3-n, ver=6+Object.keys(S.doc.fill).length+(S.doc.signed?1:0);
      ['risk','budget','sign'].forEach(k=>{ const w=wait(k), t=toc(k), f=filled(k), p=w&&w.closest('h4').nextElementSibling;
        if(t){ t.classList.toggle('w',!f); t.classList.toggle('d',f); t.innerHTML=f?'<i>✓</i>'+t.dataset.h0.replace(/<i><\/i>/,'').replace(/<span class="n">.*?<\/span>/,''):t.dataset.h0; }
        if(w){ w.textContent=f?(k==='sign'?'подписано вами · '+hhmm(S.doc.signed):S.doc.fill[k]==='self'?'заполнено вами':'заполнено оркестратором · черновик'):w.dataset.t0; w.style.color=f?'var(--ok)':''; w.style.background=f?'var(--ok-soft)':''; w.style.cursor=f?'default':''; }
        if(p&&k!=='sign') p.innerHTML=p.dataset.h0+(f?' <b>'+esc(S.doc.text[k]||FILLT[k])+'</b>':''); });
      const pg=document.querySelector('.toc .pg'); if(pg){ const b=pg.querySelector('b'); if(b) b.textContent=(4+n)+' из 7'; const tk=pg.querySelector('.ticks'); if(tk) tk.innerHTML=Array.from({length:7},(_,i)=>'<i class="'+(i<4+n?'ok':i<6?'on':'')+'"></i>').join(''); }
      const st=document.querySelector('.top .st'); if(st) st.innerHTML=S.doc.signed?'<i></i>версия '+ver+' · подписана · стадия закрыта':'<i style="background:var(--accent)"></i>версия '+ver+' · '+(open?'ждёт в '+open+' '+(open===1?'месте':'местах'):'всё заполнено');
      const nx=document.getElementById('next'), fx=document.getElementById('fix'); if(nx){ nx.textContent=S.doc.signed?'Рубеж открыт ✓':'Перейти к рубежу'; nx.classList.toggle('p',!S.doc.signed); nx.style.cursor='pointer'; } if(fx){ fx.style.display=(filled('risk')&&filled('budget'))?'none':''; fx.style.cursor='pointer'; } const vb=document.getElementById('vers'); if(vb){ vb.textContent='Версии · '+(ver+1); vb.style.cursor='pointer'; } }
    hooks.push(apply);
    const fill=(keys,how,text)=>{ const prev=JSON.parse(JSON.stringify(S.doc)); keys.forEach(k=>{ S.doc.fill[k]=how; if(text) S.doc.text[k]=text; }); save(); log('документ',keys.map(k=>NAME[k]).join(', ')+' — '+(how==='self'?'заполнено вами':'поручено оркестратору, заполнено черновиком')); HX.close(); apply(); toast(keys.length>1?'Разделы 5 и 6 заполнены':NAME[keys[0]]+': заполнено',()=>{ S.doc=prev; save(); log('документ','Отменено заполнение'); apply(); }); };
    document.addEventListener('click',e=>{if(H.on)return; const w=e.target.closest('[data-w]'); if(w) curW=w.dataset.w;
      const nx=e.target.closest('#next'); if(nx&&S.doc.signed){ e.stopPropagation(); e.preventDefault(); toast('Стадия уже закрыта: переход подписан в '+hhmm(S.doc.signed)); return; }
      if(w&&filled(w.dataset.w)&&!e.target.closest('.panel')){ e.stopPropagation(); e.preventDefault(); toast(NAME[w.dataset.w]+' — уже заполнен'); return; }
      const b=e.target.closest('.panel .acts .btn, .panel [data-step="2"] .btn.p, .panel [data-step="1"] .btn'); if(!b) return; const lab=b.textContent.trim();
      if(b.hasAttribute('data-dsave')){ const ta=document.getElementById('d-edit'), v=(ta&&ta.value||'').trim(); if(!v) return; fill([curW],'self',v); return; }
      if(/^Подписать и перейти/.test(lab)){ const prev=S.doc.signed; S.doc.signed=now(); save(); log('документ','Переход к рубежу подписан — стадия «Карта блоков L1» закрыта'); apply(); toast('Переход подписан: рубеж открыт',()=>{ S.doc.signed=prev||0; save(); log('документ','Отменена подпись перехода'); apply(); }); return; }
      if(/^Доделать 5 и 6/.test(lab)){ fill(['risk','budget'].filter(k=>!filled(k)),'orch'); return; }
      if(/^Доделать — поручить/.test(lab)&&curW){ fill([curW],'orch'); return; }
      if(/^Заполнить самому/.test(lab)&&curW){ const blkEl=document.querySelector('.panel .blk'); if(blkEl&&!document.getElementById('d-edit')){ blkEl.insertAdjacentHTML('afterend','<textarea class="live-f" id="d-edit" style="height:84px;padding:10px 12px;resize:none;margin-top:12px" placeholder="Что делаем и кто отвечает"></textarea>'); b.textContent='Сохранить раздел'; b.setAttribute('data-dsave',''); document.getElementById('d-edit').focus(); } return; }
      if(/^Перейти к подписи/.test(lab)){ setTimeout(()=>{if(H.on)return; const n=document.getElementById('next'); if(n) n.click(); },380); return; }
      if(/^Открыть раздел 5/.test(lab)){ HX.close(); const w5=wait('risk'); if(w5) w5.scrollIntoView({block:'center',behavior:'smooth'}); return; }
      if(/^Доделать$/.test(lab)&&b.closest('[data-step="1"]')){ setTimeout(()=>{if(H.on)return; const f=document.getElementById('fix'); if(f&&f.style.display!=='none') f.click(); },380); return; }
      if(/^Спросить оркестратора/.test(lab)){ S.draft='@оркестратор · по документу стадии L1, раздел 7: '; save(); location.href='01-chat.html'; } },true);
    const nxb=document.getElementById('next'); if(nxb) nxb.addEventListener('click',()=>setTimeout(()=>{if(H.on)return; const s1=document.querySelector('.panel [data-step="1"]'); if(!s1) return; const both=filled('risk')&&filled('budget'), h=s1.querySelector('h4'), p=s1.querySelector('p'), kvb=s1.querySelectorAll('.kv b');
      if(both){ if(h) h.textContent='Документ доделан'; if(p) p.textContent='Все разделы заполнены — можно подписывать переход.'; if(kvb[0]) kvb[0].textContent='заполнен'; if(kvb[1]) kvb[1].textContent='заполнен'; if(kvb[2]) kvb[2].textContent='рубеж начнётся со сметой и с действиями по рискам'; }
      else { if(kvb[0]&&filled('risk')) kvb[0].textContent='заполнен'; if(kvb[1]&&filled('budget')) kvb[1].textContent='заполнен'; } },60));
  }

  // TS-14b: spend blocks stay in their sketch positions; only their data and actions change.
  const spendPeriod=()=>{try{const p=new URLSearchParams(location.search||'').get('period');return ['7','30','90','all'].includes(p)?p:'all'}catch(e){return 'all'}};
  const SP={period:spendPeriod(),group:'byPane',project:null,generation:0,data:null,loading:false,error:null,alive:true,history:[],next:null,historyError:null,historyLoading:false,historyGeneration:0,vendor:'',model:'',card:null,mutation:false};
  const LIM={generation:0,project:null,providers:[],catalogConnected:new Set(),limits:[],activity:[],error:null,loading:false,updatedAt:null,revision:null};
  const spendGroups={byPane:'по местам',byChat:'по чатам',byModel:'по моделям',byVendor:'по провайдерам',byModelVendor:'модель и провайдер',byDay:'по дням UTC'};
  const spButton=(text,attr,disabled=false)=>'<button type="button" class="btn sm ghost" '+attr+(disabled?' disabled':'')+'>'+esc(text)+'</button>';
  const spMock=(title,reason,actions=[])=>'<div class="sp-mock"><b>'+esc(title)+'</b><span class="pill">макет</span><p>'+esc(reason)+'</p>'+actions.map(t=>spButton(t,'data-spend-unavailable title="'+esc(reason)+'"',true)).join(' ')+'</div>';
  const spMoney=row=>!row?'—':Array.isArray(row.costByCurrency)&&row.costByCurrency.length?row.costByCurrency.map(c=>Number(c.cost).toLocaleString('ru-RU',{maximumFractionDigits:6})+' '+esc(c.currency)).join(' · '):row.cost!=null?Number(row.cost).toLocaleString('ru-RU',{maximumFractionDigits:6})+' '+esc(row.currency):'без цены';
  const spMetric=n=>typeof n==='number'&&Number.isFinite(n)?fmtN(n):'—';
  const spDate=ts=>typeof ts==='number'&&Number.isFinite(ts)?new Date(ts*1000).toLocaleString('ru-RU'):'дата не сохранена';
  const spName=row=>row.label||row.title||row.day||[row.vendor||'провайдер не сохранён',row.model||'модель не сохранена'].join(' · ');
  const spTable=(heads,rows)=>'<div class="sp-table"><table class="tbl"><thead><tr>'+heads.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  function spGroups(data,group){const rows=data&&data[group]||[];return rows.length?spTable([spendGroups[group],'ходы','вход / выход / кэш','время, мс','исходы: ok / стоп / сбой / ?','стоимость'],rows.map(r=>[esc(spName(r)),spMetric(r.turns),[r.input,r.output,r.cacheRead].map(spMetric).join(' / '),spMetric(r.durationMs),r.outcomes?[r.outcomes.ok,r.outcomes.interrupted,r.outcomes.error,r.outcomes.unknown].join(' / '):'—',spMoney(r)])):'<p class="d">За этот период учтённых ходов нет</p>'}
  function limitCountdown(seconds){const m=Math.max(0,Math.ceil(seconds/60));return 'через '+(m>=1440?Math.floor(m/1440)+' д '+Math.floor(m%1440/60)+' ч':m>=60?Math.floor(m/60)+' ч '+m%60+' мин':m+' мин')}
  const limitSamples=p=>p.id==='claude'?[{label:'неделя · Fable',percentUsed:32,windowMinutes:10080,sampleReset:'вт 03:00'},{label:'неделя',percentUsed:62.4,windowMinutes:10080,sampleReset:'вт 03:00'},{label:'5 ч',percentUsed:18,windowMinutes:300,sampleReset:'21:40'}]:p.id==='codex'?[{label:'5 ч',percentUsed:94,windowMinutes:300,sampleReset:'через 1 ч 12 мин'},{label:'неделя',percentUsed:71,windowMinutes:10080,sampleReset:'пн 00:00'}]:[];
  const limitApi=p=>typeof p.kind==='string'&&/ключ.*API/i.test(p.kind);
  const limitSubscription=p=>/^(?:подписка|subscription)/.test(p.kind||'');
  const limitFailed=found=>!!found&&found.sourceConnected!==false&&(found.ok===false||found.status==='unavailable');
  const limitName=p=>({claude:'Claude',codex:'Codex',copilot:'Copilot'}[p.id]||p.name||p.id);
  function limitProviders(){const providers=LIM.providers.length?[...LIM.providers]:!H.on?[{id:'claude',name:'Claude Max'},{id:'codex',name:'Codex'}]:[];
    // CLI limits have their own source and may not be listed by /api/connections.
    for(const row of LIM.limits)if(row&&typeof row.vendor==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(row.vendor)&&(row.kind==='subscription'||row.vendor==='copilot')&&!providers.some(p=>p.id===row.vendor))providers.push({id:row.vendor,name:typeof row.label==='string'?row.label:row.vendor,kind:'подписка'});
    return providers.filter(p=>{if(p.id==='router')return false;if(p.id==='claude'||p.id==='codex')return true;const info=spWindow(p);if(limitSubscription(p)&&info.found&&(info.found.sourceConnected===true||typeof info.found.ok==='boolean'))return true;return limitApi(p)&&info.found&&info.found.sourceConnected===true&&!info.mock&&info.windows.length>0&&typeof info.found.fetchedAt==='number'&&Number.isFinite(info.found.fetchedAt)&&info.found.fetchedAt>0});
  }
  function spWindow(p){const found=LIM.limits.find(l=>l.vendor===p.id),live=(found&&Array.isArray(found.windows)?found.windows:[]).filter(w=>w&&typeof w.label==='string'&&typeof w.percentUsed==='number'&&Number.isFinite(w.percentUsed)&&w.percentUsed>=0&&w.percentUsed<=100);
    const unlimited=!!(found&&found.unlimited===true&&!live.length&&typeof found.fetchedAt==='number'&&Number.isFinite(found.fetchedAt)&&found.fetchedAt>0),failed=limitFailed(found),unavailable=!unlimited&&!live.length&&!!(found&&(found.sourceConnected||failed)),mock=!unlimited&&!live.length&&!unavailable,windows=mock?limitSamples(p):live,primary=p.id==='claude'?windows.find(w=>(w.windowMinutes===10080||/week|недел/i.test(w.label))&&!/·/.test(w.label)):p.id==='codex'?windows.find(w=>w.windowMinutes===300||/5.?h|5.?час|5 ч|five/i.test(w.label)):p.id==='copilot'?windows.find(limitMonth):null;
    const updatedAt=found?(typeof found.fetchedAt==='number'?found.fetchedAt:null):LIM.updatedAt;
    const stale=!H.on||!!LIM.error||failed||!!(found&&found.stale)||!updatedAt||Date.now()/1000-updatedAt>900;return {found,windows,primary:primary||windows[0],stale,mock,unavailable,unlimited,failed,updatedAt,reason:found&&found.reason||LIM.error||'Лимиты провайдер не отдаёт'};}
  const limitAge=info=>info.updatedAt?'обновлено '+Math.max(0,Math.floor((Date.now()/1000-info.updatedAt)/60))+' мин назад':'';
  function spLimitCreditHTML(found){if(!found)return '';const parts=[],credits=found.credits;
    if(credits&&credits.unlimited===true)parts.push('кредиты: без ограничений');else if(credits&&typeof credits.balance==='number'&&Number.isFinite(credits.balance)&&credits.balance>=0)parts.push('кредиты: '+credits.balance.toLocaleString('ru-RU'));
    if(Number.isSafeInteger(found.resetCredits)&&found.resetCredits>=0)parts.push('сбросов лимита в запасе: '+found.resetCredits.toLocaleString('ru-RU'));
    return parts.length?'<p class="sp-limit-credits">'+esc(parts.join(' · '))+'</p>':'';
  }
  function spLimitRetryHTML(found,showReason=true){if(!limitFailed(found))return '';const parts=[];if(showReason&&found.reason)parts.push(found.reason);if(typeof found.nextAttemptAt==='number'&&Number.isFinite(found.nextAttemptAt))parts.push('следующая попытка '+spDate(found.nextAttemptAt));return parts.length?'<small class="sp-limit-retry">'+esc(parts.join(' · '))+'</small>':'';}
  const limitWeek=w=>w.windowMinutes===10080||/^(неделя|weekly|week)(?:$|[ ·])/i.test(w.label);
  const limitFive=w=>w.windowMinutes===300||/^(5.?h|5.?час|5 ч|five)/i.test(w.label);
  const limitMonth=w=>/^(?:month|monthly|месяц)(?:$| · )/i.test(w.label);
  function limitDetailWindows(p,windows){return windows.map((w,i)=>{const week=limitWeek(w),five=limitFive(w),model=week&&/^(?:неделя|weekly|week)\s*·\s*(.+)$/i.exec(w.label);return {w,i,label:week?(model?model[1]+' · неделя':p.id==='claude'?'остальные · неделя':'неделя'):five?'5 ч':limitMonth(w)&&!w.label.includes(' · ')?'месяц':w.label,order:week?(model?(/^fable$/i.test(model[1])?0:1):2):five?3:4}}).sort((a,b)=>a.order-b.order||a.i-b.i)}
  function spLimitHTML(p,all=false){const info=spWindow(p),wins=all?limitDetailWindows(p,info.windows):(info.primary?[{w:info.primary,label:limitMonth(info.primary)&&!info.primary.label.includes(' · ')?'месяц':info.primary.label}]:[]),name=limitName(p);
    return '<div class="sp-limit'+(info.stale&&!info.mock?' stale':'')+'"><div class="sp-limit-title"><b>'+esc(name+(limitApi(p)?' · ключ API':info.found&&info.found.plan?' '+info.found.plan:''))+'</b>'+(info.mock?'<span class="pill" title="'+esc(info.reason)+'">макет</span>':'')+'</div>'+(info.unlimited?'<p class="sp-limit-reason">безлимит</p>':info.unavailable?'<p class="sp-limit-reason">нет данных · '+esc(info.reason)+'</p><small>'+esc(p.kind||'подключённая подписка')+'</small>':'')+wins.map(({w,label})=>{
      const percent=w.percentUsed.toLocaleString('ru-RU',{maximumFractionDigits:1}),reset=info.mock?w.sampleReset:typeof w.resetsAt==='number'?limitCountdown(w.resetsAt-Date.now()/1000):typeof w.resetsIn==='number'?limitCountdown(w.resetsIn):'время уточняется',tone=w.percentUsed>=95?'bad':w.percentUsed>=80?'warn':'';
      return '<section class="sp-limit-window"><div class="row sp-value"><b'+(tone?' class="'+tone+'"':'')+'>'+percent+' %</b><span>'+esc(label)+'</span></div><div class="ticks'+(tone?' '+tone:'')+'" role="meter" aria-label="'+esc((info.mock?'макет · ':'')+name+' · '+label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+w.percentUsed+'">'+Array.from({length:40},(_,i)=>'<i'+(i<Math.round(w.percentUsed/100*40)?' class="on"':'')+'></i>').join('')+'</div><small>остаток '+Math.max(0,100-w.percentUsed).toLocaleString('ru-RU',{maximumFractionDigits:1})+' % · сброс '+esc(reset)+(all&&!info.mock&&typeof w.resetsAt==='number'?' · '+esc(spDate(w.resetsAt)):'')+'</small></section>';
    }).join('')+(p.id==='codex'?spLimitCreditHTML(info.found):'')+(all&&p.id==='claude'?'<p class="sp-limit-extra">доплата: '+(info.mock?'выкл · макет':info.found&&typeof info.found.extraUsageEnabled==='boolean'?(info.found.extraUsageEnabled?'вкл':'выкл'):'нет данных')+'</p>':'')+spLimitRetryHTML(info.found,!info.unavailable)+(!info.mock?'<small>'+(info.stale?'устаревшие данные · '+esc(limitAge(info))+' · ':'')+(info.updatedAt?'данные за '+esc(spDate(info.updatedAt)):'время данных не сохранено')+' · '+esc(info.found&&info.found.source||'источник уточняется')+'</small>':'')+'</div>';
  }
  const limitActivity=id=>{const row=LIM.activity.find(item=>item.vendor===id);return Number.isSafeInteger(row?.turns)&&row.turns>0?row.turns:0};
  function widgetProviders(extra=1){
    const basics=['claude','codex'].flatMap(id=>{const p=LIM.providers.find(item=>item.id===id);return p?[p]:[]});
    const others=LIM.activity.filter(row=>typeof row.vendor==='string'&&/^[a-z][a-z0-9_:-]{0,63}$/.test(row.vendor)&&!['claude','codex','router'].includes(row.vendor)&&Number.isSafeInteger(row.turns)&&row.turns>0&&LIM.catalogConnected.has(row.vendor))
      .sort((a,b)=>b.turns-a.turns||a.vendor.localeCompare(b.vendor)).slice(0,extra)
      .map(row=>LIM.providers.find(p=>p.id===row.vendor)||{id:row.vendor,name:LIM.limits.find(p=>p.vendor===row.vendor)?.label||row.vendor[0].toUpperCase()+row.vendor.slice(1)});
    return basics.concat(others);
  }
  const widgetWeek=w=>limitWeek(w)||/(?:^|·)\s*(?:неделя|week)(?:$|\s)/i.test(w.label);
  const claudeCommonWeek=w=>widgetWeek(w)&&(!/·/.test(w.label)||/остальные/i.test(w.label));
  const widgetTone=remaining=>remaining<10?'bad':remaining<25?'warn':'';
  const limitRemaining=w=>Math.max(0,Math.min(100,Math.round((100-w.percentUsed)*10)/10));
  const widgetTicks=(remaining,tone,count)=>'<div class="ticks'+(tone?' '+tone:'')+'" role="meter" aria-label="Осталось '+remaining.toLocaleString('ru-RU',{maximumFractionDigits:1})+' %" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+remaining+'">'+Array.from({length:count},(_,i)=>'<i'+(i<Math.round(remaining/100*count)?' class="on"':'')+'></i>').join('')+'</div>';
  function widgetWindow(p){
    const info=spWindow(p),wins=info.mock||info.failed||info.unavailable||info.unlimited||info.found?.sourceConnected===false?[]:info.windows;
    const week=wins.find(p.id==='claude'?claudeCommonWeek:widgetWeek);
    const w=week||wins.find(limitMonth)||wins.find(limitFive);
    return {w,period:w?(widgetWeek(w)?'W':limitMonth(w)?'M':'5h'):'—',info};
  }
  function sidebarLimitHTML(p){const {w,period}=widgetWindow(p),remaining=w?limitRemaining(w):100,tone=w?widgetTone(remaining):'',name=limitName(p);
    return '<div class="limit-provider'+(w?'':' dim')+'" data-limit-vendor="'+esc(p.id)+'"><div class="row"><span class="limit-label">'+esc(name)+'</span><span><b'+(tone?' class="'+tone+'"':'')+'>'+remaining.toLocaleString('ru-RU',{maximumFractionDigits:1})+' %</b><span class="limit-period">'+period+'</span></span></div>'+(w?widgetTicks(remaining,tone,24):'<div class="ticks empty" aria-hidden="true">'+Array.from({length:24},()=>'<i></i>').join('')+'</div>')+'</div>';
  }
  function popupWindows(p,info){const wins=info.mock||info.found?.sourceConnected===false?[]:info.windows;
    if(p.id==='claude')return [[wins.find(w=>widgetWeek(w)&&/fable/i.test(w.label)),'Fable · неделя'],[wins.find(claudeCommonWeek),'остальные · неделя'],[wins.find(limitFive),'5 ч']].filter(([w])=>w).map(([w,label])=>({w,label}));
    if(p.id==='codex'){const week=wins.find(widgetWeek);const w=week||wins.find(limitFive);return w?[{w,label:week?'неделя':'5 ч'}]:[]}
    return limitDetailWindows(p,wins);
  }
  function popupRenewal(found){const raw=found?.renewalAt,at=typeof raw==='number'?raw:typeof raw==='string'?Date.parse(raw)/1000:NaN;if(!Number.isFinite(at)||at<=Date.now()/1000)return '';
    const days=Math.ceil((at-Date.now()/1000)/86400);return '<p class="sp-limit-renewal">продление через '+days+' д · '+esc(spDate(at))+'</p>';
  }
  function popupLimitHTML(p){const info=spWindow(p),windows=popupWindows(p,info),name=limitName(p),turns=limitActivity(p.id),extra=p.id!=='claude'&&p.id!=='codex';
    const rows=windows.map(({w,label})=>{const remaining=limitRemaining(w),tone=widgetTone(remaining),reset=typeof w.resetsAt==='number'?limitCountdown(w.resetsAt-Date.now()/1000):typeof w.resetsIn==='number'?limitCountdown(w.resetsIn):'время уточняется';
      return '<section class="sp-limit-window"><div class="row sp-value"><b'+(tone?' class="'+tone+'"':'')+'>'+remaining.toLocaleString('ru-RU',{maximumFractionDigits:1})+' %</b><span>остаток · '+esc(label)+'</span></div>'+widgetTicks(remaining,tone,40)+'<small>сброс '+esc(reset)+(typeof w.resetsAt==='number'?' · '+esc(spDate(w.resetsAt)):'')+'</small></section>'}).join('');
    const missing=!windows.length?'<div class="sp-limit-missing"><b>100 %</b><p>'+(info.failed||info.unavailable||info.found?.sourceConnected===false||!extra?'нет данных · '+esc(info.reason):'лимит программой не отдаётся · считаем 100 %')+'</p></div>':'';
    const turnWord=turns%10===1&&turns%100!==11?'ход':turns%10>=2&&turns%10<=4&&(turns%100<12||turns%100>14)?'хода':'ходов';
    return '<div class="sp-limit'+(info.stale?' stale':'')+'"><div class="sp-limit-title"><b>'+esc(name+(info.found?.plan?' '+info.found.plan:''))+'</b>'+(extra?'<small>'+turns+' '+turnWord+' за 7 дней</small>':'')+'</div>'+rows+missing+(p.id==='codex'?spLimitCreditHTML(info.found):'')+(p.id==='claude'&&typeof info.found?.extraUsageEnabled==='boolean'?'<p class="sp-limit-extra">доплата: '+(info.found.extraUsageEnabled?'вкл':'выкл')+'</p>':'')+((p.id==='claude'||p.id==='codex')?popupRenewal(info.found):'')+spLimitRetryHTML(info.found,!info.unavailable)+(info.found&&info.updatedAt?'<small>'+(info.stale?'устаревшие данные · ':'')+esc(limitAge(info))+' · данные за '+esc(spDate(info.updatedAt))+' · '+esc(info.found.source||'источник не указан')+'</small>':'')+'</div>';
  }
  function limitsDraw(){if(PAGE==='spend'&&!limitProviders().some(limitApi))document.querySelectorAll('[data-c="qwen"]').forEach(card=>{card.hidden=true;card.innerHTML='' });document.querySelectorAll('aside.side.ps .limits').forEach(el=>{
    el.removeAttribute('data-go');el.title='Все лимиты';el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','Все лимиты');el.setAttribute('aria-haspopup','dialog');
    el.innerHTML='<div class="cap">Осталось</div>'+widgetProviders().map(sidebarLimitHTML).join('');
  });if(limitsDialog&&limitsDialog.hasAttribute('open'))limitsDialog.querySelector('.limits-cards').innerHTML=widgetProviders(3).map(popupLimitHTML).join('');if(PAGE==='conn'&&window.LIVE?.onProviderLimits)window.LIVE.onProviderLimits(H.project);}
  function limitsApply(data){
    if(!data||typeof data.ok!=='boolean'||data.project!==H.project||!Array.isArray(data.providers)||!Number.isSafeInteger(data.revision)||data.revision<0)return false;
    if(!data.ok&&(!data.providers.length||!data.providers.every(p=>p&&typeof p.vendor==='string'&&Array.isArray(p.windows)&&typeof p.ok==='boolean'&&(p.ok||typeof p.code==='string'&&typeof p.reason==='string'))))return false;
    if(LIM.revision!==null&&data.revision<LIM.revision)return true;
    LIM.limits=data.providers;LIM.revision=data.revision;LIM.updatedAt=typeof data.updatedAt==='number'?data.updatedAt:null;return true;
  }
  function limitsEvent(data){if(!H.on||H.snapshotOnly||!SP.alive||!limitsApply(data))return;LIM.error=null;limitsDraw();if(PAGE==='spend'){spendDraw();void spendWindows()}}
  function limitsRestart(){if(!SP.alive||!H.on||H.snapshotOnly)return;LIM.generation++;LIM.revision=null;return limitsFetch();}
  async function limitsFetch(){if(!H.on||H.snapshotOnly||!SP.alive)return false;const project=H.project,confirmed=H.confirmedProjectGeneration||0,generation=++LIM.generation;LIM.loading=true;if(LIM.project!==project){LIM.providers=[];LIM.catalogConnected=new Set();LIM.limits=[];LIM.activity=[];LIM.updatedAt=null;LIM.revision=null;LIM.project=project}limitsDraw();
    const [connections,limits,activity,catalog]=await Promise.allSettled([api('/api/connections'),api('/api/limits'),api('/api/spend?period=7'),api('/api/providers/catalog')]);if(!SP.alive||project!==H.project||confirmed!==(H.confirmedProjectGeneration||0)||generation!==LIM.generation)return false;
    const c=connections.status==='fulfilled'?connections.value:null,l=limits.status==='fulfilled'?limits.value:null,a=activity.status==='fulfilled'?activity.value:null,g=catalog.status==='fulfilled'?catalog.value:null;
    LIM.error=null;if(c&&c.ok&&Array.isArray(c.providers))LIM.providers=c.providers.filter(p=>p&&typeof p.id==='string'&&p.auth&&p.auth.loggedIn===true);
    LIM.catalogConnected=new Set(g?.ok&&Array.isArray(g.providers)?g.providers.filter(p=>p&&typeof p.id==='string'&&p.installed===true&&p.login?.state==='ok').map(p=>p.id):[]);
    if(!c||!c.ok||!Array.isArray(c.providers))LIM.error=c&&c.error||'Подключения не прочитаны';
    if(!limitsApply(l)){LIM.error=LIM.error||'Лимиты временно недоступны';LIM.limits=LIM.limits.map(p=>({...p,stale:true}))}
    LIM.activity=a&&a.ok&&a.project===project&&a.period==='7'&&Array.isArray(a.byVendor)?a.byVendor:[];LIM.loading=false;limitsDraw();spendDraw();if(PAGE==='spend'){void spendBilling();await spendWindows()}return true;
  }
  subscribeLiveEvents(event=>{let value;try{value=JSON.parse(event.data)}catch{return}if(value?.type==='providers'&&value.event==='check'&&value.status==='done'&&(!value.project||value.project===H.project))void limitsFetch()});
  const SB={data:null,error:null,project:null,generation:0,saving:false};
  async function spendBilling(){if(PAGE!=='spend'||!H.on||!SP.alive)return;const project=H.project,generation=++SB.generation;if(SB.project!==project){SB.project=project;SB.data=null;SB.error=null}
    try{const r=await api('/api/billing');if(!SP.alive||H.project!==project||generation!==SB.generation)return;if(!r||!r.ok||r.project!==project||!r.config||!Array.isArray(r.subscriptions)||!Array.isArray(r.payments))throw Error(r&&r.error||'Настройки платежей не прочитаны');SB.data=r;SB.error=null}catch(e){if(H.project===project&&generation===SB.generation)SB.error=e.message}if(SP.alive&&H.project===project&&generation===SB.generation)spendDraw();
  }
  function spPolicy(){return '<div class="sp-policy">'+[['limitSwitchCheaper','При лимите переключать на дешёвую модель'],['limitWarn80','Предупреждать при 80 %']].map(([key,label])=>'<div class="opt"><div>'+label+'<small>'+(SB.data?'Настройка владельца':'Настройка ещё не прочитана')+' · действие движка пока не поддерживается</small></div><button type="button" class="tog'+(SB.data&&SB.data.config[key]?' on':'')+'" role="switch" aria-checked="'+!!(SB.data&&SB.data.config[key])+'" aria-label="'+label+'" data-spend-policy="'+key+'"'+(!SB.data||SB.saving?' disabled':'')+'></button></div>').join('')+'</div>'}
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-spend-policy]');if(!b||!H.on)return;e.preventDefault();e.stopImmediatePropagation();if(b.disabled||SB.saving||!SB.data)return;const project=H.project,generation=++SB.generation,key=b.dataset.spendPolicy,value=!SB.data.config[key];SB.saving=true;spendDraw();
    try{const r=await api('/api/settings',{scope:'owner',patch:{[key]:value}});if(H.project!==project||generation!==SB.generation)return;if(!r||!r.ok||r.scope!=='owner'||!r.saved||r.saved[key]!==value)throw Error(r&&r.error||'Нет подтверждения настройки');SB.data.config[key]=value;toast('Настройка сохранена · действие движка пока не поддерживается')}catch(e){if(H.project===project&&generation===SB.generation)toast('Не вышло: '+e.message)}finally{SB.saving=false;if(H.project===project)spendDraw()}
  },true);
  // TS-14c: overview uses the sketch's graphics. Missing measurements are not zeroes or sample telemetry.
  const spBadge=state=>'<span class="pill sp-state">'+state+'</span>';
  const spTokens=row=>{const u=row&&(row.usage||row);return u&&[u.input,u.output,u.cacheRead].every(n=>typeof n==='number')?fmtN(u.input+u.output+u.cacheRead)+' ток.':'токены не сохранены'};
  const spAmount=row=>row&&(row.cost!=null||row.costByCurrency&&row.costByCurrency.length)?spMoney(row):spTokens(row);
  const SW={project:null,generation:0,rows:null,error:null,key:null,promise:null};
  const windowKey=()=>JSON.stringify(LIM.limits.map(p=>[p.vendor,(p.windows||[]).map(w=>[w.windowMinutes,w.resetsAt])]));
  async function spendWindows(force=false){if(PAGE!=='spend'||!SP.alive||!H.on)return;const project=H.project,key=windowKey(),now=Date.now()/1000,starts=LIM.limits.flatMap(p=>(p.windows||[]).filter(w=>Number.isFinite(w.resetsAt)&&Number.isFinite(w.windowMinutes)&&w.windowMinutes>0&&w.resetsAt>now).map(w=>w.resetsAt-w.windowMinutes*60));
    if(!starts.length){SW.generation++;SW.rows=null;SW.key=null;return}if(!force&&SW.project===project&&SW.key===key&&(SW.promise||SW.rows))return SW.promise;
    const generation=++SW.generation;SW.project=project;SW.key=key;SW.rows=null;SW.error=null;const valid=()=>SP.alive&&H.project===project&&SW.generation===generation&&windowKey()===key,min=Math.min(...starts);
    const reading=(async()=>{try{const rows=new Map(),seen=new Set();let before=null;for(let page=0;page<50;page++){const q=new URLSearchParams({period:'all',limit:'200'});if(before)q.set('before',before);const r=await api('/api/spend/turns?'+q);if(!valid())return;if(!r||!r.ok||r.project!==project||r.period!=='all'||!Array.isArray(r.items)||!(r.next===null||typeof r.next==='string'))throw Error('Ходы за окно не прочитаны');for(const row of r.items)rows.set(row.turnInstanceId,row);const last=r.items[r.items.length-1];if(!r.next||last&&typeof last.ts==='number'&&last.ts<min){SW.rows=[...rows.values()];return}if(seen.has(r.next))throw Error('Повтор страницы ходов');seen.add(r.next);before=r.next}throw Error('Больше 10 000 ходов: итог окна не рассчитан')}catch(e){if(valid())SW.error=e.message}finally{if(valid()){SW.promise=null;spendDraw()}}})();SW.promise=reading;return reading;
  }
  function spWindowUsage(w,vendor,mock){if(mock)return '';const now=Date.now()/1000,start=Number.isFinite(w.resetsAt)&&Number.isFinite(w.windowMinutes)&&w.windowMinutes>0?w.resetsAt-w.windowMinutes*60:NaN,elapsed=(now-start)/(w.windowMinutes*60),forecast=Number.isFinite(elapsed)&&elapsed>0&&elapsed<=1?w.percentUsed/elapsed:null;
    let tokens='Токены окна: нет данных';if(SW.project===H.project&&SW.key===windowKey()&&SW.rows&&Number.isFinite(start)&&w.resetsAt>now){const rows=SW.rows.filter(r=>r.vendor===vendor&&typeof r.ts==='number'&&r.ts>=start&&r.ts<w.resetsAt&&r.ts<=now),known=rows.filter(r=>r.usage&&[r.usage.input,r.usage.output,r.usage.cacheRead].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0));tokens='Наш проект за окно: '+fmtN(known.reduce((n,r)=>n+r.usage.input+r.usage.output+r.usage.cacheRead,0))+' ток.'+(known.length<rows.length?' · часть токенов не сохранена':'')}
    return '<small class="sp-source sp-window-usage">'+esc(SW.error||tokens)+'</small><small class="sp-source">'+(forecast!==null&&Number.isFinite(forecast)?'Оценка к сбросу ≈ '+forecast.toLocaleString('ru-RU',{maximumFractionDigits:1})+' % · при текущем темпе':'Оценка к сбросу: недостаточно данных')+'</small>';
  }
  function spQuotaGraph(w,mock,compact=false,vendor=null){const n=compact?24:40,percent=w.percentUsed.toLocaleString('ru-RU',{maximumFractionDigits:1}),reset=mock?w.sampleReset:typeof w.resetsAt==='number'?spDate(w.resetsAt):typeof w.resetsIn==='number'?'через '+Math.max(0,Math.ceil(w.resetsIn/60))+' мин':'нет данных';
    return '<div class="sp-quota"><div class="big"><small>'+esc(w.label)+'</small><b'+(w.percentUsed>=90?' class="bad"':'')+'>'+percent+' %</b></div><div class="tk" role="meter" aria-label="'+esc((mock?'макет · ':'')+w.label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+w.percentUsed+'">'+Array.from({length:n},(_,i)=>'<i class="'+(i<Math.round(w.percentUsed*n/100)?w.percentUsed>=90?'bad':'on':'')+'"></i>').join('')+'</div><div class="tkl"><span>остаток '+(100-w.percentUsed).toLocaleString('ru-RU',{maximumFractionDigits:1})+' %</span><span>порог 80 %</span></div><small class="sp-reset">сброс '+esc(reset)+'</small>'+spWindowUsage(w,vendor,mock)+'</div>';
  }
  function spProvider(p){const info=spWindow(p),g=SP.data&&(SP.data.byVendor||[]).find(r=>r.vendor===p.id),large=p.id==='claude',state=info.mock&&!g?'макет':'частично';
    return '<div class="h"><b>'+esc(p.name||p.id)+(info.found&&info.found.plan&&!String(p.name||'').includes(info.found.plan)?' · '+esc(info.found.plan)+(info.found.planLevel?' '+esc(info.found.planLevel):''):'')+'</b>'+spBadge(state)+'</div>'+
      (info.unlimited?'<div class="sp-quota-missing"><div class="big"><small>Лимиты подписки</small>безлимит</div></div>':info.unavailable?'<div class="sp-quota-missing"><div class="big"><small>Лимиты подписки</small>нет данных</div><p>'+esc(info.reason)+'</p></div>':'<div class="sp-windows'+(info.windows.length>1?' wide':'')+'">'+(info.primary?[info.primary,...info.windows.filter(w=>w!==info.primary)]:info.windows).map(w=>spQuotaGraph(w,info.mock,!large,p.id)).join('')+'</div>')+
      (info.found&&typeof info.found.extraUsageEnabled==='boolean'?'<small class="sp-source">Доплата: '+(info.found.extraUsageEnabled?'включена':'выключена')+'</small>':'')+(info.mock?'<small class="sp-source">Макет лимитов · '+esc(info.reason)+'</small>':info.found?'<small class="sp-source" title="'+esc(info.found.source||p.name||p.id)+'">Лимиты: '+esc(p.name||p.id)+(info.stale?' · устаревшие данные':'')+(typeof info.found.fetchedAt==='number'?' · '+esc(new Date(info.found.fetchedAt*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})):'')+'</small>':'')+
      (p.id==='codex'?spLimitCreditHTML(info.found):'')+spLimitRetryHTML(info.found,!info.unavailable)+
      (large?'<div class="sub2"><div><b>'+ (g?spMetric(g.turns):SP.data?'0':'читаю…')+'</b><small>ходов · проект</small></div><div><b>'+(g?spAmount(g):SP.data?'0 ток.':'читаю…')+'</b><small>за период</small></div><div><b>'+(g?spMetric(g.cacheRead):SP.data?'0':'читаю…')+'</b><small>кэш, токены</small></div></div>':'<small class="sp-source">Проект · '+(g?spMetric(g.turns)+' ход. · '+spAmount(g):SP.data?'0 ходов · 0 ток.':'читаю…')+'</small>')+
      (large?spPolicy():'');
  }
  function spHistory(compact=false){const rows=compact?SP.history.slice(0,4):SP.history;
    return (SP.historyError?'<p role="alert">'+esc(SP.historyError)+'</p>':'')+(rows.length?spTable(compact?['когда','модель · место','токены / стоимость','чат']:['когда','модель · провайдер','место','вход / выход / кэш','исход','токены / стоимость','чат'],rows.map(r=>compact?[esc(typeof r.ts==='number'?new Date(r.ts*1000).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}):'нет даты'),esc(r.model||'модель не сохранена')+'<small>'+esc(r.pane)+'</small>',spAmount(r),spButton('Открыть','data-spend-chat="'+esc(r.chat)+'"')]:[esc(spDate(r.ts)),esc((r.model||'модель не сохранена')+' · '+(r.vendor||'провайдер не сохранён')),esc(r.pane),[r.usage.input,r.usage.output,r.usage.cacheRead].map(n=>n===null?'не сохранено':spMetric(n)).join(' / '),esc(r.outcome),spAmount(r),spButton('Открыть','data-spend-chat="'+esc(r.chat)+'"')])):'<p class="d">'+(SP.historyLoading?'Читаю ходы…':'Ходов по этому фильтру нет. Здесь появятся модель, токены и результат каждого хода.')+'</p>')+(!compact&&SP.next?spButton(SP.historyLoading?'Читаю…':'Показать ещё','data-spend-more',SP.historyLoading):'');
  }
  const spFilters=()=>'<div class="sp-actions"><label>Провайдер <select data-spend-vendor>'+[['','все'],['claude','Claude'],['codex','Codex'],['null','не сохранён']].map(([v,t])=>'<option value="'+v+'"'+(SP.vendor===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label><label>Модель <select data-spend-model-filter><option value="">все</option>'+((SP.data&&SP.data.byModel)||[]).map(r=>'<option value="'+esc(r.model===null?'null':r.model)+'"'+(SP.model===(r.model===null?'null':r.model)?' selected':'')+'>'+esc(r.model||'не сохранена')+'</option>').join('')+'</select></label>'+spButton('CSV','data-spend-csv',!SP.data||SP.loading)+'</div>';
  function spRouter(){const rows=SP.data&&SP.data.byModelVendor||[],total=SP.data&&SP.data.totals.turns||0,ordered=[...rows].sort((a,b)=>b.turns-a.turns),visible=ordered.slice(0,4),remainder=ordered.slice(4);
    if(remainder.length)visible.push({model:'Другие модели ('+remainder.length+')',turns:remainder.reduce((n,r)=>n+r.turns,0)});
    const graphRows=visible.length?visible:[...new Set((H.panes||[]).map(p=>p.model).filter(Boolean))].slice(0,4).map(model=>({model,turns:0}));
    const height=Math.max(180,graphRows.length*48),share=r=>total?(r.turns/total*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+' %':'0 %',label=r=>(r.model||'модель не сохранена')+(r.vendor?' · '+r.vendor:'');
    return '<div class="h"><b>Роутер моделей</b>'+spBadge('частично')+'</div><div class="sp-router-modes" data-spend-unavailable><span class="seg">'+['Cost','Balanced','Quality'].map(t=>'<button type="button" class="'+(t==='Balanced'?'on':'')+'" disabled>'+t+'</button>').join('')+'</span><small>макет · политика ещё не исполняется</small></div>'+
      '<div class="river sp-graph" style="height:'+height+'px" aria-label="Фактическая доля ходов по моделям"><svg viewBox="0 0 420 '+height+'" preserveAspectRatio="none" aria-hidden="true">'+graphRows.map((r,i)=>'<path d="M60 '+height/2+' C160 '+height/2+', 140 '+(24+i*48)+', 235 '+(24+i*48)+'" style="stroke-width:'+(total?Math.max(2,r.turns/total*22):2)+'" class="'+(i===0?'a':i===3?'g':'')+'"/>').join('')+'</svg><div class="nd sp-gateway" data-spend-router="'+(LIM.providers.some(p=>p.id==='router')?'connected':'none')+'">Шлюз<small>'+total+' ходов</small></div>'+graphRows.map((r,i)=>'<div class="nd sp-node" style="top:'+(i*48+4)+'px" title="'+esc(label(r))+'">'+esc(r.model||'модель не сохранена')+'<small>'+share(r)+(r.vendor?' · '+esc(r.vendor):'')+'</small></div>').join('')+(!graphRows.length?'<div class="sp-graph-empty">Модели ещё не назначены</div>':'')+'</div><small class="sp-source">Живое · фактические ходы текущего проекта'+(!total?' · за этот период ходов нет':'')+'</small>'+
      (rows.length?spTable(['модель','доля','p50 / p95','ошибки'],ordered.map(r=>[esc(label(r)),share(r),[r.p50DurationMs,r.p95DurationMs].map(n=>n===null?'нет данных':(n/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' с').join(' / '),r.errorRate==null?'нет данных':(r.errorRate*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+' %'])):'')+
      '<div class="fb"><span><b>Fallback · макет</b><br>Если модель не отвечает 60 с → резервная модель.<small>Образец правила · движок пока не применяет</small></span></div><div class="dirty" data-spend-unavailable><small>Политика не подключена</small>'+spButton('Отменить','',true)+spButton('Применить политику','',true)+'</div>'+((H.panes||[]).filter(p=>p.model).map(p=>'<div class="opt"><div>'+esc(paneName(p))+'<small>'+esc(p.model)+'</small></div>'+spButton('Сменить модель','data-spend-model="'+esc(p.id)+'"',SP.mutation)+'</div>').join(''))+'<a class="sp-source" href="11-connections.html">Подключения и маршруты →</a>';
  }
  function spCalendar(){const days=SP.data&&SP.data.byDay||[],payments=SB.data&&SB.data.payments||[],hasDates=!!(SB.data&&SB.data.config.subscriptionDates.length),now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7-7);
    const today=now.toISOString().slice(0,10),resets=LIM.limits.flatMap(p=>(Array.isArray(p.windows)?p.windows:[]).filter(w=>w&&typeof w.resetsAt==='number'&&Number.isFinite(new Date(w.resetsAt*1000).getTime())).map(w=>({day:new Date(w.resetsAt*1000).toISOString().slice(0,10),text:p.vendor+' · '+w.label+' · '+spDate(w.resetsAt),stale:p.stale}))),month=now.toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
    return '<div class="h"><b>Платежи и сбросы</b>'+spBadge('частично')+'</div><small class="sp-source">'+esc(month)+' · UTC · 3 недели</small><div class="cal sp-calendar">'+Array.from({length:21},(_,i)=>{const date=new Date(start);date.setUTCDate(start.getUTCDate()+i);const key=date.toISOString().slice(0,10),d=days.find(d=>d.day===key),reset=resets.filter(r=>r.day===key),bills=payments.filter(p=>p.date===key),payment=bills.length?bills.map(p=>p.amount===null?'цена не задана':p.amount+' '+p.currency).join(' + '):!hasDates?(i===9?'200 $':i===14?'40 $':null):null,title=[key,reset.map(r=>r.text+(r.stale?' · устарело':'')).join(', '),d?d.turns+' ход. · '+spTokens(d):'',payment?(bills.length?'Платёж · настройки владельца: '+bills.map(p=>p.vendor+' '+(p.plan||'тариф не задан')).join(', ')+' · ':'Макет платежа ')+payment:''].filter(Boolean).join(' · ');return '<div data-date="'+key+'" class="'+(key===today?'today ':'')+(reset.length?'r ':'')+(payment?'p':'')+'"'+(payment?' data-s="'+esc(payment)+(bills.length?'':'*')+'"':'')+' title="'+esc(title)+'">'+date.getUTCDate()+(d?'<b>'+d.turns+' ход.</b>':'')+'</div>'}).join('')+'</div><small class="sp-source">Живое: ходы по дням и ● известные сбросы лимитов</small>'+(hasDates?'<small class="sp-source">Платежи · настройки владельца · расчёт дат, не подтверждение оплаты</small>':'<small class="sp-source">* Макет платежей: даты и суммы образца. Введите дату списания и цену своего плана в настройках.</small>')+(SB.data&&Array.isArray(SB.data.bindings)?SB.data.bindings.filter(b=>b.status!=='current').map(b=>'<small class="sp-source">'+esc(b.vendor+' · '+(b.account||'Без привязки')+' · '+(b.status==='other_account'?'для другой учётной записи':'нужна привязка к входу')+' · платёж не применяется')+'</small>').join(''):'')+(SB.error?'<small class="sp-source">'+esc(SB.error)+'</small>':'')+'<a class="sp-source" href="06-settings.html#p=subscriptions">Настроить платежи →</a>'+resets.filter(r=>r.day>=today).slice(0,2).map(r=>'<small class="sp-source">Следующий сброс: '+esc(r.text)+(r.stale?' · устарело':'')+'</small>').join('');
  }
  function spendDraw(){if(PAGE!=='spend'||!H.on)return;if(SB.project!==H.project){SB.generation++;SB.project=H.project;SB.data=null;SB.error=null}
    document.querySelectorAll('[data-spend-demo]').forEach(el=>el.remove());const data=SP.data,g=data&&data.totals;document.title='Harnessy · Расход и лимиты';
    const title=document.querySelector('.frame .top > b');if(title)title.textContent='Расход и лимиты · '+base(H.project);
    const state=document.querySelector('.frame .top .st'),quotaTop=['codex','claude'].flatMap(v=>{const p=LIM.providers.find(p=>p.id===v);if(!p)return [];const info=spWindow(p);return info.mock?[]:info.unavailable?[(p.name||v)+' · нет данных']:info.windows.map(w=>(p.name||v)+' '+w.percentUsed.toLocaleString('ru-RU',{maximumFractionDigits:1})+' % '+w.label+(typeof w.resetsAt==='number'?' · сброс '+limitCountdown(w.resetsAt-Date.now()/1000):''))}).join(' · ');if(state)state.textContent=quotaTop||'текущий проект · '+(SP.loading?'читаю…':data?'период '+data.period+' · снимок '+spDate(data.generatedAt):'нет данных');
    const top=document.querySelector('.frame .top .r');if(top&&!top.querySelector('[data-spend-periods]')){const segs=top.querySelectorAll('.seg');if(segs[1])segs[1].remove();top.insertAdjacentHTML('beforeend','<div data-spend-periods></div>')}
    const periods=document.querySelector('[data-spend-periods]');if(periods)periods.innerHTML=['7','30','90','all'].map(p=>spButton(p==='all'?'всё':p+' дн','data-spend-period="'+p+'" aria-pressed="'+(p===SP.period)+'"')).join('')+spButton('Обновить','data-spend-refresh',SP.loading)+spButton('CSV','data-spend-csv',!data||SP.loading);
    const subtitle=document.querySelector('#seg [data-v="proj"]');if(subtitle)subtitle.textContent='Проект';
    let status=document.querySelector('[data-spend-status]');if(!status){const main=document.querySelector('.frame .views');if(main){status=document.createElement('div');status.setAttribute('data-spend-status','');status.setAttribute('role','status');main.insertBefore(status,main.firstChild)}}
    if(status)status.innerHTML=(SP.error?'<p role="alert">'+esc(SP.error)+(data?' · показан прежний снимок за период '+esc(data.period):'')+'</p>':'')+(data?'<small>Источник: chats.json · текущий проект '+esc(base(data.project))+' · период '+esc(data.period)+' · снимок '+esc(spDate(data.generatedAt))+' · токены и ходы</small>':'<p>Читаю данные текущего проекта…</p>');
    const providers=[{slot:'claude',id:'claude',name:'Claude Max'},{slot:'codex',id:'codex',name:'Codex'}];
    providers.forEach(p=>{const card=document.querySelector('[data-c="'+p.slot+'"]');if(card){card.innerHTML=spProvider(LIM.providers.find(x=>x.id===p.id)||p);card.setAttribute('tabindex','0');card.dataset.vendor=p.id;card.hidden=false}});
    // The sketch's third slot belongs to a real API provider, never the local router.
    const apiProvider=limitProviders().find(limitApi),apiCard=document.querySelector('[data-c="qwen"]');
    if(apiCard){apiCard.hidden=!apiProvider;apiCard.innerHTML=apiProvider?spProvider({...apiProvider,name:(apiProvider.name||apiProvider.id)+' · ключ API'}):'';apiCard.dataset.vendor=apiProvider?apiProvider.id:'';apiCard.setAttribute('tabindex',apiProvider?'0':'-1')}
    const set=(selector,html)=>{const el=document.querySelector(selector);if(el)el.innerHTML=html};
    set('[data-c="hist"]','<div class="h"><b>История ходов</b>'+spBadge('живое')+'<span class="cnt">показать все →</span></div>'+spHistory(true));set('[data-c="router"]',spRouter());set('[data-c="cal"]',spCalendar());
    set('#v-proj .nums','<div><b>'+spMetric(g&&g.turns)+'</b><small>ходов · текущий проект</small></div><div><b>'+spMoney(g)+'</b><small>известная стоимость</small></div><div><b>'+spMetric(g&&g.unpricedTurns)+'</b><small>ходов без цены</small></div>');
    set('#v-proj .lst','<div class="sp-actions">'+Object.entries(spendGroups).map(([key,label])=>spButton(label,'data-spend-group="'+key+'" aria-pressed="'+(SP.group===key)+'"')).join('')+'</div>'+spGroups(data,SP.group));
    set('#v-proj .note-bar','<div>'+spMock('Стадии и принятые результаты','Реестр стадий и цена принятого результата пока не ведутся. Перенесено: '+(data?data.transferred:'—')+' · без происхождения: '+(data?data.unknownOrigin:'—')+' · без даты: '+(data?data.undated:'—'))+'</div>');
    set('#v-role .nums','<div><b>'+spMetric(g&&g.outcomes.ok)+'</b><small>успешные ходы</small></div><div><b>'+spMetric(g&&g.outcomes.error)+'</b><small>сбои</small></div><div><b>'+spMetric(g&&g.outcomes.interrupted)+'</b><small>прерванные</small></div>');
    set('#v-role .lst',spMock('Причины расхода','Классификация причин, связь с повторами и создание правила пока недоступны.',['Создать правило'])+'<a href="16-memory.html">Открыть память проекта →</a>'+spGroups(data,'byPane'));
    set('#v-est .nums','<div><b>'+spMoney(g)+'</b><small>факт по текущему прайс-листу</small></div><div><b>'+spMetric(g&&g.unpricedTurns)+'</b><small>без цены · '+esc(g&&g.costReason||'нет пропусков')+'</small></div><div id="cap">'+spMock('Что делать на 95 % недели','Порог и ограничитель пока не исполняются движком.',['Применить'])+'</div>');
    set('#v-est .lst',spMock('Смета и факт','Плановые объёмы не заданы: прогноз и точность сметы недоступны.',['Пересчитать смету'])+spGroups(data,'byModelVendor'));
    const views=document.querySelector('.frame .views');if(views&&!views.querySelector('[data-spend-prices]'))views.insertAdjacentHTML('beforeend','<footer data-spend-prices><a href="06-settings.html#p=priceList">цены моделей (донастройка)</a></footer>');
  }
  const spNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  function spMetrics(row){return row&&['turns','input','output','cacheRead','durationMs','durationSamples','pricedTurns','unpricedTurns','missingMeasurements'].every(k=>spNumber(row[k]))&&['averageDurationMs','p50DurationMs','p95DurationMs','errorRate','cost'].every(k=>row[k]===null||spNumber(row[k]))&&row.outcomes&&['ok','interrupted','error','unknown'].every(k=>spNumber(row.outcomes[k]))&&Array.isArray(row.costByCurrency)&&row.costByCurrency.every(c=>c&&typeof c.currency==='string'&&spNumber(c.cost))}
  function spHistoryRow(row){return row&&typeof row.turnInstanceId==='string'&&typeof row.chat==='string'&&typeof row.pane==='string'&&(row.model===null||typeof row.model==='string')&&[null,'claude','codex'].includes(row.vendor)&&['ts','durationMs','cost'].every(k=>row[k]===null||spNumber(row[k]))&&(row.currency===null||typeof row.currency==='string')&&['ok','interrupted','error','unknown'].includes(row.outcome)&&row.usage&&['input','output','cacheRead'].every(k=>row.usage[k]===null||spNumber(row.usage[k]))}
  function spValid(g,p,period){return SP.alive&&H.on&&SP.generation===g&&H.project===p&&SP.period===period}
  async function spendHistory(more=false){if(PAGE!=='spend'||!H.on||!SP.alive||SP.historyLoading||more&&!SP.next)return false;const project=H.project,period=SP.period,generation=SP.generation,vendor=SP.vendor,model=SP.model,before=more?SP.next:null;
    const historyGeneration=++SP.historyGeneration;SP.historyLoading=true;SP.historyError=null;spendDraw();const q=new URLSearchParams({period,limit:'20'});if(vendor)q.set('vendor',vendor);if(model)q.set('model',model);if(before)q.set('before',before);
    try{const r=await api('/api/spend/turns?'+q);if(!spValid(generation,project,period)||historyGeneration!==SP.historyGeneration||vendor!==SP.vendor||model!==SP.model)return false;
      if(!r||!r.ok||r.project!==project||r.period!==period||r.source!=='chats.json'||!Array.isArray(r.items)||!r.items.every(spHistoryRow)||!(r.next===null||typeof r.next==='string'))throw Error(r&&r.error||'История не соответствует проекту и периоду');
      SP.history=[...new Map([...(more?SP.history:[]),...r.items].map(row=>[row.turnInstanceId,row])).values()];SP.next=r.next;return true;
    }catch(e){if(spValid(generation,project,period)&&historyGeneration===SP.historyGeneration)SP.historyError=e.message;return false}finally{if(spValid(generation,project,period)&&historyGeneration===SP.historyGeneration){SP.historyLoading=false;spendDraw();if(SP.card==='hist'&&document.querySelector('.ovl.on [data-live-spend]'))spOpenCard(document.querySelector('[data-c="hist"]'),'hist')}}
  }
  async function spendFetch(){if(PAGE!=='spend'||!H.on||!SP.alive)return false;const project=H.project,period=SP.period,generation=++SP.generation;
    if(SP.project!==project){SB.generation++;SB.project=project;SB.data=null;SB.error=null;SP.project=project;SP.data=null;if(window.HX)HX.close();SP.card=null}SP.history=[];SP.next=null;SP.historyLoading=false;SP.loading=true;SP.error=null;spendDraw();
    try{const data=await api('/api/spend?period='+period);if(!spValid(generation,project,period))return false;
      if(!data||!data.ok)throw Error(data&&data.error||'история недоступна');if(data.project!==project||data.period!==period||data.source!=='chats.json'||!spMetrics(data.totals)||!spNumber(data.generatedAt)||!['byPane','byChat','byModel','byVendor','byModelVendor','byDay'].every(k=>Array.isArray(data[k])&&data[k].every(spMetrics)))throw Error('ответ аналитики не соответствует проекту и периоду');
      SP.data=data;await spendHistory();await spendBilling();await spendWindows(true);return true;
    }catch(e){if(spValid(generation,project,period))SP.error=e.message||'нет связи';return false}finally{if(spValid(generation,project,period)){SP.loading=false;spendDraw()}}
  }
  function spendCsv(){if(!SP.data||SP.loading)return null;const data=SP.data,columns=['turns','input','output','cacheRead','durationMs','averageDurationMs','p50DurationMs','p95DurationMs','errorRate','missingMeasurements','pricedTurns','unpricedTurns','cost','currency','costReason'];
    const rows=[['source',data.source,'project',data.project,'period',data.period,'generatedAt',data.generatedAt,'pricingBasis','current','timeZone','UTC','transferred',data.transferred,'unknownOrigin',data.unknownOrigin,'undated',data.undated],['group','id','title',...columns,'costByCurrency','ok','interrupted','error','unknown']];
    for(const group of Object.keys(spendGroups))for(const row of data[group]||[])rows.push([group,group==='byChat'?row.chat:group==='byPane'?row.pane:group==='byDay'?row.day:group==='byModelVendor'?JSON.stringify([row.vendor,row.model]):row.model||row.vendor||'',row.label||row.title||row.model||row.vendor||row.day||'не сохранено',...columns.map(k=>row[k]??''),JSON.stringify(row.costByCurrency||[]),...['ok','interrupted','error','unknown'].map(k=>row.outcomes[k])]);
    const cell=value=>{let s=String(value);if(/^[\s]*[=+\-@]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
  }
  let limitsDialog=null,limitsOpener=null,limitsDialogProject=null;
  function closeLimits(){if(limitsDialog&&limitsDialog.hasAttribute('open'))limitsDialog.close();if(limitsOpener&&limitsOpener.isConnected)limitsOpener.focus();limitsOpener=null;limitsDialogProject=null;}
  function openLimits(el){
    if(!limitsDialog){limitsDialog=document.createElement('dialog');limitsDialog.className='limits-dialog';limitsDialog.setAttribute('aria-label','Все лимиты подписок');document.body.appendChild(limitsDialog);limitsDialog.addEventListener('cancel',event=>{event.preventDefault();closeLimits()});limitsDialog.addEventListener('click',event=>{if(event.target===limitsDialog)closeLimits()});}
    limitsOpener=el.closest('aside.side.ps .limits')||el;limitsDialogProject=H.project;
    limitsDialog.innerHTML='<h3>Все лимиты</h3><div class="limits-cards">'+widgetProviders(3).map(popupLimitHTML).join('')+'</div><div class="sp-actions"><a href="05-spend.html?period='+SP.period+'">Расход и лимиты →</a>'+spButton('Закрыть','data-spend-close')+'</div>';
    limitsDialog.showModal();limitsDialog.querySelector('[data-spend-close]').focus();
  }
  addEventListener('keydown',event=>{if(event.key==='Escape'&&limitsDialog&&limitsDialog.hasAttribute('open')){event.preventDefault();closeLimits()}});
  function spOpenCard(el,key){if(!el)return;if(key==='limits'){openLimits(el);return}if(!window.HX)return;SP.card=key;let html;
    if(key==='hist')html='<h3>История ходов</h3>'+spFilters()+spHistory();
    else if(key==='passport')html='<h3>Расход и лимиты</h3><p>Текущий проект '+esc(H.project)+'. Измерения: chats.json; цены: текущая таблица владельца. Лимиты: /api/limits. Блоки «макет» не выполняют действий.</p>';
    else html=el.innerHTML;
    HX.open(el,'<div data-live-spend>'+html+'<div class="acts">'+spButton('Закрыть','data-spend-close')+'</div></div>',{w:1000,h:690,hide:false});
  }
  addEventListener('live:status',()=>{if(limitsDialogProject&&limitsDialogProject!==H.project)closeLimits();if(H.on&&!H.snapshotOnly&&SP.alive){if(SP.project!==H.project&&window.HX){HX.close();SP.card=null}void limitsFetch();if(PAGE==='spend')void spendFetch()}});
  addEventListener('pagehide',()=>{closeLimits();SP.alive=false;SP.generation++;LIM.generation++});addEventListener('pageshow',event=>{if(event.persisted)SP.alive=true});
  document.addEventListener('click',async event=>{const target=event.target,block=target.closest('aside.side.ps .limits');if(block&&target.closest('a'))return;const widget=target.closest('[data-spend-limits]')||block;if(!H.on&&!widget&&!target.closest('[data-spend-close]'))return;
    // Nested menus own their clicks; the card must not intercept them before laMenu receives the choice.
    if(target.closest('.live-menu'))return;
    const button=target.closest('[data-spend-period], [data-spend-group], [data-spend-refresh], [data-spend-csv], [data-spend-more], [data-spend-chat], [data-spend-model], [data-spend-close]');
    const card=PAGE==='spend'&&target.closest('[data-c]'),passport=PAGE==='spend'&&target.closest('[data-passport]');
    if(target.closest('[data-spend-unavailable]')){event.preventDefault();event.stopImmediatePropagation();return}if(card&&target.closest('a, input, select, option')&&!button){event.stopPropagation();return}if(!widget&&!button&&!passport&&!card)return;
    event.preventDefault();event.stopImmediatePropagation();if(widget){spOpenCard(widget,'limits');return}if(passport){spOpenCard(passport,'passport');return}if(!button){spOpenCard(card,card.dataset.c);return}if(button.disabled)return;
    if(button.hasAttribute('data-spend-close')){SP.card=null;if(limitsDialog&&limitsDialog.hasAttribute('open'))closeLimits();else if(window.HX)HX.close()}
    else if(button.dataset.spendPeriod){SP.card=null;if(window.HX)HX.close();SP.period=button.dataset.spendPeriod;try{const q=new URLSearchParams(location.search||'');q.set('period',SP.period);history.replaceState(null,'','?'+q+(location.hash||''))}catch(e){}limitsDraw();await spendFetch()}
    else if(button.dataset.spendGroup){SP.group=button.dataset.spendGroup;spendDraw()}
    else if(button.hasAttribute('data-spend-refresh')){await Promise.all([spendFetch(),limitsFetch()])}
    else if(button.hasAttribute('data-spend-more'))await spendHistory(true);
    else if(button.hasAttribute('data-spend-chat')){const row=SP.history.find(r=>r.chat===button.dataset.spendChat);if(!row||SP.project!==H.project)return;S.ui.pane=row.pane;S.ui.openChat=row.chat;S.ui.switched=true;save();location.href='01-chat.html'}
    else if(button.hasAttribute('data-spend-model')){const project=H.project,generation=SP.generation,pane=(H.panes||[]).find(p=>p.id===button.dataset.spendModel);if(!pane)return;
      laMenu(button.parentElement,'Модель · '+paneName(pane),Object.entries(H.models||{}).flatMap(([vendor,items])=>items.map(m=>({id:m.id,t:esc(m.label||m.id),r:vendor}))),async choice=>{if(project!==H.project||generation!==SP.generation||SP.mutation)return;SP.mutation=true;spendDraw();try{const r=await api('/api/panes/'+encodeURIComponent(pane.id),{model:choice.id});if(project!==H.project||generation!==SP.generation)return;if(!r||!r.ok||!r.pane||r.pane.id!==pane.id||r.pane.model!==choice.id)throw Error(r&&r.error||'Нет подтверждения модели');toast('Модель: '+esc(choice.id)+(r.appliesFrom==='next'?' · применится со следующего хода':''));await refreshStatus()}catch(e){toast('Не вышло: '+esc(e.message))}finally{SP.mutation=false;spendDraw()}})
    }else {const csv=spendCsv();if(csv===null)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='harnessy-spend-'+SP.data.period+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}
  },true);
  document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('aside.side.ps .limits')){event.preventDefault();event.stopImmediatePropagation();openLimits(event.target)}},true);
  document.addEventListener('change',async event=>{if(!H.on||PAGE!=='spend')return;const v=event.target.closest('[data-spend-vendor]'),m=event.target.closest('[data-spend-model-filter]');if(!v&&!m)return;event.stopImmediatePropagation();if(v)SP.vendor=v.value;if(m)SP.model=m.value;SP.historyGeneration++;SP.history=[];SP.next=null;SP.historyLoading=false;await spendHistory()});
  document.addEventListener('keydown',event=>{if(!H.on||PAGE!=='spend'||!['Enter',' '].includes(event.key)||!event.target.matches('[data-c]'))return;event.preventDefault();event.stopImmediatePropagation();spOpenCard(event.target,event.target.dataset.c)},true);
  if(PAGE==='spend')document.querySelectorAll('.frame .views').forEach(view=>view.insertAdjacentHTML('beforeend','<div data-spend-demo>макет · образец данных, пока движок недоступен</div>'));
  hooks.push(limitsDraw);
  // End TS-14b spend.
  // ══ РАСХОД: вторые экраны — политика роутера, решения по лимиту, правило из причины, смета, выгрузка ══
  if(PAGE==='spend'){
    S.spend=S.spend||{policy:0,revOpus:0,est:{},cap:'',remind:0,warn:0};
    const dirty=document.querySelector('.dirty'); if(dirty) dirty.dataset.h0=dirty.innerHTML; let curKey='';
    const csv=(name,rows)=>{ const data='﻿'+rows.map(r=>r.map(c=>'"'+String(c).replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"').join(';')).join('\r\n'), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); };
    const exportView=()=>{ const v=document.querySelector('.view.on'), id=v?v.id:'v-over'; let rows;
      if(id==='v-over') rows=[...document.querySelectorAll('.hist .tbl tr')].map(tr=>[...tr.children].map(c=>c.textContent));
      else rows=[...v.querySelectorAll('.lst .li')].map(li=>[...li.children].slice(0,-1).map(c=>c.textContent));
      csv('harnessy-rashod-'+id.replace('v-','')+'.csv',rows); log('расход','Выгружен CSV: '+({'v-over':'история по моделям','v-proj':'проекты','v-role':'причины','v-est':'смета'}[id]||id)+' · '+(rows.length-1)+' строк'); toast('CSV выгружен · '+(rows.length-1)+' строк'); };
    function apply(){ if(H.on)return; if(dirty){ if(S.spend.policy){ dirty.innerHTML='<span class="m" style="color:var(--ok)">политика применена в '+hhmm(S.spend.policy)+'</span><span>Sonnet 35 % · Opus 50 %</span><span class="btn sm ghost" style="margin-left:auto;cursor:pointer" data-pol="undo">Вернуть прежнюю</span>'; } else dirty.innerHTML=dirty.dataset.h0; dirty.querySelectorAll('.btn').forEach(b=>b.style.cursor='pointer'); }
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
    function applyShow(){if(H.on)return; cards.forEach(c=>{ const k=c.dataset.s; c.innerHTML=c.dataset.h0; const f=c.querySelectorAll('.f span'), pp=c.querySelector('p');
        if(S.art.show.upd[k]){ if(k==='rep'&&pp) pp.textContent='закреплена версия 3 — актуальна'; if(f[0]) f[0].textContent=(k==='rep'?'версия 3 · ':'')+'проверено в '+hhmm(S.art.show.upd[k]); if(f[1]){ f[1].textContent='в норме'; f[1].style.color='var(--ok)'; } }
        c.style.opacity=S.art.show.off[k]?'.38':''; if(S.art.show.off[k]&&f[1]){ f[1].textContent='снято с витрины'; f[1].style.color='var(--ink3)'; } });
      if(box){ box.querySelectorAll('[data-live-s]').forEach(x=>x.remove()); Object.keys(S.art.shared).forEach(k=>{ if(!names[k]) return; const d=document.createElement('div'); d.className='sc'; d.dataset.liveS=k; d.style.cursor='pointer'; d.innerHTML='<b>'+esc(names[k])+'</b><p>отправлено вами на витрину из списка артефактов</p><div class="f"><span>сегодня</span><span style="color:var(--ok)">в норме</span></div>'; box.appendChild(d); }); } }
    hooks.push(applyShow);
    document.addEventListener('click',e=>{if(H.on)return; const c=e.target.closest('#v-show .sc[data-s]'); if(c){ curSh=c.dataset.s; setTimeout(()=>{if(H.on)return; const acts=document.querySelector('.ovl.on .panel .acts'); if(acts&&S.art.show.off[curSh]) acts.innerHTML='<span class="btn sm p">Вернуть на витрину</span><span class="btn sm ghost" data-close>Закрыть</span>'; },0); }
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
    function applyPast(){if(H.on)return; prow.forEach(li=>{ const c=li.querySelectorAll(':scope > .m')[2]; if(!c) return; const x=S.res.cont[li.dataset.p]; c.textContent=x?'продолжено сегодня в '+hhmm(x):li.dataset.ap0; c.style.color=x?'var(--accent)':li.dataset.apc0; }); }
    hooks.push(applyPast);
    document.addEventListener('click',e=>{if(H.on)return; const li=e.target.closest('#v-past .li[data-p]'); if(li) curPast=li.dataset.p; const b=e.target.closest('.panel .acts .btn'); if(!b||!curPast||!document.querySelector('#v-past.on')) return; const lab=b.textContent.trim(), k=curPast, name=prow.find(r=>r.dataset.p===k).querySelector('b').textContent;
      if(/^Продолжить это исследование/.test(lab)){ S.res.cont[k]=now(); save(); log('ресёрч','Продолжено прошлое исследование: '+name.slice(0,60)); HX.close(); applyPast(); toast('Исследование продолжено — ресёрчер получит его вопросы',()=>{ delete S.res.cont[k]; save(); applyPast(); }); }
      else toast('В прототипе «'+esc(lab)+'» ничего не открывает: отчёты лежат в папке проекта'); },true);
  }

  // ══ ДОКУМЕНТЫ ПРОЕКТА · версии: новые версии от ваших правок, «Открыть» и «Сравнить» ══
  if(PAGE==='doc'){
    const vb=document.getElementById('vers'); if(vb) vb.addEventListener('click',()=>setTimeout(()=>{if(H.on)return; const inner=document.querySelector('.ovl.on .panel .inner'), first=inner&&inner.querySelector('.vrow'); if(!first||inner.querySelector('.live-v')) return;
      const live=[]; let n=6; ['risk','budget'].forEach(k=>{ if(S.doc.fill[k]){ n++; live.push(['v'+n,({risk:'раздел 5 · риски',budget:'раздел 6 · бюджет'}[k])+' — '+(S.doc.fill[k]==='self'?'заполнен вами':'заполнен оркестратором'),'сегодня']); } }); if(S.doc.signed){ n++; live.push(['v'+n,'переход подписан · стадия закрыта','вы · '+hhmm(S.doc.signed)]); }
      if(!live.length) return; live.reverse(); first.insertAdjacentHTML('beforebegin',live.map((v,i)=>'<div class="vrow live-v"><b>'+v[0]+'</b><span>'+v[1]+'</span><span class="m">'+v[2]+'</span><span>'+(i===0?'<span class="pill acc">текущая</span>':'<span class="btn sm ghost">Открыть</span>')+'</span></div>').join(''));
      const old=inner.querySelector('.vrow:not(.live-v) .pill.acc'); if(old) old.outerHTML='<span class="btn sm ghost">Открыть</span>'; const h=inner.querySelector('.ch h3'); if(h) h.textContent='Версии документа · '+(n+1); },60));
    document.addEventListener('click',e=>{if(H.on)return; const b=e.target.closest('.panel .vrow .btn'); if(!b) return; const row=b.closest('.vrow'), v=row.querySelector('b').textContent, nx=row.nextElementSibling, was=nx&&nx.classList.contains('live-vd'); document.querySelectorAll('.live-vd').forEach(x=>x.remove()); if(was) return;
      const cmp=/^Сравнить/.test(b.textContent.trim()), what=row.children[1].textContent;
      row.insertAdjacentHTML('afterend','<div class="blk live-vd" style="margin:6px 0 10px">'+(cmp?'<div class="t"><span>чем '+v+' отличается от v6</span><span>3 изменения</span></div><ul><li><b>+ раздел 5 · Риски:</b> добавлены риски 1–3</li><li><b>+ раздел 6 · Бюджет:</b> внесён факт — 14,2 % недели Claude и 31 $ Codex</li><li><b>~ раздел 3 · Состав блоков:</b> 87 задач, без изменений</li></ul>':'<div class="t"><span>версия '+v+'</span><span>только описание</span></div><p>'+esc(what)+'. В прототипе у прошлых версий хранится описание; полный текст есть у текущей.</p>')+'</div>'); },true);
  }

  // ══ НАСТРОЙКИ: элементы и подтверждения принадлежат set.js ══
  // ══ ПЕРВЫЙ ЗАПУСК: выбор запоминается, первый вопрос уходит в чат ══
  // TS-15f: the sketch's three steps share the bound conversation/team operations.
  const FIRST={project:null,confirmed:0,model:null,vendor:null,folder:true,busy:false,operation:0,controller:null,door:null,missing:null,sending:false};
  const firstRoot=()=>PAGE==='first'?document.querySelector('.fr'):null;
  const FIRST_MODELS={rows:null,binding:null,request:0,error:'',events:null,alive:true,checking:null,selection:0};
  const firstMode=()=>FIRST.folder&&!H.noProject?'read':'chat';
  function firstSupport(vendor){const row=(FIRST_MODELS.rows||[]).find(p=>p.id===vendor),cap=H.turnModes&&H.turnModes[vendor]&&H.turnModes[vendor][firstMode()];
    if(row&&(row.installed===null||row.checking))return {ok:false,reason:'проверяется…'};
    if(row&&row.installed===false)return {ok:false,reason:'программа не установлена'};
    if(['region','blocked','offline','unresponsive'].includes(row?.login?.failure))return {ok:false,reason:'проверка входа не прошла'};
    return cap&&cap.ok===true?{ok:true,note:typeof cap.note==='string'?cap.note:''}:{ok:false,reason:cap&&typeof cap.reason==='string'&&cap.reason?cap.reason:'движок не сообщил поддержку режима'};
  }
  function firstModels(){return Object.entries(H.models||{}).flatMap(([vendor,models])=>Array.isArray(models)?models.filter(m=>m&&typeof m.id==='string'&&m.id).map(m=>({...m,vendor})):[])}
  const firstSelected=()=>firstModels().find(m=>m.id===FIRST.model&&m.vendor===FIRST.vendor);
  function firstPrograms(){return [...new Set([...Object.keys(H.models||{}),...(FIRST_MODELS.rows||[]).map(p=>p.id)])].map(id=>{
    const row=(FIRST_MODELS.rows||[]).find(p=>p.id===id);return {...row,id,title:row?row.title:id,kind:row?row.kind:null,reason:row&&row.modelsReason||'',models:firstModels().filter(m=>m.vendor===id)};
  })}
  async function firstCatalog(){if(!FIRST_MODELS.alive||!H.on||H.snapshotOnly||leftPage)return;
    const binding=FIRST_MODELS.binding=sendBinding(),request=++FIRST_MODELS.request;FIRST_MODELS.error='';let response;
    try{response=await api('/api/providers/catalog')}catch{}
    if(!FIRST_MODELS.alive||request!==FIRST_MODELS.request||!bindingCurrent(binding))return;
    const rows=response&&response.ok!==false&&response.providers,ids=new Set(),safe=v=>typeof v==='string'&&v.trim()&&v.length<=256&&!/[\x00-\x1f\x7f]/.test(v);
    if(!Array.isArray(rows)||rows.some(p=>!p||!safe(p.id)||ids.has(p.id)||!safe(p.title)||!['subscription','apikey','local'].includes(p.kind)||p.installed!==null&&typeof p.installed!=='boolean'||typeof p.checking!=='boolean'||!ids.add(p.id))){FIRST_MODELS.error='Каталог программ не прочитан · '+(response&&response.error||'нет связи');firstDraw();return}
    FIRST_MODELS.rows=rows.map(p=>({id:p.id,title:p.title,kind:p.kind,installed:p.installed,checking:p.checking,login:p.login,modelsReason:typeof p.modelsReason==='string'?p.modelsReason:''}));firstDraw();
    const modes=JSON.stringify([H.models,H.turnModes]);let status;try{status=await api('/api/status')}catch{}
    if(!FIRST_MODELS.alive||request!==FIRST_MODELS.request||!bindingCurrent(binding)||modes!==JSON.stringify([H.models,H.turnModes]))return;
    if(status&&status.project===binding.project&&Array.isArray(status.panes)&&status.models&&typeof status.models==='object'&&!Array.isArray(status.models)){H.models=status.models;H.turnModes=status.turnModes||{}}else FIRST_MODELS.error='Не удалось обновить статус моделей';firstDraw();
  }
  function firstModelsSync(){if(!FIRST_MODELS.alive)return;if(!H.on||H.snapshotOnly||leftPage){firstDraw();return}
    if(!FIRST_MODELS.events&&typeof subscribeLiveEvents==='function')FIRST_MODELS.events=subscribeLiveEvents(event=>{let value;try{value=JSON.parse(event.data)}catch{return}if(value.type==='providers'&&(!value.project||value.project===H.project))void firstCatalog()});
    if(H.on&&!H.snapshotOnly&&(!FIRST_MODELS.binding||!bindingCurrent(FIRST_MODELS.binding))){FIRST_MODELS.rows=null;void firstCatalog()}firstDraw();
  }
  function firstModelCards(models,live,orch){const root=firstRoot(),original=[...root.querySelectorAll('[data-first-vendor]')],programs=firstPrograms(),used=new Set();
    original.forEach((card,index)=>{const row=programs.find(p=>!used.has(p.id)&&(index===0?p.id==='claude':index===1?p.id==='codex':index===2?p.kind==='apikey':p.kind==='local'));if(row)used.add(row.id);card.__program=row||null});
    const extras=programs.filter(p=>!used.has(p.id)),container=original[0].parentElement;
    root.querySelectorAll('[data-first-extra]').forEach(card=>{if(!extras.some(p=>p.id===card.dataset.firstProgram))card.remove()});
    for(const row of extras){let card=[...root.querySelectorAll('[data-first-extra]')].find(card=>card.dataset.firstProgram===row.id);if(!card){card=document.createElement('label');card.className='pick';card.setAttribute('data-first-extra','');card.setAttribute('role','button');card.setAttribute('tabindex','0');card.innerHTML='<span data-first-title></span><small></small><select data-first-model></select>';container.insertBefore(card,container.querySelector('.ft'))}card.__program=row}
    for(const card of [...original,...root.querySelectorAll('[data-first-extra]')]){const row=card.__program,select=card.querySelector('select'),title=card.querySelector('[data-first-title]');
      card.setAttribute('data-first-program',row?row.id:'');if(row)title.textContent=row.title;else title.textContent=card.__title;
      const support=row?firstSupport(row.id):{ok:false,reason:'нет данных · подключите модель в «Подключениях»'},rows=row?models.filter(m=>m.vendor===row.id):[];
      const html='<option value="">Выберите модель</option>'+rows.map(m=>'<option value="'+esc(m.id)+'"'+(!support.ok?' disabled':'')+'>'+esc(m.label||m.id)+(support.reason||support.note?' · '+esc(support.reason||support.note):'')+'</option>').join('');if(select.innerHTML!==html)select.innerHTML=html;
      select.setAttribute('aria-label','Модель · '+title.textContent);select.value=row&&row.id===FIRST.vendor&&rows.some(m=>m.id===FIRST.model)?FIRST.model:'';select.disabled=!live||!rows.length||FIRST.busy;select.hidden=false;card.classList.toggle('on',!!select.value);
      card.querySelector('small').textContent=!live?'макет · движок не подключён':!support.ok?support.reason:rows.length?row.title+(row.subtitle?' · '+row.subtitle:'')+' · моделей: '+rows.length+(support.note?' · '+support.note:''):'нет данных'+(row&&row.reason?' · '+row.reason:' · подключите модель в «Подключениях»');
    }
    for(const card of [...original,...root.querySelectorAll('[data-first-extra]')]){let recovery=card.querySelector('[data-first-login]');if(!recovery){recovery=document.createElement('div');recovery.setAttribute('data-first-login','');card.appendChild(recovery)}const html=window.LIVE?.loginRecovery?.html(card.__program,{check:true,busy:!!FIRST_MODELS.checking})||'';if(recovery.innerHTML!==html)recovery.innerHTML=html;}
    const error=root.querySelector('[data-first-model-error]');error.hidden=!FIRST_MODELS.error;error.querySelector('span').textContent=FIRST_MODELS.error;
  }
  async function firstCheckLogin(id){if(FIRST_MODELS.checking||!FIRST_MODELS.alive)return;const binding=sendBinding(),selection=FIRST_MODELS.selection;const job=FIRST_MODELS.checking={id};firstDraw();
    try{const r=await api('/api/providers/'+encodeURIComponent(id)+'/check',{});if(!FIRST_MODELS.alive||!bindingCurrent(binding)||selection!==FIRST_MODELS.selection)return;if(!r?.ok){FIRST_MODELS.error='Не удалось проверить вход. '+(typeof r?.error==='string'?r.error:'Повторите проверку.');return}await firstCatalog()}
    catch{if(FIRST_MODELS.alive&&bindingCurrent(binding))FIRST_MODELS.error='Не удалось проверить вход. Повторите проверку.'}
    finally{if(FIRST_MODELS.checking===job)FIRST_MODELS.checking=null;firstDraw()}
  }
  const firstOperationCurrent=operation=>operation===FIRST.operation&&!leftPage;
  function firstBeginOperation(){FIRST.controller?.abort();FIRST.controller=typeof AbortController==='function'?new AbortController():null;return ++FIRST.operation}
  function firstRequestOperation(operation){return firstOperationCurrent(operation)&&FIRST.controller?{signal:FIRST.controller.signal}:undefined}
  function firstCancelOperation(){FIRST.operation++;FIRST.controller?.abort();FIRST.controller=null;FIRST.busy=false;invalidateBinding()}
  function firstSelectPane(){const id='room';if(S.ui.pane!==id){invalidateBinding();S.ui.pane=id;S.chat=[];H.cur=null;save()}pickPane()}
  function firstGo(n){const root=firstRoot();if(!root||leftPage)return;FIRST_MODELS.selection++;root.scrollTop=0;firstDraw();root.querySelectorAll('.st[data-s]').forEach(el=>el.classList.toggle('on',el.dataset.s===String(n)));root.querySelectorAll('#steps i').forEach((el,i)=>el.classList.toggle('on',i<n));operationsDraw()}
  function firstDraw(){const root=firstRoot();if(!root||leftPage)return;const live=H.on&&!H.snapshotOnly;
    if(FIRST.project!==H.project||FIRST.confirmed!==(H.confirmedProjectGeneration||0)){if(FIRST.project){root.querySelectorAll('.st[data-s]').forEach(el=>el.classList.toggle('on',el.dataset.s==='1'));root.querySelectorAll('#steps i').forEach((el,i)=>el.classList.toggle('on',i===0));const draft=root.querySelector('.live-in');if(draft)draft.value='';}FIRST.project=H.project;FIRST.confirmed=H.confirmedProjectGeneration||0;FIRST.model=null;FIRST.vendor=null;FIRST.folder=!H.noProject;FIRST.door=null;FIRST.missing=null;root.querySelector('[data-first-door]').innerHTML='';}
    const models=firstModels();
    if(!firstSelected()){const preferred=H.pane,chosen=models.find(m=>m.id===preferred?.model&&m.vendor===preferred?.vendor)||models.find(m=>firstSupport(m.vendor).ok);FIRST.model=chosen?.id||null;FIRST.vendor=chosen?.vendor||null;}
    const places=root.querySelectorAll('.st[data-s="1"] .pick');places.forEach((el,i)=>el.classList.toggle('on',i===0?FIRST.folder:!FIRST.folder));
    if(places[0])places[0].querySelector('small').textContent=live?(H.noProject?'Выберите или создайте папку проекта':H.project):'макет · движок не подключён';
    firstModelCards(models,live,null);
    const kb=root.querySelectorAll('.st[data-s="3"] .kv b');if(live){kb[0].textContent=H.noProject?'комната без проекта':H.project;kb[1].textContent=modelName(FIRST.model);kb[2].textContent='≈ 0,05 % недели · макет: прогноз первого хода не подключён';kb[3].textContent='ответ в чате; оркестратора можно назначить позже'}
    const connect=root.querySelector('[data-first-connect]');if(connect){const blocked=FIRST.busy||live&&(!firstSelected()||!firstSupport(FIRST.vendor).ok);connect.disabled=blocked;connect.setAttribute('aria-disabled',String(blocked))}
    const send=root.querySelector('[data-first-send]');if(send){send.disabled=FIRST.sending||FIRST.busy||live&&(!H.pane||!H.pane.model);send.setAttribute('aria-disabled',String(send.disabled))}
    if(FIRST.missing&&!bindingCurrent(FIRST.missing.binding)){FIRST.missing=null;root.querySelector('[data-first-door]').innerHTML=''}
    if(FIRST.door&&(!bindingCurrent(FIRST.door.binding)||FIRST.door.model!==FIRST.model||FIRST.door.vendor!==FIRST.vendor||FIRST.door.folder!==FIRST.folder||!firstSupport(FIRST.door.vendor).ok)){FIRST.door=null;root.querySelector('[data-first-door]').innerHTML=''}
  }
  async function firstChatMissing(binding,pending){
    const list=await api('/api/chats');if(leftPage||!bindingCurrent(binding)||S.firstRoomCreations?.[binding.project]!==pending)return false;
    if(!list||list.ok===false||!Array.isArray(list.chats)||!list.active||typeof list.active!=='object'||Array.isArray(list.active)||list.chats.some(c=>!c||typeof c.id!=='string'||typeof c.pane!=='string'))throw Error('Не удалось прочитать созданный разговор');
    if((list.active.room||null)!==binding.chat)throw Error('Разговор изменился; повторите выбор');
    return !list.chats.some(c=>c.id===pending.chat);
  }
  async function firstRestart(){const missing=FIRST.missing;if(FIRST.busy||!missing||leftPage||!H.on||H.snapshotOnly||!bindingCurrent(missing.binding)||S.firstRoomCreations?.[missing.binding.project]!==missing.pending)return;const operation=firstBeginOperation();FIRST.busy=true;let restart=false;
    try{if(!await refreshStatus())throw Error('Не удалось прочитать состояние проекта');if(!firstOperationCurrent(operation)||!bindingCurrent(missing.binding))return;
      const absent=await firstChatMissing(missing.binding,missing.pending);if(!firstOperationCurrent(operation))return;
      if(!absent){toast('Разговор изменился; повторите выбор');return}
      delete S.firstRoomCreations[missing.binding.project];save();FIRST.missing=null;firstRoot().querySelector('[data-first-door]').innerHTML='';restart=true;
    }catch(error){if(firstOperationCurrent(operation)&&H.project===missing.binding.project)toast(esc(error.message))}finally{if(firstOperationCurrent(operation)){FIRST.busy=false;firstDraw()}}
    if(restart&&firstOperationCurrent(operation))await firstNext();
  }
  function firstFailure(message){const root=firstRoot();FIRST.failure=message;if(!root)return;root.querySelector('[data-first-door]').innerHTML='<div class="done first-failure" role="alert"><b>Подключение не удалось</b><p>'+esc(message||'Причина не установлена. Попробуйте позже.')+'</p><div class="ft"><button class="btn ghost" type="button" data-go="1">← Назад</button><button class="btn" type="button" data-first-simple>Просто чат</button></div></div>'}
  function firstSimpleChat(){firstCancelOperation();S.ui.pane='room';S.ui.fresh=true;S.ui.switched=false;save();location.href='10-new-chat.html'}
  function firstBack(){firstCancelOperation();if(globalThis.history&&history.length>1)history.back();else location.href='20-login-pour.html'}
  async function firstNext(){if(FIRST.busy||leftPage)return;const operation=firstBeginOperation();firstSelectPane();firstDraw();const root=firstRoot();if(!H.on||H.snapshotOnly){firstGo(3);return}
    if(!firstSelected()||!firstSupport(FIRST.vendor).ok){firstFailure(firstSelected()?firstSupport(FIRST.vendor).reason:'Сначала выберите модель');return false}
    let binding=sendBinding(),pending;
    try{const entries=S.firstRoomCreations;if(entries!==undefined&&(!entries||typeof entries!=='object'||Array.isArray(entries)))throw Error('Не удалось прочитать созданный разговор');const exists=entries&&Object.hasOwn(entries,binding.project);pending=exists?entries[binding.project]:null;
      if(exists&&(!pending||!pending.binding||pending.binding.project!==binding.project||pending.binding.pane!=='room'||pending.binding.chat!==null||typeof pending.chat!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(pending.chat)))throw Error('Не удалось прочитать созданный разговор');
    }catch(error){firstFailure(error.message);return false}
    FIRST.failure=null;FIRST.door=null;FIRST.missing=null;root.querySelector('[data-first-door]').innerHTML='';
    if(pending||!binding.chat){const model=FIRST.model,vendor=FIRST.vendor,folder=FIRST.folder,navigation=bindingNavigation;FIRST.busy=true;
      try{if(!pending){const r=await api('/api/chats/new',{pane:'room',carry:'none'},firstRequestOperation(operation));if(!r||!r.ok||typeof r.chat?.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(r.chat.id)||r.chat.pane!=='room')throw Error(r&&r.error||'Не удалось открыть разговор');
          if(!firstOperationCurrent(operation)||!bindingCurrent(binding))return false;
          pending={binding:{project:binding.project,pane:binding.pane,chat:binding.chat},chat:r.chat.id};S.firstRoomCreations=S.firstRoomCreations||{};S.firstRoomCreations[binding.project]=pending;save();
        }
        if(!await refreshStatus())throw Error('Не удалось прочитать состояние проекта');const current=sendBinding();if(!firstOperationCurrent(operation)||bindingNavigation!==navigation||current.project!==binding.project||current.pane!==binding.pane)return;
        if(current.chat!==pending.chat){if(current.chat){delete S.firstRoomCreations[binding.project];save()}else {const absent=await firstChatMissing(current,pending);if(!firstOperationCurrent(operation))return false;if(absent){
            FIRST.missing={binding:current,pending};root.querySelector('[data-first-door]').innerHTML='<div class="done" role="status"><b>Разговор не найден</b><p>Сохранённого разговора больше нет в проекте. Начните заново, чтобы создать новый разговор.</p><button class="btn p" type="button" data-first-restart>Начать заново</button><button class="btn ghost" type="button" data-go="1">← Назад</button><button class="btn" type="button" data-first-simple>Просто чат</button></div>';return false;
          }}toast('Разговор изменился; повторите выбор');return}
        delete S.firstRoomCreations[binding.project];save();if(FIRST.model!==model||FIRST.vendor!==vendor||FIRST.folder!==folder||!firstSupport(vendor).ok){toast('Выбор модели изменился; повторите выбор');return}binding=current;
      }catch(error){if(firstOperationCurrent(operation)&&H.project===binding.project)firstFailure(error.message);return false}finally{if(firstOperationCurrent(operation)){FIRST.busy=false;firstDraw()}}
    }
    if(!firstOperationCurrent(operation))return false;
    const choice={binding,model:FIRST.model,vendor:FIRST.vendor,folder:FIRST.folder};FIRST.busy=true;firstDraw();
    try{const response=await api('/api/room',{vendor:choice.vendor,model:choice.model,folder:choice.folder},firstRequestOperation(operation));if(!firstOperationCurrent(operation)||!bindingCurrent(choice.binding))return false;if(!response||!response.ok)throw Error(response&&response.error||'Модель не подключена');
      if(!await refreshStatus())throw Error('Не удалось прочитать состояние проекта');const current=sendBinding();if(!firstOperationCurrent(operation)||current.project!==choice.binding.project||current.pane!=='room'||current.chat!==choice.binding.chat)return false;
      if(!H.pane||H.pane.id!=='room'||H.pane.model!==choice.model||H.pane.vendor!==choice.vendor||!firstSupport(choice.vendor).ok)throw Error('Настройка модели изменилась; повторите выбор');
      FIRST.failure=null;root.querySelector('[data-first-door]').innerHTML='';await loadChat({onboard:false,visible:true});if(!firstOperationCurrent(operation)||!bindingCurrent(current))return false;firstGo(3);return true;
    }catch(error){if(firstOperationCurrent(operation)&&H.project===choice.binding.project)firstFailure(error.message);return false}
    finally{if(firstOperationCurrent(operation)){FIRST.busy=false;firstDraw()}}
  }
  async function firstSend(team=false){if(FIRST.sending||FIRST.busy||leftPage||!H.on||H.snapshotOnly)return false;const root=firstRoot(),input=root.querySelector('.live-in'),binding=sendBinding();
    if(!H.pane||!H.pane.model){toast('Сначала выберите модель');return false}const text=input.value.trim();if(!text){input.focus();return false}FIRST.sending=true;firstDraw();
    try{return await onSend(text,input,binding)}finally{FIRST.sending=false;firstDraw()}
  }
  if(PAGE==='first'){
    const root=firstRoot(),s2=root.querySelector('.st[data-s="2"]'),s3=root.querySelector('.st[data-s="3"]'),input=s3.querySelector('.in');delete S.first;if(S.pending){const pending=S.pending;S.draft=pending.text;attachmentRestore(pending.key||attachmentKey(pending.target),attachmentPendingRefs(pending));S.pending=null;save()}
    root.querySelector('.st[data-s="1"] .pick').setAttribute('data-cx','folder');
    s2.querySelector('h2').textContent='Что у вас есть';s2.querySelector('p').textContent='Выберите найденную модель или продолжайте без неё — подключить можно позже.';
    s2.querySelectorAll('.pick').forEach((el,i)=>{el.setAttribute('data-first-vendor',String(i));el.__title=el.firstChild.textContent;el.firstChild.textContent='';const title=document.createElement('span');title.setAttribute('data-first-title','');title.textContent=el.__title;el.insertBefore(title,el.firstChild);const select=document.createElement('select');select.setAttribute('data-first-model','');el.appendChild(select)});
    s2.insertAdjacentHTML('beforeend','<p data-first-model-error role="status" hidden><span></span> <button type="button" class="btn sm ghost" data-first-model-retry>Повторить</button></p><p><a href="11-connections.html">Подключения →</a></p><div data-first-door></div>');
    input.innerHTML='<input class="live-in" aria-label="Первый вопрос" placeholder="Написать…" value="Посмотри проект и скажи, что мешает первому запуску"><span class="k">⏎</span>';
    s3.insertAdjacentHTML('beforeend','<div class="feed"><div class="col"></div></div>');
    s3.querySelector('p').textContent='Первый вопрос уйдёт выбранной модели. Оркестратора можно назначить позже из чата.';
    root.querySelectorAll('[data-go], [data-first-simple], [data-first-connect], [data-first-send], [data-first-back], .pick').forEach(el=>{el.setAttribute('tabindex','0');el.setAttribute('role','button')});
    root.addEventListener('keydown',e=>{if(e.target.closest('[data-first-model]'))return;if(e.target===input.querySelector('input')&&e.key==='Enter'&&!e.isComposing){e.preventDefault();void firstSend();return}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-go], [data-first-simple], [data-first-connect], [data-first-send], [data-first-back], .pick')){e.preventDefault();e.target.click()}});
    root.addEventListener('change',e=>{const select=e.target.closest('[data-first-model]');if(!select||select.disabled)return;const card=select.closest('[data-first-program]');if(!card)return;const vendor=card.dataset.firstProgram,model=firstModels().find(m=>m.vendor===vendor&&m.id===select.value);if(!model||!firstSupport(vendor).ok){firstDraw();return}FIRST_MODELS.selection++;FIRST.model=model.id;FIRST.vendor=vendor;firstDraw()});
    document.addEventListener('click',async e=>{const target=e.target;if(!root.contains(target))return;
      const recovery=target.closest('[data-login-connect],[data-login-other],[data-login-check]');
      if(recovery){e.preventDefault();e.stopImmediatePropagation();if(recovery.disabled||FIRST.busy)return;const id=recovery.dataset.loginConnect||recovery.dataset.loginOther||recovery.dataset.loginCheck,row=firstPrograms().find(p=>p.id===id);if(!row)return;
        if(recovery.hasAttribute('data-login-check')){void firstCheckLogin(id);return}
        if(recovery.hasAttribute('data-login-other')){FIRST_MODELS.selection++;FIRST.door=null;const alternative=[...root.querySelectorAll('[data-first-model]')].find(n=>n.closest('[data-first-program]')?.dataset.firstProgram!==id&&!n.disabled);if(alternative){alternative.focus();alternative.scrollIntoView?.({block:'nearest'})}else location.href='11-connections.html';return}
        const b=sendBinding(),selection=FIRST_MODELS.selection,account=row.login?.account;
        window.LIVE?.loginRecovery?.open(row,{current:()=>FIRST_MODELS.alive&&bindingCurrent(b)&&selection===FIRST_MODELS.selection&&firstPrograms().find(p=>p.id===id)?.login?.account===account&&!!root.querySelector('.st[data-s="2"].on'),recheck:()=>firstCheckLogin(id)});return;
      }
      if(target.closest('[data-first-model-retry]')){e.preventDefault();e.stopImmediatePropagation();void firstCatalog();return}
      if(target.closest('[data-first-model]')){e.stopPropagation();return}
      const restart=target.closest('[data-first-restart]'),g=target.closest('[data-go]'),connect=target.closest('[data-first-connect]'),simple=target.closest('[data-first-simple]'),send=target.closest('[data-first-send]'),back=target.closest('[data-first-back]');
      if(restart||g||connect||simple||send||back){e.preventDefault();e.stopImmediatePropagation();const destination=g&&Number(g.dataset.go),source=Number(target.closest('.st[data-s]')?.dataset.s);if(simple){firstSimpleChat();return}if(back){firstBack();return}if(g&&Number.isFinite(destination)&&Number.isFinite(source)&&destination<source){firstCancelOperation();firstGo(destination);return}if(FIRST.busy||target.closest('button')?.disabled)return;
        if(restart){await firstRestart();return}if(connect){await firstNext();return}if(send){await firstSend();return}
        if(g.dataset.go==='2')firstSelectPane();firstGo(Number(g.dataset.go));return;
      }
      const place=target.closest('.st[data-s="1"] .pick');if(place){FIRST.folder=!!place.getAttribute('data-cx');firstDraw()}
    },true);
    addEventListener('live:status',firstModelsSync);addEventListener('pagehide',()=>{FIRST.operation++;FIRST.controller?.abort();FIRST.controller=null;FIRST.busy=false;FIRST_MODELS.alive=false;FIRST_MODELS.request++;FIRST_MODELS.events?.close();FIRST_MODELS.events=null;FIRST_MODELS.binding=null;FIRST.door=null;FIRST.missing=null;root.querySelector('[data-first-door]').innerHTML=''});addEventListener('pageshow',event=>{if(event.persisted){FIRST_MODELS.alive=true;FIRST_MODELS.binding=null;FIRST_MODELS.request++}});firstSelectPane();firstModelsSync();
  }
  // End TS-15f first run.

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
  const PROJ_ITEMS=[['doc','Документы проекта'],['art','Артефакты'],['mem','Память проекта'],['res','Ресёрч']];   // относятся к папке проекта — лежат внутри раскрытой папки
  const ico=k=>window.psIcon?window.psIcon(k):'';
  const PROJECT_FOLD_KEY='harnessy-project-fold:';
  function projectExpanded(project){try{const value=localStorage.getItem(PROJECT_FOLD_KEY+project.path);if(value==='1'||value==='0')return value==='1'}catch(e){}return !!project.current}
  function projectFolder(project,projectHTML,chatsHTML,pinBtn){const current=!!project.current,open=projectExpanded(project),path=esc(project.path);
    return '<div class="ps-folder pinnable'+(current?' cur':'')+'" data-folder="'+path+'" data-cur="'+(current?1:0)+'" title="'+path+'"><button type="button" class="chev" data-folder-toggle="'+path+'" aria-expanded="'+open+'" aria-label="Свернуть или развернуть проект '+esc(project.name)+'">'+(open?'⌄':'›')+'</button>'+ico('folder')+'<span class="t">'+esc(project.name)+'</span><span class="m">'+(project.seats==null?'':project.seats+' '+pl(project.seats,'роль','роли','ролей'))+(project.git?' · git':'')+'</span>'+pinBtn('folder',project.path)+'</div><div class="ps-fold-body"'+(open?'':' style="display:none"')+'>'+(current?projectHTML+chatsHTML:'<div class="ps-chat more">Откройте проект, чтобы увидеть его чаты</div>')+'</div>'}
  function toggleProjectFolder(path){const project=(H.projects||[]).find(project=>project.path===path);if(!project)return;const open=!projectExpanded(project);try{localStorage.setItem(PROJECT_FOLD_KEY+path,open?'1':'0')}catch(e){}
    document.querySelectorAll('.ps-folder[data-folder]').forEach(row=>{if(row.dataset.folder!==path)return;const button=row.querySelector('[data-folder-toggle]');if(button){button.textContent=open?'⌄':'›';button.setAttribute('aria-expanded',String(open))}const body=row.nextElementSibling;if(body&&body.classList.contains('ps-fold-body'))body.style.display=open?'':'none'})}
  let sideGeneration=0;
  const pinJobs=new Set(),pinIdentity=(kind,path,chat)=>JSON.stringify([kind,path,kind==='chat'?chat:'']);
  async function sideChats(preview=false){ if(!H.on||H.snapshotOnly&&!preview) return; const project=H.project,generation=++sideGeneration,current=()=>H.project===project&&sideGeneration===generation;let r=null; try{ r=preview?{chats:H.chatList||[]}:await api('/api/chats'); }catch(e){} if(!current()||!r||!Array.isArray(r.chats)) return; const all=r.chats;
    if(!H.projects){ try{ const pr=preview?{projects:[{path:project,name:base(project),current:true,seats:H.panes.filter(p=>p.id!=='room').length}]}:await api('/api/projects');if(!current())return; H.projects=(pr.projects||[]).filter(p=>p.path!==H.defaultDir); H.homeHint=(pr.current||'').replace(/\/[^/]*$/,'/'); }catch(e){if(!current())return; H.projects=[]; } }
    let pins=(H.pins||[]).map(p=>({...p,current:p.path===project})),pinError='';try{const reply=preview?{pins}:await api('/api/pins');if(!reply||!Array.isArray(reply.pins)||reply.pins.some(p=>!p||!['folder','chat'].includes(p.kind)||typeof p.path!=='string'||typeof p.current!=='boolean'||p.kind==='chat'&&typeof p.chat!=='string'))throw Error(reply&&reply.error||'некорректный ответ');pins=reply.pins}catch(e){pinError='Закрепления не прочитаны: '+e.message}
    if(!current())return;H.pins=pins;H.chatList=r.chats;if(window.HARNESS_BOOT)rememberLive();
    if(!preview&&S.ui.openChat){ const id=S.ui.openChat; S.ui.openChat=null; save(); if(all.some(c=>c.id===id)){ await openChatRow(id,null); return; } }   // после смены папки — открыть закреплённый чат
    const seats=(H.panes||[]).filter(p=>p.id!=='room'), rooms=all.filter(c=>c.pane==='room').sort((a,b)=>(b.last||0)-(a.last||0)), cur=H.project||'';
    const pinned=(kind,path,chat)=>pins.some(p=>p.kind===kind&&(path===cur?p.current:p.path===path)&&(kind!=='chat'||p.chat===chat));   // пути не сравниваем строкой — у движка флаг current (realpath)
    const pinBtn=(kind,path,chat)=>'<button type="button" class="ps-pin'+(pinned(kind,path,chat)?' on':'')+'" data-pin-toggle="'+kind+'" data-path="'+esc(path)+'"'+(chat?' data-chat-id="'+esc(chat)+'"':'')+' data-pin-on="'+(pinned(kind,path,chat)?'0':'1')+'"'+(pinError?' disabled':'')+' aria-label="'+(pinned(kind,path,chat)?'Снять закрепление':'Закрепить')+'" title="'+(pinned(kind,path,chat)?'Снять закрепление':'Закрепить')+'">'+PIN+'</button>';
    // Только сохранённые разговоры и реально созданные места, включая пустые чаты и историю ролей.
    const roleRow=(p,c)=>{const active=!c||c.active;
      return '<div class="ps-chat role pinnable'+(c&&c.active?' act':'')+(p.busy&&active?' busy':'')+'" data-chat="'+(c?c.id:'')+'" data-pane="'+p.id+'" title="'+esc(paneName(p))+' · '+esc(c?(c.title||'разговор ещё пуст'):'разговор ещё пуст')+(c&&c.closed?' · закрыт':'')+'"><i></i><span class="t">'+esc(paneName(p))+'</span><span class="s">'+esc(p.waiting&&active?'ждёт решения':(c&&c.closed?'закрыт · ':'')+(c&&c.title||'разговор ещё пуст'))+'</span>'+(c?pinBtn('chat',cur,c.id):'')+'</div>'; };
    const roomRow=c=>{ const room=H.panes.find(p=>p.id==='room'); return '<div class="ps-chat pinnable'+(c.active?' act':'')+'" data-chat="'+c.id+'" data-pane="room" title="'+esc(c.title||'без названия')+' · без роли"><i></i><span class="s one">'+esc(c.active&&room&&room.waiting?'ждёт решения':c.title||'без названия')+'</span>'+pinBtn('chat',cur,c.id)+'</div>'; };
    const shown=rooms.slice(0,5);
    const waitingRoom=H.panes.find(p=>p.id==='room'&&p.waiting),roomDoor=waitingRoom&&!shown.some(c=>c.active)?'<div class="ps-chat" data-chat="" data-pane="room"><i></i><span class="t">Без роли</span><span class="s">ждёт решения</span></div>':'';
    const chatsHTML=seats.map(p=>{const chats=all.filter(c=>c.pane===p.id);return chats.length?chats.map(c=>roleRow(p,c)).join(''):roleRow(p,null)}).join('')+(seats.length&&rooms.length?'<div class="ps-chat hdr">без роли</div>':'')+shown.map(roomRow).join('')
      +roomDoor+'<div class="ps-chat" data-new-room>＋ чат без роли</div>'+(rooms.length>shown.length?'<div class="ps-chat more">ещё '+(rooms.length-shown.length)+' — в списке чатов у поля ввода</div>':'')+(seats.length||rooms.length||waitingRoom?'':'<div class="ps-chat more">в проекте пока нет ролей и чатов</div>');
    const projHTML=PROJ_ITEMS.map(([k,t])=>'<div class="nav psub'+(window.psKey===k?' on':'')+'" data-go="'+k+'" title="'+t+'">'+ico(k)+'<span class="t">'+t+'</span></div>').join('');
    const folderRow=pr=>projectFolder(pr,projHTML,chatsHTML,pinBtn);
    const pinRow=p=>p.kind==='folder'?'<div class="ps-chat pin'+(p.current?' act':'')+'" data-pin-folder="'+esc(p.path)+'" data-cur="'+(p.current?1:0)+'" title="'+esc(p.path)+'"><i></i><span class="t">'+esc(p.name)+'</span><span class="m">проект</span>'+pinBtn('folder',p.path)+'</div>'
      :'<div class="ps-chat pin'+(p.current&&all.some(c=>c.id===p.chat&&c.active)?' act':'')+'" data-pin-chat="'+esc(p.chat)+'" data-pin-path="'+esc(p.path)+'" data-cur="'+(p.current?1:0)+'" title="'+esc(p.title||'без названия')+' · '+esc(p.label||'')+(p.current?'':' · '+esc(p.name))+'"><i></i><span class="s one">'+esc(p.title||'без названия')+'</span><span class="m">'+esc(p.label||'')+(p.current?'':' · '+esc(p.name))+'</span>'+pinBtn('chat',p.path,p.chat)+'</div>';
    document.querySelectorAll('aside.side.ps .nav[data-go="chat"] .m').forEach(m=>m.textContent=all.length||'');
    // честная панель при подключённом движке (Kimi UX-5 №129): квот подписок движок не отдаёт — без выдуманных процентов; план — демо; «Новый чат» — без роли
    limitsDraw();
    document.querySelectorAll('aside.side.ps .nav[data-go="plan"]').forEach(n=>{ const m=n.querySelector('.m'); if(m) m.textContent='демо'; n.title='План · карта — демо-полотно, живого плана в движке пока нет'; });
    document.querySelectorAll('aside.side.ps .newbtn[data-go="new"], aside.side.ps .logo[data-go="new"]').forEach(b=>b.title='Новый разговор без роли (стартовый экран). Новый чат с ролью — чип «чат» у поля ввода');
    document.querySelectorAll('aside.side.ps .ps-pins').forEach(box=>{ box.innerHTML=(pinError?'<div class="ps-chat more" role="status">'+esc(pinError)+' <button class="btn sm" data-pins-refresh>Повторить</button></div>':'')+(pins.map(pinRow).join('')||(!pinError?'<div class="ps-chat more">закреплённых пока нет</div>':'')); });
    document.querySelectorAll('aside.side.ps .ps-folders').forEach(box=>{ box.innerHTML=(H.projects||[]).map(folderRow).join('')||'<div class="ps-chat more">папок пока нет</div>'; });
    document.querySelectorAll('aside.side.ps .ps-proj').forEach(b=>{ b.innerHTML=esc(cur?base(cur):'без проекта')+' <i>▾</i>'; b.title=(cur||'проект не выбран')+' — нажмите, чтобы сменить'; });
    document.querySelectorAll('.recent').forEach(rc=>{ rc.innerHTML='<span>недавние:</span>'+(all.slice(0,4).map(c=>'<span class="chip ps-chat'+(c.active?' act':'')+'" data-chat="'+c.id+'" data-pane="'+c.pane+'"><i></i>'+esc((c.title||'без названия').slice(0,38))+' <small>'+esc(c.label)+'</small></span>').join('')||'<span class="chip" style="opacity:.6">пока нет</span>'); }); }
  async function openChatRow(chatId,paneId){ invalidateBinding();const project=H.project,target=(H.panes||[]).find(p=>p.id===paneId||chatId&&(H.active||{})[p.id]===chatId),viewOnly=target&&(!chatId||(H.active||{})[target.id]===chatId);if(viewOnly)S.ui.pane=target.id;else if(chatId){ let r=null; try{ r=await api('/api/chats/open',{chat:chatId,carry:'text'}); }catch(x){} if(H.project!==project)return;if(!r||!r.ok){ toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; } S.ui.pane=r.pane.id; if(!r.already) toast('Открыт чат: '+esc((r.chat&&r.chat.title)||'без названия')+(r.carried?' · прежний чат закрыт, контекст передан текстом':'')); }   // то же, что чип чата: смена ленты не молчит (Kimi UX-5 №129 п.2)
    else S.ui.pane=paneId;   // у роли чата ещё нет — чат начнётся с вводной (движок: /api/onboard один раз)
    S.ui.fresh=false; S.ui.switched=true; save(); if(PAGE==='chat'){ await refreshStatus(); await loadChat(); sideChats(); } else location.href='01-chat.html'; }
  async function sideSwitchProject(path,openChat){ invalidateBinding();let r=null; try{ r=await api('/api/project',{path}); }catch(x){} if(!r||!r.ok){ toast('Проект не открылся: '+esc((r&&r.error)||'нет связи')); return; }
    if(S.cx){S.cx.noFolder=false;delete S.cx.noFolderPending;} S.ui.pane='room'; S.ui.fresh=true; S.ui.switched=false; S.ui.openChat=openChat||null; save(); H.projects=null; log('настройка','Проект: '+base(path)); toast('Проект: '+esc(base(path))); if(PAGE==='new') await refreshStatus(); else location.href='10-new-chat.html'; }
  document.addEventListener('click',async e=>{ const toggle=e.target.closest('[data-folder-toggle]');if(toggle&&H.on){e.preventDefault();e.stopImmediatePropagation();toggleProjectFolder(toggle.dataset.folderToggle);return}
    if(e.target.closest('[data-pins-refresh]')){e.preventDefault();e.stopImmediatePropagation();await sideChats();return}
    const pt=e.target.closest('[data-pin-toggle]'); if(pt){e.preventDefault();e.stopImmediatePropagation();const kind=pt.dataset.pinToggle,path=pt.dataset.path,chat=pt.dataset.chatId||'',on=pt.dataset.pinOn==='1',key=pinIdentity(kind,path,chat),project=H.project,generation=H.confirmedProjectGeneration||0;if(pt.disabled||pinJobs.has(key)||H.snapshotOnly)return;pinJobs.add(key);pt.setAttribute('aria-disabled','true');
      try{const r=await api('/api/pins',{kind,path,chat,on,project});if(H.project!==project||(H.confirmedProjectGeneration||0)!==generation)return;if(!r||!r.ok||r.on!==on||!Array.isArray(r.pins))throw Error(r&&r.error||'нет подтверждения');toast(on?'Закреплено':'Закрепление снято');await sideChats()}catch(error){if(H.project===project&&(H.confirmedProjectGeneration||0)===generation)toast('Не вышло: '+esc(error.message))}finally{pinJobs.delete(key);pt.removeAttribute('aria-disabled')}return; }
    const pf=e.target.closest('[data-pin-folder]'); if(pf){ e.preventDefault(); e.stopPropagation(); if(pf.dataset.cur!=='1') await sideSwitchProject(pf.dataset.pinFolder); return; }
    const pc=e.target.closest('[data-pin-chat]'); if(pc){ e.preventDefault(); e.stopPropagation(); if(pc.dataset.cur==='1') await openChatRow(pc.dataset.pinChat,null); else await sideSwitchProject(pc.dataset.pinPath,pc.dataset.pinChat); return; }
    const fr=e.target.closest('.ps-folder[data-folder]'); if(fr){ e.preventDefault(); e.stopPropagation(); await sideSwitchProject(fr.dataset.folder); return; }
    if(e.target.closest('[data-new-room]')){e.preventDefault();e.stopPropagation();invalidateBinding();const binding=sendBinding();let r=null;try{r=await api('/api/chats/new',{pane:'room',carry:'none'})}catch(x){}if(!bindingCurrent(binding))return;if(!r||!r.ok){toast('Не вышло: '+esc(r&&r.error||'нет связи'));return}H.active={...(H.active||{}),room:r.chat.id};const confirmed=sendBinding();await refreshStatus();if(!bindingCurrent(confirmed))return;await openChatRow(r.chat.id,'room');return}
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
  function restoreLiveSnapshot(){
    const boot=window.HARNESS_BOOT,snapshot=boot&&boot.snapshot();if(!snapshot)return false;
    if(applyStatus(snapshot.status,boot.capture())===false)return false;H.on=true;H.snapshotOnly=true;S.chat=[];H.chatList=snapshot.chats;H.projects=snapshot.projects;H.pins=snapshot.pins;H.active=snapshot.status.activeChats||{};
    sideChats(true);hStatus();if(cols().length)render();
    document.querySelectorAll('aside.side.ps').forEach(el=>el.setAttribute('data-live-preview',''));
    boot.preview();boot.onOffline=()=>{H.on=false;limitsDraw();if(window.CX)CX.render()};return true;
  }
  function liveFirstPaint(){if(H.connected&&window.HARNESS_BOOT)window.HARNESS_BOOT.ready()}
  // End TS-11 snapshot.
  // ── «Журнал» при подключённом движке: записи /api/journal в разметке экрана (строки .li), фильтры по видам движка, карточка записи, тред целиком, слияние принятого вердикта владельцем
  // TS-15a: journal-backed events. The stream invalidates HTTP snapshots; it is never a journal.
  const EV={project:null,generation:0,alive:true,records:[],summary:null,lastSeq:0,more:false,loading:false,error:null,queued:false,refreshQueued:false,checking:null,es:null,filters:{kind:'',from:'',to:'',thread:''}};
  const eventFeed=()=>PAGE==='events'?document.querySelector('[data-event-feed]'):null;
  function eventsReset(){if(!eventFeed())return;EV.generation++;if(EV.es)EV.es.close();EV.es=null;EV.project=H.project;EV.records=[];EV.summary=null;EV.lastSeq=0;EV.more=false;EV.loading=false;EV.queued=false;EV.refreshQueued=false;EV.checking=null;EV.error=null;eventsDraw()}
  function eventsValid(r,project,filters){
    const count=n=>Number.isSafeInteger(n)&&n>=0, matches=(value,filter)=>!filter||typeof value==='string'&&value.toLowerCase()===filter.toLowerCase();
    return r&&r.ok!==false&&r.project===project&&count(r.lastSeq)&&r.summary&&count(r.summary.total)&&r.summary.byKind&&typeof r.summary.byKind==='object'&&!Array.isArray(r.summary.byKind)&&Object.values(r.summary.byKind).every(count)&&Object.values(r.summary.byKind).reduce((a,b)=>a+b,0)===r.summary.total&&Array.isArray(r.records)&&r.records.every(x=>x&&Number.isSafeInteger(x.seq)&&x.seq>0&&x.seq<=r.lastSeq&&typeof x.ts==='string'&&Number.isFinite(Date.parse(x.ts))&&typeof x.kind==='string'&&typeof x.from==='string'&&Array.isArray(x.to)&&x.to.every(v=>typeof v==='string')&&typeof x.text==='string'&&(x.thread===null||typeof x.thread==='string')&&(!filters.kind||filters.kind===x.kind)&&matches(x.from,filters.from)&&(!filters.to||x.to.some(to=>matches(to,filters.to)))&&matches(x.thread,filters.thread))&&new Set(r.records.map(x=>x.seq)).size===r.records.length;
  }
  function eventsDraw(){const feed=eventFeed();if(!feed)return;
    if(!feed.querySelector('[data-events-body]')){
      feed.innerHTML='<div class="mcap">События проекта · журнал</div><div data-events-source class="events-source"></div><div data-events-count></div><div class="events-kinds" data-events-kinds></div><form class="events-filters"><label>От кого<input name="from" placeholder="идентификатор участника"></label><label>Кому<input name="to" placeholder="идентификатор участника"></label><label>Тред<input name="thread" placeholder="идентификатор треда"></label><button class="btn sm" type="submit">Применить</button><button class="btn sm ghost" type="button" data-events-clear>Сбросить</button></form><div data-events-error role="status"></div><div data-events-body></div><div class="ffoot"><button class="btn sm" data-events-more>Показать ещё</button><button class="btn sm ghost" data-events-refresh>Обновить</button></div><div class="spec-block">Макет · действия журнала: отметки прочтения и назначение агента пока не поддерживаются движком.</div><div class="ffoot"><button class="btn sm ghost" disabled title="Движок не хранит отметки прочтения">Отметить прочитанным</button><button class="btn sm" disabled title="Состав команды назначается через оркестратора">Назначить агента</button></div>';
    }
    feed.querySelector('[data-events-source]').textContent='Текущий проект: '+(EV.project||'ожидаю подтверждения');
    feed.querySelector('[data-events-count]').textContent=EV.summary?'Всего в проекте: '+EV.summary.total+' · загружено по фильтрам: '+EV.records.length:'';
    const kinds=EV.summary?Object.keys(EV.summary.byKind).sort():[];if(EV.filters.kind&&!kinds.includes(EV.filters.kind))kinds.push(EV.filters.kind);
    feed.querySelector('[data-events-kinds]').innerHTML=['',...kinds].map(k=>'<button class="btn sm'+(EV.filters.kind===k?' p':' ghost')+'" data-events-kind="'+esc(k)+'" aria-pressed="'+(EV.filters.kind===k)+'">'+esc(k||'Все')+(EV.summary?' · '+(k?EV.summary.byKind[k]||0:EV.summary.total):'')+'</button>').join('');
    feed.querySelector('[data-events-error]').textContent=EV.error?'Не удалось прочитать журнал: '+EV.error+(EV.summary?' · показан предыдущий снимок.':''):'';
    const groups=new Map();for(const record of EV.records){const thread=record.thread||'';if(!groups.has(thread))groups.set(thread,[]);groups.get(thread).push(record)}
    feed.querySelector('[data-events-body]').innerHTML=EV.records.length?[...groups].map(([thread,records])=>'<div class="grp"><span>'+esc(thread||'Без треда')+'</span><span>'+records.length+' загружено</span></div>'+records.map(r=>'<div class="ev"><span class="o">•</span><details data-event-seq="'+r.seq+'"><summary><b>№'+r.seq+' · '+esc(r.kind)+'</b><span class="t">'+esc(new Date(r.ts).toLocaleString('ru-RU'))+'</span><span class="events-route">'+esc(r.from)+' → '+esc(r.to.join(', '))+'</span><span class="events-preview">'+esc(r.text.slice(0,160))+'</span></summary><div class="events-markdown">'+md(r.text)+'</div><small>Проект: '+esc(EV.project)+' · тред: '+esc(r.thread||'без треда')+'</small><button type="button" class="btn sm ghost" data-event-chain="'+r.seq+'">Показать цепочку</button></details></div>').join('')).join(''):EV.summary?'<div class="empty">'+(EV.summary.total?'По выбранным фильтрам записей нет.':'В этом проекте пока нет событий. Здесь появятся поручения, ответы и события движка.')+'</div>':'<div class="empty">'+(EV.error?'Данные не прочитаны. Нажмите «Обновить».':'Читаю журнал…')+'</div>';
    const more=feed.querySelector('[data-events-more]');more.disabled=!EV.more||EV.loading;more.textContent=EV.loading?'Читаю…':'Показать ещё';
    feed.querySelector('[data-events-refresh]').disabled=EV.loading;hydrateArtifacts();if(typeof tracePanelMount==='function')tracePanelMount();
  }
  function eventsCurrent(project,generation){return EV.alive&&H.on&&!H.snapshotOnly&&H.project===project&&EV.project===project&&EV.generation===generation}
  async function eventsFetch(mode='refresh'){
    if(!eventFeed()||!EV.alive||!H.on||H.snapshotOnly)return;if(EV.project!==H.project)eventsReset();
    if(EV.loading){if(mode==='refresh')EV.queued=true;return}const project=EV.project,generation=EV.generation,filters={...EV.filters},more=mode==='more',initial=!EV.summary,before=more&&EV.records.length?Math.min(...EV.records.map(r=>r.seq)):null,since=initial||more?0:EV.lastSeq;
    const q=new URLSearchParams({limit:initial||more?'100':'0'});if(before)q.set('before',String(before));if(since)q.set('since',String(since));for(const [key,value]of Object.entries(filters))if(value)q.set(key,value);
    EV.loading=true;EV.error=null;eventsDraw();
    try{const r=await api('/api/journal?'+q);if(!eventsCurrent(project,generation))return;
      if(!eventsValid(r,project,filters)||r.lastSeq<EV.lastSeq||r.records.some(x=>before&&x.seq>=before||since&&x.seq<=since))throw Error(r&&r.error||'некорректная форма ответа или привязка к проекту');
      EV.records=[...new Map([...EV.records,...r.records].map(x=>[x.seq,x])).values()].sort((a,b)=>b.seq-a.seq);EV.summary=r.summary;if(!more)EV.lastSeq=r.lastSeq;
      if(initial||more)EV.more=r.records.length===100&&Math.min(...r.records.map(x=>x.seq))>1;
      document.title='Harnessy · События · '+project.split('/').pop();
    }catch(e){if(eventsCurrent(project,generation))EV.error=e.message||'нет связи'}
    finally{if(eventsCurrent(project,generation)){EV.loading=false;eventsDraw();if(EV.queued){EV.queued=false;void eventsFetch()}}}
  }
  async function eventsRefresh(){if(!eventFeed()||!EV.alive)return;if(EV.checking){EV.refreshQueued=true;return EV.checking}const project=EV.project,generation=EV.generation;
    const job=(async()=>{const status=await refreshStatus(true);if(!EV.alive||generation!==EV.generation)return;if(!status){EV.error='проект не подтверждён движком';eventsDraw();return}return eventsSync(true)})();EV.checking=job;
    try{return await job}finally{if(EV.checking===job){EV.checking=null;const again=EV.refreshQueued;EV.refreshQueued=false;if(again&&eventsCurrent(project,generation))await eventsRefresh()}}
  }
  function eventsSync(refresh=false){if(!eventFeed()||!EV.alive||!H.on||H.snapshotOnly)return;if(EV.project!==H.project)eventsReset();
    if(!EV.es&&typeof EventSource==='function'){const project=EV.project,generation=EV.generation,es=EV.es=subscribeLiveEvents();
      es.onmessage=e=>{if(!eventsCurrent(project,generation))return;let event;try{event=JSON.parse(e.data)}catch{return}if(['sent','done','error','note','state','approvalResolved'].includes(event.type))void eventsRefresh()};
      es.onopen=()=>{if(eventsCurrent(project,generation))void eventsRefresh()};
      es.onerror=()=>{if(eventsCurrent(project,generation)){EV.error='поток обновлений недоступен; можно перечитать журнал';eventsDraw()}};
    }
    if(refresh||!EV.summary)return eventsFetch();
  }
  if(PAGE==='events'){
    eventsDraw();addEventListener('live:status',()=>eventsSync());
    addEventListener('pagehide',()=>{EV.alive=false;eventsReset()});
    addEventListener('pageshow',e=>{if(e.persisted){EV.alive=true;eventsReset()}});
    addEventListener('focus',()=>eventsRefresh());
    eventFeed().addEventListener('submit',e=>{if(e.target.matches('[data-trace-filter]'))return;e.preventDefault();for(const key of ['from','to','thread'])EV.filters[key]=eventFeed().querySelector('[name="'+key+'"]').value.trim();eventsReset();return eventsSync(true)});
    eventFeed().addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;
      if(button.hasAttribute('data-events-more'))return eventsFetch('more');if(button.hasAttribute('data-events-refresh'))return eventsRefresh();
      if(button.hasAttribute('data-events-kind')){EV.filters.kind=button.dataset.eventsKind;eventsReset();return eventsSync(true)}
      if(button.hasAttribute('data-events-clear')){for(const key of Object.keys(EV.filters))EV.filters[key]='';for(const input of eventFeed().querySelectorAll('input'))input.value='';eventsReset();return eventsSync(true)}
    });
  }
  // End TS-15a events.
  // TS-18: a chain is read only from the confirmed current project.
  const TRACE_VIEW={project:null,instance:null,generation:0,alive:true,records:[],error:null,id:''};
  function tracePanel(){return PAGE==='events'?document.querySelector('[data-trace-view]'):null}
  function tracePanelMount(){if(PAGE!=='events')return;const feed=eventFeed();if(!feed||tracePanel())return;const section=document.createElement('section');section.className='trace-view';section.setAttribute('data-trace-view','');section.innerHTML='<h2>Цепочка действий</h2><form data-trace-filter><label>traceId<input name="traceId" data-action="Цепочка действий" placeholder="trace:… или идентификатор"></label><button class="btn sm" type="submit">Показать цепочку</button><button class="btn sm ghost" type="button" data-trace-failed>Почему провал</button></form><div data-trace-status role="status"></div><div data-trace-links></div><div data-trace-tree></div><div data-trace-detail></div>';feed.insertBefore(section,feed.firstChild)}
  function tracePanelDraw(){const panel=tracePanel();if(!panel)return;panel.querySelector('[data-trace-status]').textContent=TRACE_VIEW.error||(!TRACE_VIEW.records.length?'Выберите запись журнала или введите traceId.':'Событий: '+TRACE_VIEW.records.length+' · проект: '+base(TRACE_VIEW.project));const ids=[...new Set(TRACE_VIEW.records.map(r=>r.traceId))];panel.querySelector('[data-trace-links]').innerHTML=ids.map(id=>'<p><code>trace:'+esc(id)+'</code> <button class="btn sm ghost" data-trace-open="'+esc(id)+'">Показать цепочку</button> <button class="btn sm ghost" data-trace-copy="'+esc(id)+'">Скопировать ссылку на цепочку</button></p>').join('');
    const spans=new Map();for(const row of TRACE_VIEW.records)spans.set(row.spanId,{...(spans.get(row.spanId)||{}),...row});
    panel.querySelector('[data-trace-tree]').innerHTML=[...spans.values()].map(row=>{let parent=row.parentSpanId,depth=0;const seen=new Set([row.spanId]);while(parent&&spans.has(parent)&&!seen.has(parent)&&depth<12){seen.add(parent);depth++;parent=spans.get(parent).parentSpanId}const refs=row.refs||{},links=(refs.journalSeq?'<button class="btn sm ghost" data-trace-journal="'+refs.journalSeq+'">Запись №'+refs.journalSeq+'</button>':'')+(refs.attemptId?'<button class="btn sm ghost" data-trace-attempt="'+esc(refs.attemptId)+'">Попытка '+esc(refs.attemptId)+'</button>':'')+(refs.proposalId?'<button class="btn sm ghost" data-trace-proposal="'+esc(refs.proposalId)+'">Предложение '+esc(refs.proposalId)+'</button>':'');return '<article class="trace-span '+(row.outcome==='ok'?'trace-ok':'trace-bad')+'" style="margin-left:'+depth*14+'px"><b>'+esc(row.kind)+'</b> <span>'+esc(row.outcome)+'</span> · '+esc(row.actor)+(row.durationMs===null?'':' · '+row.durationMs+' мс')+'<small>'+esc(row.reason.code)+(row.reason.text?' · '+esc(row.reason.text):'')+'</small><div class="trace-refs">'+links+'</div><details><summary>Данные'+(row.truncated?' · усечено':'')+'</summary><pre>'+esc(JSON.stringify(row.data,null,2))+'</pre></details></article>'}).join('');
  }
  async function tracePanelFetch(filter){const binding=traceBinding();if(!binding||!TRACE_VIEW.alive)return;const generation=++TRACE_VIEW.generation;TRACE_VIEW.project=binding.project;TRACE_VIEW.instance=binding.instanceId;TRACE_VIEW.records=[];TRACE_VIEW.error='Читаю цепочку…';tracePanelDraw();const query=new URLSearchParams({...filter,project:binding.project});query.delete('failures');try{const response=await fetch('/api/trace?'+query).then(r=>r.json());if(!TRACE_VIEW.alive||generation!==TRACE_VIEW.generation||!traceSame(binding))return;if(!response||!response.ok||response.project!==binding.project||response.instanceId!==binding.instanceId||!Array.isArray(response.records)||response.records.some(row=>!row||row.project!==binding.project||typeof row.spanId!=='string'||!row.reason||typeof row.reason.code!=='string'||!['ok','failed','rejected','timeout','cancelled'].includes(row.outcome)))throw Error(response&&response.error||'Цепочка не прочитана');const failedIds=filter.failures?new Set(response.records.filter(row=>row.outcome!=='ok').map(row=>row.traceId)):null;TRACE_VIEW.records=failedIds?response.records.filter(row=>failedIds.has(row.traceId)):response.records;TRACE_VIEW.error=TRACE_VIEW.records.length?null:'В этом проекте нет событий этой цепочки. Старые записи журнала могли быть созданы до включения трассы.'}catch(e){if(generation===TRACE_VIEW.generation&&traceSame(binding))TRACE_VIEW.error=e.message}if(TRACE_VIEW.alive&&generation===TRACE_VIEW.generation&&traceSame(binding))tracePanelDraw()}
  function tracePanelReset(){TRACE_VIEW.generation++;TRACE_VIEW.records=[];TRACE_VIEW.error=null;const binding=traceBinding();TRACE_VIEW.project=binding&&binding.project;TRACE_VIEW.instance=binding&&binding.instanceId;const panel=tracePanel();if(panel)panel.querySelector('[data-trace-detail]').textContent='';tracePanelDraw()}
  if(PAGE==='events'){
    addEventListener('live:status',()=>{tracePanelMount();const binding=traceBinding();if(!binding||binding.project!==TRACE_VIEW.project||binding.instanceId!==TRACE_VIEW.instance){tracePanelReset();const id=new URLSearchParams(location.hash.slice(1)).get('trace');if(id)void tracePanelFetch({traceId:id})}});
    addEventListener('pagehide',()=>{TRACE_VIEW.alive=false;tracePanelReset()});addEventListener('pageshow',e=>{if(e.persisted){TRACE_VIEW.alive=true;tracePanelReset()}});
    document.addEventListener('submit',e=>{if(!e.target.matches('[data-trace-filter]'))return;e.preventDefault();e.stopImmediatePropagation();const id=e.target.querySelector('[name="traceId"]').value.trim().replace(/^(?:trace:|harnessy:\/\/trace\/)/,'');if(!/^[0-9a-f-]{36}$/.test(id)){TRACE_VIEW.error='Введите идентификатор цепочки';tracePanelDraw();return}history.replaceState(null,'','#trace='+id);void tracePanelFetch({traceId:id})},true);
    document.addEventListener('click',async e=>{const b=e.target.closest('[data-event-chain],[data-trace-failed],[data-trace-copy],[data-trace-journal],[data-trace-proposal],[data-trace-attempt],[data-trace-open]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.hasAttribute('data-event-chain'))return tracePanelFetch({journalSeq:b.dataset.eventChain});if(b.hasAttribute('data-trace-failed'))return tracePanelFetch({failures:true,since:new Date(Date.now()-2*3600000).toISOString()});if(b.hasAttribute('data-trace-copy')){try{await navigator.clipboard.writeText('harnessy://trace/'+b.dataset.traceCopy+'\ntrace:'+b.dataset.traceCopy);toast('Ссылка на цепочку скопирована')}catch{toast('Не удалось скопировать; идентификатор виден в цепочке')}return}if(b.hasAttribute('data-trace-open'))return tracePanelFetch({traceId:b.dataset.traceOpen});if(b.hasAttribute('data-trace-attempt')){const rows=TRACE_VIEW.records.filter(row=>row.turnInstanceId===b.dataset.traceAttempt||row.refs.attemptId===b.dataset.traceAttempt);tracePanel().querySelector('[data-trace-detail]').innerHTML='<h3>Попытка '+esc(b.dataset.traceAttempt)+'</h3>'+rows.map(row=>'<p>'+esc(row.kind)+' · '+esc(row.outcome)+' · '+esc(row.reason.code)+' · '+esc(row.reason.text)+'</p>').join('');return}if(b.hasAttribute('data-trace-proposal')){const binding=traceBinding(),generation=TRACE_VIEW.generation;try{const response=await api('/api/seats/proposals');if(!binding||!traceSame(binding)||generation!==TRACE_VIEW.generation||!TRACE_VIEW.alive)return;const proposal=response&&response.ok&&response.project===binding.project&&Array.isArray(response.proposals)&&response.proposals.find(row=>row.proposalId===b.dataset.traceProposal);tracePanel().querySelector('[data-trace-detail]').innerHTML='<h3>Предложение '+esc(b.dataset.traceProposal)+'</h3><pre>'+esc(proposal?JSON.stringify(proposal,null,2):'Предложение не найдено в текущем проекте')+'</pre>'}catch{if(binding&&traceSame(binding)&&generation===TRACE_VIEW.generation)toast('Предложение не прочитано')}return}if(b.hasAttribute('data-trace-journal')){const row=document.querySelector('[data-event-seq="'+b.dataset.traceJournal+'"]');if(row){row.open=true;row.scrollIntoView({block:'center'})}else toast('Запись №'+b.dataset.traceJournal+' не загружена в ленту; откройте журнал проекта')}} ,true);
  }
  // End TS-18 chain screen.

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
      '<div class="blk"><div class="t"><span>текст</span></div>'+md(r.text||'')+'</div>'+(th?'<div class="blk"><div class="t"><span>тред</span></div><p>раундов '+(th.rounds||0)+' · '+(th.accepted?'принят':'не принят')+(th.lastScore!=null?' · последний балл '+th.lastScore:'')+(th.merged?' · влит '+esc(String(th.merged).slice(0,10)):'')+'</p></div>':'')+
      '<div class="acts">'+(r.thread?'<span class="btn sm" data-jthread="'+esc(r.thread)+'">Тред целиком</span>':'')+(canMerge?'<span class="btn sm p" data-jmerge="'+esc(r.sha)+'" data-jseq="'+r.seq+'">Слить '+esc(String(r.sha).slice(0,7))+'</span>':'')+'<span class="btn sm ghost" data-close>Закрыть</span></div>'; };
  document.addEventListener('click',async e=>{ if(!H.on||!/21-journal\.html$/.test(location.pathname)) return;
    const more=e.target.closest('[data-jmore]');if(more){e.preventDefault();if(!more.disabled)await journalFetch(true);return}
    const k=e.target.closest('[data-jk]'); if(k){ JR.kind=k.dataset.jk; journalDraw(); return; }
    const tf=e.target.closest('[data-jthread]'); if(tf){ e.stopPropagation(); JR.thread=tf.dataset.jthread||null; if(window.HX&&HX.close) HX.close(); journalDraw(); return; }
    const mg=e.target.closest('[data-jmerge]'); if(mg){ e.stopPropagation(); if(!confirm('Слить '+mg.dataset.jmerge.slice(0,7)+' в интеграционную ветку по вердикту #'+mg.dataset.jseq+'? Движок пропустит только SHA с принятым вердиктом; корень проекта должен быть без незакоммиченных правок.')) return; mg.textContent='Сливаю…'; let r=null; try{ r=await api('/api/owner/merge',{sha:mg.dataset.jmerge,message:'слияние из окна по вердикту #'+mg.dataset.jseq}); }catch(x){} if(!r||!r.ok){ toast('Слияние не прошло: '+esc((r&&r.error)||'нет связи')); mg.textContent='Слить '+mg.dataset.jmerge.slice(0,7); return; } toast('Влито: '+esc(String(r.mergeSha||r.sha||'').slice(0,10))); if(window.HX&&HX.close) HX.close(); journalFetch(); return; }
    const li=e.target.closest('.li.jl[data-seq]'); if(li&&window.HX){ e.stopPropagation(); const r=JR.records.find(x=>String(x.seq)===li.dataset.seq); if(r){HX.open(li,jcard(r),{w:660,h:520});hydrateArtifacts();} } },true);
  // ── «Сейчас» при подключённом движке: TS-15c, HTTP status + journal; SSE only invalidates the confirmed project.
  const NOW={project:null,binding:0,generation:0,alive:true,es:null,job:null,queued:false,data:null,error:null,filter:'all',shown:100,sending:false,dialog:null};
  const nowCurrent=(project,generation)=>NOW.alive&&H.on&&!H.snapshotOnly&&NOW.project===project&&H.project===project&&NOW.binding===(H.confirmedProjectGeneration||0)&&NOW.generation===generation;
  function nowAttemptDisabled(button){const b=button.dataset,place=NOW.data&&NOW.data.status.panes.find(p=>p.id===b.attemptPane),waiting=place&&place.waiting,dialog=NOW.dialog;
    return !!NOW.error||!nowCurrent(b.attemptProject,NOW.generation)||!waiting||waiting.turnInstanceId!==b.attemptId||!waiting.actions.includes(b.attemptAction)||attemptRequests.has(attemptKey(button))||!!button.closest('.ovl')&&(!dialog||dialog.key!=='waiting:'+b.attemptPane+':'+b.attemptId||!nowCurrent(dialog.project,dialog.generation));}
  const nowDate=ts=>new Date(ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const nowAge=ts=>ts==null?'время начала неизвестно':Math.max(0,Math.floor((Date.now()-ts)/60000))+' мин';
  function nowReset(){NOW.generation++;NOW.project=H.project;NOW.binding=H.confirmedProjectGeneration||0;NOW.job=null;NOW.queued=false;NOW.data=null;NOW.error=null;NOW.filter='all';NOW.shown=100;NOW.sending=false;if(NOW.dialog){if(window.HX)HX.close();NOW.dialog=null}}
  const nowWaitingValid=w=>w===null||w&&['uncertain','recovering','unsent'].includes(w.status)&&typeof w.turnInstanceId==='string'&&w.turnInstanceId.length>0&&Array.isArray(w.recordSeqs)&&w.recordSeqs.every(n=>Number.isSafeInteger(n)&&n>0)&&(w.startedAt===null||typeof w.startedAt==='number'&&Number.isFinite(w.startedAt))&&Array.isArray(w.actions)&&w.actions.length>0&&w.actions.every(a=>['retry','skip','finish'].includes(a));
  function nowValid(status,journal,project){return status&&status.project===project&&typeof status.halted==='boolean'&&Array.isArray(status.panes)&&status.panes.every(p=>p&&typeof p.id==='string'&&nowWaitingValid(p.waiting)&&Number.isSafeInteger(p.pendingApprovals)&&p.pendingApprovals>=0)&&Array.isArray(status.approvals)&&status.approvals.every(a=>a&&typeof a.pane==='string'&&typeof a.id==='string'&&typeof a.title==='string'&&typeof a.detail==='string')&&new Set(status.approvals.map(a=>a.pane+'\0'+a.id)).size===status.approvals.length&&status.panes.every(p=>status.approvals.filter(a=>a.pane===p.id).length===p.pendingApprovals)&&eventsValid(journal,project,{})&&journal.records.length===journal.summary.total}
  async function nowFetch(check=true){
    if(!NOW.alive||!H.on||H.snapshotOnly)return false;if(NOW.project!==H.project||NOW.binding!==(H.confirmedProjectGeneration||0))nowReset();
    if(NOW.job){NOW.queued=true;return NOW.job}const project=NOW.project,generation=NOW.generation;
    const work=async()=>{try{
      if(check&&!await refreshStatus())throw Error('проект не подтверждён');if(!nowCurrent(project,generation))return false;
      const status=structuredClone(H.liveStatus),journal=await api('/api/journal?limit=0');if(!nowCurrent(project,generation))return false;
      if(!nowValid(status,journal,project))throw Error(journal&&journal.error||'некорректная форма статуса или журнала');
      NOW.data={status,records:journal.records.slice().sort((a,b)=>b.seq-a.seq)};NOW.error=null;return true;
    }catch(error){if(nowCurrent(project,generation))NOW.error='Не удалось прочитать «Сейчас»: '+error.message;return false}
    finally{if(nowCurrent(project,generation)){NOW.job=null;const queued=NOW.queued;NOW.queued=false;nowDraw();if(queued)void nowFetch()}}};
    // Schedule after job assignment, including failures before the first await.
    NOW.job=Promise.resolve().then(work);nowDraw();return NOW.job;
  }
  function nowItems(){
    if(!NOW.data)return {pending:[],resolved:[],records:[]};const {status,records}=NOW.data,bySeq=new Map(records.map(r=>[r.seq,r]));
    const pending=status.approvals.map(a=>{const seq=/^ack:[1-9][0-9]*$/.test(a.id)?Number(a.id.slice(4)):null,r=seq&&bySeq.get(seq);return {key:'approval:'+a.pane+':'+a.id,type:'approval',pane:a.pane,requester:r?r.from:a.pane,title:a.title,detail:a.detail,ts:r?Date.parse(r.ts):null,seq:r?r.seq:null,approval:a}});
    for(const p of status.panes)if(p.waiting)pending.push({key:'waiting:'+p.id+':'+p.waiting.turnInstanceId,type:'waiting',pane:p.id,title:p.waiting.status==='unsent'?'Не отправлено':'Итог хода неизвестен',detail:p.waiting.status==='unsent'?(p.waiting.failure?.reason||'Причина не сохранена'):p.waiting.status==='recovering'?'Ответ сохранён; нужно завершить доставку':'Требуется ваше решение о повторе или пропуске',ts:p.waiting.startedAt||null,place:p,seq:null});
    const resolutions=new Map();for(const r of records)if(Number.isSafeInteger(r.reply_to)&&(r.from==='owner'&&['answer','note','decision','ack','rejected'].includes(r.kind)||r.from==='harness'&&r.origin==='team-proposal-confirm'))if(!resolutions.has(r.reply_to))resolutions.set(r.reply_to,r);
    const resolved=[],week=Date.now()-7*86400000;
    for(const r of records){if(r.from!=='owner'&&r.to.includes('owner')&&['question','blocker','escalation'].includes(r.kind)){
      if(pending.some(p=>p.seq===r.seq))continue;const answer=resolutions.get(r.seq),item={key:'record:'+r.seq,type:'record',pane:r.from,title:r.text,detail:'Запись №'+r.seq+' · '+r.kind,ts:Date.parse(r.ts),seq:r.seq,record:r,answer};
      if(!answer)pending.push(item);else if(Date.parse(answer.ts)>=week)resolved.push(item);
    }else if(Date.parse(r.ts)>=week&&(r.from==='owner'&&r.kind==='decision'||r.from==='harness'&&r.kind==='note'&&r.origin==='attempt'&&r.to.length===1&&r.to[0]==='owner'&&r.attempt&&typeof r.attempt.pane==='string'&&['retry','skip','finish'].includes(r.attempt.action)&&r.attempt.done===true&&r.thread==='attempt:'+r.attempt.turnInstanceId))resolved.push({key:'record:'+r.seq,type:'record',pane:r.from,title:r.text,ts:Date.parse(r.ts),seq:r.seq,record:r,answer:r});}
    pending.sort((a,b)=>(a.ts??Infinity)-(b.ts??Infinity));resolved.sort((a,b)=>b.answer.seq-a.answer.seq);return {pending,resolved,records};
  }
  function nowButton(item){return '<button type="button" class="btn sm" data-now-open="'+esc(item.key)+'">Открыть решение</button>'}
  function nowDraw(){
    if(PAGE!=='now'||!H.on)return;const turn=document.querySelector('#v-turn .lst');if(!turn)return;
    if(NOW.project!==H.project||NOW.binding!==(H.confirmedProjectGeneration||0))nowReset();
    const {pending,resolved,records}=nowItems(),ready=!!NOW.data,count=ready?pending.length:'—',empty=NOW.error?'Данные не прочитаны. Повторите чтение.':'Читаю статус и журнал…';
    const source='Текущий проект: '+(NOW.project||'ожидаю подтверждения');
    document.querySelectorAll('#v-turn .nums .spec-block, #v-away .nums .spec-block').forEach(n=>n.remove());document.querySelectorAll('#v-turn .nums, #v-away .nums').forEach(n=>n.removeAttribute('data-spec-mock'));
    const values=document.querySelectorAll('#v-turn .nums b');if(values.length){values[0].textContent=count;const times=pending.map(p=>p.ts).filter(t=>t!==null);values[1].textContent=!ready?'—':pending.length&&times.length===pending.length?nowAge(Math.min(...times)):pending.length?'неизвестно':'—';values[1].title=pending.some(p=>p.ts===null)?'Не у всех ожиданий известно время начала':'';values[2].textContent=ready?NOW.data.status.halted?'пауза':pending.length?'решение':NOW.data.status.panes.some(p=>p.busy)?'ход выполняется':'нет активных ходов':'—'}
    const awayNums=document.querySelectorAll('#v-away .nums b');if(awayNums.length){awayNums[0].textContent='—';awayNums[1].textContent=count;awayNums[2].textContent='—';awayNums[2].parentElement.querySelector('small').textContent='вас не было · время неизвестно'}
    const header='<div class="li head"><span>кто просит</span><span>что</span><span>ждёт</span><span>главное действие</span><span></span></div>';
    turn.innerHTML=header+(ready?pending.length?pending.map(p=>'<div class="li"><span>'+esc(who(p.requester||p.pane))+'</span><div><b>'+esc(p.title.slice(0,180))+'</b><small>'+esc(p.detail||'')+'</small></div><span class="m">'+esc(nowAge(p.ts))+'</span><span>'+nowButton(p)+'</span><span class="chev">›</span></div>').join(''):'<div class="empty">Сейчас вас никто не ждёт: открытых подтверждений и вопросов владельцу нет.</div>':'<div class="empty">'+esc(empty)+'</div>');
    const filters=document.querySelector('#v-week .filters');if(filters)filters.innerHTML=[['all','все',pending.length+resolved.length],['pending','ждут',pending.length],['resolved','решены',resolved.length]].map(([key,label,n])=>'<button class="chip'+(NOW.filter===key?' on':'')+'" data-now-filter="'+key+'" aria-pressed="'+(NOW.filter===key)+'">'+label+' · '+(ready?n:'—')+'</button>').join('')+'<button class="chip" disabled title="Движок не хранит отложенные решения">отложены · нет данных</button><span class="sp"></span><span class="mono">решены за 7 дней · открытые за всё время</span>';
    const shown=NOW.filter==='pending'?pending:NOW.filter==='resolved'?resolved:[...pending,...resolved],decisions=document.querySelector('#v-week .lst');
    if(decisions)decisions.innerHTML='<div class="li head"><span>вид</span><span>вопрос</span><span>источник</span><span>состояние</span><span></span></div>'+(ready?shown.length?shown.map(p=>p.type==='waiting'?'<div class="now-waiting">'+waitingControls(p.place,p.place.waiting,NOW.project)+'</div>':'<div class="li"><span class="kind">'+(p.answer?'решение':p.type==='approval'?'подтверждение':'вопрос')+'</span><div><b>'+esc(p.title.slice(0,180))+'</b><small>'+esc(p.ts===null?'время начала неизвестно':nowDate(p.ts))+'</small></div><span class="m">'+esc(p.seq?'журнал №'+p.seq:who(p.pane))+'</span><span class="m">'+(p.answer?'решено':'ждёт вас')+'</span><button class="btn sm ghost" aria-label="Открыть решение" data-now-open="'+esc(p.key)+'">›</button></div>').join(''):'<div class="empty">В этом срезе решений нет.</div>':'<div class="empty">'+esc(empty)+'</div>');
    const recent=records.filter(r=>Date.parse(r.ts)>=Date.now()-7*86400000),away=document.querySelector('#v-away .lst');
    if(away)away.innerHTML='<div class="now-source">Нет данных о времени вашего ухода: движок его не фиксирует. Ниже — события за последние 7 дней, новое сверху.</div><div class="li head"><span>когда</span><span>что произошло</span><span>кто</span><span>нужно от вас</span><span></span></div>'+(ready?recent.slice(0,NOW.shown).map(r=>{const item=pending.find(p=>p.seq===r.seq);return '<div class="li"><span class="m">'+esc(nowDate(r.ts))+'</span><div><b>'+esc(r.text.slice(0,180))+'</b><small>№'+r.seq+' · '+esc(r.kind)+'</small></div><span class="m">'+esc(who(r.from))+'</span><span>'+(item?nowButton(item):'запись журнала')+'</span><button class="btn sm ghost" aria-label="Открыть запись №'+r.seq+'" data-now-record="'+r.seq+'">›</button></div>'}).join('')||'<div class="empty">За последние 7 дней событий нет.</div>':'<div class="empty">'+esc(empty)+'</div>')+(recent.length>NOW.shown?'<button class="btn sm" data-now-more>Показать ещё</button>':'');
    const idle=document.getElementById('idle');if(idle)idle.innerHTML='<div><b>Что будет, если ничего не делать</b><p>'+(ready?(NOW.data.status.halted?'Проект на паузе. ':pending.length?'Сейчас '+pending.length+' '+plural(pending.length)+' вашего решения. ':'Ожиданий владельца сейчас нет. '):'Состояние ещё не прочитано. ')+'Нет данных о времени завершения: движок не рассчитывает прогноз.</p></div><button class="btn sm" data-now-first'+(!pending.length?' disabled':'')+'>Решать по порядку</button>';
    const note=document.querySelector('#v-turn .note-bar');if(note)note.innerHTML='<span data-now-source>'+esc(source)+'</span><button class="btn sm ghost" data-now-refresh'+(NOW.job?' disabled':'')+'>'+(NOW.job?'Читаю…':'Обновить')+'</button><span data-now-error role="status">'+esc(NOW.error?NOW.error+(ready?' · показан предыдущий снимок; действия недоступны.':''):'')+'</span>';
    document.querySelectorAll('aside.side .nav[data-go="now"] .b').forEach(b=>{b.textContent=count;b.style.display=ready&&!count?'none':''});
    const st=document.querySelector('.frame .top .st');if(st)st.textContent=ready?(count?count+' '+plural(count)+' вас':'никто не ждёт')+' · журнал и статус':empty;
    const spec=document.querySelector('.spec-banner');if(spec)spec.textContent='Частично · решения и события — данные проекта. Нет данных о времени ухода, отложенных решениях и прогнозе завершения.';
    document.querySelectorAll('[data-ap-decision]').forEach(b=>b.disabled=!!NOW.error||NOW.sending||!NOW.alive);
    document.querySelectorAll('[data-attempt-action]').forEach(b=>b.disabled=nowAttemptDisabled(b));
    if(NOW.error||!NOW.alive)document.querySelectorAll('[data-now-open], [data-now-record], [data-now-first]').forEach(b=>b.disabled=true);
    if(NOW.dialog&&!NOW.sending){const item=[...pending,...resolved].find(p=>p.key===NOW.dialog.key);if(NOW.dialog.type!=='record'&&!item){if(window.HX)HX.close();NOW.dialog=null}}
  }
  function nowOpen(element,item){
    if(!item||!NOW.data||NOW.error||!nowCurrent(NOW.project,NOW.generation))return;NOW.dialog={key:item.key,type:item.type,project:NOW.project,generation:NOW.generation};
    const header='<div class="from">решение владельца · '+esc(NOW.project)+'</div><h3>'+esc(item.title)+'</h3>';
    const actions=item.type==='approval'?'<div class="act"><button class="btn p" data-ap-decision="allow">Разрешить</button><button class="btn ghost" data-ap-decision="deny">Отказать</button></div>':'';
    const body=item.type==='waiting'?waitingControls(item.place,item.place.waiting,NOW.project):'<p>'+esc(item.ts==null?'время начала неизвестно':nowDate(item.ts))+'</p>'+md(item.record?item.record.text:item.detail||'')+(item.answer&&item.answer!==item.record?'<h4>Ответ · №'+item.answer.seq+'</h4>'+md(item.answer.text):'');
    if(window.HX)HX.open(element,header+body+actions+'<p data-now-action-error role="status"></p><a class="btn sm ghost" href="21-journal.html">Журнал проекта →</a>',{w:660,h:530,hide:false});
    nowDraw();
  }
  function nowLive(){if(PAGE!=='now'||!H.on||H.snapshotOnly||!NOW.alive)return;if(!NOW.es){NOW.es=subscribeLiveEvents();NOW.es.onmessage=e=>{let ev;try{ev=JSON.parse(e.data)}catch{return}if(ev.type==='teamProposals'&&ev.project===H.project){void proposalsFetch();if(typeof knowledgeFetch==='function')void knowledgeFetch()}if(['approval','approvalResolved','state','sent','done','note','error','teamProposals','owner','queued'].includes(ev.type))void nowFetch()};NOW.es.onopen=()=>{void nowFetch();if(typeof proposalsFetch==='function')void proposalsFetch()};NOW.es.onerror=()=>{NOW.error='Связь потеряна. Повторите чтение.';nowDraw()};syncLiveEvents()}return nowFetch(false)}
  // TS-15c Now lifecycle.
  if(PAGE==='now'){
    addEventListener('live:status',()=>{if(!H.on||H.snapshotOnly||!NOW.alive)return;if(NOW.project!==H.project||NOW.binding!==(H.confirmedProjectGeneration||0)||!NOW.job)void nowLive()});
    addEventListener('pagehide',()=>{NOW.alive=false;if(NOW.es)NOW.es.close();NOW.es=null;nowReset();nowDraw()});
    addEventListener('pageshow',e=>{if(e.persisted){NOW.alive=true;nowReset()}});
  }
  document.addEventListener('click',async e=>{
    if(PAGE!=='now'||!H.on)return;const b=e.target.closest('[data-now-open], [data-now-record], [data-now-filter], [data-now-refresh], [data-now-more], [data-now-first], [data-ap-decision], #idle, [data-passport]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();if(b.disabled)return;
    if(b.hasAttribute('data-now-refresh'))return nowFetch();if(b.hasAttribute('data-now-filter')){NOW.filter=b.dataset.nowFilter;nowDraw();return}if(b.hasAttribute('data-now-more')){NOW.shown+=100;nowDraw();return}
    const items=nowItems();if(b.hasAttribute('data-now-open')){nowOpen(b,[...items.pending,...items.resolved].find(p=>p.key===b.dataset.nowOpen));return}
    if(b.hasAttribute('data-now-record')){const r=items.records.find(r=>String(r.seq)===b.dataset.nowRecord);if(r)nowOpen(b,{key:'record:'+r.seq,type:'record',title:'Запись №'+r.seq+' · '+r.kind,ts:Date.parse(r.ts),record:r});return}
    if(b.hasAttribute('data-now-first')){nowOpen(b,items.pending[0]);return}
    if(b.hasAttribute('data-passport')){if(window.HX)HX.open(b,'<h3>Сейчас</h3><p>Источник: статус и журнал текущего проекта. Подтверждения относятся к месту и конкретному вопросу; итог неизвестного хода решается отдельно.</p><p>История — за последние 7 дней. Время ухода, отложенные решения и прогноз завершения движок не хранит.</p>',{w:600,h:400,hide:false});return}
    if(!b.hasAttribute('data-ap-decision')||NOW.sending||NOW.error)return;
    const dialog=NOW.dialog,item=dialog&&items.pending.find(p=>p.key===dialog.key);if(!dialog||!item||item.type!=='approval'||!nowCurrent(dialog.project,dialog.generation))return;
    NOW.sending=true;document.querySelectorAll('[data-ap-decision]').forEach(n=>n.disabled=true);
    try{const result=await api('/api/approve',{project:dialog.project,pane:item.approval.pane,id:item.approval.id,decision:b.dataset.apDecision});if(!nowCurrent(dialog.project,dialog.generation))return;if(!result||!result.ok)throw Error(result&&result.error||'нет связи');if(window.HX)HX.close();NOW.dialog=null;await nowFetch()}
    catch(error){if(nowCurrent(dialog.project,dialog.generation)){const box=document.querySelector('[data-now-action-error]');if(box)box.textContent='Решение не принято: '+error.message;toast('Решение не принято: '+esc(error.message))}}
    finally{if(nowCurrent(dialog.project,dialog.generation)){NOW.sending=false;document.querySelectorAll('[data-ap-decision]').forEach(n=>n.disabled=!!NOW.error)}}
  },true);
  // End TS-15c Now.
  // TS-09a.1: one lifecycle for all prototype pages.
  function suspendPage(){pageGeneration++;PS.alive=false;PS.generation++;JR.epoch++;JR.loadingMore=false}
  async function resumePage(){const generation=++pageGeneration;leftPage=false;invalidateBinding();if(window.HARNESS_BOOT){window.HARNESS_BOOT.invalidate();window.HARNESS_BOOT.preview()}
    H.snapshotOnly=true;PS.alive=true;sectionChanging();SP.generation++;JR.epoch++;S.chat=[];H.cur=null;H.asks={};SEL=null;LOADED=null;S.ui.openChat=null;
    if(S.pending){const pending=S.pending;S.draft=S.draft||pending.text;attachmentRestore(pending.key||attachmentKey(pending.target),attachmentPendingRefs(pending));S.pending=null}save();render();
    const status=await refreshStatus(true);if(leftPage||generation!==pageGeneration)return false;
    if(!status){PS.error='Не удалось подтвердить проект после возврата. Повторите чтение или перезагрузите страницу.';PS.loading=false;sectionDraw();toast(PS.error);return false}
    if(cols().length){const pane=H.pane?H.pane.id:'room';if(S.ui.pane!==pane){invalidateBinding();S.ui.pane=pane;save()}
      await loadChat({onboard:false,visible:true});if(leftPage||generation!==pageGeneration)return false;
    }
    H.connected=true;if(window.HARNESS_BOOT)window.HARNESS_BOOT.accept();liveFirstPaint();if(PAGE==='log')void journalFetch();return true;
  }
  addEventListener('pageshow',event=>{if(event.persisted)return resumePage()});
  // End TS-09a.1 page lifecycle.
  window.LIVE={networkMenu,networkPath,networkWarning,profileDraw,firstModelsDraw:()=>{if(PAGE==='first')firstDraw()},subscribeLiveEvents,providerLimitHTML:(id,name,kind,supported)=>{if(!supported)return '<p class="conn-note">Провайдер лимиты не отдаёт.</p>';return spLimitHTML({id,name,kind},true)},stop,busy:()=>!!(H.cur||(H.pane&&H.pane.busy)),get S(){ return S; },save,H,api,esc,toast,log,paneName,hStatus,pickPane,openPal,md,refreshStatus,refreshChats,loadChat,promoteConversation,operationsDraw,operationAttention,selStart,laMenu,laPath,laMulti,sendBinding,bindingCurrent,invalidateBinding,configureSetting,composerState,attachmentsDraw,pickImages,get teamProposals(){return TP;},proposalsFetch,showTeamProposal,requestTeamProposal,createTeamRole,proposalStateText,proposalMember};   // для cx.js (поле ввода)
  // TS-09b3: proposal cards always confirm the exact displayed project and version.
  const TP={project:null,generation:0,data:[],loading:false,queued:false,sending:false,error:null,focus:null,kinds:{}};
  const KN={request:0,data:null,binding:null,error:null};
  function knowledgeDraw(){let box=document.getElementById('live-role-knowledge');const active=KN.binding&&bindingCurrent(KN.binding)&&!leftPage;
    if(!active||!KN.data&&!KN.error){if(box)box.remove();return}const feed=document.querySelector('.frame.cur .main .feed')||document.querySelector('.frame .main .feed');if(!feed)return;
    if(!box){box=document.createElement('section');box.id='live-role-knowledge';box.className='role-knowledge';feed.parentElement.insertBefore(box,feed)}
    box.innerHTML=KN.error?'<h3>Что знает эта роль</h3><p role="alert">'+esc(KN.error)+'</p><button class="btn ghost" data-knowledge-retry>Повторить чтение</button>':'<details open><summary>Что знает эта роль</summary><pre>'+esc(KN.data.text)+'</pre></details>';
  }
  function knowledgeSet(response,binding){if(!bindingCurrent(binding)||leftPage)return false;KN.binding=binding;KN.error=null;KN.data=null;
    const k=response&&response.knowledge;if(response&&response.firstOpenPending===true&&k===undefined){KN.error='Не удалось прочитать контекст этой роли';knowledgeDraw();return false}if(k!==undefined){if(!k||k.project!==binding.project||k.pane!==binding.pane||k.chat!==binding.chat||typeof k.text!=='string'||!Array.isArray(k.team)||typeof response.firstOpenPending!=='boolean'){KN.error='Не удалось прочитать контекст этой роли';knowledgeDraw();return false}KN.data=k}knowledgeDraw();return true;
  }
  async function knowledgeFetch(){const binding=sendBinding(),request=++KN.request;if(!H.on||leftPage||!binding.chat)return;try{const r=await api('/api/chats/'+encodeURIComponent(binding.chat));if(request!==KN.request||!bindingCurrent(binding)||leftPage)return;if(!r||!r.chat||!Array.isArray(r.messages))throw Error(r&&r.error||'Не удалось прочитать контекст роли');knowledgeSet(r,binding)}catch(e){if(request!==KN.request||!bindingCurrent(binding)||leftPage)return;KN.binding=binding;KN.data=null;KN.error=e.message;knowledgeDraw()}}
  function knowledgeReset(){KN.request++;KN.data=null;KN.binding=null;KN.error=null;knowledgeDraw()}
  async function knowledgeOpen(p,binding){if(!KN.data||!bindingCurrent(binding)||leftPage)return false;
    if(typeof requestAnimationFrame==='function')await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!bindingCurrent(binding)||leftPage)return false;let r;try{r=await api('/api/onboard',{pane:p.id,project:binding.project,chat:binding.chat})}catch(e){r={ok:false,error:e.message||'Нет связи с движком'}}if(!bindingCurrent(binding)||leftPage)return false;
    if(!r||!r.ok){KN.error=r&&r.error||'Не удалось начать первый ход';knowledgeDraw();return false}return true;
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-knowledge-retry]')){e.preventDefault();void loadChat({onboard:true})}});
  addEventListener('pagehide',knowledgeReset);
  const TEAM_KINDS=['orchestrator','assistant','architect','worker','reviewer','tester','researcher'];
  const proposalCurrent=(project,generation)=>!leftPage&&H.on&&!H.snapshotOnly&&H.project===project&&TP.project===project&&TP.generation===generation;
  const proposalKindKey=(q,i)=>q.proposalId+':'+q.version+':'+i;
  const proposalSeatKind=(q,i)=>q.ownerSeats&&q.ownerSeats[i]?q.ownerSeats[i].kind:q.seats[i].kind;
  function proposalValid(q){return q&&typeof q.proposalId==='string'&&/^p[0-9a-f]{24}$/.test(q.proposalId)&&Number.isSafeInteger(q.version)&&q.version>0&&typeof q.confirmed==='boolean'&&Array.isArray(q.seats)&&q.seats.length>0&&q.seats.every(s=>s&&['sid','operationId','kind','label','vendor','model','mode','intro'].every(k=>typeof s[k]==='string')&&TEAM_KINDS.includes(s.kind))&&Array.isArray(q.team)&&q.team.every(m=>m&&typeof m.id==='string'&&typeof m.kind==='string'&&typeof m.proposedKind==='string'&&['created','creating','proposed'].includes(m.state)&&(m.chat===null||typeof m.chat==='string'))&&q.seats.every(s=>q.team.filter(m=>m.id===s.sid).length===1)&&(q.ownerSeats===undefined||q.ownerSeats&&typeof q.ownerSeats==='object'&&!Array.isArray(q.ownerSeats)&&Object.entries(q.ownerSeats).every(([i,v])=>/^(0|[1-9][0-9]*)$/.test(i)&&Number(i)<q.seats.length&&v&&TEAM_KINDS.includes(v.kind)&&typeof v.created==='boolean'))}
  function proposalsNotify(){if(PAGE==='first'&&typeof firstDraw==='function')firstDraw();if(typeof window!=='undefined'&&window.CX&&window.CX.proposalsChanged)window.CX.proposalsChanged()}
  function proposalMember(q,i){const s=q.seats[i];return s&&Array.isArray(q.team)?q.team.find(m=>m.id===s.sid):null}
  function proposalStateText(member){if(!member)return 'состояние не получено';return member.state==='proposed'?'предложена · чата ещё нет':member.state==='creating'?'создание ещё не завершено':member.kind!==member.proposedKind?'создана владельцем как '+member.kind:'создана · чат открыт'}
  function proposalRow(q,s,i){const choice=q.ownerSeats&&q.ownerSeats[i],member=proposalMember(q,i),created=member&&member.state==='created',kind=TP.kinds[proposalKindKey(q,i)]||proposalSeatKind(q,i),attrs=' data-team-project="'+esc(TP.project)+'" data-team-version="'+q.version+'" data-team-index="'+i+'"';
    return '<div class="proposal-seat" data-team-row><b>'+esc(s.label)+'</b><p>'+esc(member&&member.model||s.model)+' · '+esc(s.vendor)+' · '+esc(s.mode)+'</p><p role="status">'+esc(proposalStateText(member))+'</p><label>Класс прав: один из семи <select data-team-kind="'+esc(q.proposalId)+'"'+attrs+(TP.sending||choice||created?' disabled':'')+'>'+TEAM_KINDS.map(k=>'<option value="'+k+'"'+(k===kind?' selected':'')+'>'+k+'</option>').join('')+'</select></label><details><summary>Вводная участника</summary><pre>'+esc(s.intro)+'</pre></details><button type="button" class="btn ghost" data-team-create="'+esc(q.proposalId)+'"'+attrs+(TP.sending||!member?' disabled':'')+'>'+(created?'Открыть чат':choice?'Завершить создание':'Создать эту роль')+'</button></div>';
  }
  async function openTeamChat(pane,chat,binding){if(!bindingCurrent(binding)||leftPage)return false;await refreshStatus();if(!bindingCurrent(binding)||leftPage)return false;
    if(!(H.panes||[]).some(p=>p.id===pane)){toast('Созданное место ещё не найдено в проекте');return false}
    if((H.active||{})[pane]!==chat){const r=await api('/api/chats/open',{chat,carry:'none'});if(!bindingCurrent(binding)||leftPage)return false;if(!r||!r.ok){toast(esc(r&&r.error||'Не удалось открыть чат'));return false}H.active[pane]=chat}
    invalidateBinding();S.ui.pane=pane;S.ui.fresh=false;S.ui.switched=true;S.chat=[];H.cur=null;if(S.cx){S.cx.noFolder=false;delete S.cx.noFolderPending}save();pickPane();hStatus();knowledgeReset();
    if(PAGE!=='chat'){location.href='01-chat.html';return true}await loadChat({onboard:true});return true;
  }
  async function createTeamRole(proposalId,index,binding=sendBinding()){
    const project=TP.project,generation=TP.generation,q=TP.data.find(q=>q.proposalId===proposalId),key=q?'owner-seat:'+q.proposalId+':'+q.version+':'+index:'';
    if(TP.sending){if(key)operationAttention(key);return false}if(!q||!q.seats[index]||!bindingCurrent(binding)||!proposalCurrent(project,generation))return false;
    const member=proposalMember(q,index);if(!member){toast('Состояние строки предложения не получено');return false}if(member.state==='created'&&member.chat)return openTeamChat(q.seats[index].sid,member.chat,binding);
    TP.sending=true;const progress=operationStart(key,'owner-seat','Harnessy создаёт роль «'+q.seats[index].label+'»…',['команда','файл роли','чат','статус','вводная'],binding,{projectOnly:true,proposalId:q.proposalId,version:q.version,seatIndex:index,retry:()=>createTeamRole(proposalId,index,sendBinding())});if(!progress){TP.sending=false;return false}proposalsDraw();
    try{const r=await api('/api/seats/owner',{project,proposalId:q.proposalId,version:q.version,seatIndex:index,kind:TP.kinds[proposalKindKey(q,index)]||proposalSeatKind(q,index)});
      if(!bindingCurrent(binding)||!proposalCurrent(project,generation))return false;if(!r||!r.ok)throw Error(r&&r.error||'Роль не создана');
      if(r.project!==project||r.pane!==q.seats[index].sid||r.chat!==q.seats[index].operationId)throw Error('Ответ создания не соответствует роли');operationEnd(progress);return await openTeamChat(r.pane,r.chat,binding);
    }catch(error){if(bindingCurrent(binding)&&proposalCurrent(project,generation)){operationEnd(progress,error.message);toast(esc(error.message))}return false}
    finally{if(proposalCurrent(project,generation)){TP.sending=false;await proposalsFetch()}else operationEnd(progress)}
  }
  function proposalsDraw(){proposalsNotify();if(!['chat','new','now','first'].includes(PAGE))return;let box=document.getElementById('live-team-proposals');
    if(!H.on||H.snapshotOnly||leftPage||TP.project!==H.project||PAGE==='new'&&!TP.focus){if(box)box.remove();return}
    const host=PAGE==='first'?document.querySelector('[data-first-team]'):PAGE==='chat'?document.querySelector('.frame.cur .main .feed')||document.querySelector('.frame .main .feed'):document.querySelector('.frame .main');if(!host)return;
    if(!box){box=document.createElement('section');box.id='live-team-proposals';box.className='team-proposals';if(PAGE==='chat')host.parentElement.insertBefore(box,host);else host.appendChild(box)}
    if(!TP.error&&!TP.data.length){box.remove();return}
    box.innerHTML=(PAGE==='new'?'<button type="button" class="btn ghost" data-team-close>Закрыть состав</button>':'')+(TP.error?'<p role="alert">'+esc(TP.error)+'</p><button class="btn ghost" data-team-refresh>Повторить чтение</button>':TP.data.filter(q=>!TP.focus||q.proposalId===TP.focus).map(q=>{
      const changed=q.seats.some((_s,i)=>TP.kinds[proposalKindKey(q,i)]&&TP.kinds[proposalKindKey(q,i)]!==proposalSeatKind(q,i)),created=q.seats.filter((_s,i)=>proposalMember(q,i)?.state==='created').length,first=q.seats.findIndex((_s,i)=>proposalMember(q,i)?.state==='created'),attrs=' data-team-version="'+q.version+'" data-team-project="'+esc(TP.project)+'"';
      return '<article data-team-proposal="'+esc(q.proposalId)+'"><h3>Состав команды · версия '+q.version+'</h3>'+q.seats.map((s,i)=>proposalRow(q,s,i)).join('')+
        (q.confirmed&&created===q.seats.length?'<p role="status">Версия подтверждена. Все участники созданы.</p>':'<button type="button" class="btn p" data-team-confirm="'+esc(q.proposalId)+'"'+attrs+(TP.sending||changed?' disabled':'')+'>'+(q.confirmed?'Завершить создание состава':'Подтвердить этот состав')+'</button><p>'+(changed?'Создайте выбранную роль, чтобы сохранить смену класса.':'Создадим остальных участников с показанными именами, классами прав, моделями и вводными.')+'</p>')+
        (q.confirmed&&first>=0?'<button class="btn ghost" data-team-create="'+esc(q.proposalId)+'" data-team-index="'+first+'"'+attrs+'>Перейти в первый созданный чат</button>':'')+'</article>';
    }).join(''));
  }
  function proposalsReset(){TP.generation++;TP.project=null;TP.data=[];TP.error=null;TP.loading=false;TP.queued=false;TP.sending=false;TP.focus=null;TP.kinds={};proposalsDraw()}
  async function proposalsFetch(){if(!H.on||H.snapshotOnly||leftPage||!['chat','new','now','first'].includes(PAGE))return false;if(TP.project!==H.project){proposalsReset();TP.project=H.project}if(TP.loading){TP.queued=true;return false}
    const project=TP.project,generation=TP.generation;TP.loading=true;
    try{const r=await api('/api/seats/proposals');if(!proposalCurrent(project,generation))return false;if(!r||!r.ok||r.project!==project||!Array.isArray(r.proposals)||!r.proposals.every(proposalValid))throw Error(r&&r.error||'Не удалось прочитать состав команды');TP.data=r.proposals;TP.error=null;for(const q of TP.data)q.seats.forEach((_s,i)=>{if(q.ownerSeats&&q.ownerSeats[i])delete TP.kinds[proposalKindKey(q,i)]});if(typeof refreshStatus==='function')await refreshStatus();if(proposalCurrent(project,generation))operationsTeams(TP.data)}
    catch(e){if(!proposalCurrent(project,generation))return false;TP.error=e.message||'Нет связи с движком';TP.data=[];for(const op of OPS.items.values())if(op.kind==='seats')operationEnd(op,TP.error)}
    if(!proposalCurrent(project,generation))return false;TP.loading=false;proposalsDraw();if(KN.data)void knowledgeFetch();if(TP.queued){TP.queued=false;void proposalsFetch()}return !TP.error;
  }
  function proposalsSync(){if(!['chat','new','now','first'].includes(PAGE))return;if(TP.project!==H.project)void proposalsFetch();else proposalsDraw()}
  function showTeamProposal(id){if(!proposalCurrent(TP.project,TP.generation)||!TP.data.some(q=>q.proposalId===id))return;TP.focus=id;proposalsDraw();const box=document.getElementById('live-team-proposals');if(box&&box.scrollIntoView)box.scrollIntoView({block:'nearest'})}
  async function requestTeamProposal(binding){if(!bindingCurrent(binding)||leftPage)return false;const o=(H.panes||[]).find(p=>p.kind==='orchestrator');if(!o){toast('Сначала назначьте оркестратора этому разговору');return false}
    invalidateBinding();S.ui.pane=o.id;save();pickPane();hStatus();const target=sendBinding();await loadChat({onboard:false});if(!bindingCurrent(target)||leftPage)return false;return onSend('зарегистрируй предложение',null,target);
  }
  async function confirmProposal(project,version,proposalId,generation=TP.generation){
    if(TP.sending||!proposalCurrent(project,generation))return;const q=TP.data.find(q=>q.proposalId===proposalId&&q.version===version);if(!q)return;const binding=sendBinding();
    const key='seats:'+proposalId+':'+version,progress=operationStart(key,'seats','Harnessy создаёт места…',q.seats.map(s=>s.label),sendBinding(),{projectOnly:true,preparing:'подтверждаем состав',retry:()=>confirmProposal(project,version,proposalId,generation)});if(!progress)return;
    TP.sending=true;proposalsDraw();try{const r=await api('/api/seats/confirm',{project,proposalId,version});if(!bindingCurrent(binding)||!proposalCurrent(project,generation))return;if(!r||!r.ok)throw Error(r&&r.error||'Подтверждение не сохранено');progress.preparing='проверяем созданные места';toast('Состав команды подтверждён · версия '+version)}catch(error){if(proposalCurrent(project,generation)){operationEnd(progress,error.message);toast(esc(error.message))}}finally{if(proposalCurrent(project,generation)){TP.sending=false;await proposalsFetch()}else operationEnd(progress)}
  }
  document.addEventListener('change',e=>{const sel=e.target.closest('[data-team-kind]');if(!sel||!proposalCurrent(sel.dataset.teamProject,TP.generation)||TP.sending||sel.disabled)return;const q=TP.data.find(q=>q.proposalId===sel.dataset.teamKind&&q.version===Number(sel.dataset.teamVersion)),i=Number(sel.dataset.teamIndex);if(!q||!q.seats[i]||!TEAM_KINDS.includes(sel.value))return;TP.kinds[proposalKindKey(q,i)]=sel.value;proposalsDraw()});
  document.addEventListener('click',async e=>{if(e.target.closest('[data-team-close]')){e.preventDefault();e.stopPropagation();TP.focus=null;proposalsDraw();return}const refresh=e.target.closest('[data-team-refresh]'),create=e.target.closest('[data-team-create]'),button=create||e.target.closest('[data-team-confirm]');if(!refresh&&!button)return;e.preventDefault();e.stopPropagation();if(refresh){void proposalsFetch();return}
    const project=button.dataset.teamProject,version=Number(button.dataset.teamVersion),proposalId=button.dataset.teamCreate||button.dataset.teamConfirm,generation=TP.generation;
    if(button.disabled||TP.sending||!proposalCurrent(project,generation))return;const q=TP.data.find(q=>q.proposalId===proposalId&&q.version===version);if(!q)return;
    const index=Number(button.dataset.teamIndex);if(create){await createTeamRole(proposalId,index);return}
    await confirmProposal(project,version,proposalId,generation);
  },true);
  addEventListener('pagehide',proposalsReset);
  // End TS-09b3 proposals.
  // ── запуск
  composer(); restoreUI(); wireSearch(); refresh();restoreLiveSnapshot(); sideChats();
  if(PAGE==='chat'&&S.ui.sectionHint){toast(esc(S.ui.sectionHint));delete S.ui.sectionHint;save()}
  hConnect().finally(async()=>{ if(window.HARNESS_BOOT&&!H.connected){if(S.pending){const pending=S.pending;S.draft=pending.text;attachmentRestore(pending.key||attachmentKey(pending.target),attachmentPendingRefs(pending));S.pending=null;save()}return} S.ui.switched=false;if(PAGE==='first'){render();return} if(cols().length){ if(S.pending){ const pending=S.pending,q=pending.text,refs=attachmentPendingRefs(pending),pendingKey=pending.key||attachmentKey(pending.target);S.pending=null;
        const target=sendBinding();if(pending.target&&(pending.target.project!==target.project||pending.target.pane!==target.pane||pending.target.chat!==target.chat)){S.draft=q;attachmentRestore(pendingKey,refs);save();render();attachmentsDraw();toast('Разговор изменился; сообщение осталось в черновике');return}
        if(S.ui.fresh&&H.on&&H.pane&&H.pane.id==='room'){ try{ const r=await api('/api/chats/new',{pane:'room',carry:'none'}); if(!r||!r.ok)throw Error(r&&r.error||'нет связи');await refreshChats();S.chat=[]; }catch(e){S.draft=q;attachmentRestore(pendingKey,refs);save();render();attachmentsDraw();toast('Не вышло: '+esc(e.message));return} }   // новый чат без роли — параллельный прежним
        const binding=sendBinding();if(binding.project!==target.project||binding.pane!==target.pane){S.draft=q;attachmentRestore(pendingKey,refs);save();render();attachmentsDraw();toast('Разговор изменился; сообщение осталось в черновике');return}
        S.ui.fresh=false;save();await onSend(q,null,binding,refs,pendingKey); } else render(); } }).finally(()=>{if(window.HARNESS_BOOT)liveFirstPaint()});
  addEventListener('resize',()=>{ wireSearch(); badges(); });
  addEventListener('storage',()=>{ load(); refresh(); if(cols().length) render(); if(window.CX) CX.render(); });
})();
