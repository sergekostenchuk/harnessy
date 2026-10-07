"""Доставка и политика: очередь на место, автоход, страховка автоответа, ask, owner-ack,
границы вердиктов, наблюдение, восстановление. Места — из шаблона team.yaml."""
import asyncio
import os
import shutil
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app.journal import JournalError
from app.server import App
from app.team import TEMPLATES


class FakeProvider:
    """Вместо модели: помнит вызовы, умеет держать ход открытым и отвечать заданным текстом."""

    def __init__(self):
        self.calls = []
        self.gate = None
        self.reply = lambda pane, msg: f"ответ {pane.id}"
        self.on_turn = None

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

    async def close(self):
        pass


async def settle(app, rounds=40):
    for _ in range(rounds):
        await asyncio.sleep(0.01)
        if all(t.done() for t in app.pumps.values()) and not any(p.busy for p in app.registry.panes.values()):
            break


def full_team(root):
    """Тесты доставки/политики идут на полной команде из templates/team.yaml.
    Новая папка сама по себе ролей не получает (слово владельца 07.10.2026) — шаблон кладём явно."""
    h = Path(root) / ".harness"
    h.mkdir(parents=True, exist_ok=True)
    if not (h / "team.yaml").exists():
        shutil.copyfile(TEMPLATES / "team.yaml", h / "team.yaml")
    return h


async def make_app(tmpdir):
    full_team(tmpdir)
    app = App()
    app.fake = FakeProvider()
    app.codex = app.fake                      # чтобы open_project не трогал настоящий Codex
    await app.open_project(tmpdir)
    app.registry.providers = {"claude": app.fake, "codex": app.fake}
    return app


def calls_of(app, seat):
    return [c for c in app.fake.calls if c[0] == seat]


