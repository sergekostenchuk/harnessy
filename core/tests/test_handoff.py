"""Передача контекста между чатами — правила движка (слово владельца 08.10.2026):
пустой источник — отказ; один ответ модели — весь разговор с типовым промптом без выбора; два и более — нужен выбор (409);
одна запись всем адресатам; владелец остаётся в своём чате и видит запись «контекст передан»."""
import asyncio
import json
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from tests.test_delivery import calls_of, make_app, settle
from tests.test_roles import records


class Req:
    def __init__(self, body):
        self._body = body
        self.match_info = {}

    async def json(self):
        return self._body


async def handoff(app, body):
    resp = await app.handoff(Req(body))
    return resp.status, json.loads(resp.text)


class HandoffTests(unittest.TestCase):
    def run_async(self, coro):
        return asyncio.run(coro)

    def test_empty_source_is_refused(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                st, r = await handoff(app, {"to": ["executor"], "from": "assistant"})
                self.assertEqual((st, r["ok"]), (400, False))
                self.assertEqual(records(app, origin="handoff"), [])
        self.run_async(go())

    def test_single_answer_goes_whole_and_owner_stays(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                src = app.registry.get("assistant")
                src.record("me", "как дела с планом?")
                src.record("ai", "план в трёх шагах")
                st, r = await handoff(app, {"to": "executor", "from": "assistant"})
                self.assertEqual((st, r["ok"], r["answers"]), (200, True, 1))
                rec = records(app, origin="handoff")
                self.assertEqual(len(rec), 1)
                self.assertEqual((rec[0]["from"], rec[0]["to"], rec[0]["kind"]), ("owner", ["executor"], "note"))
                self.assertTrue(rec[0]["text"].startswith(f"Прочитай контекст чата от {src.label} и жди команду."), rec[0]["text"][:80])
                self.assertIn("план в трёх шагах", rec[0]["text"])
                await settle(app)
                self.assertTrue(any("план в трёх шагах" in c[1] for c in calls_of(app, "executor")), "адресат получил контекст ходом")
                self.assertEqual(calls_of(app, "assistant"), [], "источник хода не делает — владелец остался в своём чате")
                last = src.transcript[-1]
                self.assertEqual(last["role"], "peer")
                self.assertIn("контекст передан", last["text"])
                self.assertIn(app.registry.get("executor").label, last["text"])
                self.assertIn(f"№{rec[0]['seq']}", last["text"])
        self.run_async(go())

    def test_two_answers_need_selection(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                src = app.registry.get("assistant")
                for q, a in (("а", "первый ответ"), ("б", "второй ответ")):
                    src.record("me", q)
                    src.record("ai", a)
                st, r = await handoff(app, {"to": ["executor"], "from": "assistant"})
                self.assertEqual((st, r["ok"], r.get("needSelection"), r["answers"]), (409, False, True, 2))
                self.assertEqual(records(app, origin="handoff"), [])
                st, r = await handoff(app, {"to": ["executor"], "from": "assistant", "text": "Прочитай и жди.\n\nВладелец: б\n\nОтвет: второй ответ"})
                self.assertEqual((st, r["ok"]), (200, True))
                rec = records(app, origin="handoff")
                self.assertEqual(len(rec), 1)
                self.assertTrue(rec[0]["text"].startswith("Прочитай и жди."))
                self.assertNotIn("первый ответ", rec[0]["text"])
        self.run_async(go())

    def test_many_targets_one_record(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                src = app.registry.get("assistant")
                src.record("me", "вопрос")
                src.record("ai", "единственный ответ")
                st, r = await handoff(app, {"to": ["executor", "reviewer", "executor"], "from": "assistant"})
                self.assertEqual((st, r["ok"]), (200, True))
                rec = records(app, origin="handoff")
                self.assertEqual(len(rec), 1)
                self.assertEqual(rec[0]["to"], ["executor", "reviewer"])
                await settle(app)
                self.assertTrue(calls_of(app, "executor") and calls_of(app, "reviewer"))
                note = src.transcript[-1]["text"]
                self.assertIn(app.registry.get("executor").label, note)
                self.assertIn(app.registry.get("reviewer").label, note)
        self.run_async(go())

    def test_self_unknown_and_empty_targets(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                src = app.registry.get("assistant")
                src.record("me", "x")
                src.record("ai", "y")
                self.assertEqual((await handoff(app, {"to": ["assistant"], "from": "assistant"}))[0], 400)
                self.assertEqual((await handoff(app, {"to": ["nobody"], "from": "assistant"}))[0], 404)
                self.assertEqual((await handoff(app, {"to": [], "from": "assistant"}))[0], 404)
                self.assertEqual(records(app, origin="handoff"), [])
        self.run_async(go())


if __name__ == "__main__":
    unittest.main()
