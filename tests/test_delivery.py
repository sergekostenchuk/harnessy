"""Доставка: очередь на окно, автоход, страховка автоответа, ask, восстановление."""
import asyncio
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from app.journal import JournalError
from app.server import App


class FakeProvider:
    """Вместо модели: помнит вызовы, умеет держать ход открытым и отвечать заданным текстом."""

    def __init__(self):
        self.calls = []
        self.gate = None
        self.reply = lambda pane, msg: f"ответ {pane.id}"
        self.on_turn = None          # async def (app, pane, msg): действия «агента» во время хода

    async def run_turn(self, pane, message, depth=0):
        self.calls.append((pane.id, message))
        if self.gate is not None:
            await self.gate.wait()
        if self.on_turn:
            await self.on_turn(pane, message)
        pane.publish({"type": "done", "sessionId": pane.session_id, "model": pane.model, "durationMs": 1, "usage": {}})
        return self.reply(pane, message)

    async def list_sessions(self, cwd):
        return []

    async def session_messages(self, cwd, sid):
        return []


async def settle(app, rounds=20):
    """Дать циклам доставки доработать."""
    for _ in range(rounds):
        await asyncio.sleep(0.01)
        if all(t.done() for t in app.pumps.values()) and not any(p.busy for p in app.registry.panes.values()):
            break


