"""Цена хода живёт в реплике чата, а не в окне (находка Kimi UX-3 №106 п.1): провайдер отдаёт usage/durationMs на done →
реплика ai получает их → история чата отдаёт как есть; ход без расхода — без ключей, расход прежнего хода не наследуется."""
import asyncio
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from test_delivery import make_app, settle


class UsageInTranscript(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def test_usage_recorded_for_this_turn_only(self):
        async def go():
            app = await make_app(self.tmp.name)
            pane = app.registry.get("executor")

            async def on_turn(p, msg):
                p.last_usage = {"usage": {"input": 10, "output": 5, "cacheRead": 0}, "durationMs": 1200}
            app.fake.on_turn = on_turn
            app.post("owner", ["executor"], "task", "привет")
            await settle(app)
            ai = [m for m in pane.transcript if m["role"] == "ai"][-1]
            self.assertEqual(ai["usage"], {"input": 10, "output": 5, "cacheRead": 0})
            self.assertEqual(ai["durationMs"], 1200)
            app.fake.on_turn = None                                   # ход без расхода: ключей нет, прежний не наследуется
            app.post("owner", ["executor"], "task", "ещё")
            await settle(app)
            ai2 = [m for m in pane.transcript if m["role"] == "ai"][-1]
            self.assertNotIn("usage", ai2)
            self.assertNotIn("durationMs", ai2)
            chat = app._active_chat(pane)                             # история чата отдаёт реплику с расходом как есть
            self.assertEqual([m.get("usage") for m in chat["transcript"] if m["role"] == "ai"], [{"input": 10, "output": 5, "cacheRead": 0}, None])
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
