# @harnessy/runtime

Живое ядро проекта Harnessy. Node 22+, исходные TypeScript-модули без трансформации. Зависимости — только `@harnessy/providers`, `journal`, `team`, `projects`, `context` версии 0.1.0 и встроенные модули Node.

```ts
import {createRuntime, unavailableActions, withRoleActions} from '@harnessy/runtime';

const runtime = await createRuntime({projectDir, appUrl, providers}, withRoleActions(unavailableActions));
const owner = {seat: 'owner', trust: 'owner'} as const; // привязку задаёт API
runtime.postOwner({to: 'executor', kind: 'task', text: 'Поручение'}, owner);
```

`providers` создаёт приложение; затем доступ к ним проходит через runtime: `auth`, `models`, `listSessions`, `sessionMessages`, `openSession`, `resetVendor`, `close`. Каталог моделей можно передать через `deps.models`; без него runtime получает метаданные `provider.models()` до создания Registry. Ошибки каталога попадают в `lineErrors`. Запуск модели происходит только при ходе.

## Порты действий и срок полномочий

Второй аргумент `createRuntime(deps, actions)` обязателен. `RuntimeActions` содержит `ask`, `merge`, `assignRole`, `afterTurn`, `restorePendingAcks`, `cancelAsks`. Первые три получают неизменяемый `ActionContext`: `scope`, глубокий снимок `turnRecords`, глубину текущего хода и `assertActive()`. После ожидания порт обязан вызвать **тот же** `assertActive()` непосредственно перед защищённым эффектом. Поручение берётся из `turnRecords`, а не из аргументов инструмента.

`send/readPane/ask/merge/assignRole(scope,args)` возвращают исходные формы Python-моста: `send → {ok,seq,thread,to}`, `readPane → {ok,text}`, `ask → {ok,reply,seq}`, `merge → {ok,sha,mergeSha,branch,thread?}`, `assignRole → {ok,pane,label,model,mode,mandate}`. Отказ: `{ok:false,code,error}`. `toolsFor(scope)` переводит эти результаты в `PeerTools {ok,text}` по `bridge.py`; HTTP-слою разбирать текст не нужно. `send` принимает строку адресатов или список; `from` определяется только scope. Лишнее поле `from` отвергается Channel.

`unavailableActions` возвращает явный `unavailable` для ещё не подключённых действий TS-04b/c. `afterTurn → 'unavailable'` оставляет долговечный флаг незавершённых эффектов; очередь продвигается, модель повторно не запускается. Непустой `Channel.pendingAcks()` при недоступном восстановлении даёт `error` владельцу и `lineErrors`.

`validateBridge(from,token)` возвращает текущий неизменяемый `TurnScope`. Токен привязан к поколению проекта, месту и вендору процесса. Верный токен простаивающего процесса даёт `turn_ended`; неизвестный, отозванный, чужой или от другого вендора — `token_invalid`. Регистрация/отзыв процесса живут дольше хода; старые callbacks не могут зарегистрировать токен после reset/смены проекта. После отмены все старые инструменты сразу получают `turn_ended`.

`Pane.relayDepth` — глубина следующего батча, которую выставляет порт постановки вопроса. Начало хода потребляет её в неизменяемый снимок ActiveTurn/ActionContext. Поздняя постановка вопроса не меняет глубину уже идущего хода.

## Доставка, остановка и восстановление

`postOwner`, `paneSet`, `halt`, `interrupt`, `approve`, `steer`, `openSession`, `setRoute` получают доверенный `Initiator` владельца явно. API разбирает запрос и создаёт привязку; поля тела не дают прав. `paneSet` снимает `cwd`, внутренний `Registry.update` поддерживает восстановление cwd. Сохранённый panes.json восстанавливает только model/mode/sessionId/digest/vendor. `openSession` после await проверяет проект, идентичность и ревизию места, vendor/cwd и занятость.

`kick` объединяет накопленные `DeliveryEntry` в один ход. Стоп без работы продвигает курсор без модели. `steer` доставляется непосредственно handle, не двигает курсор и не становится очередным заданием. Отказ записывается владельцу как `rejected`. Откат неудачного хода удаляет только внедрённые входящие реплики, сохраняя вмешательства и прежнюю историю.

До вызова провайдера атомарно сохраняется `attempts.json`. После результата порядок такой:

1. `ai` в chats.json с `deliverySeq` и `runtime {turnInstanceId,recordSeqs,effectsPending,interrupted,nextSeen}`; пустой ответ тоже долговечен.
2. Снять отметку попытки; продвинуть Journal по **deliverySeq**, включая seq подтверждения owner-ack.
3. Идемпотентный `afterTurn → completed|unavailable`.
4. Применить seen/carry, сохранить panes/chats; только после `completed` и успешной записи снять effectsPending отдельной записью chats.json.

