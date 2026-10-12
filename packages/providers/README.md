# @harnessy/providers

Провайдеры-программы за одним интерфейсом `Provider` (`runTurn`, `listSessions`,
`sessionMessages`, `auth`, `models`, `reset`, `close`). Runtime ничего не знает о
конкретной программе: провайдеры подставляются как `RuntimeDeps.providers[vendor]`.

## Что внутри

- Реализации: Claude (Agent SDK), Codex (app-server JSON-RPC), Antigravity, GitHub
  Copilot, Gemini CLI, Kimi Code, Qwen Code, Devin, OpenCode, Ollama (локальный).
- Каталог (`catalog*.ts`, `/api/providers/catalog`): установлена ли программа, выполнен
  ли вход, какие модели и какие режимы места (чат / чтение / правка / всё / спрашивать)
  она поддерживает на самом деле. Неподдержанный режим не угадывается.
- Вход и проверка (`catalog-login.ts`, `catalog-auth.ts`), планировщик обновления
  каталога, диагностика отказов (`diagnostic.ts`), отмена хода (`cancellation.ts`).

Модели по API (DeepSeek, GLM, Kimi, OpenRouter, Ollama Cloud, свой адрес) здесь не
живут: это `@harnessy/llm` и собственный агентный цикл в `runtime`.

## Как добавить программу

Реализовать `Provider`, описать возможности в каталоге, зарегистрировать вендора в
зависимостях. Очередь, восстановление и журнал не меняются.