def report(root, thread, rnd):
    d = Path(root, ".harness", "evidence", thread, f"r{rnd}")
    d.mkdir(parents=True, exist_ok=True)
    (d / "report.md").write_text("# Ran\nтесты\n# Skipped\n—\n# Planned\n—\n# Manual\n—\n", "utf-8")
    return f".harness/evidence/{thread}/r{rnd}/report.md"


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_line_is_created_from_templates_and_seats_exist(self):
        async def go():
            app = await make_app(self.tmp.name)
            h = Path(self.tmp.name) / ".harness"
            self.assertTrue((h / "team.yaml").exists() and (h / "comms-policy.yaml").exists() and (h / "roles" / "executor.md").exists())
            self.assertEqual(set(app.registry.ids), {"assistant", "orchestrator", "architect", "executor", "reviewer", "tester", "researcher"})
            self.assertEqual(app.registry.get("reviewer").role, "reviewer")
            self.assertTrue(all("не git" in e for e in app.line_errors), app.line_errors)   # tmp не под git: worktree нет, это не ошибка
            note = app.role_note(app.registry.get("executor"))
            self.assertIn("Роль: исполнитель", note)
            self.assertIn("reviewer (ревьюер): review-request", note)
        self.run_async(go())

    def test_owner_message_runs_turn_and_advances_cursor(self):
        async def go():
            app = await make_app(self.tmp.name)
            app.post("owner", ["executor"], "task", "привет")
            await settle(app)
            self.assertEqual(calls_of(app, "executor"), [("executor", "привет")])
            self.assertEqual(app.journal.cursors["executor"], 1)
            self.assertEqual([m["role"] for m in app.registry.get("executor").transcript], ["me", "ai"])
        self.run_async(go())

    def test_queue_while_busy_then_one_turn_for_all(self):
        async def go():
            app = await make_app(self.tmp.name)
            app.fake.gate = asyncio.Event()
            app.post("owner", ["executor"], "task", "первое")
            await asyncio.sleep(0.02)
            self.assertTrue(app.registry.get("executor").busy)
            app.post("owner", ["executor"], "task", "второе")
            app.post("reviewer", ["executor"], "question", "третье", thread="T1")
            # «первое» ещё в ходу и тоже не доставлено: курсор сдвигается после успешного хода, а не до (07.10.2026)
            self.assertEqual(len(app.journal.pending_for("executor")), 3)
            app.fake.gate.set()
            app.fake.gate = None
            await settle(app)
            ex = calls_of(app, "executor")
            self.assertEqual(len(ex), 2)
            second = ex[1][1]
            self.assertIn("Входящие записи: 2", second)
            self.assertIn("второе", second)
            self.assertIn("#3 · question · от ревьюер · тред T1", second)
            answers = [r for r in app.journal.read() if r["kind"] == "answer"]
            self.assertEqual(len(answers), 1)
            self.assertEqual((answers[0]["reply_to"], answers[0]["to"], answers[0]["origin"], answers[0]["thread"]), (3, ["reviewer"], "auto", "T1"))
        self.run_async(go())

    def test_explicit_reply_suppresses_auto_reply(self):
        async def go():
            app = await make_app(self.tmp.name)

            async def agent(pane, msg):
                if pane.id == "architect":
                    q = [r for r in pane.turn_records if r["kind"] == "question"][0]
                    app.post("architect", ["executor"], "answer", "сам отвечаю", reply_to=q["seq"])
            app.fake.on_turn = agent
            app.post("executor", ["architect"], "question", "какой контракт у модуля?")
            await settle(app)
            answers = [r for r in app.journal.read() if r["kind"] == "answer"]
            self.assertEqual(len(answers), 1)
            self.assertEqual(answers[0]["text"], "сам отвечаю")
            self.assertNotIn("origin", answers[0])
        self.run_async(go())

    def test_ask_waits_for_reply_and_refuses_cycles(self):
        async def go():
            app = await make_app(self.tmp.name)
            ex, ar = app.registry.get("executor"), app.registry.get("architect")

            async def agent(pane, msg):
                if pane.id == "architect":
                    q = [r for r in pane.turn_records if r["kind"] == "question"][0]
                    with self.assertRaises(RuntimeError):
                        await app.ask(ar, "executor", "а ты кто?", None)
                    app.post("architect", ["executor"], "answer", "четыре", reply_to=q["seq"])
            app.fake.on_turn = agent
            reply = await app.ask(ex, "architect", "сколько будет 2+2?", "T2")
            self.assertEqual((reply["text"], reply["thread"]), ("четыре", "T2"))
            self.assertEqual(ex.asking, set())
            await settle(app)
        self.run_async(go())

    def test_policy_denies_task_from_reviewer_and_records_rejection(self):
        async def go():
            app = await make_app(self.tmp.name)
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "task", "сделай так")
            self.assertEqual(cm.exception.code, "policy_denied")
            self.assertIn("reviewer может писать executor только", str(cm.exception))
            rej = [r for r in app.journal.read() if r["kind"] == "rejected"]
            self.assertEqual(len(rej), 1)
            self.assertEqual(rej[0]["to"], ["owner"])
            self.assertEqual(app.journal.pending_for("executor"), [])
            r = await app.bridge.do_send("tester", {"to": "executor", "kind": "task", "text": "x"})
            self.assertEqual((r["ok"], r["code"]), (False, "policy_denied"))
            ok = await app.bridge.do_send("assistant", {"to": "executor", "kind": "task", "text": "от имени владельца"})
            self.assertTrue(ok["ok"])
            await settle(app)
        self.run_async(go())

    def test_observe_policy_limits_read_pane(self):
        async def go():
            app = await make_app(self.tmp.name)
            app.registry.get("executor").record("ai", "секрет исполнителя")
            self.assertTrue(app.bridge.do_read("reviewer", {"pane": "executor"})["ok"])
            self.assertTrue(app.bridge.do_read("orchestrator", {"pane": "researcher"})["ok"])
            denied = app.bridge.do_read("executor", {"pane": "reviewer"})
            self.assertEqual((denied["ok"], denied["code"]), (False, "policy_denied"))
            denied2 = app.bridge.do_read("researcher", {"pane": "executor"})
            self.assertFalse(denied2["ok"])
            ex, rv = app.registry.get("executor"), app.registry.get("reviewer")
            rv.digest = True
            self.assertIn("секрет исполнителя", app.registry.build_digest(rv))
            ex.digest = True
            rv.record("ai", "секрет ревьюера")
            self.assertEqual(app.registry.build_digest(ex), "")
        self.run_async(go())

    def test_verdict_rules_bounds_and_acceptance(self):
        async def go():
            app = await make_app(self.tmp.name)
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "плохо", reply_to=None, score=5, round_=1)
            self.assertEqual(cm.exception.code, "reply_to_required")
            rr = app.post("executor", ["reviewer"], "review-request", "проверь abc123", thread="M-7", evidence=["abc123"])
            ev1 = report(self.tmp.name, "M-7", 1)
            with self.assertRaises(JournalError):
                app.post("reviewer", ["executor"], "verdict", "плохо", reply_to=rr["seq"], score=11, round_=1, evidence=[ev1])
            q = app.post("executor", ["reviewer"], "question", "как дела?", thread="M-7")
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "плохо", reply_to=q["seq"], score=5, round_=1, evidence=[ev1])
            self.assertEqual(cm.exception.code, "policy_denied")
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "плохо", reply_to=rr["seq"], score=5, round_=4, evidence=[ev1])
            self.assertIn("max_rounds", str(cm.exception))
            app.fake.reply = lambda pane, msg: "посмотрел, всё норм"
            await settle(app)
            notes = [r for r in app.journal.read() if r["kind"] == "note" and r["from"] == "harness"]
            self.assertEqual(len(notes), 1)
            await settle(app)
            esc = [r for r in app.journal.read() if r["kind"] == "escalation"]
            self.assertEqual(len(esc), 1)
            self.assertIn("owner", esc[0]["to"])
            low = app.post("reviewer", ["executor"], "verdict", "7/10", reply_to=rr["seq"], score=7, round_=1, evidence=[ev1])
            self.assertFalse(low["accepted"])
            good = app.post("reviewer", ["executor"], "verdict", "9/10", reply_to=rr["seq"], score=9, round_=2, evidence=[report(self.tmp.name, "M-7", 2)])
            self.assertEqual((good["thread"], good["score"], good["round"], good["accepted"]), ("M-7", 9, 2, True))
            await settle(app)
            statuses = [r for r in app.journal.read() if r["kind"] == "status" and r["from"] == "harness"]
            self.assertEqual(len(statuses), 2)
            self.assertIn("принято", statuses[-1]["text"])
            self.assertEqual(statuses[-1]["to"], ["orchestrator"])
            self.assertEqual(app.threads["M-7"]["accepted"], True)
            rr2 = app.post("executor", ["reviewer"], "review-request", "проверь def456", thread="M-8")
            app.post("reviewer", ["executor"], "verdict", "3/10", reply_to=rr2["seq"], score=3, round_=3, evidence=[report(self.tmp.name, "M-8", 3)])
            esc = [r for r in app.journal.read() if r["kind"] == "escalation" and r.get("thread") == "M-8"]
            self.assertEqual(len(esc), 1)
            await settle(app)
        self.run_async(go())

    def test_owner_ack_route_holds_record_until_approved(self):
        async def go():
            app = await make_app(self.tmp.name)
            pol = Path(self.tmp.name) / ".harness" / "comms-policy.yaml"
            text = pol.read_text("utf-8").replace("version: 1", "version: 2")
            needle = "  - from: tester\n    to: [executor, orchestrator, owner]\n    kinds: [report, question, answer, note, escalation]"
            self.assertIn(needle, text)
            pol.write_text(text.replace(needle, needle + "\n    trigger: owner-ack"), "utf-8")
            os.utime(pol, (os.path.getmtime(pol) + 5, os.path.getmtime(pol) + 5))
            rec = app.post("tester", ["executor"], "report", "тесты падают")
            self.assertEqual(rec.get("ack"), "pending")
            self.assertEqual(app.policy.version, 2)
            self.assertEqual(len([r for r in app.journal.read() if r["kind"] == "policy"]), 1)
            await asyncio.sleep(0.02)
            self.assertEqual(app.journal.pending_for("executor"), [])
            tester = app.registry.get("tester")
            self.assertEqual(len(tester.approvals), 1)
            tester.resolve_approval(next(iter(tester.approvals)), True)
            await settle(app)
            self.assertTrue(any("тесты падают" in c[1] for c in calls_of(app, "executor")))
            acks = [r for r in app.journal.read() if r["kind"] == "ack"]
            self.assertEqual((len(acks), acks[0]["reply_to"]), (1, rec["seq"]))
        self.run_async(go())

    def test_reply_to_zero_means_none_and_protocol_is_not_a_target(self):
        async def go():
            app = await make_app(self.tmp.name)
            r = await app.bridge.do_send("executor", {"to": "orchestrator", "kind": "note", "text": "x", "reply_to": 0})
            self.assertTrue(r["ok"])
            self.assertIsNone(app.journal.get(r["seq"])["reply_to"])
            with self.assertRaises(JournalError) as cm:
                app.post("executor", ["orchestrator"], "answer", "y", reply_to=0)
            self.assertEqual(cm.exception.code, "reply_to_missing")
            await settle(app)
        self.run_async(go())

    def test_restart_restores_panes_and_delivers_pending(self):
        async def go():
            app = await make_app(self.tmp.name)
            ex = app.registry.get("executor")
            app.registry.update(ex, {"mode": "read", "sessionId": None}, lambda p: True)
            ex.session_id = "11111111-1111-1111-1111-111111111111"
            app.save_panes()
            app.fake.gate = asyncio.Event()
            app.post("owner", ["executor"], "task", "первое")
            await asyncio.sleep(0.02)
            app.post("owner", ["executor"], "task", "второе")
            for t in app.pumps.values():
                t.cancel()
            app2 = await make_app(self.tmp.name)
            ex2 = app2.registry.get("executor")
            self.assertEqual((ex2.mode, ex2.session_id), ("read", "11111111-1111-1111-1111-111111111111"))
            for p in app2.registry.panes.values():
                app2.kick(p)
            await settle(app2)
            # ход, прерванный остановкой процесса, доставленным не считается: «первое» уходит заново вместе со «вторым»
            calls = calls_of(app2, "executor")
            self.assertEqual(len(calls), 1)
            self.assertIn("Входящие записи: 2", calls[0][1])
            self.assertIn("первое", calls[0][1])
            self.assertIn("второе", calls[0][1])
        self.run_async(go())


if __name__ == "__main__":
    unittest.main()
