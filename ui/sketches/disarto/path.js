/* Путь проекта (скетчи 28, 30, 32): лента стадий из восьми стадий кода, боковая панель живого окна, карточки стадий поверх.
   Данные-заглушки — один пример везде: учёт ресурсов строительной компании. Команды движка на экранах не называются. */
window.PT=(function(){
  const STAGES=[['discovery','Discovery'],['concept','Концепция'],['operation-map','Операционная карта'],['specification','Спецификация'],['features','Фичи'],['om-g2','Проход OM'],['compilation','Компиляция'],['execution','Исполнение']];
  const TAG={mock:'макет',off:'есть в коде, выключено',multi:'собрано из нескольких чтений',none:'нет в движке',ex:'пример'};
  const tag=k=>'<span class="tag '+k+'">'+TAG[k]+'</span>';
  const pillSt=s=>s==='есть'?'<span class="pill ok">есть</span>':s==='частично'?'<span class="pill warn">частично</span>':tag('mock');
  /* точки владельца по стадиям — из карты прохода (статус в карте), не выдумывать сверх */
  const POINTS={
    'concept':[['Подлинный выбор','частично'],['Вид концепции','нет']],
    'operation-map':[['Владелец видит путь','частично']],
    'specification':[['Вид договоров владельцу','нет']],
    'features':[['Назначение · ожидание','частично'],['Вид способностей','нет']],
    'om-g2':[['Запуск прохода','есть'],['Выбор владельца в проходе','есть'],['Остановить · продолжить · состояние · решения · расход','есть']],
    'compilation':[['Сборка плана из карты','есть']],
    'execution':[['Запуск исполнения','есть'],['Решение владельца','есть'],['Поставка · слияние','есть'],['Обратный путь к планировщику','нет в движке']]
  };
  /* пример: Discovery текущая, остальные впереди; счётчик «ждёт вас» на текущей */
  function ribbon(el,o){ o=o||{}; const cur=o.cur||'discovery', need=o.need||{}, done=o.done||[];
    el.innerHTML=STAGES.map(([k,n],i)=>{ const cls=done.includes(k)?'d':k===cur?'c':''; const st=cls==='d'?'принята':cls==='c'?(o.curText||'идёт'):''; const nm=k==='operation-map'?'Опер. карта':n;
      return '<div class="pt-stage '+cls+'" data-stage="'+k+'" title="'+n+'"><i>'+(cls==='d'?'✓':i+1)+'</i><div><b>'+nm+'</b><small>'+k+'</small></div>'+(st?'<em>'+st+'</em>':'')+(need[k]?'<span class="n">'+need[k]+'</span>':'')+'</div>'; }).join('');
    el.querySelectorAll('[data-stage]').forEach(s=>s.addEventListener('click',()=>HX.open(s,stageCard(s.dataset.stage,o),{w:720,h:520,hide:false})));
  }
  function stageCard(k,o){ const n=STAGES.find(s=>s[0]===k)[1]; const cur=o.cur||'discovery';
    if(k==='discovery'){ const pts=[['1','Рамка','как поняли поручение: тип продукта, домены, глубина осей, бюджет','принята · 14.10','29-discovery-frame.html','этап B'],
        ['2','Ход исследования','вопросы по осям, что блокирует, движение, бюджет','идёт · 2 ждут вас','30-discovery-progress.html','открыть →'],
        ['3','Досье','12 разделов, утверждения с видом и источником, противоречия','18 из 31 вопросов','31-discovery-dossier.html','этап B'],
        ['4','Варианты','сравнение по критериям, почему рекомендован, выбор одного или отклонить все','ждёт вашего выбора · В1 рекомендован','32-discovery-variants.html','открыть →'],
        ['5','Итог','что строим, первый результат, критерий успеха, не-цели; принять или поправка','впереди','33-discovery-outcome.html','этап B'],
        ['6','Неизвестные и условия','что нужно от вас или мира; какое условие чем закрывается','1 блокирует стадию','34-discovery-unknowns.html','этап B']];
      return '<div class="from">стадия 1 из 8 · discovery · '+tag('off')+'</div><div class="ch"><h3>Discovery · где вы нужны</h3></div><div class="csub">Шесть точек касания. Открыты на этом этапе — ход исследования и варианты; остальные рисуются следом.</div>'+
        '<div class="lst2">'+pts.map(p=>'<div class="pt-unk'+(p[5]==='открыть →'?' blk':'')+'"><p><b>'+p[0]+' · '+p[1]+'</b><small>'+p[2]+'</small></p><span class="when">'+p[3]+'</span>'+(p[5]==='открыть →'?'<a class="btn sm p" href="'+p[4]+'" style="text-decoration:none">'+p[5]+'</a>':'<span class="btn sm ghost" style="opacity:.6">'+p[5]+'</span>')+'</div>').join('')+'</div>'; }
    const pts=POINTS[k]||[]; const ahead=STAGES.findIndex(s=>s[0]===k)>STAGES.findIndex(s=>s[0]===cur);
    return '<div class="from">стадия '+(STAGES.findIndex(s=>s[0]===k)+1)+' из 8 · '+k+'</div><div class="ch"><h3>'+n+'</h3></div><div class="csub">'+(ahead?'Впереди — откроется после принятия предыдущей стадии. ':'')+'Точки, где владелец смотрит или решает, и что из этого уже в движке.</div>'+
      HX.blk('точки владельца','<div class="lst2">'+(pts.length?pts.map(p=>'<div class="pt-unk"><p><b>'+p[0]+'</b></p>'+(p[1]==='нет в движке'?tag('none'):pillSt(p[1]))+'</div>').join(''):'<div class="pt-unk empty">точек владельца на этой стадии нет</div>')+'</div>')+
      '<p class="conn-note" style="margin-top:10px">Экран стадии — этап B (скетч 35–38).</p>'; }
  /* боковая панель живого окна — та же разметка, что в прототипе (скетч 27) */
  const F='<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z"></path></svg>';
  function side(el){ el.innerHTML='<div class="ps-head"><span class="logo"><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"></path></svg></span><b class="ps-proj">Стройучёт <i>▾</i></b><span class="col">⟨</span></div><div class="newbtn"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>Новый чат<kbd>⌘N</kbd></div><div class="search"><svg viewBox="0 0 24 24"><path d="M20 20l-4.5-4.5M11 17a6 6 0 100-12 6 6 0 000 12z"></path></svg>Найти…<kbd>⌘K</kbd></div>'+
    '<div class="ps-scroll"><div class="grp">работа</div><div class="nav"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6L3.4 9.3l6-.7z"></path></svg><span class="t">Сейчас</span><span class="b">3</span></div><div class="nav"><svg viewBox="0 0 24 24"><path d="M4 6h16v10H9l-5 4z"></path></svg><span class="t">Чат</span><span class="m">2</span></div><div class="nav on"><svg viewBox="0 0 24 24"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"></path></svg><span class="t">План · карта</span><span class="m">путь</span></div>'+
    '<div class="grp">закреплённые</div><div class="ps-pins"><div class="ps-chat pin"><i></i><span class="s one">что мешает учёту материалов на объекте</span><span class="m">без роли · Стройучёт</span></div></div>'+
    '<div class="grp">проекты</div><div class="ps-folders"><div class="ps-folder cur"><button type="button" class="chev">⌄</button>'+F+'<span class="t">Стройучёт</span><span class="m">пример · git</span></div><div class="ps-fold-body"><div class="nav psub"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"></path></svg><span class="t">Документы проекта</span></div><div class="nav psub"><svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"></path></svg><span class="t">Артефакты</span></div><div class="nav psub"><svg viewBox="0 0 24 24"><path d="M5 6c0-1.7 3-3 7-3s7 1.3 7 3v12c0 1.7-3 3-7 3s-7-1.3-7-3z"></path></svg><span class="t">Память проекта</span></div><div class="nav psub"><svg viewBox="0 0 24 24"><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"></path></svg><span class="t">Ресёрч</span></div><div class="ps-chat act"><i></i><span class="s one">поручение: учёт ресурсов строительной компании</span></div><div class="ps-chat"><i></i><span class="s one">без названия</span></div><div class="ps-chat">＋ чат без роли</div></div>'+
    '<div class="ps-folder"><button type="button" class="chev">›</button>'+F+'<span class="t">Сайт студии</span><span class="m">3 роли · git</span></div><div class="ps-folder"><button type="button" class="chev">›</button>'+F+'<span class="t">Книга рецептов</span><span class="m">1 роль</span></div></div><div class="grp"></div><div class="nav"><svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h9"></path></svg><span class="t">Журнал</span></div></div>'+
    '<div class="ps-foot"><div class="nav"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path></svg><span class="t">Уйти</span></div><div class="nav"><svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg><span class="t">Настройки</span></div><div class="limits lw" role="button" tabindex="0" aria-label="Все лимиты" title="Все лимиты"><div class="cap">Осталось</div><div class="row"><span>Claude</span><span><b>64 %</b><span class="p">W</span></span></div><div class="ticks">'+'<i class="on"></i>'.repeat(15)+'<i></i>'.repeat(9)+'</div><div class="row"><span>Codex</span><span><b>91 %</b><span class="p">W</span></span></div><div class="ticks">'+'<i class="on"></i>'.repeat(22)+'<i></i>'.repeat(2)+'</div></div><div class="user"><span class="av">В<i></i></span><div>Владелец<small>you@example.com</small></div><span class="chev">⌄</span></div></div>'; }
  /* вкладки проекта: план пользователя (02) · карта проекта (26) · путь (28) */
  function tabs(on){ return '<div class="tabs" style="margin-bottom:10px"><a href="02-plan.html" style="text-decoration:none"><span'+(on==='plan'?' class="on"':'')+'>План пользователя</span></a><a href="26-om-map.html" style="text-decoration:none"><span'+(on==='map'?' class="on"':'')+'>Карта проекта</span></a><a href="28-path.html" style="text-decoration:none"><span'+(on==='path'?' class="on"':'')+'>Путь <b>3</b></span></a></div>'; }
  function boot(o){ document.querySelectorAll('aside.side.ps[data-pt-side]').forEach(side); document.querySelectorAll('[data-pt-tabs]').forEach(e=>e.innerHTML=tabs(e.dataset.ptTabs)); document.querySelectorAll('[data-pt-ribbon]').forEach(e=>ribbon(e,o));
    /* ?open=<селектор> — раскрыть карточку сразу после загрузки (снимки для сдачи и ссылки из обзора) */
    const q=new URLSearchParams(location.search).get('open'); if(q) setTimeout(()=>{ const el=document.querySelector(q); if(el) el.click(); },250); }
  return {STAGES,tag,ribbon,stageCard,side,tabs,boot,pillSt};
})();
