// main.js — оболочка Harnessy (Electron). Окно вокруг прототипа, который отдаёт харнесс ~/HARNESS на :3777.
// Если харнесс не поднят — запускает его сам (run.sh) и ждёт. Окно без Node внутри: contextIsolation + sandbox.
const { app, BrowserWindow, shell, nativeTheme, ipcMain, dialog, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const START = process.env.HARNESSY_URL || 'http://localhost:3777/sketches/proto/10-new-chat.html';
const ORIGIN = new URL(START).origin;
const HARNESS = process.env.HARNESS_DIR || __dirname;   // каталог лаунчера движка ui/desktop/run.sh
const DARK = '#0a0a0b';

app.setName('Harnessy');
nativeTheme.themeSource = 'dark';
if (!app.requestSingleInstanceLock()) app.quit();

async function harnessUp() {
  try { const r = await fetch(ORIGIN + '/api/status', { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}
async function ensureHarness(log) {
  if (await harnessUp()) return true;
  const run = path.join(HARNESS, 'run.sh');
  if (!fs.existsSync(run)) { log('нет ' + run); return false; }
  log('харнесс не отвечает — запускаю ' + run);
  const logs = path.join(HARNESS, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const out = fs.openSync(path.join(logs, 'server-desktop.log'), 'a');
  spawn(run, [], { cwd: HARNESS, detached: true, stdio: ['ignore', out, out] }).unref();
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); if (await harnessUp()) return true; }
  return false;
}
const offline = reason => 'data:text/html;charset=utf-8,' + encodeURIComponent(
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Harnessy</title><style>
  body{margin:0;background:${DARK};color:#ececee;font:14px/1.5 Inter,-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh}
  .c{max-width:460px;padding:28px 32px;border:1px solid #2d2d32;border-radius:16px;background:#141416}
  .e{font:10.5px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#66666e;margin-bottom:10px}
  h1{font-size:22px;margin:0 0 8px;letter-spacing:-.01em}p{color:#9a9aa2;margin:0 0 6px}code{color:#d89c54}</style></head>
  <body><div class="c"><div class="e">harnessy · оболочка</div><h1>Харнесс не отвечает</h1>
  <p>Окно ждёт сервер на <code>${ORIGIN}</code>.</p><p>${reason}</p><p>Запустите в Терминале: <code>~/HARNESS/run.sh</code> и нажмите ⌘R.</p></div></body></html>`);

const { contextMenuTemplate } = require('./context-menu.js');
const contextMeta = new WeakMap();
ipcMain.on('harnessy:context-meta', (event, value) => {
  const text = value && typeof value.text === 'string' ? value.text.slice(0, 100000) : '';
  contextMeta.set(event.sender, { quote: value && value.quote === true, image: value && value.image === true, text });
  event.returnValue = true;
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, title: 'Harnessy', backgroundColor: DARK, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },   // preload: только выбор папки (Finder)
  });
  const log = m => console.log('[harnessy] ' + m);
  win.once('ready-to-show', () => win.show());
  // всё, что не наш адрес, — во внешний браузер
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(ORIGIN)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith('data:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('page-title-updated', e => e.preventDefault());     // в заголовке окна всегда «Harnessy»
  win.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    const template = contextMenuTemplate(params, contextMeta.get(win.webContents), {
      quote: text => win.webContents.send('harnessy:quote-selection', text),
      copyImage: () => win.webContents.copyImageAt(params.x, params.y),
    });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
  if (process.env.HARNESSY_SHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => {   // кадр окна в файл — для проверки без доступа к экрану; ОДИН раз: иначе любая следующая страница перезапишет кадр (урок 07.10)
    try { fs.writeFileSync(process.env.HARNESSY_SHOT, (await win.webContents.capturePage()).toPNG()); log('кадр: ' + process.env.HARNESSY_SHOT); } catch (e) { log('кадр не снят: ' + e.message); } }, 1800));
  const ok = await ensureHarness(log);
  await win.loadURL(ok ? START : offline('За 20 секунд сервер не поднялся.'));
  log((ok ? 'открыт ' : 'офлайн-страница; ждали ') + START);
}
// выбор папки проекта системным диалогом (Finder): страница просит через preload (window.harnessy.pickFolder); новую папку создают кнопкой диалога
ipcMain.handle('harnessy:pick-folder', async (e, o) => {
  o = o || {};
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { title: o.title || 'Папка проекта', buttonLabel: o.button || 'Выбрать', message: o.message || '',
    defaultPath: (o.defaultPath && fs.existsSync(o.defaultPath)) ? o.defaultPath : os.homedir(), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => app.quit());
