# @harnessy/runtime

Живое ядро проекта Harnessy. Node 22+, исходные TypeScript-модули без трансформации. Зависимости — только `@harnessy/providers`, `journal`, `team`, `projects`, `context` версии 0.1.0 и встроенные модули Node.

```ts
import {createRuntime, unavailableActions} from '@harnessy/runtime';

const runtime = await createRuntime({projectDir, appUrl, providers}, unavailableActions);
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

`Pane.settings()`/`persist()`, panes.json, halt.json и обычные chats.json соответствуют Python: порядок ключей, Unicode, разделители, indent 2 без LF, float-формы timestamps. Сериализатор — общий `@harnessy/journal`; projects использует его же. Исключения формата — новые поля deliverySeq/runtime у ai и новый attempts.json. Секреты процесса в эти файлы не записываются.

`deps.stateIO` обслуживает chats/halt/attempts; `deps.journalOptions.fs` — channel/cursors/panes/ack-events. Оба порта используются тестами отказов записи. По умолчанию записи состояния атомарны, с fsync файла и каталога.

## Проверки поведения

Исходники поведения: `test_delivery.py:106/116/290`, `test_halt.py`, `test_events.py`, `test_context.py`, `test_roles.py`; тексты — функции server.py/panes.py/bridge.py. Fixtures settings/persist/chats созданы из Python AST функций без импорта App, сервера и моделей, при фиксированных времени/id. В пакете хранятся только JSON-данные и TS.

Тесты покрывают каждый вход отмены, срок scope и процесса, батч/откат очереди, повтор сессии, steer, owner-ack deliverySeq, шину, восстановление на каждом разрыве порядка 1–4b, две перезагрузки uncertain, неполные/чужие записи, guard после await, смену маршрута. Git/worktree проверяются на настоящем git во временных папках; провайдеры — дублёры. Чистые тексты/Unicode/округление/измерения проверяются отдельно в `@harnessy/context`.
