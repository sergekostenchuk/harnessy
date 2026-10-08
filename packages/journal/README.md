# @harnessy/journal

Хранение и политика обмена ядра Harnessy. Node ≥22, ESM, TypeScript strict.

`Journal(projectDir)` продолжает `.harness/state/channel.ndjson`, курсоры и panes Python-ядра. Писатель один; операции синхронные, append подтверждается после fsync. `write_failed` с `maybeWritten: true` означает неопределённый результат; следующая операция перечитывает неподтверждённый хвост до выдачи seq.

`Policy(path)` разбирает безопасный YAML 1.1. `maybeReload()` атомарно заменяет снимок или сохраняет прежний для диагностики и ставит `broken`. Channel отказывает агентам при broken.

`Channel(deps)` получает роли, живые места, подписи, git-функции и проект от ядра. Агенту доступны только поля `AgentPostInput`; инициатор задаётся ядром. `postCore`, `confirmAck`, `rejectAck` и `Journal.append` предназначены для доверенного ядра, не для инструментов модели. События `posted`, `delivered`, `pendingAck`, `rejected`, `verdict` подключает runtime; пакет не исполняет ходы и не задаёт вопросов владельцу.

`pendingFor(seat)` возвращает `{record, deliverySeq}` в порядке доставки. После успешного хода runtime вызывает `advance(seat, max deliverySeq)`. `record.seq` служит для ответа и отображения. Поздний ack даёт исходной записи новый deliverySeq. Решения ack и состояние threads восстанавливаются из файла без повторных объявлений.

`normalizeReplyTo(input)` — вход инструмента: 0 преобразуется в null. Прямой `Channel.post` с 0 отказывает.

`Evidence`, `resolveEvidence`, `checkReport`, `evidenceDir` проверяют реальную границу проекта и отчёты Ran / Skipped / Planned / Manual со строгим UTF-8.

Golden-файлы в `src/fixtures/python-state` записаны Python-образцом. Сериализация сохраняет пробелы, порядок ключей, Unicode, indent 2 без LF. Побайтная эквивалентность чисел вне целых не обещается.

Проверка: `npm test` в корне — strict-сборка и node:test. Тесты используют временные проекты и подмены файловых ошибок; сеть и провайдеры не нужны.
