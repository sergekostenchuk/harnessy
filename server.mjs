#!/usr/bin/env node
// Простой чат с моделями Anthropic по подписке Claude: два независимых окна на
// одной странице, общая папка проекта, у каждого окна своя модель, режим
// доступа к папке и своя сессия. Окна могут писать друг другу: у каждого агента
// есть инструмент send_to_other (см. bin/pane-mcp.mjs).
// Ходит не в API, а в локальный Claude Code CLI (`claude -p`), который залогинен
// подпиской. Никаких зависимостей: только Node 22+.
//
// Запуск:  node server.mjs        → http://localhost:3777
// Вход:    один раз в Терминале:  claude login

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '';
const PORT = Number(process.env.PORT || 3777);
const APP_URL = `http://127.0.0.1:${PORT}`;
// Папка по умолчанию для режима «только чат». Вне домашней папки, чтобы Claude Code
// не подхватывал /Users/kostenchuksergey/CLAUDE.md. Папку проекта выбирают на странице.
const DEFAULT_DIR = process.env.CHAT_WORK_DIR || '/Users/Shared/simple-claude-chat';

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];
const DEFAULT_MODEL = MODELS[0].id;

const PANE_IDS = ['left', 'right'];
const PANE_LABEL = { left: 'левое окно', right: 'правое окно' };
const MAX_RELAY_DEPTH = 3;

const SYSTEM_CHAT =
  'Ты ассистент в простом чате. Отвечай на языке собеседника, по существу. ' +
  'Доступа к файлам и к интернету у тебя в этом чате нет.';
const peerNote = (pane) =>
  ` Рядом работает второе окно чата (${pane === 'left' ? 'правое' : 'левое'}): другой агент, возможно другая модель. ` +
  'Ему можно написать инструментом send_to_other и получить ответ; пользуйся этим, когда пользователь просит ' +
  'передать, спросить или поручить что-то соседу. Сосед не видит твоей переписки: пиши ему полный текст.';
const teamNote = (cwd, pane) =>
  `Ты работаешь в папке проекта: ${cwd}. В этой же папке параллельно может работать агент из соседнего окна. ` +
  'Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, коммиты делай только если ' +
  'попросили. В конце ответа кратко перечисли, что сделал и какие файлы изменил.' + peerNote(pane);

