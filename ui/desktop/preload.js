// preload.js — узкий мост страницы к оболочке Harnessy. Node внутрь окна не попадает (contextIsolation + sandbox).
const { contextBridge, ipcRenderer } = require('electron');

const element = node => node && node.nodeType === 1 ? node : node && node.parentElement;
function chatSelection() {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return { quote: false, text: '' };
  const anchor = element(selection.anchorNode), focus = element(selection.focusNode);
  if (!anchor || !focus || !anchor.closest || !focus.closest) return { quote: false, text: '' };
  const first = anchor.closest('.live-msg[data-message-index]'), last = focus.closest('.live-msg[data-message-index]');
  const start = anchor.closest('.live-message-text,.md-body'), end = focus.closest('.live-message-text,.md-body');
  const text = String(selection.toString() || '').replace(/\r\n?/g, '\n').trim();
  return { quote: !!text && !!first && first === last && !!start && !!end && start.closest('.live-msg') === first && end.closest('.live-msg') === first, text };
}
let lastSelection = '';
function publishSelection() {
  const selected = chatSelection(), next = JSON.stringify(selected);
  if (next === lastSelection) return;
  lastSelection = next;
  ipcRenderer.send('harnessy:context-meta', selected);
}
document.addEventListener('selectionchange', publishSelection, true);
document.addEventListener('mouseup', () => setTimeout(publishSelection, 0), true);

contextBridge.exposeInMainWorld('harnessy', {
  desktop: true,
  pickFolder: o => ipcRenderer.invoke('harnessy:pick-folder', o || {}),   // → абсолютный путь папки или null (отмена)
  onQuote: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => { if (typeof text === 'string' && text.trim()) callback(text); };
    ipcRenderer.on('harnessy:quote-selection', listener);
    return () => ipcRenderer.removeListener('harnessy:quote-selection', listener);
  },
  onTransfer: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => { if (typeof text === 'string' && text.trim()) callback(text); };
    ipcRenderer.on('harnessy:transfer-selection', listener);
    return () => ipcRenderer.removeListener('harnessy:transfer-selection', listener);
  },
});
