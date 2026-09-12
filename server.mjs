#!/usr/bin/env node
// Простейший чат с моделями Anthropic по подписке Claude.
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
const PORT = Number(process.env.PORT || 3777);
// Рабочая папка для сессий CLI. Специально ВНЕ домашней папки: иначе Claude Code
// подхватил бы /Users/kostenchuksergey/CLAUDE.md и все его инструкции в чат.
const WORK_DIR = process.env.CHAT_WORK_DIR || '/Users/Shared/simple-claude-chat';

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];
const DEFAULT_MODEL = MODELS[0].id;
const SYSTEM_PROMPT =
  'Ты ассистент в простом чате. Отвечай на языке собеседника, по существу. ' +
  'Инструментов, доступа к файлам и к интернету у тебя в этом чате нет.';

// ---------- где лежит claude ----------
function findClaude() {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const home = process.env.HOME || '';
  const candidates = [
    path.join(home, '.local/bin/claude'),
    path.join(home, '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const r = spawnSync('/bin/sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
  const found = (r.stdout || '').trim();
  return found || null;
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

// ---------- статус входа ----------
function authStatus() {
  if (!CLAUDE_BIN) return { loggedIn: false, error: 'claude не найден' };
  const r = spawnSync(CLAUDE_BIN, ['auth', 'status'], { env: childEnv(), encoding: 'utf8', timeout: 8000, cwd: WORK_DIR });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { loggedIn: false, error: (r.stderr || r.stdout || 'нет ответа').trim().slice(0, 300) };
  }
}

// ---------- один ход чата ----------
function runTurn({ message, model, sessionId }, send) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', model,
    '--tools', '',              // чат без инструментов
    '--strict-mcp-config',      // без MCP-серверов пользователя
    '--setting-sources', '',    // без хуков и настроек пользователя
    '--system-prompt', SYSTEM_PROMPT,
  ];
  if (sessionId) args.push('--resume', sessionId);

  const child = spawn(CLAUDE_BIN, args, { cwd: WORK_DIR, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(message);

  let buf = '';
  let stderr = '';
  let streamed = 0;
  let finalSessionId = sessionId || null;
  let finished = false;

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
      } else if (ev.type === 'result') {
        if (ev.is_error) {
          finish({ type: 'error', message: String(ev.result || 'ошибка модели'), sessionId: finalSessionId });
        } else {
          // если потоковых кусков не было (старый формат) — отдаём итоговый текст целиком
          if (!streamed && typeof ev.result === 'string' && ev.result) send({ type: 'delta', text: ev.result });
          finish({
            type: 'done',
            sessionId: finalSessionId,
            model,
            durationMs: ev.duration_ms,
            costUsd: ev.total_cost_usd,
            usage: ev.usage ? {
              input: ev.usage.input_tokens,
              output: ev.usage.output_tokens,
              cacheRead: ev.usage.cache_read_input_tokens,
            } : null,
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
      const auth = authStatus();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ claudeBin: CLAUDE_BIN, workDir: WORK_DIR, models: MODELS, defaultModel: DEFAULT_MODEL, auth }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!CLAUDE_BIN) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'claude не найден; задай CLAUDE_BIN' })); return; }
      const body = JSON.parse(await readBody(req) || '{}');
      const message = String(body.message || '').trim();
      const model = MODELS.some((m) => m.id === body.model) ? body.model : DEFAULT_MODEL;
      const sessionId = typeof body.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : null;
      if (!message) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'пустое сообщение' })); return; }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); if (ev.type === 'done' || ev.type === 'error') res.end(); };
      const child = runTurn({ message, model, sessionId }, send);
      req.on('close', () => { if (!child.killed && child.exitCode === null) child.kill('SIGTERM'); });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('нет такого пути');
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

fs.mkdirSync(WORK_DIR, { recursive: true });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[chat] http://localhost:${PORT}`);
  console.log(`[chat] claude: ${CLAUDE_BIN || 'НЕ НАЙДЕН'}  сессии: ${WORK_DIR}`);
  const a = authStatus();
  console.log(`[chat] вход по подписке: ${a.loggedIn ? 'да (' + (a.authMethod || '') + ')' : 'НЕТ — выполни в Терминале: claude login'}`);
});
