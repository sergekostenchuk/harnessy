/* pour-scene.js — сцена входа Harnessy: графин наливает коньяк в бокал, пока идёт авторизация.
   Один canvas, без библиотек. Контур графина построен по профилю, снятому с образца (полуширина по строкам).
   API: const sc = PourScene(canvas, {onState(mode), onLevel(p), ax, ay});   // ax/ay — куда прижать сцену в полотне, 0…1 (по умолчанию центр)
        sc.start()  — «наливает» (ждём подтверждение; бокал наполняется всё медленнее, до 86 %)
        sc.confirm(cb) — подтверждение пришло: доливает ~1 с, затем cb()
        sc.deny()   — отказ или срок: струя обрывается, коньяк теряет цвет и уходит
        sc.reset()  — вернуть к закрытому графину */
(function(){
  const DW=780, DH=640, TY=566, GX=560;          // кадр сцены, линия стола, ось бокала
  const SB=340/1124, my=y=>(y-695)*SB;           // графин: 340 точек в высоту, ноль — в центре
  const P=a=>a.map(([y,h])=>[my(y),h*SB]);
  // профили [строка образца, полуширина] сверху вниз
  const BODY=P([[262,68],[425,70],[437,75],[453,77.5],[473,83],[493,92.5],[513,103],[533,117.5],[553,138],[573,164.5],[593,190.5],[613,210.5],[633,223],[653,231.5],[673,237],[693,242],[713,245.5],[733,248.5],[753,252.5],[773,256],[793,260],[813,265.5],[833,272],[853,281],[873,290.5],[893,302],[913,314],[933,326],[953,336],[973,344.5],[993,351],[1013,355],[1033,358],[1053,358],[1073,357],[1093,354],[1113,348.5],[1133,340],[1153,326.5],[1173,310],[1193,290],[1204,276],[1216,256.5],[1228,234],[1240,206],[1248,180.5],[1252,155.5],[1256,91]]);
  const CAV=P([[300,50],[470,54],[500,62],[530,80],[558,103],[583,122],[608,145],[633,164],[658,177],[683,186],[708,191],[733,194],[758,196],[783,198],[808,200],[833,204],[858,209],[883,215],[908,223],[933,233],[958,247],[983,259],[1008,273],[1033,281],[1058,287],[1083,288],[1108,286],[1133,265],[1150,225],[1160,160],[1166,60]]);
  const STOP=P([[133,16],[136,47],[139,64.5],[142,76.5],[145,87],[148,94],[151,101],[154,108],[157,111.5],[173,113],[193,111],[213,107],[233,101],[250,96],[259,93]]);
  const COL=P([[259,88],[266,87.5],[272,83.5],[280,78.5],[290,76],[297,75],[437,75]]);
  const LIP=[88*SB*.9, my(259)];                 // точка, с которой льётся
  // бокал-снифтер: [y, полуширина] в координатах сцены
  const BOWL=[[351,62],[362,68],[380,78],[400,88],[420,94.5],[438,96],[455,93],[472,84],[488,68],[500,48],[508,28],[513,12],[516,5]];
  const BIN=BOWL.map(([y,h],i)=>[i?Math.min(y,512):y+1.5,Math.max(0,h-3.2)]);
  const MARK=new Path2D('M5 15c2-9 7 2 9-7M14 8l5 5');

  function shape(c,pr){ const n=pr.length; c.beginPath(); c.moveTo(-pr[0][1],pr[0][0]); c.lineTo(pr[0][1],pr[0][0]);
    for(let i=1;i<n-1;i++){ const a=pr[i],b=pr[i+1]; c.quadraticCurveTo(a[1],a[0],(a[1]+b[1])/2,(a[0]+b[0])/2); }
    c.lineTo(pr[n-1][1],pr[n-1][0]); c.lineTo(-pr[n-1][1],pr[n-1][0]);
    for(let i=n-2;i>=1;i--){ const a=pr[i],b=pr[i-1]; c.quadraticCurveTo(-a[1],a[0],-(a[1]+b[1])/2,(a[0]+b[0])/2); }
    c.closePath(); }
  function sides(c,pr){ const n=pr.length; c.beginPath();
    for(const s of [1,-1]){ c.moveTo(s*pr[0][1],pr[0][0]); for(let i=1;i<n-1;i++){ const a=pr[i],b=pr[i+1]; c.quadraticCurveTo(s*a[1],a[0],s*(a[1]+b[1])/2,(a[0]+b[0])/2); } c.lineTo(s*pr[n-1][1],pr[n-1][0]); } }
  function hwAt(pr,y){ if(y<=pr[0][0]) return pr[0][1]; for(let i=1;i<pr.length;i++) if(y<=pr[i][0]){ const a=pr[i-1],b=pr[i],t=(y-a[0])/((b[0]-a[0])||1); return a[1]+(b[1]-a[1])*t; } return pr[pr.length-1][1]; }
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const hx=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const lg=(g,x0,y0,x1,y1,st)=>{ const r=g.createLinearGradient(x0,y0,x1,y1); for(let i=0;i<st.length;i+=2) r.addColorStop(st[i],st[i+1]); return r; };
  const spaced=(g,s,x,y,step)=>{ const n=s.length; for(let i=0;i<n;i++) g.fillText(s[i],x+(i-(n-1)/2)*step,y); };

  window.PourScene=function(cv,opt){
    opt=opt||{};
    const cx=cv.getContext('2d'), O=document.createElement('canvas'), oc=O.getContext('2d');
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cw=0,ch=0,dpr=1,k=1,ox=0,oy=0,grid=null,dirty=true,T=0,parts=[],rips=[],doneCb=null,lastLv=-1;
    const S={mode:'idle',pose:0,cork:0,p:0,s0:0,s1:0,on:false,flow:1,bad:0,glow:0,tm:0,slosh:9,lx:GX-10};
    // цвет коньяка; при отказе выцветает
    const C=h=>{ if(S.bad<=0) return h; const a=hx(h), b=[86,86,92], q=.82*S.bad; return 'rgb('+((a[0]+(b[0]-a[0])*q)|0)+','+((a[1]+(b[1]-a[1])*q)|0)+','+((a[2]+(b[2]-a[2])*q)|0)+')'; };

    function size(){ cw=Math.max(60,cv.clientWidth); ch=Math.max(60,cv.clientHeight); dpr=Math.min(2,window.devicePixelRatio||1);
      cv.width=O.width=Math.round(cw*dpr); cv.height=O.height=Math.round(ch*dpr);
      k=Math.max(.3,Math.min(1.4,Math.min(cw/DW,ch/DH))); ox=(cw-DW*k)*(opt.ax==null?.5:opt.ax); oy=(ch-DH*k)*(opt.ay==null?.5:opt.ay);
      const t=document.createElement('canvas'); t.width=t.height=Math.round(24*dpr); const tc=t.getContext('2d'); tc.fillStyle='#1c1c20'; tc.fillRect(0,0,Math.max(1,dpr),Math.max(1,dpr)); grid=cx.createPattern(t,'repeat'); dirty=true; }
    const design=g=>g.setTransform(dpr*k,0,0,dpr*k,ox*dpr,oy*dpr);

    function set(m){ S.mode=m; S.tm=0; dirty=true; if(opt.onState) opt.onState(m); }
    function start(){ S.p=0; S.bad=0; S.glow=0; S.slosh=0; parts=[]; rips=[]; doneCb=null; set('pour'); }
    function fire(){ const f=doneCb; doneCb=null; if(f) f(); }
    function confirm(cb){ doneCb=cb||null; if(S.mode!=='pour'&&S.mode!=='finish') start(); if(S.mode==='pour') set('finish'); if(document.hidden) return fire(); setTimeout(fire,2600); }
    function deny(){ if(S.mode==='pour'||S.mode==='finish'){ S.on=false; S.slosh=0; doneCb=null; set('fail'); } }
    function reset(){ S.on=false; S.slosh=0; S.bad=0; doneCb=null; set('idle'); }

    const poseOf=()=>{ const e=ease(S.pose); return {x:200+200.6*e, y:396-152.6*e-22*Math.sin(Math.PI*e), a:110*Math.PI/180*e}; };
    const toW=(B,x,y)=>{ const c=Math.cos(B.a), s=Math.sin(B.a); return [B.x+x*c-y*s, B.y+x*s+y*c]; };
    const levelOf=()=>510-S.p*70;
    const mv=(v,t,r)=>{ const d=t-v; return Math.abs(d)<r?t:v+Math.sign(d)*r; };

    function step(dt){
      T+=dt; S.tm+=dt; S.slosh+=dt;
      const landed=S.on&&S.s1>=1, open=S.mode==='pour'||S.mode==='finish';
      S.cork=mv(S.cork, open?1:(S.pose<.04?0:1), dt/.5);                 // пробку снять до наклона, вернуть после
      const p0=S.pose; S.pose=mv(S.pose, open&&S.cork>.5?1:(open?S.pose:0), dt/1.25); if((p0<.985)!==(S.pose<.985)||(p0>.015)!==(S.pose>.015)) S.slosh=0;
      const tilted=S.pose>.985;
      if(S.mode==='pour'){ S.on=tilted; if(landed) S.p+=(.86-S.p)*(1-Math.exp(-dt*.16)); }
      else if(S.mode==='finish'){ S.on=tilted; if(landed) S.p=Math.min(1,S.p+dt*Math.max(.55,1-S.p)); if(S.p>=1){ S.on=false; set('done'); setTimeout(fire,420); } }
      else if(S.mode==='done'){ S.glow=Math.min(1,S.glow+dt*1.4); }
      else if(S.mode==='fail'){ S.bad=Math.min(1,S.bad+dt*2.6); if(S.tm>.7) S.p=Math.max(0,S.p-dt*.6); }
      else { S.p=Math.max(0,S.p-dt*1.5); S.glow=Math.max(0,S.glow-dt*3); }
      if(S.on){ if(S.s1===0) S.s0=0; S.s1=Math.min(1,S.s1+dt/.28); }
      else if(S.s1>0){ S.s0=Math.min(1,S.s0+dt/.24); if(S.s0>=S.s1){ S.s0=0; S.s1=0; } }
      const fT=S.mode==='finish'?1.3:.42+.58*(1-S.p/.86); S.flow+=(fT-S.flow)*Math.min(1,dt*5);
      const lv=levelOf();
      if(landed){ if(Math.random()<dt*9&&parts.length<10) parts.push({x:S.lx+(Math.random()-.5)*8,y:lv-2,vx:(Math.random()-.5)*90,vy:-50-Math.random()*70,r:.9+Math.random()*1.3});
                  if(Math.random()<dt*3.2&&rips.length<4) rips.push({t:0}); }
      parts=parts.filter(q=>{ q.vy+=460*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; return q.y<lv+3; });
      rips=rips.filter(r=>(r.t+=dt)<.9);
      const n=Math.round(S.p*200); if(n!==lastLv){ lastLv=n; if(opt.onLevel) opt.onLevel(S.p,S.mode); }
    }

    // ── бокал
    function glassBack(g){ g.save(); g.translate(GX,0);
      shape(g,BOWL); g.fillStyle=lg(g,-96,0,96,0,[0,'rgba(255,255,255,.085)',.3,'rgba(255,255,255,.014)',.72,'rgba(255,255,255,.01)',1,'rgba(255,255,255,.065)']); g.fill();
      g.beginPath(); g.ellipse(0,351,62,5,0,Math.PI,2*Math.PI); g.strokeStyle='rgba(255,255,255,.2)'; g.lineWidth=1; g.stroke(); g.restore(); }
    function glassLiquid(g,landed){ if(S.p<=.003) return; const yL=levelOf(); g.save(); g.translate(GX,0); shape(g,BIN); g.clip();
      // прозрачный тёмный коньяк: толща тёмная, светится там, где слой тонкий — у стенок и у дна
      g.fillStyle=lg(g,0,yL,0,514,[0,C('#1d0802'),.55,C('#341003'),1,C('#4a1a05')]); g.fillRect(-110,yL,220,520-yL);
      g.save(); g.beginPath(); g.rect(-110,yL,220,520-yL); g.clip(); g.lineJoin='round';
      for(let i=0;i<16;i++){ const u=i/15, c='#'+[0x6a+(0xf0-0x6a)*u*u,0x28+(0x9a-0x28)*u*u,0x08+(0x3a-0x08)*u*u].map(v=>(v|0).toString(16).padStart(2,'0')).join('');
        sides(g,BIN); g.globalAlpha=(.07+.03*u)*(1-.9*S.bad); g.strokeStyle=C(c); g.lineWidth=58-u*55; g.stroke(); }
      g.globalAlpha=1; g.restore();
      let q=g.createRadialGradient(6,512,2,6,512,74); q.addColorStop(0,'rgba(255,150,46,'+(.6*(1-S.bad)).toFixed(3)+')'); q.addColorStop(.45,'rgba(214,104,24,'+(.26*(1-S.bad)).toFixed(3)+')'); q.addColorStop(1,'rgba(214,104,24,0)'); g.fillStyle=q; g.fillRect(-110,yL,220,520-yL);
      g.fillStyle=lg(g,-96,0,96,0,[0,'rgba(0,0,0,.42)',.4,'rgba(0,0,0,0)',.8,'rgba(255,160,60,0)',1,'rgba(255,160,60,.14)']); g.fillRect(-110,yL,220,520-yL);
      // поверхность — тёмное зеркало с тонкой светлой кромкой
      const rx=hwAt(BIN,yL), ry=Math.max(1,Math.min(6.5,rx*.075)+(landed?.9*Math.sin(T*10):0));
      g.beginPath(); g.ellipse(0,yL,rx,ry,0,0,6.283); g.fillStyle=lg(g,-rx,0,rx,0,[0,C('#160602'),.6,C('#5c270a'),.85,C('#7c380d'),1,C('#3a1505')]); g.fill();
      g.beginPath(); g.ellipse(0,yL,rx,ry,0,Math.PI,6.283); g.strokeStyle='rgba(255,196,128,.16)'; g.lineWidth=.8; g.stroke();
      g.beginPath(); g.ellipse(0,yL,rx,ry,0,0,Math.PI); g.strokeStyle='rgba(255,206,140,'+(.62*(1-.6*S.bad)).toFixed(3)+')'; g.lineWidth=1; g.stroke();
      g.beginPath(); g.ellipse(rx*.38,yL+ry*.15,rx*.3,ry*.34,0,0,6.283); g.fillStyle='rgba(255,214,160,.1)'; g.fill();
      for(const r of rips){ const u=r.t/.9; g.beginPath(); g.ellipse(S.lx-GX,yL,4+u*rx*.8,(1+u*ry)*.9,0,0,6.283); g.strokeStyle='rgba(255,220,180,'+(.4*(1-u)).toFixed(3)+')'; g.lineWidth=1; g.stroke(); }
      g.restore(); }
    function glassFront(g){ g.save(); g.translate(GX,0);
      sides(g,BOWL); g.strokeStyle='rgba(255,255,255,.07)'; g.lineWidth=4.5; g.stroke();
      g.strokeStyle=lg(g,-96,0,96,0,[0,'rgba(255,255,255,.9)',.22,'rgba(255,255,255,.34)',.78,'rgba(255,255,255,.26)',1,'rgba(255,255,255,.72)']); g.lineWidth=1.25; g.stroke();
      g.beginPath(); g.ellipse(0,351,62,5,0,0,Math.PI); g.strokeStyle='rgba(255,255,255,.78)'; g.lineWidth=1.3; g.stroke();
      // блики на чаше
      g.lineCap='round';
      for(const [s,y0,y1,ins,w,a] of [[-1,372,470,12,6,.07],[-1,384,448,11,1.6,.5],[1,392,446,13,4,.06],[1,402,432,12,1.1,.34]]){ g.beginPath(); for(let y=y0;y<=y1;y+=6){ const x=s*(hwAt(BOWL,y)-ins); y===y0?g.moveTo(x,y):g.lineTo(x,y); } g.strokeStyle='rgba(255,255,255,'+a+')'; g.lineWidth=w; g.stroke(); }
      // ножка и основание
      g.beginPath(); g.moveTo(-5,515); g.bezierCurveTo(-4,535,-4.5,548,-9,553); g.quadraticCurveTo(-18,558,-36,559.5); g.lineTo(36,559.5); g.quadraticCurveTo(18,558,9,553); g.bezierCurveTo(4.5,548,4,535,5,515); g.closePath();
      g.fillStyle=lg(g,-36,0,36,0,[0,'rgba(255,255,255,.05)',.36,'rgba(255,255,255,.07)',.46,'rgba(255,255,255,.42)',.56,'rgba(255,255,255,.06)',1,'rgba(255,255,255,.05)']); g.fill();
      if(S.p>0){ g.fillStyle='rgba(176,86,22,'+(.26*S.p*(1-S.bad)).toFixed(3)+')'; g.fill(); }
      g.beginPath(); g.ellipse(0,561,60,6.2,0,0,6.283); g.fillStyle='rgba(255,255,255,.045)'; g.fill();
      g.strokeStyle=lg(g,-60,0,60,0,[0,'rgba(255,255,255,.75)',.3,'rgba(255,255,255,.2)',.7,'rgba(255,255,255,.2)',1,'rgba(255,255,255,.6)']); g.lineWidth=1.1; g.stroke();
      g.restore(); }

    // ── графин
    function bottle(g,B){ g.save(); g.translate(B.x,B.y); g.rotate(B.a);
      shape(g,BODY); g.fillStyle=lg(g,-110,0,110,0,[0,'#202026',.1,'#0c0c0f',.5,'#020203',.88,'#0b0b0e',1,'#26262d']); g.fill();
      // полость: пустая часть и коньяк (поверхность горизонтальна в мире)
      g.save(); shape(g,CAV); g.clip(); g.fillStyle='#050506'; g.fillRect(-120,-180,240,360);
      let y0=1e9,y1=-1e9; for(const q of CAV) for(const s of [1,-1]){ const y=toW(B,s*q[1],q[0])[1]; if(y<y0)y0=y; if(y>y1)y1=y; }
      const fr=.71-.15*S.p, lv=y1-fr*(y1-y0), sl=10*Math.sin(S.slosh*8)*Math.exp(-S.slosh*2.2);
      g.rotate(-B.a); g.translate(-B.x,-B.y);
      g.beginPath(); g.moveTo(B.x-260,lv-sl); g.lineTo(B.x+260,lv+sl); g.lineTo(B.x+260,y1+40); g.lineTo(B.x-260,y1+40); g.closePath(); g.clip();
      g.translate(B.x,B.y); g.rotate(B.a);
      g.fillStyle=lg(g,-88,0,88,0,[0,C('#040102'),.44,C('#0c0302'),.6,C('#280a04'),.76,C('#641f0a'),.9,C('#9c4d1a'),.98,C('#c27a34'),1,C('#d89c54')]); g.fillRect(-120,-180,240,360);
      g.fillStyle=lg(g,0,my(1040),0,my(1168),[0,'rgba(0,0,0,0)',1,'rgba(0,0,0,.45)']); g.fillRect(-120,my(1040),240,60);
      g.rotate(-B.a); g.translate(-B.x,-B.y);
      g.fillStyle=lg(g,0,lv-12,0,lv+16,[0,'rgba(255,170,110,0)',.42,'rgba(255,170,110,.3)',1,'rgba(255,170,110,0)']); g.fillRect(B.x-260,lv-12,520,28);
      g.beginPath(); g.moveTo(B.x-260,lv-sl); g.lineTo(B.x+260,lv+sl); g.strokeStyle='rgba(255,196,150,'+(.55*(1-S.bad)).toFixed(2)+')'; g.lineWidth=1.2; g.stroke();
      g.restore();
      // толстое дно и блики стекла
      g.beginPath(); for(let i=0;i<=20;i++){ const t=-1+i/10, x=t*84, y=my(1176)-Math.cos(t*1.45)*3.2; i?g.lineTo(x,y):g.moveTo(x,y); } g.strokeStyle='rgba(255,255,255,.1)'; g.lineWidth=2.2; g.stroke();
      shape(g,BODY); g.strokeStyle=lg(g,-109,0,109,0,[0,'rgba(255,255,255,.5)',.14,'rgba(255,255,255,.05)',.5,'rgba(255,255,255,0)',.88,'rgba(255,255,255,.04)',1,'rgba(255,255,255,.34)']); g.lineWidth=1.3; g.stroke();
      g.lineCap='round';
      for(const [s,ya,yb,ins,w,a] of [[-1,640,1150,13,7,.045],[-1,700,1090,11,1.5,.3],[1,760,1120,10,1.1,.2],[-1,470,600,6,1.2,.22]]){ g.beginPath(); for(let y=ya;y<=yb;y+=18){ const X=s*(hwAt(BODY,my(y))-ins); y===ya?g.moveTo(X,my(y)):g.lineTo(X,my(y)); } g.strokeStyle='rgba(255,255,255,'+a+')'; g.lineWidth=w; g.stroke(); }
      // надписи на стекле: знак, имя, слово вразрядку, мелкая строка
      const gold=lg(g,0,my(868),0,my(1056),[0,'#f7e6b0',.45,'#dcb866',1,'#b98a3a']);
      g.save(); g.translate(-7,my(868)); g.scale(.6,.6); g.strokeStyle='#e9cd85'; g.lineWidth=2.4; g.lineCap='round'; g.lineJoin='round'; g.stroke(MARK); g.restore();
      g.textAlign='center'; g.textBaseline='middle';
      g.fillStyle=gold; g.font='600 14.5px Fraunces, "Cormorant Garamond", Georgia, serif'; g.fillText('Harnessy',0,my(928));
      g.fillStyle='rgba(246,240,228,.96)'; g.font='500 10.5px Inter, "Helvetica Neue", Arial, sans-serif'; spaced(g,'ENTRÉE',0,my(992),15.4);
      g.fillStyle=gold; g.font='500 4.8px Inter, "Helvetica Neue", Arial, sans-serif'; spaced(g,'VERY SECURE',0,my(1049),5.1);
      // пробегающий блик
      if(S.mode==='idle'||S.mode==='done'){ const q=(T%7)/1.4; if(q<1){ g.save(); shape(g,BODY); g.clip(); g.rotate(.32); const X=-170+340*q; g.fillStyle=lg(g,X-26,0,X+26,0,[0,'rgba(255,255,255,0)',.5,'rgba(255,255,255,.085)',1,'rgba(255,255,255,0)']); g.fillRect(X-26,-260,52,520); g.restore(); } }
      // серебряное горло
      shape(g,COL); g.fillStyle=lg(g,-24,0,24,0,[0,'#77777c',.07,'#0d0d0f',.17,'#f1f1f3',.37,'#ffffff',.45,'#151517',.57,'#1b1b1d',.65,'#a2a2a8',.76,'#f6f6f7',.94,'#ffffff',1,'#8c8c92']); g.fill();
      g.fillStyle=lg(g,0,my(259),0,my(437),[0,'rgba(0,0,0,.42)',.1,'rgba(0,0,0,0)',.9,'rgba(0,0,0,0)',1,'rgba(0,0,0,.5)']); g.fill();
      g.fillStyle='rgba(8,8,10,.6)'; g.fillRect(-23,my(409),46,(415-409)*SB);
      g.fillStyle='rgba(34,34,38,.82)'; g.font='600 3.3px Inter, Arial, sans-serif'; spaced(g,'HARNESSY',5.6,my(386),2.75); spaced(g,'ENTRÉE',5.6,my(402),2.75);
      g.restore(); }
    function stopper(g,B){ const c=ease(S.cork), a0=toW(B,0,my(259)), x=a0[0]+(385-a0[0])*c, y=a0[1]+(TY-a0[1])*c-74*Math.sin(Math.PI*c), r=B.a*(1-c)+.3*Math.sin(Math.PI*c);
      g.save(); g.translate(x,y); g.rotate(r); g.translate(0,-my(259));
      shape(g,STOP); g.fillStyle=lg(g,-34.5,0,34.5,0,[0,'#74767a',.09,'#191a1b',.2,'#8d8c88',.3,'#0c0d0f',.5,'#0b0c0e',.6,'#26282a',.7,'#707378',.8,'#a3a3ad',.9,'#030304',1,'#3a3a3f']); g.fill();
      g.save(); g.clip(); g.fillStyle=lg(g,0,my(133),0,my(182),[0,'rgba(255,255,255,.62)',.3,'rgba(255,255,255,.1)',1,'rgba(255,255,255,0)']); g.fillRect(-40,my(133),80,my(182)-my(133));
      g.fillStyle=lg(g,0,my(236),0,my(259),[0,'rgba(0,0,0,0)',1,'rgba(0,0,0,.55)']); g.fillRect(-40,my(236),80,my(259)-my(236)); g.restore();
      g.strokeStyle='rgba(255,255,255,.2)'; g.lineWidth=.8; g.stroke(); g.restore(); }
    function stream(g,B){ if(S.s1<=S.s0) return; const L=toW(B,LIP[0],LIP[1]), X1=S.lx, yL=levelOf(), n=40, i0=Math.floor(S.s0*n), i1=Math.ceil(S.s1*n), a=[], b=[];
      const pt=t=>{ const u=1-t; return [u*u*L[0]+2*u*t*(L[0]+(X1-L[0])*.8)+t*t*X1, u*u*L[1]+2*u*t*(L[1]+7)+t*t*yL]; };
      for(let i=i0;i<=i1;i++){ const t=i/n, q=pt(t), q2=pt(Math.min(1,t+.01)), q1=pt(Math.max(0,t-.01)); let dx=q2[0]-q1[0], dy=q2[1]-q1[1]; const d=Math.hypot(dx,dy)||1; dx/=d; dy/=d;
        const w=(3.9-2.3*t)*S.flow*(1+.1*Math.sin(t*17-T*14)); a.push([q[0]-dy*w,q[1]+dx*w]); b.push([q[0]+dy*w,q[1]-dx*w]); }
      g.beginPath(); a.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); for(let i=b.length-1;i>=0;i--) g.lineTo(b[i][0],b[i][1]); g.closePath();
      g.fillStyle=lg(g,0,L[1],0,yL,[0,C('#b9772e'),.3,C('#863f0e'),1,C('#592406')]); g.fill();
      g.beginPath(); b.forEach((q,i)=>i?g.lineTo(q[0]-.6,q[1]):g.moveTo(q[0]-.6,q[1])); g.strokeStyle='rgba(255,232,200,.6)'; g.lineWidth=.9; g.stroke();
      g.fillStyle=C('#a45a18'); for(const q of parts){ g.beginPath(); g.arc(q.x,q.y,q.r,0,6.283); g.fill(); } }

    function draw(){
      const B=poseOf(), landed=S.on&&S.s1>=1;
      // слой предметов
      oc.setTransform(1,0,0,1,0,0); oc.clearRect(0,0,O.width,O.height); design(oc);
      glassBack(oc); glassLiquid(oc,landed); stream(oc,B); glassFront(oc); bottle(oc,B); stopper(oc,B);
      // фон
      cx.setTransform(1,0,0,1,0,0); cx.fillStyle='#101012'; cx.fillRect(0,0,cv.width,cv.height); if(grid){ cx.fillStyle=grid; cx.fillRect(0,0,cv.width,cv.height); }
      design(cx);
      let r=cx.createRadialGradient(GX,430,10,GX,430,360); const w=.05+.05*S.p*(1-S.bad)+.1*S.glow*(.85+.15*Math.sin(T*2.2));
      r.addColorStop(0,'rgba(196,124,54,'+w.toFixed(3)+')'); r.addColorStop(1,'rgba(196,124,54,0)'); cx.fillStyle=r; cx.fillRect(-400,-300,DW+800,DH+600);
      r=cx.createRadialGradient(300,70,10,300,70,460); r.addColorStop(0,'rgba(255,255,255,.035)'); r.addColorStop(1,'rgba(255,255,255,0)'); cx.fillStyle=r; cx.fillRect(-400,-300,DW+800,DH+600);
      // тени на столе
      const sh=(x,rx,a)=>{ cx.save(); cx.translate(x,TY+1); cx.scale(1,.085); const q=cx.createRadialGradient(0,0,2,0,0,rx); q.addColorStop(0,'rgba(0,0,0,'+a+')'); q.addColorStop(1,'rgba(0,0,0,0)'); cx.fillStyle=q; cx.beginPath(); cx.arc(0,0,rx,0,6.283); cx.fill(); cx.restore(); };
      sh(200,150,(.7*(1-Math.min(1,S.pose*3))).toFixed(3)); sh(GX,100,.45); if(S.cork>.9) sh(385,60,.5);
      if(S.p>0){ cx.save(); cx.translate(GX,TY+3); cx.scale(1,.1); const q=cx.createRadialGradient(0,0,2,0,0,120); q.addColorStop(0,'rgba(214,112,30,'+(.42*S.p*(1-S.bad)).toFixed(3)+')'); q.addColorStop(1,'rgba(214,112,30,0)'); cx.fillStyle=q; cx.beginPath(); cx.arc(0,0,120,0,6.283); cx.fill(); cx.restore(); }
      // отражение в столе, затем стол и сами предметы
      const tyd=(oy+TY*k)*dpr; cx.save(); cx.setTransform(1,0,0,1,0,0); cx.beginPath(); cx.rect(0,tyd,cv.width,cv.height-tyd); cx.clip(); cx.setTransform(1,0,0,-1,0,2*tyd); cx.globalAlpha=.2; cx.drawImage(O,0,0); cx.restore();
      design(cx); cx.fillStyle=lg(cx,0,TY,0,TY+78,[0,'rgba(16,16,18,.25)',1,'rgba(16,16,18,1)']); cx.fillRect(-400,TY,DW+800,DH);
      cx.fillStyle=lg(cx,20,0,DW-20,0,[0,'rgba(255,255,255,0)',.2,'rgba(255,255,255,.16)',.8,'rgba(255,255,255,.16)',1,'rgba(255,255,255,0)']); cx.fillRect(20,TY,DW-40,1);
      cx.setTransform(1,0,0,1,0,0); cx.drawImage(O,0,0);
    }

    let last=performance.now(), lastDraw=0;
    function loop(now){ requestAnimationFrame(loop); const dt=Math.min(.05,(now-last)/1000); last=now; step(dt);
      const busy=S.mode==='pour'||S.mode==='finish'||(S.pose>0&&S.pose<1)||(S.cork>0&&S.cork<1)||S.s1>0||parts.length||rips.length||(S.mode==='done'&&S.glow<1)||(S.mode==='fail'&&(S.p>0||S.bad<1))||(S.mode==='idle'&&(S.p>0||S.glow>0))||S.slosh<2.5;
      const glint=(S.mode==='idle'||S.mode==='done')&&(T%7)<1.5;
      if(reduce){ if(!dirty&&now-lastDraw<1000) return; } else if(!busy&&!glint&&!dirty&&now-lastDraw<180) return;
      draw(); dirty=false; lastDraw=now; }
    size(); addEventListener('resize',size);
    if(window.ResizeObserver) new ResizeObserver(size).observe(cv);
    if(document.fonts&&document.fonts.load){ document.fonts.load('600 14px Fraunces').then(()=>{dirty=true;}); }
    if(opt.onState) opt.onState('idle'); if(opt.onLevel) opt.onLevel(0,'idle');
    requestAnimationFrame(loop);
    return {start,confirm,deny,reset,state:()=>S.mode,level:()=>S.p};
  };
})();