def make_app(tmpdir):
    app = App()
    app.fake = FakeProvider()
    app.registry.providers = {"claude": app.fake, "codex": app.fake}
    app.open_project(tmpdir)
    return app


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_owner_message_runs_turn_and_advances_cursor(self):
        async def go():
            app = make_app(self.tmp.name)
            app.post("owner", ["left"], "task", "привет")
            await settle(app)
            self.assertEqual(app.fake.calls, [("left", "привет")])          # одиночная запись владельца — как есть
            self.assertEqual(app.journal.cursors["left"], 1)
            self.assertEqual([m["role"] for m in app.registry.get("left").transcript], ["me", "ai"])
        self.run_async(go())

    def test_queue_while_busy_then_one_turn_for_all(self):
        async def go():
            app = make_app(self.tmp.name)
            app.fake.gate = asyncio.Event()
            app.post("owner", ["left"], "task", "первое")
            await asyncio.sleep(0.02)
            self.assertTrue(app.registry.get("left").busy)
            app.post("owner", ["left"], "task", "второе")
            app.post("right", ["left"], "question", "третье", thread="T1")
            self.assertEqual(len(app.journal.pending_for("left")), 2)
            app.fake.gate.set()
            app.fake.gate = None
            await settle(app)
            left_calls = [c for c in app.fake.calls if c[0] == "left"]
            self.assertEqual(len(left_calls), 2)
            second = left_calls[1][1]
            self.assertIn("Входящие записи: 2", second)
            self.assertIn("второе", second)
            self.assertIn("#3 · question · от правое окно · тред T1", second)
            # страховка: на question от right ушёл автоответ, на task владельца — нет
            answers = [r for r in app.journal.read() if r["kind"] == "answer"]
            self.assertEqual(len(answers), 1)
            self.assertEqual((answers[0]["reply_to"], answers[0]["to"], answers[0]["origin"]), (3, ["right"], "auto"))
            self.assertEqual(answers[0]["thread"], "T1")
        self.run_async(go())

    def test_explicit_reply_suppresses_auto_reply(self):
        async def go():
            app = make_app(self.tmp.name)

            async def agent(pane, msg):
                if pane.id == "right":
                    q = [r for r in pane.turn_records if r["kind"] == "question"][0]
                    app.post("right", ["left"], "answer", "сам отвечаю", reply_to=q["seq"])
            app.fake.on_turn = agent
            app.post("left", ["right"], "question", "сколько будет 2+2?")
            await settle(app)
            answers = [r for r in app.journal.read() if r["kind"] == "answer"]
            self.assertEqual(len(answers), 1)
            self.assertEqual(answers[0]["text"], "сам отвечаю")
            self.assertNotIn("origin", answers[0])
        self.run_async(go())

    def test_ask_waits_for_reply_and_refuses_cycles(self):
        async def go():
            app = make_app(self.tmp.name)
            left, right = app.registry.get("left"), app.registry.get("right")

            async def agent(pane, msg):
                if pane.id == "right":
                    q = [r for r in pane.turn_records if r["kind"] == "question"][0]
                    with self.assertRaises(RuntimeError):            # встречный ask — взаимное ожидание
                        await app.ask(right, "left", "а ты кто?", None)
                    app.post("right", ["left"], "answer", "четыре", reply_to=q["seq"])
            app.fake.on_turn = agent
            reply = await app.ask(left, "right", "сколько будет 2+2?", "T2")
            self.assertEqual(reply["text"], "четыре")
            self.assertEqual(reply["thread"], "T2")
            self.assertEqual(left.asking, set())
            await settle(app)
        self.run_async(go())

    def test_verdict_validation_and_nudge_then_escalation(self):
        async def go():
            app = make_app(self.tmp.name)
            with self.assertRaises(JournalError) as cm:
                app.post("right", ["left"], "verdict", "плохо", reply_to=None, score=5, round_=1)
            self.assertEqual(cm.exception.code, "reply_to_required")
            rr = app.post("left", ["right"], "review-request", "проверь abc123", thread="M-7", evidence=["abc123"])
            with self.assertRaises(JournalError):
                app.post("right", ["left"], "verdict", "плохо", reply_to=rr["seq"], score=11, round_=1)
            app.fake.reply = lambda pane, msg: "посмотрел, всё норм"       # ревьюер «забыл» вердикт
            await settle(app)
            notes = [r for r in app.journal.read() if r["kind"] == "note" and r["from"] == "harness"]
            self.assertEqual(len(notes), 1)                                # напоминание один раз
            await settle(app)
            esc = [r for r in app.journal.read() if r["kind"] == "escalation"]
            self.assertEqual(len(esc), 1)
            self.assertIn("owner", esc[0]["to"])
            good = app.post("right", ["left"], "verdict", "9/10", reply_to=rr["seq"], score=9, round_=1)
            self.assertEqual((good["thread"], good["score"], good["round"]), ("M-7", 9, 1))
        self.run_async(go())

    def test_reply_to_zero_means_none_and_protocol_is_not_a_target(self):
        async def go():
            app = make_app(self.tmp.name)
            r = await app.bridge.do_send("left", {"to": "right", "kind": "note", "text": "x", "reply_to": 0})
            self.assertTrue(r["ok"])
            self.assertIsNone(app.journal.get(r["seq"])["reply_to"])
            with self.assertRaises(JournalError) as cm:
                app.post("left", ["right"], "answer", "y", reply_to=0)
            self.assertEqual(cm.exception.code, "reply_to_missing")
            await settle(app)
        self.run_async(go())

    def test_restart_restores_panes_and_delivers_pending(self):
        async def go():
            app = make_app(self.tmp.name)
            app.registry.update(app.registry.get("left"), {"model": "claude-haiku-4-5-20251001", "mode": "read", "sessionId": None}, lambda p: True)
            app.registry.get("left").session_id = "11111111-1111-1111-1111-111111111111"
            app.save_panes()
            app.fake.gate = asyncio.Event()                                # ход не заканчивается…
            app.post("owner", ["left"], "task", "первое")
            await asyncio.sleep(0.02)
            app.post("owner", ["left"], "task", "второе")                  # …второе ждёт в очереди
            for t in app.pumps.values():
                t.cancel()
            app2 = make_app(self.tmp.name)                                 # перезапуск
            left = app2.registry.get("left")
            self.assertEqual((left.model, left.mode, left.session_id), ("claude-haiku-4-5-20251001", "read", "11111111-1111-1111-1111-111111111111"))
            for p in app2.registry.panes.values():
                app2.kick(p)
            await settle(app2)
            self.assertEqual(app2.fake.calls, [("left", "второе")])       # недоставленное дошло, доставленное не повторилось
        self.run_async(go())


if __name__ == "__main__":
    unittest.main()
