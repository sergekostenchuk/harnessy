// check-preload.js — проверка моста оболочки без экрана: скрытое окно с preload открывает страницу, смотрит window.harnessy.pickFolder,
// открывает меню проекта → «Создать проект» и снимает кадр. Запуск: electron check-preload.js <url> <out.png>
const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path'), os = require('os');
const [url, out] = process.argv.slice(2);
app.setPath('userData', path.join(os.tmpdir(), 'harnessy-check'));
const wait = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js'), offscreen: true } });
  await win.loadURL(url); await wait(2500);
  const js = s => win.webContents.executeJavaScript(s);
  console.log('pickFolder:', await js("typeof (window.harnessy && window.harnessy.pickFolder)"));
  console.log('chip:', await js("(()=>{ const a=document.querySelector('[data-cx=\"folder\"]'); if(!a) return 'нет чипа'; a.click(); return 'клик'; })()"));
  await wait(1500);
  console.log('mkdir:', await js("(()=>{ const a=document.querySelector('[data-cx-nav=\"mkdir\"]'); if(!a) return 'нет пункта'; a.click(); return 'клик'; })()"));
  await wait(700);
  console.log('finder row:', await js("(()=>{ const r=document.querySelector('[data-cx-finder]'); return r? r.textContent.trim() : 'нет'; })()"));
  if (out) fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  app.quit();
});
