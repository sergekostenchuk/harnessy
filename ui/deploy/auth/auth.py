#!/usr/bin/env python3
"""auth.py — вход на Harnessy (адрес сайта — BASE_URL, с 07.10.2026 https://harnessy.ai): Telegram · GitHub · (Google · почта — когда появятся ключи).

Что: HTTP-сервис за nginx (auth_request). Одна база пользователей (SQLite), несколько «дверей» (identities),
допуск новых пользователей владельцем — кнопками в Telegram-боте или на /auth/admin. Все события — в NDJSON.
Где: /harness/auth/ на NL99, слушает 127.0.0.1:8791. Зачем: именной вход вместо общего пароля, видно кто и когда.

Маршруты (под /auth/ nginx отключает пароль и auth_request):
  GET  /auth/check               nginx auth_request: 200 если cookie верна и пользователь допущен, иначе 401
  GET  /auth/login               страница входа (двери по наличию ключей)
  GET  /auth/telegram            возврат Telegram Login Widget (hash по SHA256(bot_token))
  GET  /auth/github              → GitHub authorize (state в подписанной cookie)
  GET  /auth/github/callback     code → token → /user, /user/emails → identity github:<id>
  GET  /auth/google              → Google (если ключи заданы)   GET /auth/google/callback
  GET  /auth/admin               владельцу: ожидающие допуска, допустить/заблокировать (POST /auth/admin/act)
  GET  /auth/log                 допущенным: последние события
  GET  /auth/logout
  POST /auth/alpha               публичная заявка на альфа-тест (JSON, ловушка, лимит по IP)
  POST /auth/tg/webhook          бот: /start, кнопки «Допустить/Отклонить» (X-Telegram-Bot-Api-Secret-Token)

Окружение (/harness/auth/env): BASE_URL, COOKIE_SECRET, BOT_TOKEN, BOT_NAME, GITHUB_CLIENT_ID/SECRET,
GOOGLE_CLIENT_ID/SECRET, ALLOW_FILE (Telegram ID владельцев = админы, допускаются сразу), LOG_FILE, DB_FILE,
COOKIE_TTL_DAYS, LISTEN_PORT, TG_WEBHOOK_SECRET.
Для заявок: ALPHA_IP_SECRET (если пусто — COOKIE_SECRET), ALPHA_RATE_LIMIT (5), ALPHA_RATE_WINDOW (3600).
"""
import hashlib, hmac, html, json, os, re, secrets, smtplib, sqlite3, threading, time, urllib.parse, urllib.request
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

E = os.environ.get
BASE_URL = E("BASE_URL", "https://harnessy.ai").rstrip("/")
HOST = urllib.parse.urlparse(BASE_URL).hostname or "harnessy.ai"                 # имя сайта в текстах писем и бота
# Адреса возврата OAuth. В консолях GitHub и Google зарегистрирован старый домен; nginx старого домена передаёт
# /auth/<github|google>/callback со строкой запроса на новый — cookie состояния там, обмен кода идёт с тем же redirect_uri.
# Когда владелец заменит адреса в консолях — убрать OAUTH_BASE из env, и возвраты пойдут напрямую на BASE_URL.
OAUTH_BASE = E("OAUTH_BASE", BASE_URL).rstrip("/")
BOT_TOKEN, BOT_NAME = E("BOT_TOKEN", ""), E("BOT_NAME", "")
GH_ID, GH_SECRET = E("GITHUB_CLIENT_ID", ""), E("GITHUB_CLIENT_SECRET", "")
GG_ID, GG_SECRET = E("GOOGLE_CLIENT_ID", ""), E("GOOGLE_CLIENT_SECRET", "")
COOKIE_SECRET = E("COOKIE_SECRET", "").encode()
ALLOW_FILE = E("ALLOW_FILE", "/harness/auth/allow.txt")
LOG_FILE = E("LOG_FILE", "/harness/auth/logins.ndjson")
DB_FILE = E("DB_FILE", "/harness/auth/users.sqlite")
TTL = int(E("COOKIE_TTL_DAYS", "30")) * 86400
PORT = int(E("LISTEN_PORT", "8791"))
TG_WEBHOOK_SECRET = E("TG_WEBHOOK_SECRET", "")
OWNER_CONTACT = E("OWNER_CONTACT", "https://t.me/Serge_Kost")
SMTP_HOST, SMTP_PORT = E("SMTP_HOST", "smtp.gmail.com"), int(E("SMTP_PORT", "465"))
SMTP_USER, SMTP_PASS = E("SMTP_USER", ""), E("SMTP_PASS", "")
MAIL_FROM = E("MAIL_FROM", "") or (f"Harnessy <{SMTP_USER}>" if SMTP_USER else "")
EMAIL_ENABLED = bool(SMTP_USER and SMTP_PASS)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
GITHUB_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
PROVIDER_RU = {"telegram": "Telegram", "github": "GitHub", "google": "Google", "email": "почта"}
COOKIE, STATE_COOKIE = "hs", "hs_state"
AUTH_DATE_MAX_AGE = 86400
ALPHA_RATE_LIMIT = int(E("ALPHA_RATE_LIMIT", "5"))
ALPHA_RATE_WINDOW = int(E("ALPHA_RATE_WINDOW", "3600"))
ALPHA_IP_SECRET = E("ALPHA_IP_SECRET", "").encode() or COOKIE_SECRET
ALPHA_TOOLS = ("claude-code", "codex", "antigravity", "other")
MAX_POST_BYTES = 64 * 1024
_BASE = urllib.parse.urlsplit(BASE_URL)
BASE_ORIGIN = f"{_BASE.scheme}://{_BASE.netloc}"

