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
        self.assertIsNone(check_browser_origin("GET", "/api/status", {"Host": H, "Origin": "https://foreign.example"}))                  # чтение со своим Host — допустимо
        self.assertIsNone(check_browser_origin("GET", "/sketches/proto/01-chat.html", {"Host": "evil.example"}))                        # статика без проверки Host

    def test_foreign_origin_with_valid_host_denied(self):
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": "https://foreign.example", "Content-Type": JSON}), (403, "origin_denied"))
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": "null", "Content-Type": JSON}), (403, "origin_denied"))
        self.assertEqual(check_browser_origin("GET", "/api/sessions/abc", {"Host": H, "Origin": "https://foreign.example"}), (403, "origin_denied"))   # GET, меняющий состояние
        self.assertEqual(check_browser_origin("GET", "/api/sessions/abc", {"Host": H, "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "image"}), (403, "origin_denied"))   # <img> без Origin
        self.assertIsNone(check_browser_origin("GET", "/api/sessions/abc", {"Host": H, "Sec-Fetch-Site": "same-origin"}))

    def test_foreign_host_and_wrong_content_type_denied(self):
        self.assertEqual(check_browser_origin("POST", "/api/chat", {"Host": "evil.example:3777", "Content-Type": JSON}), (403, "host_denied"))
        self.assertEqual(check_browser_origin("GET", "/api/journal", {"Host": "foreign.example:3777"}), (403, "host_denied"))            # чтение с чужим Host (DNS rebinding) — отказ
        self.assertEqual(check_browser_origin("GET", "/api/events/all", {"Host": "foreign.example:3777"}), (403, "host_denied"))         # поток событий тоже
        self.assertEqual(check_browser_origin("HEAD", "/api/sessions/abc", {"Host": H, "Origin": "https://foreign.example"}), (403, "origin_denied"))   # HEAD как GET
        self.assertEqual(check_browser_origin("POST", "/api/chat", {"Host": H, "X-Forwarded-Host": H, "Content-Type": JSON}), None)              # X-Forwarded-Host не читается, Host верный
        self.assertEqual(check_browser_origin("POST", "/api/approve", {"Host": H, "Origin": f"http://{H}", "Content-Type": "text/plain"}), (415, "content_type"))


if __name__ == "__main__":
    unittest.main()
