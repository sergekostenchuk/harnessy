# -*- coding: utf-8 -*-
import json,collections,datetime,re,os
OUT='/private/tmp/claude-501/ux-screens'
recs=json.load(open(OUT+'/records_all.json'))
msgs=collections.OrderedDict()
for r in recs: msgs.setdefault((r['proj'],r['sess'][:8],r['line'],bool(r.get('queued'))),[]).append(r)
items=sorted(msgs.items(),key=lambda kv:kv[1][0]['ts'])

PAIN={'А':'вёрстка: наложение, нет прокрутки, без стилей, битая кодировка','Б':'непонятно, что это и как пользоваться (жаргон, скрытый пункт, нет выхода)','В':'сырая ошибка без действия','Г':'ожидание/пусто без причины и срока','Д':'экран расходится со словами агента или сам себе противоречит','Е':'шум и повторы (стена кодов, heartbeat, тосты)','Ж':'образец «хочу так»','З':'нужная кнопка/функция не найдена, не работает или не там','И':'удалённый доступ, кто и что именно делает'}
APPS={'TP':'TASKPLAN PRO Web (пульт владельца, кокпит)','CX':'Codex (Desktop и терминал)','CL':'Claude Desktop / Claude на телефоне','DS':'DeepSeek Harness (dsh) и его плагины','OW':'Собственный харнесс / Workbench','RF':'Референсы и макеты (образцы)','PI':'Pi / pi-gui / Qwen Code','OT':'Прочие (Qwen.app, ComfyUI, Dock/Kimi, macOS, Devin, сканер)','EX':'Внешний факт (не UI)'}
# key -> (app, screen description, pains)
M={
'Social-MSU/15b9e00b:3':('CL','стопка жёлтых тостов «MCP docker: Unexpected token … is not valid JSON», «MCP memory: Server disconnected», кнопка Open developer settings','ВЕ'),
'Social-MSU/2a56db67:112':('OT','Qwen.app: модель отвечает «нет доступа к файловой системе, работаю в изолированной среде» на «посмотри папку»','БД'),
'Social-MSU/2a56db67:284':('OT','Qwen.app: меню «+» (Загрузить вложение, Глубокое исследование, … МСР, Больше>), тумблер «Инструменты»','БЗ'),
'Social-MSU/2a56db67:417':('OT','macOS Dock: вместо значка Kimi иконка «?» с подсказкой «.Kimi.app.installing-…»','ЗД'),
'TASKPLAN-PRO-V2/c30a83e4:88':('RF','4 образца: светлый минималистичный сайт (слои INTERFACE/LOGIC/DATA/INTEGRATIONS), тёмный редактор воронок с библиотекой блоков и связями, два дашборд-шаблона','Ж'),
'TASKPLAN-PRO-V2/d5cbede6:527':('OT','приложение-сканер, созданное агентом: модальное «Формат файла» поверх предпросмотра, подписи «Отмена/Сканировать» налезают на текст','АГ'),
'TASKPLAN-PRO-V2/d5cbede6:815q':('OT','то же приложение: предпросмотр, спиннер на кнопке, «Сканирую… затем распознаю текст, это дольше»','Г'),
'TASKPLAN-PRO-V2/25570f76:2975q':('TP','кокпит: конвейер Планировщик→…→Закрытие, у «Ревьюера» «требует сверки», метка «review loops: 2/2»','Б'),
'TASKPLAN-PRO-V2/25570f76:4918':('CX','Codex Desktop, автоматизация: одинаковые плашки «Отправлено запланированной задачей… Monitor…», «No pending envelopes.»; в шапке строка с иероглифами','ЕД'),
'TASKPLAN-PRO-V2/25570f76:5440q':('PI','Qwen Code в терминальной панели: 401 → /auth «Successfully configured» → снова 401 → ответ пошёл','ВБ'),
'TASKPLAN-PRO-V2/25570f76:5463q':('PI','то же + справа «How is Qwen doing this session? 1 Good 2 Bad 3 Fine 0 Dismiss»; слева Claude Desktop («Compacted conversation», «1 running task»)','ВБ'),
'TASKPLAN-PRO-V2/25570f76:7250':('CX','Codex Desktop «Claude Fable Concil»: десятки одинаковых плашек relay-монитора «Выполнено за 3 с … No pending relay envelopes remain», на левом краю полоса-индикатор прокрутки из десятков рисок','Е'),
'TASKPLAN-PRO-V2/25570f76:8001':('TP','(1) Обзор PF: жёлтый баннер Dirty Git, READY/BLOCKED/NAMED, Feature Journey; (2) красная панель «Runtime reconciliation required» из 13 строк кодов + конвейер T-006','ДЕБ'),
'TASKPLAN-PRO-V2/25570f76:8213':('TP','кокпит: список accepted-задач, у каждой «Нет launch authority» и жёлтая «Запуск недоступен: exact_b09_runtime_authority_missing»','ЕБ'),
'TASKPLAN-PRO-V2/25570f76:8238':('TP','то же сообщение отправлено повторно (цитата ответа агента + скриншот кокпита)','ЕБ'),
'TASKPLAN-PRO-V2/25570f76:8272':('TP','4 экрана кокпита: карточки задач; T-010 «runtime_ready» с «Запуск недоступен: git_dirty»','БЕД'),
'TASKPLAN-PRO-V2/25570f76:8420':('TP','красная плашка «Выбранная PF не найдена: отсутствует в verified PI projection…», кнопки «Открыть PF-001…006», остальной экран пуст','ВГ'),
'TASKPLAN-PRO-V2/25570f76:8744':('TP','«Пульт владельца» без стилей: сплошной текст, кнопки «ПринятьОтклонитьЗапросить изменения» слиплись','АБ'),
'TASKPLAN-PRO-V2/25570f76:8840':('TP','Пульт владельца: 3 жёлтые плашки «Нечитаемая owner-decision квитанция исключена…», карточки «Если принять / Если отклонить», «Это решение уже изменилось в другом окне»','ЕДЗ'),
'TASKPLAN-PRO-V2/25570f76:9200':('TP','карточка «Восстанавливаем состояние проекта… ничего нажимать не нужно» со спиннером','Г'),
'TASKPLAN-PRO-V2/8e05efa4:4':('CL','Claude Desktop (Code): серая подсказка-призрак в поле ввода; строка «Bypass permissions», «Opus 4.8 Ultracode», «+17 042 −0 Commit changes»','Б'),
'TASKPLAN-PRO-V2/25570f76:9463':('TP','полоска «PF-008 · F-018 READY — Живой контур знания…»','Д'),
'TASKPLAN-PRO-V2/25570f76:9746':('TP','карточка «Состояние проекта не подтверждено · unsupported_connector · local TASKPLAN runtime bridge is unavailable · попытка 6», три кнопки','ВГ'),
'TASKPLAN-PRO-V2/25570f76:9760':('TP','кокпит Agent Pipeline: баннеры «Dirty Git…» и «Текущее исполнение не подтверждено», все задачи blocked','ДЕ'),
'TASKPLAN-PRO-V2/25570f76:9792':('TP','после «Запросить запуск»: «Ожидает current-chat host», «pending_host_claim», красное «Run не создан: taskplan_runtime_response_timeout»','ВЗБ'),
'TASKPLAN-PRO-V2/25570f76:9955':('TP','(1) красная стена global_execution_scope_mismatch при зелёной строке «Живое исполнение · событие 10»; (2) сообщение агента «Runtime-run честно остался recovery_required… Изменено 16 файлов»','ДЕ'),
'TASKPLAN-PRO-V2/25570f76:10063':('TP','конвейер с кольцом на «Ревьюер», «Фактический маршрут: separate_cli_process…»; строка статуса то появляется, то исчезает','ДГ'),
'TASKPLAN-PRO-V2/25570f76:10221':('TP','кокпит: T-001 «failed», «Run не создан: …timeout», кнопки «Контролировать run / Запросить повторный запуск», остальные blocked','ДЕЗ'),
'TASKPLAN-PRO-V2/25570f76:20202q':('RF','«Scape» (2): дерево проектов, страница миссии агента, список сессий с индикаторами контекста и стоимости, Toolkit; канбан «Internal Tickets»','Ж'),
'TASKPLAN-PRO-V3/f9de24ec:1332':('CL','Claude на телефоне, вкладка Code: три безымянные сессии «macbook-pro-kostenc… Connected», старые Disconnected','И'),
'TASKPLAN-PRO-V3/f9de24ec:1395':('CL','Claude Desktop: автодополнение «/rc» без команды remote control + «/rc isn\'t a recognized command here»; лимит «77% Fable 5»','БИ'),
'TASKPLAN-PRO-V3/d09c89fe:7506':('RF','16 образцов Hermes и DeepSeek Harness: Bots, группировка воркспейсов, настройки, подписки с 5-часовым окном, Trajectory с таймлайном Input/Model/Tools','Ж'),
'TASKPLAN-PRO-V3/bb991941:676':('RF','2 образца выбора модели: провайдеры со свёрнутыми группами (подчёркнуты рукой), поиск, шкала усилия, MoA-пресеты','Ж'),
'TASKPLAN-PRO-V3/bb991941:898':('DS','окно «HARNESS · Starting Harness…» со спиннером «уже несколько минут»','Г'),
'TASKPLAN-PRO-V3/bb991941:957q':('DS','«Startup failed — Harness exited early: exit status 1», Retry, Copy Logs (лог скопирован китайским шаблоном)','ВГ'),
'TASKPLAN-PRO-V3/bb991941:1194q':('DS','«Failed to load plugins» — стена путей модулей на весь экран','ВА'),
'TASKPLAN-PRO-V3/bb991941:2176':('DS','чат «какая ты модель?», статусная строка «1 turns · 1 steps · LLM 3.3s · TTFT…», вкладки Chat/Trajectory','ЖЗ'),
'TASKPLAN-PRO-V3/bb991941:2342':('DS','шапка справа: «Expand bottom panel», «Expand sidebar» вместо названных агентом «Open sidebar / Close details»','ЗД'),
'TASKPLAN-PRO-V3/bb991941:2879':('DS','Plugin Market, поиск «dsh-split-view»: единственный результат «dsh-decision-split»','З'),
'TASKPLAN-PRO-V3/bb991941:3039':('DS','главное окно без ожидаемой кнопки, новая сессия «Into the Unknown»','ЗД'),
'TASKPLAN-PRO-V3/bb991941:4294q':('DS','окно с панелью Files справа; владелец формулирует три зоны (левая управление, правая ассистент+терминал+браузер, средняя мультичат по ролям)','Ж'),
'TASKPLAN-PRO-V3/bb991941:4929':('DS','контекстное меню сессии (Rename/Archive/Fork/Refresh), в шапке «no role 12724eab», центр пуст','ЗД'),
'TASKPLAN-PRO-V3/bb991941:5019q':('DS','две пустые колонки «no role», «Empty», поле «Message this column…»','З'),
'TASKPLAN-PRO-V3/bb991941:5204':('DS','три пустых «Into the Unknown» под вкладками reviewer/orchestrator/worker','АДЗ'),
'TASKPLAN-PRO-V3/bb991941:5470':('DS','шапка «WORKFLOW TEAM Architect…Researcher», справа «Owner Ass… glm-5.3-flash» — белый пустой прямоугольник, «Approval requests», «Directive to agents»','ДА'),
'TASKPLAN-PRO-V3/effc9b2f:2276':('RF','17 образцов DeepSeek Harness: сессии, меню группировки, файлы, задачи, терминал, браузер, настройки, шапка ролей','Ж'),
'TASKPLAN-PRO-V3/effc9b2f:2319':('RF','19 образцов DeepSeek Harness: плагин-маркет, уведомления, подписки, боковая карточка, архив, боковые панели','Ж'),
'TASKPLAN-PRO-V3/240df162:17167':('OT','macOS: «python3.11 хочет получить доступ к iCloud Drive / Apple Music»; первый снимок — фото экрана камерой','ИВ'),
'OMG/6a01efce:11766':('CL','Claude Desktop, панель файла: «Couldn\'t find this file … lives outside the working directory … Show in Finder»','ЗВ'),
'OMG/6a01efce:12039':('PI','pi-gui, окно «Edit custom endpoint»: длинный список моделей с чекбоксами, кнопки сохранения не видны, прокрутки нет','А'),
'OMG/6a01efce:12186':('PI','терминал Pi: жёлтое «Anthropic subscription auth is active. Third-party harness usage draws from extra usage…»','ВБ'),
'OMG/6a01efce:12205':('PI','pi-gui: под ответом две полосы прокрутки (горизонтальная и вертикальная)','А'),
'OMG/6a01efce:12234':('RF','макет «Workflow Team» (Stitch), три колонки (по описанию агента; файл не открывался повторно)','Ж'),
'OMG/6a01efce:12247':('RF','4 состояния макета «Workflow Team» (Stitch): New thread, две пустые ленты Team lead/Worker с рейкой Owner Assistant, три колонки','Ж'),
'OMG/f0b671d7:1040':('OT','ComfyUI Desktop: пустой «Unsaved Workflow (2)», иконки слева, «Запустить», «0 активно»','БЗ'),
'HARNESS/bde94333:124':('OW','собственный харнесс localhost:3777: семь колонок по 170 px, у каждой полный набор селекторов, поля ввода и кнопки внизу налезают друг на друга','АБ'),
'HARNESS/bde94333:139':('RF','2 макета «Workflow Team»: роли-вкладки, треды по вендорам, ленты рядом, панель «Проверка», рейка Owner Assistant','Ж'),
'OMG/ebc42c9f:218q':('CL','меню моделей «Sonnet 5 / Haiku 4.5 / More models › Opus 4.7…»; владелец просит подставить свой список','З'),
'HARNESS/fb59eb7f:3321':('OW','верхняя панель «WORKFLOW TEAM Architect … Researcher · ходов идёт: 0»','З'),
'HARNESS/f421b105:869':('CX','Codex Desktop: плашка «Хуки · ОтправкаЗапросаПользователем — hook returned invalid user prompt submit JSON output»','ВБ'),
'HARNESS/f421b105:1068':('CX','Codex (терминал): «Hooks need review: 1 hook is new» с тремя пунктами','Б'),
'HARNESS/f421b105:1081':('CX','Codex (терминал): таблица хуков по событиям (Installed/Active/Review), «Press t to trust all; enter to review hooks; esc to close»','Б'),
'HARNESS/f421b105:1094':('CX','Codex (терминал): предупреждения MCP «filesystem timed out… failed: 45telega, docker, filesystem, postgres» + «Stop hooks · Hook 1 · new · Press t to trust»','ВБ'),
'HARNESS/f421b105:1108':('CX','Codex (терминал): «[x] Hook 1 … Trust: Trusted · Press space or enter to toggle; esc to go back»','БЗ'),
'HARNESS/f421b105:1265':('RF','макет «New thread» (Stitch): «Let\'s build», шаблоны задач, Local/Worktree, рейка Owner Assistant; логотип закрашен','Ж'),
'HARNESS/f421b105:2438':('OW','Settings, вендор Ollama: «ключ нет», «key_not_applicable — вендору ollama ключ API не нужен», адрес API, «Проверить снова»','ВБ'),
'OMG/1964d85b:14091':('CX','Codex Desktop: красный блок «unexpected status 401 Unauthorized: Incorrect API key… url: http://127.0.0.1:11435/…»','В'),
'OMG/1964d85b:14145':('CX','Codex Desktop: «Выбрать модель» — kimi/glm/deepseek/gemma:cloud вперемешку с GPT-6 Astra, GPT-5.6 Sol/Terra/Luna','Б'),
'OMG/1964d85b:14520':('EX','пост в X «We are aware that codex is down…» (владелец: «проблема глобальная»)',''),
'OMG/1964d85b:14591':('CX','Codex Desktop: реплика «ты ожил?» и плашка «Model is not in the configured routing catalog»','В'),
'OMG/1964d85b:22768q':('OT','Devin: ответ «Нет, файл я не читал напрямую — SQL-запрос через sqlite3 к state.vscdb…» на «ты читаешь файл?»','И'),
'OMG/2adee739:1100':('OW','Workbench (asvh-workbench v0.3, Demo Mode), 3 экрана: Threads/#main, New thread «вендор не выбран» с колонкой ассистента и без неё','БЗ'),
'OMG/2adee739:1326':('OW','страница дизайн-концепций (0 Как сейчас / A / B / C): вместо русского текста кракозябры','А'),
}
def msk(ts):
    d=datetime.datetime.strptime(ts[:19],'%Y-%m-%dT%H:%M:%S')+datetime.timedelta(hours=3); return d
rows=[]
for i,(k,rs) in enumerate(items,1):
    key=f"{k[0]}/{k[1]}:{k[2]}{'q' if k[3] else ''}"
    app,desc,pains=M[key]
    rows.append(dict(id=f"S{i:02d}",key=key,ts=msk(rs[0]['ts']),n=len(rs),files=[r['file'] for r in rs],text=rs[0]['text'],app=app,desc=desc,pains=pains,queued=k[3]))
json.dump([{**r,'ts':r['ts'].isoformat()} for r in rows],open(OUT+'/rows.json','w'),ensure_ascii=False,indent=1)
