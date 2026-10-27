/* ctx.js — карточка «Контекст» по чату/модели (образец владельца: disarto «Context window»; решение с ревьюером №3517 08.10.2026).
   Что: настоящая цифра «контекст NN %» в строке состояния под полем ввода и раскрытая карточка поверх чата: использовано / окно модели,
   кэш подсказки, матрица тиками по категориям (подсказка по наведению — состав категории), вкладки «история · переданное»,
   «Сжать историю» и «Новый чат без контекста» — через движок. Где: только экран чата (01-chat). Честно: нет хода — нет измерения;
   неизвестная модель — окно «нет данных»; деньги и «закрепить/выбросить» не показываем — движок этого не умеет. */
(function(){
  if(!window.LIVE) return; const L=window.LIVE; const PAGE=location.pathname.split('/').pop().replace(/\.html$/,'');
  if(!/^01-chat/.test(PAGE)) return;
  let CTX=null, CTX_BINDING=null, timer=null, refreshRequest=0, cardRequest=0, cardBinding=null, cardNode=null;
  const fmt=n=>n==null?'нет данных':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'K':String(n);
  const pct=(a,b)=>b?Math.round(a*100/b):null;
  const windowKnown=c=>Number.isFinite(c.window)&&c.window>0;
  // A part estimate and a measured total are not one proportional distribution.
  function distributionKnown(c){if(!windowKnown(c)||!Number.isFinite(c.used)||c.used<0||c.used>c.window||!Array.isArray(c.parts))return false;
    const parts=c.parts.filter(p=>p.key!=='free');return parts.length>0&&parts.every(p=>Number.isFinite(p.tokens)&&p.tokens>=0&&(!c.measured||!p.est))&&Math.abs(parts.reduce((sum,p)=>sum+p.tokens,0)-c.used)<=1;}
  const ago=ts=>{ if(!ts) return ''; const s=Math.max(0,Math.round(Date.now()/1000-ts)); return s<60?'только что':s<3600?Math.round(s/60)+' мин назад':s<86400?Math.round(s/3600)+' ч назад':Math.round(s/86400)+' д назад'; };
  const SH={instructions:'i',system:'s',history:'h',handoff:'d',free:'f'};   // ступени графита; коньяк — только подсветка
  const instance=()=>L.H.liveStatus?.trace?.instanceId||null;
  const current=b=>!!b&&L.H.on&&!L.H.snapshotOnly&&L.bindingCurrent(b)&&instance()===b.instance;
  const capture=()=>({...L.sendBinding(),instance:instance()});
  async function refresh(){ const p=L.H.pane,request=++refreshRequest; if(!L.H.on||!p){ CTX=null;CTX_BINDING=null;paint(null); return; }
    const binding=capture();if(!current(CTX_BINDING)){CTX=null;CTX_BINDING=null;paint(null)}
    if(cardBinding&&!current(cardBinding)){cardBinding=null;cardRequest++;if(cardNode?.closest('.ovl.on')&&window.HX)HX.close();cardNode=null}
    let r=null; try{ r=await L.api('/api/context/'+encodeURIComponent(p.id)); }catch(e){}
    if(request!==refreshRequest||!current(binding))return;
    CTX=(r&&r.ok&&r.pane===binding.pane&&(r.chat?.id||null)===binding.chat)?r:null;CTX_BINDING=CTX?binding:null;paint(CTX); }
  function paint(c){ if(!L.H.on) return;   // без движка строка состояния остаётся нарисованной (демонстрация на сайте)
    document.querySelectorAll('.frame .status').forEach(st=>{ const sp=st.querySelectorAll(':scope > span'); if(sp.length<2) return;
      const p=L.H.pane; sp[0].innerHTML='<i></i>'+(L.H.halted?'остановлено владельцем':p&&p.busy?'отвечает…':L.H.on?'готов':'движок не подключён');
      sp[1].classList.add('live-ctx'); sp[1].setAttribute('data-ctx','1'); sp[1].setAttribute('role','button'); sp[1].setAttribute('tabindex','0'); sp[1].setAttribute('aria-haspopup','dialog'); if(!sp[1].hasAttribute('aria-expanded'))sp[1].setAttribute('aria-expanded','false'); sp[1].title='Контекст этого чата — открыть карточку';
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
    const known=n=>Number.isFinite(n)&&n>=0,max=Math.max(...items.filter(x=>known(x.tokens)).map(x=>x.tokens),1);
    return items.slice().reverse().slice(0,12).map(h=>'<div class="ctx-row"><i class="'+(tab==='handoff'?'d':(h.role==='me'?'m':'h'))+'"></i><span class="t">'+L.esc(h.title||'—')+'</span><small>'+(tab==='handoff'?'передача':(h.role==='me'?'владелец':'ответ'))+(h.ts?' · '+ago(h.ts):'')+'</small><span class="bar">'+(known(h.tokens)?'<b style="width:'+Math.round(h.tokens/max*100)+'%"></b>':'')+'</span><b class="n" title="Оценка, не токенизатор модели">'+(known(h.tokens)?'≈ '+fmt(h.tokens):'нет данных')+'</b></div>').join(''); }
  function contextParts(facts,c){
    const f=facts||{},unknown='нет данных',number=n=>Number.isSafeInteger(n)&&n>=0?String(n):unknown;
    const part=(key,title,value,body)=>'<details class="ctx51-part" data-context-part="'+key+'"><summary>'+title+' <span>'+L.esc(value)+'</span></summary><div>'+body+'</div></details>';
    const instruction=f.instruction||{},path=typeof instruction.path==='string'?instruction.path:null;
    const instructionBody=path?'<p>Файл: <code>'+L.esc(path)+'</code></p>':'<p>Файл инструкции · нет данных.</p>';
    const docs=Array.isArray(f.documents)?f.documents:null;
    const docsBody=docs?docs.length?'<ul>'+docs.map(d=>'<li>'+(d.project===f.project?'<a href="/api/project/file?project='+encodeURIComponent(d.project)+'&amp;path='+encodeURIComponent(d.path)+'" target="_blank" rel="noopener noreferrer">'+L.esc(d.path)+'</a>':L.esc(d.path)+' · другой проект, ссылка недоступна')+'</li>').join('')+'</ul><p>Ссылки не подтверждают, что модель прочитала файлы.</p>':'<p>Выбранных ссылок нет.</p>':'<p>Список ссылок · нет данных.</p>';
    const attachments=f.attachments,types=attachments&&Array.isArray(attachments.types)?attachments.types:null;
    const digest=typeof f.digest==='boolean'?(f.digest?'включена':'выключена'):unknown;
    const estimate=Array.isArray(c.parts)?c.parts.find(p=>p.key==='instructions'&&p.est&&Number.isFinite(p.tokens)&&p.tokens>=0):null;
    const links=docs?(docs.length+' '+(docs.length%100>=11&&docs.length%100<=14?'ссылок':docs.length%10===1?'ссылка':docs.length%10>=2&&docs.length%10<=4?'ссылки':'ссылок')):unknown;
    return '<section class="ctx51-card" role="region" aria-label="Состав контекста разговора"><div class="ctx51-head"><b>Состав контекста</b><p>Сведения Harnessy, не полный снимок окна модели.</p></div>'+
      part('instructions','Инструкция роли',instruction.state||unknown,instructionBody)+
      part('documents','Выбранные документы',links,docsBody)+
      part('messages','Сохранённые сообщения',number(f.messages),'<p>В стенограмме разговора; состав окна модели не известен.</p>')+
      part('attachments','Вложения в сообщениях',attachments?number(attachments.count):unknown,'<p>'+L.esc(types?(types.length?types.join(' · '):'Вложений нет'):unknown)+'</p>')+
      part('digest','Сводка соседей',digest,'<p>'+(f.digest===true?'До 700 символов на реплику и 6 000 на сводку; учитываются доступные для наблюдения места.':f.digest===false?'Сводка выключена.':'Состояние и предел · нет данных.')+'</p>')+
      '<div class="ctx51-estimate"><b>Инструкции · '+(estimate?'≈ '+fmt(estimate.tokens)+' токенов':unknown)+'</b><small>Оценка текста, не токенизатор модели. Доля окна · нет данных.</small></div></section>';
  }
  async function readFacts(binding){
    if(!binding.project||!binding.chat||!binding.instance)return {};
    const get=async url=>{try{return await L.api(url)}catch{return null}};
    const [chat,swarm]=await Promise.all([get('/api/chats/'+encodeURIComponent(binding.chat)),get('/api/swarm')]);
    if(!current(binding)||!swarm?.ok||swarm.project!==binding.project||swarm.instance!==binding.instance||!Array.isArray(swarm.panes))return {};
    const pane=swarm.panes.find(p=>p.id===binding.pane),f={project:binding.project};
    if(binding.pane!=='room'&&(!pane||pane.chat!==binding.chat))return {};
    if(chat?.project===binding.project&&chat.chat?.id===binding.chat&&chat.chat?.pane===binding.pane&&chat.chat.active===true){
      if(Array.isArray(chat.chat.documents)&&chat.chat.documents.every(d=>d&&typeof d.project==='string'&&typeof d.path==='string'))f.documents=chat.chat.documents;
      if(Array.isArray(chat.messages)){f.messages=chat.messages.length;
        if(chat.messages.every(m=>m&&(!Object.hasOwn(m,'attachments')||Array.isArray(m.attachments)&&m.attachments.every(a=>a&&typeof a.mime==='string'&&a.mime)))){
          const all=chat.messages.flatMap(m=>m.attachments||[]),types=[...new Set(all.map(a=>a.mime.replace(/^image\//,'').toUpperCase()))];f.attachments={count:all.length,types};
        }
      }
    }
    if(pane&&typeof pane.digest==='boolean')f.digest=pane.digest;
    if(pane&&Object.hasOwn(pane,'instructionPath')){
      if(pane.instructionPath===null)f.instruction={state:'нет данных'};
      else if(typeof pane.instructionPath==='string'&&pane.instructionPath){
        const path=pane.instructionPath,meta=await get('/api/project/file?project='+encodeURIComponent(binding.project)+'&path='+encodeURIComponent(path)+'&meta=1');
        f.instruction={path,state:meta?.ok&&meta.project===binding.project&&meta.path===path?'есть':meta?.code==='file_missing'?'не найдена':'нет данных'};
      }
    }
    const confirm=await get('/api/swarm'),latest=confirm?.panes?.find(p=>p.id===binding.pane);
    if(!current(binding)||!confirm?.ok||confirm.project!==binding.project||confirm.instance!==binding.instance||binding.pane!=='room'&&(!latest||latest.chat!==binding.chat||latest.digest!==pane.digest||latest.instructionPath!==pane.instructionPath))return {};
    return f;
  }
  function html(c){ const p=L.H.pane, total=distributionKnown(c)?c.window:null, over=windowKnown(c)&&c.pct!=null&&c.pct>=90; let tab='history';
    const parts=c.parts.map(pt=>'<div class="ctx-lg" data-lk="'+pt.key+'"><i class="'+SH[pt.key]+'"></i><span>'+L.esc(pt.label)+'</span><b>'+fmt(pt.tokens)+'</b><small>'+(pct(pt.tokens,total)!=null?pct(pt.tokens,total)+' %':'')+(pt.est?' · оценка':'')+'</small></div>').join('');
    return '<div class="from">контекст · '+L.esc(p.id==='room'?'без роли':L.paneName(p))+' · '+L.esc(c.model||'')+'</div>'+
      '<div class="ch"><h3>Контекст чата</h3><span class="pill '+(c.busy?'acc':c.measured?'ok':'')+'">'+(c.busy?'идёт ход':c.measured?'измерено после хода':'оценка · нет данных')+'</span></div>'+
      '<div class="ctx-top"><div class="ctx-big"><div class="cap">занято'+(over?' · <em>близко к пределу</em>':'')+'</div><div class="num">'+fmt(c.used)+'<small>'+(windowKnown(c)?' / '+fmt(c.window)+' токенов':' · окно модели: нет данных')+'</small></div><div class="sub">'+(windowKnown(c)&&c.pct!=null?c.pct+' % окна':'доля неизвестна')+' · ход '+c.turns+'</div></div>'+
      '<div class="ctx-cache"><div class="cap">кэш подсказки</div>'+(c.cache&&c.cache.hitPct!=null?'<div class="num">'+c.cache.hitPct+' %<small> из кэша</small></div><div class="sub">'+fmt(c.cache.cached)+' из кэша · '+fmt(c.cache.new)+' новых</div>':'<div class="num muted">нет данных</div>')+'</div></div>'+
      matrix(c)+'<div class="ctx-legend">'+parts+'</div><div class="ctx-tipbox"></div><div data-context-parts>'+contextParts(null,c)+'</div>'+
      (c.unavailable?'<div class="ctx-empty">История и передачи · нет данных.</div>':'<div class="blk ctx-cont"><div class="t"><span>содержимое</span><span class="ctabs ctx-tabs"><span class="on" data-ctab="history">история · '+c.history.length+'</span><span data-ctab="handoff">переданное · '+c.handoff.length+'</span></span></div><div class="ctx-list">'+list(c,tab)+'</div></div>')+
      '<div class="ctx-foot"><span class="meta">'+L.esc((L.H.project||'').split('/').pop()||'без проекта')+(c.chat&&c.chat.title?' · '+L.esc(c.chat.title.slice(0,40)):'')+' · ход '+c.turns+'</span><span class="btn sm ghost" data-ctx-new>Новый чат без контекста</span><span class="btn sm '+(((c.history||[]).length<6&&(c.pct==null||c.pct<30))?'ghost':'p')+'" data-ctx-compact title="'+(c.unavailable?'Данных об истории нет':((c.history||[]).length<6&&(c.pct==null||c.pct<30))?'истории мало — сжимать есть смысл ближе к пределу окна':'выжимка одним ходом модели, новый чат')+'">Сжать историю</span></div>'; }
  function trackCardFocus(anchor,inner,binding){const overlay=inner.closest('.ovl');if(!overlay)return;overlay.inert=false;overlay.__contextFocus={anchor,binding,node:inner.querySelector('[data-context-parts]')};anchor.setAttribute('aria-expanded','true');
    if(!overlay.__contextObserver&&typeof MutationObserver==='function'){overlay.__contextObserver=new MutationObserver(()=>{const open=overlay.classList.contains('on'),state=overlay.__contextFocus,owns=state?.node?.isConnected&&overlay.contains(state.node),returnFocus=!open&&owns;overlay.inert=!open;if(state&&(!open||!owns)){state.anchor.setAttribute('aria-expanded','false');if(returnFocus&&state.anchor.isConnected&&current(state.binding))state.anchor.focus({preventScroll:true});overlay.__contextFocus=null}});overlay.__contextObserver.observe(overlay,{attributes:true,attributeFilter:['class']});overlay.__contextObserver.observe(inner,{childList:true})}
    inner.querySelector('[data-context-part] summary')?.focus({preventScroll:true}); }
  async function openCard(anchor){ if(!L.H.on||!L.H.pane){ L.toast('Контекст: нет данных — движок не подключён или нет места'); return; } if(!window.HX){ L.toast('Карточки недоступны'); return; }
    const binding=capture();if(!CTX||!current(CTX_BINDING))await refresh();if(!current(binding)||!anchor.isConnected)return;
    const card=CTX&&current(CTX_BINDING)?CTX:{parts:[],history:[],handoff:[],used:null,window:null,pct:null,measured:false,busy:false,turns:'нет данных',unavailable:true};cardBinding=binding;const request=++cardRequest;
    HX.open(anchor,html(card),{w:600,h:640,hide:false}); const inner=anchor.closest('.main').querySelector('.panel .inner'); if(!inner) return;
    const factsNode=inner.querySelector('[data-context-parts]');cardNode=factsNode;trackCardFocus(anchor,inner,binding);void readFacts(binding).then(facts=>{if(request!==cardRequest||!current(binding)||!factsNode?.isConnected)return;
      const opened=[...factsNode.querySelectorAll('.ctx51-part[open]')].map(node=>node.dataset.contextPart),focused=factsNode.contains(document.activeElement)?document.activeElement.closest('.ctx51-part')?.dataset.contextPart:null;
      factsNode.innerHTML=contextParts(facts,card);factsNode.querySelectorAll('.ctx51-part').forEach(node=>{if(opened.includes(node.dataset.contextPart))node.open=true;if(focused===node.dataset.contextPart)node.querySelector('summary')?.focus()});});
    inner.addEventListener('mouseover',e=>{ const lg=e.target.closest('[data-lk]'), cell=e.target.closest('.ctx-mx i'); const key=lg?lg.dataset.lk:cell?cell.dataset.k:null; const box=inner.querySelector('.ctx-tipbox'); if(!key){ return; }
      inner.querySelectorAll('.ctx-mx i').forEach(i=>i.classList.toggle('dim',i.dataset.k!==key)); inner.querySelectorAll('[data-lk]').forEach(x=>x.classList.toggle('on',x.dataset.lk===key)); if(box) box.innerHTML=tip(card,key); });
    inner.addEventListener('mouseleave',()=>{ inner.querySelectorAll('.ctx-mx i').forEach(i=>i.classList.remove('dim')); inner.querySelectorAll('[data-lk]').forEach(x=>x.classList.remove('on')); const box=inner.querySelector('.ctx-tipbox'); if(box) box.innerHTML=''; });
    inner.addEventListener('click',async e=>{ const tb=e.target.closest('[data-ctab]'); if(tb){ inner.querySelectorAll('[data-ctab]').forEach(x=>x.classList.toggle('on',x===tb)); inner.querySelector('.ctx-list').innerHTML=list(card,tb.dataset.ctab); return; }
      if(e.target.closest('[data-ctx-compact]')||e.target.closest('[data-ctx-new]')){ const carry=e.target.closest('[data-ctx-compact]')?'summary':'none'; const p=L.H.pane; if(!p) return;
        if(carry==='summary'&&!confirm('Сжать историю: движок попросит модель написать выжимку, откроет новый чат с ней и закроет этот. Один ход модели. Продолжить?')) return;
        if(carry==='none'&&!confirm('Новый чат без контекста: этот чат закроется, новый начнётся с чистого окна. Продолжить?')) return;
        let r=null; try{ r=await L.api('/api/chats/new',{pane:p.id,carry}); }catch(x){} if(!r||!r.ok){ L.toast('Не вышло: '+L.esc((r&&r.error)||'нет связи')); return; }
        HX.close(); L.log('чат',carry==='summary'?'История сжата: новый чат с выжимкой':'Новый чат без контекста'); L.toast(carry==='summary'?'Новый чат с выжимкой открыт, прежний закрыт':'Новый чат без контекста'); await L.refreshStatus(); await L.loadChat(); refresh(); } }); }
  document.addEventListener('click',e=>{ const s=e.target.closest('[data-ctx]'); if(!s) return; e.preventDefault(); e.stopPropagation(); openCard(s); });
  document.addEventListener('keydown',e=>{const s=e.target.closest('[data-ctx]');if(!s||!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();openCard(s)});
  addEventListener('live:status',()=>refresh()); addEventListener('live:done',()=>setTimeout(refresh,300));
  setTimeout(refresh,1200); timer=setInterval(()=>{ if(document.visibilityState==='visible') refresh(); },60000);   // после ходов обновляется по live:done; фоновый опрос — раз в минуту (Kimi UX-6 №131 п.8)
})();
