/* ctx.js — карточка «Контекст» по чату/модели (образец владельца: disarto «Context window»; решение с ревьюером №3517 08.10.2026).
   Что: настоящая цифра «контекст NN %» в строке состояния под полем ввода и раскрытая карточка поверх чата: использовано / окно модели,
   кэш подсказки, матрица тиками по категориям (подсказка по наведению — состав категории), вкладки «история · переданное»,
   «Сжать историю» и «Новый чат без контекста» — через движок. Где: только экран чата (01-chat). Честно: нет хода — нет измерения;
   неизвестная модель — окно «нет данных»; деньги и «закрепить/выбросить» не показываем — движок этого не умеет. */
(function(){
  if(!window.LIVE) return; const L=window.LIVE; const PAGE=location.pathname.split('/').pop().replace(/\.html$/,'');
  if(!/^01-chat/.test(PAGE)) return;
  let CTX=null, timer=null;
  const fmt=n=>n==null?'—':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'K':String(n);
  const pct=(a,b)=>b?Math.round(a*100/b):null;
  const windowKnown=c=>Number.isFinite(c.window)&&c.window>0;
  // A part estimate and a measured total are not one proportional distribution.
  function distributionKnown(c){if(!windowKnown(c)||!Number.isFinite(c.used)||c.used<0||c.used>c.window||!Array.isArray(c.parts))return false;
    const parts=c.parts.filter(p=>p.key!=='free');return parts.length>0&&parts.every(p=>Number.isFinite(p.tokens)&&p.tokens>=0&&(!c.measured||!p.est))&&Math.abs(parts.reduce((sum,p)=>sum+p.tokens,0)-c.used)<=1;}
  const ago=ts=>{ if(!ts) return ''; const s=Math.max(0,Math.round(Date.now()/1000-ts)); return s<60?'только что':s<3600?Math.round(s/60)+' мин назад':s<86400?Math.round(s/3600)+' ч назад':Math.round(s/86400)+' д назад'; };
  const SH={instructions:'i',system:'s',history:'h',handoff:'d',free:'f'};   // ступени графита; коньяк — только подсветка
  async function refresh(){ const p=L.H.pane; if(!L.H.on||!p){ paint(null); return; } let r=null; try{ r=await L.api('/api/context/'+encodeURIComponent(p.id)); }catch(e){} CTX=(r&&r.ok)?r:null; paint(CTX); }
  function paint(c){ if(!L.H.on) return;   // без движка строка состояния остаётся нарисованной (демонстрация на сайте)
    document.querySelectorAll('.frame .status').forEach(st=>{ const sp=st.querySelectorAll(':scope > span'); if(sp.length<2) return;
      const p=L.H.pane; sp[0].innerHTML='<i></i>'+(L.H.halted?'остановлено владельцем':p&&p.busy?'отвечает…':L.H.on?'готов':'движок не подключён');
      sp[1].classList.add('live-ctx'); sp[1].setAttribute('data-ctx','1'); sp[1].title='Контекст этого чата — открыть карточку';
      sp[1].textContent=!c?'контекст · нет данных':(windowKnown(c)&&c.pct!=null?'контекст '+c.pct+' %'+(c.measured?'':' · оценка'):'контекст '+fmt(c.used)+' · окно модели неизвестно'); }); }
  // ── карточка
  function matrix(c){ if(!distributionKnown(c))return '<p class="ctx-distribution-note">'+(!windowKnown(c)?'Окно модели неизвестно. ':'')+'Оценки частей показаны отдельно; распределение не определено.</p>'; const cols=40, rows=6, N=cols*rows, parts=c.parts.filter(x=>x.key!=='free'), total=c.window;
    const cells=[]; parts.forEach(pt=>{ const n=Math.round(pt.tokens/total*N); for(let i=0;i<n&&cells.length<N;i++) cells.push(pt.key); }); while(cells.length<N) cells.push('free');
    return '<div class="ctx-mx">'+cells.map(k=>'<i class="'+SH[k]+'" data-k="'+k+'"></i>').join('')+'</div>'; }
  function tip(c,key){ const pt=c.parts.find(x=>x.key===key); if(!pt) return ''; const total=distributionKnown(c)?c.window:null; let rows=[];
    if(key==='history') rows=[...c.history].sort((a,b)=>b.tokens-a.tokens).slice(0,3).map(h=>[(h.role==='me'?'владелец: ':'ответ: ')+h.title,h.tokens]);
    else if(key==='handoff') rows=[...c.handoff].sort((a,b)=>b.tokens-a.tokens).slice(0,3).map(h=>[h.title,h.tokens]);
    else if(key==='instructions') rows=[['вводная роли, инструкции харнесса и файл роли',pt.tokens]];
    else if(key==='system') rows=[['остаток измерения: системная подсказка и описания инструментов модели',pt.tokens]];
    else if(key==='free') rows=[['окно модели минус занятое',pt.tokens]];
    const meta=(pt.count!=null?pt.count+' '+(key==='history'?'реплик':'передач')+' · ':'')+(pct(pt.tokens,total)!=null?pct(pt.tokens,total)+' %':'')+(pt.est?' · оценка':'');
    return '<div class="ctx-tip"><div class="h"><b>'+L.esc(pt.label)+' · '+fmt(pt.tokens)+'</b><span>'+meta+'</span></div>'+rows.map(([t,n])=>'<div class="r"><span>'+L.esc(t)+'</span><b>'+fmt(n)+'</b></div>').join('')+'</div>'; }
  function list(c,tab){ const items=tab==='handoff'?c.handoff:c.history; if(!items.length) return '<div class="ctx-empty">'+(tab==='handoff'?'переданных контекстов в этом чате нет':'реплик ещё нет')+'</div>';
    const max=Math.max(...items.map(x=>x.tokens),1);
    return items.slice().reverse().slice(0,12).map(h=>'<div class="ctx-row"><i class="'+(tab==='handoff'?'d':(h.role==='me'?'m':'h'))+'"></i><span class="t">'+L.esc(h.title||'—')+'</span><small>'+(tab==='handoff'?'передача':(h.role==='me'?'владелец':'ответ'))+(h.ts?' · '+ago(h.ts):'')+'</small><span class="bar"><b style="width:'+Math.round(h.tokens/max*100)+'%"></b></span><b class="n">'+fmt(h.tokens)+'</b></div>').join(''); }
  function html(c){ const p=L.H.pane, total=distributionKnown(c)?c.window:null, over=windowKnown(c)&&c.pct!=null&&c.pct>=90; let tab='history';
    const parts=c.parts.map(pt=>'<div class="ctx-lg" data-lk="'+pt.key+'"><i class="'+SH[pt.key]+'"></i><span>'+L.esc(pt.label)+'</span><b>'+fmt(pt.tokens)+'</b><small>'+(pct(pt.tokens,total)!=null?pct(pt.tokens,total)+' %':'')+(pt.est?' · оценка':'')+'</small></div>').join('');
    return '<div class="from">контекст · '+L.esc(p.id==='room'?'без роли':L.paneName(p))+' · '+L.esc(c.model||'')+'</div>'+
      '<div class="ch"><h3>Контекст чата</h3><span class="pill '+(c.busy?'acc':c.measured?'ok':'')+'">'+(c.busy?'идёт ход':c.measured?'измерено после хода':'оценка · хода не было')+'</span></div>'+
      '<div class="ctx-top"><div class="ctx-big"><div class="cap">занято'+(over?' · <em>близко к пределу</em>':'')+'</div><div class="num">'+fmt(c.used)+'<small>'+(windowKnown(c)?' / '+fmt(c.window)+' токенов':' · окно модели: нет данных')+'</small></div><div class="sub">'+(windowKnown(c)&&c.pct!=null?c.pct+' % окна':'доля неизвестна')+' · ход '+c.turns+'</div></div>'+
      '<div class="ctx-cache"><div class="cap">кэш подсказки</div>'+(c.cache&&c.cache.hitPct!=null?'<div class="num">'+c.cache.hitPct+' %<small> из кэша</small></div><div class="sub">'+fmt(c.cache.cached)+' из кэша · '+fmt(c.cache.new)+' новых</div>':'<div class="num muted">нет данных</div><div class="sub">появится после хода</div>')+'</div></div>'+
      matrix(c)+'<div class="ctx-legend">'+parts+'</div><div class="ctx-tipbox"></div>'+
      '<div class="blk ctx-cont"><div class="t"><span>содержимое</span><span class="ctabs ctx-tabs"><span class="on" data-ctab="history">история · '+c.history.length+'</span><span data-ctab="handoff">переданное · '+c.handoff.length+'</span></span></div><div class="ctx-list">'+list(c,tab)+'</div></div>'+
      '<div class="ctx-foot"><span class="meta">'+L.esc((L.H.project||'').split('/').pop()||'без проекта')+(c.chat&&c.chat.title?' · '+L.esc(c.chat.title.slice(0,40)):'')+' · ход '+c.turns+'</span><span class="btn sm ghost" data-ctx-new>Новый чат без контекста</span><span class="btn sm '+(((c.history||[]).length<6&&(c.pct==null||c.pct<30))?'ghost':'p')+'" data-ctx-compact title="'+(((c.history||[]).length<6&&(c.pct==null||c.pct<30))?'истории мало — сжимать есть смысл ближе к пределу окна':'выжимка одним ходом модели, новый чат')+'">Сжать историю</span></div>'; }
  function openCard(anchor){ if(!CTX){ L.toast('Контекст: нет данных — движок не подключён или нет места'); return; } if(!window.HX){ L.toast('Карточки недоступны'); return; }
    HX.open(anchor,html(CTX),{w:600,h:640,hide:false}); const inner=anchor.closest('.main').querySelector('.panel .inner'); if(!inner) return;
    inner.addEventListener('mouseover',e=>{ const lg=e.target.closest('[data-lk]'), cell=e.target.closest('.ctx-mx i'); const key=lg?lg.dataset.lk:cell?cell.dataset.k:null; const box=inner.querySelector('.ctx-tipbox'); if(!key){ return; }
      inner.querySelectorAll('.ctx-mx i').forEach(i=>i.classList.toggle('dim',i.dataset.k!==key)); inner.querySelectorAll('[data-lk]').forEach(x=>x.classList.toggle('on',x.dataset.lk===key)); if(box) box.innerHTML=tip(CTX,key); });
    inner.addEventListener('mouseleave',()=>{ inner.querySelectorAll('.ctx-mx i').forEach(i=>i.classList.remove('dim')); inner.querySelectorAll('[data-lk]').forEach(x=>x.classList.remove('on')); const box=inner.querySelector('.ctx-tipbox'); if(box) box.innerHTML=''; });
    inner.addEventListener('click',async e=>{ const tb=e.target.closest('[data-ctab]'); if(tb){ inner.querySelectorAll('[data-ctab]').forEach(x=>x.classList.toggle('on',x===tb)); inner.querySelector('.ctx-list').innerHTML=list(CTX,tb.dataset.ctab); return; }
      if(e.target.closest('[data-ctx-compact]')||e.target.closest('[data-ctx-new]')){ const carry=e.target.closest('[data-ctx-compact]')?'summary':'none'; const p=L.H.pane; if(!p) return;
        if(carry==='summary'&&!confirm('Сжать историю: движок попросит модель написать выжимку, откроет новый чат с ней и закроет этот. Один ход модели. Продолжить?')) return;
        if(carry==='none'&&!confirm('Новый чат без контекста: этот чат закроется, новый начнётся с чистого окна. Продолжить?')) return;
        let r=null; try{ r=await L.api('/api/chats/new',{pane:p.id,carry}); }catch(x){} if(!r||!r.ok){ L.toast('Не вышло: '+L.esc((r&&r.error)||'нет связи')); return; }
        HX.close(); L.log('чат',carry==='summary'?'История сжата: новый чат с выжимкой':'Новый чат без контекста'); L.toast(carry==='summary'?'Новый чат с выжимкой открыт, прежний закрыт':'Новый чат без контекста'); await L.refreshStatus(); await L.loadChat(); refresh(); } }); }
  document.addEventListener('click',e=>{ const s=e.target.closest('[data-ctx]'); if(!s) return; e.preventDefault(); e.stopPropagation(); openCard(s.closest('.status')||s); });
  addEventListener('live:status',()=>refresh()); addEventListener('live:done',()=>setTimeout(refresh,300));
  setTimeout(refresh,1200); timer=setInterval(()=>{ if(document.visibilityState==='visible') refresh(); },60000);   // после ходов обновляется по live:done; фоновый опрос — раз в минуту (Kimi UX-6 №131 п.8)
})();
