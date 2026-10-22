// Словарь переменных клипа (ru — значения по умолчанию в композициях, en — index-en.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  chat1b:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2b:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3b:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'], role_orch2:['Оркестратор','Orchestrator'], role_exec2:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo1b:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  r8:['8 ролей','8 roles'], r3:['3 роли','3 roles'], r3b:['3 роли','3 roles'], r1:['1 роль','1 role'], r1b:['1 роль','1 role'], r1c:['1 роль','1 role'], r1d:['1 роль','1 role'], r6:['6 ролей','6 roles'], r0:['0 ролей','0 roles'], p8:['Юристы 4114','Lawyers 4114'],
  pm_hd:['chat-test','chat-test'], pm_sub:['в проекте chat-test','in project chat-test'], pm_new:['Новый чат в проекте','New chat in project'], pm_doc:['Документы','Documents'], pm_art:['Артефакты','Artifacts'],
  pm_mem:['Память проекта','Project memory'], pm_mem_m:['12 правил','12 rules'], pm_res:['Исследования','Research'], pm_res_m:['2 вопроса','2 questions'], pm_plan:['План · карта','Plan · map'],
  pm_path:['Путь','Path'], pm_path_m:['8 стадий','8 stages'], pm_team:['Команда агентов','Agent team'], pm_team_m:['8 ролей','8 roles'], pm_dash:['Дашборд','Dashboard'], pm_ft:['пункты открывают страницы этого проекта','items open this project’s pages'],
  av:['А','A'], av2:['А','A'], av3:['А','A'], user:['Анна Ветрова','Anna Vetrova'], user2:['Анна Ветрова','Anna Vetrova'], m_badge:['alpha','alpha'],
  m_look:['Облик','Appearance'], m_look_v:['графит','graphite'], m_profile:['Профиль','Profile'], m_conn:['Подключения','Connections'], m_set:['Настройки','Settings'],
  m_ap:['Автопилот','Autopilot'], m_ap_st:['выкл','off'], m_ap_sub:['оркестратор решает за вас после консилиума с ревьюером','orchestrator decides for you after a reviewer council'],
  m_log:['Журнал','Journal'], m_help:['Справка','Help'], m_keys:['Клавиши','Keys'], m_exit:['Выйти','Sign out'], m_terms:['условия','terms'],
  tip_inbox:['Входящие','Inbox'], tip_more:['+4 к сведению','+4 FYI'],
  top_ttl:['Новый чат','New chat'], top_sub:['без проекта','no project'], toproj:['В проект','To project'], conn:['подключено','connected'],
  ret_pill:['входящие 2','inbox 2'], ret1:['Пока вас не было:','While you were away:'], ret2:['Исполнитель просит решение','the Executor asks for a decision'], ret3:['и','and'], ret4:['возврат ревьюера H1.5','reviewer return H1.5'], ret5:['· 40 мин','· 40 min'], ret_btn:['Открыть','Open'],
  h2:['Чем займёмся?','What shall we do?'], cx_chat:['Новый чат','New chat'], cx_role:['Без роли','No role'], cx_ph:['Написать сообщение…','Write a message…'], cx_perm:['Всё без вопросов','Everything, no questions'], cx_eff:['Усилие: —','Effort: —'],
  recent_l:['недавние:','recent:'], status1:['без проекта · «в проект ▾» — когда понадобится','no project · “to project ▾” when needed'], status2a:['команды','commands'], status2b:['новый чат','new chat'],
  cap1:['Слева — *проекты и чаты*. Больше ничего.','On the left — *projects and chats*. Nothing else.'], cap2:['*Входящие*: всё, что ждёт вас','*Inbox*: everything waiting for you'],
  cap3:['Наведите на *проект*: документы, артефакты, команда','Hover a *project*: documents, artifacts, team'], cap4:['Настройки, подключения, автопилот — в *профиле*','Settings, connections, autopilot — in your *profile*'],
  cap5:['Сжали — *рейка* с теми же пунктами','Collapsed — a *rail* with the same items'],
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['боковая панель и рейка','sidebar and rail'], badge:['alpha','alpha'],
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