// Режимы доступа к папке. Окна «разрешить?» в фоновом режиме нет, поэтому режим
// заранее говорит, что можно без вопросов. Инструмент соседа разрешён во всех режимах.
const PEER_TOOL = 'mcp__panes__send_to_other';
const SAFE_BASH = [
  'Bash(git:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(pwd)', 'Bash(find:*)', 'Bash(grep:*)', 'Bash(rg:*)',
  'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(npm test:*)', 'Bash(npm run:*)', 'Bash(node:*)', 'Bash(python3:*)',
].join(',');
const MODES = {
  chat: { label: 'Только чат', args: (cwd, pane) => ['--tools', '', '--allowedTools', PEER_TOOL, '--system-prompt', SYSTEM_CHAT + peerNote(pane)] },
  read: { label: 'Чтение папки', args: (cwd, pane) => ['--tools', 'Read,Glob,Grep', '--allowedTools', PEER_TOOL, '--append-system-prompt', teamNote(cwd, pane) + ' Только читай и анализируй, правок не делай.'] },
  edit: { label: 'Правки и команды', args: (cwd, pane) => ['--tools', 'default', '--permission-mode', 'acceptEdits', '--allowedTools', SAFE_BASH + ',' + PEER_TOOL, '--append-system-prompt', teamNote(cwd, pane)] },
  all:  { label: 'Всё без вопросов', args: (cwd, pane) => ['--tools', 'default', '--dangerously-skip-permissions', '--append-system-prompt', teamNote(cwd, pane)] },
};
const DEFAULT_MODE = 'chat';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- где лежит claude ----------
function findClaude() {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const candidates = [
    path.join(HOME, '.local/bin/claude'),
    path.join(HOME, '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const r = spawnSync('/bin/sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
  return (r.stdout || '').trim() || null;
}
const CLAUDE_BIN = findClaude();

// MCP-конфиг с мостом «сосед»: один файл, сторона и глубина приходят через окружение процесса.
const MCP_CONFIG = path.join(__dirname, '.mcp-panes.json');
fs.writeFileSync(MCP_CONFIG, JSON.stringify({
  mcpServers: { panes: { command: process.execPath, args: [path.join(__dirname, 'bin', 'pane-mcp.mjs')] } },
}, null, 2));

// Окружение для дочернего claude: убираем всё, что уводит с подписки или мешает.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.CLAUDECODE;           // иначе claude откажется стартовать «внутри claude»
  delete env.CLAUDE_CODE_SIMPLE;   // режим --bare не читает OAuth подписки
  env.MCP_TOOL_TIMEOUT = env.MCP_TOOL_TIMEOUT || String(30 * 60 * 1000); // ход соседа может длиться минуты
  if (env.ANTHROPIC_API_KEY) {
    delete env.ANTHROPIC_API_KEY;  // чат по подписке, не по ключу
    console.warn('[chat] ANTHROPIC_API_KEY в окружении убран: чат работает по подписке');
  }
  return env;
}

function authStatus() {
  if (!CLAUDE_BIN) return { loggedIn: false, error: 'claude не найден' };
  const r = spawnSync(CLAUDE_BIN, ['auth', 'status'], { env: childEnv(), encoding: 'utf8', timeout: 8000, cwd: DEFAULT_DIR });
  try { return JSON.parse(r.stdout); }
  catch { return { loggedIn: false, error: (r.stderr || r.stdout || 'нет ответа').trim().slice(0, 300) }; }
}

// ---------- папка проекта и журналы её сессий ----------
function validDir(p) {
  try { return typeof p === 'string' && path.isAbsolute(p) && fs.statSync(p).isDirectory(); } catch { return false; }
}
// Claude Code кладёт журналы в ~/.claude/projects/<путь, где всё кроме букв и цифр заменено на «-»>
function sessionsDirFor(cwd) {
  return path.join(HOME, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}
function isToolResult(content) {
  return Array.isArray(content) && content.some((b) => b && b.type === 'tool_result');
}
function parseSession(file) {
  const messages = [];
  let ai = null;
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return messages; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.isMeta) continue;
    const m = r.message || {};
    if (r.type === 'user' && m.role === 'user') {
      if (isToolResult(m.content)) continue;
      if (ai && ai.text) messages.push(ai);
      ai = null;
      const text = textOf(m.content);
      if (text) messages.push({ role: 'me', text, ts: r.timestamp || null });
    } else if (r.type === 'assistant' && m.role === 'assistant') {
      const text = textOf(m.content);
      if (!ai) ai = { role: 'ai', text: '', ts: r.timestamp || null };
      if (text) ai.text += (ai.text && !ai.text.endsWith('\n') ? '\n' : '') + text;
    }
  }
  if (ai && ai.text) messages.push(ai);
  return messages;
}
function listSessions(cwd) {
  const dir = sessionsDirFor(cwd);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { return []; }
  const out = [];
  for (const n of names) {
    const id = n.slice(0, -6);
    if (!UUID_RE.test(id)) continue;
    const file = path.join(dir, n);
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch { continue; }
    const messages = parseSession(file);
    if (!messages.length) continue;
    const first = messages.find((m) => m.role === 'me') || messages[0];
    out.push({ id, title: first.text.replace(/\s+/g, ' ').slice(0, 60), count: messages.length, updated: new Date(mtime).toISOString() });
  }
  out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  return out;
}

// ---------- окна: настройки, занятость, подписчики событий ----------
const panes = {};
for (const id of PANE_IDS) panes[id] = { id, model: DEFAULT_MODEL, mode: DEFAULT_MODE, cwd: DEFAULT_DIR, sessionId: null, busy: false, subscribers: new Set() };
function otherPane(id) { return panes[id === 'left' ? 'right' : 'left']; }
function updatePane(p, body) {
  if (MODELS.some((m) => m.id === body.model)) p.model = body.model;
  if (MODES[body.mode]) p.mode = body.mode;
  if (validDir(body.cwd)) p.cwd = body.cwd;
  if (body.sessionId === null || body.sessionId === '') p.sessionId = null;
  else if (typeof body.sessionId === 'string' && UUID_RE.test(body.sessionId)) p.sessionId = body.sessionId;
}
function publish(p, ev) {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of p.subscribers) { try { res.write(line); } catch { p.subscribers.delete(res); } }
}

