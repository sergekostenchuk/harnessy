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

const updateListeners=new Set();
let updateState=null;
function renderUpdateBanner(){
  if(!document.body)return;
  let banner=document.querySelector('[data-desktop-update-banner]');
  if(!updateState?.readyVersion){banner?.remove();return}
  if(!banner){
    banner=document.createElement('div');banner.className='desktop-update-banner';banner.setAttribute('data-desktop-update-banner','');banner.setAttribute('role','status');
    const copy=document.createElement('div'),title=document.createElement('b'),description=document.createElement('small'),button=document.createElement('button');
    title.textContent='Обновление готово';description.textContent='Новая версия установится после перезапуска приложения.';
    button.type='button';button.className='btn p';button.textContent='Перезапустить';
    button.addEventListener('click',async()=>{button.disabled=true;try{await ipcRenderer.invoke('harnessy:update-install')}catch{description.textContent='Не удалось перезапустить. Повторите действие.';button.disabled=false}});
    copy.appendChild(title);copy.appendChild(description);banner.appendChild(copy);banner.appendChild(button);document.body.appendChild(banner);
  }
  const button=banner.querySelector('button');if(button)button.disabled=updateState.installing===true;
}
function publishUpdateState(state){
  if(!state||typeof state!=='object')return;
  updateState=state;renderUpdateBanner();
  for(const listener of updateListeners)listener(state);
}
ipcRenderer.on('harnessy:update-state',(_event,state)=>publishUpdateState(state));
document.addEventListener('DOMContentLoaded',renderUpdateBanner,{once:true});
Promise.resolve(ipcRenderer.invoke('harnessy:update-state')).then(publishUpdateState).catch(()=>{});

contextBridge.exposeInMainWorld('harnessy', {
  desktop: true,
  pickFolder: o => ipcRenderer.invoke('harnessy:pick-folder', o || {}),   // → абсолютный путь папки или null (отмена)
  updates: Object.freeze({
    getState:()=>ipcRenderer.invoke('harnessy:update-state'),
    setChannel:channel=>ipcRenderer.invoke('harnessy:update-channel',channel),
    install:()=>ipcRenderer.invoke('harnessy:update-install'),
    onState:callback=>{if(typeof callback!=='function')return ()=>{};updateListeners.add(callback);if(updateState)callback(updateState);return ()=>updateListeners.delete(callback)},
  }),
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
