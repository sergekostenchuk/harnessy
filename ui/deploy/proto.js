/* LIVE_BOOT_START: also inlined as the first head script by build.py. */
(function(){
  if(window.HARNESS_BOOT) return;
  const root=document.documentElement, KEY='harnessy-live-snapshot-v1', PROJECT='harnessy-live-project-v1';
  root.setAttribute('data-live-pending','');
  let timer, connected=false, switching=false, generation=0, requested=0, confirmed=0;
  const read=k=>{try{return sessionStorage.getItem(k)}catch(e){return null}};
  const write=(k,v)=>{try{sessionStorage.setItem(k,v)}catch(e){}};
  function snapshot(){
    try{const s=JSON.parse(read(KEY)||'null'),project=read(PROJECT);
      return s&&s.v===1&&typeof project==='string'&&s.project===project&&s.status&&s.status.project===project&&Array.isArray(s.status.panes)&&s.status.panes.every(p=>p&&typeof p.id==='string')&&Array.isArray(s.chats)&&s.chats.every(c=>c&&typeof c.id==='string'&&typeof c.pane==='string')&&Array.isArray(s.projects)&&s.projects.every(p=>p&&typeof p.path==='string')&&Array.isArray(s.pins)&&s.pins.every(p=>p&&typeof p.path==='string')&&(!s.status.models||typeof s.status.models==='object'&&!Array.isArray(s.status.models))?s:null;
    }catch(e){return null}
  }
  function caption(text){if(!document.body){document.addEventListener('DOMContentLoaded',()=>{if(root.hasAttribute('data-live-mock')||root.hasAttribute('data-live-pending'))caption(text)},{once:true});return}let el=document.getElementById('live-boot-state');if(!el){el=document.createElement('div');el.id='live-boot-state';el.setAttribute('role','status');document.body.appendChild(el)}el.textContent=text;return el}
  const boot=window.HARNESS_BOOT={snapshot,
    capture(){return Object.freeze({generation,request:++requested})},
    current(token){return !!token&&token.generation===generation&&Number.isSafeInteger(token.request)&&token.request>0&&token.request<=requested&&token.request>=confirmed},
    invalidate(){generation++},
    select(project){if(typeof project==='string'){generation++;switching=true;write(PROJECT,project)}},
    confirm(project,token){if(!boot.current(token)||typeof project!=='string'||switching&&read(PROJECT)!==project)return false;confirmed=token.request;switching=false;write(PROJECT,project);return true},
    save(status,chats,projects,pins){if(!status||typeof status.project!=='string'||!Array.isArray(status.panes)||!Array.isArray(chats))return;
      const selected=read(PROJECT);if(selected!==null&&selected!==status.project)return;const {auth,...publicStatus}=status;if(selected===null)write(PROJECT,status.project);
      write(KEY,JSON.stringify({v:1,project:status.project,status:publicStatus,chats,projects:projects||[],pins:pins||[]}));
    },
    preview(){root.setAttribute('data-live-preview','');caption('Обновляю данные проекта…')},
    accept(){connected=true;clearTimeout(timer)},
    ready(){connected=true;clearTimeout(timer);root.removeAttribute('data-live-pending');root.removeAttribute('data-live-preview');root.removeAttribute('data-live-mock');root.setAttribute('data-live','');const el=document.getElementById('live-boot-state');if(el)el.remove()},
    offline(){if(connected)return;root.removeAttribute('data-live-pending');root.removeAttribute('data-live-preview');root.setAttribute('data-live-mock','');caption('макет · движок недоступен');if(boot.onOffline)boot.onOffline()}
  };
  timer=setTimeout(()=>boot.offline(),1500);
})();
/* LIVE_BOOT_END */
/* proto.js — режим прототипа для экранов-скетчей (включается атрибутом <html data-proto>, его ставит сборка).
   Что делает: (1) экран на всё окно: кадр 1280×860 растягивается, в окне меньше — уменьшается целиком;
   (2) единая боковая панель на всех экранах: «Новый чат», поиск, разделы по группам, проекты, лимиты, профиль; «⟨ / ⟩» сворачивает в рейку;
   (3) сбоку ссылка на тот же экран с пояснениями (лист-скетч). Исходники скетчей не меняются. */
