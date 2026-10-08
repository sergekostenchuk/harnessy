// clip.js — рендер клипа из живой страницы: скрытый Electron шагает анимацию вручную (window.__step), кадры → ffmpeg → mp4.
// Запуск: electron clip.js <url> <out.mp4> [w] [h] [fps] [seconds] [startState]
const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const [url, out, w, h, fps, secs, startState] = process.argv.slice(2); const W = +w || 1920, H = +h || 1080, FPS = +fps || 24, N = Math.round((+secs || 10) * FPS);
app.setPath('userData', path.join(os.tmpdir(), 'harnessy-shot'));
app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnessy-clip-')); const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(FPS); await win.loadURL(url + (url.includes('?') ? '&' : '?') + 'manual=1&w=' + W + '&h=' + H);
  for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.__ready')); i++) await new Promise(r => setTimeout(r, 200));
  if (startState) await win.webContents.executeJavaScript('window.__set && window.__set("' + startState + '")');
  for (let i = 0; i < N; i++) { await win.webContents.executeJavaScript('window.__step(' + (1 / FPS) + ')'); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(5, '0') + '.png'), img.toPNG()); if (i % FPS === 0) console.log('кадр ' + i + '/' + N); }
  const r = spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { encoding: 'utf8' });
  console.log(r.status === 0 ? 'клип: ' + out : 'ffmpeg: ' + (r.stderr || '').slice(-600)); fs.rmSync(dir, { recursive: true, force: true }); app.quit();
});