Ошибка записи ответа удерживает его в памяти в состоянии `recovering`. Следующий kick повторяет локальные эффекты без модели. При открытии проекта восстанавливаются ответы с deliverySeq выше курсора или effectsPending. Их recordSeqs проверяются по журналу; отсутствующие поля/несовпадение блокируют автоматику и дают `error`. Завершённые старые результаты не перепроверяются при каждом ходе.

Отметка попытки без результата становится долговечным `uncertain`. Перезапуски и сообщения агентов её не снимают. На каждом открытии показывается точная подсказка об очереди; её также получает новая подписка. Снять отметку перед своим kick может сообщение владельца месту, paneSet или снятие halt. Закрытие проекта ждёт очистку runtime-ходов: попытка до modelStarted снимается, возможный запуск без результата остаётся uncertain.

`cancelTurn` объединяет interrupt/halt/stop/reset/закрытие проекта: сначала отзыв scope, затем deny карточек, abort сигнала, cancelAsks, interrupt handle. Busy снимается после завершения провайдера/его cleanup с проверкой turnInstanceId. Через 30 секунд runtime вызывает один reset вендора; часы управляются через `deps.clock`. До modelStarted отмена оставляет очередь и даёт «ход отменён»; после modelStarted любой исход остановки превращается в один interrupted done, долговечный результат и записанную идемпотентно note. Ошибка записи halt не мешает остановить живые ходы; неудачное снятие halt не запускает очередь.

`session_missing` при resume повторяется ровно один раз с той же логической посылкой и без сессии; промежуточный терминал скрыт. Поздние callbacks первой попытки не меняют вторую. `setRoute` закрывает scopes вендора и блокирует новые запуски до окончания reset; следующий TurnContext получает свежий proxyEnv. label/expect не требуют перезапуска.

## События и файлы

`subscribe({pane}|{owner:true}|{all:true})` возвращает `{events,closed,close}`. Все подписки относятся к шине проекта. Сначала синхронно воспроизводятся карточки, затем диагностические сообщения восстановления и живые события. `all` добавляет поле pane, видит новые места без переподключения. Ёмкость 4000; переполнение закрывает подписку целиком, очищает очередь и завершает ожидающий next. Смена проекта закрывает также owner-потоки.

`Pane.settings()`/`persist()`, panes.json, halt.json и обычные chats.json соответствуют Python: порядок ключей, Unicode, разделители, indent 2 без LF, float-формы timestamps. Сериализатор — общий `@harnessy/journal`; projects использует его же. Исключения формата — новые поля deliverySeq/runtime/usage/durationMs у ai, attempts.json и seat-materialization.json. Секреты процесса в эти файлы не записываются.

`deps.stateIO` обслуживает chats/halt/attempts/seat-materialization; `deps.journalOptions.fs` — channel/cursors/panes/ack-events. Оба порта используются тестами отказов записи. По умолчанию записи состояния атомарны, с fsync файла и каталога.

## Проверки поведения

Исходники поведения: `test_delivery.py:106/116/290`, `test_halt.py`, `test_events.py`, `test_context.py`, `test_roles.py`; тексты — функции server.py/panes.py/bridge.py. Fixtures settings/persist/chats созданы из Python AST функций без импорта App, сервера и моделей, при фиксированных времени/id. В пакете хранятся только JSON-данные и TS.

Тесты покрывают каждый вход отмены, срок scope и процесса, батч/откат очереди, повтор сессии, steer, owner-ack deliverySeq, шину, восстановление на каждом разрыве порядка 1–4b, две перезагрузки uncertain, неполные/чужие записи, guard после await, смену маршрута. Git/worktree проверяются на настоящем git во временных папках; провайдеры — дублёры. Чистые тексты/Unicode/округление/измерения проверяются отдельно в `@harnessy/context`.


## Чаты и операции владельца (TS-04b)

`chatsList`, `chatGet`, `chatsNew({pane,carry})`, `chatsOpen({chat,carry})` требуют доверенный `initiator`. У роли прежний чат закрывается; у комнаты чаты параллельны. `text` переносит текст, `none` начинает с чистого листа. `summary` у роли с историей делает обычный отменяемый ход с точным промптом выжимки, оставляет ответ в прежнем чате и переключает чат только после успешного долговечного результата. Очередь этого места выжимкой не расходуется. `chatsOpen` переносит только точный `text`; прочие значения не делают выжимку. Резервирование места защищает смену чата от concurrent paneSet, session read, запуска и назначения.

