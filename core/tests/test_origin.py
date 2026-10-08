"""Подлинность окна: чужая страница в браузере владельца не может слать изменяющие запросы на локальный адрес (находка ревьюера TS-05, 09.10.2026)."""
import os
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from app.server import PORT, check_browser_origin

H = f"127.0.0.1:{PORT}"
JSON = "application/json"


class OriginTests(unittest.TestCase):
    def test_own_window_and_local_clients_pass(self):
        self.assertIsNone(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": f"http://{H}", "Content-Type": JSON}))
        self.assertIsNone(check_browser_origin("POST", "/api/send", {"Host": f"localhost:{PORT}", "Content-Type": JSON + "; charset=utf-8"}))   # мост/curl без Origin
        self.assertIsNone(check_browser_origin("GET", "/api/status", {"Host": "evil.example", "Origin": "https://foreign.example"}))        # чтение не меняет состояние

    def test_foreign_origin_with_valid_host_denied(self):
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": "https://foreign.example", "Content-Type": JSON}), (403, "origin_denied"))
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": "null", "Content-Type": JSON}), (403, "origin_denied"))
        self.assertEqual(check_browser_origin("GET", "/api/sessions/abc", {"Host": H, "Origin": "https://foreign.example"}), (403, "origin_denied"))   # GET, меняющий состояние

    def test_foreign_host_and_wrong_content_type_denied(self):
        self.assertEqual(check_browser_origin("POST", "/api/chat", {"Host": "evil.example:3777", "Content-Type": JSON}), (403, "host_denied"))
        self.assertEqual(check_browser_origin("POST", "/api/chat", {"Host": H, "X-Forwarded-Host": H, "Content-Type": JSON}), None)              # X-Forwarded-Host не читается, Host верный
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": f"http://{H}", "Content-Type": "text/plain"}), (415, "content_type"))


if __name__ == "__main__":
    unittest.main()
