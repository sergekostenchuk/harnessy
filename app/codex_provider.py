"""Адаптер Codex через официальный Python SDK openai-codex: двусторонний JSON-RPC с
`codex app-server`. Один живой app-server на окно, тред на разговор, запросы разрешений
идут в окно кнопками, ход можно прервать. Вход — подписка ChatGPT (auth.json Codex)."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import tomllib

from openai_codex import AsyncCodex, CodexConfig
from openai_codex.api import AsyncThread
from openai_codex.generated.v2_all import ThreadReadResponse, ThreadResumeResponse, ThreadStartResponse

from .claude_provider import strip_digest
from .panes import APPROVAL_TIMEOUT_SEC, Pane, Registry

HOME = os.path.expanduser("~")
SPARK_ROUTER_DIR = f"{HOME}/.codex/tools/sol-spark-router"

BASE_OVERRIDES = (
    "features.hooks=false", "features.multi_agent=false", "features.apps=false", "features.memories=false",
    "features.plugins=false", "features.browser_use=false", "features.computer_use=false",
    "project_doc_max_bytes=0", "notify=[]",
)

CHAT_INSTRUCTIONS = ("Это простой чат. Отвечай на языке собеседника, по существу. Команды не выполняй, файлы не читай, "
                     "просто отвечай текстом.")


def team_note(pane: Pane, registry: Registry) -> str:
    others = ", ".join(f"{o.id} — {o.label} ({o.vendor})" for o in registry.others(pane.id))
    return (f"Ты работаешь в папке проекта: {pane.cwd}. В этой же папке параллельно могут работать агенты из других окон: {others}. "
            "Связь с ними только инструментами MCP-сервера panes (не командами оболочки): send — отправить запись и не ждать, "
            "ask — спросить и дождаться ответа, read_pane — прочитать их разговор. Записи от соседей приходят входящим сообщением с номером #seq: отвечай на них "
            "send с reply_to. Соседи не видят твоей переписки: пиши им полный текст. "
            "Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, коммиты делай только если попросили. "
            "В конце ответа кратко перечисли, что сделал и какие файлы изменил.")


def mode_params(mode: str, has_worktree: bool = False) -> tuple[str, str]:
    """(sandbox, approvalPolicy) по режиму окна. У места со своим worktree режим проверок
    получает запись в песочнице: checkout SHA и запуск тестов пишут в дерево."""
    if mode in ("chat", "read"):
        return "read-only", "never"
    if mode in ("check", "web"):
        return ("workspace-write" if has_worktree and mode == "check" else "read-only"), "on-request"
    if mode in ("ask", "edit"):
        return "workspace-write", "on-request"
    return "danger-full-access", "never"


def approval_title(method: str, params: dict) -> tuple[str, str]:
    p = params or {}
    if method == "item/commandExecution/requestApproval":
        cmd = p.get("command")
        cmd = " ".join(cmd) if isinstance(cmd, list) else str(cmd or "")
        return "Codex просит выполнить команду", (cmd[:300] + ("\nПричина: " + str(p.get("reason"))[:300] if p.get("reason") else ""))
    if method == "item/fileChange/requestApproval":
        changes = p.get("changes") or p.get("files") or []
        paths = ", ".join(str(c.get("path") or c) for c in changes)[:300] if isinstance(changes, list) else str(changes)[:300]
        return "Codex просит изменить файлы", paths + ("\nПричина: " + str(p.get("reason"))[:300] if p.get("reason") else "")
    if method == "item/permissions/requestApproval":
        return "Codex просит расширить права", json.dumps(p.get("permissions") or p, ensure_ascii=False)[:400]
    return f"Codex: {method}", json.dumps(p, ensure_ascii=False, default=str)[:400]


class CodexProvider:
    vendor = "codex"

    def __init__(self, registry: Registry, app_url: str, bridge_cmd: list[str]):
        self.registry = registry
        self.app_url = app_url
        self.bridge_cmd = bridge_cmd            # [node, pane-mcp.mjs]
        self.clients: dict[str, tuple[AsyncCodex, str]] = {}   # pane id -> (client, cwd)
        self.list_clients: dict[str, AsyncCodex] = {}          # cwd -> client только для списков и чтения тредов
        self.depth: dict[str, int] = {}
        self.role_note = None                                  # callable(pane) -> str, ставит сервер
        self.models_cache: list[dict] | None = None
        self.account_cache: dict | None = None

    @staticmethod
    def user_mcp_servers() -> list[str]:
        """Имена MCP-серверов из ~/.codex/config.toml: их выключаем в наших тредах (override не очищает таблицу)."""
        try:
            with open(f"{HOME}/.codex/config.toml", "rb") as f:
                cfg = tomllib.load(f)
            return [k for k in (cfg.get("mcp_servers") or {}).keys()]
        except Exception:
            return []

    def overrides(self, pane: Pane) -> tuple[str, ...]:
        node, script = self.bridge_cmd
        seats = ";".join(f"{p.id}:{p.label}" for p in self.registry.panes.values()).replace('"', "")
        ov = list(BASE_OVERRIDES) + [f"mcp_servers.{k}.enabled=false" for k in self.user_mcp_servers() if k not in ("panes", "sol-spark-router")] + [
            f'mcp_servers.panes.command="{node}"',
            f'mcp_servers.panes.args=["{script}"]',
            f'mcp_servers.panes.env={{PANE_ID="{pane.id}",APP_URL="{self.app_url}",SEATS="{seats}"}}',
        ]
        roots = getattr(self, "writable_roots", None)
        if roots and callable(roots):
            extra = roots(pane)
            if extra:
                ov.append("sandbox_workspace_write.writable_roots=[" + ",".join(f'"{r}"' for r in extra) + "]")
        py = f"{SPARK_ROUTER_DIR}/.venv/bin/python"
        srv = f"{SPARK_ROUTER_DIR}/server.py"
        if os.path.exists(py) and os.path.exists(srv):
            ov += [
                f'mcp_servers.sol-spark-router.command="{py}"',
                f'mcp_servers.sol-spark-router.args=["{srv}"]',
                "mcp_servers.sol-spark-router.startup_timeout_sec=20",
                "mcp_servers.sol-spark-router.tool_timeout_sec=3600",
            ]
        return tuple(ov)

    async def client(self, pane: Pane) -> AsyncCodex:
        cur = self.clients.get(pane.id)
        if cur and cur[1] == pane.cwd:
            return cur[0]
        if cur:
            if pane.busy:
                raise RuntimeError("папка окна изменилась во время хода; дождись конца хода")
            try:
                await cur[0].close()
            except Exception:
                pass
        cfg = CodexConfig(cwd=pane.cwd, client_name="simple_claude_chat", client_title="Simple chat",
                          config_overrides=self.overrides(pane))
        codex = AsyncCodex(config=cfg)
        await codex.__aenter__()
        loop = asyncio.get_running_loop()

        def approval_handler(method: str, params: dict | None) -> dict:
            # Вызывается в потоке чтения SDK: спрашиваем окно через цикл событий и ждём ответа владельца.
            p_ = params or {}
            if method == "mcpServer/elicitation/request":
                meta = p_.get("_meta") or {}
                server = p_.get("serverName") or ""
                if meta.get("codex_approval_kind") == "mcp_tool_call" and server == "panes":
                    return {"action": "accept", "content": {}}   # свой мост между окнами — без вопросов
                shown = ", ".join(f"{x.get('name')}={str(x.get('value'))[:80]}" for x in (meta.get("tool_params_display") or []))
                title = f"Codex просит вызвать инструмент MCP «{server}»"
                detail = str(p_.get("message") or "")[:200] + ("\n" + shown if shown else "")
            else:
                title, detail = approval_title(method, p_)
                if method not in ("item/commandExecution/requestApproval", "item/fileChange/requestApproval"):
                    print(f"[codex:{pane.id}] запрос сервера {method}: {json.dumps(params, ensure_ascii=False, default=str)[:1500]}", file=sys.stderr, flush=True)
            try:
                allow = asyncio.run_coroutine_threadsafe(pane.ask_approval(title, detail), loop).result(APPROVAL_TIMEOUT_SEC + 10)
            except Exception as e:  # noqa: BLE001
                print(f"[codex] разрешение не получено: {e}", file=sys.stderr, flush=True)
                allow = False
            if method in ("item/commandExecution/requestApproval", "item/fileChange/requestApproval"):
                return {"decision": "accept" if allow else "decline"}
            if method == "item/permissions/requestApproval":
                return {"permissions": (p_.get("permissions") or {}) if allow else {}, "scope": "turn"}
            if method == "mcpServer/elicitation/request":
                return {"action": "accept", "content": {}} if allow else {"action": "decline"}
            return {}

        codex._client._sync._approval_handler = approval_handler  # SDK не даёт публичного хука для async-клиента
        self.clients[pane.id] = (codex, pane.cwd)
        return codex

    async def _thread(self, pane: Pane, codex: AsyncCodex) -> AsyncThread:
        sandbox, policy = mode_params(pane.mode, bool(pane.worktree))
        params = {"cwd": pane.cwd, "model": pane.model, "approvalPolicy": policy, "sandbox": sandbox}
        if not pane.model:
            params.pop("model")          # модель не задана — модель Codex по умолчанию
        role = (self.role_note(pane) if self.role_note else "").strip()
        role_block = (role + "\n\n") if role else ""
        if pane.mode == "chat":
            params["developerInstructions"] = role_block + CHAT_INSTRUCTIONS
        else:
            tail = {"read": " Только читай и анализируй, правок не делай.", "check": " Проверяй прогоном: команды разрешены, правки кода — нет.",
                    "web": " Интернет разрешён; каждый факт с источником."}.get(pane.mode, "")
            params["developerInstructions"] = role_block + team_note(pane, self.registry) + tail
        if pane.session_id:
            resp = await codex._client.request("thread/resume", {"threadId": pane.session_id, **params}, response_model=ThreadResumeResponse)
        else:
            resp = await codex._client.request("thread/start", params, response_model=ThreadStartResponse)
        pane.session_id = resp.thread.id
        return AsyncThread(codex, resp.thread.id)

    async def run_turn(self, pane: Pane, message: str, relay_depth: int = 0) -> str:
        self.depth[pane.id] = relay_depth
        codex = await self.client(pane)
        thread = await self._thread(pane, codex)
        started = time.time()
        handle = await thread.turn(message)
        pane.interrupt = handle.interrupt

        async def steer(text: str) -> None:
            await handle.steer(text)
        pane.steer = steer
        text = ""
        usage: dict = {}
        items_text: list[str] = []
        error = None
        async for n in handle.stream():
            m = n.method
            p = n.payload
            d = p.model_dump(by_alias=True) if hasattr(p, "model_dump") else {}
            if os.environ.get("CHAT_DEBUG"):
                print(f"[codex:{pane.id}] {m} {json.dumps(d, ensure_ascii=False, default=str)[:300]}", file=sys.stderr, flush=True)
            if m == "item/agentMessage/delta":
                delta = d.get("delta") or ""
                if delta:
                    text += delta
                    pane.publish({"type": "delta", "text": delta})
            elif m == "item/started":
                item = d.get("item") or {}
                t = item.get("type")
                if t == "commandExecution":
                    cmd = item.get("command")
                    pane.publish({"type": "tool", "name": "Bash", "detail": (" ".join(cmd) if isinstance(cmd, list) else str(cmd or ""))[:200]})
                elif t == "fileChange":
                    ch = item.get("changes") or []
                    paths = ", ".join(str(c.get("path", "")) for c in ch if isinstance(c, dict))
                    pane.publish({"type": "tool", "name": "Edit", "detail": paths[:200]})
                elif t == "mcpToolCall":
                    pane.publish({"type": "tool", "name": f"{item.get('server')}.{item.get('tool')}",
                                  "detail": json.dumps(item.get("arguments") or {}, ensure_ascii=False)[:200]})
                elif t == "webSearch":
                    pane.publish({"type": "tool", "name": "WebSearch", "detail": str(item.get("query") or "")[:200]})
            elif m == "item/completed":
                item = d.get("item") or {}
                t = item.get("type")
                if t == "commandExecution":
                    status = str(item.get("status") or "")
                    code = item.get("exitCode")
                    if "fail" in status.lower() or (isinstance(code, int) and code != 0):
                        out = str(item.get("aggregatedOutput") or item.get("output") or "")[-300:]
                        pane.publish({"type": "toolError", "text": f"команда завершилась ({status}, код {code}): {out}"})
                elif t == "agentMessage":
                    if item.get("text"):
                        items_text.append(item["text"])
            elif m == "thread/tokenUsage/updated":
                last = ((d.get("tokenUsage") or {}).get("last")) or {}
                usage = {"input": last.get("inputTokens"), "output": last.get("outputTokens"), "cacheRead": last.get("cachedInputTokens")}
            elif m == "turn/completed":
                turn = d.get("turn") or {}
                error = turn.get("error")
                if not text and items_text:
                    text = "\n".join(items_text)
                    pane.publish({"type": "delta", "text": text})
                dur = turn.get("durationMs") or int((time.time() - started) * 1000)
                if error:
                    raise RuntimeError(str(error.get("message") if isinstance(error, dict) else error))
                pane.tokens = usage
                pane.publish({"type": "done", "sessionId": pane.session_id, "model": pane.model, "durationMs": dur, "usage": usage})
        return text

    # ---- разговоры ----
    async def _list_client(self, cwd: str) -> AsyncCodex:
        """Клиент для чтения тредов папки: отдельный от клиентов окон, чтобы не рвать идущий ход."""
        c = self.list_clients.get(cwd)
        if c is not None:
            return c
        cfg = CodexConfig(cwd=cwd, client_name="simple_claude_chat_list", client_title="Simple chat (списки)",
                          config_overrides=BASE_OVERRIDES + ("mcp_servers={}",))
        c = AsyncCodex(config=cfg)
        await c.__aenter__()
        self.list_clients[cwd] = c
        return c

    async def list_sessions(self, cwd: str) -> list[dict]:
        try:
            codex = await self._list_client(cwd)
            lst = await codex.thread_list(cwd=cwd, limit=30)
        except Exception as e:  # noqa: BLE001
            print(f"[codex] thread_list: {e}", file=sys.stderr, flush=True)
            self.list_clients.pop(cwd, None)
            return []
        out = []
        for t in (getattr(lst, "data", None) or []):
            title = (getattr(t, "name", None) or "").strip()
            if not title:
                try:
                    rd = await codex._client.request("thread/read", {"threadId": t.id, "includeTurns": True}, response_model=ThreadReadResponse)
                    msgs = self._messages_from_read(rd)
                    first = next((m for m in msgs if m["role"] == "me"), None)
                    title = (first["text"] if first else "").replace("\n", " ")[:60]
                except Exception:
                    title = ""
            out.append({"id": t.id, "title": title or "(без названия)", "updated": getattr(t, "updated_at", None) or getattr(t, "created_at", 0) or 0})
        out.sort(key=lambda x: -(x["updated"] or 0))
        return out

    def _messages_from_read(self, rd) -> list[dict]:
        msgs = []
        thread = getattr(rd, "thread", None)
        for turn in (getattr(thread, "turns", None) or []):
            for item in (getattr(turn, "items", None) or []):
                d = item.model_dump(by_alias=True) if hasattr(item, "model_dump") else (item if isinstance(item, dict) else {})
                t = d.get("type")
                if t == "userMessage":
                    text = strip_digest("".join(c.get("text", "") for c in (d.get("content") or []) if isinstance(c, dict)))
                    if text.strip():
                        msgs.append({"role": "me", "text": text})
                elif t == "agentMessage" and d.get("text"):
                    if msgs and msgs[-1]["role"] == "ai":
                        msgs[-1]["text"] += "\n" + d["text"]
                    else:
                        msgs.append({"role": "ai", "text": d["text"]})
        return msgs

    async def session_messages(self, cwd: str, session_id: str) -> list[dict]:
        codex = await self._list_client(cwd)
        rd = await codex._client.request("thread/read", {"threadId": session_id, "includeTurns": True}, response_model=ThreadReadResponse)
        return self._messages_from_read(rd)

    # ---- справочная информация ----
    async def info(self) -> dict:
        if self.models_cache is not None and self.account_cache is not None:
            return {"models": self.models_cache, "account": self.account_cache}
        try:
            cfg = CodexConfig(cwd=self.registry.default_cwd, client_name="simple_claude_chat", client_title="Simple chat",
                              config_overrides=BASE_OVERRIDES + ("mcp_servers={}",))
            async with AsyncCodex(config=cfg) as codex:
                acc = await codex.account()
                a = getattr(getattr(acc, "account", None), "root", None)
                self.account_cache = {"loggedIn": a is not None, "email": getattr(a, "email", None), "plan": str(getattr(a, "plan_type", "") or "").split(".")[-1]}
                ml = await codex.models()
                ids = [getattr(m, "id", None) or getattr(m, "model", None) for m in (getattr(ml, "models", None) or getattr(ml, "data", None) or [])]
                self.models_cache = [{"id": i, "label": i} for i in ids if i]
        except Exception as e:  # noqa: BLE001
            print(f"[codex] info: {e}", file=sys.stderr)
            self.account_cache = {"loggedIn": False, "error": str(e)[:200]}
            self.models_cache = [{"id": "gpt-5.6-sol", "label": "gpt-5.6-sol"}, {"id": "gpt-5.3-codex-spark", "label": "gpt-5.3-codex-spark"}]
        return {"models": self.models_cache, "account": self.account_cache}

    async def close(self) -> None:
        for codex in list(self.list_clients.values()):
            try:
                await codex.close()
            except Exception:
                pass
        self.list_clients.clear()
        for codex, _ in self.clients.values():
            try:
                await codex.close()
            except Exception:
                pass
        self.clients.clear()
