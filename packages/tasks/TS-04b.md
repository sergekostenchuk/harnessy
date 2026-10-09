# TS-04b — чаты, комната, назначение ролей, вводная, передача контекста (часть 2 из 3 по TS-04)

Статус: договор по согласованной таблице TS-04; после TS-04a. Оркестратор: claude-orch.
**Что входит:** чаты мест `.harness/state/chats.json` (новый/открыть/закрыть/синхронизация/мета, выжимка через ход — строка 28; у роли один активный,
у `room` параллельные), разговор без роли (`makeRoom`, `roomSet`, `roomMove`, `assignRole` с проектом из разговора — строка 17), назначение роли как
действие (`createSeat`, `ensureSeatMaterialized` — 38; специализация через `team.addSeat` и схемы TS-01.1 — 36; «сначала оркестратор»; `onboard` один раз),
вводная из `context.onboarding` (18), передача контекста `handoff` (19), сообщение владельца `chat` с `needDirect` (27), `pins` чатов (через projects).
**Строки TS-04:** 15–20, 27, 28, 36, 38 (частично). **Тесты-источники:** test_roles, test_handoff, test_project_init (комната/проект из разговора/вводная), test_settings (defaultMode).
**Стыки:** использует `Runtime` из a (kick, runTurn для выжимки, TurnScope для assign_role инструментом), `team`/`projects` из TS-03, `Channel` из TS-02.
Опись: точные тексты статусов/заметок/отказов (assign_role, create_seat, chats_new/open, handoff, chat), формат `chats.json` байт в байт.
