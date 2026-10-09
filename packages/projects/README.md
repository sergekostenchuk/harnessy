# @harnessy/projects

Папки проектов, локальный git/worktree, реестр, закреплённые, настройки и маршруты. Node ≥22, ESM, TypeScript strict; зависимости @harnessy/team 0.1.0 и yaml 2.9.1. Runtime подключает эти функции к действиям и HTTP.

`initProject(path, options, deps)` создаёт папку, свой git при необходимости, `.harness` и первое место оркестратора. Каталог моделей/определение вендора передаются ядром; `defaultModel` сначала берёт модель разговора, затем первую claude/codex каталога. Вызовов моделей нет. `uniqueProject` выбирает незанятое имя с суффиксами -2, -3. `projectSlug`, `projectNameFrom`, `projectsRoot` сохраняют правила Python.

`GitOps` принимает подменяемый runner; `gitops` и функции модуля используют системный git без shell, с таймаутом 60 секунд. `openProjectGit` открывает worktree мест и возвращает замечания для окна. Worktree принимается по границе реального пути, git-common-dir, регистрации git worktree и точной ветке seat/<id>; detached HEAD и чужие папки дают замечание и работу места в корне. Вложенная папка чужого git не считается собственным репозиторием.

Мутации `.harness` и операции git на корне сериализуются общим с team мьютексом канонического пути. `mergeInto` допускает только чистые отслеживаемые файлы, проверяет ветку, новый HEAD и два ожидаемых родителя. Повтор уже влитого SHA возвращает `alreadyMerged` и прежний mergeSha. Конкурирующий внешний git не поддерживается; межпроцессной блокировки нет. Отказы merge возвращают `{ok: false, code: 'merge_failed', error}`; ошибки инструмента/записи — `ProjectError` с code/status/vendorText/cause.

`ProjectRegistry`, `Pins`, `Settings`, `Connections` принимают пути файлов; по умолчанию используются HARNESS_PROJECTS_FILE, HARNESS_LAST_PROJECT_FILE, HARNESS_PINS_FILE, HARNESS_SETTINGS_FILE, HARNESS_CONNECTIONS_FILE или штатные `~/.harness-*`. HARNESS_NO_LAST запрещает обе записи реестра/последнего проекта. JSON сохраняется с Unicode, indent 1 без завершающего LF, в порядке Python-ключей. Последний проект — сырая строка. Записи каждого файла владельца сериализуются отдельно, через tmp + fsync + rename. Тесты используют только временные пути.

`Pins(path, currentProject, chatMeta)` закрепляет любую существующую папку; чат — лишь канонически открытой папки. Подпись чата берётся из chatMeta ядра. `Settings(ownerFile, currentProject)` объединяет project поверх owner; patch валидируется целиком до записи, null удаляет ключ. Содержимое списков не ограничивается; SETTINGS_APPLIES описывает исполняемые ключи, прочие сохраняются.

`Connections(path, {curl, now})` хранит direct/proxy/iface. `proxyEnv` задаёт шесть переменных окружения только для proxy. iface применяется только к диагностическому curl. `setRoute` возвращает processRestartNeeded при изменении route/proxy/iface; runtime должен сбросить процесс провайдера. Каждый setRoute повышает rev, включая expect/label. Проверка иной rev возвращает stale без записи. seq присваивается под блокировкой в порядке завершения: более поздняя завершённая проверка побеждает независимо от часов. Старые rev/seq читаются как 0.

Полный прогон — `npm test` в корне. Git-сценарии используют реальные временные репозитории, сетевые проверки — подменный curl; внешней сети, секретов и данных владельца не требуется.
