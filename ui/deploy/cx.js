/* cx.js — поле ввода Harnessy по варианту C′ (скетч 22; ревью codex-ux №3454, №3458; слово владельца 07.10.2026).
   Сверху — папка · роль · включённые режимы; над полем — вложения; снизу — ＋ · права · модель · усилие · ⓘ · отправка.
   Значения — от выбранного места харнесса (LIVE.H); смена прав и модели применяется к месту через /api/panes/<id>.
   Подсказки — в ⓘ. Прогноза расхода нет: факт показывает live.js под ответом. Подключается сборкой после live.js. */
(function(){
  if(!document.documentElement.hasAttribute('data-proto')||!window.LIVE) return;
  const L=window.LIVE, PAGE=document.documentElement.dataset.page||''; if(PAGE!=='new'&&PAGE!=='chat'&&PAGE!=='first') return;
  const esc=L.esc, H=L.H, S=()=>L.S;
  function cx(){ const s=S(); if(!s.cx) s.cx={folder:'',rights:null,model:null,modes:{},att:[],conn:{},noFolder:false}; return s.cx; }
  const ROOM='room', isRoom=p=>!!p&&p.id===ROOM, seats=()=>(H.panes||[]).filter(p=>p.id!==ROOM), room=()=>(H.panes||[]).find(p=>p.id===ROOM);
  const base=path=>(path||'').split('/').filter(Boolean).pop()||'папка';
  const rolesN=n=>n+' '+(n%10===1&&n%100!==11?'роль':(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'роли':'ролей'));
  function keepDraft(){ const ta=document.querySelector('.frame.cur .live-in')||document.querySelector('.live-in'); if(ta&&ta.value.trim()){ S().draft=ta.value; L.save(); } }   // набранное со стартового экрана уходит черновиком в чат (Kimi UX-2 №96 п.2)
  const I={folder:'<path d="M3 7h6l2 2h10v10H3z"/>',role:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',model:'<circle cx="12" cy="12" r="4"/>',bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',up:'<path d="M12 19V5M5 12l7-7 7 7"/>',search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',think:'<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5V16h8v-2.5A6 6 0 0012 3z"/>',sub:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 18c0-2 2-3.5 4-3.5s3 1 3 3"/>',file:'<path d="M7 3h7l4 4v14H7z"/>',new:'<path d="M12 5v14M5 12h14"/>',shot:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/>',src:'<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',tools:'<path d="M4 7h16M4 12h16M4 17h10"/>',cmd:'<path d="M5 12h14M12 5l7 7-7 7"/>',mac:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>',tree:'<path d="M6 3v18M6 9c0 3 6 3 6 6M18 3v6a3 3 0 01-3 3"/>',back:'<path d="M15 6l-6 6 6 6"/>'};
  const svg=k=>'<svg viewBox="0 0 24 24">'+(I[k]||'')+'</svg>';
  const MODES_UI={search:['Поиск','search'],think:['Думать','think'],sub:['Субагенты','sub']};
  const seat=()=>H.on?H.pane:null;
  const modeLabel=id=>{ const m=(H.modes||[]).find(x=>x.id===id); return m?m.label:(id||'права не заданы'); };
  const allModels=()=>{ const out=[]; Object.entries(H.models||{}).forEach(([v,ms])=>(ms||[]).forEach(m=>out.push(Object.assign({vendor:v},m)))); return out; };
  const modelLabel=(id,vendor)=>{ const m=allModels().find(x=>x.id===id&&(!vendor||x.vendor===vendor)); return m?m.label:id==='default'?'по умолчанию программы':(id||'модель не выбрана'); };
  const chip=(k,ico,text,o)=>{ o=o||{}; return '<span class="cx-chip'+(o.cls?' '+o.cls:'')+'" data-cx="'+k+'" title="'+esc(o.title||'')+'">'+svg(ico)+'<b>'+esc(text)+'</b><i>▾</i></span>'; };

  // ── строка: верх над .box, вложения внутри перед полем, низ вместо нарисованной .bar2
  function build(box){ if(!box.__cx||box.__cxBuilt) return; box.__cxBuilt=true;
    const top=document.createElement('div'); top.className='cx-top'; box.before(top);
    const att=document.createElement('div'); att.className='cx-att'; box.insertBefore(att, box.querySelector('.in'));
    const bar=box.querySelector('.bar2'), bot=document.createElement('div'); bot.className='cx-bot'; if(bar) bar.replaceWith(bot); else box.appendChild(bot);
    const ta=box.__cx.ta; if(ta) ta.addEventListener('input',()=>{ const g=box.querySelector('.cx-go'),p=seat(); if(g&&!g.classList.contains('busy')) g.classList.toggle('off',!ta.value.trim()||H.on&&!(p&&p.model)); }); }
  function render(box){ const c=cx(), p=seat(), top=box.previousElementSibling, bot=box.querySelector('.cx-bot'), att=box.querySelector('.cx-att'); if(!top||!bot) return;
    if(H.on){const pending=typeof c.noFolderPending==='string'&&c.noFolderPending===H.project&&S().ui.pane===ROOM&&!H.noProject;if(!pending&&(c.noFolder!==!!H.noProject||c.noFolderPending!==undefined)){c.noFolder=!!H.noProject;delete c.noFolderPending;L.save();}}   // привязка проекта — из статуса движка, а не сохранённого флага окна
    const folder=c.noFolder?'Без проекта':(H.on?base(H.project):(c.folder||'проект не выбран'));
    const role=p?(isRoom(p)?'Без роли':L.paneName(p)):'Без роли', rights=p?modeLabel(p.mode):modeLabel(c.rights);
    const model=p&&p.model?modelLabel(p.model,p.vendor):'выбрать модель';   // у разговора без роли модели нет, пока её не выбрали
    const act=p?((H.active||{})[p.id]):null, meta=(H.chatList||[]).find(x=>x.id===act), chatLabel=(PAGE==='new'&&S().ui.fresh)?'Новый чат':(meta&&meta.messages?(meta.title||'без названия'):'Новый чат');
    const direct=p&&S().ui.direct&&S().ui.direct[p.id]&&p.kind!=='orchestrator'&&!isRoom(p);
    const busy=!!(L.busy&&L.busy()), empty=!(box.__cx.ta&&box.__cx.ta.value.trim())||(H.on&&!(p&&p.model));   // кнопка ввода: по образцу Claude Desktop/Codex — явное «идёт ход» и остановка той же кнопкой (слово владельца 08.10)
    // слева — где и какой разговор (папка · чат · включённые режимы), справа — кто (роль), в порядке чтения после модели (слово владельца 08.10)
    top.innerHTML=chip('folder',c.noFolder?'src':'folder',folder,{title:c.noFolder?'Разговор без проекта: модель ничего не читает':'Проект: '+(H.project||'')})+
      (H.on&&p?chip('chat','file',chatLabel,{title:'Чаты: новый, чаты роли, чаты проекта'}):'')+
      Object.keys(c.modes).filter(k=>k!=='think'&&c.modes[k]&&MODES_UI[k]).map(k=>'<span class="cx-chip on" data-cx="tools" title="Включено для сообщения · ＋ → Инструменты">'+svg(MODES_UI[k][1])+'<b>'+MODES_UI[k][0]+'</b><i class="x" data-cx-off="'+k+'" title="Выключить">×</i></span>').join('')+
      '<span class="cx-sp"></span>'+(direct?'<span class="cx-chip on" data-cx="rights" title="Вы обращаетесь к роли напрямую, минуя оркестратора — записано в журнал"><b>напрямую</b><i class="x" data-cx-direct-off title="Снова через оркестратора">×</i></span>':'')+chip('role','role',c.noFolder?'Без роли':role,{cls:'acc'+((c.noFolder||(H.on&&(!p||isRoom(p))&&seats().length))?' empty':''),title:c.noFolder?'Собеседник: назначьте оркестратора — он создаст проект по разговору':(H.on&&(!p||isRoom(p))&&seats().length?'Собеседник не выбран: в команде '+seats().map(x=>L.paneName(x)).join(', '):'Собеседник: роль в проекте, назначить роль или без роли')});
    att.innerHTML=c.att.map((a,i)=>'<span class="cx-chip on" title="'+esc(a.name)+'">'+svg(a.kind)+'<b>'+esc(a.name)+'</b><i class="x" data-cx-att="'+i+'" title="Убрать">×</i></span>').join(''); att.style.display=c.att.length?'':'none';
    bot.innerHTML='<span class="cx-plus" data-cx="plus" title="Добавить и настроить">＋</span>'+chip('rights','lock',rights,{title:'Права · применяются к месту'})+'<span class="cx-sp"></span>'+
      chip('model','model',model,{cls:'acc'+(p&&p.model?'':' empty'),title:p&&p.model?'Модель: вендор → модель':'Модель ещё не выбрана'})+chip('effort','bolt','Усилие: —',{cls:'dim',title:'Усилие пока недоступно: харнесс не передаёт его месту'})+
      '<span class="cx-info" data-cx="info" title="Информация: клавиши, примеры, права, расход">i</span><span class="cx-go'+(busy?' busy':(empty?' off':''))+'" data-cx="go" title="'+(busy?'Остановить · Esc':H.on&&!(p&&p.model)?'выберите модель: у разговора нет сохранённой настройки':'Отправить · Enter')+'">'+(busy?'<i class="sq"></i>':svg('up'))+'</span>';
    if(box.__cx.ta) box.__cx.ta.placeholder=p&&!isRoom(p)?'Написать: '+L.paneName(p)+'…':'Написать сообщение…'; }
  function setBusy(on){ document.querySelectorAll('.cx-go').forEach(g=>{ if(g.classList.contains('busy')===!!on) return; const p=seat();g.classList.toggle('busy',!!on); g.title=on?'Остановить · Esc':H.on&&!(p&&p.model)?'выберите модель: у разговора нет сохранённой настройки':'Отправить · Enter'; g.innerHTML=on?'<i class="sq"></i>':svg('up');
    const box=g.closest('.box'), ta=box&&box.__cx&&box.__cx.ta; g.classList.toggle('off',!on&&(!(ta&&ta.value.trim())||H.on&&!(p&&p.model))); }); }
  function renderAll(){ document.querySelectorAll('.box').forEach(b=>{ if(b.__cx){ build(b); render(b); } });if(L.operationsDraw)L.operationsDraw(); }

  // ── всплывающая панель: одна, от чипа; поле внизу — открывается вверх; внутри переходы с «Назад»
  let pop=null, stack=[];
  function close(){ if(pop){ if(pop.__models&&pop.__models.events)pop.__models.events.close(); pop.remove(); pop=null; stack=[]; } }
  function anchorEl(){ const b=pop.__box, k=pop.__key; let a=null;   // живой чип по ключу: после перерисовки строки прежний элемент уже не в документе
    if(b){ a=(b.previousElementSibling&&b.previousElementSibling.querySelector('[data-cx="'+k+'"]'))||b.querySelector('[data-cx="'+k+'"]'); }
    return a||(pop.__anchor&&pop.__anchor.isConnected?pop.__anchor:null); }
  function place(){ const anchor=anchorEl(); if(!anchor) return; const m=anchor.closest('.main')||document.body, r=anchor.getBoundingClientRect(), mr=m.getBoundingClientRect(), s=(mr.width/m.offsetWidth)||1;
    const l=(r.left-mr.left)/s, t=(r.top-mr.top)/s, w=r.width/s, h=r.height/s, mw=m.offsetWidth, mh=m.offsetHeight;
    pop.style.maxHeight=Math.max(240,Math.min(620,mh-24))+'px'; const pw=pop.offsetWidth, ph=pop.offsetHeight;
    let left=l; if(l+pw>mw-12) left=l+w-pw; left=Math.max(12,Math.min(left,mw-pw-12));
    let top=t-8-ph; if(top<12) top=t+h+8; if(top+ph>mh-12) top=Math.max(12,mh-ph-12);   // вверх от строки; не влезло — вниз; и никогда за пределы кадра
    pop.style.left=left+'px'; pop.style.top=top+'px'; }
  function open(anchor,k){ close(); const m=anchor.closest('.main')||document.body; pop=document.createElement('div'); pop.className='cx-pop'; m.appendChild(pop); pop.__anchor=anchor; pop.__box=anchor.closest('.box')||(anchor.parentElement&&anchor.parentElement.nextElementSibling); pop.__key=anchor.dataset.cx; pop.__binding=L.sendBinding(); stack=[k]; draw(); if(k==='model')void loadModels(pop); if(k==='role'&&H.on&&L.proposalsFetch)void L.proposalsFetch(); }
  function nav(k){ stack.push(k); draw(); if(k==='model')void loadModels(pop); if(k==='role'&&H.on&&L.proposalsFetch)void L.proposalsFetch(); } function back(){ stack.pop(); draw(); }
  function draw(){ if(!pop) return; const k=stack[stack.length-1]; pop.innerHTML=(stack.length>1?'<div class="cx-hd back" data-cx-back>'+svg('back')+'<span>'+esc(TITLES[k]||'')+'</span></div>':'')+VIEWS[k](); place();
    const f=pop.querySelector('input.cx-find'); if(f){ f.addEventListener('input',()=>filter(f)); if(f.classList.contains('cx-path'))f.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();return submitProjectMenu(!!pop.querySelector('[data-cx-mkdir]'))}}); setTimeout(()=>f.focus(),0); } }
  function filter(inp){ const q=inp.value.trim().toLowerCase(); pop.querySelectorAll('[data-q]').forEach(el=>{ el.style.display=!q||el.dataset.q.toLowerCase().includes(q)?'':'none'; }); if(q) pop.querySelectorAll('.cx-grp').forEach(g=>g.classList.add('open')); }
  document.addEventListener('click',e=>{ if(pop&&!pop.contains(e.target)&&!e.target.closest('[data-cx]')) close(); },true);
  addEventListener('keydown',e=>{ if(e.key==='Escape'&&pop) close(); });

  const TITLES={folder:'Проект',mkdir:'Создать проект',opendir:'Открыть проект',role:'Собеседник',switch:'Переключение',chat:'Чаты',newchat:'Новый чат',rights:'Права',model:'Модель',effort:'Усилие',plus:'Добавить и настроить',files:'Файлы и папки',shot:'Снимок экрана',sources:'Другие источники',tools:'Инструменты и субагенты',cmds:'Команды и навыки',info:'Информация'};
  const hd=(t,r)=>'<div class="cx-hd"><span>'+t+'</span>'+(r?'<small>'+r+'</small>':'')+'</div>';
  const row=(html,o)=>{ o=o||{}; return '<div class="cx-row'+(o.on?' on':'')+(o.dis?' dis':'')+'"'+(o.a||'')+(o.q?' data-q="'+esc(o.q)+'"':'')+(o.title?' title="'+esc(o.title)+'"':'')+'>'+html+(o.on?'<span class="ck">✓</span>':'')+(o.r?'<small>'+o.r+'</small>':'')+'</div>'; };
  const note=t=>'<div class="cx-note">'+t+'</div>';
  // TS-20h: program identity comes from the catalogue; mode support comes from status.
  const connectionKind=kind=>({subscription:'подписка',apikey:'ключ API',local:'локально'}[kind]||'вид подключения не указан');
  const modelsN=n=>n+' '+(n%10===1&&n%100!==11?'модель':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'модели':'моделей');
  const modelMode=()=>{const p=seat();return p&&(!isRoom(p)||p.busy)?p.mode:cx().noFolder?'chat':'read'};
  const modeStamp=()=>JSON.stringify([modelMode(),H.turnModes||{}]);
  function modelSupport(vendor){const mode=modelMode(),cap=H.turnModes&&H.turnModes[vendor]&&H.turnModes[vendor][mode];
    return cap&&cap.ok===true?{ok:true,note:typeof cap.note==='string'?cap.note:''}:{ok:false,reason:'Ходы в режиме «'+modeLabel(mode)+'» недоступны: '+(cap&&typeof cap.reason==='string'&&cap.reason.trim()?cap.reason:'движок не сообщил поддержку режима')};}
  function modelRows(response){
    if(!response||response.ok===false||!Array.isArray(response.providers))return null;
    const text=v=>typeof v==='string'&&v.trim()&&v.length<=256&&!/[\x00-\x1f\x7f]/.test(v),ids=new Set(),rows=[];
    for(const p of response.providers){
      if(!p||!text(p.id)||ids.has(p.id)||!text(p.title)||!['subscription','apikey','local'].includes(p.kind)||!Array.isArray(p.models))return null;
      ids.add(p.id);const models=[],seen=new Set();for(const m of p.models){if(!m||!text(m.id)||!text(m.label)||seen.has(m.id))return null;seen.add(m.id);models.push({id:m.id,label:m.label})}
      rows.push({id:p.id,title:p.title,kind:p.kind,models,modelsReason:typeof p.modelsReason==='string'?p.modelsReason:''});
    }return rows;
  }
  function modelsCurrent(panel){return panel===pop&&L.bindingCurrent(panel.__binding)}
  function redrawModels(panel){if(!modelsCurrent(panel)||stack[stack.length-1]!=='model')return;
    const input=panel.querySelector('.cx-find'),value=input&&input.value,focused=document.activeElement===input,groups=Array.from(panel.querySelectorAll('[data-cx-program]')).map(g=>[g.dataset.cxProgram,g.classList.contains('open')]);
    draw();const next=panel.querySelector('.cx-find');if(next&&value){next.value=value;filter(next)}else for(const [id,on]of groups){const g=Array.from(panel.querySelectorAll('[data-cx-program]')).find(g=>g.dataset.cxProgram===id);if(g)g.classList.toggle('open',on)}if(next&&focused)next.focus();
  }
  async function loadModels(panel){if(!modelsCurrent(panel))return;
    const state=panel.__models||(panel.__models={rows:null,error:'',loading:false,saving:false,request:0,revision:0,modes:modeStamp(),events:null});
    if(!state.events&&typeof L.subscribeLiveEvents==='function')state.events=L.subscribeLiveEvents(e=>{let ev;try{ev=JSON.parse(e.data)}catch{return}if(ev.type==='providers'&&(!ev.project||ev.project===panel.__binding.project)&&modelsCurrent(panel))void loadModels(panel)});
    const request=++state.request;state.loading=true;state.error='';redrawModels(panel);let r=null;
    try{if(H.on)r=await L.api('/api/providers/catalog')}catch{}
    if(!modelsCurrent(panel)||request!==state.request)return;state.loading=false;const rows=modelRows(r);
    if(rows){if(JSON.stringify(rows)!==JSON.stringify(state.rows))state.revision++;state.rows=rows}
    else {state.revision++;state.error=typeof (r&&r.error)==='string'?r.error:H.on?'ответ каталога недоступен или неполон':'движок не подключён'}
    redrawModels(panel);
  }
  function modelsStatus(){if(!pop||!pop.__models)return;if(!modelsCurrent(pop)){close();return}const state=pop.__models,stamp=modeStamp();if(stamp!==state.modes){state.modes=stamp;state.revision++}redrawModels(pop)}
  addEventListener('live:status',modelsStatus);addEventListener('pagehide',close);
  async function chooseModel(button){const panel=pop,state=panel&&panel.__models;if(!state||state.saving||state.loading||state.error||!modelsCurrent(panel))return;
    const program=(state.rows||[]).find(p=>p.id===button.dataset.cxVendor),model=program&&(program.models.length?program.models:[{id:'default',label:'по умолчанию программы'}]).find(m=>m.id===button.dataset.cxModel);
    if(!model||!modelSupport(program.id).ok)return;const revision=state.revision,modes=modeStamp();state.saving=true;state.failure='';redrawModels(panel);
    try{await setSeat({vendor:program.id,model:model.id},'Модель места',{
      valid:()=>modelsCurrent(panel)&&state.revision===revision&&!state.loading&&!state.error&&modeStamp()===modes&&modelSupport(program.id).ok,
      failed:r=>{if(modelsCurrent(panel)){state.failure='Настройка не применена · '+(typeof (r&&r.reason)==='string'?r.reason:typeof (r&&r.error)==='string'?r.error:'нет связи');redrawModels(panel)}}
    })}finally{state.saving=false;redrawModels(panel)}
  }
  const tog=(k,on)=>'<span class="cx-tog'+(on?' on':'')+'" data-cx-tog="'+k+'" title="'+(on?'Выключить':'Включить')+'"></span>';
  function proposedRoles(){
    if(!H.on||cx().noFolder)return '';const state=L.teamProposals;
    let html=hd('Предложено в разговоре','текущий проект');
    if(!state||state.project!==H.project||state.loading&&!state.data.length)return html+note('Читаю предложения команды…');
    if(state.error)return html+note(esc(state.error))+row('Повторить чтение',{a:' data-cx-team-refresh'});
    const q=state.data[state.data.length-1];if(!q)return html+note('Предложение не зарегистрировано. Если оркестратор описал состав в разговоре, попросите его: «зарегистрируй предложение».')+row('Попросить оркестратора',{a:' data-cx-team-request'});
    if(state.data.some(previous=>previous!==q&&previous.confirmed)){const n=q.seats.length;html+=note('+'+n+' '+(n===1?'место':n>=2&&n<=4?'места':'мест')+' к составу')}
    html+=q.seats.map((s,i)=>{const member=L.proposalMember(q,i),created=member&&member.state==='created';return '<div class="cx-proposal-role">'+row('<b>'+esc(s.label)+'</b>',{a:' data-cx-team-create="'+esc(q.proposalId)+'" data-cx-team-index="'+i+'"',r:esc(L.proposalStateText(member))})+'<small>Класс прав: '+esc(member?member.kind:s.kind)+' · '+esc(s.vendor)+' / '+esc(s.model)+' · '+esc(s.mode)+'</small><p>'+esc(s.intro.split('\n')[0])+'</p>'+row(created?'Открыть чат':'Создать эту роль',{a:' data-cx-team-create="'+esc(q.proposalId)+'" data-cx-team-index="'+i+'"'})+row('Класс и вводная…',{a:' data-cx-team-open="'+esc(q.proposalId)+'"'})+'</div>'}).join('');
    return html+row(q.confirmed?'Посмотреть подтверждённый состав':'Подтвердить состав…',{a:' data-cx-team-open="'+esc(q.proposalId)+'"',r:'версия '+q.version})+note('Класс прав: один из семи. Имя роли и вводная могут быть любыми.');
  }
  function proposalsChanged(){if(!pop||stack[stack.length-1]!=='role')return;if(!L.bindingCurrent(pop.__binding)){close();return}draw()}
  const VIEWS={
    folder(){ const c=cx(), prs=H.projects;
      if(!H.on) return hd('Проект')+note('Харнесс не подключён — проекты появятся, когда он запущен.');
      if(!prs) return hd('Проект')+note('читаю список проектов…');
      return hd('Проект','проект или без проекта')+prs.map(pr=>row(svg('folder')+'<b>'+esc(pr.name)+'</b>',{on:!c.noFolder&&pr.current,a:' data-cx-proj="'+esc(pr.path)+'"',q:pr.name+' '+pr.path,title:pr.path,r:(pr.seats==null?'? ролей':rolesN(pr.seats))+(pr.git?' · git':'')})).join('')+
        row(svg('src')+'<b>Без проекта</b>',{on:c.noFolder,a:' data-cx-nofolder',r:'только чат'})+hd('ещё')+row('＋ Создать проект (папка + git)…',{a:' data-cx-nav="mkdir"'})+row('Открыть существующий проект…',{a:' data-cx-nav="opendir"'})+
        note(c.noFolder?'Без проекта модель ничего не читает и не меняет — это разговор. Назначьте ему оркестратора (меню «Собеседник») — он создаст проект по разговору; или перенесите разговор в проект под ответом.':'Проект с ролями показывает роли и их последние настройки; без ролей — разговор без роли, модель выбирается отдельно.'); },
    mkdir(){ return hd('Создать проект')+(window.harnessy&&window.harnessy.pickFolder?row(svg('folder')+'<b>Выбрать в Finder…</b>',{a:' data-cx-finder="mkdir"',r:'новую папку — кнопкой диалога'}):'')+'<input class="cx-find cx-path" placeholder="/Users/…/имя-проекта" value="'+esc((H.projectsRoot?H.projectsRoot+'/':H.homeHint)||'')+'">'+row('Создать и открыть',{a:' data-cx-mkdir',on:false})+note('Проект — это папка: создаётся с git, памятью проекта (.harness/MEMORY.md) и разговором без роли; оркестратора назначают этому разговору после обсуждения задачи. Общая папка проектов не является проектом: выберите или создайте папку внутри.'); },
    opendir(){ return hd('Открыть проект')+(window.harnessy&&window.harnessy.pickFolder?row(svg('folder')+'<b>Выбрать в Finder…</b>',{a:' data-cx-finder="opendir"'}):'')+'<input class="cx-find cx-path" placeholder="/Users/…/проект" value="'+esc((H.projectsRoot?H.projectsRoot+'/':H.homeHint)||'')+'">'+row('Открыть',{a:' data-cx-opendir'})+note('Папка без команды откроется с пустой командой: первой назначается роль оркестратора, остальные вводит он. Общая папка проектов не является проектом: выберите папку внутри.'); },
    role(){ const c=cx(), nf=!!c.noFolder, ss=nf?[]:seats(), cur=seat(), rm=room(), ready=nf?!!(rm&&rm.model&&H.noProject):true;   // без проекта: роли открытого фоном проекта — не собеседники этого разговора (Kimi UX-2 №96 п.1–2)
      const pending=(H.chatList||[]).find(c=>c.id===(H.active||{})[cur&&cur.id]&&c.promotion&&c.promotion.pending);
      return (pending?row('Завершить назначение оркестратора',{a:' data-cx-newseat="orchestrator"',r:'Продолжить сохранённую операцию'}):'')+hd('Собеседник',nf?'без проекта':(H.on?base(H.project)+' · '+(ss.length?rolesN(ss.length):'ролей нет'):'харнесс не подключён'))+
        row(svg('src')+'<b>Без роли</b>',{on:!cur||isRoom(cur),a:' data-cx-seat="'+ROOM+'"',r:rm&&rm.model?esc(modelLabel(rm.model)):'модель выбрать'})+
        (nf?note('Разговор без проекта: роли открытого проекта «'+esc(base(H.project||''))+'» здесь не собеседники — вернуться в проект можно чипом папки.'):(ss.length?hd('роли в проекте','последние настройки')+ss.map(p=>row(svg('role')+'<b>'+esc(L.paneName(p))+'</b>'+(p.busy?' <em class="cx-busy">отвечает</em>':''),{on:!!cur&&p.id===cur.id,a:' data-cx-seat="'+p.id+'"',q:p.label+' '+p.model,r:esc(modelLabel(p.model))+' · '+esc(modeLabel(p.mode))})).join(''):note('В этом проекте ролей нет — назначьте роль ниже или поговорите без роли.')))+
        proposedRoles()+(H.on?hd('назначить роль','классы прав')+(H.roleCatalog||[]).map(r=>{ const n=ss.filter(p=>p.kind===(r.kind||(r.role==='executor'?'worker':r.role))).length; if(n&&!r.multi) return ''; const name=r.label.charAt(0).toUpperCase()+r.label.slice(1)+(n?' '+(n+1):''), off=nf&&!ready?true:r.role==='orchestrator'?false:r.available===false, why=nf&&!ready?(r.role==='orchestrator'?'сначала выберите модель разговора':'без проекта: оркестратор создаст проект по разговору'):(r.reason||'сначала оркестратор'); return row(svg('new')+'<b>'+esc(name)+'</b>',{a:off?'':' data-cx-newseat="'+r.role+'"',dis:off,q:r.label,r:off?esc(why):n?'ещё одно место':((nf||H.noProject)?'создаст проект по разговору':'свободна')}); }).join('')+note('Новая роль получит текущую модель (сменить — в чипе модели). Чат переключится на новую роль; место останется в команде.'):''); },
    chat(){ const p=seat(), list=H.chatList||[], act=p?(H.active||{})[p.id]:null; if(!p) return hd('Чаты')+note('Сначала выберите собеседника.');
      const when=t=>{ const d=new Date((t||0)*1000), today=new Date(); return d.toDateString()===today.toDateString()?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}); };
      const crow=c=>row('<i class="cx-dot'+(c.active?' on':'')+'"></i><b>'+esc(c.title||'без названия')+'</b>',{on:c.id===act,a:' data-cx-chat="'+c.id+'"',q:c.title+' '+c.label+' '+c.model,r:(c.active?'активный':'закрыт')+' · '+esc(modelLabel(c.model))+' · '+when(c.last)+' · '+c.messages,title:c.title});
      const mine=list.filter(c=>c.pane===p.id), others=list.filter(c=>c.pane!==p.id); const groups={}; others.forEach(c=>{ (groups[c.label]=groups[c.label]||[]).push(c); });
      return row(svg('new')+'<b>Новый чат</b>',{a:' data-cx-newchat',r:isRoom(p)?'параллельный':'прежний закроется'})+
        (mine.length?hd(isRoom(p)?'чаты без роли':'чаты роли «'+esc(L.paneName(p))+'»'):'')+mine.map(crow).join('')+
        (others.length?hd('чаты проекта','по ролям')+Object.keys(groups).map(g=>'<div class="cx-sub2">'+esc(g)+'</div>'+groups[g].map(crow).join('')).join(''):'')+
        note(isRoom(p)?'Чаты без роли параллельные и не закрываются.':'У роли один активный чат. Открыть другой — текущий закроется, его текст уйдёт в открытый как контекст.'); },
    newchat(){ const p=seat(), act=p?(H.chatList||[]).find(c=>c.id===(H.active||{})[p.id]):null; return hd('Новый чат',p?esc(isRoom(p)?'без роли':L.paneName(p)):'')+row('<b>Передать текст</b>',{a:' data-cx-carry="text"',r:'вся переписка · бесплатно'})+row('<b>Передать выжимку</b>',{a:' data-cx-carry="summary"',r:'один ход модели'})+row('<b>Без контекста</b>',{a:' data-cx-carry="none"',r:'чистый лист'})+note('Прежний чат «'+esc(act&&act.title||'без названия')+'» будет закрыт; контекст уйдёт в новый первой записью — для сведения.'); },
    switch(){ const p=pop.__target, cur=seat(); if(!p) return note('Собеседник не выбран'); return hd('Переключиться на',esc(isRoom(p)?'без роли':L.paneName(p)))+row(svg('role')+'<b>Без контекста</b>',{a:' data-cx-sw="plain"',r:'новый разговор'})+row(svg('src')+'<b>С контекстом — выбрать сообщения…</b>',{a:' data-cx-sw="ctx"',r:'чекбоксы у реплик'})+note('С контекстом: отмеченные реплики уйдут новой роли текстом с промптом «прочитай контекст и жди команду». Между моделями и вендорами переносится только текст — память прежней модели остаётся у '+esc(cur?(isRoom(cur)?'разговора без роли':L.paneName(cur)):'прежнего места')+'.'); },
    rights(){ const p=seat(), c=cx(), cur=p?p.mode:c.rights; return hd('Права',p?'применяются к месту «'+esc(L.paneName(p))+'»':'к первому сообщению')+(H.modes||[]).map(m=>row(svg('lock')+'<b>'+esc(m.label)+'</b>',{on:m.id===cur,a:' data-cx-mode="'+m.id+'"',r:m.id})).join('')+(H.on?'':note('Список прав появится, когда харнесс подключён.')); },
    model(){const p=seat(),c=cx(),cur=p?p.model:c.model,sv=p?p.vendor:c.vendor,state=pop.__models,rows=state&&state.rows;
      return hd('Модель',p?(isRoom(p)?'разговор без роли':'место «'+esc(L.paneName(p))+'»'):'разговор без роли')+'<input class="cx-find" aria-label="Найти модель" placeholder="Найти модель…">'+
        (!state||state.loading?note('Читаю каталог моделей…'):'')+(state&&state.error?'<div class="cx-note" role="status">Каталог моделей не прочитан · '+esc(state.error)+'. <button type="button" class="btn sm ghost" data-cx-model-retry>Повторить</button></div>':'')+
        (state&&state.failure?'<div class="cx-note" data-cx-model-error role="status">'+esc(state.failure)+'</div>':'')+
        (rows||[]).map((g,i)=>{const support=modelSupport(g.id),models=g.models.length?g.models:[{id:'default',label:'по умолчанию программы'}],disabled=!support.ok||state.loading||state.saving||!!state.error;
          return '<div class="cx-grp'+(g.id===sv||!sv&&i===0?' open':'')+'" data-cx-program="'+esc(g.id)+'"><div class="cx-row grp" data-cx-grp><span class="cv">›</span><b>'+esc(g.title)+'</b><small>'+connectionKind(g.kind)+' · '+modelsN(g.models.length)+'</small></div><div class="cx-sub">'+
            (g.modelsReason?note(esc(g.modelsReason)):'')+models.map(m=>'<button type="button" class="cx-row cx-model'+(m.id===cur&&g.id===sv?' on':'')+(disabled?' dis':'')+'" data-cx-model="'+esc(m.id)+'" data-cx-vendor="'+esc(g.id)+'" data-q="'+esc(g.title+' '+m.label+' '+m.id)+'"'+(disabled?' disabled':'')+'><span class="cx-model-text"><b>'+esc(m.label)+'</b>'+(!support.ok||support.note?'<small>'+esc(support.reason||support.note)+'</small>':'')+'</span>'+(m.id===cur&&g.id===sv?'<span class="ck">✓</span>':'')+'</button>').join('')+'</div></div>';
        }).join('')+(rows&&!rows.length?note('Программы не найдены в каталоге.'):'' )+
        note('Смена модели сохраняет разговор. Контекст можно перенести.')+hd('Размышления','для выбранной модели')+'<div class="cx-seg dis"><span>выкл</span><span class="on">адаптивно</span><span>вкл</span></div>'+note('Усилие и размышления пока недоступны: харнесс не передаёт их месту.');},
    effort(){ return hd('Усилие')+['низкое','среднее','высокое','очень высокое','максимум'].map(x=>row(x,{dis:true})).join('')+note('Пока недоступно: харнесс не передаёт усилие месту. Варианты — для выбранной модели.'); },
    plus(){ return '<input class="cx-find" placeholder="Найти действие или источник…">'+hd('добавить контекст')+['Файлы и папки…','Снимок экрана…','Другие источники…'].map(t=>row(svg('file')+t,{dis:true,r:'вложения пока не передаются модели',title:'вложения пока не передаются модели',q:t})).join('')+
        hd('настроить запрос')+row(svg('folder')+'Проект или без проекта…',{a:' data-cx-nav="folder"',q:'проект комната папка компьютер дерево без проекта'})+row(svg('model')+'Модель и мышление…',{a:' data-cx-nav="model"',q:'модель усилие размышления вендор'})+row(svg('tools')+'Инструменты и субагенты…',{a:' data-cx-nav="tools"',q:'инструменты субагенты поиск думать коннекторы плагины приложения'})+row(svg('role')+(cx().noFolder?'Назначить собеседника…':'Назначить в команде…'),{a:' data-cx-nav="role"',q:'роль команда собеседник оркестратор воркер ревьюер'})+
        hd('действия')+row(svg('cmd')+'Команды и навыки…',{a:' data-cx-nav="cmds"',q:'цель план слэш команды навык эскиз сайт'}); },
    files(){ return hd('Файлы и папки')+note('вложения пока не передаются модели'); },
    shot(){ return hd('Снимок экрана')+note('вложения пока не передаются модели'); },
    sources(){ if(H.on) return hd('Другие источники')+note('данных нет: движок отдаёт только историю ходов'); const F=['Чаты','Вкладки браузера','Страницы','Сайты','Приложения']; const R=[['Поиск оптимизации памяти','чат · ChatGPT'],['Давление в шинах ГЛС 2023','чат · ChatGPT'],['Jeanneau Sea Loft 480 — walkthrough','вкладка · youtube.com'],['sergekostenchuk/ai-connection-guard','вкладка · github.com'],['Руководство по работе со страницами','страница'],['Volnami — 6 концептов','сайт']];
      return '<input class="cx-find" placeholder="Найти источник…">'+'<div class="cx-filters">'+F.map((f,i)=>'<span class="'+(i===0?'on':'')+'">'+f+'</span>').join('')+'</div>'+R.map(r=>row(svg('src')+'<b>'+esc(r[0])+'</b>',{a:' data-cx-src="'+esc(r[0])+'"',q:r[0]+' '+r[1],r:r[1]})).join('')+note('макет'); },
    tools(){ if(H.on) return hd('Инструменты и субагенты')+note('данных нет: движок отдаёт только историю ходов'); const c=cx(); const CONN=['45telega','Claude in Chrome','context7','exa','filesystem','github','pencil','perplexity-pro','postgres','qdrant-memory','sequential-thinking','ssh-server','threads-mcp'], PLUG=['PDF Viewer','Miro','Design','Engineering','Product Management'], APPS=['Браузер','Компьютер','Code Review','Visualize'];
      return hd('Субагенты')+row(svg('sub')+'<b>По правилам проекта</b>'+tog('mode:sub',!!c.modes.sub),{r:'чтение — экономные модели'})+note('Правка на один запрос политику команды не меняет. Экономная модель — из настроенных, по типу задачи.')+
        hd('Режимы этого сообщения')+row(svg('search')+'Поиск в интернете'+tog('mode:search',!!c.modes.search))+row(svg('think')+'Думать дольше',{dis:true,r:'режим пока не передаётся модели',title:'режим пока не передаётся модели'})+
        hd('Коннекторы','для этого чата')+CONN.map(n=>row(esc(n)+tog('conn:'+n,c.conn[n]!==false),{q:n})).join('')+hd('Плагины')+PLUG.map(n=>row(esc(n)+tog('plug:'+n,!!c.conn['plug:'+n]),{q:n})).join('')+hd('Приложения')+APPS.map(n=>row(esc(n)+tog('app:'+n,!!c.conn['app:'+n]),{q:n})).join('')+row('Подключить агента…',{dis:true,r:'позже'})+note('макет'); },
    cmds(){ return '<input class="cx-find" placeholder="Найти команду…">'+[['Цель…','поставить цель, к которой двигаться'],['Режим планирования','сначала план, потом действия'],['Слэш-команды…','/ — список команд'],['Записать навык','сохранить ход как навык'],['Нарисовать эскиз','эскиз для обсуждения'],['Создать сайт','из материалов чата']].map(x=>row(svg('cmd')+'<b>'+x[0]+'</b>',{a:' data-cx-cmd="'+esc(x[0])+'"',q:x[0]+' '+x[1],r:x[1]})).join(''); },
    info(){ const p=seat(); return hd('Клавиши')+'<div class="cx-kv"><span>Enter</span><b>отправить</b><span>⇧ Enter</span><b>перенос строки</b><span>⌘K</span><b>команды и поиск</b><span>⌘N</span><b>новый чат</b><span>⌘\\</span><b>панель</b><span>Esc</span><b>закрыть</b></div>'+
        hd('Примеры запросов')+['Что сейчас делает команда?','Собери план из этого разговора','Проверь лимиты и даты оплат'].map(t=>row(esc(t),{a:' data-cx-fill="'+esc(t)+'"'})).join('')+
        hd('Как это устроено')+'<div class="cx-txt"><b>Проект или комната.</b> В проекте агент читает его файлы; без проекта — комната для быстрых дел, без памяти проекта.<br><b>Чат → План.</b> Когда разговор вырастет, агент предложит собрать план; переключить можно и сразу.<br><b>Всё видно.</b> Кто работает, над чем и чего ждёт — в «Сейчас»; расход хода — под ответом.</div>'+
        hd('Права')+'<div class="cx-txt">'+((H.modes||[]).map(m=>'<b>'+esc(m.label)+'</b> — '+esc(m.id)).join('<br>')||'появятся, когда харнесс подключён')+'</div>'+
        hd('Расход')+'<div class="cx-txt">Показывается после хода под ответом: токены и время по учёту харнесса. Доля недельной квоты появится, когда будет её учёт. Прогноза до отправки нет.</div>'+
        hd('Команда')+'<div class="cx-txt">Места и роли задаются файлом команды харнесса; создание места из чата пока недоступно.'+(p?' Сейчас собеседник — «'+esc(L.paneName(p))+'».':'')+'</div>'; }
  };

  // ── действия
  document.addEventListener('click',async e=>{ const c=cx();
    if(e.target.closest('.cx-row.dis')) return;
    const off=e.target.closest('[data-cx-off]'); if(off){ e.stopPropagation(); c.modes[off.dataset.cxOff]=false; L.save(); renderAll(); return; }
    const rm=e.target.closest('[data-cx-att]'); if(rm){ e.stopPropagation(); c.att.splice(+rm.dataset.cxAtt,1); L.save(); renderAll(); return; }
    const ch=e.target.closest('[data-cx]'); if(ch&&!e.target.closest('.cx-pop')){ const k=ch.dataset.cx; if(k==='go'){ if(L.busy&&L.busy()){ L.stop&&L.stop(); return; } if(ch.classList.contains('off')) return; const box=ch.closest('.box'); if(box&&box.__cx) box.__cx.send(); return; } if(ch.classList.contains('dim')){ open(ch,'effort'); return; }
      if(k==='folder'&&H.on){ const binding=L.sendBinding();H.projects=null; L.api('/api/projects').then(r=>{if(!L.bindingCurrent(binding))return; H.projects=(r.projects||[]).filter(p=>p.path!==H.defaultDir); H.homeHint=(r.current||'').replace(/\/[^/]*$/,'/'); if(pop&&stack[stack.length-1]==='folder') draw(); }).catch(()=>{if(!L.bindingCurrent(binding))return; H.projects=[]; if(pop) draw(); }); }
      open(ch,k); return; }
    if(!pop||!pop.contains(e.target)) return;
    if(e.target.closest('[data-cx-back]')){ back(); return; }
    const nv=e.target.closest('[data-cx-nav]'); if(nv){ nav(nv.dataset.cxNav); return; }
    const grp=e.target.closest('[data-cx-grp]'); if(grp){ grp.parentElement.classList.toggle('open'); place(); return; }
    const tg=e.target.closest('[data-cx-tog]'); if(tg){ if(H.on) return; const kv=tg.dataset.cxTog.split(':'), kind=kv[0], name=kv.slice(1).join(':');if(kind==='mode'&&name==='think'){L.toast('режим пока не передаётся модели');return} if(kind==='mode') c.modes[name]=!c.modes[name]; else if(kind==='conn') c.conn[name]=(c.conn[name]===false); else c.conn[kind+':'+name]=!c.conn[kind+':'+name]; L.save(); draw(); renderAll(); return; }
    const fd=e.target.closest('[data-cx-folder]'); if(fd){ c.folder=fd.dataset.cxFolder; L.save(); L.log('настройка','Проект: '+(c.folder==='room'?'комната без проекта':c.folder)); draw(); renderAll(); return; }
    const st=e.target.closest('[data-cx-seat]'); if(st){ const id=st.dataset.cxSeat, p=(H.panes||[]).find(x=>x.id===id), cur=seat();if(!cur||cur.id!==id)L.invalidateBinding();
      if(p&&cur&&p.id!==cur.id&&PAGE==='chat'&&(S().chat||[]).some(m=>m.src==='live')){ pop.__target=p; nav('switch'); return; }   // в чате есть живой разговор — спросить про контекст
      if(p){ if(!isRoom(p)){c.noFolder=false;delete c.noFolderPending;} S().ui.pane=p.id; S().ui.fresh=isRoom(p); S().ui.switched=true; L.save(); L.pickPane(); L.hStatus();
        if(PAGE==='new'&&!isRoom(p)){ keepDraft(); close(); location.href='01-chat.html'; return; }   // выбор роли на стартовом = переход в её чат
        if(PAGE==='chat'&&L.loadChat) L.loadChat();
        L.toast('Собеседник: '+esc(isRoom(p)?'без роли':L.paneName(p))+(p.model?' · '+esc(modelLabel(p.model)):'')); draw(); renderAll(); }
      else if(id===ROOM){ S().ui.pane=ROOM; S().ui.fresh=true; S().ui.switched=true; L.save(); H.pane=null; L.hStatus(); close(); renderAll(); L.toast('Без роли — выберите модель'); const b=document.querySelector('.frame.cur .cx-chip[data-cx="model"]')||document.querySelector('.cx-chip[data-cx="model"]'); if(b) open(b,'model'); }
      return; }
    if(e.target.closest('[data-cx-direct-off]')){ e.stopPropagation(); const p=seat(); if(p&&S().ui.direct){ delete S().ui.direct[p.id]; L.save(); L.log('чат','Обращение к «'+L.paneName(p)+'» снова через оркестратора'); renderAll(); } return; }
    if(e.target.closest('[data-cx-newchat]')){ const p=seat(); const act=p?(H.chatList||[]).find(c=>c.id===(H.active||{})[p.id]):null; if(p&&!isRoom(p)&&act&&act.messages){ nav('newchat'); return; } await newChat(p,'none'); return; }
    const cr=e.target.closest('[data-cx-carry]'); if(cr){ await newChat(seat(),cr.dataset.cxCarry); return; }
    const oc=e.target.closest('[data-cx-chat]'); if(oc){ L.invalidateBinding();let r=null; try{ r=await L.api('/api/chats/open',{chat:oc.dataset.cxChat,carry:'text'}); }catch(x){} if(!r||!r.ok){ L.toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
      S().ui.pane=r.pane.id; S().ui.fresh=false; S().ui.switched=true; L.save(); await L.refreshStatus(); if(PAGE==='new'){ keepDraft(); close(); location.href='01-chat.html'; return; } if(L.loadChat) await L.loadChat(); close(); renderAll(); L.toast('Открыт чат: '+esc(r.chat.title||'без названия')+(r.carried?' · прежний передан текстом':'')); return; }
    const sw=e.target.closest('[data-cx-sw]'); if(sw){ const p=pop.__target; if(!p) return; if(sw.dataset.cxSw==='ctx'){ close(); L.selStart(p.id); return; } L.invalidateBinding();S().ui.pane=p.id; S().ui.fresh=false; S().ui.switched=true; L.save(); if(PAGE==='new'&&H.on&&!isRoom(p)){ keepDraft(); close(); location.href='01-chat.html'; return; } L.pickPane(); L.hStatus(); close(); renderAll(); if(L.loadChat) await L.loadChat(); L.toast('Открыт чат: '+esc(isRoom(p)?'без роли':L.paneName(p))); return; }
    const createRole=e.target.closest('[data-cx-team-create]');if(createRole){const binding=pop.__binding,id=createRole.dataset.cxTeamCreate,index=Number(createRole.dataset.cxTeamIndex);if(!L.bindingCurrent(binding)){close();return}keepDraft();close();await L.createTeamRole(id,index,binding);return}
    const proposed=e.target.closest('[data-cx-team-open]');if(proposed){if(!L.bindingCurrent(pop.__binding)){close();return}const id=proposed.dataset.cxTeamOpen;close();L.showTeamProposal(id);return}
    if(e.target.closest('[data-cx-team-refresh]')){if(L.bindingCurrent(pop.__binding))await L.proposalsFetch();return}
    if(e.target.closest('[data-cx-team-request]')){const binding=pop.__binding;close();await L.requestTeamProposal(binding);return}
    const ns=e.target.closest('[data-cx-newseat]'); if(ns){if(ns.dataset.cxNewseat!=='orchestrator')return;const binding=pop.__binding,anchor=pop.__anchor;close();await L.promoteConversation(anchor,binding);renderAll();return}
    const fnd=e.target.closest('[data-cx-finder]'); if(fnd){ let p=null; try{ p=await window.harnessy.pickFolder({title:fnd.dataset.cxFinder==='mkdir'?'Папка нового проекта':'Папка проекта',message:fnd.dataset.cxFinder==='mkdir'?'Выберите папку или создайте новую кнопкой диалога':'',defaultPath:(fnd.dataset.cxFinder==='mkdir'&&H.projectsRoot)||H.homeHint||''}); }catch(x){} const inp=pop&&pop.querySelector('input.cx-path'); if(p&&inp){ inp.value=p; inp.focus(); } return; }
    const pj=e.target.closest('[data-cx-proj]'); if(pj){ await switchProject(pj.dataset.cxProj); return; }
    if(e.target.closest('[data-cx-nofolder]')){ L.invalidateBinding();const project=H.project;c.noFolder=true;c.noFolderPending=project;S().ui.pane=ROOM;L.save();L.pickPane();const rm=room();
      if(rm&&rm.model){let r=null;try{r=await L.api('/api/room',{model:rm.model,folder:false})}catch(x){}if(H.project!==project)return;if(!r||!r.ok){delete c.noFolderPending;c.noFolder=!!H.noProject;L.save();renderAll();L.toast('Харнесс не принял: '+esc(r&&r.error||'нет связи'));return}}
      await L.refreshStatus();if(H.project!==project)return;close();renderAll();L.toast('Без проекта: модель ничего не читает');return; }
    if(e.target.closest('[data-cx-mkdir]')||e.target.closest('[data-cx-opendir]')){ await submitProjectMenu(!!e.target.closest('[data-cx-mkdir]'));return; }
    const md=e.target.closest('[data-cx-mode]'); if(md){ await setSeat({mode:md.dataset.cxMode},'Права места'); return; }
    if(e.target.closest('[data-cx-model-retry]')){await loadModels(pop);return}
    const mo=e.target.closest('[data-cx-model]'); if(mo){ await chooseModel(mo); return; }
    const pk=e.target.closest('[data-cx-pick]'); if(pk){ pick(pk.dataset.cxPick); return; }
    const sh=e.target.closest('[data-cx-shot]'); if(sh){ L.toast('вложения пока не передаются модели');return; }
    const sr=e.target.closest('[data-cx-src]'); if(sr){ if(H.on) return; c.att.push({kind:'src',name:sr.dataset.cxSrc}); L.save(); renderAll(); close(); return; }
    const cm=e.target.closest('[data-cx-cmd]'); if(cm){ close(); if(/Слэш/.test(cm.dataset.cxCmd)) L.openPal(); else L.toast('«'+esc(cm.dataset.cxCmd)+'» — в прототипе пока отметка'); return; }
    const fl=e.target.closest('[data-cx-fill]'); if(fl){ const ta=document.querySelector('.frame.cur .live-in')||document.querySelector('.live-in'); if(ta){ ta.value=fl.dataset.cxFill; ta.dispatchEvent(new Event('input')); ta.focus(); } close(); return; }
    const flt=e.target.closest('.cx-filters span'); if(flt){ flt.parentElement.querySelectorAll('span').forEach(x=>x.classList.toggle('on',x===flt)); return; } });
  async function newChat(p,carry){ if(!p){ L.toast('Сначала выберите собеседника'); return; } L.invalidateBinding();if(carry==='summary') L.toast('Пишу выжимку прежнего чата…'); let r=null; try{ r=await L.api('/api/chats/new',{pane:p.id,carry}); }catch(x){} if(!r||!r.ok){ L.toast('Не вышло: '+esc((r&&r.error)||'нет связи')); return; }
    await L.refreshStatus(); if(L.loadChat) await L.loadChat(); close(); renderAll(); L.log('чат','Новый чат: '+(isRoom(p)?'без роли':L.paneName(p))+(r.carried?' · контекст передан':'')); L.toast('Новый чат · '+esc(isRoom(p)?'без роли':L.paneName(p))+(r.carried?' · прежний передан':'')); }
  function projectRoleCount(result,status){const panes=Array.isArray(result.panes)?result.panes:status&&status.project===result.project&&Array.isArray(status.panes)?status.panes:null;return panes?panes.filter(p=>p.id!==ROOM).length:Number.isSafeInteger(result.seats)&&result.seats>=0?result.seats:null}
  const rolesNotice=n=>n===null?' · число ролей недоступно':n?' · ролей '+n:' · ролей нет';
  async function submitProjectMenu(create){const panel=pop;if(!panel||panel.__submitting)return;const inp=panel.querySelector('input.cx-path'),path=(inp&&inp.value.trim())||'';
    if(!path){let reason=panel.querySelector('[data-cx-path-error]');if(!reason){reason=document.createElement('div');reason.className='cx-note';reason.setAttribute('data-cx-path-error','');panel.appendChild(reason)}reason.textContent='Введите имя или путь папки проекта';inp&&inp.focus();return}
    if(!L.bindingCurrent(panel.__binding)){L.toast('Проект или разговор изменились; путь остался в поле');return}panel.__submitting=true;L.invalidateBinding();const binding=L.sendBinding();let r=null;
    try{try{r=await L.api(create?'/api/project/create':'/api/project',{path,git:true})}catch(x){}
      if(panel!==pop||!L.bindingCurrent(binding)&&(!r||H.project!==r.project))return;
      if(!r||!r.ok){L.toast('Не вышло: '+esc((r&&r.error)||'нет связи'));panel.__binding=L.sendBinding();return}
      cx().noFolder=false;delete cx().noFolderPending;S().ui.pane=ROOM;H.projects=null;L.save();const status=await L.refreshStatus();if(panel!==pop||r.project&&H.project!==r.project)return;close();renderAll();L.log('настройка',(create?'Создан проект ':'Открыт проект ')+base(path));L.toast((create?'Проект создан'+(r.git?' с git':''):'Проект открыт')+': '+esc(base(r.project||path))+rolesNotice(projectRoleCount(r,status))+(create&&r.orchestrator?' · оркестратор в команде — выберите его собеседником':''));
    }finally{panel.__submitting=false}
  }
  async function switchProject(path){ const c=cx();L.invalidateBinding();let r=null; try{ r=await L.api('/api/project',{path}); }catch(x){} if(!r||!r.ok){ L.toast('Проект не открылся: '+esc((r&&r.error)||'нет связи')); return; }
    c.noFolder=false;delete c.noFolderPending; L.save(); S().ui.pane=ROOM; L.save(); H.projects=null; const status=await L.refreshStatus(); close(); renderAll(); L.log('настройка','Проект: '+base(path)); L.toast('Проект: '+esc(base(r.project||path))+rolesNotice(projectRoleCount(r,status))); }
  function setSeat(patch,what,choice){ return L.configureSetting(async binding=>{ if(choice&&!choice.valid())return false;const p=seat(),c=cx(),failed=r=>{if(choice)choice.failed(r);else L.toast('Харнесс не принял: '+esc((r&&r.error)||'нет связи'));return false};
    if((!p||isRoom(p))&&patch.model&&H.on&&!(p&&p.busy)){ let r=null; try{ r=await L.api('/api/room',{model:patch.model,...(patch.vendor?{vendor:patch.vendor}:{}),folder:!c.noFolder},{trace:binding.trace}); }catch(x){} if(!L.bindingCurrent(binding)) return false;if(!r||!r.ok)return failed(r);
      S().ui.pane=ROOM; L.save(); await L.refreshStatus();if(!L.bindingCurrent(binding)) return false;L.log('настройка','Разговор без роли: '+modelLabel(patch.model,patch.vendor)); L.toast('Без роли · '+esc(modelLabel(patch.model,patch.vendor))+(c.noFolder?' · без проекта':'')); close(); renderAll(); return true; }
    if(!p){ if(patch.mode) c.rights=patch.mode; if(patch.model) c.model=patch.model; L.save(); draw(); renderAll(); return true; }
    let r=null; try{ r=await L.api('/api/panes/'+encodeURIComponent(p.id),patch,{trace:binding.trace}); }catch(e){} if(!L.bindingCurrent(binding)) return false;if(!r||!r.ok)return failed(r);
    Object.assign(p,r.pane); const i=(H.panes||[]).findIndex(x=>x.id===p.id); if(i>=0) H.panes[i]=p;
    const val=patch.mode?modeLabel(patch.mode):modelLabel(patch.model,patch.vendor),next=r.appliesFrom==='next'?' · применится со следующего хода':''; L.log('настройка',what+' «'+L.paneName(p)+'»: '+val+next); L.toast(what+' «'+esc(L.paneName(p))+'»: '+esc(val)+next); L.hStatus(); draw(); renderAll(); return true; }); }
  function pick(kind){ L.toast('вложения пока не передаются модели'); }
  window.CX={setBusy,render:renderAll,close,proposalsChanged}; renderAll();
})();
