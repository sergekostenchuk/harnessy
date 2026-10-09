"""Имя чата роли (Kimi UX-4 №126 п.5): «вводная роли» — только заглушка; первый осмысленный текст (сообщение владельца, иначе ответ модели)
становится именем, и два чата ролей больше не называются одинаково."""
import asyncio
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from test_delivery import make_app


class ChatTitle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def test_placeholder_yields_to_first_meaningful_text(self):
        async def go():
            app = await make_app(self.tmp.name)
            pane = app.registry.get("executor")
            pane.record("peer", "[от харнесс] Ты назначен(а) ролью «исполнитель»…")
            app.save_panes()
            self.assertEqual(app._active_chat(pane)["title"], "вводная роли")
            pane.record("ai", "Я исполнитель проекта и готов к задачам.\nПодробности ниже.")
            app.save_panes()
            self.assertEqual(app._active_chat(pane)["title"], "Я исполнитель проекта и готов к задачам.")
            pane.record("me", "сделай отчёт")                              # имя уже осмысленное — не меняется
            app.save_panes()
            self.assertEqual(app._active_chat(pane)["title"], "Я исполнитель проекта и готов к задачам.")
            other = app.registry.get("reviewer")                            # сообщение владельца — приоритет
            other.record("peer", "[от харнесс] вводная")
            other.record("me", "проверь ветку")
            app.save_panes()
            self.assertEqual(app._active_chat(other)["title"], "проверь ветку")
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
