import os
import shutil
import tempfile
import unittest
from pathlib import Path

from app.policy import Policy, PolicyError
from app.team import TEMPLATES, TeamError, ensure_line, load_team

ROOT = Path(__file__).resolve().parent.parent


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.p = Policy(ROOT / "templates" / "comms-policy.yaml")

    def test_matrix(self):
        deny = lambda a, b, k: self.assertFalse(self.p.check_send(a, b, k).allow, f"{a}->{b} {k} должен быть запрещён")
        allow = lambda a, b, k: self.assertTrue(self.p.check_send(a, b, k).allow, f"{a}->{b} {k} должен быть разрешён")
        allow("owner", "executor", "task"); allow("assistant", "reviewer", "stop"); allow("orchestrator", "executor", "task")
        deny("reviewer", "executor", "task"); deny("tester", "executor", "task"); deny("architect", "executor", "task")
        allow("architect", "orchestrator", "proposal"); allow("architect", "executor", "answer")
        allow("executor", "orchestrator", "status"); allow("executor", "reviewer", "review-request"); allow("executor", "architect", "question")
        deny("executor", "architect", "task"); deny("executor", "reviewer", "verdict")
        allow("researcher", "executor", "report"); allow("tester", "executor", "report"); deny("researcher", "executor", "task")
        allow("executor", "owner", "escalation"); deny("executor", "owner", "task")
        v = self.p.check_send("reviewer", "executor", "verdict")
        self.assertTrue(v.allow and v.trigger == "reply-to:review-request" and v.bounds["max_rounds"] == 3 and v.bounds["accept_score"] == 9)

    def test_observe(self):
        self.assertTrue(self.p.can_observe("owner", "anything"))
        self.assertTrue(self.p.can_observe("assistant", "executor") and self.p.can_observe("orchestrator", "tester") and self.p.can_observe("architect", "reviewer"))
        self.assertTrue(self.p.can_observe("reviewer", "executor")); self.assertFalse(self.p.can_observe("reviewer", "architect"))
        self.assertTrue(self.p.can_observe("tester", "executor")); self.assertFalse(self.p.can_observe("executor", "reviewer"))
        self.assertFalse(self.p.can_observe("researcher", "executor")); self.assertFalse(self.p.can_observe("unknown", "executor"))

    def test_summary_and_hint(self):
        s = self.p.summary_for("executor", {"orchestrator": "orchestrator", "reviewer": "reviewer", "executor": "executor"}, {"orchestrator": "оркестратор", "reviewer": "ревьюер", "executor": "исполнитель"})
        self.assertIn("orchestrator (оркестратор): status, question, blocker, answer, note", s)
        self.assertIn("reply-to:review-request", self.p.summary_for("reviewer", {"executor": "executor", "reviewer": "reviewer"}, {}))
        self.assertIn("никого", s)
        d = self.p.check_send("reviewer", "executor", "task")
        self.assertIn("reviewer может писать executor только: verdict, question, answer, note", d.reason)

    def test_reload_and_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "p.yaml"
            path.write_text((ROOT / "templates" / "comms-policy.yaml").read_text("utf-8"), "utf-8")
            p = Policy(path)
            self.assertEqual(p.version, 1)
            self.assertFalse(p.maybe_reload())
            path.write_text(path.read_text("utf-8").replace("version: 1", "version: 7"), "utf-8")
            os.utime(path, (os.path.getmtime(path) + 5, os.path.getmtime(path) + 5))
            self.assertTrue(p.maybe_reload())
            self.assertEqual(p.version, 7)
            path.write_text("routes:\n  - from: a\n    to: b\n    kinds: [gossip]\n", "utf-8")
            os.utime(path, (os.path.getmtime(path) + 10, os.path.getmtime(path) + 10))
            with self.assertRaises(PolicyError):
                p.maybe_reload()
            path.write_text("routes: nope\n", "utf-8")
            with self.assertRaises(PolicyError):
                Policy(path)


class TeamTests(unittest.TestCase):
    def test_ensure_and_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = ensure_line(tmp)
            self.assertTrue((h / "team.yaml").exists() and (h / "roles" / "reviewer.md").exists())
            self.assertEqual(load_team(h).seats, {})                      # новая папка — без ролей (слово владельца 07.10.2026)
            shutil.copyfile(TEMPLATES / "team.yaml", h / "team.yaml")      # дальше — полная команда из шаблона
            (h / "roles" / "executor.md").write_text("МОЯ ПРАВКА", "utf-8")
            ensure_line(tmp)                                           # повторный вызов не затирает
            self.assertEqual((h / "roles" / "executor.md").read_text("utf-8"), "МОЯ ПРАВКА")
            t = load_team(h)
            self.assertEqual(len(t.seats), 7)
            self.assertEqual((t.seats["researcher"].mode, t.seats["researcher"].write_paths), ("web", ["docs/research"]))
            self.assertEqual(t.seats["architect"].vendor, "codex")
            self.assertEqual(t.instructions_for(t.seats["executor"]), "МОЯ ПРАВКА")
            self.assertEqual(t.role_of("tester"), "tester")

    def test_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = ensure_line(tmp)
            f = h / "team.yaml"
            shutil.copyfile(TEMPLATES / "team.yaml", f)
            base = f.read_text("utf-8")
            # Вендор, которого 3777 не ведёт (так бывает в команде, записанной воркбенчем): место пропущено с предупреждением,
            # остальная команда работает. Все места чужие — отказ.
            f.write_text(base.replace("vendor: codex", "vendor: gemini"), "utf-8")
            t = load_team(h)
            self.assertNotIn("architect", t.seats)
            self.assertIn("assistant", t.seats)
            self.assertTrue(any("architect" in w and "gemini" in w for w in t.warnings), t.warnings)
            f.write_text(base.replace("vendor: codex", "vendor: kimi").replace("vendor: claude", "vendor: qwen"), "utf-8")
            with self.assertRaises(TeamError):
                load_team(h)
            f.write_text(base.replace("mode: ask", "mode: yolo"), "utf-8")
            with self.assertRaises(TeamError):
                load_team(h)
            f.write_text(base.replace("  executor:\n", "  owner:\n"), "utf-8")
            with self.assertRaises(TeamError):
                load_team(h)
            f.write_text(base.replace("write_paths: [docs]", "write_paths: [../etc]"), "utf-8")
            with self.assertRaises(TeamError):
                load_team(h)
            f.write_text("seats: {}\n", "utf-8")
            self.assertEqual(load_team(h).seats, {})                      # пустая команда допустима: роли назначает движок

    def test_empty_model_is_vendor_default(self):
        """Воркбенч пишет «модель по умолчанию» пустым полем: команда грузится, окно получает первую модель вендора."""
        from app.panes import Registry
        with tempfile.TemporaryDirectory() as tmp:
            h = ensure_line(tmp)
            f = h / "team.yaml"
            shutil.copyfile(TEMPLATES / "team.yaml", f)
            f.write_text(f.read_text("utf-8").replace("model: claude-sonnet-5", "model: null"), "utf-8")
            t = load_team(h)
            self.assertEqual(t.seats["assistant"].model, "")
            self.assertEqual(t.warnings, [])
            reg = Registry(tmp, {"claude": [{"id": "claude-sonnet-5"}, {"id": "claude-opus-5"}], "codex": [{"id": "gpt-5.6-sol"}]}, list(t.seats.values()))
            self.assertEqual(reg.panes["assistant"].model, "claude-sonnet-5")
            self.assertEqual(reg.panes["architect"].model, "gpt-6-astra", "заданная модель не подменяется")



if __name__ == "__main__":
    unittest.main()
