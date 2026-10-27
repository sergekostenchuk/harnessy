const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.MODEL_CHANGE_BASE,profile=process.env.MODEL_CHANGE_PROFILE;
if(!base||!profile)throw Error('Missing isolated model-change fixture');
app.setPath('userData',profile);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
  app.setActivationPolicy?.('prohibited');app.dock?.hide();
  const win=new BrowserWindow({width:1440,height:900,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,_level,message)=>console.error('renderer:',message));
  win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)&&!request.url.startsWith(base+'/')||request.url===base+'/api/onboard'}));
  const js=code=>win.webContents.executeJavaScript(code,true);
  const wait=async expression=>{for(let n=0;n<200;n++){if(await js('Boolean('+expression+')'))return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Timed out: '+expression)};
  const clickWhen=selector=>wait(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});if(!target)return false;target.click();return true})()`);
  const sizes=[[1440,900],[1440,760],[1100,800],[390,844]],out=process.env.HARNESSY_MODEL_CHANGE_SHOTS;
  if(out)fs.mkdirSync(out,{recursive:true});
  const shots=async state=>{for(const [width,height] of sizes){win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const layout=await js(`(()=>{const b=document.querySelector('.frame.cur .box'),bar=b.querySelector('.cx-bot'),chip=bar.querySelector('[data-cx=model]'),r=chip.getBoundingClientRect();return {page:document.documentElement.scrollWidth,bar:bar.scrollWidth,client:bar.clientWidth,left:r.left,right:r.right,name:chip.getAttribute('aria-label'),status:b.querySelector('.cx-model-status').textContent}})()`);
    if(layout.page>width||layout.bar>layout.client+1||layout.left<0||layout.right>width||!layout.name)throw Error(state+' '+width+' layout: '+JSON.stringify(layout));
    if(out)fs.writeFileSync(path.join(out,state+'-'+width+'x'+height+'.png'),(await win.webContents.capturePage()).toPNG());
  }};
  try{
    await win.loadURL(base+'/sketches/proto/01-chat.html');
    await wait("window.LIVE?.H.on&&!LIVE.H.snapshotOnly&&!document.documentElement.hasAttribute('data-live-pending')");
    await js("(async()=>{LIVE.S.ui.pane='worker';LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});CX.render()})()");
    await wait("LIVE.H.pane?.id==='worker'&&!!document.querySelector('.frame.cur [data-cx=model]')");
    // Delay the real fixture API; no provider or owner project is contacted.
    await js(`(()=>{const original=window.fetch.bind(window),models=[{id:'w1',label:'Первая модель'},{id:'claude-fable-5-1',label:'Fable 5.1'}],reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});LIVE.H.models.claude=models;LIVE.H.turnModes.claude={...LIVE.H.turnModes.claude,read:{ok:true}};window.__saveMode='hold';window.fetch=async(url,init)=>{const target=String(url);if(target==='/api/providers/catalog')return reply({ok:true,providers:[{id:'claude',title:'Claude Code',kind:'subscription',installed:true,checking:false,models}]});if(target==='/api/status'){const result=await original(url,init),status=await result.json();status.models.claude=models;status.turnModes.claude={...status.turnModes.claude,read:{ok:true}};return reply(status,result.status)}if(target.startsWith('/api/panes/worker')&&init?.method==='POST'){if(window.__saveMode==='hold')return new Promise(resolve=>{window.__release=async()=>{const response=await original(url,init);window.__receipt=await response.clone().json();resolve(response)}});if(window.__saveMode==='deny')return reply({ok:false,error:'нет доступа'},409)}return original(url,init)}})()`);
    await clickWhen('.frame.cur [data-cx=model]');await clickWhen('[data-cx-model=claude-fable-5-1][data-cx-vendor=claude]:not([disabled])');
    try{await wait("document.querySelector('.frame.cur [data-cx=model][aria-busy=true]')&&window.__release")}catch(error){const details=await js("({pane:LIVE.H.pane?.model,status:document.querySelector('.cx-model-status')?.textContent,toast:document.querySelector('.live-toast')?.textContent,menu:document.querySelector('.cx-pop')?.innerText})");throw Error(error.message+'; state: '+JSON.stringify(details))}
    if(await js("LIVE.S.chat.some(m=>m.src==='model-change')"))throw Error('Event appeared before receipt');await js('CX.close(false)');await shots('saving');
    await js('window.__release()');try{await wait("LIVE.H.pane.model==='claude-fable-5-1'&&document.querySelector('.live-model-change')")}catch(error){const details=await js("({pane:LIVE.H.pane?.model,chat:LIVE.S.chat.filter(m=>m.src==='model-change'),receipt:window.__receipt,status:document.querySelector('.cx-model-status')?.textContent,toast:document.querySelector('.live-toast')?.textContent})");throw Error(error.message+'; state: '+JSON.stringify(details))}await wait("!document.querySelector('.live-toast.on')");await shots('confirmed');
    await js("window.__saveMode='deny';LIVE.toast('Модель места «Воркер»: Fable')");await clickWhen('.frame.cur [data-cx=model]');await clickWhen('[data-cx-model=w1][data-cx-vendor=claude]:not([disabled])');await wait("document.querySelector('.frame.cur .cx-model-status[role=alert]')?.textContent.includes('нет доступа')");
    if(await js("LIVE.H.pane.model!=='claude-fable-5-1'||LIVE.S.chat.filter(m=>m.src==='model-change').length!==1"))throw Error('Denied selection changed model or produced event');
    if(!await js("document.querySelector('.live-toast')?.textContent.includes('Модель не изменена')"))throw Error('An earlier success toast hid the refusal');await js('CX.close(false)');await wait("!document.querySelector('.live-toast.on')");await shots('failed');
    // The mobile confirmed label must survive a real page reload, including
    // the provider when another provider has the same model name.
    win.setContentSize(390,844);await win.loadURL(base+'/sketches/proto/01-chat.html');
    await wait("window.LIVE?.H.on&&!LIVE.H.snapshotOnly&&!document.documentElement.hasAttribute('data-live-pending')");
    await js("(async()=>{LIVE.S.ui.pane='worker';LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});CX.render()})()");
    await wait("LIVE.H.pane?.id==='worker'&&LIVE.H.pane.model==='claude-fable-5-1'");
    const mobile=await js(`(()=>{const box=document.querySelector('.frame.cur .box'),status=box.querySelector('.cx-model-status'),chip=box.querySelector('[data-cx=model]'),rect=status.getBoundingClientRect();return {text:status.textContent,hidden:status.hidden,display:getComputedStyle(status).display,width:rect.width,aria:chip.getAttribute('aria-label'),page:document.documentElement.scrollWidth}})()`);
    if(mobile.hidden||mobile.display==='none'||mobile.width<=0||mobile.page>390||!mobile.text.includes('Fable 5.1 · Claude Code')||!mobile.aria.includes('Fable 5.1 · Claude Code'))throw Error('mobile reload confirmed model: '+JSON.stringify(mobile));
    if(out)fs.writeFileSync(path.join(out,'confirmed-reload-390x844.png'),(await win.webContents.capturePage()).toPNG());
    // The busy mobile row keeps the confirmed model and provider accessible,
    // even though the extra visible line is temporarily compacted.
    await js('LIVE.busy=()=>true;CX.render()');
    const busy=await js(`(()=>{const box=document.querySelector('.frame.cur .box'),bar=box.querySelector('.cx-bot'),model=bar.querySelector('[data-cx=model]'),queue=bar.querySelector('.cx-queue-label'),status=box.querySelector('.cx-model-status'),rects=[...bar.children].map(n=>n.getBoundingClientRect()),stop=bar.querySelector('.cx-stop').getBoundingClientRect();return {aria:model.getAttribute('aria-label'),title:model.title,queue:queue.getAttribute('aria-label'),role:queue.getAttribute('role'),status:getComputedStyle(status).display,oneRow:rects.every(r=>Math.abs((r.top+r.bottom-stop.top-stop.bottom)/2)<2),width:bar.scrollWidth,client:bar.clientWidth}})()`);
    if(!busy.aria.includes('Fable 5.1 · Claude Code')||busy.title!==busy.aria||busy.queue!=='Отправить после текущего хода'||busy.role!=='img'||busy.status!=='none'||!busy.oneRow||busy.width>busy.client+1)throw Error('mobile busy model: '+JSON.stringify(busy));
    await js('LIVE.busy=()=>false;CX.render()');
    if(await js("getComputedStyle(document.querySelector('.frame.cur .cx-model-status')).display==='none'"))throw Error('mobile confirmed model did not return after the turn');
    console.log('model change: saving, confirmed, refusal and four layouts verified; mobile reload confirmed');
  }finally{win.close()}
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