// ---------- один ход чата ----------
function toolDetail(name, input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.file_path || input.path || input.command || input.pattern || input.query || input.url || input.text || input.description || '';
  return String(v).replace(/\s+/g, ' ').slice(0, 200);
}
// Запускает один ход в окне p. Все события уходят через send (SSE вызывающего и/или подписчики окна).
function runTurn(p, { message, relayDepth = 0 }, send) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', p.model,
    '--strict-mcp-config', '--mcp-config', MCP_CONFIG,   // только наш мост «сосед», без MCP пользователя
    '--setting-sources', '',                              // без хуков и настроек пользователя
    ...MODES[p.mode].args(p.cwd, p.id),
  ];
  if (p.sessionId) args.push('--resume', p.sessionId);

  const env = childEnv({ PANE_ID: p.id, APP_URL, RELAY_DEPTH: String(relayDepth) });
  const child = spawn(CLAUDE_BIN, args, { cwd: p.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(message);

  let buf = '';
  let stderr = '';
  let streamed = 0;
  let full = '';
  let finalSessionId = p.sessionId || null;
  let finished = false;
  const toolNames = new Map();
  const done = new Promise((resolve) => {
    const finish = (ev) => {
      if (finished) return;
      finished = true;
      if (finalSessionId) p.sessionId = finalSessionId;
      send(ev);
      resolve({ ok: ev.type === 'done', text: full, error: ev.type === 'error' ? ev.message : null, sessionId: finalSessionId });
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.session_id) finalSessionId = ev.session_id;
        if (ev.type === 'stream_event') {
          const e = ev.event || {};
          if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
            streamed += e.delta.text.length; full += e.delta.text;
            send({ type: 'delta', text: e.delta.text });
          }
        } else if (ev.type === 'assistant') {
          for (const b of (ev.message?.content || [])) {
            if (b && b.type === 'tool_use' && !toolNames.has(b.id)) {
              toolNames.set(b.id, b.name);
              send({ type: 'tool', name: b.name, detail: toolDetail(b.name, b.input) });
            }
          }
        } else if (ev.type === 'user') {
          for (const b of (ev.message?.content || [])) {
            if (!b || b.type !== 'tool_result') continue;
            const t = typeof b.content === 'string' ? b.content : textOf(b.content);
            if (b.is_error) send({ type: 'toolError', text: String(t || 'ошибка инструмента').slice(0, 300) });
            else if (toolNames.get(b.tool_use_id) === PEER_TOOL || toolNames.get(b.tool_use_id) === 'send_to_other') send({ type: 'peerReply', text: String(t || '').slice(0, 4000) });
          }
        } else if (ev.type === 'result') {
          if (ev.is_error) finish({ type: 'error', message: String(ev.result || 'ошибка модели'), sessionId: finalSessionId });
          else {
            if (!streamed && typeof ev.result === 'string' && ev.result) { full = ev.result; send({ type: 'delta', text: ev.result }); }
            finish({
              type: 'done', sessionId: finalSessionId, model: p.model, durationMs: ev.duration_ms,
              usage: ev.usage ? { input: ev.usage.input_tokens, output: ev.usage.output_tokens, cacheRead: ev.usage.cache_read_input_tokens } : null,
            });
          }
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish({ type: 'error', message: `не удалось запустить claude: ${e.message}` }));
    child.on('close', (code) => {
      if (!finished) {
        const tail = stderr.trim().slice(-600);
        finish({ type: 'error', message: `claude завершился с кодом ${code}${tail ? ': ' + tail : ''}`, sessionId: finalSessionId });
      }
    });
  });
  return { child, done };
}

