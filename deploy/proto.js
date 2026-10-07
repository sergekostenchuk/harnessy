/* proto.js — режим прототипа для экранов-скетчей (включается атрибутом <html data-proto>, его ставит сборка).
   Что делает: (1) экран на всё окно: кадр 1280×860 растягивается, в окне меньше — уменьшается целиком;
   (2) единая рабочая навигация: рейка и боковая панель ведут на экраны; «⟨ / ⟩» сворачивает и разворачивает панель;
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
  function fit(){ if(mode()) return; const f=frames[cur], el=box(f); if(!el) return; const dh=el.classList.contains('stage')?640:860, vw=innerWidth, vh=innerHeight;
    K=Math.max(.62,Math.min(1,vw/1280,vh/dh)); const w=Math.max(1280,vw/K), h=Math.max(dh,vh/K);
    el.style.width=w+'px'; el.style.height=h+'px'; el.style.transform=K<1?'scale('+K+')':'none';
    f.style.width=(w*K)+'px'; f.style.height=(h*K)+'px'; document.body.style.overflow=(w*K>vw+1||h*K>vh+1)?'auto':'hidden'; }
  function show(i){ cur=Math.max(0,Math.min(frames.length-1,i)); frames.forEach((f,j)=>f.classList.toggle('cur',j===cur)); fit();
    const b=document.querySelector('.proto-back'); if(b){ b.style.display=frames[cur]&&frames[cur].querySelector('aside.side')?'none':''; b.textContent=cur>0?'← назад':'← новый чат'; } }

  // ── навигация
  const wide=frames.some(f=>f.querySelector('aside .ws'));      // у экрана есть развёрнутая боковая панель
  const shared=!!document.querySelector('link[href="style.css"]');
  function railHTML(){ const nav=(k,inner,tip,extra)=>'<div class="nav'+(k===KEY?' on':'')+'" data-go="'+k+'" title="'+tip+'"'+(extra||'')+'>'+inner+'</div>';
    return '<div class="logo" data-go="new" title="Новый чат"><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></div>'+
      (wide?'<div class="nav" data-col title="Развернуть панель" style="font:13px var(--mono)">⟩</div>':'')+
      TOP.map(k=>nav(k,'<svg viewBox="0 0 24 24">'+IC[k]+'</svg>'+(k==='now'?'<span class="b">2</span>':''),TIP[k])).join('')+
      '<div class="foot">'+nav('set','<svg viewBox="0 0 24 24">'+IC.set+'</svg>','Настройки')+nav('conn','<span class="ring"><i></i></span>','Подключения и лимиты')+
      '<div class="nav" data-go="profile" title="Профиль"><span class="av">S<i></i></span></div></div>'; }
  const TEXT=[[/^Новый чат/,'new'],[/^Найти/,'away'],[/^Чат/,'chat'],[/^План/,'plan'],[/^Стая/,'swarm'],[/^Расход/,'spend'],[/^Журнал/,'log'],[/^Сейчас/,'now'],
    [/^Оркестратор/,'chat'],[/^Карта проекта/,'plan'],[/^Рес[её]рчер/,'res'],[/^Артефакты/,'art'],[/^OMG/,'now'],[/^HARNESS/,'chat'],
    [/^Уйти/,'away'],[/^Настройки/,'set'],[/Claude\s*·\s*неделя/,'conn'],[/Serge/,'profile']];
  document.querySelectorAll('aside.side').forEach(a=>{
    if(a.querySelector('.ws')||!shared){     // развёрнутая панель (или экран со своими стилями): оживляем пункты по подписи
      a.querySelectorAll('.newbtn, .search, .nav, .conv, .limits, .user, .logo').forEach(el=>{ if(el.dataset.go||el.closest('.ws')) return; const tx=el.textContent.replace(/\s+/g,' ').trim(), m=TEXT.find(q=>q[0].test(tx)); if(m) el.dataset.go=m[1]; else if(el.title){ const t=TEXT.find(q=>q[0].test(el.title)); if(t) el.dataset.go=t[1]; } });
    } else a.innerHTML=railHTML();             // рейка: одна и та же на всех экранах
  });
  document.addEventListener('click',e=>{ const a=e.target.closest('aside'); if(!a) return;
    if(e.target.closest('[data-col], .col')&&frames.length>1){ show(cur?0:1); return; }
    const g=e.target.closest('[data-go]'); if(!g) return; const k=g.dataset.go;
    if(k==='profile'){ if(KEY==='set'&&frames[1]) show(1); else location.href=PAGES.set+'#f2'; return; }
    if(k===KEY){ if(frames.length>1&&cur) show(0); return; }
    if(PAGES[k]){ e.preventDefault(); e.stopPropagation(); location.href=PAGES[k]; } },true);

  // ── навигация телефона: кнопка ☰ и выдвижная панель со всеми экранами
  function mobileNav(){ if(document.querySelector('.m-btn')) return;
    const X={new:'<path d="M12 5v14M5 12h14"/>',conn:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',away:'<path d="M20 14.5A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>'};
    const item=(k,tx,extra)=>'<a class="m-i'+(k===KEY?' on':'')+(extra==='p'?' p':'')+'" href="'+PAGES[k]+'"><svg viewBox="0 0 24 24">'+(IC[k]||X[k]||'')+'</svg>'+tx+(extra&&extra!=='p'?'<small>'+extra+'</small>':'')+'</a>';
    const btn=document.createElement('button'); btn.className='m-btn'; btn.setAttribute('aria-label','Меню'); btn.textContent='☰';
    const bg=document.createElement('div'); bg.className='m-bg';
    const dr=document.createElement('nav'); dr.className='m-drawer';
    dr.innerHTML='<div class="m-h"><i><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></i>Harnessy<span data-mx>×</span></div>'+item('new','Новый чат','p')+
      '<div class="m-g">работа</div>'+item('now','Сейчас','2')+item('chat','Чат')+item('plan','План · карта')+item('doc','Документ стадии')+item('art','Артефакты')+item('mem','Память проекта')+item('res','Ресёрч')+
      '<div class="m-g">команда</div>'+item('swarm','Стая агентов')+item('sens','Датчики')+item('spend','Расход','94 %')+item('conn','Подключения и лимиты')+
      '<div class="m-g">прочее</div>'+item('log','Журнал')+item('set','Настройки')+item('away','Уйти · окно · поиск')+
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

  show(location.hash==='#f2'&&frames[1]?1:0);
  addEventListener('resize',fit);
})();
