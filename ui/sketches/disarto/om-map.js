/* OMCORE — общий механизм карт (скетчи 26 и 39): экранирование, слойка по связям, геометрия связей, масштаб · панорама · перетаскивание.
   Отрисовка карт лежит в своих файлах (ниже — карта проекта, path-map.js — карта пути); здесь нет данных ни одного проекта. */
window.OMCORE=(function(){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const plural=(n,a,b,c)=>{ const m=n%10,h=n%100; return n+' '+(h>=11&&h<=14?c:m===1?a:m>=2&&m<=4?b:c); };
  /* слойка по связям: самый длинный путь по прямым связям; узел, в который ведут только отказы, сидит в колонке своего источника, ниже него */
  function layer(ids,edges){
    const set=new Set(ids), out={}, inc={}, L={}, state={}, back=new Set();
    ids.forEach(id=>{ out[id]=[]; inc[id]=[]; });
    const idx={}; ids.forEach((id,i)=>idx[id]=i);
    const E=edges.filter(e=>set.has(e.s)&&set.has(e.t)&&e.s!==e.t);
    /* назад — связь к узлу, который в данных стоит раньше (порядок данных = путь по продукту); остаток циклов ловит обход */
    E.forEach(e=>{ if(idx[e.t]<idx[e.s]) back.add(e); else out[e.s].push(e); });
    function dfs(u){ state[u]=1; out[u].forEach(e=>{ if(state[e.t]===1) back.add(e); else if(!state[e.t]) dfs(e.t); }); state[u]=2; }
    ids.forEach(id=>{ if(!state[id]) dfs(id); });
    const fwd=E.filter(e=>!back.has(e)); fwd.forEach(e=>inc[e.t].push(e));
    const onlyFail={};
    function lay(id){ if(L[id]!=null) return L[id]; L[id]=0; const es=inc[id]; if(!es.length) return 0; onlyFail[id]=es.every(e=>e.k==='fail'); let m=0; es.forEach(e=>{ m=Math.max(m,lay(e.s)+(onlyFail[id]?0:1)); }); L[id]=m; return m; }
    ids.forEach(lay);
    return {L,back,inc,onlyFail};
  }
  /* геометрия связей: кубические кривые, середина — для подписи артефакта */
  const cubic=(a,b,c,d,e,f,g,h)=>'M'+a+' '+b+' C'+c+' '+d+','+e+' '+f+','+g+' '+h;
  const midOf=(a,b,c,d,e,f,g,h)=>[.125*a+.375*c+.375*e+.125*g,.125*b+.375*d+.375*f+.125*h];
  function fwdPath(a,b){ const sx=a.x+a.w,sy=a.y+a.h/2,tx=b.x,ty=b.y+b.h/2; const o=Math.max(40,Math.min(110,Math.abs(tx-sx)/2)); return {d:cubic(sx,sy,sx+o,sy,tx-o,ty,tx,ty),m:midOf(sx,sy,sx+o,sy,tx-o,ty,tx,ty)}; }
  function backPath(a,b){ const sx=a.x+a.w/2,tx=b.x+b.w/2;
    if(a.y>b.y+b.h){ const sy=a.y+a.h/2, tb=b.y+b.h; return {d:cubic(a.x,sy,a.x-70,sy,tx,tb+70,tx,tb),m:midOf(a.x,sy,a.x-70,sy,tx,tb+70,tx,tb)}; }
    let lane=Math.min(a.y,b.y)-34; if(lane<14) lane=14; return {d:cubic(sx,a.y,sx,lane,tx,lane,tx,b.y),m:midOf(sx,a.y,sx,lane,tx,lane,tx,b.y)}; }
  function sidePath(a,b){ const sy=a.y+a.h/2,ty=b.y+b.h/2,ax=a.x+a.w,bx=b.x+b.w; return {d:cubic(ax,sy,ax+40,sy,bx+40,ty,bx,ty),m:midOf(ax,sy,ax+40,sy,bx+40,ty,bx,ty)}; }
  function retPath(a,b){ const sy=a.y+a.h/2,ty=b.y+b.h/2; return {d:cubic(a.x,sy,a.x-36,sy,b.x-36,ty,b.x,ty),m:midOf(a.x,sy,a.x-36,sy,b.x-36,ty,b.x,ty)}; }
  /* вид полотна: масштаб колесом (с ctrl/cmd) и кнопками, панорама в границах содержимого, перетаскивание карточек (чистый JS, без библиотек).
     o.box() — границы содержимого; o.items(target) — что тащим (массив {el,r,key}) или null; o.blank() — элементы, за которые панорамируют;
     o.onMove(items) — перерисовать связи; o.onEnd(items) — запомнить координаты; o.onView(V) — показать масштаб. takeSuppress() — клик после перетаскивания не считается. */
  function viewport(canvas,view,o){ o=o||{}; const KMIN=o.kmin||.3, KMAX=o.kmax||2, PAD=o.pad==null?24:o.pad;
    const V={k:1,tx:0,ty:0}; let drag=null, suppress=false;
    const cw=()=>canvas.clientWidth||932, chh=()=>canvas.clientHeight||698;
    function applyView(){ view.style.transform='translate('+V.tx+'px,'+V.ty+'px) scale('+V.k+')'; if(o.onView) o.onView(V); }
    function clampPan(){ const b=o.box(), W=cw(), H=chh(), k=V.k;
      const lo=Math.min(W-PAD-k*b.x1, PAD-k*b.x0), hi=Math.max(W-PAD-k*b.x1, PAD-k*b.x0); V.tx=Math.max(lo,Math.min(hi,V.tx));
      const lo2=Math.min(H-PAD-k*b.y1, PAD-k*b.y0), hi2=Math.max(H-PAD-k*b.y1, PAD-k*b.y0); V.ty=Math.max(lo2,Math.min(hi2,V.ty)); }
    function fit(bx){ const b=bx||o.box(), W=cw(), H=chh(), bw=b.x1-b.x0, bh=b.y1-b.y0;
      V.k=Math.max(KMIN,Math.min(1,(W-2*PAD)/bw,(H-2*PAD)/bh)); V.tx=(W-V.k*bw)/2-V.k*b.x0; V.ty=(H-V.k*bh)/2-V.k*b.y0; clampPan(); applyView(); }
    function zoomAt(cx,cy,f){ const k2=Math.max(KMIN,Math.min(KMAX,V.k*f)); const r=k2/V.k; V.tx=cx-(cx-V.tx)*r; V.ty=cy-(cy-V.ty)*r; V.k=k2; clampPan(); applyView(); }
    const frameScale=()=>{ const r=canvas.getBoundingClientRect(); return (r.width/canvas.offsetWidth)||1; };
    const local=e=>{ const r=canvas.getBoundingClientRect(), s=frameScale(); return [(e.clientX-r.left)/s,(e.clientY-r.top)/s]; };
    const isBlank=t=>t===canvas||t===view||(o.blank?o.blank():[]).includes(t);
    canvas.addEventListener('wheel',e=>{ e.preventDefault(); const [cx,cy]=local(e);
      if(e.ctrlKey||e.metaKey) zoomAt(cx,cy,Math.exp(-e.deltaY*0.01)); else { V.tx-=e.deltaX; V.ty-=e.deltaY; clampPan(); applyView(); } },{passive:false});
    /* перетаскивание: карточка (со своей стопкой) или пустое место — панорама */
    canvas.addEventListener('pointerdown',e=>{ if(e.button!==0||e.target.closest(o.ignore||'[data-zoom],[data-note]')) return; const s=frameScale(); const items=o.items?o.items(e.target):null;
      if(items){ if(!items.length||!items[0].r) return; drag={kind:'card',items:items.map(it=>({el:it.el,r:it.r,key:it.key,x0:it.r.x,y0:it.r.y})),sx:e.clientX,sy:e.clientY,s:s,moved:false}; }
      else if(isBlank(e.target)){ drag={kind:'pan',sx:e.clientX,sy:e.clientY,tx0:V.tx,ty0:V.ty,s:s,moved:false}; canvas.classList.add('panning'); }
      else return;
      drag.pid=e.pointerId; });
    /* захват указателя — только когда жест стал перетаскиванием: при захвате с pointerdown клик уходит полотну, а не карточке */
    canvas.addEventListener('pointermove',e=>{ if(!drag) return; const dx=(e.clientX-drag.sx)/drag.s, dy=(e.clientY-drag.sy)/drag.s; if(!drag.moved&&Math.hypot(dx,dy)<3) return; if(!drag.moved){ drag.moved=true; try{ canvas.setPointerCapture(drag.pid); }catch(x){} }
      if(drag.kind==='pan'){ V.tx=drag.tx0+dx; V.ty=drag.ty0+dy; clampPan(); applyView(); return; }
      drag.items.forEach(it=>{ it.r.x=it.x0+dx/V.k; it.r.y=it.y0+dy/V.k; it.el.style.left=it.r.x+'px'; it.el.style.top=it.r.y+'px'; }); if(o.onMove) o.onMove(drag.items); });
    const endDrag=()=>{ if(!drag) return; if(drag.kind==='card'&&drag.moved){ if(o.onEnd) o.onEnd(drag.items); suppress=true; clampPan(); applyView(); }
      if(drag.kind==='pan'&&drag.moved) suppress=true; canvas.classList.remove('panning'); drag=null; };
    canvas.addEventListener('pointerup',endDrag); canvas.addEventListener('pointercancel',endDrag);
    return {V,applyView,clampPan,fit,zoomAt,cw,chh,takeSuppress:()=>{ const s=suppress; suppress=false; return s; }};
  }
  return {esc,plural,layer,cubic,midOf,fwdPath,backPath,sidePath,retPath,viewport};
})();

