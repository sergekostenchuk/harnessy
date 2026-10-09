# TS-04a — `runtime` ядро + `context` (часть 1 из 3 по TS-04)

Статус: договор по согласованной таблице TS-04 (круги №36/№42, строки 1–44); опись → код. Оркестратор: claude-orch.
**Что входит:** пакет `context` целиком (вводная, заметка роли, промпт передачи, текст ленты, сводка `{text, nextSeen}`, оценка токенов и окно модели,
карточка контекста — чистые функции, файлы читает runtime); пакет `runtime` — `Pane`/`Registry`/`Approval` (settings/persist байт в байт), шина событий
(подписчики на места и владельца, `all` с меткой, очередь 4000, переполнение закрывает соединение целиком — см. TS-05 стр. 8), очередь и доставка
(`kick`/`pump` по `DeliveryEntry`, `renderInbox`, откат ленты при отказе, события `error` + `note`), **ход** (`runTurn`: снимок `carry`/`digest`,
`TurnContext` с `signal`/`session`/`setHandle`/`env`/`roleNote`/`peers`/`tools`/`writableRoots`/токены, порядок эффектов строки 40: запись `ai` с
`deliverySeq` → `advance` → `afterTurn` → `savePanes`, восстановление без модели), попытка ≠ ход при `session_missing` (44), единая отмена
`cancelTurn` (32, 42: scope сразу, `busy` после завершения провайдера по `turnInstanceId`, 30 с → reset), `TurnScope` и реестр токенов (33, 26),
`validateBridge` → scope, открытие проекта и восстановление (строка 10; `pendingAcks` → карточки — часть c, но вызов отсюда), `halt`, `interrupt`, `steer` (31),
`pane_set`/`Registry.update` (23), `openSession` (TS-05 стр. 11), `setRoute` с `provider.reset` (TS-05 стр. 12).
**Строки TS-04:** 1, 2, 10–14, 21–23, 26, 29–33, 37–39, 40, 42–44. **Тесты-источники:** test_delivery 106/116/290, test_halt, test_context, test_events, test_roles (часть вводной).
**Стыки для b/c:** экспортирует `Runtime` с методами `kick/runTurn/cancelTurn/openProject/close`, шину, реестр токенов, `TurnScope`; b и c добавляют действия поверх.
Опись: точные тексты событий/`note`/ошибок из server.py (pump/run_turn/interrupt/halt/steer), поля `settings()`/`persist()`, формат `panes.json`/`halt.json`.
