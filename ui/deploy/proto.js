/* proto.js — режим прототипа для экранов-скетчей (включается атрибутом <html data-proto>, его ставит сборка).
   Что делает: (1) экран на всё окно: кадр 1280×860 растягивается, в окне меньше — уменьшается целиком;
   (2) единая боковая панель на всех экранах: «Новый чат», поиск, разделы по группам, проекты, лимиты, профиль; «⟨ / ⟩» сворачивает в рейку;
   (3) сбоку ссылка на тот же экран с пояснениями (лист-скетч). Исходники скетчей не меняются. */
(function(){
  if(!document.documentElement.hasAttribute('data-proto')) return;
  /*IC*/
  const FILE=location.pathname.split('/').pop()||'10-new-chat.html';
  const PAGES={new:'10-new-chat.html',now:'14-now.html',chat:'01-chat.html',plan:'02-plan.html',res:'12-research.html',doc:'17-doc.html',art:'15-artifacts.html',mem:'16-memory.html',swarm:'04-swarm.html',sens:'13-sensors.html',spend:'05-spend.html',log:'21-journal.html',set:'06-settings.html',conn:'11-connections.html',away:'18-overlays.html',first:'19-first-run.html',login:'20-login-pour.html'};
  const TIP={now:'Сейчас',chat:'Чат',plan:'План · карта',res:'Ресёрч',doc:'Документ стадии',art:'Артефакты',mem:'Память проекта',swarm:'Стая агентов',sens:'Датчики',spend:'Расход',log:'Журнал'};
  const TOP=['now','chat','plan','res','doc','art','mem','swarm','sens','spend','log'];
  const KEY=Object.keys(PAGES).find(k=>PAGES[k]===FILE)||'';
  document.documentElement.dataset.page=KEY;

  const SIDE_KEY='harnessy-side'; let side='wide'; try{ if(localStorage.getItem(SIDE_KEY)==='rail') side='rail'; }catch(e){} document.documentElement.dataset.side=side;
  // ── кадры и размер
  const frames=[...document.querySelectorAll('.frame')]; let cur=0, K=1;
  const box=f=>f&&f.querySelector(':scope > .app, :scope > .stage');
  // телефон: кадр не масштабируется, а перестраивается в одну колонку (правила — в proto.css под html[data-m])
  let mobile=null;
  function mode(){ const m=innerWidth<760; if(m===mobile) return m; mobile=m; document.documentElement.toggleAttribute('data-m',m);
    if(m){ frames.forEach(f=>{ const el=box(f); if(el){ el.style.width=el.style.height=el.style.transform=''; } f.style.width=f.style.height=''; }); document.body.style.overflow='';
      document.querySelectorAll('.main').forEach(x=>x.classList.toggle('m-notop',!x.querySelector(':scope > .top'))); frames.forEach(f=>{ const el=box(f); if(el&&!el.querySelector('.main')) el.classList.add('m-notop'); }); mobileNav(); mobileDefaults(); }
    else document.documentElement.classList.remove('m-open');
    return m; }
  const BW=el=>el.querySelector('aside.side')&&side!=='rail'?1452:1280;   // с широкой панелью кадр шире на её 172px, чтобы полотна не сжимались
  function fit(){ if(mode()) return; const f=frames[cur], el=box(f); if(!el) return; const dh=el.classList.contains('stage')?640:860, vw=innerWidth, vh=innerHeight, bw=BW(el);
    K=Math.max(.62,Math.min(1,vw/bw,vh/dh)); const w=Math.max(bw,vw/K), h=Math.max(dh,vh/K);
    el.style.width=w+'px'; el.style.height=h+'px'; el.style.transform=K<1?'scale('+K+')':'none';
    f.style.width=(w*K)+'px'; f.style.height=(h*K)+'px'; document.body.style.overflow=(w*K>vw+1||h*K>vh+1)?'auto':'hidden'; }
  function show(i){ cur=Math.max(0,Math.min(frames.length-1,i)); frames.forEach((f,j)=>f.classList.toggle('cur',j===cur)); fit();
    const b=document.querySelector('.proto-back'); if(b){ b.style.display=frames[cur]&&frames[cur].querySelector('aside.side')?'none':''; b.textContent=cur>0?'← назад':'← новый чат'; } }

  // ── боковая панель: одна и та же на всех экранах (слово владельца 07.10.2026) — широкая со списком разделов, ⟨ сворачивает в рейку; выбор запоминается
  const XI={new:'<path d="M12 5v14M5 12h14"/>',find:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',conn:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',away:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',folder:'<path d="M3 7h6l2 2h10v10H3z"/>'};
  // «проект» — подробности, свёрнуты по умолчанию (ревью UX 07.10: не должны спорить с «Чатом» и «Сейчас»); раскрываются сами, если открыт их экран
  const WORK=[['now','Сейчас','',1],['chat','Чат','3'],['plan','План · карта','87 · L1']];   // «Сейчас · Чат · План» — не трогать (слово владельца 08.10); счётчик чатов ведёт рабочий слой
  const ico=k=>'<svg viewBox="0 0 24 24">'+(IC[k]||XI[k]||'')+'</svg>'; window.psIcon=ico;   // рабочий слой рисует строки проектов той же иконкой
  const FOLD_KEY='harnessy-side-fold', foldOpen=f=>{ try{ return localStorage.getItem(FOLD_KEY+':'+f)==='1'; }catch(e){ return false; } };
  const limit=(name,p)=>{ const n=24, on=Math.round(p/100*n), warn=p>=90; return '<div class="row"><span>'+name+'</span><b'+(warn?' class="warn"':'')+'>'+p+' %</b></div><div class="ticks'+(warn?' warn':'')+'">'+Array.from({length:n},(_,i)=>'<i'+(i<on?' class="on"':'')+'></i>').join('')+'</div>'; };   // прогресс тиками, как велит дизайн-код; ≥90 % — предупреждение, не сбой
  function sideHTML(){ const rail=side==='rail';
    const item=([k,t,m,badge])=>'<div class="nav'+(k===KEY?' on':'')+'" data-go="'+k+'" title="'+t+'">'+ico(k)+(rail?'':'<span class="t">'+t+'</span>'+(m?'<span class="m">'+m+'</span>':''))+(badge?'<span class="b">2</span>':'')+'</div>';
    const head='<div class="ps-head"><span class="logo" data-go="new" title="Новый чат"><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></span>'+(rail?'':'<b class="ps-proj" title="Проект">Harnessy <i>▾</i></b>')+
      '<span class="col" data-col title="'+(rail?'Развернуть панель':'Свернуть панель')+'">'+(rail?'⟩':'⟨')+'</span></div>';
    const top=rail?'<div class="nav search" title="Найти · ⌘K">'+ico('find')+'</div>':'<div class="newbtn'+(KEY==='new'?' on':'')+'" data-go="new">'+ico('new')+'Новый чат<kbd>⌘N</kbd></div><div class="search">'+ico('find')+'Найти…<kbd>⌘K</kbd></div>';
    // порядок владельца (08.10): новый чат → закреплённые → папки (раскрываются: 4 пункта проекта + чаты) → журнал; низ: уйти, настройки, использовано → расход, профиль
    const work=(rail?'<i class="ps-sep"></i>':'<div class="grp">работа</div>')+WORK.map(item).join('');
    const pins=rail?'':'<div class="grp">закреплённые</div><div class="ps-pins"><div class="ps-chat more">закреплённых пока нет</div></div>';
    const folders=rail?'<i class="ps-sep"></i><div class="nav" data-folders title="Проекты и чаты">'+ico('folder')+'</div>':'<div class="grp">проекты</div><div class="ps-folders"><div class="ps-chat more">проекты — из движка</div></div>';
    const log=(rail?'<i class="ps-sep"></i>':'<div class="grp"></div>')+item(['log','Журнал','']);
    const foot=rail?'<div class="ps-foot">'+item(['away','Уйти',''])+item(['set','Настройки',''])+'<div class="nav'+(KEY==='spend'?' on':'')+'" data-go="spend" title="Использовано → Расход">'+ico('spend')+'</div><div class="nav" data-go="profile" title="Профиль"><span class="av">S<i></i></span></div></div>'
      :'<div class="ps-foot">'+item(['away','Уйти',''])+item(['set','Настройки',''])+'<div class="limits'+(KEY==='spend'?' on':'')+'" data-go="spend" title="Использовано — открыть расход"><div class="cap">использовано</div>'+limit('Claude · неделя',62)+limit('Codex · 5 часов',94)+'</div>'+
       '<div class="user" data-go="profile" title="Профиль"><span class="av">S<i></i></span><div>Serge<small>9616166@gmail.com</small></div><span class="chev">⌄</span></div></div>';
    return head+top+'<div class="ps-scroll">'+work+pins+folders+log+'</div>'+foot; }
  window.psKey=KEY;
  // демонстрация без движка (сайт harnessy.ai): нарисованные папка, роли и закреплённые — рабочий слой заменяет их настоящими, когда движок подключён
  function demoSide(){ if(window.LIVE&&LIVE.H&&LIVE.H.on) return; const pi=ico('folder');
    const proj=[['doc','Документ стадии'],['art','Артефакты'],['mem','Память проекта'],['res','Ресёрч']].map(([k,t])=>'<div class="nav psub'+(k===KEY?' on':'')+'" data-go="'+k+'">'+ico(k)+'<span class="t">'+t+'</span></div>').join('');
    const chats=[['Оркестратор','план H1.5 · рубеж',1,1],['Воркер 1','integration · шаг 4/7',0,1],['Ревьюер','договор H1.5 · раунд 2',0,0]].map(([r,s,act,busy])=>'<div class="ps-chat role'+(act?' act':'')+(busy?' busy':'')+'" data-go="chat"><i></i><span class="t">'+r+'</span><span class="s">'+s+'</span></div>').join('')+'<div class="ps-chat hdr">без роли</div><div class="ps-chat" data-go="chat"><i></i><span class="s one">какие задачи ты можешь решать…</span></div>';
    document.querySelectorAll('aside.side.ps .ps-folders').forEach(b=>{ b.innerHTML='<div class="ps-folder cur" title="демонстрация"><span class="chev">⌄</span>'+pi+'<span class="t">OMG</span><span class="m">6 ролей · git</span></div><div class="ps-fold-body">'+proj+chats+'</div><div class="ps-folder"><span class="chev">›</span>'+pi+'<span class="t">HARNESS</span><span class="m">спит</span></div><div class="ps-folder"><span class="chev">›</span>'+pi+'<span class="t">Принтер Brother</span><span class="m">1 роль</span></div>'; });
    document.querySelectorAll('aside.side.ps .ps-pins').forEach(b=>{ b.innerHTML='<div class="ps-chat pin act" data-go="chat"><i></i><span class="t">OMG</span><span class="m">проект</span></div><div class="ps-chat pin" data-go="chat"><i></i><span class="s one">прогон H1.5 · воркер 1</span><span class="m">чат</span></div>'; });
    document.querySelectorAll('aside.side.ps .ps-proj').forEach(b=>{ b.innerHTML='OMG <i>▾</i>'; b.title='Демонстрация: проект'; }); }
  setTimeout(demoSide,1300); addEventListener('resize',()=>setTimeout(demoSide,50));
  function renderSide(){ document.querySelectorAll('aside.side').forEach(a=>{ const ob=a.querySelector('.nav[data-go="now"] .b'), keep=ob?{t:ob.textContent,d:ob.style.display}:null;   // счётчик «ждут вас» ведёт рабочий слой — не терять при перерисовке
      a.classList.add('ps'); a.classList.toggle('rail',side==='rail'); a.innerHTML=sideHTML(); if(keep){ const nb=a.querySelector('.nav[data-go="now"] .b'); nb.textContent=keep.t; nb.style.display=keep.d; } }); }
  function toggleSide(){ side=side==='rail'?'wide':'rail'; try{ localStorage.setItem(SIDE_KEY,side); }catch(e){} document.documentElement.dataset.side=side; renderSide(); fit(); dispatchEvent(new Event('resize')); }
  renderSide();
  document.addEventListener('click',e=>{ const a=e.target.closest('aside.side'); if(!a) return;
    if(e.target.closest('[data-col]')){ toggleSide(); return; }
    const fd=e.target.closest('.grp.fold'); if(fd){ const f=fd.dataset.fold, open=!foldOpen(f); try{ localStorage.setItem(FOLD_KEY+':'+f,open?'1':'0'); }catch(x){} renderSide(); dispatchEvent(new Event('resize')); return; }
    const g=e.target.closest('[data-go]'); if(!g) return; const k=g.dataset.go;
    if(k==='away'){e.preventDefault();e.stopPropagation();if(KEY==='away'){const button=document.getElementById('leave');if(button)button.click()}else location.href=PAGES.away+'#leave';return}
    if(k==='profile'){ if(window.LIVE) return;   // меню профиля рисует рабочий слой (live.js); старый кадр с тремя меню — только без движка
      if(KEY==='set'&&frames[1]) show(1); else location.href=PAGES.set+'#f2'; return; }
    if(k===KEY){ if(frames.length>1&&cur) show(0); return; }
    if(PAGES[k]){ e.preventDefault(); e.stopPropagation(); location.href=PAGES[k]; } },true);
  addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='n'&&KEY!=='new'){ e.preventDefault(); location.href=PAGES.new; } });

  // ── навигация телефона: кнопка ☰ и выдвижная панель со всеми экранами
  function mobileNav(){ if(document.querySelector('.m-btn')) return;
    const X={new:'<path d="M12 5v14M5 12h14"/>',conn:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',away:'<path d="M20 14.5A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>'};
    const item=(k,tx,extra)=>'<a class="m-i'+(k===KEY?' on':'')+(extra==='p'?' p':'')+'" href="'+PAGES[k]+(k==='away'?'#leave':'')+'"><svg viewBox="0 0 24 24">'+(IC[k]||X[k]||'')+'</svg>'+tx+(extra&&extra!=='p'?'<small>'+extra+'</small>':'')+'</a>';
    const btn=document.createElement('button'); btn.className='m-btn'; btn.setAttribute('aria-label','Меню'); btn.textContent='☰';
    const bg=document.createElement('div'); bg.className='m-bg';
    const dr=document.createElement('nav'); dr.className='m-drawer';
    dr.innerHTML='<div class="m-h"><i><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></i>Harnessy<span data-mx>×</span></div>'+item('new','Новый чат','p')+
      '<div class="m-g">работа</div>'+item('now','Сейчас','2')+item('chat','Чат')+item('plan','План · карта')+item('doc','Документ стадии')+item('art','Артефакты')+item('mem','Память проекта')+item('res','Ресёрч')+
      '<div class="m-g">команда</div>'+item('swarm','Стая агентов')+item('sens','Датчики')+item('spend','Расход')+item('conn','Подключения и лимиты')+
      '<div class="m-g">прочее</div>'+item('log','Журнал')+item('set','Настройки')+item('away','Уйти')+
      '<div class="m-f"><a href="../disarto/'+FILE+'">этот экран листом, с пояснениями ↗</a><a href="../disarto/index.html">все скетчи ↗</a></div>';
    document.body.append(btn,bg,dr);
    const open=v=>document.documentElement.classList.toggle('m-open',v);
    btn.addEventListener('click',()=>open(true)); bg.addEventListener('click',()=>open(false)); dr.addEventListener('click',e=>{ if(e.target.closest('[data-mx]')) open(false); }); }
  // на телефоне полотна со связями уступают место спискам и карточкам, если у экрана такой вид есть
  function mobileDefaults(){ const F=document.querySelector('.frame.cur')||document, on=F.querySelector('.seg [data-v].on');
    if(on&&['board','map','graph','canvas'].includes(on.dataset.v)){ const s=F.querySelector('.seg [data-v="cards"], .seg [data-v="list"]'); if(s) s.click(); }
    const md=[...F.querySelectorAll('.mode span')].find(s=>/список/i.test(s.textContent)); if(md&&!md.classList.contains('on')) md.click(); }

  // ── служебные ссылки
  const note=document.createElement('a'); note.className='proto-note'; note.href='../disarto/'+FILE; note.textContent='скетч с пояснениями ↗'; note.title='Этот же экран листом: с описанием, подписями и сверкой'; document.body.appendChild(note);
  const back=document.createElement('a'); back.className='proto-back'; back.href=PAGES.new; document.body.appendChild(back);   // у кадра без боковой панели — выход назад
  back.addEventListener('click',e=>{ if(cur>0){ e.preventDefault(); show(0); } });

  // «назад» везде: кнопка в шапке экрана — история окна (в Electron нет кнопок браузера)
  document.querySelectorAll('.frame .main > .top').forEach(top=>{ const b=document.createElement('span'); b.className='proto-hist'; b.title='Назад'; b.textContent='‹'; b.addEventListener('click',()=>{ if(history.length>1) history.back(); else location.href=PAGES.new; }); top.prepend(b); });
  show(location.hash==='#f2'&&frames[1]?1:0);
  addEventListener('resize',fit);
})();
