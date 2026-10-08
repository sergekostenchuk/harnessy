"""Проект по слову владельца 08.10.2026: создание одной функцией (git, .harness, память MEMORY.md, оркестратор по умолчанию — без вызова модели);
без проекта доступен только оркестратор — по вызову создаёт проект, названный по разговору, и разговор продолжается в его роли;
остальные роли — после оркестратора; вводная роли: где/что/когда и кем/зачем/что ожидаем/критерии/риски из памяти проекта и журнала."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import server
from app.server import App, ROOM_ID
from app.team import load_team
from tests.test_roles import make_app, records
from tests.test_settings import call

MODEL = "claude-haiku-4-5-20251001"


class ProjectInitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = (server.SETTINGS_FILE, server.PROJECTS_ROOT_DEFAULT, server.DEFAULT_DIR)
        server.SETTINGS_FILE = Path(self.tmp.name) / "settings.json"
        server.PROJECTS_ROOT_DEFAULT = os.path.join(self.tmp.name, "projects")
        server.DEFAULT_DIR = os.path.join(self.tmp.name, "default")
        os.makedirs(server.DEFAULT_DIR)

    def tearDown(self):
        server.SETTINGS_FILE, server.PROJECTS_ROOT_DEFAULT, server.DEFAULT_DIR = self._old
        self.tmp.cleanup()

    def _dir(self, name):
        d = os.path.join(self.tmp.name, name)
        os.makedirs(d)
        return d

    def test_create_project_seeds_git_memory_and_orchestrator_without_model_call(self):
        async def go():
            app = await make_app(self._dir("base"))
            app.claude = app.fake
            path = os.path.join(self.tmp.name, "novyi")
            st, r = await call(app.project_create, {"path": path})
            self.assertEqual(st, 200, r)
            self.assertTrue(r["created"] and r["git"] and r["orchestrator"])
            self.assertTrue((Path(path) / ".git").is_dir())
            mem = Path(path) / ".harness" / "MEMORY.md"
            self.assertTrue(mem.exists())
            self.assertIn("Память проекта «novyi»", mem.read_text("utf-8"))
            self.assertEqual(list(load_team(Path(path) / ".harness").seats), ["orchestrator"])
            self.assertEqual([p.id for p in app.registry.panes.values()], ["orchestrator"])
            self.assertEqual(app.registry.get("orchestrator").model, MODEL)
            await asyncio.sleep(0.05)
            self.assertEqual(app.fake.calls, [])                      # модель не вызывалась: вводная — при первом открытии чата
            self.assertFalse(app._onboarded("orchestrator"))
            cat = {c["role"]: c for c in app._role_catalog()}
            self.assertTrue(all(c["available"] for c in cat.values()))   # оркестратор есть — остальные роли доступны
            st, r = await call(app.project_create, {"path": path})       # повтор на существующем проекте мест не добавляет
            self.assertEqual(st, 200)
            self.assertFalse(r["created"] or r["orchestrator"])
            self.assertEqual(list(load_team(Path(path) / ".harness").seats), ["orchestrator"])
        asyncio.run(go())

    def test_roles_need_orchestrator_first(self):
        async def go():
            app = await make_app(self._dir("fresh"))
            cat = {c["role"]: c for c in app._role_catalog()}
            self.assertTrue(cat["orchestrator"]["available"])
            self.assertFalse(cat["assistant"]["available"])
            self.assertIn("сначала оркестратор", cat["assistant"]["reason"])
            with self.assertRaises(ValueError) as cm:
                app.create_seat("assistant", by="тест")
            self.assertIn("сначала оркестратор", str(cm.exception))
            st, r = await call(app.seat_create, {"role": "reviewer"})
            self.assertEqual(st, 400)
            self.assertIn("сначала оркестратор", r["error"])
            r = await app.bridge.do_assign_role("nobody", {"role": "tester"})
            self.assertFalse(r["ok"])
            pane, _ = app.create_seat("orchestrator", by="тест")
            self.assertEqual(pane.role, "orchestrator")
            p2, _ = app.create_seat("assistant", by="тест")
            self.assertEqual(p2.role, "assistant")
            self.assertTrue(all(c["available"] for c in app._role_catalog()))
        asyncio.run(go())

    def test_room_without_project_orchestrator_creates_project_from_conversation(self):
        async def go():
            app = await make_app(server.DEFAULT_DIR)                   # папка по умолчанию движка = без проекта
            app.claude = app.fake
            room = app._make_room(MODEL, "chat", quiet=True)
            room.transcript = [{"role": "me", "text": "Давай сделаем бота для записи к врачу на Telegram", "ts": 1}, {"role": "ai", "text": "Хорошо.", "ts": 2}]
            self.assertTrue(app._room_without_project())
            cat = {c["role"]: c for c in app._role_catalog()}
            self.assertTrue(cat["orchestrator"]["available"] and not cat["executor"]["available"])
            self.assertIn("без проекта", cat["executor"]["reason"])
            st, r = await call(app.assign_role, {"role": "assistant"})
            self.assertEqual(st, 400)
            self.assertIn("только оркестратор", r["error"])
            st, r = await call(app.assign_role, {"role": "orchestrator"})
            self.assertEqual(st, 200, r)
            self.assertTrue(r["created"])
            self.assertEqual(r["project"], os.path.join(server.PROJECTS_ROOT_DEFAULT, "bota-zapisi-vrachu-telegram"))
            self.assertEqual(app.project_dir, r["project"])
            self.assertTrue((Path(r["project"]) / ".git").is_dir())
            self.assertTrue((Path(r["project"]) / ".harness" / "MEMORY.md").exists())
            self.assertEqual(list(load_team(Path(r["project"]) / ".harness").seats), ["orchestrator"])
            orch = app.registry.get("orchestrator")
            self.assertEqual(orch.transcript[0]["text"][:5], "Давай")            # разговор продолжается в роли
            self.assertEqual(orch.mode, "read")
            self.assertFalse(app._room_without_project())
            onb = records(app, origin="onboarding")
            self.assertEqual(len(onb), 1)
            txt = onb[0]["text"]
            for s in ("создан по этому разговору", "Память проекта", "Зачем (цель проекта)", "Критерии успеха", "Риски", "чем будем заниматься"):
                self.assertIn(s, txt)
            await asyncio.sleep(0.1)
            self.assertTrue(app.fake.calls and app.fake.calls[-1][0] == "orchestrator")   # оркестратор вызван и отвечает
            # второй разговор без проекта с тем же началом → имя с суффиксом
            app.project_dir = server.DEFAULT_DIR
            room = app._make_room(MODEL, "chat", quiet=True)
            room.transcript = [{"role": "me", "text": "давай сделаем бота для записи к врачу на telegram", "ts": 3}]
            st, r = await call(app.assign_role, {"role": "orchestrator"})
            self.assertEqual(st, 200, r)
            self.assertTrue(r["project"].endswith("bota-zapisi-vrachu-telegram-2"))
        asyncio.run(go())

    def test_project_slug(self):
        self.assertEqual(App.project_slug("Давай сделаем бота для записи к врачу на Telegram"), "bota-zapisi-vrachu-telegram")
        self.assertEqual(App.project_slug("Hello, let's build a landing page for cafe"), "landing-page-cafe")
        self.assertTrue(App.project_slug("").startswith("proekt-"))
        self.assertTrue(App.project_slug("!!! ???").startswith("proekt-"))

    def test_onboarding_reads_memory_sections_and_journal(self):
        async def go():
            app = await make_app(self._dir("mem"))
            mem = Path(app.project_dir) / ".harness" / "MEMORY.md"
            txt = mem.read_text("utf-8").replace("(чем занимаемся и зачем — оркестратор запишет после первого разговора с владельцем)", "сайт школы танцев")
            mem.write_text(txt.replace("(что может пойти не так и что делаем заранее)", "сроки: две недели"), encoding="utf-8")
            app.create_seat("orchestrator", by="тест")
            onb = records(app, origin="onboarding")[-1]["text"]
            self.assertIn("Зачем (цель проекта): сайт школы танцев.", onb)
            self.assertIn("Риски: сроки: две недели.", onb)
            self.assertIn("Что ожидаем: в памяти проекта пока не записано", onb)
            self.assertIn("Где: папка", onb)
            self.assertIn("Когда и кем: владелец", onb)
            self.assertIn("Где что лежит:", onb)                                 # остальные заполненные разделы памяти
            self.assertIn("чем будем заниматься", onb)
            self.assertNotIn("(дата · решение", onb)                            # заглушки в скобках не уходят в контекст
            app.create_seat("tester", by="тест")
            onb2 = records(app, origin="onboarding")[-1]["text"]
            self.assertIn("жди команду", onb2)
            self.assertIn("или оркестратора", onb2)
            self.assertIn("Что сейчас в журнале", onb2)
            self.assertIn("Назначена роль «оркестратор»", onb2)
            self.assertNotIn("чем будем заниматься", onb2)
        asyncio.run(go())

    def test_room_move_create_seeds_orchestrator_and_keeps_conversation(self):
        async def go():
            app = await make_app(self._dir("src"))
            app.claude = app.fake
            room = app._make_room(MODEL, "read", quiet=True)
            room.transcript = [{"role": "me", "text": "привет", "ts": 1}]
            path = os.path.join(self.tmp.name, "moved")
            st, r = await call(app.room_move, {"path": path, "create": True})
            self.assertEqual(st, 200, r)
            self.assertEqual(sorted(p.id for p in app.registry.panes.values()), sorted(["orchestrator", ROOM_ID]))
            self.assertEqual(app.registry.get(ROOM_ID).transcript[0]["text"], "привет")
            self.assertTrue((Path(path) / ".harness" / "MEMORY.md").exists())
            self.assertTrue((Path(path) / ".git").is_dir())
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