/* Данные примера: «простой харнесс с подключением двух моделей». Отрисовка ниже читает только этот объект — число блоков, подблоков, работ и задач нигде в коде не зашито. */
const PROJECT={
  title:'Простой харнесс с двумя моделями',
  stages:[
    {code:'discovery',name:'Discovery',short:'Discovery',see:'разговор об идее и карточка «Идея»: проблема, кому, результат, риски, неизвестное',can:'решение «реализуемо» открывает следующую стадию; блокирующее неизвестное — нет'},
    {code:'concept',name:'Концепция',short:'Концепция',see:'для кого, что сможет, требования с результатом и приёмкой',can:'клик по требованию — что даёт и чем проверяется'},
    {code:'operation-map',name:'Операционная карта',short:'Опер. карта',see:'верхняя схема: блоки, артефакты на связях, пути успеха и отказа',can:'клик по блоку — вход → действие → выход и соседи'},
    {code:'specification',name:'Спецификация',short:'Спецификация',see:'на блоках — поведение: вход, результат, отказ, кто пишет состояние',can:'клик по блоку — поведение целиком'},
    {code:'features',name:'Фичи',short:'Фичи',see:'цветные обводки — фичи с требованиями',can:'клик по блоку — к какой фиче относится'},
    {code:'om-g2',name:'Проход OM',short:'Проход OM',see:'ответы на технические вопросы, подблоки текущего блока, пробелы и кто их закрыл, горизонт работ с ответом движка',can:'раскрыть блок; клик по маркеру — вопрос и ответ; ваш пробел — выбор из вариантов'},
    {code:'compilation',name:'Компиляция',short:'Компиляция',see:'задачи, пристёгнутые к работам: предмет · потребитель · область записи · проверка',can:'клик по задаче — карточка целиком; план руками не правится'},
    {code:'execution',name:'Исполнение',short:'Исполнение',see:'статусы задач; на блоках — сколько готово; возврат в план со стрелкой к переизданному узлу',can:'клик по задаче — находка и что переиздано'}
  ],
  discovery:{
    chat:[['me','Хочу, чтобы одна модель делала, а вторая проверяла — и всё в одном окне.'],['ai','Сейчас это два чата и копирование ответа руками на проверку? Кто будет пользоваться?'],['me','Да. Пользуюсь я один, разработчик. Модели A и B — по их API.'],['ai','Реализуемо. Риски: лимиты, разные форматы API, расход. Неясно одно: что делать, если проверяющий не согласен — запишу как неизвестное.']],
    idea:{t:'Идея: одна модель делает, вторая проверяет, в одном окне',kv:[['проблема','два чата и ручное копирование ответа на проверку'],['кому','разработчик-одиночка'],['внешнее','API модели A · API модели B'],['результат','ответ, проверенный второй моделью, за один ход'],['риски','лимиты · разные форматы API · расход'],['неизвестное','что делать, если проверяющий не согласен']],decision:'реализуемо — продолжаем'}
  },
  concept:{
    nodes:[
      {id:'idea',k:'idea',t:'Идея: одна модель делает, вторая проверяет',dec:'реализуемо'},
      {id:'who',k:'text',t:'Для кого',d:'разработчик-одиночка'},
      {id:'can',k:'text',t:'Что сможет',d:'подключить две модели по ключу · дать задачу · получить ответ и проверку за один ход · видеть историю и расход'},
      {id:'t1',k:'req',n:'Т1',t:'Подключить две модели по ключу',res:'две модели подключены',acc:'ключ принят, пробный запрос отвечен'},
      {id:'t2',k:'req',n:'Т2',t:'Задача → ответ исполнителя',res:'ответ исполнителя',acc:'ответ приходит на любую задачу'},
      {id:'t3',k:'req',n:'Т3',t:'Проверка второй моделью с вердиктом',res:'вердикт проверяющего',acc:'вердикт есть у каждого ответа'},
      {id:'t4',k:'req',n:'Т4',t:'История сохраняется',res:'запись хода',acc:'ход читается после перезапуска'},
      {id:'t5',k:'req',n:'Т5',t:'Расход виден',res:'замер расхода',acc:'после хода видна цена хода'},
      {id:'t6',k:'req',n:'Т6',t:'Сбой модели — понятная ошибка и повтор',res:'отказ и повтор',acc:'при сбое — текст ошибки и кнопка «повторить»'}
    ],
    edges:[{s:'idea',t:'who'},{s:'idea',t:'can'},{s:'can',t:'t1'},{s:'can',t:'t2'},{s:'can',t:'t3'},{s:'can',t:'t4'},{s:'can',t:'t5'},{s:'can',t:'t6'}]
  },
  nodes:[
    {id:'conn',k:'block',t:'Подключение моделей',in:[],out:['подключение'],bh:'вход: ключ и модель · результат: подключение · отказ: ключ не принят — подключения нет · пишет: только этот блок',r1:'ключи — в связке ключей ОС'},
    {id:'win',k:'block',t:'Окно: ввод и показ',in:['ответ','вердикт'],out:['задача'],bh:'вход: текст · результат: задача · отказ: пустой ввод не уходит · показывает ответ и вердикт'},
    {id:'intake',k:'block',t:'Приём задачи',in:['задача'],out:['задача'],bh:'вход: задача · результат: задача принята · отказ: ход уже идёт — очередь'},
    {id:'turn',k:'block',t:'Ход: исполнитель → проверяющий',in:['задача','ответ','вердикт','повтор'],out:['запрос','ответ','вердикт','запись хода','замер расхода'],bh:'вход: задача · результат: ответ + вердикт · отказ: модель не ответила за срок — ход не записывается наполовину'},
    {id:'call',k:'block',t:'Вызов модели',in:['подключение','запрос'],out:['ответ','вердикт','отказ'],bh:'вход: запрос · результат: ответ или вердикт · отказ: срок, лимит, формат · состояние не пишет',r1:'два адаптера под два API'},
    {id:'hist',k:'block',t:'История',in:['запись хода'],out:[],bh:'вход: запись хода · результат: ход сохранён · пишет: только «История» — один писатель',r1:'локальный файл базы'},
    {id:'spend',k:'block',t:'Расход',in:['замер расхода'],out:[],bh:'вход: замер · результат: цена хода видна · отказ: нет замера — «неизвестно», не ноль'},
    {id:'retry',k:'block',t:'Ошибки и повтор',in:['отказ'],out:['повтор'],bh:'вход: отказ · результат: понятная ошибка и повтор · отказ: три повтора — стоп'},
    {id:'fmt',k:'sub',p:'call',t:'Общий формат запроса и ответа',in:['запрос'],out:['запрос']},
    {id:'adA',k:'sub',p:'call',t:'Адаптер A',in:['подключение','запрос'],out:['ответ']},
    {id:'adB',k:'sub',p:'call',t:'Адаптер B',in:['подключение','запрос'],out:['вердикт']},
    {id:'stream',k:'sub',p:'call',t:'Поток ответа',in:['ответ','вердикт'],out:['ответ','вердикт']},
    {id:'tmo',k:'sub',p:'call',t:'Срок и отмена',in:['срок вышел'],out:['отказ']},
    {id:'w1',k:'work',p:'fmt',n:'Р1',t:'Общий формат запроса',subject:'формат запроса'},
    {id:'w2',k:'work',p:'adA',n:'Р2',t:'Адаптер A',subject:'адаптер A'},
    {id:'w3',k:'work',p:'stream',n:'Р3',t:'Поток ответа в окно',subject:'поток ответа',ret:'нет описи влияния на «Окно»'},
    {id:'w4',k:'work',p:'hist',n:'Р4',t:'Запись хода в историю',subject:'запись хода'},
    {id:'k1',k:'task',p:'w1',t:'Общий формат запроса',subject:'формат запроса',consumer:'адаптеры A и B',area:'вызов/формат · тест формата',check:'тест на оба адаптера',st:'done'},
    {id:'k2',k:'task',p:'w2',t:'Адаптер A',subject:'адаптер A',consumer:'ход',area:'вызов/адаптер-a · тест адаптера A',check:'пробный запрос к A',st:'done'},
    {id:'k3',k:'task',p:'w3',t:'Поток ответа в окно',subject:'поток ответа',consumer:'окно',area:'вызов/поток · тест окна',check:'ответ появляется по частям',st:'run'},
    {id:'k4',k:'task',p:'w4',t:'Запись хода в историю',subject:'запись хода',consumer:'история',area:'история/запись · без теста записи',check:'ход читается из истории',st:'back',finding:'область записи не включала задетый тест записи хода — задача упала на чужом тесте',reissue:'область: история/запись · тест записи хода'}
  ],
  edges:[
    {s:'win',t:'intake',a:'задача'},
    {s:'intake',t:'turn',a:'задача'},
    {s:'conn',t:'call',a:'подключение'},
    {s:'turn',t:'call',a:'запрос'},
    {s:'call',t:'turn',a:'ответ · вердикт'},
    {s:'turn',t:'win',a:'ответ · вердикт'},
    {s:'turn',t:'hist',a:'запись хода'},
    {s:'turn',t:'spend',a:'замер расхода'},
    {s:'call',t:'retry',a:'отказ',k:'fail'},
    {s:'retry',t:'turn',a:'повтор',k:'fail'},
    {s:'fmt',t:'adA',a:'запрос'},
    {s:'fmt',t:'adB',a:'запрос'},
    {s:'adA',t:'stream',a:'ответ'},
    {s:'adB',t:'stream',a:'вердикт'},
    {s:'adA',t:'tmo',a:'срок вышел',k:'fail'},
    {s:'adB',t:'tmo',a:'срок вышел',k:'fail'}
  ],
  features:[
    {n:'Ф1',t:'Подключение',req:'Т1',of:['conn'],c:'#c27a34'},
    {n:'Ф2',t:'Ход с проверкой',req:'Т2 · Т3',of:['intake','turn','call'],c:'#dcb866'},
    {n:'Ф3',t:'История',req:'Т4',of:['hist'],c:'#3fbf6f'},
    {n:'Ф4',t:'Расход',req:'Т5',of:['spend'],c:'#6f9bd8'},
    {n:'Ф5',t:'Повтор',req:'Т6',of:['retry'],c:'#c9566e'}
  ],
  gaps:[
    {n:'adB',q:'как модель B сообщает о лимите?',by:'код',how:'по документации API'},
    {n:'turn',q:'проверяющий не согласен — что показать?',by:'вы',options:['показать оба ответа и кнопку «переделать»','взять ответ исполнителя как есть','спросить проверяющего ещё раз'],chosen:0},
    {n:'fmt',q:'история не влезает в контекст',by:'модель',how:'брать последние N ходов'}
  ]
};
(function(){
  const P=PROJECT, STG=P.stages, LAST=STG.length-1;
  const N={}; P.nodes.concat(P.concept.nodes).forEach(n=>N[n.id]=n);
  const KIDS={}; P.nodes.forEach(n=>{ if(n.p) (KIDS[n.p]=KIDS[n.p]||[]).push(n.id); });
  const GAPS={}; P.gaps.forEach(g=>(GAPS[g.n]=GAPS[g.n]||[]).push(g));
  const ROOT=P.nodes.filter(n=>!n.p).map(n=>n.id);
  const GRAPH={block:1,sub:1};
  const CW=172, GW=130, GGAP=24, RM=44;
  const TST={done:['готово','ok'],run:['в работе','acc'],back:['вернулась в план','bad'],plan:['в плане','']};
  const esc=OMCORE.esc, plural=OMCORE.plural, layer=OMCORE.layer;
  const desc=id=>{ const out=[]; (KIDS[id]||[]).forEach(k=>{ out.push(k); out.push.apply(out,desc(k)); }); return out; };
  const worksOf=id=>desc(id).filter(k=>N[k].k==='work');
  const tasksOf=id=>desc(id).filter(k=>N[k].k==='task');
  const graphKids=id=>(KIDS[id]||[]).filter(k=>GRAPH[N[k].k]);
  const pathTo=id=>{ const p=[]; let c=N[id]&&N[id].p; while(c){ p.unshift(c); c=N[c].p; } return p; };
  const blockOf=id=>{ let c=id; while(c&&N[c].p) c=N[c].p; return c; };
  const kindName={block:'блок',sub:'подблок',work:'работа',task:'задача',req:'требование',idea:'идея',text:'концепция'};
  const stageOfKind={block:2,sub:5,work:5,task:6};


  function mount(app,o){
    o=o||{}; const live=!!o.live; const uid='m'+Math.random().toString(36).slice(2,7);
    const S={stage:o.stage==null?LAST:o.stage,path:o.path||[],sel:o.sel||null,noWorks:!!o.noWorks,newKind:o.newKind||''};
    const POS={};   /* перетащенные карточки — на сеанс, по уровням; вид полотна (масштаб, сдвиг) — в VP ниже */
    app.innerHTML='<aside class="side" data-rail="plan"></aside><section class="main"><div class="top"><b>'+(o.app?'План · карта':'План · карта проекта')+'</b><span class="st">'+(o.app?'<i></i>':'')+'пример · '+esc(P.title)+'</span><div class="om-crumbs" data-crumbs></div>'+
      '<div class="r"><span class="mono" style="font-size:10px" data-stagen></span>'+(live?'<span class="btn sm ghost" data-passport>ⓘ Паспорт</span>':'')+'</div></div>'+
      '<div class="body" style="height:100%"><div class="om-wrap"><div class="om-left"><div class="om-canvas" data-canvas><div class="om-view" data-view><svg class="om-under" data-under></svg><svg class="om-edges" data-edges><defs><marker id="'+uid+'-ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#585860"/></marker><marker id="'+uid+'-ah-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#c27a34"/></marker><marker id="'+uid+'-ah-bad" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#a3304b"/></marker></defs></svg><div data-nodes></div></div><div class="om-note" data-note></div>'+(live?'<div class="om-zoom" data-zoom><span data-z="out" title="Уменьшить">−</span><b data-zpct>100 %</b><span data-z="in" title="Увеличить">+</span><span class="fit" data-z="fit" title="Вписать карту">вписать</span></div>':'')+'</div>'+
      '<div class="om-time" data-time></div></div><div class="om-right"><div class="om-stages" data-stages></div><div class="om-side" data-side></div></div></div></div></section>';
    if(window.HX&&HX.rail) HX.rail();
    const canvas=app.querySelector('[data-canvas]'), view=app.querySelector('[data-view]'), svg=app.querySelector('[data-edges]'), under=app.querySelector('[data-under]'), layerEl=app.querySelector('[data-nodes]'), side=app.querySelector('[data-side]'), stagesEl=app.querySelector('[data-stages]'), timeEl=app.querySelector('[data-time]'), crumbs=app.querySelector('[data-crumbs]'), noteEl=app.querySelector('[data-note]'), stageN=app.querySelector('[data-stagen]');
    if(!live) canvas.classList.add('static');
    if(S.newKind) canvas.classList.add('new-'+S.newKind);
    const visibleKind=k=>(stageOfKind[k]||0)<=S.stage;
    const taskStatus=t=>S.stage>=7?TST[t.st]:TST.plan;
    const workEngine=w=>S.stage===5&&w.ret?['возвращён','bad',w.ret]:['принят','ok'];
    const workStatus=w=>{ if(S.stage>=7){ const ts=tasksOf(w.id).map(k=>N[k]); if(!ts.length) return TST.plan; if(ts.some(t=>t.st==='back')) return TST.back; if(ts.every(t=>t.st==='done')) return TST.done; if(ts.some(t=>t.st==='run')) return TST.run; return TST.plan; } if(S.stage>=6) return ['в плане','']; return workEngine(w); };
    const canOpen=id=>live&&S.stage>=5&&N[id]&&GRAPH[N[id].k]&&(KIDS[id]||[]).length>0;
    const kidsLabel=id=>{ const g=graphKids(id).length, w=worksOf(id).length, t=tasksOf(id).length; if(S.stage<5) return ''; if(S.stage>=7&&t) return ''; const parts=[]; if(g) parts.push(plural(g,'подблок','подблока','подблоков')); if(w) parts.push(plural(w,'работа','работы','работ')); return parts.length?parts.join(' · '):'ещё не раскрыт'; };
    const inHorizon=id=>worksOf(id).length>0;

    /* ---- содержимое уровня ---- */
    function content(){
      const C={mode:'graph',ids:[],edges:[],ghosts:[],stack:{},parent:null};
      if(S.stage===0){ C.mode='idea'; return C; }
      if(S.stage===1){ C.ids=P.concept.nodes.map(n=>n.id); C.edges=P.concept.edges; return C; }
      const parent=S.path.length?S.path[S.path.length-1]:null; C.parent=parent;
      let ids=parent?graphKids(parent):ROOT.slice();
      if(parent&&!ids.length) ids=(KIDS[parent]||[]).filter(k=>N[k].k==='work');
      C.ids=ids; const set=new Set(ids);
      C.edges=P.edges.filter(e=>set.has(e.s)&&set.has(e.t));
      if(S.stage>=5&&!S.noWorks) ids.forEach(id=>{ const n=N[id]; const st=[];
        if(n.k==='work'){ if(S.stage>=6) tasksOf(id).forEach(t=>st.push({k:'task',id:t,under:id})); }
        else if(parent){ (KIDS[id]||[]).filter(k=>N[k].k==='work').forEach(w=>{ st.push({k:'work',id:w}); if(S.stage>=6) tasksOf(w).forEach(t=>st.push({k:'task',id:t,under:w})); }); }
        else worksOf(id).forEach(w=>st.push({k:'row',id:w,under:id}));
        C.stack[id]=st; });
      if(parent){ P.edges.forEach(e=>{ if(e.s===e.t) return; const inc=e.t===parent, out=e.s===parent; if(!inc&&!out) return; const other=inc?e.s:e.t;
        const pool=inc?ids:ids.slice().reverse(); let child=pool.find(k=>((inc?N[k].in:N[k].out)||[]).some(a=>e.a.split(' · ').includes(a))); if(!child) child=pool[0];
        C.ghosts.push({id:other,inc:inc,e:e,child:child}); }); }
      return C;
    }
    /* ---- карточки ---- */
    function cardHTML(id){ const n=N[id];
      if(n.k==='idea') return '<div class="om-card idea compact" data-id="'+id+'"><div class="meta"><span class="pill ok">'+esc(n.dec)+'</span></div><div class="t">'+esc(n.t)+'</div><div class="io"><b>исследование</b> принято</div></div>';
      if(n.k==='text') return '<div class="om-card text" data-id="'+id+'"><div class="meta"><span class="pill">'+esc(n.t)+'</span></div><div class="t">'+esc(n.d)+'</div></div>';
      if(n.k==='req') return '<div class="om-card req" data-id="'+id+'"><div class="meta"><span class="pill acc">'+esc(n.n)+'</span><span class="kids">приёмка есть</span></div><div class="t">'+esc(n.t)+'</div><div class="io"><b>результат</b> '+esc(n.res)+'</div></div>';
      if(n.k==='work') return workHTML(id,false);
      const lvl=n.k==='sub'?'подблок':'блок'; const gaps=S.stage>=5?(GAPS[id]||[]):[]; const cnt=S.stage>=7?tasksOf(id).map(k=>N[k]):[];
      let h='<div class="om-card'+(S.newKind===n.k||(S.newKind==='bh'&&n.bh)?' new':'')+(S.stage>=5&&n.k==='block'&&!S.path.length&&!inHorizon(id)&&!gaps.length?' dim':'')+'" data-id="'+id+'">';
      if(gaps.length) h+='<span class="om-mark'+(gaps.every(g=>g.by)?' closed':'')+(gaps.length>1?' many':'')+'" data-n="'+gaps.length+'">'+(gaps.every(g=>g.by)?'✓':'?')+'</span>';
      h+='<div class="meta"><span class="pill">'+lvl+'</span><span class="kids">'+esc(kidsLabel(id))+'</span></div><div class="t">'+esc(n.t)+'</div>';
      h+='<div class="io"><b>вход</b> '+(n.in.length?esc(n.in.join(' · ')):'—')+'<i>→</i><b>выход</b> '+(n.out.length?esc(n.out.join(' · ')):'—')+'</div>';
      if(S.stage>=3&&S.stage<=4&&n.bh) h+='<div class="bh">'+esc(n.bh)+'</div>';
      if(S.stage>=5&&n.r1&&!S.path.length) h+='<div class="r1"><span>ответ</span>'+esc(n.r1)+'</div>';
      if(cnt.length){ const d=cnt.filter(t=>t.st==='done').length; h+='<div class="cnt"><div class="ticks thin">'+cnt.map(t=>'<i class="'+(t.st==='done'?'ok':t.st==='run'?'on':t.st==='back'?'bad':'')+'"></i>').join('')+'</div><b>'+d+' из '+cnt.length+(cnt.some(t=>t.st==='back')?' · возврат':'')+'</b></div>'; }
      return h+'</div>'; }
    function workHTML(id,row){ const w=N[id], st=workStatus(w);
      if(row) return '<div class="om-work row'+(S.newKind==='work'?' new':'')+'" data-id="'+id+'"><div class="meta"><span class="n">'+esc(w.n)+'</span></div><span class="t">'+esc(w.t)+'</span><span class="pill '+st[1]+'">'+st[0]+'</span></div>';
      return '<div class="om-work'+(S.newKind==='work'?' new':'')+'" data-id="'+id+'"><div class="meta"><span class="n">'+esc(w.n)+' · работа</span><small>'+esc(S.stage>=7&&w.ret==null&&tasksOf(id).some(k=>N[k].st==='back')?'переиздана':'')+'</small></div><div class="t">'+esc(w.t)+'</div><div class="s"><b>предмет</b> '+esc(w.subject)+' · <span class="pill '+st[1]+'" style="height:15px;padding:0 5px;font-size:8.5px;line-height:14px">'+st[0]+'</span>'+(st[2]?'<br>'+esc(st[2]):'')+'</div></div>'; }
    function taskHTML(id){ const t=N[id], st=taskStatus(t);
      return '<div class="om-task'+(S.stage>=7?' '+t.st:'')+(S.newKind==='task'?' new':'')+'" data-id="'+id+'"><div class="meta"><span class="pill '+st[1]+'">'+st[0]+'</span><span class="n">задача</span></div><div class="t">'+esc(t.t)+'</div><div class="kv"><span>предмет</span><b>'+esc(t.subject)+'</b><span>потребитель</span><b>'+esc(t.consumer)+'</b><span>область</span><b>'+esc(S.stage>=7&&t.st==='back'?t.reissue.replace(/^область: /,''):t.area)+'</b><span>проверка</span><b>'+esc(t.check)+'</b></div></div>'; }
    function ghostHTML(g,i){ const n=N[g.id], gaps=S.stage>=5?(GAPS[g.id]||[]):[]; const lbl=g.inc?(g.e.k==='fail'?'← при отказе от':'← пришло от'):(g.e.k==='fail'?'→ при отказе':'→ уходит в');
      return '<div class="om-ghost" data-ghost="'+i+'" data-gid="'+g.id+'">'+(gaps.length?'<span class="om-mark closed">✓</span>':'')+'<small>'+lbl+'</small><b>'+esc(n.t)+'</b><em>'+esc(g.e.a)+'</em></div>'; }

    /* ---- геометрия — общая, OMCORE ---- */
    const fwdPath=OMCORE.fwdPath, backPath=OMCORE.backPath, sidePath=OMCORE.sidePath, retPath=OMCORE.retPath;

    /* ---- раскладка и отрисовка ---- */
    let G={rects:{},edges:[],ghosts:[],C:null};
    function render(o2){ o2=o2||{};
      const C=content(); G={rects:{},edges:[],ghosts:[],C:C};
      const W=canvas.clientWidth||932, H=canvas.clientHeight||698;
      svg.querySelectorAll('path').forEach(x=>x.remove()); under.innerHTML='';
      if(C.mode==='idea'){ const d=P.discovery;
        layerEl.innerHTML='<div class="om-chat"><div class="cap2">разговор об идее · вы и модель-исследователь</div>'+d.chat.map(m=>'<div class="msg'+(m[0]==='me'?' me':'')+'">'+(m[0]==='ai'?'<div class="who"><i></i>исследователь</div>':'')+esc(m[1])+'</div>').join('')+'<div class="decide"><div class="lbl">ваше решение</div>Идея реализуема и нужна — продолжаем. Неизвестное останется на карте, пока его не закроют.<div class="acts" style="margin-top:8px"><span class="btn sm p">Реализуемо — дальше</span><span class="btn sm ghost">Ещё обсудить</span></div></div></div>'+
          '<div class="om-card idea new" data-id="idea" style="left:460px;top:'+Math.max(16,(H-300)/2)+'px"><div class="meta"><span class="pill">идея</span><span class="kids">стадия 1 из '+STG.length+'</span></div><div class="t" style="font-size:13px">'+esc(d.idea.t)+'</div><div class="kv">'+d.idea.kv.map(([a,b])=>'<span>'+a+'</span><b>'+esc(b)+'</b>').join('')+'</div><span class="pill ok">'+esc(d.idea.decision)+'</span></div>';
        finish(); if(o2.fit!==false) fitView(); return; }
      /* 1) карточки без координат — чтобы измерить высоты */
      let h=''; C.ids.forEach(id=>{ h+=cardHTML(id); (C.stack[id]||[]).forEach(s=>{ h+=s.k==='task'?taskHTML(s.id):workHTML(s.id,s.k==='row'); }); });
      C.ghosts.forEach((g,i)=>h+=ghostHTML(g,i));
      layerEl.innerHTML=h; layerEl.style.visibility='hidden';
      const hOf=id=>{ const el=layerEl.querySelector('[data-id="'+id+'"]'); return el?el.offsetHeight:78; };
      /* 2) слойка */
      const {L,back,inc,onlyFail}=layer(C.ids,C.edges); const nCols=C.ids.length?Math.max.apply(null,C.ids.map(id=>L[id]))+1:1;
      const xMin=C.ghosts.some(g=>g.inc)?16+GW+GGAP:16, xMax=C.ghosts.some(g=>!g.inc)?W-16-GW-GGAP:W-16-RM;
      const pitch=nCols>1?Math.max(CW+30,Math.min(270,(xMax-xMin-CW)/(nCols-1))):0;
      const cols=[]; C.ids.forEach((id,i)=>{ (cols[L[id]]=cols[L[id]]||[]).push(id); });
      const pos={}; cols.forEach((col,c)=>{ if(c>0) col.sort((a,b)=>{ const key=id=>{ const ps=inc[id].map(e=>pos[e.s]).filter(x=>x!=null); return (onlyFail[id]?1000:0)+(ps.length?ps.reduce((x,y)=>x+y,0)/ps.length:C.ids.indexOf(id)); }; return key(a)-key(b); }); col.forEach((id,i)=>pos[id]=i); });
      cols.forEach((col,c)=>{ const cells=col.map(id=>{ let hh=hOf(id); (C.stack[id]||[]).forEach(s=>hh+=hOf(s.id)+8); return hh; }); const gap=cells.length>3?14:18, total=cells.reduce((a,b)=>a+b,0)+(col.length-1)*gap; let y=total>H-90?40:Math.max(50,(H-total)/2);
        col.forEach((id,i)=>{ const x=xMin+c*pitch; G.rects[id]={x:x,y:y,w:CW,h:hOf(id)}; let yy=y+hOf(id)+8; (C.stack[id]||[]).forEach(s=>{ G.rects[s.id]={x:x+(s.k==='task'?0:0),y:yy,w:CW,h:hOf(s.id)}; yy+=hOf(s.id)+8; }); y+=cells[i]+gap; }); });
      C.ghosts.forEach((g,i)=>{ const base=G.rects[g.child]; g.r={x:g.inc?16:W-16-GW,y:Math.max(50,(base?base.y+base.h/2:120)-30),w:GW,h:60}; });
      /* призраки не должны накладываться друг на друга */
      ['inc','out'].forEach(side=>{ const list=C.ghosts.filter(g=>side==='inc'?g.inc:!g.inc).sort((a,b)=>a.r.y-b.r.y); let last=-1e9; list.forEach(g=>{ if(g.r.y<last+72) g.r.y=last+72; last=g.r.y; }); });
      /* перетащенные в этом сеансе карточки — на своих местах */
      const saved=POS[levelKey()]||{}; Object.keys(saved).forEach(id=>{ if(G.rects[id]){ G.rects[id].x=saved[id].x; G.rects[id].y=saved[id].y; } });
      C.ghosts.forEach((g,i)=>{ const sv=saved['ghost:'+i]; if(sv){ g.r.x=sv.x; g.r.y=sv.y; } });
      G.back=back;
      /* 3) координаты */
      place(); layerEl.style.visibility='';
      drawEdges();
      finish(); if(o2.fit!==false) fitView();
    }
    function place(){ const C=G.C;
      layerEl.querySelectorAll('[data-id]').forEach(el=>{ const r=G.rects[el.dataset.id]; if(r){ el.style.left=r.x+'px'; el.style.top=r.y+'px'; } });
      layerEl.querySelectorAll('[data-ghost]').forEach(el=>{ const g=C.ghosts[+el.dataset.ghost]; el.style.left=g.r.x+'px'; el.style.top=g.r.y+'px'; }); }
    /* связи, подписи артефактов, обводки фич — по текущим координатам (вызывается и при перетаскивании) */
    function drawEdges(){ const C=G.C, back=G.back||new Set();
      svg.querySelectorAll('path').forEach(x=>x.remove()); under.innerHTML=''; layerEl.querySelectorAll('.om-lbl,.om-flbl').forEach(x=>x.remove());
      let p='', lbls=''; const ah='url(#'+uid+'-ah)';
      C.edges.forEach((e,i)=>{ const a=G.rects[e.s], b=G.rects[e.t]; if(!a||!b) return; const same=Math.abs(a.x-b.x)<2, isBack=!same&&(back.has(e)||(b.x<a.x)); const pt=same?sidePath(a,b):isBack?backPath(a,b):fwdPath(a,b);
        p+='<path class="'+(e.k==='fail'?'fail':'')+'" data-e="'+i+'" data-s="'+e.s+'" data-t="'+e.t+'" d="'+pt.d+'" marker-end="'+ah+'"/>';
        if(e.a) lbls+='<span class="om-lbl'+(e.k==='fail'?' fail':'')+'" data-le="'+i+'" data-s="'+e.s+'" data-t="'+e.t+'" style="left:'+pt.m[0]+'px;top:'+pt.m[1]+'px">'+esc(e.a)+'</span>'; });
      C.ghosts.forEach((g,i)=>{ const c=G.rects[g.child]; if(!c) return; const pt=g.inc?fwdPath(g.r,c):fwdPath(c,g.r);
        p+='<path class="'+(g.e.k==='fail'?'fail':'')+'" data-g="'+i+'" data-s="'+(g.inc?g.id:g.child)+'" data-t="'+(g.inc?g.child:g.id)+'" d="'+pt.d+'" marker-end="'+ah+'"/>'; });
      /* обратный путь исполнения: задача вернулась в план → стрелка к узлу, который переиздан */
      if(S.stage>=7) C.ids.forEach(id=>(C.stack[id]||[]).forEach(s=>{ const n=N[s.id]; const bad=s.k==='task'?n.st==='back':s.k==='row'&&tasksOf(s.id).some(k=>N[k].st==='back'); if(!bad) return; const a=G.rects[s.id], b=G.rects[s.under]; if(!a||!b) return; const pt=retPath(a,b);
        p+='<path class="fail" data-ret="'+s.id+'" data-s="'+s.id+'" data-t="'+s.under+'" d="'+pt.d+'" marker-end="url(#'+uid+'-ah-bad)"/>'; lbls+='<span class="om-lbl fail" data-s="'+s.id+'" data-t="'+s.under+'" style="left:'+(pt.m[0]-10)+'px;top:'+pt.m[1]+'px;color:var(--bad)">находка → план</span>'; }));
      svg.insertAdjacentHTML('beforeend',p); layerEl.insertAdjacentHTML('beforeend',lbls);
      /* 5) обводки фич — на уровне продукта с стадии фич */
      if(S.stage>=4&&C.parent==null){ let u='', fl=''; const op=S.stage>=5?' opacity:.45':''; P.features.forEach(f=>{ let first=true; f.of.forEach(id=>{ const r=G.rects[id]; if(!r) return; let y1=r.y+r.h; (C.stack[id]||[]).forEach(s=>{ const q=G.rects[s.id]; if(q) y1=Math.max(y1,q.y+q.h); });
        u+='<rect x="'+(r.x-7)+'" y="'+(r.y-9)+'" width="'+(r.w+14)+'" height="'+(y1-r.y+18)+'" style="--fc:'+f.c+';'+op+'"/>'; if(first){ fl+='<span class="om-flbl" style="--fc:'+f.c+';left:'+(r.x)+'px;top:'+(r.y-16)+'px;'+op+'">'+f.n+' '+esc(f.t)+'<small>'+esc(f.req)+'</small></span>'; first=false; } }); });
        under.innerHTML=u; layerEl.insertAdjacentHTML('beforeend',fl); }
    }
    function finish(){ renderCrumbs(); renderStages(); renderTime(); renderNote(); highlight(); renderSide(); stageN.textContent='стадия '+(S.stage+1)+' из '+STG.length+' · '+STG[S.stage].code; }
    function renderCrumbs(){ let h='<span'+(S.path.length?'':' class="cur"')+' data-go-level="0">Проект</span>'; S.path.forEach((id,i)=>{ h+='<i>›</i><span'+(i===S.path.length-1?' class="cur"':'')+' data-go-level="'+(i+1)+'">'+esc(N[id].t)+'</span>'; }); crumbs.innerHTML=h; }
    function renderStages(){ const t=S.stage;
      stagesEl.innerHTML='<div class="h"><svg class="ico" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>Текущий этап<span class="cnt">'+(t+1)+'/'+STG.length+'</span></div><ol>'+STG.map((s,i)=>'<li class="'+(i<t?'d':i===t?'c':'')+'" data-stage="'+i+'"><i>'+(i+1)+'</i><span>'+s.name+'<small>'+s.code+'</small></span><em>'+(i<t?'принята':i===t?(s.code==='om-g2'?'L1 → L2 → L3':'сейчас'):'—')+'</em></li>').join('')+'</ol>'; }
    timeEl.innerHTML='<span class="lbl">стадии</span><div class="tr"><div class="ln"><i></i></div>'+STG.map((s,i)=>'<span class="tk" data-stage="'+i+'" style="left:'+(i/LAST*100)+'%" title="'+esc(s.name+' · '+s.code)+'"><small>'+s.short+'</small></span>').join('')+'<span class="knob"></span><input type="range" min="0" max="'+LAST+'" value="0" data-range></div><span class="txt"></span>';
    function renderTime(){ const t=S.stage, pc=(t/LAST*100)+'%';
      timeEl.querySelector('.ln i').style.width=pc; timeEl.querySelector('.knob').style.left=pc; timeEl.querySelector('[data-range]').value=t;
      timeEl.querySelectorAll('.tk').forEach((k,i)=>{ k.classList.toggle('past',i<t); k.classList.toggle('cur',i===t); });
      timeEl.querySelector('.txt').innerHTML='<b>'+STG[t].name+' · '+STG[t].code+'</b>'; }
    function renderNote(){ const t=S.stage; let s='';
      if(t===0) s='решение «реализуемо» — и карта начнёт расти';
      else if(t===1) s='<b>'+plural(P.concept.nodes.filter(n=>n.k==='req').length,'требование','требования','требований')+'</b> · каждое с результатом и приёмкой';
      else if(t<4) s='<b>'+plural(ROOT.length,'блок','блока','блоков')+'</b> · сплошная — успех · пунктир — отказ · подпись — артефакт';
      else if(t===4) s='<b>'+plural(P.features.length,'фича','фичи','фич')+'</b> · обводка = группа блоков с требованиями';
      else if(t===5){ const hz=ROOT.filter(inHorizon); s='горизонт: '+hz.map(id=>'«'+esc(N[id].t)+'»').join(' · ')+' · <b>'+plural(P.nodes.filter(n=>n.k==='work').length,'работа','работы','работ')+'</b> · пробелов закрыто '+P.gaps.filter(g=>g.by).length+' из '+P.gaps.length; }
      else if(t===6) s='<b>'+plural(P.nodes.filter(n=>n.k==='task').length,'задача','задачи','задач')+'</b> из графа · предмет · потребитель · область записи · проверка';
      else { const ts=P.nodes.filter(n=>n.k==='task'); s='готово <b>'+ts.filter(x=>x.st==='done').length+' из '+ts.length+'</b> · в работе '+ts.filter(x=>x.st==='run').length+' · вернулось в план '+ts.filter(x=>x.st==='back').length; }
      noteEl.innerHTML=s; }
    /* ---- подсветка ---- */
    function highlight(){ const sel=S.sel; const near=new Set(), onE=new Set();
      if(sel){ svg.querySelectorAll('path[data-s]').forEach(pth=>{ if(pth.dataset.s===sel||pth.dataset.t===sel){ onE.add(pth); near.add(pth.dataset.s); near.add(pth.dataset.t); } });
        const n=N[sel]; if(n&&n.p) near.add(n.p); (KIDS[sel]||[]).forEach(k=>{ near.add(k); desc(k).forEach(d=>near.add(d)); }); }
      layerEl.querySelectorAll('[data-id],[data-ghost]').forEach(el=>{ const id=el.dataset.id||el.dataset.gid; el.classList.toggle('on',!!sel&&id===sel); el.classList.toggle('near',!!sel&&id!==sel&&near.has(id)); el.classList.toggle('dim',!!sel&&id!==sel&&!near.has(id)); });
      svg.querySelectorAll('path').forEach(pth=>{ const on=onE.has(pth); pth.classList.toggle('on',on); pth.classList.toggle('dim',!!sel&&!on); if(!pth.dataset.ret) pth.setAttribute('marker-end','url(#'+uid+'-ah'+(on?'-on':'')+')'); });
      layerEl.querySelectorAll('.om-lbl').forEach(l=>{ const on=!!sel&&(l.dataset.s===sel||l.dataset.t===sel); l.classList.toggle('on',on); l.classList.toggle('dim',!!sel&&!on); });
    }
    /* ---- панель ---- */
    const chips=a=>'<div class="ct">'+(a&&a.length?a.map(x=>'<span>'+esc(x)+'</span>').join(''):'<span>—</span>')+'</div>';
    function gapsHTML(id){ const gs=S.stage>=5?(GAPS[id]||[]):[]; if(!gs.length) return ''; return '<div class="sec">пробелы · '+gs.length+'</div>'+gs.map(g=>'<div class="gap'+(g.by?' closed':'')+'"><b>'+esc(g.q)+'</b>'+(g.by==='вы'?'<small>закрыли вы — выбор из вариантов</small><div class="opts">'+g.options.map((o,i)=>'<div class="opt" style="padding:5px 0;gap:8px"><span class="o '+(i===g.chosen?'done':'idle')+'"></span><span>'+esc(o)+'</span></div>').join('')+'</div>':g.by?'<small>закрыл '+esc(g.by)+' · '+esc(g.how)+'</small>':'<small>открыт</small>')+'</div>').join(''); }
    function neighbours(id){ const rows=[]; P.edges.forEach(e=>{ if(e.s!==id&&e.t!==id) return; const inc=e.t===id; rows.push({id:inc?e.s:e.t,inc:inc,e:e}); }); return rows; }
    function nodePanel(id){ const n=N[id]; const gk=graphKids(id).length, wk=worksOf(id).length, tk=S.stage>=6?tasksOf(id).map(k=>N[k]):[];
      let h='<div class="hd"><div class="from">'+kindName[n.k]+(n.p?' · '+kindName[N[n.p].k]+' «'+esc(N[n.p].t)+'»':' · операционная карта')+'</div><h3>'+esc(n.t)+'</h3>'+(S.stage>=5?'<span class="pill'+(inHorizon(id)||gk?' acc':'')+'">'+(kidsLabel(id)||'в горизонте')+'</span>':'')+'<span class="x" data-close>×</span></div><div class="bd">';
      h+='<div class="sec">вход</div>'+chips(n.in)+'<div class="sec">действие</div><p>'+esc(S.stage>=3&&n.bh?n.bh:n.t)+'</p><div class="sec">выход</div>'+chips(n.out);
      if(S.stage>=5&&n.r1) h+='<div class="sec">ответ на технический вопрос</div><p>'+esc(n.r1)+'</p>';
      h+=gapsHTML(id);
      const nb=neighbours(id); h+='<div class="sec">соседи · '+nb.length+'</div>'+(nb.length?nb.map(r=>'<div class="nb" data-go="'+r.id+'"><i class="'+(r.e.k==='fail'?'f':'')+'">'+(r.inc?'←':'→')+'</i><div><b>'+esc(N[r.id].t)+'</b><small>'+(r.e.k==='fail'?'отказ':'успех')+' · '+esc(r.e.a)+'</small></div></div>').join(''):'<p>соседей нет</p>');
      if(S.stage>=5&&wk){ h+='<div class="sec">работы горизонта · '+wk+'</div>'+worksOf(id).map(w=>{ const st=workStatus(N[w]); return '<div class="nb" data-go="'+w+'"><i>'+esc(N[w].n)+'</i><div><b>'+esc(N[w].t)+'</b><small>'+st[0]+(st[2]?' · '+esc(st[2]):'')+'</small></div></div>'; }).join(''); }
      if(tk.length){ const d=tk.filter(t=>t.st==='done').length; h+='<div class="sec">задачи · '+(S.stage>=7?d+' из '+tk.length+' готово':tk.length)+'</div>'+tk.map(t=>'<div class="nb" data-go="'+t.id+'"><i>·</i><div><b>'+esc(t.t)+'</b><small>'+taskStatus(t)[0]+'</small></div></div>').join(''); }
      h+='</div><div class="ft">'+(canOpen(id)?'<span class="btn sm p" data-open="'+id+'">Раскрыть · '+kidsLabel(id)+'</span>':'')+'<span class="btn sm ghost" data-close>Закрыть</span></div>'; return h; }
    function workPanel(id){ const w=N[id], st=workStatus(w), eng=workEngine(w), ts=S.stage>=6?tasksOf(id).map(k=>N[k]):[];
      return '<div class="hd"><div class="from">работа · горизонт · '+kindName[N[w.p].k]+' «'+esc(N[w.p].t)+'»</div><h3>'+esc(w.n)+' · '+esc(w.t)+'</h3><span class="pill '+st[1]+'">'+st[0]+'</span><span class="x" data-close>×</span></div><div class="bd">'+
        '<div class="sec">предмет</div>'+chips([w.subject])+'<div class="sec">ответ движка на проект работы</div><p><b>'+eng[0]+'</b>'+(eng[2]?' · '+esc(eng[2])+'<br><span style="color:var(--ink3)">вернётся с адресом — модель уточнит и подаст снова</span>':' · один предмет, один потребитель, область записи названа')+'</p>'+
        (ts.length?'<div class="sec">задачи · '+ts.length+'</div>'+ts.map(t=>'<div class="nb" data-go="'+t.id+'"><i>·</i><div><b>'+esc(t.t)+'</b><small>'+taskStatus(t)[0]+'</small></div></div>').join(''):'')+
        '</div><div class="ft"><span class="btn sm ghost" data-go="'+w.p+'">К '+kindName[N[w.p].k]+'у</span><span class="btn sm ghost" data-close>Закрыть</span></div>'; }
    function taskPanel(id){ const t=N[id], st=taskStatus(t), back=S.stage>=7&&t.st==='back';
      return '<div class="hd"><div class="from">задача плана · работа '+esc(N[t.p].n)+'</div><h3>'+esc(t.t)+'</h3><span class="pill '+st[1]+'">'+st[0]+'</span><span class="x" data-close>×</span></div><div class="bd">'+
        '<div class="kv" style="font-size:12px"><span>предмет</span><b>'+esc(t.subject)+'</b><span>потребитель</span><b>'+esc(t.consumer)+'</b><span>область записи</span><b>'+esc(t.area)+'</b><span>проверка</span><b>'+esc(t.check)+'</b></div>'+
        (back?'<div class="back"><b>Находка исполнителя</b>'+esc(t.finding)+'<p style="margin-top:6px"><b>Переиздана планировщиком</b> · '+esc(t.reissue)+'</p></div>':S.stage>=7&&t.st==='run'?'<div class="sec">сейчас</div><p>реализация → проверки → ревью → коммит</p>':'')+
        '<div class="sec">узел карты</div><div class="nb" data-go="'+t.p+'"><i>→</i><div><b>'+esc(N[t.p].n)+' · '+esc(N[t.p].t)+'</b><small>'+kindName[N[N[t.p].p].k]+' «'+esc(N[N[t.p].p].t)+'»</small></div></div>'+
        '</div><div class="ft"><span class="btn sm ghost" data-close>Закрыть</span></div>'; }
    function reqPanel(id){ const n=N[id];
      if(n.k==='req') return '<div class="hd"><div class="from">требование · концепция</div><h3>'+esc(n.n)+' · '+esc(n.t)+'</h3><span class="x" data-close>×</span></div><div class="bd"><div class="sec">результат</div>'+chips([n.res])+'<div class="sec">условие приёмки</div><p>'+esc(n.acc)+'</p><div class="sec">получатель</div><p>'+esc(N.who.d)+'</p></div><div class="ft"><span class="btn sm ghost" data-close>Закрыть</span></div>';
      return '<div class="hd"><div class="from">'+kindName[n.k]+'</div><h3>'+esc(n.t)+'</h3><span class="x" data-close>×</span></div><div class="bd"><p>'+esc(n.d||P.discovery.idea.kv.map(x=>x[0]+': '+x[1]).join(' · '))+'</p></div><div class="ft"><span class="btn sm ghost" data-close>Закрыть</span></div>'; }
    function stagePanel(){ const s=STG[S.stage]; return '<div class="hd"><div class="from">стадия '+(S.stage+1)+' из '+STG.length+'</div><h3>'+s.name+'<small style="font:10px var(--mono);color:var(--ink3);margin-left:8px">'+s.code+'</small></h3></div><div class="bd"><div class="sec">что видно</div><p>'+s.see+'</p><div class="sec">что можно</div><p>'+s.can+'</p><div class="sec">карта</div><p>та же отрисовка работает на любом проекте: число блоков, подблоков, работ и задач берётся из данных</p></div>'; }
    function renderSide(){ const id=S.sel; if(!id||!N[id]){ side.innerHTML=stagePanel(); return; } const n=N[id]; side.innerHTML=n.k==='task'?taskPanel(id):n.k==='work'?workPanel(id):GRAPH[n.k]?nodePanel(id):reqPanel(id); }
    /* ---- действия ---- */
    function select(id){ S.sel=id; highlight(); renderSide(); }
    function goLevel(n){ S.path=S.path.slice(0,n); S.sel=null; render(); }
    function goNode(id){ const n=N[id]; let p=pathTo(id); if(n.k==='work'||n.k==='task'){ p=pathTo(n.k==='task'?N[id].p:id); if(!S.path.length&&n.k==='work'&&!graphKids(N[id].p).length&&N[N[id].p].k==='block') p=[]; }
      if(JSON.stringify(p)!==JSON.stringify(S.path)){ S.path=p; S.sel=id; render(); } else select(id); }
    function setStage(t){ S.stage=Math.max(0,Math.min(LAST,t)); if(S.stage<5) S.path=[]; if(S.sel&&N[S.sel]&&!visibleKind(N[S.sel].k)&&(S.stage>=2)) S.sel=null; if(S.stage<2||(S.stage>=2&&S.sel&&!N[S.sel])) S.sel=null; if(S.stage>=2&&S.sel&&P.concept.nodes.some(n=>n.id===S.sel)) S.sel=null; render(); }
    if(live){
      app.addEventListener('click',e=>{ const t=e.target; if(t.closest('aside.side')) return; if(VP&&VP.takeSuppress()) return;
        const lv=t.closest('[data-go-level]'); if(lv){ goLevel(+lv.dataset.goLevel); return; }
        const st=t.closest('[data-stage]'); if(st&&!t.closest('[data-range]')){ setStage(+st.dataset.stage); return; }
        if(t.closest('[data-close]')){ S.sel=null; highlight(); renderSide(); return; }
        const op=t.closest('[data-open]'); if(op){ S.path=S.path.concat([op.dataset.open]); S.sel=null; render(); return; }
        const go=t.closest('[data-go]'); if(go){ const id=go.dataset.go; if(G.rects[id]||layerEl.querySelector('[data-gid="'+id+'"]')) select(id); else goNode(id); return; }
        const gh=t.closest('[data-ghost]'); if(gh){ select(gh.dataset.gid); return; }
        const card=t.closest('[data-id]'); if(card){ select(card.dataset.id); return; }
        if(t===canvas||t===view||t===svg||t===under||t===layerEl){ if(S.sel){ S.sel=null; highlight(); renderSide(); } } });
      app.addEventListener('dblclick',e=>{ const card=e.target.closest('[data-id]'); if(card&&canOpen(card.dataset.id)){ S.path=S.path.concat([card.dataset.id]); S.sel=null; render(); } const gh=e.target.closest('[data-ghost]'); if(gh){ S.path=S.path.slice(0,-1); S.sel=gh.dataset.gid; render(); } });
      app.addEventListener('input',e=>{ if(e.target.matches('[data-range]')) setStage(+e.target.value); });
      addEventListener('keydown',e=>{ if(e.key==='Escape'&&S.sel){ S.sel=null; highlight(); renderSide(); } });
      if(window.HX&&HX.passport) HX.passport({title:'План · карта проекта',where:'Проект › План › карта',what:'как любой проект формируется по восьми стадиям: идея → концепция → схема блоков → поведение и фичи → подблоки, пробелы и работы → задачи → исполнение; по карте можно походить: блок → подблоки → работы → задачи',why:'видеть, как всё строится, что из чего выходит и куда идёт — не читая документов стадий',when:'карта растёт с каждой принятой стадией; таймлайн внизу показывает её на любой стадии',expect:'та же отрисовка работает на любом проекте — число блоков, подблоков, работ и задач берётся из данных, слойка строится по связям',risk:'большой проект — много блоков на одном уровне; лечится раскрытием по уровням и горизонтом',ok:'на карте видно, что реализовано, что вернулось в план и почему',fail:'человек не находит, где его пробел или вернувшаяся задача'});
    }
    function levelKey(){ return S.stage<2?'s'+S.stage:S.path.join('>'); }
    /* ---- вид полотна: масштаб · панорама · перетаскивание — общий механизм OMCORE.viewport (его же использует карта пути, скетч 39) ---- */
    function cw(){ return canvas.clientWidth||932; } function chh(){ return canvas.clientHeight||698; }
    function contentBox(){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9, any=false; const add=r=>{ if(!r) return; any=true; x0=Math.min(x0,r.x); y0=Math.min(y0,r.y); x1=Math.max(x1,r.x+r.w); y1=Math.max(y1,r.y+r.h); };
      Object.keys(G.rects).forEach(id=>add(G.rects[id])); (G.C&&G.C.ghosts||[]).forEach(g=>add(g.r));
      if(!any){ const ch=layerEl.querySelector('.om-chat,.om-card'); if(ch) add({x:ch.offsetLeft,y:ch.offsetTop,w:ch.offsetWidth,h:ch.offsetHeight}); const c2=layerEl.querySelector('.om-card.idea'); if(c2) add({x:c2.offsetLeft,y:c2.offsetTop,w:c2.offsetWidth,h:c2.offsetHeight}); }
      if(!any) return {x0:0,y0:0,x1:cw(),y1:chh()}; return {x0:x0-16,y0:y0-40,x1:x1+16,y1:y1+16}; }
    const VP=live?OMCORE.viewport(canvas,view,{box:contentBox,blank:()=>[canvas,view,svg,under,layerEl],
      /* что тащим: призрак — один; карточка — вместе со стопкой работ/задач под ней */
      items:t=>{ const el=t.closest('[data-id],[data-ghost]'); if(!el||!el.closest('[data-nodes]')) return null; const C=G.C;
        if(el.dataset.ghost!=null){ const g=C.ghosts[+el.dataset.ghost]; return [{el:el,r:g.r,key:'ghost:'+el.dataset.ghost}]; }
        const id=el.dataset.id, items=[{el:el,r:G.rects[id],key:id}]; (C.stack[id]||[]).forEach(st=>{ const ch=layerEl.querySelector('[data-id="'+st.id+'"]'); if(ch&&G.rects[st.id]) items.push({el:ch,r:G.rects[st.id],key:st.id}); }); return items; },
      onMove:()=>{ drawEdges(); highlight(); },
      onEnd:items=>{ const key=levelKey(); POS[key]=POS[key]||{}; items.forEach(it=>{ POS[key][it.key]={x:it.r.x,y:it.r.y}; }); },
      onView:V=>{ const z=app.querySelector('[data-zpct]'); if(z) z.textContent=Math.round(V.k*100)+' %'; }}):null;
    function fitView(){ if(VP) VP.fit(); }
    if(live){
      app.addEventListener('click',e=>{ const z=e.target.closest('[data-z]'); if(!z) return; const W=cw(),H=chh(); if(z.dataset.z==='fit') VP.fit(); else VP.zoomAt(W/2,H/2,z.dataset.z==='in'?1.25:.8); });
      /* размер полотна меняется (прототип растягивает окно) — перерисовать и вписать */
      if(window.ResizeObserver){ let w0=0,h0=0,raf=0; new ResizeObserver(()=>{ const w=canvas.clientWidth,h=canvas.clientHeight; if(w===w0&&h===h0) return; w0=w; h0=h; cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>render()); }).observe(canvas); }
    }
    render();
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>render());
    return {state:S,render:render,setStage:setStage};
  }
  document.querySelectorAll('[data-om]').forEach(app=>{ let o={}; try{ o=JSON.parse(app.dataset.om); }catch(e){} const m=mount(app,o); if(o.live) window.OMMAP=m; });
  /* ссылка на кадр: #f=3 */
  const fm=location.hash.match(/f=(\d+)/); if(fm){ const fr=document.querySelectorAll('.frame')[+fm[1]-1]; if(fr) fr.scrollIntoView(); }
})();
