/* Команда агентов · работа и конструктор (скетч 41) + раздел дизайн-кода team-canvas-spec.
   Полотно — OMCORE из om-map.js (масштаб · панорама · перетаскивание карточек; геометрия связей cubic/midOf/fwdPath) — расширяем, не копируем.
   Панель A1 и проектная полоска — разметка скетча 40 (sidebar-v2.css); сборщик панели повторён здесь, потому что в 40 он лежит во встроенном скрипте.
   Данные движка: проект Alpha-Test, роли и статусы busy/waiting, канал (есть); очередь из плана и конструктор — макет. 22.10.2026. */
window.TC=(function(){
  const esc=OMCORE.esc, cubic=OMCORE.cubic, midOf=OMCORE.midOf, fwdPath=OMCORE.fwdPath;
  const I={new:'<path d="M12 5v14M5 12h14"/>',find:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',inbox:'<path d="M3 13l2-8h14l2 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',chat:'<path d="M4 6h16v10H9l-5 4z"/>',pin:'<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>',folder:'<path d="M3 7h6l2 2h10v10H3z"/>',
    plan:'<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>',path:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h6a4 4 0 010 8H10a4 4 0 000 8h6"/>',swarm:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 18c0-2 2-3.5 4-3.5s3 1 3 3"/>',dash:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',art:'<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',mem:'<path d="M5 6c0-1.7 3-3 7-3s7 1.3 7 3v12c0 1.7-3 3-7 3s-7-1.3-7-3z"/><path d="M5 6c0 1.7 3 3 7 3s7-1.3 7-3M5 12c0 1.7 3 3 7 3s7-1.3 7-3"/>',res:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/>',
    logo:'<path d="M5 15c2-9 7 2 9-7M14 8l5 5"/>',role:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',bolt:'<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',model:'<circle cx="12" cy="12" r="3"/>',up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
    check:'<path d="M5 12l4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',file:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',cons:'<rect x="3" y="5" width="7" height="6" rx="1.5"/><rect x="14" y="13" width="7" height="6" rx="1.5"/><path d="M10 8h2a2 2 0 012 2v4"/>',
    eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',talk:'<path d="M4 5h11v8H8l-4 3z"/><path d="M15 9h5v8h-3l-3 3v-3h-2"/>',test:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>',ux:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 12l3-3 2 2 4-4"/>',
    orch:'<circle cx="12" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 8.5v4M12 12.5l-5.5 3.5M12 12.5l5.5 3.5"/>',rev:'<path d="M4 6h16v12H4z"/><path d="M8 12l3 3 5-6"/>',worker:'<path d="M14 4l6 6-10 10H4v-6z"/><path d="M12 6l6 6"/>',save:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',play:'<path d="M7 5l12 7-12 7z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>'};
  const ico=k=>'<svg viewBox="0 0 24 24">'+(I[k]||'')+'</svg>';
  const tag=(k,t)=>'<span class="tag '+k+'">'+t+'</span>';
  let textDetailId=0;
  function revealText(value){const text=esc(value),id='tc-full-text-'+(++textDetailId);return '<span class="tc-text-detail"><button type="button" class="tc-text-short" data-tc-reveal data-nodrag title="'+text+'" aria-expanded="false" aria-controls="'+id+'">'+text+'</button><span class="tc-text-full" data-nodrag id="'+id+'" hidden>'+text+'</span></span>'}
  function closeText(except){document.querySelectorAll('[data-tc-reveal][aria-expanded="true"]').forEach(button=>{if(button!==except){button.setAttribute('aria-expanded','false');button.nextElementSibling.hidden=true}})}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-tc-reveal]');if(button){const open=button.getAttribute('aria-expanded')!=='true';closeText(button);button.setAttribute('aria-expanded',String(open));button.nextElementSibling.hidden=!open}else if(!event.target.closest('.tc-text-full'))closeText()});
  addEventListener('keydown',event=>{if(event.key==='Escape'){const button=document.querySelector('[data-tc-reveal][aria-expanded="true"]');closeText();if(button)button.focus()}});
  const PROJ='Alpha-Test';

  /* ---- данные ---- */
  const ROLES=[
    {id:'rev',name:'Ревьюер',gen:'ревьюера',role:'review',ic:'rev',model:'Astra · Codex',st:'decide',stText:'ждёт решения · 40 мин',last:'Нужна подпись M0 по D8.4d — круг 2 прочитан',spend:'0,6 % W',tok:'18 k ток',at:'23:10'},
    {id:'w1',name:'Воркер 1',gen:'воркера 1',role:'worker',ic:'worker',model:'Opus 5.5',st:'write',stText:'пишет',last:'Сдаю TS-35: 14 тестов зелёные, опись в канале',spend:'1,1 % W',tok:'31 k ток',at:'сейчас'},
    {id:'w2',name:'Воркер 2',gen:'воркера 2',role:'worker',ic:'worker',model:'Sonnet 5.5',st:'peer',stText:'ждёт соседа · ревьюера',last:'TS-34 сдан, жду круг 1',spend:'0,3 % W',tok:'9 k ток',at:'22:48'},
    {id:'res',name:'Ресёрчер',gen:'ресёрчера',role:'research',ic:'res',model:'Qwen 3 Coder',st:'quiet',stText:'молчит 14 мин',last:'Опись источников по RS5 готова',spend:'0,1 % W',tok:'4 k ток',at:'22:54'},
    {id:'test',name:'Тестер',gen:'тестера',role:'test',ic:'test',model:'Sol · Codex',st:'err',stText:'ошибка · прогон упал',last:'check:backend: typecheck упал в 2 файлах',spend:'0,2 % W',tok:'6 k ток',at:'23:06'}];
  const BYID={}; ROLES.forEach(r=>BYID[r.id]=r);
  const ORCH={id:'orch',name:'Оркестратор',gen:'оркестратора',model:'Opus 5.5 · усилие высокое',st:'think',stText:'думает · 2 с'};
  const ORG=ROLES.map(r=>({s:'orch',t:r.id,k:'org'}));
  const LIVE=[{s:'w1',t:'rev',k:'live',a:'Воркер 1 → Ревьюер · сдача TS-35 · 2 мин'}];
  /* библиотека ролей: ключ · имя · что делает · модель по умолчанию */
  const LIB=[['orch','Оркестратор','ведёт ход, раздаёт задачи','Opus 5.5'],['rev','Ревьюер','принимает или возвращает сдачу','Astra · Codex'],['worker','Воркер','пишет код в своей копии','Opus · Sonnet'],['res','Ресёрчер','читает репозиторий и веб','Qwen 3 Coder'],['test','Тестер','гоняет прогоны, читает падения','Sol · Codex'],['ux','UX-ревьюер','смотрит экраны и путь пользователя','Kimi K2.5']];
  const LIBN={}; LIB.forEach(l=>LIBN[l[0]]=l);
  /* очередь задач (макет: источник — план / компиляция OMG не подключена) */
  const QUEUE0=[{n:11,t:'TS-33 · виджет лимитов в панели',who:'Воркер 2',st:'done'},{n:12,t:'TS-35 · очередь задач в движке',who:'Воркер 1',st:'rev'},{n:13,t:'TS-36 · карточка роли на полотне',who:'Воркер 2',st:'work',stt:'у воркера 2'},{n:14,t:'TS-37 · перетаскивание задачи на роль',who:'',st:'q'},{n:15,t:'RS-6 · источники по конструктору команд',who:'Ресёрчер',st:'q'},{n:16,t:'TS-38 · конструктор команды',who:'',st:'q'}];
  const STN={q:'в очереди',work:'у роли',rev:'на ревью',done:'готово',err:'ошибка'};
  /* конструктор: карточки с портами и связи «кто кому пишет / сдаёт» */
  const CN0=[
    {id:'orch',name:'Оркестратор',role:'orch',ic:'orch',model:'Opus 5.5',rights:'Всё без вопросов',file:'roles/orchestrator.md',x:24,y:236},
    {id:'w1',name:'Воркер 1',role:'worker',ic:'worker',model:'Opus 5.5',rights:'Своя копия · без push',file:'roles/worker.md',x:312,y:24},
    {id:'w2',name:'Воркер 2',role:'worker',ic:'worker',model:'Sonnet 5.5',rights:'Своя копия · без push',file:'roles/worker.md',x:312,y:236,chg:1},
    {id:'res',name:'Ресёрчер',role:'research',ic:'res',model:'Qwen 3 Coder',rights:'Только чтение · веб',file:'roles/researcher.md',x:312,y:448},
    {id:'rev',name:'Ревьюер',role:'review',ic:'rev',model:'Astra · Codex',rights:'Только чтение',file:'roles/reviewer.md',x:600,y:130},
    {id:'test',name:'Тестер',role:'test',ic:'test',model:'',rights:'Запуск прогонов',file:'roles/tester.md',x:600,y:390,neu:1}];
  const CE0=[{s:'orch',t:'w1',a:'задача'},{s:'orch',t:'w2',a:'задача'},{s:'orch',t:'res',a:'вопрос'},{s:'w1',t:'rev',a:'сдаёт'},{s:'w2',t:'rev',a:'сдаёт'},{s:'rev',t:'w1',a:'возврат',k:'ret'},{s:'rev',t:'orch',a:'вердикт',k:'back'},{s:'test',t:'rev',a:'отчёт прогона',k:'new'}];

  /* ---- панель A1 из скетча 40: те же классы .ps / .ps2-* (sidebar-v2.css) ---- */
  const CHATS=[{s:'Кто ты? какая ты модель и чем мне можешь помочь?',r:'Оркестратор',st:'busy'},{s:'Я — Исполнитель: реализую самодостаточный модуль…',r:'Исполнитель',st:'wait'},{s:'ты готов?',r:'',st:''}];
  const SOLO=[{s:'как заварить кофе в турке',r:'',st:''},{s:'перевод письма партнёру',r:'',st:'busy'}];
  const PINS=[{s:'как ты будешь решать задачи в этой папке',m:'harnessy-test'},{s:'какие задачи ты можешь решать в проекте?',m:'harnessy-test'}];
  const OTHERS=9;
  const pinBtn=on=>'<button type="button" class="ps-pin'+(on?' on':'')+'" aria-label="'+(on?'Снять закрепление':'Закрепить')+'">'+ico('pin')+'</button>';
  const chat=(c,o={})=>'<div class="ps-chat'+(c.st?' '+c.st:'')+(o.act?' act':'')+(o.pin?' pin':'')+'"><i></i><span class="s">'+c.s+'</span>'+(c.r||c.m?'<span class="m">'+(c.r||c.m)+'</span>':'')+pinBtn(!!o.pin)+'</div>';
  const PM=[['new','Новый чат в проекте','','acc'],['doc','Документы','7'],['art','Артефакты','3'],['mem','Память проекта','12 правил'],['res','Исследования','2 вопроса'],['plan','План · карта',''],['path','Путь','8 стадий'],['swarm','Команда агентов','6 ролей'],['dash','Дашборд','']];
  const pmenu=name=>'<div class="ps2-pmenu"><div class="hd">'+name+'<small>в проекте '+name+'</small></div>'+PM.map(([k,l,m,c],i)=>(i===1||i===8?'<hr>':'')+'<div class="it'+(c?' '+c:'')+'">'+ico(k)+'<span class="t">'+l+'</span>'+(m?'<span class="m">'+m+'</span>':'')+'</div>').join('')+'<div class="ft">пункты открывают страницы этого проекта</div></div>';
  const limV=(name,p,per)=>'<span class="v" style="--p:'+p+'%"><span>'+name+'</span><b>'+p+' %</b><i>'+per+'</i><u></u></span>';
  const side=(o={})=>'<aside class="side ps'+(o.cls||'')+'"><div class="ps-head"><span class="logo" title="Новый чат">'+ico('logo')+'</span><b class="ps-proj" title="Проект">'+PROJ+' <i>▾</i></b><span class="col" title="Свернуть панель">'+(o.close||'⟨')+'</span></div>'+
    '<div class="ps2-newwrap"><div class="newbtn on" title="Новый чат · ⌘N">'+ico('new')+'Новый чат<kbd>⌘N</kbd><span class="dd">▾</span></div></div><div class="search" title="Найти · ⌘K">'+ico('find')+'Найти…<kbd>⌘K</kbd></div>'+
    '<div class="ps-scroll"><div class="ps2-inbox has" title="Входящие: 2 требуют действия · 4 к сведению">'+ico('inbox')+'<span class="t">Входящие</span><span class="b">2</span><span class="b2">4</span></div>'+
    '<div class="grp">закреплённые</div>'+PINS.map(p=>chat(p,{pin:1})).join('')+
    '<div class="grp ps2-prow" title="Наведите — меню проекта">чаты · '+PROJ+'<span class="m">3</span><span class="pm">›</span>'+pmenu(PROJ)+'</div>'+CHATS.map(c=>chat(c,{act:c.s===CHATS[0].s})).join('')+
    '<div class="grp">чаты без проекта<span class="chev">▾</span><span class="m">'+SOLO.length+'</span></div><div class="ps2-grpbody">'+SOLO.map(c=>chat(c)).join('')+'</div>'+
    '<div class="ps2-others" title="Другие проекты">'+ico('folder')+'<span class="t">Другие проекты</span><span class="m">'+OTHERS+'</span><span class="chev">›</span></div></div>'+
    '<div class="ps-foot"><div class="ps2-lim" role="button" title="Осталось · все лимиты">'+limV('Claude',64,'W')+limV('Codex',91,'W')+'</div><div class="ps2-prof" title="Профиль"><span class="av">А<i></i></span><div>Анна Ветрова<small>you@example.com</small></div><span class="chev">▾</span></div></div></aside>';
  /* проектная полоска вкладок — у открытого чата проекта; активная вкладка по ключу */
  const tabs=on=>{ const t=(k,l,b)=>'<span'+(on===k?' class="on"':'')+'>'+ico(k)+l+(b||'')+'</span>';
    return '<div class="ps2-tabs">'+t('chat','Чат','<b>3</b>')+t('doc','Документы')+t('art','Артефакты','<b class="acc">3</b>')+t('mem','Память')+t('res','Исследования')+t('plan','План · карта',tag('mock','макет'))+t('path','Путь',tag('mock','макет'))+t('swarm','Команда агентов','<b>6 ролей</b>')+'<span class="r"><i></i>подключено</span></div>'; };

  /* ---- элементы полотна ---- */
  const dot=st=>'<span class="tc-o '+st+'"></span>';
  /* карточка члена команды · 4 строки */
  function card(r,o={}){ const st=o.st||r.st; const free=st==='free';
    return '<div class="tc-card '+st+(o.cls?' '+o.cls:'')+'" data-key="'+r.id+'" data-name="'+esc(r.name)+'" data-gen="'+esc(r.gen||r.name)+'"><div class="l1">'+dot(st)+'<b title="'+esc(r.name)+'">'+revealText(r.name)+'</b><span class="md" title="'+esc(r.model)+'">'+esc(r.model)+'</span></div>'+
      '<div class="l2">'+esc(o.stText||r.stText)+'</div><div class="l3" title="'+esc(r.last)+'">'+(free?'задачи нет — назначьте из очереди':esc(r.last))+'</div>'+
      '<div class="l4" title="'+esc('ход · '+r.spend+' · '+r.tok+' · '+r.at)+'"><span>ход</span><b>'+esc(r.spend)+'</b><i>'+esc(r.tok)+' · '+esc(r.at)+'</i></div><span class="drophint">назначить '+esc(r.gen||r.name)+'</span></div>'; }
  /* крупная карточка оркестратора — тот же чат оркестратора, встроенный (последние реплики + поле ввода) */
  function orch(o={}){ const st=o.st||'think', txt=o.stText||(st==='wait'?'ждёт вас · подпись M0':st==='write'?'пишет':'думает · 2 с');
    const msgs=o.msgs||'<div class="me">Что ждёт меня после сдачи TS-35?</div><div class="ai"><div><p><b>Воркер 1</b> сдал TS-35 ревьюеру 2 мин назад. <b>Ревьюер</b> всё ещё ждёт вашу подпись M0 по D8.4d — это держит TS-34 воркера 2.</p>'+(st==='wait'?'<div class="decide"><div class="lbl">нужно ваше решение</div><div class="act"><span class="btn p">Подписать M0</span><span class="btn">Открыть D8.4d</span></div></div>':'')+'</div></div>'+(st==='think'?'<div class="ai typing">думает 2 с… собирает сдачу TS-35 для ревью</div>':'');
    return '<div class="tc-orch '+st+(o.cls?' '+o.cls:'')+'" data-key="orch" data-name="Оркестратор" data-gen="оркестратора"><div class="hd"><span class="orb"></span><div><b>Оркестратор</b><small>'+esc(ORCH.model)+' · ведёт ход</small></div><span class="st">'+dot(st)+esc(txt)+'</span>'+tag('live','тот же чат')+'<span class="open" data-nodrag title="Открыть во вкладке «Чат»">⤢ чат</span></div>'+
      '<div class="chat" data-nodrag>'+msgs+'</div><div class="in" data-nodrag><span>Написать оркестратору…</span><span class="go">'+ico('up')+'</span></div>'+
      '<div class="ft"><span>ход · <b>2,4 % W</b> · 71 k ток</span><span>прогон H1.5 · <b>3/7</b></span><span class="r">последний ход · 23:12</span></div><span class="drophint">отдать оркестратору на раздачу</span></div>'; }
  /* «+» → меню ролей из библиотеки + «Открыть конструктор» */
  function plusMenu(o={}){ return '<div class="tc-pmenu'+(o.static?' static':'')+'"><div class="hd">назначить роль'+tag('live','есть')+'</div>'+LIB.map(([k,n,d,m])=>'<div class="it'+(o.hov===k?' hov':'')+'">'+ico(k)+n+'<span class="m">'+m+'</span></div>').join('')+'<div class="it dis">'+ico('role')+'Своя роль…<span class="m">из конструктора</span></div><hr><div class="it acc" data-href="#constructor">'+ico('cons')+'Открыть конструктор →<span class="m">'+tag('mock','макет')+'</span></div><div class="ft">назначение — место в канале с моделью по умолчанию; перестройка связей — в конструкторе</div></div>'; }
  /* очередь задач */
  const stText=t=>t.stt||(t.st==='work'?'у '+(t.who||'роли').toLowerCase():STN[t.st]);
  const task=(t,o={})=>'<div class="tc-task '+t.st+(o.cls?' '+o.cls:'')+'" draggable="true" data-task="'+t.n+'" title="Перетащите на карточку роли"><span class="n">№'+t.n+'</span><span class="t">'+esc(t.t)+'</span><span class="who'+(t.who?'':' none')+'">'+(t.who?esc(t.who):'— не назначена')+'</span><span class="st">'+esc(stText(t))+'</span><span class="grip">⋮⋮</span>'+((o.cls||'').indexOf('drag')>=0?'<span class="hint">тяните на роль → задача уйдёт ей в канал</span>':'')+'</div>';
  function queue(Q,o={}){ const open=Q.filter(t=>t.st!=='done').length;
    return '<div class="tc-queue"><div class="hd"><b>Очередь задач</b><span class="m">'+Q.length+' · открыто '+open+'</span>'+tag('mock','макет · компиляция OMG не подключена')+'<span class="r"><span class="btn sm ghost">'+ico('new')+'задача</span></span></div><div class="rows'+(o.one?' one':'')+'">'+Q.map(t=>task(t,{cls:(o.big?'big':'')+(o.drag===t.n?' drag':'')})).join('')+'</div>'+
      '<div class="src">источник: <b>план · компиляция</b> (когда живое) или <b>оркестратор</b> · перетащите строку на карточку роли — задача уйдёт ей в канал'+(o.src===false?'':'')+'</div></div>'; }
  /* библиотека ролей (конструктор) */
  function lib(o={}){ const used={orch:1,rev:1,worker:2,res:1,test:1};
    return '<div class="tc-lib"><div class="hd">библиотека ролей<span>'+LIB.length+'</span></div><div class="srch">'+ico('find')+'найти роль…</div>'+LIB.map(([k,n,d,m])=>'<div class="it'+(used[k]?' used':'')+(o.drag===k?' drag':'')+'" draggable="true" data-lib="'+k+'"><span class="ic">'+ico(k)+'</span><div><b>'+n+'</b><small>'+d+'</small></div><span class="m">'+(used[k]?'в команде · '+used[k]:m)+'</span></div>').join('')+
      '<div class="it own" data-lib="own"><span class="ic">'+ico('new')+'</span><div><b>Своя роль</b><small>имя · инструкция · модель</small></div><span class="m">＋</span></div><div class="ft">перетащите роль на холст или кликните — появится карточка без связей; модель и права — на карточке</div></div>'; }
  /* карточка роли в конструкторе: порты · модель ▾ · права · инструкция роли */
  function node(n,o={}){ const cls=(n.neu?' neu':'')+(n.chg?' chg':'')+(!n.model?' err':'')+(o.cls?' '+o.cls:'');
    return '<div class="tc-node'+cls+'" data-key="'+n.id+'"><span class="pi" data-l="получает"></span><span class="po" data-l="пишет"></span><div class="hd"><span class="ic">'+ico(n.ic)+'</span><div><b>'+esc(n.name)+'</b><small>'+esc(n.role)+(n.neu?' · новая':'')+(!n.model?' · нет модели':'')+'</small></div><span class="x" data-nodrag data-x="'+n.id+'" title="Убрать из команды">×</span></div>'+
      '<div class="rows"><div class="row"><span>модель</span><span class="v'+(n.model?'':' none')+'" data-nodrag>'+ico('model')+'<em>'+(n.model?esc(n.model):'выбрать модель')+'</em><i>▾</i></span></div>'+
      '<div class="row"><span>права</span><span class="v'+(n.rights==='Всё без вопросов'?' acc':'')+'" data-nodrag>'+ico('lock')+'<em>'+esc(n.rights)+'</em><i>▾</i></span></div>'+
      '<div class="row"><span>инструкция</span><span class="v file" data-nodrag>'+ico('file')+'<em>'+esc(n.file)+'</em><i>↗</i></span></div></div>'+
      '<div class="ft">'+(n.model?'<span>место в канале</span>':'<span class="bad">нельзя применить без модели</span>')+(n.chg?'<span class="acc">изменено</span>':'')+(n.neu?'<span class="acc">не сохранено</span>':'')+'</div></div>'; }
  const emptyNode=()=>'<div class="tc-node empty" data-key="empty"><div><b>Новая команда</b>перетащите роль из библиотеки<br>или кликните по ней</div></div>';

  /* ---- композер (классы cx-* прототипа, как в 40) с вариантами (а)(б)(в) ---- */
  const pin=n=>'<span class="tc-pin">'+n+'</span>';
  const chip=(k,t,cls,extra)=>'<span class="cx-chip'+(cls?' '+cls:'')+'">'+ico(k)+'<b>'+t+'</b><i>▾</i>'+(extra||'')+'</span>';
  const rights=(o={})=>'<span class="tc-rights'+(o.static?' static':'')+'"><span class="hd">режим агента</span><span class="it on">'+(o.pin?pin(o.pin):'')+ico('talk')+'<div>Только обсуждение<small>агент обсуждает и ничего не делает — у движка режим chat</small></div><span class="chk">✓</span></span><hr><span class="it">'+ico('bolt')+'<div>Всё без вопросов<small>делает, не спрашивая</small></div></span><span class="it">'+ico('clock')+'<div>Спрашивать перед действием<small>стоп-случаи из настроек</small></div></span><span class="it">'+ico('eye')+'<div>Только чтение<small>читает папку, ничего не пишет</small></div></span></span>';
  const cvbtn=(o={})=>'<span class="tc-cvbtn'+(o.on?' on':'')+(o.lbl?' lbl':'')+(o.dis?' dis':'')+'" title="Полотно команды — вкладка «Команда агентов»">'+ico('swarm')+(o.lbl?'Полотно команды':'')+(o.b?'<span class="b">'+o.b+'</span>':'')+'</span>';
  function composer(v={}){ let top='<div class="cx-top">';
    if(v.v==='b') top+='<span class="tc-tg'+(v.talk?' on':'')+'" title="Агент только обсуждает — режим chat">'+pin(1)+'<span class="tog'+(v.talk?' on':'')+'"></span>'+ico('talk')+'Обсуждение</span><span class="tc-tg" title="Полотно команды">'+pin(2)+'<span class="tog"></span>'+ico('swarm')+'Команда<span class="b">1</span></span>';
    if(v.v==='c') top+='<span class="tc-seg">'+pin(1)+'<span class="on">'+ico('chat')+'Чат</span><span>'+ico('swarm')+'Команда<b>1</b></span></span>';
    top+=chip('chat',v.chat||'Кто ты? какая ты модель…');
    if(v.v==='a') top+='<span style="display:inline-flex;align-items:center;gap:4px">'+pin(2)+cvbtn({b:'1'})+'</span>';
    top+='<span class="cx-sp"></span>'+chip('role',v.role||'Оркестратор','acc')+'</div>';
    let bot='<div class="cx-bot"><span class="cx-plus">＋</span>';
    if(v.v==='a') bot+='<span class="cx-chip tc-rchip'+(v.open?' open':'')+'" data-rchip>'+ico('lock')+'<b>'+(v.talk?'Только обсуждение':'Всё без вопросов')+'</b><i>▾</i>'+rights({pin:1})+'</span>';
    else bot+=chip('lock','Всё без вопросов');
    if(v.v==='c') bot+='<span class="tc-tg'+(v.talk?' on':'')+'" title="Агент только обсуждает — режим chat">'+pin(2)+'<span class="tog'+(v.talk?' on':'')+'"></span>'+ico('talk')+'Обсуждение</span>';
    bot+='<span class="cx-sp"></span>'+chip('model','Claude · Sonnet','acc')+chip('bolt','Усилие: —','dim')+'<span class="cx-info">i</span><span class="cx-go off">'+ico('up')+'</span></div>';
    return '<div class="tc-cx">'+top+'<div class="box"><div class="in">'+(v.ph||'Написать оркестратору…')+'</div>'+bot+'</div></div>'; }
  /* экран чата проекта (лента из 40 · A1·c) с композером варианта */
  function chatMain(v){ return '<section class="main ps2-chat">'+tabs('chat')+'<div class="feed"><div class="col">'+
    '<div class="me">Что сейчас делает команда и что ждёт меня?</div>'+
    '<div class="ai"><span class="orb"></span><div><div class="thought">думал 2,8 с</div><p>Двое ждут вас: <b>ревьюер</b> просит подпись M0 по D8.4d<span class="cite">1</span>, <b>воркер 2</b> ждёт круга 1 по TS-34<span class="cite">2</span>. Воркер 1 только что сдал TS-35. Прогон H1.5 на шаге 3 из 7, сбоев нет.</p>'+
    '<div class="decide"><div class="lbl">Нужно ваше решение · 40 мин</div><p>Ревьюер держит D8.4d до подписи M0. Подписать сейчас или открыть сдачу?</p><div class="act"><span class="btn p">Подписать M0</span><span class="btn">Открыть D8.4d</span><span class="btn">'+ico('swarm')+'Полотно команды</span></div></div></div></div>'+
    '<div class="me">Открой полотно — хочу видеть, кто кому пишет</div>'+
    '<div class="ai"><span class="orb"></span><div><div class="thought">думал 0,6 с</div><p>Полотно команды — вкладка «Команда агентов» этого проекта; кнопка над полем ввода ведёт туда же. Сейчас живая стрелка одна: Воркер 1 → Ревьюер, сдача TS-35.</p></div></div>'+
    '</div></div><div class="comp">'+composer(v)+'<div class="status"><span>папка '+PROJ+' · git · ролей 6 · прогон 3/7 идёт</span><span><span class="kbd">⌘K</span> команды · <span class="kbd">⌘\\</span> панель</span></div></div></section>'; }

  /* ---- общий движок полотна на OMCORE: узлы по ключу, связи с путями, подсветка, перетаскивание ---- */
  function marker(uid,k,c){ return '<marker id="'+uid+'-'+k+'" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="'+c+'"/></marker>'; }
  function engine(root,o){ const uid='tc'+Math.random().toString(36).slice(2,7);
    const canvas=root.querySelector('[data-canvas]'), view=root.querySelector('[data-view]'), svg=root.querySelector('[data-edges]'), layer=root.querySelector('[data-nodes]');
    svg.innerHTML='<defs>'+marker(uid,'ah','#4a4a52')+marker(uid,'ah-on','#c27a34')+marker(uid,'ah-ret','#8a4452')+marker(uid,'ah-new','#6a6a74')+'</defs>';
    const G={rects:{}}; let sel=null;
    const mk=k=>'url(#'+uid+'-'+k+')';
    function place(){ layer.querySelectorAll('[data-key]').forEach(el=>{ const r=G.rects[el.dataset.key]; if(!r) return; el.style.left=r.x+'px'; el.style.top=r.y+'px'; }); }
    function measure(){ layer.querySelectorAll('[data-key]').forEach(el=>{ const r=G.rects[el.dataset.key]; if(r){ r.w=el.offsetWidth; r.h=el.offsetHeight; } }); }
    function drawEdges(){ svg.querySelectorAll('path').forEach(x=>x.remove()); layer.querySelectorAll('.om-lbl').forEach(x=>x.remove()); let p='',l='';
      o.edges().forEach(e=>{ const a=G.rects[e.s], b=G.rects[e.t]; if(!a||!b) return; const pt=o.path(a,b,e,G); const k=e.k||'org';
        p+='<path class="'+k+'" data-s="'+e.s+'" data-t="'+e.t+'" d="'+pt.d+'" marker-end="'+mk(k==='live'?'ah-on':k==='ret'?'ah-ret':k==='new'?'ah-new':'ah')+'"/>';
        if(e.a) l+='<span class="om-lbl '+k+'" data-s="'+e.s+'" data-t="'+e.t+'" style="left:'+pt.m[0]+'px;top:'+pt.m[1]+'px">'+esc(e.a)+'</span>'; });
      svg.insertAdjacentHTML('beforeend',p); layer.insertAdjacentHTML('beforeend',l); highlight(); }
    function highlight(){ const near=new Set(), onE=new Set();
      if(sel) svg.querySelectorAll('path[data-s]').forEach(pth=>{ if(pth.dataset.s===sel||pth.dataset.t===sel){ onE.add(pth); near.add(pth.dataset.s); near.add(pth.dataset.t); } });
      layer.querySelectorAll('[data-key]').forEach(el=>{ const k=el.dataset.key; el.classList.toggle('on',!!sel&&k===sel); el.classList.toggle('near',!!sel&&k!==sel&&near.has(k)); el.classList.toggle('dim',!!sel&&k!==sel&&!near.has(k)); });
      svg.querySelectorAll('path').forEach(pth=>{ const on=onE.has(pth); pth.classList.toggle('on',on); pth.classList.toggle('dim',!!sel&&!on); const k=pth.classList.contains('ret')?'ah-ret':pth.classList.contains('live')?'ah-on':pth.classList.contains('new')?'ah-new':'ah'; pth.setAttribute('marker-end',mk(on?'ah-on':k)); });
      layer.querySelectorAll('.om-lbl').forEach(lb=>{ const on=!!sel&&(lb.dataset.s===sel||lb.dataset.t===sel); lb.classList.toggle('on',on); lb.classList.toggle('dim',!!sel&&!on); }); }
    function select(k){ sel=k; highlight(); if(o.onSelect) o.onSelect(k); }
    function box(){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; Object.keys(G.rects).forEach(k=>{ const r=G.rects[k]; x0=Math.min(x0,r.x); y0=Math.min(y0,r.y); x1=Math.max(x1,r.x+r.w); y1=Math.max(y1,r.y+r.h); });
      if(x0>x1) return {x0:0,y0:0,x1:canvas.clientWidth||900,y1:canvas.clientHeight||600}; return {x0:x0-16,y0:y0-16,x1:x1+16,y1:y1+(o.padBottom||16)}; }
    const VP=OMCORE.viewport(canvas,view,{box:box,blank:()=>[canvas,view,svg,layer],ignore:'[data-zoom],[data-nodrag],.tc-legend',kmin:.4,
      items:t=>{ const el=t.closest('[data-key]'); if(!el||!el.closest('[data-nodes]')||el.dataset.key==='empty') return null; return [{el:el,r:G.rects[el.dataset.key],key:el.dataset.key}]; },
      onMove:()=>drawEdges(), onEnd:()=>{ if(o.onEnd) o.onEnd(G); }, onView:V=>{ const z=root.querySelector('[data-zpct]'); if(z) z.textContent=Math.round(V.k*100)+' %'; }});
    function render(fit){ layer.innerHTML=o.nodes(); const W=canvas.clientWidth||900, H=canvas.clientHeight||600; o.layout(G,W,H,layer); place(); measure(); drawEdges(); if(fit!==false) VP.fit(); }
    root.addEventListener('click',e=>{ const t=e.target; if(t.closest('aside.side')) return; if(VP.takeSuppress()) return;
      const z=t.closest('[data-z]'); if(z){ const W=VP.cw(),H=VP.chh(); if(z.dataset.z==='fit') VP.fit(); else VP.zoomAt(W/2,H/2,z.dataset.z==='in'?1.25:.8); return; }
      if(o.onClick&&o.onClick(t)===true) return;
      if(t.closest('[data-nodrag]')) return;
      const k=t.closest('[data-key]'); if(k&&k.closest('[data-nodes]')&&k.dataset.key!=='empty'){ select(sel===k.dataset.key?null:k.dataset.key); return; }
      if(t===canvas||t===view||t===svg||t===layer){ if(sel) select(null); } });
    addEventListener('keydown',e=>{ if(e.key==='Escape'&&sel) select(null); });
    return {G,VP,render,select,drawEdges,measure,layer,canvas,get sel(){ return sel; }};
  }
  /* геометрия: вертикальная связь (оргсхема сверху вниз), дуга-полоса под карточками (живое сообщение), обратная связь полосой */
  const vp=(ax,ay,bx,by)=>{ const o=Math.max(24,Math.min(80,Math.abs(by-ay)/2)); return {d:cubic(ax,ay,ax,ay+o,bx,by-o,bx,by),m:midOf(ax,ay,ax,ay+o,bx,by-o,bx,by)}; };
  const lane=(ax,ay,bx,by,ly)=>({d:cubic(ax,ay,ax,ly,bx,ly,bx,by),m:midOf(ax,ay,ax,ly,bx,ly,bx,by)});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function workPath(a,b,e){ if(e.k==='live'){ const ly=Math.max(a.y+a.h,b.y+b.h)+52; return lane(a.x+a.w/2,a.y+a.h,b.x+b.w/2,b.y+b.h,ly); }
    const bx=b.x+b.w/2, ax=clamp(bx,a.x+36,a.x+a.w-36); return vp(ax,a.y+a.h,bx,b.y); }
  function consPath(a,b,e,G){ const ay=a.y+a.h/2, by=b.y+b.h/2;
    if(b.x>=a.x+a.w-8) return fwdPath(a,b);
    if(Math.abs(a.x-b.x)<60) return b.y>a.y?vp(a.x+a.w/2,a.y+a.h,b.x+b.w/2,b.y):vp(a.x+a.w/2,a.y,b.x+b.w/2,b.y+b.h);
    if(e.k==='ret') return {d:cubic(a.x,ay,a.x-70,ay-110,b.x+b.w+70,by-110,b.x+b.w,by),m:midOf(a.x,ay,a.x-70,ay-110,b.x+b.w+70,by-110,b.x+b.w,by)};
    /* обратная связь: вправо-вниз на полосу под всеми карточками, по полосе влево, вверх в левый порт */
    let ly=0; Object.keys(G.rects).forEach(k=>{ ly=Math.max(ly,G.rects[k].y+G.rects[k].h); }); ly+=36; const ax=a.x+a.w;
    return {d:'M'+ax+' '+ay+' C'+(ax+56)+' '+ay+','+(ax+56)+' '+ly+','+(ax-10)+' '+ly+' L'+(b.x+10)+' '+ly+' C'+(b.x-56)+' '+ly+','+(b.x-56)+' '+by+','+b.x+' '+by,m:[(ax+b.x)/2,ly]}; }

  /* ---- перетаскивание задачи из очереди на карточку роли (HTML5 DnD, вне движка полотна) ---- */
  function bindQueue(root,Q,onDrop){ const TG='.tc-card,.tc-orch';
    root.addEventListener('dragstart',e=>{ const t=e.target.closest('.tc-task'); if(!t) return; e.dataTransfer.setData('text/plain',t.dataset.task); e.dataTransfer.effectAllowed='move'; t.classList.add('drag'); });
    root.addEventListener('dragend',e=>{ const t=e.target.closest('.tc-task'); if(t) t.classList.remove('drag'); root.querySelectorAll('.drop').forEach(x=>x.classList.remove('drop')); });
    root.addEventListener('dragover',e=>{ const c=e.target.closest(TG); if(!c) return; e.preventDefault(); e.dataTransfer.dropEffect='move'; root.querySelectorAll('.drop').forEach(x=>{ if(x!==c) x.classList.remove('drop'); }); c.classList.add('drop'); });
    root.addEventListener('dragleave',e=>{ const c=e.target.closest(TG); if(c&&!c.contains(e.relatedTarget)) c.classList.remove('drop'); });
    root.addEventListener('drop',e=>{ const c=e.target.closest(TG); if(!c) return; e.preventDefault(); c.classList.remove('drop'); const n=+e.dataTransfer.getData('text/plain'); const t=Q.find(x=>x.n===n); if(!t) return;
      t.who=c.dataset.name; t.st='work'; t.stt='у '+c.dataset.gen; c.classList.remove('got'); void c.offsetWidth; c.classList.add('got'); onDrop(t,c); }); }

  /* ---- экран «Работа команды» ---- */
  const zoom=()=>'<div class="om-zoom" data-zoom><span data-z="out" title="Уменьшить">−</span><b data-zpct>100 %</b><span data-z="in" title="Увеличить">+</span><span class="fit" data-z="fit" title="Вписать">вписать</span></div>';
  const legend=()=>'<div class="tc-legend"><span><i></i>оргсхема</span><span><i class="live"></i>живое сообщение</span><span><i class="on"></i>выбранные</span><span>·</span>'+tag('live','есть')+'<span>роли · статусы · канал</span>'+tag('mock','макет')+'<span>очередь</span></div>';
  function workMain(o={}){ return '<section class="main tc-main">'+tabs('swarm')+
    '<div class="ps2-tbar"><b>Команда агентов</b><span class="m">'+PROJ+' · 6 ролей</span><span class="st"><i></i>канал в норме · 1 сообщение в пути</span><span class="pill acc">ждёт вас · 1</span><span class="r">'+
    '<span class="tc-plus'+(o.plus?' open':'')+'" data-plus><span class="btn sm">'+ico('new')+'роль</span>'+plusMenu({hov:o.plus?'test':''})+'</span><span class="btn sm ghost" data-href="#constructor">'+ico('cons')+'Открыть конструктор</span><span class="btn sm ghost" title="Вкладка «Чат» — тот же чат оркестратора">'+ico('chat')+'В чат</span></span></div>'+
    '<div class="tc-work"><div class="om-canvas tc" data-canvas><div class="om-view" data-view><svg class="om-edges" data-edges></svg><div data-nodes></div></div>'+zoom()+legend()+'</div><div data-queue>'+queue(o.Q||QUEUE0)+'</div></div></section>'; }
  function mountWork(app,o={}){ const Q=JSON.parse(JSON.stringify(QUEUE0)); app.innerHTML=side()+workMain({plus:o.plus,Q:Q});
    const E=engine(app,{nodes:()=>orch({st:o.orchSt})+ROLES.map(r=>card(r)).join(''),edges:()=>ORG.concat(LIVE),path:workPath,padBottom:70,
      layout:(G,W,H,layer)=>{ const ow=600, oh=(layer.querySelector('[data-key="orch"]')||{}).offsetHeight||230; G.rects.orch={x:Math.round((W-ow)/2),y:16,w:ow,h:oh};
        const cw=204, gap=clamp(Math.round((W-24-ROLES.length*cw)/(ROLES.length-1)),16,40), rw=ROLES.length*cw+(ROLES.length-1)*gap, x0=Math.round((W-rw)/2), y=oh+16+86;
        ROLES.forEach((r,i)=>{ G.rects[r.id]={x:x0+i*(cw+gap),y:y,w:cw,h:120}; }); },
      onClick:t=>{ const p=t.closest('[data-plus]'); if(p&&!t.closest('.tc-pmenu')){ p.classList.toggle('open'); return true; } if(t.closest('.tc-pmenu .it')){ const h=t.closest('[data-href]'); app.querySelector('[data-plus]').classList.remove('open'); if(h){ location.hash=h.dataset.href; } return true; }
        const hr=t.closest('[data-href]'); if(hr){ location.hash=hr.dataset.href; return true; } return false; }});
    const qEl=app.querySelector('[data-queue]'); bindQueue(app,Q,(t,c)=>{ qEl.innerHTML=queue(Q); const l3=c.querySelector('.l3'); if(l3){ l3.textContent='№'+t.n+' назначена: '+t.t; } });
    document.addEventListener('click',e=>{ if(!e.target.closest('[data-plus]')) app.querySelectorAll('[data-plus].open').forEach(p=>{ if(!o.plus) p.classList.remove('open'); }); });
    E.render(); if(o.sel) E.select(o.sel); return E; }

  /* ---- экран «Конструктор команды» ---- */
  function consMain(o={}){ const n=o.nodes.length, err=o.nodes.some(x=>!x.model), chg=o.nodes.filter(x=>x.chg||x.neu).length+(o.extra||0);
    return '<section class="main tc-main">'+tabs('swarm')+
    '<div class="ps2-tbar"><b>Конструктор команды</b><span class="m">'+(o.neu?'новая команда':'правка')+' · '+n+' ролей · '+o.edges.length+' связей</span>'+tag('mock','макет · canvas 0.4')+
    (chg?'<span class="pill chg" data-chg>не сохранено · '+chg+'</span>':'<span class="pill ok" data-chg>сохранено</span>')+(err?'<span class="pill bad">без модели · '+o.nodes.filter(x=>!x.model).length+'</span>':'')+
    '<span class="r"><span class="btn sm ghost" data-act="new" title="Новая команда — пустой холст">'+ico('new')+'Новая</span><span class="btn sm ghost" data-act="save">'+ico('save')+'Сохранить</span><span class="btn sm p'+(err?' dis':'')+'" data-act="apply" title="'+(err?'Сначала дайте модель каждой роли':'Применить к проекту '+PROJ)+'">'+ico('play')+'Применить к проекту'+(chg&&!err?'<span class="dot"></span>':'')+'</span></span></div>'+
    '<div class="tc-cons">'+lib({drag:o.libDrag})+'<div class="om-canvas tc" data-canvas><div class="om-view" data-view><svg class="om-edges" data-edges></svg><div data-nodes></div></div>'+zoom()+'<div class="tc-legend"><span><i></i>пишет · сдаёт</span><span><i class="ret"></i>возврат</span><span><i class="new"></i>новая</span><span><i class="on"></i>выбранные</span><span>·</span>'+tag('mock','макет')+'<span>холст · связи</span>'+tag('live','есть')+'<span>роли · модель · права</span></div></div></div></section>'; }
  function mountCons(app,o={}){ const N=JSON.parse(JSON.stringify(o.neu?[]:CN0)), E0=o.neu?[]:CE0.slice(); let extra=0;
    const draw=()=>{ app.innerHTML=side()+consMain({nodes:N,edges:E0,neu:o.neu&&!N.length,extra:extra,libDrag:o.libDrag}); };
    draw();
    let Eng=null; const POS={};
    function build(){ Eng=engine(app,{nodes:()=>N.length?N.map(n=>node(n)).join(''):emptyNode(),edges:()=>E0,path:consPath,padBottom:64,
      layout:(G,W,H,layer)=>{ if(!N.length){ G.rects.empty={x:Math.round((W-236)/2),y:Math.round(H/2-70),w:236,h:140}; return; } N.forEach(n=>{ const p=POS[n.id]||n; G.rects[n.id]={x:p.x,y:p.y,w:236,h:150}; }); },
      onEnd:G=>{ Object.keys(G.rects).forEach(k=>{ POS[k]={x:G.rects[k].x,y:G.rects[k].y}; }); },
      onClick:t=>{ const hr=t.closest('[data-href]'); if(hr){ location.hash=hr.dataset.href; return true; }
        const x=t.closest('[data-x]'); if(x){ const id=x.dataset.x; const i=N.findIndex(n=>n.id===id); if(i>=0) N.splice(i,1); for(let j=E0.length-1;j>=0;j--) if(E0[j].s===id||E0[j].t===id) E0.splice(j,1); extra++; rebuild(); return true; }
        const li=t.closest('[data-lib]'); if(li){ add(li.dataset.lib); return true; }
        const act=t.closest('[data-act]'); if(act){ const a=act.dataset.act; if(a==='save'){ N.forEach(n=>{ delete n.chg; delete n.neu; }); E0.forEach(e=>{ if(e.k==='new') delete e.k; }); extra=0; rebuild(); } if(a==='new'){ N.length=0; E0.length=0; extra=0; o.neu=true; rebuild(); } if(a==='apply'&&!act.classList.contains('dis')){ N.forEach(n=>{ delete n.chg; delete n.neu; }); E0.forEach(e=>{ if(e.k==='new') delete e.k; }); extra=0; rebuild(); } return true; }
        return false; }}); Eng.render(); if(o.sel) Eng.select(o.sel); }
    function add(k){ const L=LIBN[k]||['own','Своя роль','','']; const cnt=N.filter(n=>n.role===(k==='worker'?'worker':k)).length; const id=k+'-'+Date.now().toString(36);
      const W=app.querySelector('[data-canvas]').clientWidth||900; N.push({id:id,name:L[1]+(cnt?' '+(cnt+1):''),role:k==='own'?'своя':k==='worker'?'worker':k,ic:k==='own'?'role':k,model:k==='own'?'':L[3],rights:'Только чтение',file:'roles/'+k+'.md',x:Math.max(24,W-300),y:24+N.length*40,neu:1}); extra++; rebuild(); }
    function rebuild(){ const sel=Eng&&Eng.sel; draw(); build(); if(sel) Eng.select(sel); }
    app.addEventListener('dragstart',e=>{ const li=e.target.closest('[data-lib]'); if(!li) return; e.dataTransfer.setData('text/plain','lib:'+li.dataset.lib); li.classList.add('drag'); });
    app.addEventListener('dragend',e=>{ const li=e.target.closest('[data-lib]'); if(li) li.classList.remove('drag'); });
    app.addEventListener('dragover',e=>{ if(e.target.closest('[data-canvas]')) e.preventDefault(); });
    app.addEventListener('drop',e=>{ if(!e.target.closest('[data-canvas]')) return; const d=e.dataTransfer.getData('text/plain'); if(d.startsWith('lib:')){ e.preventDefault(); add(d.slice(4)); } });
    build(); return {get engine(){ return Eng; }}; }

  /* ---- экран «Очередь задач» крупно: список слева, роли-цели справа ---- */
  function mountQueue(app,o={}){ const Q=JSON.parse(JSON.stringify(QUEUE0));
    const list=()=>'<div class="tc-queue"><div class="filt"><span class="chip on">Все<b style="font:500 10px var(--mono);color:var(--ink3);margin-left:4px">'+Q.length+'</b></span><span class="chip">В очереди</span><span class="chip">В работе</span><span class="chip">На ревью</span><span class="chip">Готово</span><span class="sp"></span>'+tag('mock','макет · очередь из плана')+'</div><div class="hd"><b>Очередь задач</b><span class="m">№ · краткое имя · кому · состояние</span><span class="r"><span class="btn sm ghost">'+ico('new')+'задача</span><span class="btn sm ghost">из плана ↓</span></span></div><div class="rows one">'+Q.map(t=>task(t,{cls:'big'+(o.drag===t.n?' drag':'')})).join('')+'</div><div class="src">источник: <b>план · компиляция</b> (когда живое) или <b>оркестратор</b> · строка тянется на карточку роли справа; порядок в очереди — тоже перетаскиванием</div></div>';
    const targets=()=>'<div class="targets"><span class="lbl">цели · карточки ролей</span>'+orch({cls:'compact'})+ROLES.map(r=>card(r,{cls:o.drop===r.id?'drop':''})).join('')+'</div>';
    const draw=()=>{ app.innerHTML=side()+'<section class="main tc-main">'+tabs('swarm')+'<div class="ps2-tbar"><b>Команда агентов · очередь</b><span class="m">'+PROJ+' · '+Q.filter(t=>t.st!=='done').length+' открытых</span><span class="pill acc">ждёт вас · 1</span><span class="r"><span class="btn sm ghost" data-href="#work">'+ico('swarm')+'К полотну</span></span></div><div class="tc-qbig"><div data-list>'+list()+'</div>'+targets()+'</div></section>'; };
    draw(); bindQueue(app,Q,(t,c)=>{ app.querySelector('[data-list]').innerHTML=list(); const l3=c.querySelector('.l3'); if(l3) l3.textContent='№'+t.n+' назначена: '+t.t; });
    app.addEventListener('click',e=>{ const h=e.target.closest('[data-href]'); if(h) location.hash=h.dataset.href; }); }

  /* ---- телефон 390: карточки в колонку, стрелки упрощены ---- */
  function phone(el){ el.innerHTML='<div class="ps2-phone tc-phone"><div class="ph-top"><span class="m-btn">☰</span>Команда агентов<span class="r"><span class="pill acc">ждёт вас · 1</span></span></div><div class="ph-body">'+
    '<div style="display:flex;gap:6px;align-items:center;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)">'+PROJ+' · 6 ролей · канал в норме'+tag('live','есть')+'</div>'+orch()+
    '<div class="spine"><span class="lbl">подчинены оркестратору</span>'+card(BYID.rev)+card(BYID.w1)+'<div class="livemsg"><i></i>Воркер 1 → Ревьюер · сдача TS-35 · 2 мин</div>'+card(BYID.w2)+card(BYID.res)+card(BYID.test)+'</div>'+
    queue(QUEUE0.slice(1,4),{one:true})+'</div><div class="ph-comp"><div class="tc-cx"><div class="box"><div class="in">Написать оркестратору…</div><div class="cx-bot"><span class="cx-plus">＋</span><span class="cx-chip">'+ico('lock')+'<b>Всё без вопросов</b><i>▾</i></span><span class="cx-sp"></span><span class="cx-go off">'+ico('up')+'</span></div></div></div></div></div>'; }

  /* ---- раздел дизайн-кода team-canvas-spec: элементы и состояния ---- */
  function spec(root){ const box=(cap,body,style)=>'<div class="box" style="width:auto;'+(style||'')+'"><div class="cap2">'+cap+'</div>'+body+'</div>';
    const lbl=t=>'<span class="lbl">'+t+'</span>';
    const col=(t,h)=>'<div class="col">'+lbl(t)+h+'</div>';
    const r=BYID;
    const cards=col('думает',card({...r.w1,st:'think',stText:'думает · 6 с',last:'Проверяю опись перед сдачей'}))+col('пишет',card(r.w1))+col('ждёт решения · коньяк',card(r.rev))+col('ждёт соседа',card(r.w2))+col('молчит 14 мин',card(r.res))+col('ошибка',card(r.test))+col('свободно',card({...r.res,st:'free',stText:'свободно · без задачи',last:''}))+col('загрузка',card(r.w1,{cls:'skel'}))+col('выбрана',card(r.w1,{cls:'on'}))+col('соседняя по связи',card(r.rev,{cls:'near'}))+col('приглушена',card(r.res,{cls:'dim'}))+col('цель перетаскивания',card(r.w2,{cls:'drop'}));
    const orchs=col('думает · встроенный чат: последние реплики + поле',orch())+col('ждёт вас · решение прямо в карточке',orch({st:'wait'}))+col('свёрнута (список целей, телефон)',orch({cls:'compact'}));
    const arr=(cls,t)=>'<div class="col">'+lbl(t)+'<svg class="tc-arr" viewBox="0 0 170 40"><path class="'+cls+'" d="M4 20 C 60 20, 110 20, 160 20"/><path class="'+cls+'" d="M152 14l8 6-8 6" style="stroke-dasharray:none;animation:none"/></svg></div>';
    const arrows=arr('','оргсхема · серым · кто кому подчинён')+arr('live','живое сообщение · коньяк · бежит')+arr('on','выбранная связь')+arr('dim','приглушённая')+arr('ret','возврат (конструктор)')+arr('new','новая связь · не сохранена')+'<div class="col">'+lbl('подпись живой стрелки')+'<span class="om-lbl live" style="position:static;transform:none">Воркер 1 → Ревьюер · сдача TS-35 · 2 мин</span></div>';
    const plus=col('кнопка «+ роль»','<span class="tc-plus"><span class="btn sm">'+ico('new')+'роль</span></span>')+col('открыта · наведение на «Тестер»',plusMenu({static:true,hov:'test'}))+col('без библиотеки (нет подключённых моделей)','<span class="tc-plus"><span class="btn sm" style="color:var(--ink3);border-style:dashed">'+ico('new')+'роль · нет моделей</span></span>');
    const n=k=>CN0.find(x=>x.id===k);
    const nodes=col('обычная · порты: получает · пишет',node(n('w1')))+col('выбрана · подписи портов',node(n('w1'),{cls:'on'}))+col('новая · не сохранена',node({...n('w2'),neu:1,chg:0}))+col('изменена · точка у имени',node(n('w2')))+col('ошибка · нет модели',node(n('test')))+col('пустая команда','<div class="tc-static" style="width:236px">'+emptyNode()+'</div>');
    const libs=col('библиотека · обычная · «в команде · N» · своя роль',lib())+col('перетаскивается «Тестер»',lib({drag:'test'}));
    const Q=QUEUE0; const qrow=(t,c)=>'<div style="width:100%">'+task(t,{cls:c})+'</div>';
    const qs='<div style="display:grid;gap:4px;width:100%">'+lbl('в очереди')+qrow(Q[3])+lbl('у воркера 2')+qrow(Q[2])+lbl('на ревью')+qrow(Q[1])+lbl('готово')+qrow(Q[0])+lbl('ошибка')+qrow({n:17,t:'TS-39 · карта команды в Harnessy',who:'Тестер',st:'err',stt:'ошибка · прогон упал'})+lbl('перетаскивание · строка поднята')+'<div style="height:26px"></div>'+qrow(Q[3],'drag')+lbl('крупная строка (кадр «Очередь»)')+qrow(Q[4],'big')+lbl('блок целиком · шапка · источник')+'</div>'+queue(Q.slice(0,4));
    const cx=(t,v)=>col(t,'<div style="width:720px">'+composer(v)+'</div>');
    const cxs=cx('(а) «Только обсуждение» — первый пункт в меню прав «Всё без вопросов ▾» (меню — ниже) · полотно — иконка справа от чипа чата',{v:'a'})+cx('(б) два тумблера-чипа над композером слева: «Обсуждение» и «Команда»',{v:'b'})+cx('(в) переключатель вида «Чат · Команда» над композером + тумблер «Обсуждение» в строке чипов',{v:'c'});
    const btns=col('кнопка «Полотно команды» · иконка',cvbtn())+col('с подписью',cvbtn({lbl:1}))+col('активна · полотно открыто',cvbtn({lbl:1,on:1}))+col('с бейджем «ждёт вас»',cvbtn({lbl:1,b:'1'}))+col('недоступна · нет ролей',cvbtn({lbl:1,dis:1}))+col('тумблер «Обсуждение» выкл · вкл','<span class="tc-tg"><span class="tog"></span>'+ico('talk')+'Обсуждение</span> <span class="tc-tg on"><span class="tog on"></span>'+ico('talk')+'Обсуждение</span>')+col('переключатель вида','<span class="tc-seg"><span class="on">'+ico('chat')+'Чат</span><span>'+ico('swarm')+'Команда<b>1</b></span></span>')+col('меню прав с «Только обсуждение» (вариант а)',rights({static:true}));
    const honest='<div class="tc-honest"><div><b>'+tag('live','есть')+'роли · назначения · канал · статусы</b>Роли и места в канале, busy / waiting, последняя реплика и расход хода — есть в движке (live.js). Живая стрелка — из сообщений канала.</div><div><b>'+tag('mock','макет')+'очередь из плана</b>Нумерованные задачи, «кому» и состояние — макет: компиляция OMG не подключена; до неё источник очереди — оркестратор.</div><div><b>'+tag('mock','макет')+'конструктор команды</b>Холст, связи, сохранение и «применить к проекту» — макет (canvas 0.4); модель и права у роли — есть в движке.</div></div>';
    root.innerHTML=box('карточка члена команды · .tc-card · 4 строки: роль · модель | состояние | последняя строка из чата | расход за ход · состояния',
        '<div class="tc-static">'+cards+'</div><p class="conn-note">Состояние — вторая строка и точка: думает (бегущий сектор) · пишет (коньяк, пульс) · ждёт решения (коньяк, кольцо, рамка карточки коньяком) · ждёт соседа (кольцо серым) · молчит N мин (серый) · ошибка (бордо) · свободно (пунктир). Третья строка — последняя реплика в чате, обрезка в одну строку. Четвёртая — расход за ход: доля недели · токены · время.</p>')+
      box('крупная карточка оркестратора · .tc-orch · тот же чат оркестратора, встроенный (не второй разговор)','<div class="tc-static">'+orchs+'</div><p class="conn-note">Шапка: орб, имя, модель, состояние, плашка «тот же чат», «⤢ чат» — во вкладку «Чат». Тело — последние реплики того же чата, поле ввода пишет в него же. Низ — расход хода и прогон. На полотне тянется как карточка; поле и реплики не тянут (data-nodrag).</p>','margin-top:14px')+
      box('стрелки · .om-edges в .om-canvas.tc · оргсхема серым · живое сообщение коньяком поверх · выбранные · приглушённые','<div class="tc-static">'+arrows+'</div><p class="conn-note">Оргсхема — кто кому подчинён, серым, без подписи. Живое сообщение по каналу — коньяк, бегущий пунктир, подпись «кто → кому · что · когда»; гаснет после прочтения. Клик по карточке — её связи коньяком, остальное приглушено (как в картах 26 · 39).</p>','margin-top:14px')+
      box('«+» на экране «Работа» · .tc-plus · меню ролей из библиотеки + «Открыть конструктор»','<div class="tc-static">'+plus+'</div><p class="conn-note">Пункт — роль из библиотеки с моделью по умолчанию; «Своя роль…» ведёт в конструктор. Назначение из меню — есть (место в канале); перестройка связей — только в конструкторе (макет).</p>','margin-top:14px')+
      box('карточка роли в конструкторе · .tc-node · порты · модель ▾ · права · инструкция роли · состояния','<div class="tc-static">'+nodes+'</div><p class="conn-note">Порт слева — «получает», справа — «пишет»; подписи портов видны у выбранной карточки. Модель и права — те же меню, что в композере; инструкция — файл роли в папке проекта. Без модели применить команду нельзя — карточка бордо, кнопка «Применить» заблокирована.</p>','margin-top:14px')+
      box('библиотека ролей · .tc-lib · Оркестратор · Ревьюер · Воркер · Ресёрчер · Тестер · UX-ревьюер · своя','<div class="tc-static">'+libs+'</div>','margin-top:14px')+
      box('очередь задач · .tc-queue / .tc-task · № · краткое имя · кому · состояние · перетаскивание на роль','<div class="tc-static">'+qs+'</div><p class="conn-note">Состояния: в очереди · у роли (коньяк) · на ревью · готово (зелёный) · ошибка (бордо). Строка тянется на карточку роли: цель подсвечивается пунктиром и подсказкой «назначить …», после сброса задача меняет «кому» и состояние. Источник — план / компиляция (когда живое) или оркестратор.</p>','margin-top:14px')+
      box('над композером · «Режим общения» и «Полотно команды» · три варианта (а)(б)(в) · кадры 1440 — скетч 41','<div class="tc-static">'+cxs+'</div>','margin-top:14px')+
      box('кнопка «Полотно команды» · .tc-cvbtn · тумблер · переключатель вида · меню прав с «Только обсуждение»','<div class="tc-static">'+btns+'</div><p class="conn-note">«Только обсуждение» — у движка режим chat: агент обсуждает, ничего не делает. «Полотно команды» — быстрый вход во вкладку «Команда агентов» проекта из чата; одно и то же место, не второй экран. Бейдж — сколько ролей ждут вас.</p>','margin-top:14px')+
      box('плашки честности',honest,'margin-top:14px'); }

  /* ---- страница 41: кадры по data-tc, масштаб кадров под лист, режим снимка #shot= ---- */
  const capl=(t,w)=>'<div class="cap"><span>'+t+'</span><span>'+w+'</span></div>';
  function mount(el){ const k=el.dataset.tc, o=el.dataset.o?JSON.parse(el.dataset.o):{};
    if(k==='work'||k==='constructor'||k==='queue'||k==='chat'){ const app=document.createElement('div'); app.className='app'; el.appendChild(app);
      if(k==='work') mountWork(app,o); else if(k==='constructor') mountCons(app,o); else if(k==='queue') mountQueue(app,o); else app.innerHTML=side()+chatMain(o); }
    else if(k==='phone') phone(el);
    else if(k==='spec') spec(el);
    if(el.dataset.cap) el.insertAdjacentHTML('beforeend',capl(el.dataset.cap,el.dataset.w||'1440 × 900')); }
  function fit(){ const sheet=document.querySelector('.sheet'); if(!sheet) return; document.querySelectorAll('.fr').forEach(fr=>{ const a=fr.querySelector('.app, .ps2-phone'); if(!a) return; a.style.transform=''; a.style.marginBottom=''; const w=a.offsetWidth,h=a.offsetHeight,avail=sheet.clientWidth-40,k=Math.min(1,avail/w); if(k<1){ a.style.transform='scale('+k+')'; a.style.marginBottom=(-(h*(1-k)))+'px'; } }); }
  function shot(){ const q=new URLSearchParams(location.hash.replace(/^#/,'')); const id=q.get('shot'); if(!id) return; const el=document.getElementById(id); if(!el) return; document.body.classList.add('shot'); el.classList.add('shot-on'); }
  function page(){ shot(); document.querySelectorAll('[data-tc]').forEach(mount); if(!document.body.classList.contains('shot')){ fit(); addEventListener('resize',fit); }
    document.addEventListener('click',e=>{ const rc=e.target.closest('[data-rchip]'); if(rc&&!e.target.closest('.tc-rights')){ rc.classList.toggle('open'); return; } const it=e.target.closest('.tc-rights .it'); if(it){ const rc2=it.closest('[data-rchip]'); if(rc2&&!rc2.closest('.fr.keep')){ rc2.querySelector('b').textContent=it.querySelector('div').firstChild.textContent.trim(); rc2.classList.remove('open'); } return; }
      const tg=e.target.closest('.tc-tg'); if(tg&&!tg.closest('.tc-static')){ tg.classList.toggle('on'); const t=tg.querySelector('.tog'); if(t) t.classList.toggle('on'); return; }
      const sg=e.target.closest('.tc-seg span'); if(sg&&!sg.closest('.tc-static')){ sg.parentElement.querySelectorAll('span').forEach(s=>s.classList.toggle('on',s===sg)); } }); }
  return {revealText,ROLES,QUEUE0,LIB,card,orch,queue,task,plusMenu,lib,node,composer,chatMain,side,tabs,mountWork,mountCons,mountQueue,phone,spec,page,fit,engine,workPath,consPath,bindQueue,ico,tag};
})();