`roomSet`, `makeRoom`, `roomMove`, `assignRoomRole`, `roleCatalog` обслуживают разговор без роли. Без проекта — `deps.defaultDir` (по умолчанию CHAT_WORK_DIR или /Users/Shared/simple-claude-chat), также room в режиме chat. Из такого разговора доступен оркестратор: создаётся уникальная папка по первой реплике через projects.uniqueProject, git и .harness без посева второй роли. При переносе папки история/прежний carry передаются текстом один раз; сессия сохраняется только при совпадении исходных vendor и cwd. Вводная и автоматическая очередь запускаются после сохранения перенесённого разговора. Неуспевшая операция не переключает другой проект, выбранный во время ожидания.

`createSeat`, `assignRoomRole`, `onboard` и `ensureSeatMaterialized(sid, initiator, operationId?)` используют общий материализатор. Для инструмента `assign_role` приложение собирает порт через `withRoleActions(baseActions)`: он сохраняет остальные порты и заменяет assignRole. Инструмент доступен оркестратору только по записи владельца в неизменяемом снимке текущего хода; scope повторно проверяется под живой блокировкой проекта непосредственно перед записью. Посев оркестратора/обычная загрузка team не отправляют вводную; старые места получают её при первом onboard. Список незавершённых назначений восстанавливается при открытии до запуска очередей. Замена одиночной роли получает собственные status и вводную.

`seat-materialization.json` содержит массив операций: operationId (id нового чата), sid, by/how, нормализованный input (role/vendor/model/mode/specialization, снимок выбранных инструкций, label/writePaths/worktree, mandate для инструмента), files.seat, полный source.chat с cwd и source.carry, stages team/seatFile/chat/status/onboarding. Запись намерения предшествует эффектам; восстановление использует сохранённые defaults и сверяет место с входом. Python этот новый файл не читает. Собственный фиксированный файл специализации принимается повтором только с совпадающим содержимым; ссылка/чужой файл дают seat_file_exists. Файл специализации содержит базовую инструкцию + два LF + text, title становится label, права остаются у каталожной роли.

Чат назначения является квитанцией этапа chat: повтор не перезаписывает поздние ответы и не очищает комнату повторно. Status получает thread assignment:<operationId>; вводная остаётся без thread и ищется только после status.seq этой операции. Ошибка отметки после append не создаёт вторую запись. Повреждённая операция/несовпадение места блокирует материализацию и автоматический запуск, причина доступна в lineErrors и типизированном отказе.

`chat({pane,message,kind,direct,...settings}, initiator)` — готовый порт для API владельца. При наличии оркестратора обращение к другой роли требует direct, иначе RuntimeError direct_required (409, fields.needDirect). Комната, оркестратор и команда без оркестратора исключены. Допустимы task/question/note/stop/resume/decision; stop проходит общий cancelTurn. from/by/mandate запроса не дают полномочий. `postOwner` — нижний порт записи ядра; API сообщения владельца использует chat.

`handoff({from,to,kind,text}, initiator)` отправляет одну запись origin handoff всем адресатам; источник остаётся активным и получает запись «контекст передан…». При двух ответах и более без text возвращается selection_required (fields.needSelection/answers); пределы текста — готовый context.transcriptText (12000 кодовых точек) и 60000 для заданного текста. Доставка адресатам пользуется обычной очередью.

`settingsGet/settingsPatch` и `pinsGet/pinSet` делегируют packages/projects. deps.settings/deps.pins принимают экземпляры или фабрики с callback текущего проекта; Pins дополнительно получает достоверный chatMeta. Usage и durationMs у новой ai берутся только из настоящего окончательного done перед commitResult, включая нули/null; синтетический done при отмене не заимствует расход прежнего хода.

Регрессии TS-04b: chats/rooms/roles/handoff/owner-chat.test.ts и team/templates.test.ts. Мосты — invokeTool и отдельный процесс pane-mcp с подменённым fetch (без сети/моделей); окна восстановления — write before/after, два перезапуска, полная исходная операция при изменённых defaults, подмена файла и манифеста, queued scope/target/session/project. fixtures/chats-ts04b-python.json создан Python json.dumps(ensure_ascii=False, indent=2), без LF; содержит Unicode, float-формы, расход и неизвестные поля, сравнение побайтное.

Название чата: первая строка первой me, иначе первой непустой ai; при вводной без такого текста — «вводная роли». Пустое имя/эта заглушка переименовываются при следующей синхронизации; осмысленное имя сохраняется. Длина — 60 кодовых точек, me имеет приоритет перед ai в одной синхронизации (уточнение №128).
