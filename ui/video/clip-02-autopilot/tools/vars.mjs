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
  av2:['А','A'], av3:['А','A'], user:['Анна Ветрова','Anna Vetrova'], user2:['Анна Ветрова','Anna Vetrova'], m_badge:['alpha','alpha'],
  m_look:['Облик','Appearance'], m_look_v:['графит','graphite'], m_profile:['Профиль','Profile'], m_conn:['Подключения','Connections'], m_set:['Настройки','Settings'],
  m_ap:['Автопилот','Autopilot'], m_ap_off:['выкл','off'], m_ap_on:['до утра · 07:00','until 07:00'], m_ap_sub:['оркестратор решает за вас после консилиума с ревьюером','orchestrator decides for you after a reviewer council'],
  m_log:['Журнал','Journal'], m_help:['Справка','Help'], m_keys:['Клавиши','Keys'], m_exit:['Выйти','Sign out'], m_terms:['условия','terms'],
  top_ttl:['Новый чат','New chat'], top_sub:['без проекта','no project'], toproj:['В проект','To project'], conn:['подключено','connected'], conn2:['подключено','connected'], conn3:['подключено','connected'],
  ret_pill:['входящие 2','inbox 2'], ret1:['Пока вас не было:','While you were away:'], ret2:['Исполнитель просит решение','the Executor asks for a decision'], ret3:['и','and'], ret4:['возврат ревьюера H1.5','reviewer return H1.5'], ret5:['· 40 мин','· 40 min'], ret_btn:['Открыть','Open'],
  h2:['Чем займёмся?','What shall we do?'], cx_chat:['Новый чат','New chat'], cx_role:['Без роли','No role'], cx_ph:['Написать сообщение…','Write a message…'], cx_perm:['Всё без вопросов','Everything, no questions'], cx_eff:['Усилие: —','Effort: —'],
  recent_l:['недавние:','recent:'], status1:['без проекта · «в проект ▾» — когда понадобится','no project · “to project ▾” when needed'], status2a:['команды','commands'], status2b:['новый чат','new chat'],
  tm_ttl:['Команда агентов','Agent team'], tm_sub:['Alpha-Test · 6 ролей','Alpha-Test · 6 roles'], tm_ap:['автопилот · до 07:00','autopilot · until 07:00'],
  orch:['Оркестратор','Orchestrator'], orch_sub:['Opus 5.5 · ведёт ход','Opus 5.5 · leads the turn'], orch_s1:['думает','thinking'], orch_s2:['предлагает решение','proposes a decision'], orch_s3:['решено · 3','decided · 3'],
  arrow_lbl:['советуются','conferring'],
  rev:['Ревьюер','Reviewer'], rev_s1:['ждёт','waiting'], rev_s2:['проверяет · 12 с','checking · 12 s'], rev_s3:['согласен ✓','agrees ✓'],
  rev_l1:['перевести воркера на Sonnet?','move the worker to Sonnet?'], rev_l2:['правка по H1.5 — принять?','the H1.5 fix — accept?'], rev_l3:['резерв для Codex — включить?','backup for Codex — switch on?'], rev_tok:['18 k ток','18 k tok'], rev_at:['за ход','per turn'],
  d_kind:['решение принято','decision made'], d_kind2:['решение принято','decision made'], d_kind3:['решение принято','decision made'],
  d_who:['оркестратор + ревьюер','orchestrator + reviewer'], d_who2:['оркестратор + ревьюер','orchestrator + reviewer'], d_who3:['оркестратор + ревьюер','orchestrator + reviewer'],
  d_why:['почему:','why:'], d_why2:['почему:','why:'], d_why3:['почему:','why:'],
  d1_t:['Воркер переведён на Sonnet, сброса Codex не ждём','Worker moved to Sonnet, not waiting for the Codex reset'], d1_f:['сброс Codex только в 19:58, ход стоит 0,3 % недели','Codex resets only at 19:58; the turn costs 0.3 % of the week'],
  d2_t:['Замечание ревьюера учтено, ход продолжен','Reviewer’s note applied, the turn continues'], d2_f:['правка в одну строку, проверки зелёные 7/7','a one-line fix, checks green 7/7'],
  d3_t:['Codex переключён на резерв VPS NL99','Codex switched to the backup VPS NL99'], d3_f:['основной выход упал, резерв проверен','the main route went down, the backup is verified'],
  ib_ttl:['Входящие','Inbox'], fl_all:['Все','All'], fl_need:['Требует действия','Needs action'], fl_info:['К сведению','FYI'], ib_markall:['отметить всё прочитанным','mark all as read'],
  ib_grp:['автопилот решил','autopilot decided'], ib_grp2:['к сведению','FYI'],
  c_kind:['автопилот · решение','autopilot · decision'], c_kind2:['автопилот · решение','autopilot · decision'], c_kind3:['автопилот · решение','autopilot · decision'],
  c_proj:['Alpha-Test','Alpha-Test'], c_proj2:['Alpha-Test','Alpha-Test'], c_proj3:['Подключения','Connections'],
  c_open:['Открыть','Open'], c_open2:['Открыть','Open'], c_open3:['Открыть','Open'],
  c1_t:['Воркер переведён на Sonnet, сброса Codex не ждём','Worker moved to Sonnet, not waiting for the Codex reset'], c1_f:['чат «Я — Исполнитель: реализую модуль…»','chat “I am the Executor: building a module…”'],
  c1_why:['сброс Codex только в 19:58, ход стоит 0,3 % недели','Codex resets only at 19:58; the turn costs 0.3 % of the week'],
  c2_t:['Замечание ревьюера учтено, ход продолжен','Reviewer’s note applied, the turn continues'], c2_f:['чат «договор H1.5 · раунд 2»','chat “H1.5 agreement · round 2”'],
  c3_t:['Codex переключён на резерв VPS NL99','Codex switched to the backup VPS NL99'], c3_f:['без проекта','no project'],
  x_why:['Почему:','Why:'], x_who:['Советовались:','Conferred:'], x_who2:['оркестратор и ревьюер · согласны','orchestrator and reviewer · agreed'],
  x_undo:['Отменить','Undo'], x_ok:['Хорошо','OK'], x_okm:['принято · можно отменить до вечера','accepted · can be undone until tonight'],
  ck_eve:['вечер','evening'], ck_night:['ночь','night'], ck_morn:['утро','morning'],
  cap1:['Вечер. Два вопроса *ждут* вас','Evening. Two questions are *waiting*'], cap2:['Уходите — *помощник* решит за вас','Leave — the *assistant* decides for you'],
  cap3:['Ночью помощник и проверяющий *советуются*','At night assistant and checker *confer*'], cap4:['У каждого решения есть *почему*','Every decision comes with a *why*'],
  cap5:['Утром видно всё. Можно *отменить*','Morning: see it all. You can *undo*'],
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['автопилот','autopilot'], badge:['alpha','alpha'],
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
