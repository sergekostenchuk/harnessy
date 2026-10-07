"""Третий ломоть: worktree на место, review-request с SHA, вердикт с отчётом в evidence, слияние принятого."""
import asyncio
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import gitops
from app.evidence import check_report
from app.journal import JournalError
from tests.test_delivery import FakeProvider, make_app, settle


def git(args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def init_repo(path: str) -> str:
    git(["init", "-q", "-b", "main"], path)
    git(["config", "user.email", "t@t"], path); git(["config", "user.name", "t"], path)
    Path(path, "README.md").write_text("проект\n", "utf-8")
    git(["add", "."], path); git(["commit", "-q", "-m", "init"], path)
    return git(["rev-parse", "HEAD"], path)


def write_report(root: str, thread: str, rnd: int, ok=True) -> str:
    d = Path(root, ".harness", "evidence", thread, f"r{rnd}")
    d.mkdir(parents=True, exist_ok=True)
    p = d / "report.md"
    p.write_text("# Ran\nтесты\n# Skipped\n—\n# Planned\n—\n# Manual\n—\n" if ok else "# Ran\nтолько это\n", "utf-8")
    return f".harness/evidence/{thread}/r{rnd}/report.md"


class GitFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.realpath(self.tmp.name)
        self.base = init_repo(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_worktrees_created_for_seats_with_worktree(self):
        async def go():
            app = await make_app(self.root)
            self.assertEqual(app.line_errors, [])
            ex = app.registry.get("executor")
            self.assertEqual(ex.cwd, os.path.join(self.root, ".worktrees", "executor"))
            self.assertEqual(ex.branch, "seat/executor")
            self.assertTrue(gitops.branch_exists(self.root, "seat/executor") and gitops.branch_exists(self.root, "seat/reviewer"))
            self.assertEqual(app.registry.get("orchestrator").cwd, self.root)          # без worktree — корень
            self.assertIn(".worktrees/", Path(self.root, ".git", "info", "exclude").read_text("utf-8"))
            st = git(["status", "--porcelain"], self.root)
            self.assertNotIn(".worktrees", st)                                          # worktree не мусорят в статусе
            self.assertNotIn(".harness/state", st)                                      # состояние линии вне git
            app2 = await make_app(self.root)                                            # повторное открытие — те же worktree
            self.assertEqual(app2.line_errors, [])
            note = app2.role_note(ex)
            self.assertIn("worktree на ветке seat/executor", note)
            self.assertIn(".harness/evidence", note)
            self.assertIn("инструментом merge", app2.role_note(app2.registry.get("orchestrator")))
            self.assertIn(os.path.join(self.root, ".git"), app2._writable_roots(ex))
        self.run_async(go())

    def test_non_git_project_falls_back_to_root(self):
        async def go():
            with tempfile.TemporaryDirectory() as plain:
                app = await make_app(plain)
                self.assertTrue(any("не git" in e for e in app.line_errors))
                self.assertEqual(app.registry.get("executor").cwd, plain)
                rr = app.post("executor", ["reviewer"], "review-request", "без sha, репозитория нет", thread="T1")
                self.assertIsNone(rr.get("sha"))
                await settle(app)
        self.run_async(go())

    def test_review_request_requires_real_sha(self):
        async def go():
            app = await make_app(self.root)
            with self.assertRaises(JournalError) as cm:
                app.post("executor", ["reviewer"], "review-request", "готово", thread="M-1")
            self.assertEqual(cm.exception.code, "sha_required")
            with self.assertRaises(JournalError) as cm:
                app.post("executor", ["reviewer"], "review-request", "готово", thread="M-1", sha="deadbeef")
            self.assertEqual(cm.exception.code, "sha_unknown")
            rr = app.post("executor", ["reviewer"], "review-request", "готово", thread="M-1", sha=self.base[:9])
            self.assertEqual(rr["sha"], self.base)                                      # SHA раскрыт до полного
            await settle(app)
        self.run_async(go())

    def test_verdict_requires_report_by_contract_and_inherits_sha(self):
        async def go():
            app = await make_app(self.root)
            rr = app.post("executor", ["reviewer"], "review-request", "готово", thread="M-2", sha=self.base)
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "ок", reply_to=rr["seq"], score=9, round_=1)
            self.assertEqual(cm.exception.code, "evidence_required")
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "ок", reply_to=rr["seq"], score=9, round_=1, evidence=[".harness/evidence/M-2/r1/report.md"])
            self.assertEqual(cm.exception.code, "evidence_missing")
            bad = write_report(self.root, "M-2", 1, ok=False)
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "ок", reply_to=rr["seq"], score=9, round_=1, evidence=[bad])
            self.assertEqual(cm.exception.code, "evidence_contract")
            self.assertIn("Skipped", str(cm.exception))
            with self.assertRaises(JournalError) as cm:
                app.post("reviewer", ["executor"], "verdict", "ок", reply_to=rr["seq"], score=9, round_=1, evidence=["../outside.md"])
            self.assertEqual(cm.exception.code, "evidence_outside")
            good = write_report(self.root, "M-2", 1)
            v = app.post("reviewer", ["executor"], "verdict", "ок", reply_to=rr["seq"], score=9, round_=1, evidence=[good])
            self.assertEqual((v["accepted"], v["sha"]), (True, self.base))
            self.assertEqual(app.threads["M-2"]["sha"], self.base)
            self.assertIsNone(check_report(Path(self.root, good)))
            await settle(app)
        self.run_async(go())

    def test_merge_only_accepted_sha_by_allowed_role(self):
        async def go():
            app = await make_app(self.root)
            # коммит исполнителя в его worktree
            wt = app.registry.get("executor").cwd
            Path(wt, "feature.txt").write_text("веха\n", "utf-8")
            git(["add", "."], wt); git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "веха M-3"], wt)
            sha = git(["rev-parse", "HEAD"], wt)
            # без принятого вердикта — отказ
            r = await app.bridge.do_merge("orchestrator", {"sha": sha})
            self.assertEqual((r["ok"], r["code"]), (False, "not_accepted"))
            rr = app.post("executor", ["reviewer"], "review-request", "веха M-3", thread="M-3", sha=sha)
            rep = write_report(self.root, "M-3", 1)
            app.post("reviewer", ["executor"], "verdict", "7/10", reply_to=rr["seq"], score=7, round_=1, evidence=[rep])
            r = await app.bridge.do_merge("orchestrator", {"sha": sha})
            self.assertEqual(r["code"], "not_accepted")                                 # балл ниже порога — не принято
            rep2 = write_report(self.root, "M-3", 2)
            app.post("reviewer", ["executor"], "verdict", "9/10", reply_to=rr["seq"], score=9, round_=2, evidence=[rep2])
            # не та роль — отказ
            r = await app.bridge.do_merge("executor", {"sha": sha})
            self.assertEqual(r["code"], "policy_denied")
            # незакоммиченные правки в корне — отказ
            Path(self.root, "README.md").write_text("грязь\n", "utf-8")
            r = await app.bridge.do_merge("orchestrator", {"sha": sha})
            self.assertEqual(r["code"], "merge_failed")
            git(["checkout", "--", "README.md"], self.root)
            r = await app.bridge.do_merge("orchestrator", {"sha": sha})
            self.assertTrue(r["ok"], r)
            self.assertEqual(r["branch"], "main")
            self.assertTrue(Path(self.root, "feature.txt").exists())
            self.assertEqual(git(["rev-parse", "HEAD"], self.root), r["mergeSha"])
            self.assertEqual(app.threads["M-3"]["merged"], r["mergeSha"])
            await settle(app)
            statuses = [x for x in app.journal.read() if x["kind"] == "status" and x.get("origin") == "merge"]
            self.assertEqual(len(statuses), 1)
            self.assertIn("owner", statuses[0]["to"])
            self.assertEqual((statuses[0]["sha"], statuses[0]["merged"]), (sha, r["mergeSha"]))
            app_again = await make_app(self.root)                                       # переоткрытие: «слито» не теряется
            self.assertEqual(app_again.threads["M-3"]["merged"], r["mergeSha"])
            self.assertEqual(gitops.merge_commit_for(self.root, sha, "main"), r["mergeSha"])
            self.assertIsNone(gitops.merge_commit_for(self.root, sha, "seat/tester"))     # в чужой ветке вехи нет
            # повторное слияние того же SHA — уже слито, git скажет «нечего сливать» без ошибки
            r2 = await app.bridge.do_merge("owner", {"sha": sha})
            self.assertTrue(r2["ok"])
        self.run_async(go())


if __name__ == "__main__":
    unittest.main()
