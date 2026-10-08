// preload.js — мост страницы к оболочке Harnessy. В страницу уходит только выбор папки системным диалогом (Finder);
// Node внутрь окна не попадает (contextIsolation + sandbox). Без оболочки (в браузере) window.harnessy нет — окно показывает поле пути.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('harnessy', {
  desktop: true,
  pickFolder: o => ipcRenderer.invoke('harnessy:pick-folder', o || {}),   // → абсолютный путь папки или null (отмена)
});
