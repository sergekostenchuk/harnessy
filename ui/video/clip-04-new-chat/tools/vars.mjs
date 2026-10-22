// Словарь переменных клипа №4 (ru — значения по умолчанию в композициях, en — data-variable-values у хостов index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  // панель (как в clip-01)
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av:['А','A'], user:['Анна Ветрова','Anna Vetrova'],
  // шапка без полоски: Новый чат → чат «кофе» → в проекте
  top_ttl:['Новый чат','New chat'], top_sub:['без проекта','no project'],
  top_ttl2:['как заварить кофе в турке','how to brew coffee in a cezve'], top_sub2:['без проекта · 2 сообщения','no project · 2 messages'],
  top_ttl3:['как заварить кофе в турке','how to brew coffee in a cezve'], top_sub3:['без проекта · 4 сообщения','no project · 4 messages'],
  top_ttl4:['как заварить кофе в турке','how to brew coffee in a cezve'], top_sub4:['Alpha-Test','Alpha-Test'],
  toproj:['В проект','To project'], conn:['подключено','connected'], conn2:['подключено','connected'],
  tp_busy:['переносим…','moving…'], tp_done:['перенесено в Alpha-Test','moved to Alpha-Test'],
  // меню «В проект» и подтверждение (дизайн-код, sidebar-v2-spec)
  tpm_hd:['добавить чат в проект','add chat to a project'], tpm_srch:['найти проект…','find a project…'], tpm_cur:['текущий','current'],
  tpm_r3:['3 роли','3 roles'], tpm_r8:['8 ролей','8 roles'], tpm_law:['Юристы 4114','Lawyers 4114'], tpm_r6:['6 ролей','6 roles'],
  tpm_new:['Сделать проектом…','Make it a project…'], tpm_newm:['новая папка','new folder'],
  conf_lbl:['подтверждение','confirmation'], conf1:['Перенести чат','Move the chat'], conf_chat:['«как заварить кофе в турке»','“how to brew coffee in a cezve”'], conf2:['в проект','to project'],
  conf3:['Чат получит разделы проекта, память и роли; история останется.','The chat gets the project’s sections, memory and roles; history stays.'],
  conf_ok:['Перенести','Move'], conf_no:['Отмена','Cancel'],
  // проектная полоска (кадр A1·c)
  tab_chat:['Чат','Chat'], tab_doc:['Документы','Documents'], tab_art:['Артефакты','Artifacts'], tab_mem:['Память','Memory'], tab_res:['Исследования','Research'],
  tab_plan:['План · карта','Plan · map'], tab_path:['Путь','Path'], tab_team:['Команда агентов','Agent team'], tab_team_m:['2 роли','2 roles'],
  // лента чата
  me1:['как заварить кофе в турке','how to brew coffee in a cezve'], th1:['думал 0,6 с','thought 0.6 s'],
  ai1:['Мелкий помол, холодная вода, сахар по вкусу. Грейте на слабом огне и снимите, как только поднимется пена — не кипятите. Разлейте и дайте осесть минуту.','Fine grind, cold water, sugar to taste. Heat gently and take it off as soon as the foam rises — never let it boil. Pour and let it settle for a minute.'],
  me2:['Теперь по делу: что осталось до запуска Alpha-Test?','Now to work: what is left before the Alpha-Test launch?'], th2:['думал 0,4 с','thought 0.4 s'],
  ai2a:['Этот чат без проекта — материалы Alpha-Test мне не видны.','This chat has no project, so I cannot see the Alpha-Test materials.'],
  ai2b:['Добавьте чат в проект','Add the chat to a project'], ai2c:['— откроются документы, память и команда.','— its documents, memory and team will open up.'],
  // композер внизу и статус
  cx_chat2:['как заварить кофе в турке','how to brew coffee in a cezve'], cx_role2:['Без роли','No role'], cx_ph2:['Написать сообщение…','Write a message…'], cx_perm2:['Всё без вопросов','Everything, no questions'], cx_eff2:['Усилие: —','Effort: —'],
  status1:['без проекта · «в проект ▾» — когда понадобится','no project · “to project ▾” when needed'], status1b:['папка Alpha-Test · git · ролей 2','folder Alpha-Test · git · 2 roles'],
  status2a:['команды','commands'], status2b:['новый чат','new chat'],
  // экран «Новый чат»
  ret_pill:['входящие 2','inbox 2'], ret1:['Пока вас не было:','While you were away:'], ret2:['Исполнитель просит решение','the Executor asks for a decision'], ret3:['и','and'], ret4:['возврат ревьюера H1.5','reviewer return H1.5'], ret5:['· 40 мин','· 40 min'], ret_btn:['Открыть','Open'],
  h2:['Чем займёмся?','What shall we do?'], cx_chat:['Новый чат','New chat'], cx_role:['Без роли','No role'], cx_ph:['Написать сообщение…','Write a message…'], cx_perm:['Всё без вопросов','Everything, no questions'], cx_eff:['Усилие: —','Effort: —'],
  recent_l:['недавние:','recent:'], chat1b:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], role_orch2:['Оркестратор','Orchestrator'],
  chat2b:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], role_exec2:['Исполнитель','Executor'], chat3b:['ты готов?','are you ready?'], solo2b:['перевод письма партнёру','translating a letter to a partner'],
  status1c:['без проекта · «в проект ▾» — когда понадобится','no project · “to project ▾” when needed'], status2c:['команды','commands'], status2d:['новый чат','new chat'],
  // подписи (≤ 7 слов, одно слово коньяком)
  cap1:['Просто *спросите*. Проект не нужен','Just *ask*. No project needed'],
  cap2:['Выросло в дело — добавьте в *проект*','Grew into work? Add to a *project*'],
  cap3:['Любой свой проект — или *новый*','Your project — or a *new* one'],
  cap4:['Чат *переехал*. История на месте','Chat *moved*. History stays'],
  cap5:['Теперь рядом *документы*, память, команда','Now with *documents*, memory, team'],
  // финал и плашка
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['новый чат → проект','new chat → project'], badge:['alpha','alpha'],
};
const esc = s => s.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
const idsIn = html => [...new Set([...html.matchAll(/data-var-text="([^"]+)"/g)].map(m=>m[1]))];
const used = {};
for (const f of fs.readdirSync(path.join(ROOT,'compositions'))) {
  const p = path.join(ROOT,'compositions',f); let html = fs.readFileSync(p,'utf8');
  const ids = idsIn(html); const miss = ids.filter(i=>!D[i]); if (miss.length) throw new Error(f+': нет в словаре: '+miss.join(', '));
  const m = html.match(/data-composition-id="([^"]+)"/); used[m[1]] = ids;
  const decl = ids.map(i=>({id:i,type:'string',label:i,default:D[i][0]}));
  html = html.replace(/data-composition-variables='[^']*'/, "data-composition-variables='"+esc(JSON.stringify(decl))+"'");
  // значения по умолчанию в разметке = ru из словаря
  for (const i of ids) html = html.replace(new RegExp('(data-var-text="'+i+'"[^>]*>)[^<]*'), '$1'+D[i][0]);
  fs.writeFileSync(p, html);
}
const mode = (process.argv[2] || 'ru').toLowerCase();
let idx = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
idx = idx.replace(/ data-variable-values='[^']*'/g, '');
if (mode === 'en') for (const [comp, ids] of Object.entries(used)) {
  const vals = Object.fromEntries(ids.map(i=>[i,D[i][1]]));
  idx = idx.replace(new RegExp('(data-composition-id="'+comp+'" data-composition-src="[^"]+")'), "$1 data-variable-values='"+esc(JSON.stringify(vals))+"'");
}
idx = idx.replace(/<html lang="[a-z]+">/, '<html lang="'+(mode==='en'?'en':'ru')+'">');
fs.writeFileSync(path.join(ROOT,'index.html'), idx);
console.log('lang:', mode, '| vars:', Object.entries(used).map(([k,v])=>k+'='+v.length).join(' '));
