"""Проекты — группы рабочих папок: миграция старого списка, привязка открытой папки к проекту по корню или подсказке,
создание/переименование/удаление проекта, листинг с найденными подпапками."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import server
from tests.test_roles import make_app


class Req:
    def __init__(self, body=None):
        self._body = body or {}
        self.match_info = {}

    async def json(self):
        return self._body


async def call(h, body=None):
    resp = await h(Req(body))
    return resp.status, json.loads(resp.text)


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = server.PROJECTS_FILE
        server.PROJECTS_FILE = Path(self.tmp.name) / "projects.json"

    def tearDown(self):
        server.PROJECTS_FILE = self._old
        self.tmp.cleanup()

    def test_migration_and_attach(self):
        async def go():
            root = os.path.realpath(os.path.join(self.tmp.name, "OMG")); os.makedirs(os.path.join(root, "wt1", ".harness"))
            server.PROJECTS_FILE.write_text(json.dumps([root]), "utf-8")             # старый формат
            app = await make_app(os.path.join(self.tmp.name, "other"))
            projs = app._load_projects()
            self.assertEqual([(p["name"], p["root"], p["folders"]) for p in projs], [("OMG", root, [root])])
            app._remember_project(os.path.join(root, "wt1"))                          # подпапка корня — в тот же проект
            app._remember_project(os.path.join(self.tmp.name, "other"))              # чужая — свой проект
            projs = app._load_projects()
            self.assertEqual(len(projs), 2)
            self.assertEqual(projs[0]["folders"], [root, os.path.join(root, "wt1")])
            self.assertEqual(projs[1]["name"], "other")
            app._remember_project(os.path.join(root, "wt1"))                          # повтор — без дублей
            self.assertEqual(len(app._load_projects()[0]["folders"]), 2)
            st, r = await call(app.api_projects)
            names = [p["name"] for p in r["projects"]]
            self.assertEqual(names, ["OMG", "other"])
            self.assertTrue(r["projects"][1]["current"], "открытая папка отмечена")
            self.assertEqual([f["name"] for f in r["projects"][0]["folders"]], ["OMG", "wt1"])
        asyncio.run(go())

    def test_create_rename_remove_and_hint(self):
        async def go():
            app = await make_app(os.path.join(self.tmp.name, "w"))
            self.assertEqual((await call(app.projects_create, {"name": "", "root": "/x"}))[0], 400)
            self.assertEqual((await call(app.projects_create, {"name": "Harnessy", "root": os.path.join(self.tmp.name, "nope")}))[0], 404)
            st, r = await call(app.projects_create, {"name": "Harnessy", "root": os.path.join(self.tmp.name, "H"), "create": True})
            self.assertEqual((st, r["project"]["name"], r["project"]["folders"]), (200, "Harnessy", []))
            self.assertTrue(os.path.isdir(os.path.join(self.tmp.name, "H")))
            self.assertEqual((await call(app.projects_create, {"name": "harnessy", "root": os.path.join(self.tmp.name, "H2"), "create": True}))[0], 409)
            core = os.path.join(self.tmp.name, "H", "core"); os.makedirs(core)
            app._remember_project(core, "Harnessy")
            self.assertEqual(app._load_projects()[0]["folders"], [os.path.realpath(core)])
            st, r = await call(app.projects_edit, {"project": "Harnessy", "name": "Harnessy 2"})
            self.assertEqual((st, r["project"]["name"]), (200, "Harnessy 2"))
            self.assertEqual((await call(app.projects_edit, {"project": "nope", "name": "x"}))[0], 404)
            st, r = await call(app.projects_edit, {"project": "Harnessy 2", "remove": True})
            self.assertEqual((st, app._load_projects()), (200, []))
            self.assertTrue(os.path.isdir(core), "папки на диске не трогаются")
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
