import http.client
import json
import os
import pathlib
import secrets
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import auth


VALID = {
    "name": "Maria Tester",
    "email": "maria@example.test",
    "github": "maria-test",
    "tools": ["claude-code", "codex"],
    "mac": True,
    "consent": True,
    "company": "",
}


class FixtureServer(auth.ThreadingHTTPServer):
    def __init__(self):
        self.idle = threading.Condition()
        self.pending = 0
        super().__init__(("127.0.0.1", 0), auth.H)

    def finished(self):
        with self.idle:
            self.pending -= 1
            self.idle.notify_all()

    def process_request(self, request, address):
        with self.idle:
            self.pending += 1
        try:
            super().process_request(request, address)
        except BaseException:
            self.finished()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.finished()

    def drain(self):
        with self.idle:
            if not self.idle.wait_for(lambda: self.pending == 0, timeout=20):
                raise AssertionError("auth request did not finish before fixture reset")


class AlphaRequestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = FixtureServer()
        cls.thread = threading.Thread(target=cls.server.serve_forever,
                                      kwargs={"poll_interval": 0.01}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        if cls.thread.is_alive():
            raise AssertionError("auth server did not stop")

    def setUp(self):
        # A shared listening socket must not share state or unfinished handlers.
        self.server.drain()
        self.original_auth = {name: getattr(auth, name) for name in (
            "DB_FILE", "LOG_FILE", "ALLOW_FILE", "COOKIE_SECRET", "ALPHA_IP_SECRET",
            "ALPHA_RATE_LIMIT", "ALPHA_RATE_WINDOW", "TG_WEBHOOK_SECRET", "BOT_TOKEN", "tg_api")}
        self.tmp = tempfile.TemporaryDirectory()
        auth.DB_FILE = os.path.join(self.tmp.name, "auth.sqlite")
        auth.LOG_FILE = os.path.join(self.tmp.name, "auth.ndjson")
        auth.ALLOW_FILE = os.path.join(self.tmp.name, "allow.txt")
        auth.COOKIE_SECRET = secrets.token_bytes(32)
        auth.ALPHA_IP_SECRET = secrets.token_bytes(32)
        auth.ALPHA_RATE_LIMIT = 5
        auth.ALPHA_RATE_WINDOW = 3600
        self.webhook_secret = secrets.token_hex(16)
        auth.TG_WEBHOOK_SECRET = self.webhook_secret
        with open(auth.ALLOW_FILE, "w", encoding="utf-8") as out:
            out.write("telegram:42\n")
        self.tg = []
        auth.BOT_TOKEN = "test-bot-token"
        auth.tg_api = lambda method, **kw: self.tg.append((method, kw)) or {"ok": True}
        self.assertFalse(os.path.exists(auth.DB_FILE))

    def tearDown(self):
        # Completion is signalled by the handler, not inferred from elapsed time.
        self.server.drain()
        for name, value in self.original_auth.items():
            setattr(auth, name, value)
        self.tmp.cleanup()

    def request(self, payload, *, ip="203.0.113.8", origin=auth.BASE_ORIGIN, path="/auth/alpha", headers=None):
        body = json.dumps(payload).encode()
        h = {"Content-Type": "application/json", "Origin": origin, "X-Real-IP": ip}
        h.update(headers or {})
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request("POST", path, body=body, headers=h)
        response = conn.getresponse()
        raw = response.read()
        conn.close()
        if not raw:
            parsed = None
        else:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw.decode()
        return response.status, parsed

    def rows(self, table="alpha_requests"):
        c = auth.db()
        try:
            return c.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
        finally:
            c.close()

    def callback(self, action, callback_id, update_id):
        return {
            "update_id": update_id,
            "callback_query": {
                "id": callback_id,
                "from": {"id": 42},
                "data": f"{action}:1",
                "message": {"chat": {"id": 42}, "message_id": 7, "text": "request"},
            },
        }

    def test_accept_and_duplicate_email_notify_once(self):
        code, body = self.request(VALID)
        self.assertEqual((code, body), (201, {"ok": True, "status": "received"}))
        code, body = self.request({**VALID, "name": "Another name"})
        self.assertEqual((code, body), (200, {"ok": True, "status": "already_received"}))
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ip_hash"], auth.alpha_ip_hash("203.0.113.8"))
        self.assertNotIn("203.0.113.8", rows[0]["ip_hash"])
        sent = [call for call in self.tg if call[0] == "sendMessage"]
        self.assertEqual(len(sent), 1)
        self.assertIn("Пригласить", json.dumps(sent[0][1]["reply_markup"], ensure_ascii=False))
        self.assertNotIn(auth.BOT_TOKEN, json.dumps(sent, ensure_ascii=False))

    def test_fixture_waits_for_handler_before_resetting_state(self):
        entered, release, draining, drained = [threading.Event() for _ in range(4)]
        original = auth.tg_api
        results = []

        def held_notification(method, **kw):
            entered.set()
            if not release.wait(timeout=10):
                raise AssertionError("notification fixture was not released")
            return original(method, **kw)

        def drain():
            draining.set()
            self.server.drain()
            drained.set()

        auth.tg_api = held_notification
        request = threading.Thread(target=lambda: results.append(self.request(VALID)))
        waiter = threading.Thread(target=drain)
        request.start()
        try:
            self.assertTrue(entered.wait(timeout=5))
            waiter.start()
            self.assertTrue(draining.wait(timeout=5))
            self.assertFalse(drained.is_set())
        finally:
            release.set()
            request.join(timeout=5)
            if waiter.ident is not None:
                waiter.join(timeout=5)
        self.assertFalse(request.is_alive())
        self.assertFalse(waiter.is_alive())
        self.assertTrue(drained.is_set())
        self.assertEqual(results, [(201, {"ok": True, "status": "received"})])
        self.assertEqual(len(self.rows()), 1)

    def test_honeypot_looks_successful_without_storage_or_telegram(self):
        code, body = self.request({**VALID, "company": "bot company"})
        self.assertEqual((code, body), (201, {"ok": True, "status": "received"}))
        self.assertEqual(self.rows(), [])
        self.assertEqual(self.tg, [])

    def test_optional_github_and_missing_ip_secret(self):
        code, body = self.request({**VALID, "email": "without-github@example.test", "github": ""})
        self.assertEqual((code, body), (201, {"ok": True, "status": "received"}))
        self.assertIsNone(self.rows()[0]["github"])

        auth.ALPHA_IP_SECRET = b""
        code, body = self.request({**VALID, "email": "no-secret@example.test"})
        self.assertEqual((code, body), (503, {"ok": False, "code": "not_configured"}))
        self.assertEqual(len(self.rows()), 1)

    def test_missing_bot_token_refuses_before_storage(self):
        auth.BOT_TOKEN = ""
        code, body = self.request(VALID)
        self.assertEqual((code, body), (503, {"ok": False, "code": "not_configured"}))
        self.assertEqual(self.rows(), [])
        self.assertEqual(self.rows("alpha_rate"), [])

    def test_rate_limit_is_atomic_for_parallel_requests(self):
        auth.ALPHA_RATE_LIMIT = 2
        barrier = threading.Barrier(5)
        results = []
        lock = threading.Lock()

        def send(index):
            barrier.wait()
            result = self.request({**VALID, "email": f"person-{index}@example.test"}, ip="198.51.100.4")
            with lock:
                results.append(result[0])

        workers = [threading.Thread(target=send, args=(i,)) for i in range(5)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)
        self.assertEqual(sorted(results), [201, 201, 429, 429, 429])
        self.assertEqual(len(self.rows()), 2)

    def test_validation_origin_and_content_type_fail_before_storage(self):
        bad = {**VALID, "email": "wrong", "tools": ["forged"], "mac": None, "consent": False}
        code, body = self.request(bad)
        self.assertEqual(code, 400)
        self.assertEqual(set(body["fields"]), {"email", "tools", "mac", "consent"})
        code, body = self.request(VALID, origin="https://attacker.example")
        self.assertEqual((code, body["code"]), (403, "origin_rejected"))
        code, body = self.request(VALID, headers={"Content-Type": "text/plain"})
        self.assertEqual((code, body["code"]), (415, "json_required"))
        self.assertEqual(self.rows(), [])

    def test_owner_can_decide_from_admin_and_telegram(self):
        self.assertEqual(self.request(VALID)[0], 201)
        c = auth.db()
        try:
            uid = c.execute("INSERT INTO users(created,name,status,note) VALUES(?,?,?,?)", (1, "Owner", "allowed", "")).lastrowid
            c.execute("INSERT INTO identities(provider,pid,user_id,created) VALUES(?,?,?,?)", ("telegram", "42", uid, 1))
            c.commit()
        finally:
            c.close()
        cookie = f"{auth.COOKIE}={auth.make_cookie(uid)}"
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request("GET", "/auth/admin", headers={"Cookie": cookie})
        response = conn.getresponse()
        page = response.read().decode()
        conn.close()
        self.assertEqual(response.status, 200)
        self.assertIn("maria@example.test", page)
        self.assertIn("value='invite'", page)

        form = b"alpha_id=1&act=invite"
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request("POST", "/auth/admin/act", body=form, headers={"Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
        response = conn.getresponse()
        response.read()
        conn.close()
        self.assertEqual(response.status, 302)
        self.assertEqual(self.rows()[0]["status"], "invited")

        update = self.callback("alpha-reject", "cb-1", 1)
        code, _ = self.request(update, path="/auth/tg/webhook", headers={"X-Telegram-Bot-Api-Secret-Token": self.webhook_secret})
        self.assertEqual(code, 200)
        self.assertEqual(self.rows()[0]["status"], "rejected")

    def test_webhook_requires_configured_secret_before_owner_action(self):
        self.assertEqual(self.request(VALID)[0], 201)
        auth.TG_WEBHOOK_SECRET = ""
        code, _ = self.request(self.callback("alpha-invite", "forged", 10), path="/auth/tg/webhook")
        self.assertEqual(code, 503)
        self.assertEqual(self.rows()[0]["status"], "pending")

    def test_telegram_decision_ignores_replayed_and_out_of_order_updates(self):
        self.assertEqual(self.request(VALID)[0], 201)
        headers = {"X-Telegram-Bot-Api-Secret-Token": self.webhook_secret}
        invite = self.callback("alpha-invite", "old-callback", 100)
        reject = self.callback("alpha-reject", "new-callback", 101)
        self.assertEqual(self.request(invite, path="/auth/tg/webhook", headers=headers)[0], 200)
        self.assertEqual(self.request(reject, path="/auth/tg/webhook", headers=headers)[0], 200)
        self.assertEqual(self.rows()[0]["status"], "rejected")
        self.assertEqual(self.request(invite, path="/auth/tg/webhook", headers=headers)[0], 200)
        self.assertEqual(self.rows()[0]["status"], "rejected")
        receipt = self.rows("alpha_decision_updates")[0]
        self.assertEqual((receipt["update_id"], receipt["callback_id"]), (101, "new-callback"))

        missing = self.callback("alpha-invite", "missing-update", None)
        self.assertEqual(self.request(missing, path="/auth/tg/webhook", headers=headers)[0], 200)
        self.assertEqual(self.rows()[0]["status"], "rejected")

    def test_parallel_telegram_decisions_commit_status_with_highest_update(self):
        self.assertEqual(self.request(VALID)[0], 201)
        headers = {"X-Telegram-Bot-Api-Secret-Token": self.webhook_secret}
        barrier = threading.Barrier(2)
        codes = []

        def decide(action, callback_id, update_id):
            barrier.wait()
            codes.append(self.request(self.callback(action, callback_id, update_id), path="/auth/tg/webhook", headers=headers)[0])

        workers = [
            threading.Thread(target=decide, args=("alpha-invite", "parallel-old", 100)),
            threading.Thread(target=decide, args=("alpha-reject", "parallel-new", 101)),
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)
        self.assertEqual(sorted(codes), [200, 200])
        self.assertEqual(self.rows()[0]["status"], "rejected")
        receipt = self.rows("alpha_decision_updates")[0]
        self.assertEqual((receipt["update_id"], receipt["callback_id"]), (101, "parallel-new"))


if __name__ == "__main__":
    unittest.main()
