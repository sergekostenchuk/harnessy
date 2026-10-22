import http.client
import json
import os
import pathlib
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


class AlphaRequestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        auth.DB_FILE = os.path.join(self.tmp.name, "auth.sqlite")
        auth.LOG_FILE = os.path.join(self.tmp.name, "auth.ndjson")
        auth.ALLOW_FILE = os.path.join(self.tmp.name, "allow.txt")
        auth.COOKIE_SECRET = b"test-cookie-secret"
        auth.ALPHA_IP_SECRET = b"test-alpha-ip-secret"
        auth.ALPHA_RATE_LIMIT = 5
        auth.ALPHA_RATE_WINDOW = 3600
        auth.TG_WEBHOOK_SECRET = "webhook-secret"
        with open(auth.ALLOW_FILE, "w", encoding="utf-8") as out:
            out.write("telegram:42\n")
        self.tg = []
        self.original_tg = auth.tg_api
        self.original_bot_token = auth.BOT_TOKEN
        auth.BOT_TOKEN = "test-bot-token"
        auth.tg_api = lambda method, **kw: self.tg.append((method, kw)) or {"ok": True}
        self.server = auth.ThreadingHTTPServer(("127.0.0.1", 0), auth.H)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        auth.tg_api = self.original_tg
        auth.BOT_TOKEN = self.original_bot_token
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

        update = {"callback_query": {"id": "cb-1", "from": {"id": 42}, "data": "alpha-reject:1", "message": {"chat": {"id": 42}, "message_id": 7, "text": "request"}}}
        code, _ = self.request(update, path="/auth/tg/webhook", headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"})
        self.assertEqual(code, 200)
        self.assertEqual(self.rows()[0]["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