(function(){
  if(!document.documentElement.hasAttribute('data-proto')) return;
  /*IC*/
  const FILE=location.pathname.split('/').pop()||'10-new-chat.html';
  const PAGES={new:'10-new-chat.html',now:'14-now.html',chat:'01-chat.html',plan:'02-plan.html',path:'28-path.html',res:'12-research.html',doc:'17-doc.html',art:'15-artifacts.html',mem:'16-memory.html',swarm:'04-swarm.html',sens:'13-sensors.html',spend:'05-spend.html',events:'09-events.html',log:'21-journal.html',set:'06-settings.html',conn:'11-connections.html',away:'18-overlays.html',first:'19-first-run.html',login:'20-login-pour.html'};
  const TIP={now:'Входящие',chat:'Чат',plan:'План · карта',path:'Путь',res:'Исследования',doc:'Документы проекта',art:'Артефакты',mem:'Память проекта',swarm:'Команда агентов',sens:'Дашборд',spend:'Расход и лимиты',events:'События',log:'Журнал'};
  const TOP=['now','chat','plan','path','res','doc','art','mem','swarm','sens','spend','events','log'];
  const PATH_FILES=['28-path.html','29-discovery-frame.html','30-discovery-progress.html','31-discovery-dossier.html','32-discovery-variants.html','33-discovery-summary.html','34-discovery-unknowns.html','35-concept-to-features.html','36-om-owner-questions.html','37-execution-review.html','38-project-result.html'];
  /* экран «План · карта» сохраняет обе прежние вкладки и добавляет «Путь» */
  const PLAN_TABS=[['om','Карта проекта','02-om-map.html'],['user','План пользователя','02-plan.html'],['path','Путь','28-path.html']], PLAN_KEY='harnessy-plan-tab';
  const planTab=()=>{ let t='om'; try{ t=localStorage.getItem(PLAN_KEY)||'om'; }catch(e){} return PLAN_TABS.find(x=>x[0]===t)||PLAN_TABS[0]; };
  const planPage=()=>{ const t=planTab(); return t[2]+'#'+t[0]; };
  const SKETCH={'02-om-map.html':'26-om-map.html'};   /* лист с пояснениями для экрана, собранного из другого скетча */
  const KEY=Object.keys(PAGES).find(k=>PAGES[k]===FILE)||(PATH_FILES.includes(FILE)?'path':PLAN_TABS.some(t=>t[2]===FILE)?'plan':'');
  document.documentElement.dataset.page=KEY;
  if(KEY==='plan'||KEY==='path'){ const cur=KEY==='path'?PLAN_TABS[2]:(PLAN_TABS.find(t=>t[2]===FILE)||PLAN_TABS[1]); try{ localStorage.setItem(PLAN_KEY,cur[0]); }catch(e){} if(!location.hash) history.replaceState(null,'','#'+cur[0]);
    document.querySelectorAll('.frame .main .top').forEach(top=>{ if(top.querySelector('.plan-tabs')) return; const seg=document.createElement('span'); seg.className='seg plan-tabs';
      seg.innerHTML=PLAN_TABS.map(t=>'<span'+(t===cur?' class="on"':'')+' data-ptab="'+t[0]+'" title="'+t[1]+'">'+t[1]+'</span>').join('');
      seg.addEventListener('click',e=>{ const s=e.target.closest('[data-ptab]'); if(!s) return; const t=PLAN_TABS.find(x=>x[0]===s.dataset.ptab); if(!t||t===cur) return; try{ localStorage.setItem(PLAN_KEY,t[0]); }catch(x){} location.href=t[2]+'#'+t[0]; });
      const b=top.querySelector(':scope > b'); if(b) b.after(seg); else top.prepend(seg); }); }
  // TS-15a specification labels are independent of connection/boot state.
  const SPEC={
    res:['частично','Материалы читаются из проекта; ход исследования, прошлые исследования и версии отмечены как макет.'],
    art:['частично','Артефакты читаются из проекта; статусы проверки, витрина и версии отмечены как макет.'],
    mem:['частично','Память читается из проекта; применение правил и противоречия отмечены как макет.'],
    doc:['частично','Документы и разделы читаются из проекта; история версий и переходы между стадиями — макет.'],
    plan:['макет','План, задачи и показатели пока показаны на примере: движок не отдаёт карту работ.'],
    path:['макет','Путь и его стадии показаны на примере: движок Harnessy пока не подключён к OMG.'],
    swarm:['частично','Состав, состояния и канал читаются из текущего проекта. Сравнение, цена простоя и неподключённые показатели отмечены на блоках.'],
    sens:['макет','Дашборд и пороги — пример; движок пока не отдаёт эти измерения.'],
    now:['частично','Решения и подтверждения приходят от движка; остальные показатели и прогнозы пока демонстрационные.'],
    events:['частично','Лента читается из журнала текущего проекта. Соседние блоки — примеры уведомлений и состояний.'],
    spend:['частично','Журнал ходов и расчёты имеют источник; неподключённые подписки, лимиты и прогнозы отмечены на блоках.'],
    first:['частично','Модель, оркестратор и состав — из движка; прогноза цены первого хода пока нет.'],
    login:['макет','Серверный вход и перенос данных пока показаны на примере.'],
    away:['частично','Чат и выбор условий доступны; исполнение условий ухода движком пока не поддерживается.']
  };
  function specificationLabels(){const spec=SPEC[KEY];if(!spec)return;document.documentElement.setAttribute('data-spec-state',spec[0]);
    document.querySelectorAll('.frame').forEach(frame=>{const app=frame.querySelector('.app,.stage');if(!app||app.querySelector('.spec-banner'))return;
      const banner=document.createElement('div');banner.className='spec-banner';banner.setAttribute('role','note');
      banner.textContent='Макет · образец данных · страница: '+spec[0]+'. '+spec[1];
      const main=app.querySelector('.main'),top=main&&main.querySelector('.top');
      if(top){const heading=document.createElement('div');heading.className='spec-heading';top.before(heading);heading.appendChild(banner);top.remove();heading.appendChild(top)}else app.insertBefore(banner,app.firstChild);
    });
    const partial={now:'#v-turn .nums, #v-away .nums, #v-week .nums',away:'.leave-policy'};
    if(partial[KEY])document.querySelectorAll(partial[KEY]).forEach(block=>block.setAttribute('data-spec-mock',spec[1]));
    document.querySelectorAll('[data-spec-mock]').forEach(block=>{if(block.querySelector('.spec-block'))return;const label=document.createElement('div');label.className='spec-block';label.textContent='Макет · '+block.dataset.specMock;block.insertBefore(label,block.firstChild)});
  }
  specificationLabels();
  // End TS-15a specification labels.


  const PS2_MODE_KEY='harnessy-side-mode-v2', PS2_PANEL_KEY='harnessy-side-panel-v2';
  let ps2Mode='chats', panelOpen=true;
  try{const saved=localStorage.getItem(PS2_MODE_KEY);if(['chats','inbox','project','team'].includes(saved))ps2Mode=saved;panelOpen=localStorage.getItem(PS2_PANEL_KEY)!=='closed'}catch(e){}
  document.documentElement.dataset.ps2Mode=ps2Mode;document.documentElement.dataset.ps2Panel=panelOpen?'open':'closed';
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
  const BW=el=>el.querySelector('aside.side')&&panelOpen?1440:1280;
  function fit(){ if(mode()) return; const f=frames[cur], el=box(f); if(!el) return; const dh=el.classList.contains('stage')?640:860, vw=innerWidth, vh=innerHeight, bw=BW(el);
    K=Math.max(.62,Math.min(1,vw/bw,vh/dh)); const w=Math.max(bw,vw/K), h=Math.max(dh,vh/K);
    el.style.width=w+'px'; el.style.height=h+'px'; el.style.transform=K<1?'scale('+K+')':'none';
    f.style.width=(w*K)+'px'; f.style.height=(h*K)+'px'; document.body.style.overflow=(w*K>vw+1||h*K>vh+1)?'auto':'hidden'; }
  function show(i){ cur=Math.max(0,Math.min(frames.length-1,i)); frames.forEach((f,j)=>f.classList.toggle('cur',j===cur)); fit();
    const b=document.querySelector('.proto-back'); if(b){ b.style.display=frames[cur]&&frames[cur].querySelector('aside.side')?'none':''; b.textContent=cur>0?'← назад':'← новый чат'; } }

  // ── боковая панель v2: постоянная рейка и отпускаемая панель режима
  const XI={new:'<path d="M12 5v14M5 12h14"/>',find:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',inbox:'<path d="M3 13l2-8h14l2 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',chat:'<path d="M4 6h16v10H9l-5 4z"/>',pin:'<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>',folder:'<path d="M3 7h6l2 2h10v10H3z"/>',path:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h6a4 4 0 010 8H10a4 4 0 000 8h6"/>',swarm:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 18c0-2 2-3.5 4-3.5s3 1 3 3"/>',auto:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',toproj:'<path d="M3 7h6l2 2h10v10H3z"/><path d="M12 11v6M9 14h6"/>',user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',help:'<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.6-2.5 2-2.5 3.5M12 16.5h.01"/>',keys:'<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h1M11 11h1M15 11h1M8 15h8"/>',logout:'<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9"/>'};
  const ico=k=>'<svg viewBox="0 0 24 24">'+(IC[k]||XI[k]||'')+'</svg>';window.psIcon=ico;window.psKey=KEY;
  const html=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={project:{name:'Без проекта',path:'',repo:false},inbox:{need:0,info:0,unavailable:true},pinned:[],chats:[],rooms:[],projects:[],sections:{},profile:{name:'Без имени',email:'',configured:false},limits:[],live:false,othersOpen:false};
  const inboxCounts=globalThis.HARNESS_INBOX_COUNTS||function(value){value=value||{};const need=Number.isSafeInteger(value.need)&&value.need>=0?value.need:0,info=Number.isSafeInteger(value.info)&&value.info>=0?value.info:0;return {need,info,total:need+info}};
  globalThis.HARNESS_INBOX_COUNTS=inboxCounts;
  const projectName=()=>state.project&&state.project.name||'Без проекта';
  const tag=t=>'<span class="tag mock">'+html(t||'макет')+'</span>';
  const currentProject=project=>!project||!project.path||project.path===(state.project&&state.project.path);
  const count=(project,key,suffix)=>currentProject(project)&&Number.isSafeInteger(state.sections&&state.sections[key])?'<span class="m">'+state.sections[key]+(suffix||'')+'</span>':tag('нет данных');
  const projectItems=(project=state.project)=>[
    ['new','Новый чат в проекте','',true],['doc','Документы',count(project,'docs')],['art','Артефакты',count(project,'artifacts')],['mem','Память проекта',count(project,'memory',' правил')],['res','Исследования',count(project,'research',' вопроса')],['plan','План · карта',tag('макет')],['path','Путь',tag('макет')],['swarm','Команда агентов',currentProject(project)&&state.live?'<span class="m">'+(state.chats||[]).length+' роли</span>':tag('нет данных')]
  ];
  function projectMenu(project){const name=html(project&&project.name||projectName()),path=html(project&&project.path||state.project.path||'');return '<div class="ps2-pmenu"><div class="hd">'+name+'<small>в проекте '+name+'</small></div>'+projectItems(project).map((it,i)=>(i===1?'<hr>':'')+'<div class="it'+(it[3]?' acc':'')+'" data-go="'+it[0]+'" data-project-path="'+path+'">'+ico(it[0])+'<span class="t">'+it[1]+'</span>'+it[2]+'</div>').join('')+'<div class="ft">пункты открывают страницы этого проекта</div></div>'}
  const projectRow=p=>'<div class="ps-chat ps2-prow" data-ps2-project-path="'+html(p.path||'')+'" title="Открыть меню проекта">'+ico('folder')+'<span class="s">'+html(p.name)+'</span><span class="m">'+(Number.isSafeInteger(p.seats)?p.seats+' роли':'')+'</span><span class="pm">›</span>'+projectMenu(p)+'</div>';
  const chatRow=(c,pinned)=>{const bound=pinned&&c.kind==='chat'&&c.path,attrs=bound?' data-pin-chat="'+html(c.id||'')+'" data-pin-path="'+html(c.path)+'" data-cur="'+(c.current||c.path===state.project.path?1:0)+'"':' data-chat="'+html(c.id||'')+'" data-pane="'+html(c.pane||'room')+'"';return '<div class="ps-chat'+(c.active?' act':'')+(c.state?' '+c.state:'')+(pinned?' pin':'')+'"'+attrs+'><i></i><span class="s">'+html(c.title||'разговор ещё пуст')+'</span>'+(c.role||c.label?'<span class="m">'+html(c.role||c.label)+'</span>':'')+'</div>'};
  function inboxRow(){const c=inboxCounts(state.inbox),cls=c.need?' has':c.info?' info':' zero',unavailable=state.inbox&&state.inbox.unavailable||!state.live;return '<div class="ps2-inbox'+cls+(ps2Mode==='inbox'?' on':'')+'" data-ps2-mode="inbox" data-ps2-action-mode title="Входящие: '+c.need+' требуют действия · '+c.info+' к сведению">'+ico('inbox')+'<span class="t">Входящие</span>'+(c.need?'<span class="b">'+c.need+'</span>':'')+(c.info?'<span class="b2">'+c.info+'</span>':'')+(unavailable?tag('нет данных'):state.inbox.mock?tag('макет'):'')+'</div>'}
  function limits(){const attr=' data-spend-limits role="button" tabindex="0" aria-label="Все лимиты подписок"';if(!state.limits||!state.limits.length)return '<div class="ps2-lim none"'+attr+'>'+(state.live?'Лимитов нет':'Лимиты недоступны')+'</div>';return '<div class="ps2-lim"'+attr+' title="Осталось · все лимиты">'+state.limits.slice(0,2).map(l=>{const p=Math.max(0,Math.min(100,Number(l.remaining)||0)),tone=p<=10?' bad':p<=25?' warn':'';return '<span class="v'+tone+'" style="--p:'+p+'%"><span>'+html(l.name)+'</span><b>'+p.toLocaleString('ru-RU')+' %</b><i>'+html(l.period||'')+'</i><u></u></span>'}).join('')+'</div>'}
  function profileMenu(){
    const p=state.profile||{},name=html(p.name||'Без имени'),email=html(p.email||''),initial=p.configured?Array.from(p.name||'')[0]||'?':'?';
    const link=(href,icon,label,tail='')=>'<a class="it" href="'+href+'">'+ico(icon)+label+tail+'</a>';
    return '<div class="ps2-menu"><div class="hd"><span class="av">'+html(initial)+'<i></i></span><div>'+name+(email?'<small>'+email+'</small>':'')+'</div><span class="bd">'+(state.live?'alpha':'макет')+'</span></div>'+
      link('06-settings.html#p=look','set','Облик','<span class="tgl">графит</span>')+'<hr>'+link('06-settings.html#p=profile','user','Профиль')+link('11-connections.html','conn','Подключения')+link('06-settings.html','set','Настройки','<kbd>⌘,</kbd>')+
      '<hr><div class="it ap dis">'+ico('auto')+'<div>Автопилот<span class="st">позже</span><small>появится в части C</small></div><span class="ps2-tg"></span></div><hr>'+link('21-journal.html','log','Журнал')+'<div class="it dis">'+ico('help')+'Справка'+tag('нет в движке')+'</div>'+link('06-settings.html#p=keys','keys','Клавиши','<kbd>⌘/</kbd>')+
      (email?'<hr><div class="it bad dis">'+ico('logout')+'Выйти'+tag('нет действия')+'</div>':'')+'<div class="ft"><span>'+(globalThis.HARNESS_RELEASE?html(globalThis.HARNESS_RELEASE.label):'alpha')+'</span></div></div>';
  }
  function profile(){const p=state.profile||{},name=html(p.name||'Без имени'),email=html(p.email||''),initial=p.configured?Array.from(p.name||'')[0]||'?':'?';return profileMenu()+'<div class="ps2-prof" data-ps2-profile role="button" tabindex="0" title="'+(p.configured?'Профиль':'Указать имя в профиле')+'"><span class="av">'+html(initial)+'<i></i></span><div>'+name+(email?'<small>'+email+'</small>':'<small>'+(p.configured?'локально':'Указать в профиле →')+'</small>')+'</div><span class="chev">▾</span></div>'}
  function rail(){const c=inboxCounts(state.inbox),limit=state.limits&&state.limits[0],item=(mode,label,icon,badge)=>'<div class="nav'+(ps2Mode===mode&&panelOpen?' on':'')+'" data-ps2-mode="'+mode+'" data-ps2-action-mode title="'+label+'">'+ico(icon)+(badge?'<span class="b">'+badge+'</span>':'')+'</div>';return '<div class="ps-head"><span class="logo" data-go="new" title="Новый чат">'+ico('logo')+'</span></div><div class="newbtn" data-go="new" title="Новый чат · ⌘N">'+ico('new')+'</div><div class="search" data-ps2-search title="Найти · ⌘K">'+ico('find')+'</div><div class="ps-scroll"><i class="ps-sep"></i>'+item('chats','Чаты','chat')+item('inbox','Входящие','inbox',c.need||'')+'<i class="ps-sep"></i>'+item('project','Проект','folder')+item('team','Команда','swarm')+'</div><div class="ps-foot"><span class="nav" data-go="set" title="Настройки">'+ico('set')+'</span><span class="ps2-ring'+(limit?'':' dim')+'" style="--p:'+(limit?limit.remaining:0)+'%" data-spend-limits role="button" tabindex="0" aria-label="Все лимиты подписок" title="'+(state.live?'Осталось · все лимиты':'Лимиты недоступны')+'"><i></i></span>'+profileMenu()+'<span class="av" data-ps2-profile title="Профиль">'+html(state.profile&&state.profile.configured?Array.from(state.profile.name||'')[0]||'?':'?')+'<i></i></span></div>'}
  function newChat(){return '<div class="ps2-newwrap"><div class="newbtn" data-go="new">'+ico('new')+'Новый чат<kbd>⌘N</kbd><span class="dd" data-ps2-newpick>▾</span></div><div class="ps2-newpick"><div class="hd">новый чат</div><div class="it" data-new-scope="project">'+ico('folder')+'в проекте '+html(projectName())+'<kbd>⌘N</kbd></div><div class="it" data-new-scope="solo">'+ico('chat')+'без проекта<kbd>⇧⌘N</kbd></div></div></div>'}
  function others(){const rows=(state.projects||[]).filter(p=>!p.current);return '<div class="ps2-others'+(state.othersOpen?' open':'')+'" data-ps2-others>'+ico('folder')+'<span class="t">Другие проекты</span><span class="m">'+rows.length+'</span><span class="chev">›</span></div>'+(state.othersOpen?'<div class="ps2-others-list">'+(rows.map(projectRow).join('')||'<div class="ps-chat more">других проектов нет</div>')+'</div>':'')}
  function chatPanel(){const current=(state.projects||[]).find(p=>p.current)||state.project||{},chats=state.chats||[],rooms=state.rooms||[];return newChat()+'<div class="search" data-ps2-search>'+ico('find')+'Найти…<kbd>⌘K</kbd></div><div class="ps-scroll">'+inboxRow()+'<div class="grp">закреплённые</div>'+((state.pinned||[]).map(c=>c.kind==='folder'?projectRow(c):chatRow(c,true)).join('')||'<div class="ps-chat more">закреплённых пока нет</div>')+'<div class="grp ps2-prow">чаты · '+html(projectName())+'<span class="m">'+chats.length+'</span><span class="pm">›</span>'+projectMenu(current)+'</div>'+chats.map(c=>chatRow(c,false)).join('')+'<div class="grp">чаты без проекта<span class="m">'+rooms.length+'</span></div><div class="ps2-grpbody">'+(rooms.map(c=>chatRow(c,false)).join('')||'<div class="ps-chat more">пока нет</div>')+'</div>'+others()+'</div>'}
  function projectPanel(){const chats=state.chats||[],busy=chats.filter(c=>c.state==='busy').length,c=inboxCounts(state.inbox);return '<div class="ps-scroll"><div class="ps2-pcard"><b>'+html(projectName())+'</b>'+(state.project.repo?'git · ':'')+chats.length+' роли<span class="m">'+(c.need?'<span class="wait">входящие · '+c.need+'</span> · ':'')+(busy?'идёт ход · '+busy:'тихо')+'</span></div><div class="grp">разделы</div>'+projectItems(state.project).slice(1).map(it=>'<div class="nav'+(window.psKey===it[0]?' on':'')+'" data-go="'+it[0]+'">'+ico(it[0])+'<span class="t">'+it[1]+'</span>'+it[2]+'</div>').join('')+others()+'</div>'}
  function inboxPanel(){const c=inboxCounts(state.inbox);return '<div class="ps-scroll"><div class="ps2-pcard"><b>Входящие</b>'+c.need+' требуют действия · '+c.info+' к сведению<span class="m">'+(state.live?'из движка':'источник недоступен')+'</span></div><div class="nav on" data-go="now">'+ico('inbox')+'<span class="t">Открыть входящие</span><span class="m">'+c.total+'</span></div></div>'}
  function teamPanel(){const chats=state.chats||[];return '<div class="ps-scroll"><div class="ps2-pcard"><b>Команда агентов</b>'+chats.length+' роли<span class="m">'+(chats.some(c=>c.state==='busy')?'есть активный ход':'сейчас тихо')+'</span></div>'+chats.map(c=>chatRow(c,false)).join('')+'<div class="nav" data-go="swarm">'+ico('swarm')+'<span class="t">Открыть команду</span></div></div>'}
  function panelBody(){return ps2Mode==='project'?projectPanel():ps2Mode==='inbox'?inboxPanel():ps2Mode==='team'?teamPanel():chatPanel()}
  function modePanel(){const title={chats:'Чаты',inbox:'Входящие',project:'Проект',team:'Команда'}[ps2Mode];return '<div class="ps2-mh">'+title+'<b class="ps-proj ps2-prow">'+html(projectName())+' <i>▾</i>'+projectMenu(state.project)+'</b><span class="ic on" title="Панель закреплена">'+ico('pin')+'</span><span class="ic" data-ps2-release title="Отпустить панель">×</span></div>'+panelBody()+'<div class="ps-foot">'+limits()+profile()+'</div>'}
  function renderSide(){document.documentElement.dataset.ps2Mode=ps2Mode;document.documentElement.dataset.ps2Panel=panelOpen?'open':'closed';document.querySelectorAll('.frame > .app, .frame > .stage').forEach(app=>{const aside=app.querySelector(':scope > aside.side');if(!aside)return;aside.className='side ps rail';aside.innerHTML=rail();let mode=app.querySelector(':scope > .ps2-mode');if(!mode){mode=document.createElement('div');mode.className='ps2-mode';aside.after(mode)}mode.hidden=!panelOpen;mode.innerHTML=modePanel()});fit()}
  function setMode(mode){if(!['chats','inbox','project','team'].includes(mode))return;if(ps2Mode===mode&&panelOpen)panelOpen=false;else{ps2Mode=mode;panelOpen=true}try{localStorage.setItem(PS2_MODE_KEY,ps2Mode);localStorage.setItem(PS2_PANEL_KEY,panelOpen?'open':'closed')}catch(e){}renderSide()}
  function setData(next){if(!next||typeof next!=='object')return;for(const key of ['project','inbox','pinned','chats','rooms','projects','sections','profile','limits','live'])if(Object.prototype.hasOwnProperty.call(next,key))state[key]=next[key];renderSide();renderWorkspaceHeader()}
  function topProjectMenu(){const projects=[...(state.projects||[])];if(state.project&&state.project.path&&!projects.some(project=>project.path===state.project.path))projects.unshift({...state.project,current:true});return '<div class="ps2-tpmenu"><div class="hd">добавить чат в проект</div><div class="srch">'+ico('find')+'найти проект…</div>'+projects.map(project=>'<div class="it" data-ps2-move-project="'+html(project.path||'')+'">'+ico('folder')+'<span class="t">'+html(project.name)+'</span>'+(project.current?'<span class="m">текущий</span>':'')+'</div>').join('')+'<hr><div class="it acc" data-ps2-move-new>'+ico('new')+'<span class="t">Сделать проектом…</span><span class="m">новая папка</span></div></div>'}
  function renderWorkspaceHeader(noProject){const solo=noProject===undefined?!!state.noProject:!!noProject,connection=state.live?'подключено':'нет связи',connectionClass=state.live?'':' off';state.noProject=solo;document.querySelectorAll('.frame .main').forEach(main=>{let old=main.querySelector(':scope > [data-ps2-workhead]');if(old)old.remove();if(KEY!=='new'&&KEY!=='chat')return;const head=document.createElement('div');head.dataset.ps2Workhead='';if(KEY==='new'||solo){head.className='ps2-top';head.innerHTML='<span class="ttl">'+(KEY==='new'?'Новый чат':'Чат')+'</span><span class="sub">без проекта</span><span class="r"><span class="ps2-toproj" data-ps2-toproj>'+ico('toproj')+'В проект<i>▾</i>'+topProjectMenu()+'</span><span class="'+connectionClass.trim()+'"><i></i>'+connection+'</span></span>'}else{head.className='ps2-tabs';const tabs=[['chat','Чат'],['doc','Документы'],['art','Артефакты'],['mem','Память'],['res','Исследования'],['plan','План · карта'],['path','Путь'],['swarm','Команда агентов']];head.innerHTML=tabs.map(t=>'<span class="'+(KEY===t[0]?'on':'')+'" data-go="'+t[0]+'">'+ico(t[0])+t[1]+(['plan','path'].includes(t[0])?tag('макет'):'')+(t[0]==='swarm'?'<b>'+(state.live?(state.chats||[]).length+' роли':'нет данных')+'</b>':'')+'</span>').join('')+'<span class="r'+connectionClass+'"><i></i>'+connection+'</span>'}const previous=main.querySelector(':scope > .top, :scope > .spec-heading');if(previous)previous.before(head);else main.prepend(head)})}
  window.PS2={state,setData,setInbox(value){state.inbox=inboxCounts(value);renderSide()},setProfile(value){state.profile=value||{name:'Без имени',email:'',configured:false};renderSide()},setLimits(value){state.limits=Array.isArray(value)?value:[];renderSide()},setWorkspace(value){if(value&&value.project)state.project=value.project;if(value&&typeof value.noProject==='boolean')state.noProject=value.noProject;renderSide();renderWorkspaceHeader()},setSections(value){state.sections=value||{};renderSide()},render:renderSide};
  document.addEventListener('click',e=>{const mode=e.target.closest('[data-ps2-action-mode]');if(mode){e.preventDefault();e.stopPropagation();setMode(mode.dataset.ps2Mode);return}if(e.target.closest('[data-ps2-release]')){e.preventDefault();panelOpen=false;try{localStorage.setItem(PS2_PANEL_KEY,'closed')}catch(x){}renderSide();return}const move=e.target.closest('[data-ps2-move-project],[data-ps2-move-new]');if(move){e.preventDefault();e.stopPropagation();const request=new CustomEvent('ps2:move-project',{detail:{path:move.dataset.ps2MoveProject||'',create:move.hasAttribute('data-ps2-move-new'),anchor:move.closest('.ps2-toproj')},cancelable:true});dispatchEvent(request);return}const topProject=e.target.closest('[data-ps2-toproj]');if(topProject){e.preventDefault();e.stopPropagation();topProject.classList.toggle('on');return}const profileButton=e.target.closest('[data-ps2-profile]');if(profileButton){e.preventDefault();e.stopPropagation();if(!state.profile?.configured){location.href='06-settings.html#p=profile';return}const foot=profileButton.closest('.ps-foot');if(foot)foot.classList.toggle('open');return}const pick=e.target.closest('[data-ps2-newpick]');if(pick){e.preventDefault();e.stopPropagation();pick.closest('.ps2-newwrap').classList.toggle('open');return}const other=e.target.closest('[data-ps2-others]');if(other){e.preventDefault();state.othersOpen=!state.othersOpen;renderSide();return}const prow=e.target.closest('.ps2-prow');if(prow&&!e.target.closest('.ps2-pmenu')){if(matchMedia('(hover:none)').matches){e.preventDefault();prow.classList.toggle('open');return}}const scope=e.target.closest('[data-new-scope]');if(scope){e.preventDefault();const request=new CustomEvent('ps2:new-scope',{detail:{scope:scope.dataset.newScope},cancelable:true});dispatchEvent(request);if(!request.defaultPrevented)location.href=PAGES.new+(scope.dataset.newScope==='solo'?'#solo':'');return}const g=e.target.closest('[data-go]');if(!g)return;const key=g.dataset.go,href=key==='plan'?planPage():PAGES[key];if(g.dataset.projectPath&&window.LIVE){e.preventDefault();const request=new CustomEvent('ps2:project-page',{detail:{path:g.dataset.projectPath,key,href},cancelable:true});dispatchEvent(request);return}if(key==='away'){e.preventDefault();if(KEY==='away'){const button=document.getElementById('leave');if(button)button.click()}else location.href=PAGES.away+'#leave';return}if(href){e.preventDefault();location.href=href}} ,true);
  document.addEventListener('click',e=>{if(!e.target.closest('.ps-foot'))document.querySelectorAll('.ps-foot.open').forEach(x=>x.classList.remove('open'));if(!e.target.closest('.ps2-newwrap'))document.querySelectorAll('.ps2-newwrap.open').forEach(x=>x.classList.remove('open'));if(!e.target.closest('.ps2-prow'))document.querySelectorAll('.ps2-prow.open').forEach(x=>x.classList.remove('open'));if(!e.target.closest('[data-ps2-toproj]'))document.querySelectorAll('.ps2-toproj.on').forEach(x=>x.classList.remove('on'))});
  document.addEventListener('keydown',e=>{if(e.target.closest('[data-ps2-profile]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click()}});
  addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.ps-foot.open,.ps2-newwrap.open,.ps2-prow.open').forEach(x=>x.classList.remove('open'));return}if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='n'&&KEY!=='new'){e.preventDefault();location.href=PAGES.new}});
  renderSide();renderWorkspaceHeader();

  // ── навигация телефона: кнопка ☰ и выдвижная панель со всеми экранами
  function mobileNav(){ if(document.querySelector('.m-btn')) return;
    const X={new:'<path d="M12 5v14M5 12h14"/>',conn:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',away:'<path d="M20 14.5A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>'};
    const item=(k,tx,extra)=>'<a class="m-i'+(k===KEY?' on':'')+(extra==='p'?' p':'')+'" href="'+(k==='plan'?planPage():PAGES[k]+(k==='away'?'#leave':''))+'"><svg viewBox="0 0 24 24">'+(IC[k]||X[k]||'')+'</svg>'+tx+(extra&&extra!=='p'?'<small>'+extra+'</small>':'')+'</a>';
    const btn=document.createElement('button'); btn.className='m-btn'; btn.setAttribute('aria-label','Меню'); btn.textContent='☰';
    const bg=document.createElement('div'); bg.className='m-bg';
    const dr=document.createElement('nav'); dr.className='m-drawer';
    dr.innerHTML='<div class="m-h"><i><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></i>Harnessy<span data-mx>×</span></div>'+item('new','Новый чат','p')+
      '<div class="m-g">работа</div>'+item('now','Входящие','2')+item('chat','Чат')+item('plan','План · карта')+item('path','Путь')+item('doc','Документы проекта')+item('art','Артефакты')+item('mem','Память проекта')+item('res','Исследования')+
      '<div class="m-g">команда</div>'+item('swarm','Команда агентов')+item('sens','Дашборд')+item('spend','Расход и лимиты')+item('conn','Подключения и лимиты')+
      '<div class="m-g">прочее</div>'+item('events','События')+item('log','Журнал')+item('set','Настройки')+item('away','Автопилот')+
      '<div class="m-f"><a href="../disarto/'+(SKETCH[FILE]||FILE)+'">этот экран листом, с пояснениями ↗</a><a href="../disarto/index.html">все скетчи ↗</a></div>';
    document.body.append(btn,bg,dr);
    const open=v=>document.documentElement.classList.toggle('m-open',v);
    btn.addEventListener('click',()=>open(true)); bg.addEventListener('click',()=>open(false)); dr.addEventListener('click',e=>{ if(e.target.closest('[data-mx]')) open(false); }); }
  // на телефоне полотна со связями уступают место спискам и карточкам, если у экрана такой вид есть
  function mobileDefaults(){ const F=document.querySelector('.frame.cur')||document, on=F.querySelector('.seg [data-v].on');
    if(on&&['board','map','graph','canvas'].includes(on.dataset.v)){ const s=F.querySelector('.seg [data-v="cards"], .seg [data-v="list"]'); if(s) s.click(); }
    const md=[...F.querySelectorAll('.mode span')].find(s=>/список/i.test(s.textContent)); if(md&&!md.classList.contains('on')) md.click(); }

  // ── служебные ссылки
  const note=document.createElement('a'); note.className='proto-note'; note.href='../disarto/'+(SKETCH[FILE]||FILE); note.textContent='скетч с пояснениями ↗'; note.title='Этот же экран листом: с описанием, подписями и сверкой'; document.body.appendChild(note);
  const back=document.createElement('a'); back.className='proto-back'; back.href=PAGES.new; document.body.appendChild(back);   // у кадра без боковой панели — выход назад
  back.addEventListener('click',e=>{ if(cur>0){ e.preventDefault(); show(0); } });

  // «назад» везде: кнопка в шапке экрана — история окна (в Electron нет кнопок браузера)
  document.querySelectorAll('.frame .main > .top').forEach(top=>{ const b=document.createElement('span'); b.className='proto-hist'; b.title='Назад'; b.textContent='‹'; b.addEventListener('click',()=>{ if(history.length>1) history.back(); else location.href=PAGES.new; }); top.prepend(b); });
  show(location.hash==='#f2'&&frames[1]?1:0);
  addEventListener('resize',fit);
})();
