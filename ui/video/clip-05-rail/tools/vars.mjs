// Словарь переменных клипа 05 «Рейка-режимы» (ru — значения по умолчанию в композициях, en — data-variable-values у хостов index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  // рейка и панель режима (кадр A2 скетча 40)
  proj:['Alpha-Test','Alpha-Test'], mh_chats:['Чаты','Chats'], mh_proj:['Проект','Project'], mh_team:['Команда','Team'],
  inbox:['Входящие','Inbox'], g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'], others2:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  chat1b:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2b:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3b:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'], role_orch2:['Оркестратор','Orchestrator'], role_exec2:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo1b:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av:['А','A'],
  // режим «Проект» (кадр A2·p)
  pc_meta:['git · 2 роли · 3 чата','git · 2 roles · 3 chats'], pc_wait:['входящие · 2','inbox · 2'], pc_run:['· идёт ход · 1','· turn in progress · 1'],
  g_sections:['разделы','Sections'], s_doc:['Документы','Documents'], s_art:['Артефакты','Artifacts'], s_mem:['Память проекта','Project memory'], s_mem_m:['12 правил','12 rules'], s_res:['Исследования','Research'], s_res_m:['2 вопроса','2 questions'], s_team:['Команда агентов','Agent team'], s_team_m:['2 роли','2 roles'],
  // режим «Команда» (строки дизайн-кода + экраны скетча 41)
  g_roles:['роли · Alpha-Test','Roles · Alpha-Test'], t_orch:['Оркестратор','Orchestrator'], t_orch_st:['идёт ход','working'], t_exec:['Исполнитель','Executor'], t_exec_st:['ждёт вас','waiting for you'],
  g_screens:['экраны','Screens'], t_canvas:['Полотно команды','Team canvas'], t_ctor:['Конструктор команды','Team constructor'],
  // экран «Новый чат» (0–2.8 с)
  top_ttl:['Новый чат','New chat'], top_sub:['без проекта','no project'], toproj:['В проект','To project'], conn:['подключено','connected'], conn2:['подключено','connected'],
  ret_pill:['входящие 2','inbox 2'], ret1:['Пока вас не было:','While you were away:'], ret2:['Исполнитель просит решение','the Executor asks for a decision'], ret3:['и','and'], ret4:['возврат ревьюера H1.5','reviewer return H1.5'], ret5:['· 40 мин','· 40 min'], ret_btn:['Открыть','Open'],
  h2:['Чем займёмся?','What shall we do?'], cx_chat:['Новый чат','New chat'], cx_role:['Без роли','No role'], cx_ph:['Написать сообщение…','Write a message…'], cx_perm:['Всё без вопросов','Everything, no questions'], cx_eff:['Усилие: —','Effort: —'],
  recent_l:['недавние:','recent:'], status1:['без проекта · «в проект ▾» — когда понадобится','no project · “to project ▾” when needed'], status2a:['команды','commands'], status2b:['новый чат','new chat'],
  // экран «Входящие» (кадр A1·i)
  ib_ttl:['Входящие','Inbox'], fl_all:['Все','All'], fl_need:['Требует действия','Needs action'], fl_info:['К сведению','FYI'], ib_markall:['отметить всё прочитанным','mark all as read'],
  g_need:['требует действия · 2','needs action · 2'], g_info:['к сведению · 4','fyi · 4'], g_mark:['отметить прочитанным','mark as read'],
  k_dec:['решение','decision'], w_dec:['40 мин','40 min'], t_dec:['Исполнитель просит решение: перевести воркера на Sonnet или ждать сброса Codex','The Executor asks for a decision: move the worker to Sonnet or wait for the Codex reset'], f_dec:['чат «Я — Исполнитель: реализую модуль…»','chat “I am the Executor: building a module…”'],
  b_reply:['Ответить','Reply'], b_open_chat:['Открыть чат','Open chat'],
  k_ret:['возврат ревьюера','reviewer return'], w_ret:['2 ч','2 h'], t_ret:['H1.5 · раунд 2: одна находка — «эра включает шаг, начатый старым кодом»','H1.5 · round 2: one finding — “the era includes a step started by old code”'], f_ret:['чат «договор H1.5 · раунд 2»','chat “H1.5 contract · round 2”'],
  b_open:['Открыть','Open'], b_restart:['Перезапустить','Restart'],
  k_done:['итог хода','turn result'], w_done:['вчера 23:40','yesterday 23:40'], t_done:['Ход завершён без вас: прогон H1.5 · 7/7 зелёный, отчёт ревьюеру отправлен','Turn finished without you: run H1.5 · 7/7 green, report sent to the reviewer'], f_done:['чат «Кто ты? какая ты модель…»','chat “Who are you? which model…”'], b_open2:['Открыть','Open'],
  k_plug:['подключение','connection'], w_plug:['вчера 21:10','yesterday 21:10'], t_plug:['Codex: выход упал → переключено на резерв (VPS NL99); вход истёк через 6 ч','Codex: exit went down → switched to backup (VPS NL99); sign-in expired after 6 h'], f_plug1:['Подключения','Connections'], f_plug2:['без проекта','no project'], b_allow:['Разрешить','Allow'], b_open3:['Открыть','Open'],
  k_spend:['лимит · оплата','limit · billing'], w_spend:['вчера','yesterday'], t_spend:['Claude: осталось 20 % недели, сброс в пн 09:00 · оплата Codex 28.10','Claude: 20 % of the week left, reset Mon 09:00 · Codex payment 28.10'], f_spend1:['Лимиты','Limits'], f_spend2:['без проекта','no project'], b_open4:['Открыть','Open'],
  k_upd:['обновление','update'], w_upd:['3 дн.','3 d'], t_upd:['Harnessy 0.1.1-alpha готово: меню проекта, Входящие, Автопилот','Harnessy 0.1.1-alpha is ready: project menu, Inbox, Autopilot'], f_upd:['Приложение','Application'], b_restart2:['Перезапустить','Restart'], okm2:['выполнено','done'],
  // подписи
  cap1:['Узкая *рейка* — всё под рукой','A slim *rail* — everything at hand'],
  cap2:['Нажмите — *откроется* нужное','Click — the right one *opens*'],
  cap3:['*Проект:* документы, память, команда','*Project:* documents, memory, team'],
  cap4:['*Команда:* кто чем занят','*Team:* who is doing what'],
  cap5:['Отпустили — осталась *рейка*','Let it go — only the *rail* stays'],
  cap6:['Нажали — панель *вернулась*','Click again — the panel is *back*'],
  // финал и плашка
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['рейка-режимы','rail modes'], badge:['alpha','alpha'],
};
const esc = s => s.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
const idsIn = html => [...new Set([...html.matchAll(/data-var-text="([^"]+)"/g)].map(m=>m[1]))];
const used = {};
for (const f of fs.readdirSync(path.join(ROOT,'compositions'))) {
  if (!f.endsWith('.html')) continue;
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
