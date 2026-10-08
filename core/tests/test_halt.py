"""Выключатель «Стоп всем»: ходы не идут, записи ждут в очереди, ничего не теряется; включить обратно — владелец; состояние переживает перезапуск."""
import asyncio
import json
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from tests.test_delivery import calls_of, make_app, settle


class Req:
    def __init__(self, body):
        self._body = body
        self.match_info = {}

    async def json(self):
        return self._body


class HaltTests(unittest.TestCase):
    def test_halt_queues_and_resume_delivers(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                r = json.loads((await app.api_halt(Req({"on": True}))).text)
                self.assertEqual((r["ok"], r["halted"]), (True, True))
                app.post("owner", ["executor"], "task", "первое при стопе")
                await settle(app)
                self.assertEqual(calls_of(app, "executor"), [], "при выключателе ход не идёт")
                self.assertEqual(len(app.journal.pending_for("executor")), 1, "запись ждёт в очереди")
                app2 = await make_app(d)                       # перезапуск: выключатель остаётся включённым
                self.assertTrue(app2.halted)
                for p in app2.registry.panes.values():
                    app2.kick(p)
                await settle(app2)
                self.assertEqual(calls_of(app2, "executor"), [])
                r = json.loads((await app2.api_halt(Req({"on": False}))).text)
                self.assertEqual((r["halted"], r["pending"]), (False, {"executor": 1}))
                await settle(app2)
                self.assertEqual(calls_of(app2, "executor"), [("executor", "первое при стопе")], "после включения очередь ушла в ход")
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
