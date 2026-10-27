const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.CONTEXT_BROWSER_BASE;
if(!base||!process.env.CONTEXT_BROWSER_USER_DATA)throw Error('Missing isolated browser fixture');
app.setPath('userData',process.env.CONTEXT_BROWSER_USER_DATA);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
 if(app.setActivationPolicy)app.setActivationPolicy('prohibited');app.dock?.hide();
 const win=new BrowserWindow({width:1440,height:900,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)&&!request.url.startsWith(base+'/')}));
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error('renderer: '+message)});
 const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code,true)}catch(error){throw Error('Evaluate '+code+': '+error.message)}};
 const wait=async expression=>{for(let n=0;n<200;n++){if(await evaluate('Boolean('+expression+')'))return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Timed out: '+expression)};
 await win.loadURL(base+'/sketches/proto/01-chat.html');
 await wait("window.LIVE?.H.on&&!LIVE.H.snapshotOnly&&!document.documentElement.hasAttribute('data-live-pending')");
 await evaluate("(async()=>{LIVE.S.ui.pane='worker';LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});dispatchEvent(new Event('live:status'))})()");
 await wait("LIVE.H.pane?.id==='worker'&&document.querySelector('.frame.cur [data-ctx]')&&document.querySelector('[data-context-transfer=compressed]')");
 const event=await evaluate("document.querySelector('[data-context-transfer=compressed]').textContent");if(!event.includes('Дословно 1 из 2')||!event.includes('не токенизатор'))throw Error('Transfer event lost facts: '+event);
 for(const [width,height] of [[1440,900],[1440,760],[1100,800],[390,844]]){
  win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await wait(`document.documentElement.hasAttribute('data-m')===${width<760}`);
  await evaluate("document.querySelector('[data-context-transfer=compressed]').scrollIntoView({block:'center'})");await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  if(process.env.HARNESSY_TEST_SHOTS){const image=await win.webContents.capturePage();fs.writeFileSync(path.join(process.env.HARNESSY_TEST_SHOTS,'event-'+width+'x'+height+'.png'),image.resize({width,height}).toPNG())}
 }
 win.setContentSize(1440,900);await wait('innerWidth===1440&&innerHeight===900');
 await evaluate("(()=>{window.__ctxOpenBinding=LIVE.sendBinding();window.__ctxCloses=[];const close=HX.close;HX.close=function(){window.__ctxCloses.push(new Error().stack);return close.apply(this,arguments)};document.querySelector('.frame.cur [data-ctx]').click()})()");
 await wait("document.querySelector('[data-context-part=instructions] summary')?.textContent.includes('есть')&&document.querySelector('[data-context-part=documents] summary')?.textContent.includes('1')");
 try{await wait("document.querySelector('.ovl.on .panel.open .inner')&&Number(getComputedStyle(document.querySelector('.ovl.on .panel .inner')).opacity)>0.99")}catch(error){throw Error(error.message+'; state: '+JSON.stringify(await evaluate("({overlays:[...document.querySelectorAll('.ovl')].map(o=>({classes:o.className,panel:o.querySelector('.panel')?.className,opacity:getComputedStyle(o.querySelector('.inner')).opacity})),binding:LIVE.sendBinding(),opened:window.__ctxOpenBinding,closes:window.__ctxCloses,instance:LIVE.H.liveStatus?.trace?.instanceId,connected:LIVE.H.on})")))}
 await evaluate("dispatchEvent(new Event('live:status'))");if(!await evaluate("!!document.querySelector('.ovl.on [data-context-parts]')"))throw Error('A status update closed the context card');
 const facts=await evaluate("[...document.querySelectorAll('.ctx51-part summary')].map(n=>n.textContent)");
 if(!facts.some(s=>s.includes('Сохранённые сообщения')&&s.includes('3'))||!facts.some(s=>s.includes('Вложения')&&s.includes('1'))||!facts.some(s=>s.includes('Сводка соседей')&&s.includes('включена')))throw Error('Unexpected facts: '+JSON.stringify(facts));
 const history=await evaluate("document.querySelector('[data-ctab=history]')?.textContent");if(!history?.includes('2'))throw Error('Expected two saved history messages: '+history);
 await evaluate("document.querySelectorAll('.ctx51-part').forEach(n=>n.open=true)");
 for(const [width,height] of [[1440,900],[1440,760],[1100,800],[390,844]]){
  win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await wait(`document.documentElement.hasAttribute('data-m')===${width<760}`);
  await evaluate("document.querySelector('.ctx51-card').scrollIntoView({block:'start'})");await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await wait(`(()=>{const r=document.querySelector('.ctx51-card').getBoundingClientRect();return r.left>=0&&r.right<=${width}+1})()`);
  const geometry=await evaluate(`(()=>{const p=document.querySelector('.ovl.on .panel'),c=document.querySelector('.ctx51-card'),r=c.getBoundingClientRect();return {left:r.left,right:r.right,panelScroll:p.scrollHeight>p.clientHeight||p.querySelector('.inner').scrollHeight>p.querySelector('.inner').clientHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth}})()`);
  if(geometry.left<0||geometry.right>width+1||geometry.pageOverflow||!geometry.panelScroll)throw Error('Card does not fit or scroll at '+width+'x'+height+': '+JSON.stringify(geometry));
  if(process.env.HARNESSY_TEST_SHOTS){const image=await win.webContents.capturePage();fs.writeFileSync(path.join(process.env.HARNESSY_TEST_SHOTS,'context-'+width+'x'+height+'.png'),image.resize({width,height}).toPNG())}
 }
 console.log('CONTEXT_BROWSER_OK');win.close();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
