/* TS-21c: owner API routes. Draft keys live only in the password field and request body. */
(()=>{
 'use strict';
 const L=window.LIVE;if(!L)return;const esc=L.esc,ROOT='/api/llm/providers';
 let rows=[],catalog=[],readError='',reading=0,dialog=null,draft=null,serial=0,alive=true,loaded=false;
 const isPage=document.documentElement.getAttribute('data-page')==='conn'||/^11-connections/.test(location.pathname.split('/').pop());
 const binding=()=>L.sendBinding(),current=b=>alive&&L.bindingCurrent(b);
 const error=r=>(r&&r.error||'Нет подтверждения от движка')+(r&&r.code?' · '+r.code:'');
 async function request(path,body){try{return await L.api(path,body)}catch{return {ok:false,error:'Нет связи с движком'}}}
 function publish(){L.apiRoutes=rows.map(r=>({id:'api:'+r.id,title:r.config.displayName||r.id,kind:'apikey',installed:true,checking:false,models:r.models.map(m=>({id:m.id,label:m.name||m.id}))}));}
 async function load(){const n=++reading,b=binding(),r=await request(ROOT);if(!current(b)||n!==reading)return false;
  if(r&&r.ok&&Array.isArray(r.providers)&&Array.isArray(r.catalog)&&r.providers.every(p=>p&&typeof p.id==='string'&&p.config&&Array.isArray(p.models))){rows=r.providers;catalog=r.catalog;readError='';loaded=true;publish()}else readError=error(r);
  L.apiRoutesError=readError;renderList();return !readError;
 }
 L.loadLlmRoutes=load;L.apiRoutes=[];
 function mount(){if(!isPage)return;const main=document.querySelector('.frame .main');if(!main)return;
  if(!document.querySelector('[data-llm-add]')){const add=document.createElement('button');add.type='button';add.className='btn';add.setAttribute('data-llm-add','');add.textContent='+ Подключить по API';const old=document.getElementById('addbtn');if(old)old.parentElement.appendChild(add);else main.appendChild(add)}
  if(!document.querySelector('[data-llm-list]')){const list=document.createElement('section');list.className='llm-routes';list.setAttribute('data-llm-list','');(document.querySelector('#v-list .wrap')||document.querySelector('#v-list')||main).appendChild(list)}
 }
 function renderList(){mount();const box=document.querySelector('[data-llm-list]');if(!box)return;box.innerHTML='<div class="llm-heading"><h3>Подключения по API</h3><button class="btn sm ghost" data-llm-refresh>Обновить</button></div>'+(readError?'<p role="alert">'+esc(readError)+' <button class="btn sm" data-llm-refresh>Повторить</button></p>':'')+(rows.length?rows.map(r=>'<button class="llm-route" data-llm-edit="'+esc(r.id)+'"><b>'+esc(r.config.displayName||r.id)+'</b><span>'+esc(r.config.catalog||r.config.api)+' · '+r.models.length+' моделей</span><small>Настроить →</small></button>').join(''):'<p class="rnote">'+(readError?'Снимок подключений недоступен':'Подключений по API пока нет')+'</p>');}
 function close(){if(dialog){dialog.remove();dialog=null}draft=null;serial++;}
 function active(d){return draft===d&&dialog&&current(d.binding)}
 function status(d,text){if(!active(d))return;dialog.querySelector('[data-llm-status]').textContent=text;}
 function controls(d){if(!active(d))return;dialog.querySelectorAll('[data-llm-action]').forEach(el=>el.disabled=!!d.busy);dialog.querySelectorAll('[data-llm-field], [data-llm-model]').forEach(el=>el.disabled=!!d.saving);}
 function field(name){return dialog.querySelector('[data-llm-field="'+name+'"]')}
 function modelList(d){if(!active(d))return;dialog.querySelector('[data-llm-models]').innerHTML=d.models.length?d.models.map(m=>'<label class="llm-model"><input type="checkbox" data-llm-model="'+esc(m.id)+'"'+(d.selected.has(m.id)?' checked':'')+'><span>'+esc(m.name||m.id)+'<small>'+esc(m.id)+'</small></span></label>').join(''):'<p class="rnote">Нажмите «Найти модели» или добавьте имя модели вручную.</p>';}
 function credential(d){if(!active(d))return;const k=d.key;dialog.querySelector('[data-llm-key-info]').textContent=k?(k.present?'Сохранён: '+k.mask+' · '+new Date(k.updatedAt).toLocaleString('ru-RU'):d.existing?'Сохранённого ключа нет':'Ключ ещё не сохранён · для локального сервера можно оставить пустым'):'Метаданные ключа не прочитаны';const del=dialog.querySelector('[data-llm-action="delete-key"]');del.hidden=!d.existing||!k||!k.present;}
 async function open(id){close();const attempt=serial,b=binding();if(!loaded){if(!await load()){if(serial===attempt&&current(b))L.toast(esc(readError));return}if(serial!==attempt||!current(b))return}const row=rows.find(r=>r.id===id),d=draft={token:++serial,binding:binding(),existing:!!row,id:row?row.id:'',config:row?JSON.parse(JSON.stringify(row.config)):{},revision:row?row.revision:null,models:row?row.models:[],selected:new Set(row?row.models.map(m=>m.id):[]),key:row?null:{present:false,mask:null,updatedAt:null},busy:false,saving:false,edit:0};
  dialog=document.createElement('dialog');dialog.className='llm-dialog';dialog.setAttribute('aria-label',row?'Настройка API':'Подключить по API');
  dialog.innerHTML='<div class="llm-heading"><h2>'+(row?'Настройка подключения':'Подключить по API')+'</h2><button class="btn sm ghost" data-llm-close aria-label="Закрыть">×</button></div><div class="llm-grid">'+
   '<div><label class="llm-field">Провайдер<select data-llm-field="provider"><option value="">Свой адрес</option>'+catalog.map(id=>'<option value="'+esc(id)+'">'+esc(id)+'</option>').join('')+'</select></label>'+
   '<label class="llm-field">Название<input class="live-f" data-llm-field="name" placeholder="Мой сервер моделей"></label><label class="llm-field">Идентификатор<input class="live-f" data-llm-field="id" placeholder="my-provider"'+(row?' readonly':'')+'><small>Латинские строчные буквы, цифры, дефис или подчёркивание</small></label>'+
   '<div data-llm-custom><label class="llm-field">Протокол<select data-llm-field="api"><option value="openai-completions">OpenAI · Chat Completions</option><option value="openai-responses">OpenAI · Responses</option><option value="anthropic-messages">Anthropic · Messages</option></select></label><label class="llm-field">Базовый адрес<input class="live-f" data-llm-field="url" placeholder="https://example.com/v1"></label></div>'+
   '<label class="llm-field">'+(row?'Заменить ключ API':'Ключ API')+'<input class="live-f" type="password" autocomplete="new-password" data-llm-field="secret" placeholder="'+(row?'Оставьте пустым, чтобы сохранить ключ':'Вставьте ключ API')+'"></label><p class="rnote" data-llm-key-info></p><button class="btn sm ghost" data-llm-action="delete-key" hidden>Удалить ключ</button><p class="rnote">Ключ сохраняется в связке ключей macOS. В окне остаются только маска и дата.</p></div>'+
   '<div><div class="llm-heading"><b>Модели</b><button class="btn sm" data-llm-action="discover">Найти модели</button></div><p class="rnote" data-llm-discovery-note></p><div class="llm-models" data-llm-models></div><div class="llm-manual"><input class="live-f" data-llm-field="manual" placeholder="Точное имя модели" aria-label="Имя модели"><button class="btn sm" data-llm-action="manual">Добавить</button></div><p class="rnote">Инструменты и режимы места предоставляет Harnessy.</p></div></div>'+
   '<p class="llm-status" role="status" aria-live="polite" data-llm-status></p><div class="llm-actions"><button class="btn p" data-llm-action="save">Сохранить</button><button class="btn ghost" data-llm-close>Отмена</button>'+(row?'<button class="btn ghost" data-llm-action="reload">Перечитать</button><button class="btn ghost" data-llm-action="delete">Удалить подключение</button>':'')+'</div>';
  document.body.appendChild(dialog);field('provider').value=d.config.catalog||'';field('name').value=d.config.displayName||'';field('id').value=d.id;field('api').value=d.config.api||'openai-completions';field('url').value=d.config.baseURL||'';details(d);credential(d);modelList(d);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.showModal();field('name').focus();
  if(row){const r=await request(ROOT+'/'+encodeURIComponent(row.id)+'/key');if(!active(d))return;if(r.ok){d.key=r.key;credential(d)}else status(d,error(r));}
 }
 function details(d){dialog.querySelector('[data-llm-custom]').hidden=!!field('provider').value;dialog.querySelector('[data-llm-discovery-note]').textContent=field('provider').value?'Список из каталога · без сети. Поиск не проверяет действительность ключа.':'Список с вашего адреса · запрос отправится только по нажатию.';}
 function config(d,selected){const provider=field('provider').value,id=field('id').value.trim(),name=field('name').value.trim();
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id))throw Error('Введите идентификатор: строчная латинская буква, затем буквы, цифры, дефис или подчёркивание');
  const c={...d.config};delete c.catalog;delete c.api;delete c.baseURL;delete c.models;delete c.modelOverrides;if(provider)c.catalog=provider;else{c.api=field('api').value;c.baseURL=field('url').value.trim();if(!c.baseURL)throw Error('Введите базовый адрес')}
  if(name)c.displayName=name;else delete c.displayName;
  if(selected){if(!d.selected.size)throw Error('Выберите хотя бы одну модель');c.models=[...d.selected].map(id=>{const old=d.config.models&&d.config.models.find(m=>m.id===id);return old||{id,name:d.models.find(m=>m.id===id)?.name||id,...(d.config.modelOverrides&&d.config.modelOverrides[id]||{})}})}
  else if(!provider)c.models=[];
  return {id,config:c};
 }
 async function action(kind){const d=draft;if(!active(d)||d.busy)return;
  if(kind==='manual'){const id=field('manual').value.trim();if(!id)return;if(!d.models.some(m=>m.id===id))d.models.push({id,name:id});d.selected.add(id);d.edit++;field('manual').value='';modelList(d);return}
  if(kind==='reload'){await load();if(active(d))await open(d.id);return}
  if((kind==='delete'||kind==='delete-key')&&!confirm(kind==='delete'?'Удалить подключение и его ключ?':'Удалить сохранённый ключ? Новые вызовы этого маршрута потребуют ключ.'))return;
  let data;try{data=kind==='save'||kind==='discover'?config(d,kind==='save'):{id:d.id}}catch(e){status(d,e.message);return}
  const edit=d.edit,secret=field('secret').value;d.busy=true;d.saving=kind!=='discover';controls(d);status(d,kind==='discover'?'Ищу модели…':'Сохраняю…');
  const body=kind==='discover'?{...data,...(secret?{secret}:{})}:kind==='save'?{config:data.config,revision:d.revision,...(secret?{secret}:{})}:{revision:d.revision};
  const path=kind==='discover'?ROOT+'/discover':ROOT+'/'+encodeURIComponent(d.id||data.id)+'/'+(kind==='delete-key'?'key/delete':kind);
  const r=await request(path,body);if(!active(d))return;d.busy=false;d.saving=false;controls(d);
  if(kind==='discover'&&edit!==d.edit){status(d,'Форма изменилась во время поиска · повторите поиск');return}
  if(!r||!r.ok){status(d,error(r));return}
  if(kind==='discover'){if(!Array.isArray(r.models)){status(d,'Неверный список моделей');return}d.models=r.models;d.selected=new Set([...d.selected].filter(id=>d.models.some(m=>m.id===id)));modelList(d);status(d,d.models.length?'Выберите модели и сохраните подключение':'Провайдер вернул пустой список · можно ввести имя модели');return}
  field('secret').value='';
  if(kind==='delete-key'){d.key=r.key;credential(d);status(d,'Ключ удалён');return}
  if(kind==='save'){d.revision=r.revision;d.config=r.config;d.id=r.id;status(d,'Подключение сохранено');L.toast('Подключение сохранено · '+esc(r.config.displayName||r.id));}
  else L.toast('Подключение удалено');close();await load();if(current(d.binding)&&L.refreshStatus)await L.refreshStatus();
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-llm-add],[data-llm-edit],[data-llm-refresh],[data-llm-close],[data-llm-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.disabled)return;if(b.hasAttribute('data-llm-close'))return close();if(b.hasAttribute('data-llm-refresh'))return load();if(b.hasAttribute('data-llm-add'))return open();if(b.hasAttribute('data-llm-edit'))return open(b.dataset.llmEdit);return action(b.dataset.llmAction)},true);
 document.addEventListener('input',e=>{if(!draft||!dialog||!dialog.contains(e.target))return;draft.edit++;});
 document.addEventListener('change',e=>{const d=draft;if(!active(d))return;const m=e.target.closest('[data-llm-model]');if(m){if(m.checked)d.selected.add(m.dataset.llmModel);else d.selected.delete(m.dataset.llmModel);d.edit++;return}if(e.target===field('provider')||e.target===field('api')||e.target===field('url')){d.edit++;d.models=[];d.selected.clear();modelList(d);details(d);if(!d.existing&&!field('id').value)field('id').value=field('provider').value;}});
 let last='';addEventListener('live:status',()=>{if(draft&&!current(draft.binding))close();mount();const stamp=JSON.stringify([L.H.project,L.H.confirmedProjectGeneration,L.H.on]);if(stamp!==last){last=stamp;if(L.H.on)void load()}});
 const subscribe=()=>L.subscribeLiveEvents?L.subscribeLiveEvents(e=>{let v;try{v=JSON.parse(e.data)}catch{return}if(v.type==='llm.routes')void load()}):null;let events=subscribe();
 addEventListener('pagehide',()=>{alive=false;reading++;close();events?.close();events=null});
 addEventListener('pageshow',e=>{if(e.persisted){alive=true;events=subscribe();if(L.H.on)void load()}});
 mount();if(L.H.on)void load();
})();
