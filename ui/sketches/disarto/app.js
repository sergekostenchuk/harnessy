/* Общий механизм живых скетчей: раскрытая карточка из кликнутого объекта, вкладки и шаги внутри карточки, виды раздела, чип «ⓘ Паспорт». */
window.HX=(function(){
  let ovl,panel,inner,mainEl,fromEl=null,fromRect=null,keys=false;
  const main=()=>mainEl||document.querySelector('.main');
  /* оверлей создаётся в том .main, внутри которого кликнули — на странице может быть несколько кадров */
  function ensure(el){ const m=(el&&el.closest&&el.closest('.main'))||document.querySelector('.main');
    if(m.__hx){ ({ovl,panel,inner}=m.__hx); mainEl=m; return; }
    mainEl=m; ovl=document.createElement('div'); ovl.className='ovl';
    ovl.innerHTML='<div class="panel"><span class="x" title="Закрыть">×</span><div class="inner"></div></div>';
    m.appendChild(ovl); panel=ovl.firstElementChild; inner=panel.querySelector('.inner'); m.__hx={ovl,panel,inner}; const I=inner;
    panel.querySelector('.x').addEventListener('click',close);
    ovl.addEventListener('click',e=>{ if(e.target===ovl) close(); });
    if(!keys){ keys=true; addEventListener('keydown',e=>{ if(e.key==='Escape') close(); }); }
    I.addEventListener('click',e=>{
      const ct=e.target.closest('[data-ct]'); if(ct){ I.querySelectorAll('[data-ct]').forEach(x=>x.classList.toggle('on',x===ct)); I.querySelectorAll('[data-cp]').forEach(x=>x.style.display=x.dataset.cp===ct.dataset.ct?'':'none'); return; }
      const go=e.target.closest('[data-go]'); if(go){ step(go.dataset.go); return; }
      const pk=e.target.closest('[data-pick]'); if(pk){ pk.parentElement.querySelectorAll('[data-pick]').forEach(x=>x.classList.toggle('on',x===pk)); return; }
      const tg=e.target.closest('.tog'); if(tg){ tg.classList.toggle('on'); return; }
      if(e.target.closest('[data-close]')) close();
    });
  }
  function step(n){ inner.querySelectorAll('[data-step]').forEach(s=>s.style.display=s.dataset.step===String(n)?'':'none'); inner.querySelectorAll('.steps i').forEach((s,i)=>s.classList.toggle('on',i<n)); const c=inner.querySelector('[data-stepn]'); if(c) c.textContent=n; }
  function rectIn(el){ const r=el.getBoundingClientRect(), m=main().getBoundingClientRect(), s=(m.width/main().offsetWidth)||1; return {l:(r.left-m.left)/s,t:(r.top-m.top)/s,w:r.width/s,h:r.height/s}; }   // s — масштаб кадра (в прототипе окно меньше кадра)
  function setRect(r){ panel.style.left=r.l+'px'; panel.style.top=r.t+'px'; panel.style.width=r.w+'px'; panel.style.height=r.h+'px'; }
  function open(el,html,o){ if(fromEl){ fromEl.style.visibility=''; ovl.classList.remove('on'); } ensure(el); o=o||{};
    inner.innerHTML=html; fromEl=el; fromRect=rectIn(el); const m={width:main().offsetWidth,height:main().offsetHeight}, W=Math.min(o.w||904,m.width-40), H=Math.min(m.height-50,o.h||600);
    inner.style.width=(W-2)+'px'; panel.style.transition='none'; setRect(fromRect); panel.classList.remove('open'); ovl.classList.add('on'); if(o.hide!==false) el.style.visibility='hidden';
    if(inner.querySelector('[data-step]')) step(1);
    const firstTab=inner.querySelector('[data-ct].on'); if(firstTab) inner.querySelectorAll('[data-cp]').forEach(x=>x.style.display=x.dataset.cp===firstTab.dataset.ct?'':'none');
    requestAnimationFrame(()=>{ panel.style.transition=''; setRect({l:(m.width-W)/2,t:Math.max(25,(m.height-H)/2),w:W,h:H}); panel.classList.add('open'); });
  }
  function close(){ if(!fromEl) return; panel.classList.remove('open'); setRect(fromRect); ovl.classList.remove('on'); const el=fromEl; setTimeout(()=>el.style.visibility='',340); fromEl=null; }
  function views(segSel){ const seg=document.querySelector(segSel||'#seg'); if(!seg) return ()=>{}; let cur=seg.querySelector('.on').dataset.v;
    function show(v){ if(!document.getElementById('v-'+v)) return; close(); document.getElementById('v-'+cur).classList.remove('on'); document.getElementById('v-'+v).classList.add('on'); cur=v; seg.querySelectorAll('[data-v]').forEach(s=>s.classList.toggle('on',s.dataset.v===v)); }
    seg.addEventListener('click',e=>{ const s=e.target.closest('[data-v]'); if(s) show(s.dataset.v); });
    addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT') return; const all=[...seg.querySelectorAll('[data-v]')]; const n=+e.key; if(n>=1&&n<=all.length) show(all[n-1].dataset.v); });
    return show; }
  function bind(sel,fn,o){ document.querySelectorAll(sel).forEach(el=>el.addEventListener('click',()=>{ const h=fn(el); if(h) open(el,h,typeof o==='function'?o(el):o); })); }
  /* сборщики типовых частей карточки */
  const tl=steps=>'<div class="tl">'+steps.map(([c,t,b,s])=>'<div class="'+c+'"><i>'+(c==='d'?'✓':c==='x'?'!':'')+'</i><span>'+t+'</span><div><b>'+b+'</b>'+(s?'<small>'+s+'</small>':'')+'</div></div>').join('')+'</div>';
  const kv=pairs=>'<div class="kv">'+pairs.map(([a,b])=>'<span>'+a+'</span><b>'+b+'</b>').join('')+'</div>';
  const acts=list=>'<div class="acts">'+list.map(a=>Array.isArray(a)?'<span class="btn sm '+(a[1]||'')+'"'+(a[2]?' '+a[2]:'')+'>'+a[0]+'</span>':'<span class="btn sm">'+a+'</span>').join('')+'</div>';
  const blk=(t,body,r)=>'<div class="blk"><div class="t"><span>'+t+'</span>'+(r?'<span>'+r+'</span>':'')+'</div>'+body+'</div>';
  function passport(p){ const h='<div class="from">паспорт экрана</div><div class="ch"><h3>'+p.title+'</h3></div><div class="pp" style="margin-top:12px">'+[['где',p.where],['что',p.what],['зачем',p.why],['когда',p.when],['что ожидаем',p.expect],['риски',p.risk],['успех',p.ok],['провал',p.fail]].filter(x=>x[1]).map(([a,b])=>'<span>'+a+'</span><b>'+b+'</b>').join('')+'</div>';
    document.querySelectorAll('[data-passport]').forEach(el=>el.addEventListener('click',()=>open(el,h,{w:600,h:480,hide:false}))); }
  /* боковая рейка: <aside class="side" data-rail="plan"></aside> — активный пункт по ключу */
  const IC={now:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6L3.400 9.300l6-.7z"/>',chat:'<path d="M4 6h16v10H9l-5 4z"/>',plan:'<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>',swarm:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 18c0-2 2-3.5 4-3.5s3 1 3 3"/>',
    res:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/>',art:'<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',mem:'<path d="M5 6c0-1.700 3-3 7-3s7 1.300 7 3v12c0 1.700-3 3-7 3s-7-1.300-7-3z"/><path d="M5 6c0 1.700 3 3 7 3s7-1.300 7-3M5 12c0 1.700 3 3 7 3s7-1.300 7-3"/>',
    sens:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',spend:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',log:'<path d="M5 6h14M5 12h14M5 18h9"/>',set:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'};
  const TOP=['now','chat','plan','res','doc','art','mem','swarm','sens','spend','log'], BADGE={now:'2',spend:'!'};
  function rail(){ document.querySelectorAll('aside.side[data-rail]').forEach(a=>{ const on=a.dataset.rail;
    a.innerHTML='<div class="logo"><svg viewBox="0 0 24 24"><path d="M5 15c2-9 7 2 9-7M14 8l5 5"/></svg></div>'+TOP.map(k=>'<div class="nav'+(k===on?' on':'')+'" title="'+k+'"><svg viewBox="0 0 24 24">'+IC[k]+'</svg>'+(BADGE[k]?'<span class="b">'+BADGE[k]+'</span>':'')+'</div>').join('')+
      '<div class="foot"><div class="nav'+(on==='set'?' on':'')+'"><svg viewBox="0 0 24 24">'+IC.set+'</svg></div><div class="nav"><span class="ring"><i></i></span></div><div class="nav"><span class="av">S<i></i></span></div></div>'; }); }
  rail();
  return {open,close,views,bind,step,tl,kv,acts,blk,passport,rail};
})();
