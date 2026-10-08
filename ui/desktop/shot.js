// shot.js — снимок страницы в высоком разрешении скрытым экземпляром Electron (не трогает окно Harnessy).
// Запуск: electron shot.js <url> <out.png> [w] [h] [waitMs]
const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path'), os = require('os');
const [url, out, w, h, waitMs] = process.argv.slice(2);
app.setPath('userData', path.join(os.tmpdir(), 'harnessy-shot'));
if (process.env.SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.SCALE);   // плотность пикселей кадра (2 = ретина)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w || 1440, height: +h || 920, show: false, frame: false, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(10);
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, +waitMs || 3000));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG()); console.log('кадр: ' + out + ' ' + img.getSize().width + 'x' + img.getSize().height);
  app.quit();
});