# ───────────────────────── база ─────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, created INTEGER, name TEXT, email TEXT, status TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS identities(provider TEXT, pid TEXT, user_id INTEGER, email TEXT, username TEXT, name TEXT, created INTEGER, PRIMARY KEY(provider,pid));
CREATE INDEX IF NOT EXISTS ix_ident_user ON identities(user_id);
CREATE TABLE IF NOT EXISTS email_codes(email TEXT, code_hash TEXT, created INTEGER, ip TEXT, nxt TEXT, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_email_codes ON email_codes(email, created);
CREATE TABLE IF NOT EXISTS tg_login(nonce TEXT PRIMARY KEY, created INTEGER, code TEXT, ip TEXT, ua TEXT, nxt TEXT, tg_id TEXT, username TEXT, name TEXT, confirmed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS alpha_requests(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE, github TEXT, tools TEXT NOT NULL, mac INTEGER NOT NULL, ip_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decided INTEGER, decision_by TEXT);
CREATE INDEX IF NOT EXISTS ix_alpha_status ON alpha_requests(status, ts);
CREATE TABLE IF NOT EXISTS alpha_rate(ts INTEGER NOT NULL, ip_hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_alpha_rate ON alpha_rate(ip_hash, ts);
"""


def db():
    c = sqlite3.connect(DB_FILE, timeout=10)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def owner_tg_ids():
    """Записи allow.txt: голый Telegram ID или telegram:<id>, github:<login>, google:<sub>, email:<адрес>. Без префикса = telegram."""
    try:
        with open(ALLOW_FILE, encoding="utf-8") as f:
            out = set()
            for ln in f:
                s = ln.split("#", 1)[0].strip().lower()
                if s:
                    out.add(s if ":" in s else f"telegram:{s}")
            return out
    except FileNotFoundError:
        return set()


def owner_match(provider, pid, username=None, email=None):
    ids = owner_tg_ids()
    keys = {f"{provider}:{pid}".lower()}
    if username:
        keys.add(f"{provider}:{username}".lower())
    if email:
        keys.add(f"email:{email}".lower())
    return bool(keys & ids)


def log_event(rec):
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **rec}
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def upsert_identity(provider, pid, *, email=None, username=None, name=None):
    """Находит/создаёт пользователя по двери. Склейка по подтверждённой почте. → (user_row, created:bool)"""
    c = db()
    try:
        row = c.execute("SELECT user_id FROM identities WHERE provider=? AND pid=?", (provider, pid)).fetchone()
        created = False
        if row:
            uid = row["user_id"]
            c.execute("UPDATE identities SET email=COALESCE(?,email), username=COALESCE(?,username), name=COALESCE(?,name) WHERE provider=? AND pid=?", (email, username, name, provider, pid))
        else:
            uid = None
            if email:
                r2 = c.execute("SELECT id FROM users WHERE email=? AND status!='blocked'", (email.lower(),)).fetchone()
                if r2:
                    uid = r2["id"]
            if uid is None:
                status = "allowed" if owner_match(provider, pid, username, email) else "pending"
                cur = c.execute("INSERT INTO users(created,name,email,status,note) VALUES(?,?,?,?,?)", (int(time.time()), name or username or pid, (email or "").lower() or None, status, ""))
                uid = cur.lastrowid
                created = True
            c.execute("INSERT INTO identities(provider,pid,user_id,email,username,name,created) VALUES(?,?,?,?,?,?,?)", (provider, pid, uid, (email or "").lower() or None, username, name, int(time.time())))
        if owner_match(provider, pid, username, email):
            c.execute("UPDATE users SET status='allowed' WHERE id=?", (uid,))
        c.commit()
        return c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone(), created
    finally:
        c.close()


def user_by_id(uid):
    c = db()
    try:
        return c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    finally:
        c.close()


def is_owner(uid):
    c = db()
    try:
        rows = c.execute("SELECT provider, pid, username, email FROM identities WHERE user_id=?", (uid,)).fetchall()
        return any(owner_match(r["provider"], r["pid"], r["username"], r["email"]) for r in rows)
    finally:
        c.close()


def set_status(uid, status, who):
    c = db()
    try:
        c.execute("UPDATE users SET status=?, note=? WHERE id=?", (status, f"{status} by {who} {time.strftime('%Y-%m-%d %H:%M')}", uid))
        c.commit()
    finally:
        c.close()


def alpha_ip_hash(ip):
    if not ALPHA_IP_SECRET:
        return None
    return hmac.new(ALPHA_IP_SECRET, str(ip).encode(), hashlib.sha256).hexdigest()


def alpha_fields(payload):
    """Строгая публичная форма → нормализованная запись или ошибки по полям."""
    if not isinstance(payload, dict) or set(payload) - {"name", "email", "github", "tools", "mac", "consent", "company"}:
        return None, {"form": "invalid"}
    name = re.sub(r"\s+", " ", str(payload.get("name") or "")).strip()
    email = str(payload.get("email") or "").strip().lower()
    github = str(payload.get("github") or "").strip().lstrip("@")
    raw_tools = payload.get("tools")
    tools = list(dict.fromkeys(raw_tools)) if isinstance(raw_tools, list) and all(isinstance(v, str) for v in raw_tools) else []
    errors = {}
    if not 2 <= len(name) <= 80 or any(ord(ch) < 32 for ch in name):
        errors["name"] = "name"
    if len(email) > 254 or not EMAIL_RE.fullmatch(email):
        errors["email"] = "email"
    if github and not GITHUB_RE.fullmatch(github):
        errors["github"] = "github"
    if not tools or any(v not in ALPHA_TOOLS for v in tools):
        errors["tools"] = "tools"
    if type(payload.get("mac")) is not bool:
        errors["mac"] = "mac"
    if payload.get("consent") is not True:
        errors["consent"] = "consent"
    if errors:
        return None, errors
    return {"name": name, "email": email, "github": github or None, "tools": tools, "mac": payload["mac"]}, {}


def create_alpha_request(values, ip_hash):
    """Атомарно считает попытку, применяет лимит и создаёт одну заявку на почту."""
    now = int(time.time())
    c = db()
    try:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM alpha_rate WHERE ts < ?", (now - ALPHA_RATE_WINDOW,))
        count = c.execute("SELECT count(*) FROM alpha_rate WHERE ip_hash=?", (ip_hash,)).fetchone()[0]
        if count >= ALPHA_RATE_LIMIT:
            c.rollback()
            return "rate_limited", None
        c.execute("INSERT INTO alpha_rate(ts,ip_hash) VALUES(?,?)", (now, ip_hash))
        found = c.execute("SELECT * FROM alpha_requests WHERE email=?", (values["email"],)).fetchone()
        if found:
            c.commit()
            return "already_received", found
        cur = c.execute(
            "INSERT INTO alpha_requests(ts,name,email,github,tools,mac,ip_hash,status) VALUES(?,?,?,?,?,?,?,'pending')",
            (now, values["name"], values["email"], values["github"], json.dumps(values["tools"]), int(values["mac"]), ip_hash),
        )
        row = c.execute("SELECT * FROM alpha_requests WHERE id=?", (cur.lastrowid,)).fetchone()
        c.commit()
        return "received", row
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def set_alpha_status(request_id, status, who):
    if status not in ("invited", "rejected"):
        return None
    c = db()
    try:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT * FROM alpha_requests WHERE id=?", (request_id,)).fetchone()
        if not row:
            c.rollback()
            return None
        c.execute("UPDATE alpha_requests SET status=?, decided=?, decision_by=? WHERE id=?", (status, int(time.time()), who, request_id))
        c.commit()
        return c.execute("SELECT * FROM alpha_requests WHERE id=?", (request_id,)).fetchone()
    finally:
        c.close()


# ───────────────────────── подписи ─────────────────────────
def sign(payload: str) -> str:
    return hmac.new(COOKIE_SECRET, payload.encode(), hashlib.sha256).hexdigest()


def make_cookie(uid: int) -> str:
    exp = int(time.time()) + TTL
    p = f"u{uid}.{exp}"
    return f"{p}.{sign(p)}"


def parse_cookie(raw):
    if not raw or not COOKIE_SECRET:
        return None
    parts = raw.split(".")
    if len(parts) != 3 or not parts[0].startswith("u"):
        return None
    p = f"{parts[0]}.{parts[1]}"
    if not hmac.compare_digest(sign(p), parts[2]) or not parts[1].isdigit() or int(parts[1]) < time.time():
        return None
    return int(parts[0][1:])


def make_pending(uid: int, nxt: str) -> str:
    p = f"u{uid}.{int(time.time()) + 3600}.{urllib.parse.quote(nxt, safe='')}"
    return f"{p}.{sign(p)}"


def parse_pending(raw):
    """→ (uid, next) или None"""
    if not raw:
        return None
    parts = raw.rsplit(".", 1)
    if len(parts) != 2 or not hmac.compare_digest(sign(parts[0]), parts[1]):
        return None
    u, exp, nxt = parts[0].split(".", 2)
    if not u.startswith("u") or not exp.isdigit() or int(exp) < time.time():
        return None
    return int(u[1:]), urllib.parse.unquote(nxt)


def make_state(nxt: str) -> str:
    p = f"{secrets.token_urlsafe(12)}.{int(time.time()) + 600}.{urllib.parse.quote(nxt, safe='')}"
    return f"{p}.{sign(p)}"


def parse_state(raw):
    """→ next или None"""
    if not raw:
        return None
    parts = raw.rsplit(".", 1)
    if len(parts) != 2 or not hmac.compare_digest(sign(parts[0]), parts[1]):
        return None
    _, exp, nxt = parts[0].split(".", 2)
    if not exp.isdigit() or int(exp) < time.time():
        return None
    return urllib.parse.unquote(nxt)


def telegram_check(params):
    if not BOT_TOKEN or "hash" not in params:
        return False
    data = "\n".join(f"{k}={v}" for k, v in sorted(params.items()) if k != "hash")
    calc = hmac.new(hashlib.sha256(BOT_TOKEN.encode()).digest(), data.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, params["hash"]):
        return False
    try:
        return time.time() - int(params.get("auth_date", "0")) < AUTH_DATE_MAX_AGE
    except ValueError:
        return False


# ───────────────────────── HTTP-клиент ─────────────────────────
def http_json(url, data=None, headers=None, method=None):
    body = None
    h = {"Accept": "application/json", "User-Agent": "harness-auth/2"}
    h.update(headers or {})
    if data is not None:
        if isinstance(data, dict):
            body = urllib.parse.urlencode(data).encode()
            h.setdefault("Content-Type", "application/x-www-form-urlencoded")
        else:
            body = data
    req = urllib.request.Request(url, data=body, headers=h, method=method or ("POST" if body is not None else "GET"))
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def tg_api(method, **kw):
    if not BOT_TOKEN:
        return None
    try:
        return http_json(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", data=json.dumps(kw).encode(), headers={"Content-Type": "application/json"})
    except Exception as e:  # noqa: BLE001
        log_event({"event": "tg-api", "result": "error", "detail": f"{method}: {e}"[:200]})
        return None


def send_mail(to, subject, text):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = MAIL_FROM, to, subject
    msg.set_content(text)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as s:
        s.login(SMTP_USER, SMTP_PASS)
        s.send_message(msg)


def code_hash(email, code):
    return hmac.new(COOKIE_SECRET, f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def notify_owners_pending(user, provider, who):
    text = (f"Новый пользователь ждёт допуска на {HOST}\n"
            f"{user['name'] or '—'} · {user['email'] or 'без почты'} · через {provider}: {who}\nid {user['id']}")
    kb = {"inline_keyboard": [[{"text": "✅ Допустить", "callback_data": f"allow:{user['id']}"}, {"text": "⛔ Отклонить", "callback_data": f"block:{user['id']}"}]]}
    for key in owner_tg_ids():
        if key.startswith("telegram:") and key[9:].isdigit():
            tg_api("sendMessage", chat_id=int(key[9:]), text=text, reply_markup=kb)


def alpha_tools_text(raw):
    names = {"claude-code": "Claude Code", "codex": "Codex", "antigravity": "Antigravity", "other": "другое"}
    try:
        values = json.loads(raw or "[]")
    except (TypeError, json.JSONDecodeError):
        values = []
    return " · ".join(names.get(v, v) for v in values) or "—"


def notify_owners_alpha(row):
    text = (f"Новая заявка на альфу {HOST}\n"
            f"{row['name']} · {row['email']}\n"
            f"GitHub: {('@' + row['github']) if row['github'] else '—'}\n"
            f"Инструменты: {alpha_tools_text(row['tools'])}\n"
            f"macOS: {'да' if row['mac'] else 'нет'}\n"
            f"заявка #{row['id']}")
    kb = {"inline_keyboard": [[{"text": "✅ Пригласить", "callback_data": f"alpha-invite:{row['id']}"}, {"text": "⛔ Отклонить", "callback_data": f"alpha-reject:{row['id']}"}]]}
    for key in owner_tg_ids():
        if key.startswith("telegram:") and key[9:].isdigit():
            tg_api("sendMessage", chat_id=int(key[9:]), text=text, reply_markup=kb)


# ───────────────────────── страницы ─────────────────────────
PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harnessy · {title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>
:root{{--bg:#101012;--panel:#141416;--line:#242428;--line2:#2d2d32;--fg:#ececee;--mute:#9a9aa2;--acc:#c27a34;--acc-ink:#1a1a1a;--ok:#3fbf6f;--bad:#c9566e; --bad-fill:#a3304b}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:16px}}
.box{{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px 28px 22px;width:100%;max-width:440px}}
h1{{font-size:20px;margin:0 0 6px;font-weight:600}} p{{color:var(--mute);margin:0 0 16px}} .k{{color:var(--fg)}} code{{background:var(--bg);padding:1px 6px;border-radius:5px;font-size:13px}}
.doors{{display:grid;gap:10px;margin:18px 0 8px}} .door{{display:flex;align-items:center;justify-content:center;gap:10px;height:44px;border-radius:10px;border:1px solid var(--line2);background:#1b1b1e;color:var(--fg);text-decoration:none;font-weight:500;font-size:14px}}
.door:hover{{border-color:var(--acc)}} .door.p{{background:var(--acc);color:var(--acc-ink);border-color:var(--acc)}} .door svg{{width:18px;height:18px;flex:none}}
.tg{{display:flex;justify-content:center;min-height:44px;align-items:center}}
.small{{font-size:12px;color:var(--mute);margin-top:14px;text-align:center}} a{{color:#ececee}} details summary{{cursor:pointer}} details .tg{{margin-top:10px}}
.steps{{margin:0 0 14px;padding-left:20px;color:var(--mute)}} .steps li{{margin:6px 0}} .steps b{{color:var(--fg);font-weight:500}}
.spin{{display:inline-block;width:12px;height:12px;border:2px solid var(--line2);border-top-color:var(--acc);border-radius:50%;animation:sp 1s linear infinite;vertical-align:-2px;margin-right:6px}} @keyframes sp{{to{{transform:rotate(360deg)}}}}
.code{{font:600 28px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.12em;text-align:center;margin:14px 0 6px;color:var(--fg)}} .wait{{text-align:center;color:var(--mute);font-size:13px}}
table{{width:100%;border-collapse:collapse;font-size:13px}} td,th{{text-align:left;padding:6px 6px;border-bottom:1px solid var(--line);vertical-align:top}} th{{color:var(--mute);font-weight:500}}
.ok{{color:var(--ok)}} .no{{color:var(--bad)}} .pend{{color:var(--acc)}} .btn{{display:inline-block;padding:4px 10px;border-radius:7px;border:1px solid var(--line2);background:#1b1b1e;color:var(--fg);text-decoration:none;font-size:12px;margin-right:4px}}
.wide{{max-width:860px}}
</style></head><body><div class="box {cls}">{body}</div></body></html>"""

GH_SVG = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'
TG_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.04 15.3l-.37 5.2c.53 0 .76-.23 1.04-.5l2.5-2.4 5.18 3.8c.95.52 1.63.25 1.88-.88l3.4-15.95c.31-1.4-.5-1.95-1.43-1.6L1.3 10.66c-1.36.53-1.34 1.29-.23 1.63l5.1 1.6L18.1 6.4c.56-.37 1.07-.17.65.2L9.04 15.3z"/></svg>'
GG_SVG = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v7.6h12.7c-.3 2.1-1.6 5.2-4.7 7.3l7.3 5.7c4.4-4.1 7.2-10 7.2-16.6z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.4-8.6 2.4-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>'


LOGIN_HTML, POUR_JS = "", ""
# статика страницы входа: ролик-заставка и постер (слово владельца 08.10.2026); Range — чтобы браузер мог перематывать и зацикливать
STATIC_FILES = {"/auth/pour-intro.mp4": ("pour-intro.mp4", "video/mp4"), "/auth/pour-intro.jpg": ("pour-intro.jpg", "image/jpeg")}
_HERE = os.path.dirname(os.path.abspath(__file__))
try:
    LOGIN_HTML = open(os.path.join(_HERE, "login.html"), encoding="utf-8").read()
except OSError:
    pass
try:  # сцена «графин наливает»; без файла страницы входа работают как обычно, просто без картинки
    POUR_JS = open(os.path.join(_HERE, "pour-scene.js"), encoding="utf-8").read()
except OSError:
    pass

LEAD_DOORS = "Чат, план и команда агентов — в одном окне. Прототип закрытый: нового человека допускает владелец, остальным вход сразу."

# Страницы ожидания: опрос сервиса; сцена (window.Pour) наливает, доливает при подтверждении и гаснет при отказе. Без сцены — тот же опрос и переход.
_WAIT_JS = """<script>(function(){
  var st=document.getElementById('st'), rows=document.querySelectorAll('#stl div'), P=window.Pour, n=0;
  function step(k,txt){ for(var i=0;i<rows.length;i++) rows[i].className=i<k?'ok':(i===k?'cur':''); if(txt&&rows[k]) rows[k].textContent=txt; }
  function fail(msg){ if(P) P.deny(); for(var i=0;i<rows.length;i++) if(rows[i].className==='cur') rows[i].className='bad'; st.className='err'; st.innerHTML=msg; }
  function done(url,msg){ step(2); st.textContent=msg; var go=function(){ location.href=url; }; if(P) P.confirm(go); else go(); }
  (function poll(){ if(++n>__MAX__) return fail(__EXPIRED__);
    setTimeout(function(){ fetch('__POLL__',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ __CASES__ poll(); }).catch(function(){ poll(); }); },__EVERY__); })();
})();</script>"""
TG_WAIT_JS = (_WAIT_JS.replace("__POLL__", "/auth/tg/poll").replace("__EVERY__", "2000").replace("__MAX__", "300")
              .replace("__EXPIRED__", "'Время вышло — <a href=\"/auth/login\">начните заново</a>.'")
              .replace("__CASES__", "if(j.status==='ok') return done('/auth/tg/finish','Подтверждено — входим…'); if(j.status==='expired') return fail('Время вышло — <a href=\"/auth/login\">начните заново</a>.'); if(j.status==='seen') step(1,'бот открыт — нажмите «Войти» в его сообщении');"))
PENDING_WAIT_JS = (_WAIT_JS.replace("__POLL__", "/auth/pending/poll").replace("__EVERY__", "5000").replace("__MAX__", "720")
                   .replace("__EXPIRED__", "'Сессия ожидания истекла — <a href=\"/auth/login\">войдите снова</a>, допуск сохранится.'")
                   .replace("__CASES__", "if(j.status==='allowed') return done('/auth/pending/finish','Допуск выдан — открываем…'); if(j.status==='blocked') return fail('Владелец отклонил заявку.'); if(j.status==='expired') return fail('Сессия ожидания истекла — <a href=\"/auth/login\">войдите снова</a>, допуск сохранится.');"))


def shell(inner, *, eyebrow="закрытый прототип", h1="Войти в Harnessy", lead="", alt="", scene="idle", script="", title="вход"):
    """Общая рамка страниц входа (login.html): слева содержимое, справа сцена pour-scene.js.
    Подстановка в один проход: вставленный текст (имена, адреса) повторно не просматривается. lead/inner/alt — готовый HTML, вызывающий экранирует сам."""
    parts = {"TITLE": html.escape(title), "EYEBROW": html.escape(eyebrow), "H1": html.escape(h1), "LEAD": lead, "DOORS": inner, "ALT": alt,
             "CONTACT": html.escape(OWNER_CONTACT), "SCENE": "pour" if scene == "pour" else "idle", "SCRIPT": script, "POUR_JS": POUR_JS}
    return re.sub(r"%%([A-Z0-9_]+)%%", lambda m: parts.get(m.group(1), ""), LOGIN_HTML)


def login_page(nxt, mode="doors", email="", err=""):
    """Страница входа (login.html, рамка shell); если файла нет — простая карточка. mode=code — ввод кода из письма."""
    q = urllib.parse.quote(nxt, safe="")
    doors = []
    if mode == "code":
        doors.append(
            f'<form class="code-form" method="post" action="/auth/email/verify"><input type="hidden" name="email" value="{html.escape(email)}"><input type="hidden" name="next" value="{html.escape(nxt)}">'
            f'<p class="hint">Отправили код на <b>{html.escape(email)}</b>. Введите 6 цифр или нажмите ссылку в письме — она откроет вход сама.</p>'
            f'<input class="code-in" name="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" autofocus autocomplete="one-time-code">'
            + (f'<p class="err">{html.escape(err)}</p>' if err else "")
            + f'<button class="door p" type="submit">Войти</button>'
            f'<p class="hint"><a href="/auth/login?next={q}">← другой адрес или способ</a> · письма нет 1–2 минуты — проверьте «Спам»</p></form>')
        if not LOGIN_HTML:
            return PAGE.format(title="код", cls="", body="".join(doors))
        return shell("".join(doors), eyebrow="вход по почте", h1="Введите код", scene="pour", title="код из письма")
    if EMAIL_ENABLED:
        doors.append(
            f'<form class="email-form" method="post" action="/auth/email/start"><input type="hidden" name="next" value="{html.escape(nxt)}">'
            f'<input class="email-in" type="email" name="email" placeholder="почта — пришлём код" required autocomplete="email">'
            f'<button class="door p" type="submit">Продолжить с почтой</button></form>'
            + ('<p class="err">Похоже, адрес с ошибкой.</p>' if err == "email" else "") + '<div class="or"><span>или</span></div>')
    if BOT_NAME and BOT_TOKEN:
        doors.append(f'<a class="door{"" if EMAIL_ENABLED else " p"}" href="/auth/tg/start?next={q}">{TG_SVG} Войти через Telegram</a>')
    if GG_ID and GG_SECRET:
        doors.append(f'<a class="door" href="/auth/google?next={q}">{GG_SVG} Продолжить с Google</a>')
    if GH_ID and GH_SECRET:
        doors.append(f'<a class="door" href="/auth/github?next={q}">{GH_SVG} Продолжить с GitHub</a>')
    alt = ""
    if BOT_NAME and BOT_TOKEN:
        alt = (f'<details class="alt"><summary>Telegram без приложения — по номеру телефона</summary><div class="tg">'
               f'<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="{html.escape(BOT_NAME)}" data-size="large" data-userpic="false" '
               f'data-auth-url="{BASE_URL}/auth/telegram?next={q}" data-request-access="write"></script></div></details>')
    if not LOGIN_HTML:
        return PAGE.format(title="вход", cls="", body=login_body(nxt))
    return shell("".join(doors) or "<p class='hint'>Ни одна дверь не настроена.</p>", lead=LEAD_DOORS, alt=alt)


def login_body(nxt):
    q = urllib.parse.quote(nxt, safe="")
    doors = []
    if BOT_NAME and BOT_TOKEN:
        doors.append(f'<a class="door p" href="/auth/tg/start?next={q}">{TG_SVG} Войти через Telegram</a>')
    if GH_ID and GH_SECRET:
        doors.append(f'<a class="door" href="/auth/github?next={q}">{GH_SVG} Продолжить с GitHub</a>')
    if GG_ID and GG_SECRET:
        doors.append(f'<a class="door" href="/auth/google?next={q}">{GG_SVG} Продолжить с Google</a>')
    return (f"<h1>Harnessy · вход</h1><p>Проектируемый харнесс. Войдите любым способом — новый аккаунт ждёт допуска владельца; имя и время входа попадают в журнал.</p>"
            f"<div class='doors'>{''.join(doors) or '<p>Ни одна дверь не настроена.</p>'}</div>"
            + (f"<details class='small'><summary>Другой способ Telegram — по номеру телефона (oauth.telegram.org)</summary><div class='tg'><script async src=\"https://telegram.org/js/telegram-widget.js?22\" data-telegram-login=\"{html.escape(BOT_NAME)}\" data-size=\"large\" data-userpic=\"false\" data-auth-url=\"{BASE_URL}/auth/telegram?next={q}\" data-request-access=\"write\"></script></div></details>" if BOT_NAME and BOT_TOKEN else "")
            + f"<div class='small'>Либо логин и пароль в окне браузера (если закрыли окно — <a href='/'>откройте адрес заново</a>).</div>")


class H(BaseHTTPRequestHandler):
    server_version = "harness-auth/2"

    def log_message(self, *a):
        pass

    # ── helpers
    def _send(self, code, body="", ctype="text/html; charset=utf-8", extra=()):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _json(self, code, payload, extra=()):
        return self._send(code, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "application/json; charset=utf-8", extra)

    def _page(self, code, title, body, cls="", extra=()):
        return self._send(code, PAGE.format(title=html.escape(title), body=body, cls=cls), extra=extra)

    def _cookies(self):
        out = {}
        for part in self.headers.get("Cookie", "").split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                out[k] = v
        return out

    def _ip(self):
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def _ua(self):
        return self.headers.get("User-Agent", "")[:160]

    def _user(self):
        uid = parse_cookie(self._cookies().get(COOKIE, ""))
        return user_by_id(uid) if uid else None

    def _next(self, q):
        nxt = q.get("next") or self.headers.get("X-Next") or "/"
        if nxt.startswith("/auth/") or not nxt.startswith("/") or nxt.startswith("//"):
            nxt = "/"
        return nxt

    def _finish_login(self, provider, pid, *, email=None, username=None, name=None, nxt="/"):
        """Общее завершение любой двери: пользователь → журнал → cookie или «ждёт допуска»."""
        user, created = upsert_identity(provider, pid, email=email, username=username, name=name)
        who = f"@{username}" if username else (email or pid)
        log_event({"event": "login", "result": user["status"], "provider": provider, "pid": pid, "user": user["id"], "username": username, "email": email, "name": name, "ip": self._ip(), "ua": self._ua(), "new": created})
        if user["status"] == "allowed":
            ck = f"{COOKIE}={make_cookie(user['id'])}; Path=/; Max-Age={TTL}; Secure; HttpOnly; SameSite=Lax"
            return self._send(302, "", extra=[("Location", nxt), ("Set-Cookie", ck), ("Set-Cookie", f"{STATE_COOKIE}=; Path=/auth; Max-Age=0; Secure; HttpOnly")])
        if created:
            notify_owners_pending(user, provider, who)
        if user["status"] == "blocked":
            return self._page(403, "доступ закрыт", f"<h1>Доступ закрыт</h1><p>Аккаунт <span class='k'>{html.escape(who)}</span> заблокирован владельцем. Если это ошибка — <a href='{html.escape(OWNER_CONTACT)}'>напишите владельцу</a>.</p>")
        return self._pending_page(user, provider, who, name, nxt)

    def _pending_page(self, user, provider, who, name, nxt):
        pv = PROVIDER_RU.get(provider, provider)
        body = (f"<h1>Вы в списке на допуск</h1>"
                f"<p>{html.escape(pv)} подтвердил, что вы — <span class='k'>{html.escape(name or who)}</span> <span style='color:var(--mute)'>({html.escape(who)})</span>. "
                f"Прототип закрытый: каждого нового человека допускает владелец.</p>"
                f"<ol class='steps'><li><b>Сейчас</b> — владельцу ушло сообщение в Telegram с кнопкой «Допустить».</li>"
                f"<li><b>Ждать ничего не нужно делать</b> — эта страница проверяет решение каждые 5 секунд и сама откроет прототип. Можно закрыть вкладку: следующий вход тем же способом сразу пустит.</li>"
                f"<li><b>Если долго</b> (владелец спит) — <a href='{html.escape(OWNER_CONTACT)}' target='_blank'>напишите ему</a>, назовите номер <code>{user['id']}</code>.</li></ol>"
                f"<div class='wait' id='st'><span class='spin'></span> ожидаю решения владельца…</div>"
                f"<div class='small'><a href='/auth/login'>← войти другим способом</a></div>"
                f"<script>(async()=>{{const st=document.getElementById('st');for(;;){{await new Promise(r=>setTimeout(r,5000));try{{const j=await (await fetch('/auth/pending/poll',{{cache:'no-store'}})).json();"
                f"if(j.status==='allowed'){{st.innerHTML='✅ допуск выдан — открываю…';location.href='/auth/pending/finish';return;}}"
                f"if(j.status==='blocked'){{st.innerHTML='⛔ владелец отклонил заявку';return;}}"
                f"if(j.status==='expired'){{st.innerHTML='сессия ожидания истекла — <a href=\"/auth/login\">войдите снова</a>, допуск сохранится';return;}}}}catch(e){{}}}}}})();</script>")
        ck = f"hs_pend={make_pending(user['id'], nxt)}; Path=/auth; Max-Age=3600; Secure; HttpOnly; SameSite=Lax"
        if LOGIN_HTML:
            inner = (f"<div class='stl' id='stl'><div class='ok'>заявка ушла владельцу в Telegram</div><div class='cur'>ждём решение владельца</div><div>открываем сессию</div></div>"
                     f"<p class='hint'>Делать ничего не нужно: страница проверяет решение каждые 5 секунд и откроет прототип сама. Вкладку можно закрыть — следующий вход тем же способом сразу пустит.</p>"
                     f"<p class='hint'>Если долго — <a href='{html.escape(OWNER_CONTACT)}' target='_blank' rel='noopener'>напишите владельцу</a>, назовите номер <code>{user['id']}</code>.</p>"
                     f"<p class='hint' id='st'></p><p class='hint'><a href='/auth/login'>← войти другим способом</a></p>")
            lead = (f"{html.escape(pv)} подтвердил, что вы — <span class='k'>{html.escape(name or who)}</span> ({html.escape(who)}). "
                    f"Прототип закрытый: каждого нового человека допускает владелец.")
            return self._send(403, shell(inner, eyebrow="ждёт допуска", h1="Вы в списке на допуск", lead=lead, scene="pour", script=PENDING_WAIT_JS, title="ждёт допуска"), extra=[("Set-Cookie", ck)])
        return self._page(403, "ждёт допуска", body, extra=[("Set-Cookie", ck)])

    def r_pending_poll(self):
        pend = parse_pending(self._cookies().get("hs_pend", ""))
        if not pend:
            return self._send(200, json.dumps({"status": "expired"}), "application/json")
        u = user_by_id(pend[0])
        return self._send(200, json.dumps({"status": u["status"] if u else "expired"}), "application/json")

    def r_pending_finish(self):
        pend = parse_pending(self._cookies().get("hs_pend", ""))
        u = user_by_id(pend[0]) if pend else None
        if not (u and u["status"] == "allowed"):
            return self._send(302, "", extra=[("Location", "/auth/login")])
        log_event({"event": "login", "result": "allowed", "provider": "pending-finish", "user": u["id"], "ip": self._ip(), "ua": self._ua()})
        ck = f"{COOKIE}={make_cookie(u['id'])}; Path=/; Max-Age={TTL}; Secure; HttpOnly; SameSite=Lax"
        return self._send(302, "", extra=[("Location", pend[1] or "/"), ("Set-Cookie", ck), ("Set-Cookie", "hs_pend=; Path=/auth; Max-Age=0; Secure; HttpOnly")])

    # ── routes
    def do_HEAD(self):
        self.do_GET()

    def r_static(self, name, ctype):
        """Файл из папки сервиса: целиком или кусок по Range (206); кэш на сутки."""
        path = os.path.join(_HERE, name)
        try:
            size = os.path.getsize(path)
        except OSError:
            return self._send(404, "нет файла", "text/plain; charset=utf-8")
        start, end = 0, size - 1
        rng = self.headers.get("Range", "")
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        partial = False
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            if start > end or start >= size:
                self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return
            partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(length)); self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=86400")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(1 << 16, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(u.query, keep_blank_values=True))
        p = u.path
        try:
            if p in STATIC_FILES:
                return self.r_static(*STATIC_FILES[p])
            if p == "/auth/check":
                return self.r_check()
            if p == "/auth/login":
                return self._send(200, login_page(self._next(q), err=q.get("err", "")))
            if p == "/auth/telegram":
                return self.r_telegram(q)
            if p == "/auth/tg/start":
                return self.r_tg_start(q)
            if p == "/auth/tg/poll":
                return self.r_tg_poll(q)
            if p == "/auth/tg/finish":
                return self.r_tg_finish()
            if p == "/auth/email/code":
                return self.r_email_code_page(q)
            if p == "/auth/email/link":
                return self.r_email_verify(q)
            if p == "/auth/pending/poll":
                return self.r_pending_poll()
            if p == "/auth/pending/finish":
                return self.r_pending_finish()
            if p == "/auth/github":
                return self.r_oauth_start("github", q)
            if p == "/auth/github/callback":
                return self.r_github_cb(q)
            if p == "/auth/google":
                return self.r_oauth_start("google", q)
            if p == "/auth/google/callback":
                return self.r_google_cb(q)
            if p == "/auth/admin":
                return self.r_admin()
            if p == "/auth/log":
                return self.r_log()
            if p == "/auth/logout":
                return self._send(302, "", extra=[("Location", "/auth/login"), ("Set-Cookie", f"{COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax")])
            return self._page(404, "нет страницы", "<h1>Нет такой страницы</h1>")
        except Exception as e:  # noqa: BLE001
            log_event({"event": "error", "path": p, "detail": repr(e)[:300]})
            return self._page(500, "ошибка", f"<h1>Ошибка входа</h1><p>{html.escape(repr(e)[:200])}</p><p><a href='/auth/login'>Попробовать снова</a></p>")

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if n < 0 or n > MAX_POST_BYTES:
            if u.path == "/auth/alpha":
                return self._json(413, {"ok": False, "code": "request_too_large"})
            return self._send(413, "", "text/plain")
        raw = self.rfile.read(n) if n else b""
        try:
            if u.path == "/auth/alpha":
                return self.r_alpha(raw)
            if u.path == "/auth/tg/webhook":
                return self.r_tg_webhook(raw)
            if u.path == "/auth/email/start":
                return self.r_email_start(dict(urllib.parse.parse_qsl(raw.decode())))
            if u.path == "/auth/email/verify":
                return self.r_email_verify(dict(urllib.parse.parse_qsl(raw.decode())))
            if u.path == "/auth/admin/act":
                return self.r_admin_act(dict(urllib.parse.parse_qsl(raw.decode())))
            return self._send(404, "", "text/plain")
        except Exception as e:  # noqa: BLE001
            log_event({"event": "error", "path": u.path, "detail": repr(e)[:300]})
            if u.path == "/auth/alpha":
                return self._json(500, {"ok": False, "code": "server_error"})
            return self._send(500, "", "text/plain")

    def r_alpha(self, raw):
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            return self._json(415, {"ok": False, "code": "json_required"})
        origin = self.headers.get("Origin")
        if origin and origin.rstrip("/") != BASE_ORIGIN:
            return self._json(403, {"ok": False, "code": "origin_rejected"})
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._json(400, {"ok": False, "code": "invalid_json"})
        if isinstance(payload, dict) and str(payload.get("company") or "").strip():
            log_event({"event": "alpha", "result": "honeypot"})
            return self._json(201, {"ok": True, "status": "received"})
        values, fields = alpha_fields(payload)
        if fields:
            return self._json(400, {"ok": False, "code": "validation", "fields": fields})
        ip_hash = alpha_ip_hash(self._ip())
        if not ip_hash:
            return self._json(503, {"ok": False, "code": "not_configured"})
        status, row = create_alpha_request(values, ip_hash)
        if status == "rate_limited":
            log_event({"event": "alpha", "result": status, "ip_hash": ip_hash[:12]})
            return self._json(429, {"ok": False, "code": status}, [("Retry-After", str(ALPHA_RATE_WINDOW))])
        if status == "already_received":
            log_event({"event": "alpha", "result": status, "request": row["id"]})
            return self._json(200, {"ok": True, "status": status})
        log_event({"event": "alpha", "result": status, "request": row["id"]})
        notify_owners_alpha(row)
        return self._json(201, {"ok": True, "status": status})

    def r_check(self):
        user = self._user()
        if user and user["status"] == "allowed":
            return self._send(200, "", "text/plain", [("X-User", f"{user['id']}:{user['name'] or ''}")])
        return self._send(401, "", "text/plain")

    # ── Telegram widget
    def r_telegram(self, q):
        nxt = self._next(q)
        tg = {k: v for k, v in q.items() if k in ("id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash")}
        if not telegram_check(tg):
            log_event({"event": "login", "result": "bad-signature", "provider": "telegram", "pid": tg.get("id"), "ip": self._ip(), "ua": self._ua()})
            return self._page(403, "подпись", "<h1>Подпись Telegram не сошлась</h1><p>Данные устарели или подделаны. <a href='/auth/login'>Попробовать снова</a></p>")
        name = " ".join(x for x in (tg.get("first_name", ""), tg.get("last_name", "")) if x)
        return self._finish_login("telegram", tg["id"], username=tg.get("username") or None, name=name or None, nxt=nxt)

    # ── Почта: адрес → код в письме (10 минут, 5 попыток) → вход; новый адрес = регистрация (ждёт допуска)
    def r_email_start(self, form):
        if not EMAIL_ENABLED:
            return self._page(503, "почта", "<h1>Вход по почте не настроен</h1>")
        email = (form.get("email") or "").strip().lower()
        nxt = self._next(form)
        if not EMAIL_RE.match(email) or len(email) > 254:
            return self._send(302, "", extra=[("Location", f"/auth/login?next={urllib.parse.quote(nxt, safe='')}&err=email")])
        c = db()
        try:
            c.execute("DELETE FROM email_codes WHERE created < ?", (int(time.time()) - 3600,))
            recent = c.execute("SELECT count(*) FROM email_codes WHERE email=? AND created > ?", (email, int(time.time()) - 600)).fetchone()[0]
            recent_ip = c.execute("SELECT count(*) FROM email_codes WHERE ip=? AND created > ?", (self._ip(), int(time.time()) - 600)).fetchone()[0]
            if recent >= 3 or recent_ip >= 10:
                log_event({"event": "email", "result": "rate-limit", "email": email, "ip": self._ip()})
                return self._page(429, "почта", "<h1>Слишком много запросов</h1><p>Подождите 10 минут и попробуйте снова. <a href='/auth/login'>← ко входу</a></p>")
            code = f"{secrets.randbelow(900000) + 100000}"
            c.execute("INSERT INTO email_codes(email,code_hash,created,ip,nxt) VALUES(?,?,?,?,?)", (email, code_hash(email, code), int(time.time()), self._ip(), nxt))
            c.commit()
        finally:
            c.close()
        link = f"{BASE_URL}/auth/email/link?" + urllib.parse.urlencode({"email": email, "code": code})
        text = (f"Код входа на {HOST}: {code}\n\nВведите его на странице входа или откройте ссылку:\n{link}\n\n"
                f"Код действует 10 минут. Если вы не запрашивали вход — просто не отвечайте на письмо.\nЗапрос с IP {self._ip()}.")
        try:
            send_mail(email, f"{code} — код входа в Harnessy", text)
            log_event({"event": "email", "result": "sent", "email": email, "ip": self._ip()})
        except Exception as e:  # noqa: BLE001
            log_event({"event": "email", "result": "send-error", "email": email, "ip": self._ip(), "detail": repr(e)[:200]})
            return self._page(502, "почта", f"<h1>Письмо не отправилось</h1><p>{html.escape(repr(e)[:160])}</p><p><a href='/auth/login'>← ко входу</a></p>")
        return self._send(302, "", extra=[("Location", "/auth/email/code?" + urllib.parse.urlencode({"email": email, "next": nxt}))])

    def r_email_code_page(self, q):
        email = (q.get("email") or "").strip().lower()
        nxt = self._next(q)
        err = {"bad": "Код не подошёл — проверьте цифры.", "expired": "Код устарел или исчерпаны попытки — запросите новый."}.get(q.get("err", ""), "")
        return self._send(200, login_page(nxt, mode="code", email=email, err=err))

    def r_email_verify(self, form):
        email = (form.get("email") or "").strip().lower()
        code = re.sub(r"\D", "", form.get("code") or "")
        nxt = self._next(form)
        c = db()
        try:
            r = c.execute("SELECT rowid, * FROM email_codes WHERE email=? AND used=0 AND created > ? ORDER BY created DESC LIMIT 1", (email, int(time.time()) - 600)).fetchone()
            if not r or r["attempts"] >= 5:
                log_event({"event": "email", "result": "expired", "email": email, "ip": self._ip()})
                return self._send(302, "", extra=[("Location", "/auth/email/code?" + urllib.parse.urlencode({"email": email, "next": nxt, "err": "expired"}))])
            if not code or not hmac.compare_digest(code_hash(email, code), r["code_hash"]):
                c.execute("UPDATE email_codes SET attempts=attempts+1 WHERE rowid=?", (r["rowid"],)); c.commit()
                log_event({"event": "email", "result": "bad-code", "email": email, "ip": self._ip()})
                return self._send(302, "", extra=[("Location", "/auth/email/code?" + urllib.parse.urlencode({"email": email, "next": nxt, "err": "bad"}))])
            c.execute("UPDATE email_codes SET used=1 WHERE rowid=?", (r["rowid"],)); c.commit()
            nxt = r["nxt"] or nxt
        finally:
            c.close()
        return self._finish_login("email", email, email=email, name=email.split("@")[0], nxt=nxt)

    # ── Telegram через бота: nonce в cookie, deep link t.me/<bot>?start=<nonce>, подтверждение кнопкой в боте
    def _tg_nonce(self):
        raw = self._cookies().get("hs_tg", "")
        parts = raw.rsplit(".", 1)
        if len(parts) == 2 and hmac.compare_digest(sign(parts[0]), parts[1]):
            return parts[0]
        return None

    def r_tg_start(self, q):
        if not (BOT_NAME and BOT_TOKEN):
            return self._page(503, "Telegram", "<h1>Telegram не настроен</h1>")
        nxt = self._next(q)
        prev = self._tg_nonce()   # повторное открытие двери — тот же код: кнопка «Войти» в уже пришедшем сообщении бота остаётся в силе (ловушка двойного старта, 07.10.2026)
        c = db()
        try:
            c.execute("DELETE FROM tg_login WHERE created < ?", (int(time.time()) - 900,))
            r = c.execute("SELECT nonce, code FROM tg_login WHERE nonce=?", (prev,)).fetchone() if prev else None
            if r:
                nonce, code = r["nonce"], r["code"]
                c.execute("UPDATE tg_login SET nxt=? WHERE nonce=?", (nxt, nonce))
            else:
                nonce, code = secrets.token_urlsafe(24), f"{secrets.randbelow(9000) + 1000}"
                c.execute("INSERT INTO tg_login(nonce,created,code,ip,ua,nxt) VALUES(?,?,?,?,?,?)", (nonce, int(time.time()), code, self._ip(), self._ua(), nxt))
            c.commit()
        finally:
            c.close()
        link = f"https://t.me/{BOT_NAME}?start={nonce}"
        body = (f"<h1>Вход через Telegram</h1><p>Откроется ваш Telegram с ботом <span class='k'>@{html.escape(BOT_NAME)}</span>. Нажмите <b>Start</b>, затем кнопку <b>«Войти»</b> в сообщении бота — эта страница войдёт сама.</p>"
                f"<div class='doors'><a class='door p' href='{link}' id='open'>{TG_SVG} Открыть Telegram</a></div>"
                f"<div class='wait'>Код на этой странице и в боте должен совпасть:</div><div class='code'>{code}</div>"
                f"<div class='wait' id='st'>ожидаю подтверждения в Telegram…</div>"
                f"<div class='small'><a href='/auth/login'>← другой способ входа</a></div>"
                f"<script>(async()=>{{const st=document.getElementById('st');for(let i=0;i<300;i++){{await new Promise(r=>setTimeout(r,2000));try{{const r=await fetch('/auth/tg/poll',{{cache:'no-store'}});const j=await r.json();if(j.status==='ok'){{st.textContent='подтверждено, входим…';location.href='/auth/tg/finish';return;}}if(j.status==='seen'){{st.textContent='бот открыт — нажмите «Войти» в сообщении бота';}}if(j.status==='expired'){{st.textContent='время вышло — начните заново';return;}}}}catch(e){{}}}}st.textContent='время вышло — начните заново';}})();</script>")
        ck = [("Set-Cookie", f"hs_tg={nonce}.{sign(nonce)}; Path=/auth; Max-Age=900; Secure; HttpOnly; SameSite=Lax")]
        if LOGIN_HTML:
            inner = (f"<a class='door p' href='{link}' id='open'>{TG_SVG} Открыть Telegram</a>"
                     f"<p class='hint'>Код здесь и в боте должен совпасть:</p><div class='code4'>{''.join(f'<b>{d}</b>' for d in code)}</div>"
                     f"<div class='stl' id='stl'><div class='ok'>запрос отправлен</div><div class='cur'>ждём кнопку «Войти» в боте</div><div>открываем сессию</div></div>"
                     f"<p class='hint' id='st'></p><p class='hint'><a href='/auth/login'>← другой способ входа</a></p>")
            lead = (f"Откроется ваш Telegram с ботом <span class='k'>@{html.escape(BOT_NAME)}</span>. "
                    f"Нажмите <b>Start</b>, затем <b>«Войти»</b> в сообщении бота — эта страница войдёт сама.")
            return self._send(200, shell(inner, eyebrow="вход через telegram", h1="Подтвердите вход", lead=lead, scene="pour", script=TG_WAIT_JS, title="вход через Telegram"), extra=ck)
        return self._page(200, "вход через Telegram", body, extra=ck)

    def r_tg_poll(self, q):
        nonce = self._tg_nonce()
        c = db()
        try:
            r = c.execute("SELECT * FROM tg_login WHERE nonce=?", (nonce or "",)).fetchone()
        finally:
            c.close()
        if not r or r["created"] < time.time() - 900:
            st = "expired"
        elif r["confirmed"]:
            st = "ok"
        elif r["tg_id"]:
            st = "seen"
        else:
            st = "wait"
        return self._send(200, json.dumps({"status": st}), "application/json")

    def r_tg_finish(self):
        nonce = self._tg_nonce()
        c = db()
        try:
            r = c.execute("SELECT * FROM tg_login WHERE nonce=? AND confirmed=1 AND created > ?", (nonce or "", int(time.time()) - 900)).fetchone()
            if r:
                c.execute("DELETE FROM tg_login WHERE nonce=?", (nonce,))
                c.commit()
        finally:
            c.close()
        if not r:
            return self._send(302, "", extra=[("Location", "/auth/login")])
        resp = self._finish_login("telegram", r["tg_id"], username=r["username"], name=r["name"], nxt=r["nxt"] or "/")
        return resp

    # ── OAuth: GitHub / Google
    def r_oauth_start(self, prov, q):
        nxt = self._next(q)
        st = make_state(nxt)
        if prov == "github":
            if not (GH_ID and GH_SECRET):
                return self._page(503, "GitHub", "<h1>GitHub не настроен</h1>")
            url = "https://github.com/login/oauth/authorize?" + urllib.parse.urlencode({"client_id": GH_ID, "redirect_uri": f"{OAUTH_BASE}/auth/github/callback", "scope": "read:user user:email", "state": st, "allow_signup": "true"})
        else:
            if not (GG_ID and GG_SECRET):
                return self._page(503, "Google", "<h1>Google не настроен</h1>")
            url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({"client_id": GG_ID, "redirect_uri": f"{OAUTH_BASE}/auth/google/callback", "response_type": "code", "scope": "openid email profile", "state": st, "prompt": "select_account"})
        return self._send(302, "", extra=[("Location", url), ("Set-Cookie", f"{STATE_COOKIE}={st}; Path=/auth; Max-Age=600; Secure; HttpOnly; SameSite=Lax")])

    def _check_state(self, q):
        st = q.get("state", "")
        if not st or st != self._cookies().get(STATE_COOKIE, ""):
            return None
        return parse_state(st)

    def r_github_cb(self, q):
        nxt = self._check_state(q)
        if nxt is None or "code" not in q:
            log_event({"event": "login", "result": "bad-state", "provider": "github", "ip": self._ip(), "detail": q.get("error", "")})
            return self._page(400, "GitHub", "<h1>Сессия входа устарела</h1><p><a href='/auth/login'>Начать заново</a></p>")
        tok = http_json("https://github.com/login/oauth/access_token", {"client_id": GH_ID, "client_secret": GH_SECRET, "code": q["code"], "redirect_uri": f"{OAUTH_BASE}/auth/github/callback"})
        at = tok.get("access_token")
        if not at:
            log_event({"event": "login", "result": "token-error", "provider": "github", "detail": str(tok)[:200], "ip": self._ip()})
            return self._page(502, "GitHub", "<h1>GitHub не выдал токен</h1><p><a href='/auth/login'>Попробовать снова</a></p>")
        hdr = {"Authorization": f"Bearer {at}"}
        me = http_json("https://api.github.com/user", headers=hdr)
        email = None
        try:
            emails = http_json("https://api.github.com/user/emails", headers=hdr)
            prim = [e for e in emails if e.get("verified") and e.get("primary")] or [e for e in emails if e.get("verified")]
            email = prim[0]["email"] if prim else None
        except Exception:  # noqa: BLE001
            pass
        return self._finish_login("github", str(me["id"]), email=email, username=me.get("login"), name=me.get("name") or me.get("login"), nxt=nxt)

    def r_google_cb(self, q):
        nxt = self._check_state(q)
        if nxt is None or "code" not in q:
            log_event({"event": "login", "result": "bad-state", "provider": "google", "ip": self._ip(), "detail": q.get("error", "")})
            return self._page(400, "Google", "<h1>Сессия входа устарела</h1><p><a href='/auth/login'>Начать заново</a></p>")
        tok = http_json("https://oauth2.googleapis.com/token", {"client_id": GG_ID, "client_secret": GG_SECRET, "code": q["code"], "grant_type": "authorization_code", "redirect_uri": f"{OAUTH_BASE}/auth/google/callback"})
        idt = tok.get("id_token")
        if not idt:
            log_event({"event": "login", "result": "token-error", "provider": "google", "detail": str(tok)[:200], "ip": self._ip()})
            return self._page(502, "Google", "<h1>Google не выдал токен</h1>")
        info = http_json("https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": idt}))
        if info.get("aud") != GG_ID or info.get("email_verified") not in ("true", True):
            log_event({"event": "login", "result": "bad-token", "provider": "google", "ip": self._ip()})
            return self._page(403, "Google", "<h1>Токен Google не принят</h1>")
        return self._finish_login("google", info["sub"], email=info.get("email"), name=info.get("name"), nxt=nxt)

    # ── владелец
    def r_admin(self):
        user = self._user()
        if not (user and user["status"] == "allowed" and is_owner(user["id"])):
            return self._send(302, "", extra=[("Location", "/auth/login?next=/auth/admin")])
        c = db()
        try:
            rows = c.execute("SELECT u.*, (SELECT group_concat(provider||':'||COALESCE(username,email,pid), ' · ') FROM identities i WHERE i.user_id=u.id) AS doors FROM users u ORDER BY (status='pending') DESC, created DESC").fetchall()
            alpha = c.execute("SELECT * FROM alpha_requests ORDER BY (status='pending') DESC, ts DESC").fetchall()
        finally:
            c.close()
        tr = "".join(
            f"<tr><td>{r['id']}</td><td>{html.escape(r['name'] or '')}<br><span style='color:var(--mute)'>{html.escape(r['email'] or '')}</span></td><td>{html.escape(r['doors'] or '')}</td>"
            f"<td class='{ {'allowed':'ok','pending':'pend','blocked':'no'}.get(r['status'],'') }'>{r['status']}</td><td>{time.strftime('%d.%m %H:%M', time.localtime(r['created']))}</td>"
            f"<td><form method='post' action='/auth/admin/act' style='display:inline'><input type='hidden' name='uid' value='{r['id']}'>"
            f"<button class='btn' name='act' value='allow'>допустить</button><button class='btn' name='act' value='block'>закрыть</button></form></td></tr>" for r in rows)
        alpha_status = {"pending": ("pend", "ждёт решения"), "invited": ("ok", "приглашён"), "rejected": ("no", "отклонён")}
        alpha_tr = "".join(
            f"<tr><td>{r['id']}</td><td>{html.escape(r['name'])}<br><span style='color:var(--mute)'>{html.escape(r['email'])}</span></td>"
            f"<td>{html.escape('@' + r['github'] if r['github'] else '—')}</td><td>{html.escape(alpha_tools_text(r['tools']))}</td><td>{'да' if r['mac'] else 'нет'}</td>"
            f"<td class='{alpha_status.get(r['status'], ('',''))[0]}'>{alpha_status.get(r['status'], ('',html.escape(r['status'])))[1]}</td><td>{time.strftime('%d.%m %H:%M', time.localtime(r['ts']))}</td>"
            f"<td><form method='post' action='/auth/admin/act' style='display:inline'><input type='hidden' name='alpha_id' value='{r['id']}'>"
            f"<button class='btn' name='act' value='invite'>пригласить</button><button class='btn' name='act' value='reject'>отклонить</button></form></td></tr>" for r in alpha)
        body = (f"<h1>Заявки на альфу</h1><p>вы: <span class='k'>{html.escape(user['name'] or '')}</span> · <a href='/auth/log'>журнал</a> · <a href='/'>к прототипу</a></p>"
                f"<table><tr><th>#</th><th>Кто</th><th>GitHub</th><th>Инструменты</th><th>Mac</th><th>Статус</th><th>Получена</th><th></th></tr>{alpha_tr or '<tr><td colspan=8>заявок нет</td></tr>'}</table>"
                f"<h1 style='margin-top:32px'>Пользователи</h1>"
                f"<table><tr><th>#</th><th>Кто</th><th>Двери</th><th>Статус</th><th>Создан</th><th></th></tr>{tr or '<tr><td colspan=6>пусто</td></tr>'}</table>")
        return self._page(200, "пользователи", body, cls="wide")

    def r_admin_act(self, form):
        user = self._user()
        if not (user and user["status"] == "allowed" and is_owner(user["id"])):
            return self._send(403, "", "text/plain")
        act = form.get("act", "")
        alpha_raw = form.get("alpha_id", "")
        alpha_id = int(alpha_raw) if alpha_raw.isdigit() else 0
        if alpha_id and act in ("invite", "reject"):
            row = set_alpha_status(alpha_id, "invited" if act == "invite" else "rejected", f"admin:{user['id']}")
            if row:
                log_event({"event": "alpha-admin", "result": act, "request": alpha_id, "by": user["id"]})
            return self._send(302, "", extra=[("Location", "/auth/admin")])
        uid_raw = form.get("uid", "")
        uid = int(uid_raw) if uid_raw.isdigit() else 0
        if act in ("allow", "block") and uid:
            set_status(uid, "allowed" if act == "allow" else "blocked", f"admin:{user['id']}")
            log_event({"event": "admin", "result": act, "user": uid, "by": user["id"], "ip": self._ip()})
        return self._send(302, "", extra=[("Location", "/auth/admin")])

    def r_log(self):
        user = self._user()
        if not (user and user["status"] == "allowed"):
            return self._send(302, "", extra=[("Location", "/auth/login?next=/auth/log")])
        rows = []
        try:
            with open(LOG_FILE, encoding="utf-8") as f:
                rows = [json.loads(ln) for ln in f if ln.strip()][-200:]
        except FileNotFoundError:
            pass
        rows.reverse()
        tr = "".join(
            f"<tr><td>{html.escape(r.get('ts',''))}</td><td>{html.escape(r.get('event',''))}</td><td class='{'ok' if r.get('result') in ('ok','allowed','allow') else 'no'}'>{html.escape(str(r.get('result','')))}</td>"
            f"<td>{html.escape(str(r.get('provider','')))} {html.escape(str(r.get('name') or r.get('username') or r.get('email') or r.get('pid') or ''))}</td><td>{html.escape(r.get('ip',''))}</td></tr>" for r in rows)
        body = (f"<h1>Журнал входов</h1><p>последние {len(rows)} · вы: <span class='k'>{html.escape(user['name'] or '')}</span>{' · <a href=/auth/admin>пользователи</a>' if is_owner(user['id']) else ''} · <a href='/'>к прототипу</a> · <a href='/auth/logout'>выйти</a></p>"
                f"<table><tr><th>Когда</th><th>Событие</th><th>Итог</th><th>Кто</th><th>IP</th></tr>{tr or '<tr><td colspan=5>пусто</td></tr>'}</table>")
        return self._page(200, "журнал", body, cls="wide")

    # ── бот: /start и кнопки допуска
    def r_tg_webhook(self, raw):
        if TG_WEBHOOK_SECRET and self.headers.get("X-Telegram-Bot-Api-Secret-Token") != TG_WEBHOOK_SECRET:
            return self._send(403, "", "text/plain")
        upd = json.loads(raw or b"{}")
        cq = upd.get("callback_query")
        if cq:
            frm = str(cq["from"]["id"])
            data = cq.get("data", "")
            if data.startswith("tglogin:"):
                nonce = data[8:]
                c = db()
                try:
                    r = c.execute("SELECT * FROM tg_login WHERE nonce=? AND tg_id=? AND created > ?", (nonce, frm, int(time.time()) - 900)).fetchone()
                    if r:
                        c.execute("UPDATE tg_login SET confirmed=1 WHERE nonce=?", (nonce,))
                        c.commit()
                finally:
                    c.close()
                tg_api("answerCallbackQuery", callback_query_id=cq["id"], text="Готово — вернитесь в браузер" if r else "Запрос устарел, начните заново на сайте")
                m = cq.get("message") or {}
                if m and r:
                    tg_api("editMessageText", chat_id=m["chat"]["id"], message_id=m["message_id"], text=m.get("text", "") + "\n\n✅ вход подтверждён")
                return self._send(200, "ok", "text/plain")
            if f"telegram:{frm}" in owner_tg_ids() and ":" in data:
                act, uid = data.split(":", 1)
                if act in ("allow", "block") and uid.isdigit():
                    set_status(int(uid), "allowed" if act == "allow" else "blocked", f"tg:{frm}")
                    log_event({"event": "admin", "result": act, "user": int(uid), "by": f"tg:{frm}"})
                    tg_api("answerCallbackQuery", callback_query_id=cq["id"], text="Допущен" if act == "allow" else "Отклонён")
                    m = cq.get("message") or {}
                    if m:
                        tg_api("editMessageText", chat_id=m["chat"]["id"], message_id=m["message_id"], text=(m.get("text", "") + ("\n\n✅ допущен" if act == "allow" else "\n\n⛔ отклонён")))
                elif act in ("alpha-invite", "alpha-reject") and uid.isdigit():
                    row = set_alpha_status(int(uid), "invited" if act == "alpha-invite" else "rejected", f"tg:{frm}")
                    result = "invite" if act == "alpha-invite" else "reject"
                    if row:
                        log_event({"event": "alpha-admin", "result": result, "request": int(uid), "by": f"tg:{frm}"})
                    tg_api("answerCallbackQuery", callback_query_id=cq["id"], text=("Помечено: пригласить вручную" if result == "invite" else "Отклонено") if row else "Заявка не найдена")
                    m = cq.get("message") or {}
                    if m and row:
                        tg_api("editMessageText", chat_id=m["chat"]["id"], message_id=m["message_id"], text=(m.get("text", "") + ("\n\n✅ помечено: пригласить вручную" if result == "invite" else "\n\n⛔ отклонено")))
                else:
                    tg_api("answerCallbackQuery", callback_query_id=cq["id"], text="Кнопка устарела")
            else:
                tg_api("answerCallbackQuery", callback_query_id=cq["id"], text="Только владелец")
            return self._send(200, "ok", "text/plain")
        msg = upd.get("message") or {}
        text = msg.get("text", "")
        if text.startswith("/start"):
            frm = msg.get("from") or {}
            parts = text.split(None, 1)
            nonce = parts[1].strip() if len(parts) > 1 else ""
            c = db()
            try:
                r = c.execute("SELECT * FROM tg_login WHERE nonce=? AND created > ?", (nonce, int(time.time()) - 900)).fetchone() if nonce else None
                if r and not r["confirmed"]:
                    name = " ".join(x for x in (frm.get("first_name", ""), frm.get("last_name", "")) if x)
                    c.execute("UPDATE tg_login SET tg_id=?, username=?, name=? WHERE nonce=?", (str(frm.get("id")), frm.get("username"), name or None, nonce))
                    c.commit()
            finally:
                c.close()
            if r and not r["confirmed"]:
                kb = {"inline_keyboard": [[{"text": "✅ Войти", "callback_data": f"tglogin:{nonce}"}]]}
                tg_api("sendMessage", chat_id=msg["chat"]["id"], text=f"Вход на {HOST}\nКод в браузере: {r['code']}\nIP {r['ip']}\n\nЕсли это вы и код совпадает — нажмите «Войти».", reply_markup=kb)
            else:
                tg_api("sendMessage", chat_id=msg["chat"]["id"], text=f"Это бот входа на {HOST}. Ваш Telegram ID: {frm.get('id')}. Войти: {BASE_URL}/auth/login")
        return self._send(200, "ok", "text/plain")


if __name__ == "__main__":
    db().close()
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
