"""Назначение ролей — алгоритм движка: единственный путь create_seat; инициатор в журнале; инструмент assign_role
проходит только у оркестратора и только в ходе по поручению владельца; вводная — шаблон кода. Временная папка, модели — заглушка."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app.server import App, HARNESS, OWNER


class FakeProvider:
    def __init__(self):
        self.calls = []

    async def run_turn(self, pane, message, depth=0):
        self.calls.append((pane.id, message))
        pane.publish({"type": "done", "sessionId": pane.session_id, "model": pane.model, "durationMs": 1, "usage": {}})
        return f"готов: {pane.id}"

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


async def make_app(tmpdir):
    app = App()
    app.fake = FakeProvider()
    app.codex = app.fake
    app.models = {"claude": [{"id": "claude-haiku-4-5-20251001", "label": "Haiku 4.5"}], "codex": [{"id": "gpt-6-astra", "label": "gpt-6-astra"}]}
    await app.open_project(tmpdir)
    app.registry.providers = {"claude": app.fake, "codex": app.fake}
    app.registry.models = app.models
    return app


def records(app, **flt):
    out = []
    for r in app.journal.read(limit=0):
        if all(r.get(k) == v for k, v in flt.items()):
            out.append(r)
    return out


class RoleAssignmentTests(unittest.TestCase):
    def test_new_folder_has_no_roles(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                self.assertEqual([p.id for p in app.registry.panes.values()], [])
                self.assertEqual(app.line_errors, [])
        asyncio.run(go())

    def test_owner_assignment_writes_team_journal_and_onboarding(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                app.create_seat("orchestrator", by="владелец (тест)")      # первым — оркестратор (правило 08.10.2026: остальные роли после него)
                pane, chat = app.create_seat("reviewer", by="владелец (тест)", how="тестом")
                self.assertEqual((pane.id, pane.label, pane.vendor), ("reviewer", "ревьюер", "claude"))
                team = Path(d, ".harness", "team.yaml").read_text("utf-8")
                self.assertIn("reviewer:", team)
                self.assertIn("instructions: roles/reviewer.md", team)
                assign = [x for x in records(app, origin="assign") if "ревьюер" in x["text"]]
                self.assertEqual(len(assign), 1)
                self.assertIn("инициатор: владелец (тест)", assign[0]["text"])
                onb = [x for x in records(app, origin="onboarding") if "reviewer" in x["to"]]
                self.assertEqual(len(onb), 1)
                self.assertEqual(onb[0]["from"], HARNESS)
                self.assertIn("reviewer", onb[0]["to"])
                self.assertIn("ролью «ревьюер»", onb[0]["text"])
                self.assertIn("Файл обмена ролей", onb[0]["text"])
                await settle(app)
                self.assertTrue(any(c[0] == "reviewer" for c in app.fake.calls), "роль должна прочитать вводную и ответить")
                self.assertEqual(app.chats["active"].get("reviewer"), chat["id"])
                app.create_seat("architect", by="владелец (тест)")
                with self.assertRaises(ValueError):
                    app.create_seat("architect", by="владелец (тест)")   # одиночная роль дважды — отказ (ревьюер — множественная: ревьюер 2)
                p_r2, _ = app.create_seat("reviewer", by="владелец (тест)")
                self.assertEqual((p_r2.id, p_r2.label), ("reviewer2", "ревьюер 2"))
                p2, _ = app.create_seat("executor", by="владелец (тест)")
                p3, _ = app.create_seat("executor", by="владелец (тест)")
                self.assertEqual((p2.id, p3.id, p3.label), ("executor", "executor2", "воркер 2"))
        asyncio.run(go())

    def test_assign_role_tool_requires_orchestrator_with_owner_mandate(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                app.create_seat("orchestrator", by="владелец (тест)")
                app.create_seat("assistant", by="владелец (тест)")
                await settle(app)
                # не оркестратор — отказ
                r = await app.bridge.do_assign_role("assistant", {"role": "tester"})
                self.assertFalse(r["ok"]); self.assertEqual(r["code"], "policy_denied")
                # оркестратор вне хода по поручению владельца — отказ
                orch = app.registry.get("orchestrator")
                orch.turn_records = [{"from": "assistant", "seq": 3, "kind": "note", "text": "х"}]
                r = await app.bridge.do_assign_role("orchestrator", {"role": "tester"})
                self.assertFalse(r["ok"]); self.assertEqual(r["code"], "no_mandate")
                self.assertIsNone(app.registry.get("tester"))
                # оркестратор в ходе, начатом записью владельца — назначение проходит, инициатор со ссылкой на поручение
                orch.turn_records = [{"from": OWNER, "seq": 7, "kind": "task", "text": "назначь тестера"}]
                r = await app.bridge.do_assign_role("orchestrator", {"role": "tester", "mode": "check"})
                self.assertTrue(r["ok"], r)
                self.assertEqual((r["pane"], r["mandate"]), ("tester", 7))
                self.assertEqual(app.registry.get("tester").mode, "check")
                assign = [x for x in records(app, origin="assign") if "tester" in x["text"]]
                self.assertEqual(len(assign), 1)
                self.assertIn("по поручению владельца №7", assign[0]["text"])
                # неизвестная роль — отказ алгоритма
                r = await app.bridge.do_assign_role("orchestrator", {"role": "janitor"})
                self.assertFalse(r["ok"]); self.assertEqual(r["code"], "refused")
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
