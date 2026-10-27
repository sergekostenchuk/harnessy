const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setPath('userData',process.env.MODEL_DESIGN_PROFILE);
app.whenReady().then(async()=>{
  if(app.dock)app.dock.hide();
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  const output=process.env.MODEL_DESIGN_SCREENSHOTS;
  if(output)fs.mkdirSync(output,{recursive:true});
  for(const [width,height] of [[1440,900],[1440,760],[1100,800],[390,844]]){
    const win=new BrowserWindow({show:false,width,height,useContentSize:true,webPreferences:{sandbox:true}});
    const js=code=>win.webContents.executeJavaScript(code);
    const shot=async name=>{if(output)fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG())};
    try{
      win.webContents.debugger.attach('1.3');
      await win.loadFile(process.env.MODEL_DESIGN_FILE,{hash:'only=model-change-spec'});
      await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const result=await js(`(()=>{
        const root=document.querySelector('#model-change-spec');
        const states=[...root.querySelectorAll('[data-mc-state]')];
        const bounds=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,client:el.clientWidth,scroll:el.scrollWidth}};
        return {pageScroll:document.documentElement.scrollWidth,section:bounds(root),
          rows:states.map(s=>{const b=s.querySelector('.mc-model b'),note=s.querySelector('.mc-status'),rights=s.querySelector('.mc-rights'),discussion=s.querySelector('.mc-discussion'),track=discussion.querySelector('.tog');return {state:s.dataset.mcState,bar:bounds(s.querySelector('.cx-bot')),model:bounds(s.querySelector('.mc-model')),text:bounds(b),label:s.querySelector('.mc-model').getAttribute('aria-label'),note:note&&getComputedStyle(note).display!=='none'?note.textContent:'',rights:{name:rights.getAttribute('aria-label'),title:rights.title,role:rights.getAttribute('role'),svg:!!rights.querySelector('svg')},discussion:{name:discussion.getAttribute('aria-label'),title:discussion.title,role:discussion.getAttribute('role'),checked:discussion.getAttribute('aria-checked'),track:!!track&&getComputedStyle(track).display!=='none',svg:!!discussion.querySelector('svg')},seg:!!s.querySelector('.tc-seg'),effort:!!s.querySelector('.mc-effort')}}),
          events:[...root.querySelectorAll('[data-mc-event]')].map(e=>({text:e.textContent,time:e.querySelector('time').title})),
          saving:root.querySelector('[data-mc-state="saving"] .mc-save').textContent,
          savingBounds:bounds(root.querySelector('[data-mc-state="saving"] .mc-save')),
          error:root.querySelector('[data-mc-state="failed"] [role="alert"]').textContent};
      })()`);
      assert.ok(result.pageScroll<=width,JSON.stringify(result));
      assert.ok(result.section.scroll<=result.section.client+1,JSON.stringify(result));
      assert.equal(result.rows.length,3);
      for(const row of result.rows){assert.ok(row.bar.scroll<=row.bar.client+1,JSON.stringify(row));assert.ok(row.model.left>=0&&row.model.right<=width,JSON.stringify(row));assert.match(row.label,/Fable/);if(row.text.scroll>row.text.client+1)assert.match(row.note,/Fable · (Codex|Claude Code)/,JSON.stringify(row));assert.deepEqual(row.rights,{name:'Права · Всё без вопросов',title:'Права · Всё без вопросов',role:'button',svg:true});assert.deepEqual(row.discussion,{name:'Обсуждение',title:'Обсуждение · выключено',role:'switch',checked:'false',track:true,svg:true});assert.equal(row.seg,true);assert.equal(row.effort,true)}
      assert.equal(result.events.length,2);assert.match(result.events[0].text,/Claude Code.*Codex/);assert.match(result.events[1].text,/место/);
      for(const event of result.events)assert.match(event.time,/октября 2026/);
      assert.match(result.saving,/сохраняем/);assert.match(result.error,/Не удалось сохранить/);
      const savingRow=result.rows.find(row=>row.state==='saving');assert.ok(result.savingBounds.left>=savingRow.model.left&&result.savingBounds.right<=savingRow.model.right,JSON.stringify(result));
      await shot(`${width}x${height}.png`);
      await js("document.querySelector('[data-mc-state=failed]').scrollIntoView({block:'end'})");
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await shot(`${width}x${height}-failure.png`);
      await js("document.querySelector('[data-mc-state=saving] .mc-model').focus()");
      assert.equal(await js("document.activeElement===document.querySelector('[data-mc-state=saving] .mc-model')"),true);
      await js("document.querySelector('[data-mc-state=saving] .mc-discussion').focus()");
      const key=async(name,code,n)=>{const args={key:name,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n};await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'rawKeyDown',...args});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',...args})};
      const toggleState=()=>js(`(()=>{const t=document.querySelector('[data-mc-state=saving] .mc-discussion');return [t.getAttribute('aria-checked'),t.classList.contains('on'),t.querySelector('.tog').classList.contains('on'),t.title,document.activeElement===t]})()`);
      await key(' ','Space',32);assert.deepEqual(await toggleState(),['true',true,true,'Обсуждение · включено',true]);
      await key('Enter','Enter',13);assert.deepEqual(await toggleState(),['false',false,false,'Обсуждение · выключено',true]);
      console.log(`${width}x${height}: no overflow; feed, saving and failure visible`);
    }finally{win.close()}
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
