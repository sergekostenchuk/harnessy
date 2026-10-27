const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.STREAM_BROWSER_BASE;
if(!base||!process.env.STREAM_BROWSER_USER_DATA)throw Error('Missing isolated browser fixture');
app.setPath('userData',process.env.STREAM_BROWSER_USER_DATA);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
 if(app.setActivationPolicy)app.setActivationPolicy('prohibited');app.dock?.hide();
 const win=new BrowserWindow({width:1440,height:900,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.session.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)&&!request.url.startsWith(base+'/')}));
 const evaluate=code=>win.webContents.executeJavaScript(code,true);
 const wait=async expression=>{for(let n=0;n<200;n++){if(await evaluate('Boolean('+expression+')'))return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Timed out: '+expression)};
 await win.loadURL(base+'/sketches/proto/01-chat.html');
 await wait("window.LIVE?.H.on&&!LIVE.H.snapshotOnly&&!document.documentElement.hasAttribute('data-live-pending')");
 await evaluate("(async()=>{LIVE.S.ui.pane='worker';LIVE.S.ui.direct={worker:true};LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});CX.render()})()");
 await wait("LIVE.H.pane?.id==='worker'&&!!document.querySelector('.frame.cur .live-in')");
 console.log('STREAM_START');await wait("document.querySelector('.frame.cur .live-cur .md-body')?.textContent.includes('ВИДИМЫЙ')");
 await evaluate("(async()=>{LIVE.S.ui.pane='peer';LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});CX.render()})()");
 const other=await evaluate("({pane:LIVE.H.pane?.id,busy:LIVE.busy(),stop:!!document.querySelector('.frame.cur [data-cx=stop]')})");if(other.pane!=='peer'||other.busy||other.stop)throw Error('Another place inherited the running turn: '+JSON.stringify(other));
 await evaluate("(async()=>{LIVE.S.ui.pane='worker';LIVE.pickPane();LIVE.hStatus();await LIVE.loadChat({onboard:false});CX.render()})()");
 await wait("document.querySelector('.frame.cur .live-cur .md-body')?.textContent.includes('ВИДИМЫЙ')");
 await evaluate(`(()=>{const body=document.querySelector('.frame.cur .live-cur .md-body'),text=body.querySelector('p')?.firstChild||body.firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,7);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);window.__streamText=text;const feed=document.querySelector('.frame.cur .feed');feed.scrollTop=0;if(feed.scrollHeight<=feed.clientHeight)throw Error('Fixture does not scroll');})()`);
 console.log('STREAM_CONTINUE');await wait("document.querySelector('.frame.cur .live-cur .md-body')?.textContent.includes('продолжение')");
 const checked=await evaluate(`(()=>{const body=document.querySelector('.frame.cur .live-cur .md-body'),feed=document.querySelector('.frame.cur .feed');return {selection:getSelection().toString(),same:body.contains(window.__streamText),top:feed.scrollTop,jump:!!document.querySelector('.frame.cur .live-jump:not([hidden])')}})()`);
 if(checked.selection!=='ВИДИМЫЙ'||!checked.same||checked.top!==0||!checked.jump)throw Error('Stream changed selection or reader position: '+JSON.stringify(checked));
 await evaluate(`(()=>{const box=document.querySelector('.frame.cur .box'),ta=box.querySelector('.live-in');ta.value='Сообщение после текущего хода';ta.dispatchEvent(new Event('input',{bubbles:true}));box.querySelector('[data-cx="go"]').click()})()`);
 await wait("document.querySelector('.frame.cur .live-queue-wait')?.textContent.includes('В очереди')");
 const controls=await evaluate(`(()=>{const box=document.querySelector('.frame.cur .box');return {stop:!!box.querySelector('[data-cx="stop"]'),queue:box.textContent.includes('после текущего хода')}})()`);if(!controls.stop||!controls.queue)throw Error('Missing separate stop or queue action');
 await evaluate("(async()=>{LIVE.S.ui.pane='peer';LIVE.pickPane();await LIVE.loadChat({onboard:false});LIVE.S.ui.pane='worker';LIVE.pickPane();await LIVE.loadChat({onboard:false});CX.render()})()");
 if(!await evaluate("document.querySelector('.frame.cur .live-queue-wait')?.textContent.includes('В очереди')")){const state=await evaluate("({pane:LIVE.H.pane?.id,active:LIVE.H.active,chat:LIVE.S.chat.map(m=>({role:m.role,text:m.text,seq:m.seq,journalSeq:m.journalSeq,queued:m.queued}))})");throw Error('Confirmed queued message disappeared after switching chats: '+JSON.stringify(state))}
 await evaluate(`(()=>{const body=document.querySelector('.frame.cur .live-cur .md-body'),text=body.querySelector('p')?.firstChild||body.firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,7);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);window.__streamText=text})()`);
 await evaluate("document.querySelector('.frame.cur .live-jump:not([hidden])')?.click()");
 for(const [width,height] of [[1440,900],[1440,760],[1100,800],[390,844]]){win.setContentSize(width,height);await wait(`innerWidth===${width}&&innerHeight===${height}`);await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");await evaluate("(()=>{document.querySelectorAll('.live-toast').forEach(n=>n.remove());document.querySelector('.frame.cur .live-cur').scrollIntoView({block:'end',behavior:'instant'})})()");await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");if(width===390){const fits=await evaluate("(()=>{const box=document.querySelector('.frame.cur .box').getBoundingClientRect(),stop=document.querySelector('.frame.cur .cx-stop').getBoundingClientRect(),label=document.querySelector('.frame.cur .cx-queue-label').getBoundingClientRect(),go=document.querySelector('.frame.cur .cx-go').getBoundingClientRect();return stop.left>=box.left&&label.right<=go.left&&go.right<=box.right&&document.documentElement.scrollWidth<=innerWidth})()");if(!fits)throw Error('Mobile composer controls overflow or overlap')}if(process.env.HARNESSY_TEST_SHOTS){const image=await win.webContents.capturePage();fs.writeFileSync(path.join(process.env.HARNESSY_TEST_SHOTS,'stream-'+width+'x'+height+'.png'),image.resize({width,height}).toPNG())}}
 console.log('STREAM_FINISH');await wait("!document.querySelector('.frame.cur .live-cur')");
 const result=await evaluate(`(()=>({selection:getSelection().toString(),same:!!window.__streamText?.isConnected}))()`);if(result.selection!=='ВИДИМЫЙ'||!result.same)throw Error('Completion changed selected text: '+JSON.stringify(result));
 console.log('Stream selection, scroll and queue confirmed.');win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