// ---------- HTTP ----------
function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('слишком большое тело запроса')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' };
const INDEX = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, APP_URL);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(INDEX));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, {
        claudeBin: CLAUDE_BIN, defaultDir: DEFAULT_DIR, models: MODELS, defaultModel: DEFAULT_MODEL,
        modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.label })), defaultMode: DEFAULT_MODE, panes: PANE_IDS, auth: authStatus(),
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/dir') {
      const cwd = url.searchParams.get('cwd') || '';
      if (!validDir(cwd)) return json(res, 400, { ok: false, error: 'папки нет или это не папка: ' + cwd });
      return json(res, 200, { ok: true, cwd, sessionsDir: sessionsDirFor(cwd), hasClaudeMd: fs.existsSync(path.join(cwd, 'CLAUDE.md')) });
    }
    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const cwd = url.searchParams.get('cwd') || DEFAULT_DIR;
      if (!validDir(cwd)) return json(res, 400, { error: 'папки нет: ' + cwd });
      return json(res, 200, { cwd, sessions: listSessions(cwd) });
    }
    const one = req.method === 'GET' && url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})$/i);
    if (one) {
      const id = one[1];
      const cwd = url.searchParams.get('cwd') || DEFAULT_DIR;
      if (!UUID_RE.test(id)) return json(res, 400, { error: 'неверный id' });
      if (!validDir(cwd)) return json(res, 400, { error: 'папки нет: ' + cwd });
      const file = path.join(sessionsDirFor(cwd), id + '.jsonl');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'сессии нет' });
      return json(res, 200, { id, messages: parseSession(file) });
    }
    // настройки окна от страницы: модель, режим, папка, текущая сессия
    const paneSet = req.method === 'POST' && url.pathname.match(/^\/api\/panes\/(left|right)$/);
    if (paneSet) {
      const p = panes[paneSet[1]];
      updatePane(p, JSON.parse(await readBody(req) || '{}'));
      return json(res, 200, { ok: true, pane: { id: p.id, model: p.model, mode: p.mode, cwd: p.cwd, sessionId: p.sessionId, busy: p.busy } });
    }
    // события окна для страницы: ходы, пришедшие от соседа
    const paneEv = req.method === 'GET' && url.pathname.match(/^\/api\/events\/(left|right)$/);
    if (paneEv) {
      const p = panes[paneEv[1]];
      res.writeHead(200, SSE_HEADERS);
      res.write(': подключено\n\n');
      p.subscribers.add(res);
      const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch {} }, 15000);
      req.on('close', () => { clearInterval(ka); p.subscribers.delete(res); });
      return;
    }
    // сообщение от соседа (через мост pane-mcp): ход в целевом окне, ответ отправителю
    if (req.method === 'POST' && url.pathname === '/api/relay') {
      const body = JSON.parse(await readBody(req) || '{}');
      const from = PANE_IDS.includes(body.from) ? body.from : null;
      const text = String(body.text || '').trim();
      const depth = Number(body.depth || 0);
      if (!from) return json(res, 400, { ok: false, error: 'неизвестный отправитель' });
      if (!text) return json(res, 400, { ok: false, error: 'пустое сообщение' });
      if (depth >= MAX_RELAY_DEPTH) return json(res, 400, { ok: false, error: `цепочка сообщений между окнами длиннее ${MAX_RELAY_DEPTH}` });
      const target = otherPane(from);
      if (!CLAUDE_BIN) return json(res, 500, { ok: false, error: 'claude не найден' });
      if (target.busy) return json(res, 409, { ok: false, error: `${PANE_LABEL[target.id]} занято своим ходом` });
      if (!validDir(target.cwd)) return json(res, 400, { ok: false, error: 'у соседа не задана папка' });
      target.busy = true;
      publish(target, { type: 'relayStart', from, text });
      let result;
      try {
        result = await runTurn(target, { message: `[Сообщение от соседнего окна (${PANE_LABEL[from]})]\n${text}`, relayDepth: depth + 1 }, (ev) => publish(target, ev)).done;
      } finally {
        target.busy = false;
      }
      if (!result.ok) return json(res, 502, { ok: false, error: result.error || 'ход соседа не удался' });
      return json(res, 200, { ok: true, reply: result.text, sessionId: result.sessionId });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!CLAUDE_BIN) return json(res, 500, { error: 'claude не найден; задай CLAUDE_BIN' });
      const body = JSON.parse(await readBody(req) || '{}');
      const p = panes[PANE_IDS.includes(body.pane) ? body.pane : 'left'];
      updatePane(p, body);
      const message = String(body.message || '').trim();
      if (!message) return json(res, 400, { error: 'пустое сообщение' });
      if (!validDir(p.cwd)) return json(res, 400, { error: 'папки нет или это не папка: ' + p.cwd });
      if (p.busy) return json(res, 409, { error: `${PANE_LABEL[p.id]} занято: идёт ход (возможно, по сообщению соседа)` });
      p.busy = true;
      res.writeHead(200, SSE_HEADERS);
      const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); if (ev.type === 'done' || ev.type === 'error') res.end(); };
      const { child, done } = runTurn(p, { message }, send);
      done.finally(() => { p.busy = false; });
      req.on('close', () => { if (!child.killed && child.exitCode === null) child.kill('SIGTERM'); });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('нет такого пути');
  } catch (e) {
    if (!res.headersSent) return json(res, 500, { error: e.message });
    res.end();
  }
});

fs.mkdirSync(DEFAULT_DIR, { recursive: true });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[chat] ${APP_URL}`);
  console.log(`[chat] claude: ${CLAUDE_BIN || 'НЕ НАЙДЕН'}; мост «сосед»: ${MCP_CONFIG}`);
  console.log(`[chat] папка по умолчанию: ${DEFAULT_DIR}; журналы: ${sessionsDirFor(DEFAULT_DIR)}`);
  const a = authStatus();
  console.log(`[chat] вход по подписке: ${a.loggedIn ? 'да (' + (a.authMethod || '') + ')' : 'НЕТ — выполни в Терминале: claude login'}`);
});
