#!/usr/bin/env node
// Простой чат с моделями Anthropic по подписке Claude: два независимых окна на
// одной странице, общая папка проекта, у каждого окна своя модель, режим
// доступа к папке и своя сессия.
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

const SYSTEM_CHAT =
  'Ты ассистент в простом чате. Отвечай на языке собеседника, по существу. ' +
  'Инструментов, доступа к файлам и к интернету у тебя в этом чате нет.';
const teamNote = (cwd) =>
  `Ты работаешь в папке проекта: ${cwd}. В этой же папке параллельно могут работать другие агенты ` +
  '(другие окна чата). Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, ' +
  'коммиты делай только если попросили. В конце ответа кратко перечисли, что сделал и какие файлы изменил.';

// Режимы доступа к папке. Окна «разрешить?» в фоновом режиме нет, поэтому режим
// заранее говорит, что можно без вопросов.
const SAFE_BASH = [
  'Bash(git:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(pwd)', 'Bash(find:*)', 'Bash(grep:*)', 'Bash(rg:*)',
  'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(npm test:*)', 'Bash(npm run:*)', 'Bash(node:*)', 'Bash(python3:*)',
].join(',');
const MODES = {
  chat: { label: 'Только чат', args: (cwd) => ['--tools', '', '--system-prompt', SYSTEM_CHAT] },
  read: { label: 'Чтение папки', args: (cwd) => ['--tools', 'Read,Glob,Grep', '--append-system-prompt', teamNote(cwd) + ' Только читай и анализируй, правок не делай.'] },
  edit: { label: 'Правки и команды', args: (cwd) => ['--tools', 'default', '--permission-mode', 'acceptEdits', '--allowedTools', SAFE_BASH, '--append-system-prompt', teamNote(cwd)] },
  all:  { label: 'Всё без вопросов', args: (cwd) => ['--tools', 'default', '--dangerously-skip-permissions', '--append-system-prompt', teamNote(cwd)] },
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

// Окружение для дочернего claude: убираем всё, что уводит с подписки или мешает.
function childEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;           // иначе claude откажется стартовать «внутри claude»
  delete env.CLAUDE_CODE_SIMPLE;   // режим --bare не читает OAuth подписки
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
// Читает .jsonl сессии → [{role:'me'|'ai', text, ts}]. Записи ассистента одного хода
// (thinking, текст, вызовы инструментов, текст) склеиваются в один ответ.
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
      if (isToolResult(m.content)) continue;          // результат инструмента: ход ассистента продолжается
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

// ---------- один ход чата ----------
function toolDetail(name, input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.file_path || input.path || input.command || input.pattern || input.query || input.url || input.description || '';
  return String(v).slice(0, 160);
}
function runTurn({ message, model, sessionId, cwd, mode }, send) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', model,
    '--strict-mcp-config',      // без MCP-серверов пользователя
    '--setting-sources', '',    // без хуков и настроек пользователя
    ...MODES[mode].args(cwd),
  ];
  if (sessionId) args.push('--resume', sessionId);

  const child = spawn(CLAUDE_BIN, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(message);

  let buf = '';
  let stderr = '';
  let streamed = 0;
  let finalSessionId = sessionId || null;
  let finished = false;
  const seenTools = new Set();
  const finish = (ev) => { if (!finished) { finished = true; send(ev); } };

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
          streamed += e.delta.text.length;
          send({ type: 'delta', text: e.delta.text });
        }
      } else if (ev.type === 'assistant') {
        for (const b of (ev.message?.content || [])) {
          if (b && b.type === 'tool_use' && !seenTools.has(b.id)) {
            seenTools.add(b.id);
            send({ type: 'tool', name: b.name, detail: toolDetail(b.name, b.input) });
          }
        }
      } else if (ev.type === 'user') {
        for (const b of (ev.message?.content || [])) {
          if (b && b.type === 'tool_result' && b.is_error) {
            const t = typeof b.content === 'string' ? b.content : textOf(b.content);
            send({ type: 'toolError', text: String(t || 'ошибка инструмента').slice(0, 300) });
          }
        }
      } else if (ev.type === 'result') {
        if (ev.is_error) {
          finish({ type: 'error', message: String(ev.result || 'ошибка модели'), sessionId: finalSessionId });
        } else {
          if (!streamed && typeof ev.result === 'string' && ev.result) send({ type: 'delta', text: ev.result });
          finish({
            type: 'done', sessionId: finalSessionId, model, durationMs: ev.duration_ms,
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
  return child;
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
const INDEX = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(INDEX));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, {
        claudeBin: CLAUDE_BIN, defaultDir: DEFAULT_DIR, models: MODELS, defaultModel: DEFAULT_MODEL,
        modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.label })), defaultMode: DEFAULT_MODE, auth: authStatus(),
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
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!CLAUDE_BIN) return json(res, 500, { error: 'claude не найден; задай CLAUDE_BIN' });
      const body = JSON.parse(await readBody(req) || '{}');
      const message = String(body.message || '').trim();
      const model = MODELS.some((m) => m.id === body.model) ? body.model : DEFAULT_MODEL;
      const mode = MODES[body.mode] ? body.mode : DEFAULT_MODE;
      const cwd = typeof body.cwd === 'string' && body.cwd ? body.cwd : DEFAULT_DIR;
      const sessionId = typeof body.sessionId === 'string' && UUID_RE.test(body.sessionId) ? body.sessionId : null;
      if (!message) return json(res, 400, { error: 'пустое сообщение' });
      if (!validDir(cwd)) return json(res, 400, { error: 'папки нет или это не папка: ' + cwd });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); if (ev.type === 'done' || ev.type === 'error') res.end(); };
      const child = runTurn({ message, model, sessionId, cwd, mode }, send);
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
  console.log(`[chat] http://localhost:${PORT}`);
  console.log(`[chat] claude: ${CLAUDE_BIN || 'НЕ НАЙДЕН'}`);
  console.log(`[chat] папка по умолчанию: ${DEFAULT_DIR}; журналы: ${sessionsDirFor(DEFAULT_DIR)}`);
  const a = authStatus();
  console.log(`[chat] вход по подписке: ${a.loggedIn ? 'да (' + (a.authMethod || '') + ')' : 'НЕТ — выполни в Терминале: claude login'}`);
});
