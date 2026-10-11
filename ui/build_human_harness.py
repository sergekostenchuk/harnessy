"""
Human-First Next-Gen Harness Desktop Application
Awards 2026-2027 Edition
Radically simplified, intuitive, and usable for an ordinary human.
Modeled after the gold standards: Claude Desktop + Cursor + Perplexity + Pi.
- Unified split-screen: Left is Dialog & Action, Right is Interactive Canvas (Product, Code, Map, Tasks)
- 7 Invariants clearly presented in context (not a rainbow ceiling banner)
- 4 Spaces naturally integrated: Проект · Диалог · Код · Продукт
- Real sources: live :3000/#/om-map, real diff of OmMapScreen.tsx, real milestone tasks Q2/D8.4d, real chat.
"""

import json
import os

MAP_PATH = "/Users/kostenchuksergey/REPORTS/workbench-design/data/map.json"
DEV_PATH = "/Users/kostenchuksergey/REPORTS/workbench-design/data/dev-timeline.json"
TARGET_HTML = "/Users/kostenchuksergey/REPORTS/workbench-design/concept/workbench-unified.html"

with open(MAP_PATH, "r", encoding="utf-8") as f:
    map_data = json.load(f)

with open(DEV_PATH, "r", encoding="utf-8") as f:
    dev_data = json.load(f)

remaining_ids = dev_data["counters"]["remainingIds"]
tasks_map = {t["id"]: t for t in dev_data["tasks"]}
remaining_tasks = [tasks_map[tid] for tid in remaining_ids if tid in tasks_map]

html_content = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness • Человечный рабочий стол для моделей (Award 2026-2027)</title>
<style>
:root {
  --bg-app: #0c0e12;
  --bg-sidebar: #111419;
  --bg-panel: #151820;
  --bg-card: #1a1e28;
  --bg-hover: #222735;
  --bg-input: #101217;

  --border: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(143, 129, 255, 0.45);
  
  --text-main: #f3f5f8;
  --text-muted: #8e95a5;
  --text-faint: #565d6d;

  --accent-ai: #8f81ff;
  --accent-ok: #3ddc97;
  --accent-warn: #f2b04b;
  --accent-info: #5ab0ff;
  --accent-bad: #ff6b6b;

  --font-ui: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-main);
  background-color: var(--bg-app);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ═══════ HEADER: MAC OS CHROME & CONTEXT ═══════ */
.app-header {
  height: 46px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  user-select: none;
  z-index: 10;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.traffic-lights {
  display: flex;
  gap: 7px;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.dot-red { background: #ff5f56; }
.dot-yellow { background: #ffbd2e; }
.dot-green { background: #27c93f; }

.app-title {
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.project-tag {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border);
  font-size: 11px;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: rgba(61,220,151,0.08);
  border: 1px solid rgba(61,220,151,0.25);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-ok);
  box-shadow: 0 0 6px var(--accent-ok);
}
.model-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-ai);
  cursor: pointer;
}

/* ═══════ MAIN WORKSPACE: UNIFIED SPLIT ═══════ */
.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* LEFT COLUMN: DIALOG & ACTIVE ACTIONS (42%) */
.left-pane {
  width: 44%;
  min-width: 420px;
  max-width: 600px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

/* Pending Decision Hero Card */
.decision-hero {
  margin: 16px 16px 0;
  background: linear-gradient(145deg, #1d212b, #151821);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.decision-hero.resolved {
  display: none;
}
.hero-tag {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-warn);
  display: flex;
  align-items: center;
  gap: 6px;
}
.hero-title {
  font-size: 14.5px;
  font-weight: 600;
  color: #fff;
  line-height: 1.35;
}

/* 7 Invariants Box */
.invariants-clean {
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 12px;
  font-size: 11.5px;
}
.inv-line {
  display: flex;
  flex-direction: column;
}
.inv-k {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-faint);
}
.inv-v {
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inv-v code {
  font-family: var(--font-mono);
  color: var(--accent-info);
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}
.btn-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 120ms ease;
}
.btn-green {
  background: var(--accent-ok);
  color: #062315;
}
.btn-green:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.btn-ghost {
  background: rgba(255,255,255,0.06);
  color: var(--text-main);
  border: 1px solid var(--border);
}
.btn-ghost:hover {
  background: var(--bg-hover);
}
.kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0,0,0,0.25);
}

/* Chat Stream */
.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-bubble {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chat-author {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.chat-text {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-main);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}
.bubble-user .chat-text {
  background: var(--bg-card);
  border-color: rgba(255,255,255,0.1);
}

/* DeepSeek-R1 Thought Accordion */
.thought-card {
  background: rgba(143, 129, 255, 0.05);
  border: 1px solid rgba(143, 129, 255, 0.2);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 6px;
}
.thought-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent-ai);
  cursor: pointer;
  background: rgba(143, 129, 255, 0.08);
}
.thought-body {
  padding: 10px 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  line-height: 1.5;
  border-top: 1px solid rgba(143, 129, 255, 0.1);
}

/* Tool execution badge */
.tool-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

/* Bottom Floating Composer */
.composer-box {
  padding: 14px 16px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-input-wrap {
  display: flex;
  align-items: flex-end;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  gap: 8px;
}
.composer-input-wrap:focus-within {
  border-color: var(--border-focus);
}
.composer-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-ui);
  font-size: 13.5px;
  color: #fff;
  resize: none;
  height: 48px;
  line-height: 1.4;
}
.btn-send {
  background: var(--accent-ai);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* RIGHT COLUMN: INTERACTIVE CANVAS (56%) */
.right-pane {
  flex: 1;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Canvas Tabs: 4 Spaces */
.canvas-tabs {
  height: 44px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.tabs-switcher {
  display: flex;
  align-items: center;
  background: var(--bg-input);
  padding: 3px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  gap: 2px;
}
.c-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all 120ms ease;
}
.c-tab:hover {
  color: var(--text-main);
  background: var(--bg-hover);
}
.c-tab.active {
  background: var(--bg-card);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.canvas-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.tab-view {
  display: none;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.tab-view.active {
  display: flex;
  flex-direction: column;
}

/* TAB 1: LIVE PRODUCT WEBVIEW */
.product-frame-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000;
}
.browser-bar {
  height: 36px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  font-size: 11.5px;
}
.browser-url {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 3px 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.browser-iframe {
  flex: 1;
  border: none;
  background: #0b0d12;
}

/* TAB 2: CODE & SYNTAX DIFF */
.diff-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #080a0d;
}
.diff-toolbar {
  height: 40px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.diff-lines-wrap {
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  padding: 12px 0;
}
.d-line {
  display: flex;
  padding: 1px 16px;
  white-space: pre-wrap;
}
.d-add { background: rgba(61, 220, 151, 0.08); color: #56f2aa; }
.d-del { background: rgba(255, 107, 107, 0.08); color: #ff8585; }
.d-hunk { background: rgba(143, 129, 255, 0.1); color: var(--accent-ai); padding: 4px 16px; font-weight: 600; }
.d-num { width: 44px; color: var(--text-faint); text-align: right; padding-right: 14px; user-select: none; }

.test-summary-bar {
  background: var(--bg-panel);
  border-top: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

/* TAB 3: OPERATION MAP (n8n DAG) */
.map-screen-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
}
.ladder-bar {
  height: 38px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 8px;
  overflow-x: auto;
}
.ladder-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.ladder-pill.active {
  border-color: var(--accent-ai);
  color: #fff;
  background: rgba(143,129,255,0.12);
}
.map-canvas-area {
  flex: 1;
  position: relative;
  overflow: auto;
  background: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0/18px 18px;
  padding: 24px;
}
.map-grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.map-node-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 120ms ease;
}
.map-node-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-focus);
}
.node-kind-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  align-self: flex-start;
}

/* TAB 4: TASKS ROSTER */
.tasks-screen-wrap {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.task-row-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  transition: all 120ms ease;
}
.task-row-card:hover {
  border-color: rgba(255,255,255,0.15);
}
</style>
</head>
<body>

<!-- ═══════ HEADER ═══════ -->
<header class="app-header">
  <div class="header-left">
    <div class="traffic-lights">
      <div class="dot dot-red"></div>
      <div class="dot dot-yellow"></div>
      <div class="dot dot-green"></div>
    </div>
    <div class="app-title">
      <span>⚡ Harness</span>
      <span class="project-tag">OMG-Dev / main</span>
    </div>
  </div>

  <div class="header-right">
    <div class="status-pill">
      <span class="status-dot"></span>
      <span>3 агента на связи · Рубеж L3 (76/96 влито)</span>
    </div>
    <div class="model-selector" onclick="cycleModel()">
      <span>✦</span>
      <span id="active-model-label">Claude 3.7 Sonnet</span>
    </div>
  </div>
</header>

<!-- ═══════ WORKSPACE ═══════ -->
<main class="workspace">

  <!-- LEFT PANE: ДИАЛОГ & АКТИВНЫЕ ДЕЙСТВИЯ -->
  <aside class="left-pane">
    
    <!-- Hero Decision Card (When model needs human input) -->
    <div class="decision-hero" id="hero-decision-card">
      <div class="hero-tag">
        <span>⚠️</span>
        <span>ТРЕБУЕТСЯ ВАШЕ ПОДТВЕРЖДЕНИЕ · РУБЕЖ L3</span>
      </div>
      
      <div class="hero-title">
        Задача Q2: Прямой вход #/om-map и изоляция витрины в OmMapScreen.tsx
      </div>

      <!-- Clean 7 Invariants Card -->
      <div class="invariants-clean">
        <div class="inv-line">
          <span class="inv-k">📍 ГДЕ</span>
          <span class="inv-v"><code>src/sections/om-map/OmMapScreen.tsx</code></span>
        </div>
        <div class="inv-line">
          <span class="inv-k">⚡ ЧТО</span>
          <span class="inv-v">Хэш-роутер #/om-map без релоада</span>
        </div>
        <div class="inv-line">
          <span class="inv-k">🎯 ЗАЧЕМ</span>
          <span class="inv-v">Прямой вход на Карту ОМ по ссылке</span>
        </div>
        <div class="inv-line">
          <span class="inv-k">⏱️ КОГДА</span>
          <span class="inv-v">Рубеж L3 · Блокирует сдачу</span>
        </div>
        <div class="inv-line">
          <span class="inv-k">📦 ОЖИДАЕМ</span>
          <span class="inv-v">8/8 тестов OK · Плавный переход</span>
        </div>
        <div class="inv-line">
          <span class="inv-k">⚠️ РИСКИ</span>
          <span class="inv-v">Низкие (чистая изоляция)</span>
        </div>
      </div>

      <div class="hero-actions">
        <div class="btn-group">
          <button class="btn btn-green" onclick="approveCurrentTask()">
            <span>✓ Одобрить слияние</span>
            <span class="kbd">Space</span>
          </button>
          <button class="btn btn-ghost" onclick="switchCanvasTab('code')">
            <span>Смотреть дифф</span>
          </button>
          <button class="btn btn-ghost" onclick="rejectCurrentTask()">
            <span>Отклонить</span>
          </button>
        </div>
        <span style="font-size:11px; color:var(--accent-ok); white-space:nowrap; font-weight:600; padding-left:6px;">● Vitest 8/8 OK</span>
      </div>
    </div>

    <!-- Conversation Feed -->
    <div class="chat-scroll" id="chat-feed">
      
      <!-- Message from Architect -->
      <div class="chat-bubble">
        <div class="chat-author">
          <span style="color:var(--accent-ai);">✦ Architect (Claude 3.7 + Codex)</span>
          <span>14:15</span>
        </div>

        <!-- DeepSeek-R1 Thought Accordion -->
        <div class="thought-card">
          <div class="thought-toggle" onclick="toggleThought()">
            <span>▸ Мышление модели (DeepThink: 14с)</span>
            <span id="thought-arrow">▾</span>
          </div>
          <div class="thought-body" id="thought-text">
            1. Проверил текущий роутер: переход на #/om-map вызывал перезагрузку всего приложения.<br>
            2. Добавил слушатель hashchange с локальным переключением состояния currentView.<br>
            3. Запустил Vitest: все 8 тестов витрины успешно пройдены.<br>
            4. Сверил с 5 проходами Конституции: пути закрыты, отказы типизированы.
          </div>
        </div>

        <div class="chat-text">
          Я подготовил коммит <code>f3bf191</code>: подключил прямой хэш-маршрут <code>#/om-map</code> в витрине и проверил рендеринг. Все тесты пройдены.<br><br>
          Справа на холсте открыт живой работающий продукт — можете проверить нативно.
        </div>

        <div style="display:flex; gap:8px; margin-top:4px;">
          <span class="tool-badge">📄 Edited OmMapScreen.tsx (+26 -18)</span>
          <span class="tool-badge" style="color:var(--accent-ok);">✓ Vitest 8/8 passed</span>
        </div>
      </div>

    </div>

    <!-- Floating Composer -->
    <div class="composer-box">
      <div class="composer-input-wrap">
        <textarea class="composer-textarea" id="chat-composer-input" placeholder="Напишите поручение модели... (например: обнови тесты или открой задачу D8.4d)"></textarea>
        <button class="btn-send" onclick="sendChatPrompt()">Отправить ↵</button>
      </div>
    </div>

  </aside>

  <!-- RIGHT PANE: ИНТЕРАКТИВНЫЙ ХОЛСТ (CANVAS) -->
  <section class="right-pane">
    
    <!-- Canvas Switcher (The 4 Spaces) -->
    <div class="canvas-tabs">
      <div class="tabs-switcher">
        <button class="c-tab active" id="tab-btn-product" onclick="switchCanvasTab('product')">
          <span>🚀 1. Продукт (:3000)</span>
        </button>
        <button class="c-tab" id="tab-btn-code" onclick="switchCanvasTab('code')">
          <span>💻 2. Код и Дифф</span>
        </button>
        <button class="c-tab" id="tab-btn-map" onclick="switchCanvasTab('map')">
          <span>🗺️ 3. Карта ОМ</span>
        </button>
        <button class="c-tab" id="tab-btn-tasks" onclick="switchCanvasTab('tasks')">
          <span>📋 4. Задачи рубежа (9)</span>
        </button>
      </div>

      <div style="font-size:11.5px; color:var(--text-muted); font-family:var(--font-mono);">
        localhost:3000/#/om-map
      </div>
    </div>

    <!-- Canvas Views Container -->
    <div class="canvas-content">
      
      <!-- VIEW 1: LIVE RUNNING PRODUCT -->
      <div class="tab-view active" id="view-product">
        <div class="product-frame-wrap">
          <div class="browser-bar">
            <span style="color:var(--accent-ok); font-size:12px;">● LIVE</span>
            <div class="browser-url">http://localhost:3000/#/om-map</div>
            <button class="btn btn-ghost" style="padding:2px 8px; font-size:11px;" onclick="reloadBrowserFrame()">🔄 Обновить</button>
          </div>
          <iframe class="browser-iframe" id="product-iframe" src="http://localhost:3000/#/om-map"></iframe>
        </div>
      </div>

      <!-- VIEW 2: CODE & SYNTAX DIFF -->
      <div class="tab-view" id="view-code">
        <div class="diff-screen">
          <div class="diff-toolbar">
            <span style="font-family:var(--font-mono); font-size:12.5px; color:var(--accent-info);">OmMapScreen.tsx (коммит f3bf191)</span>
            <button class="btn btn-green" onclick="approveCurrentTask()">✓ Влить коммит (Space)</button>
          </div>

          <div class="diff-lines-wrap">
            <div class="d-hunk">@@ -35,18 +35,26 @@ export function OmMapScreen() {</div>
            <div class="d-line d-del"><span class="d-num">35</span>- const defaultHash = window.location.pathname;</div>
            <div class="d-line d-add"><span class="d-num">35</span>+ // Прямой вход по адресу http://localhost:3000/#/om-map</div>
            <div class="d-line d-add"><span class="d-num">36</span>+ const isOmMap = window.location.hash === '#/om-map';</div>
            <div class="d-line d-add"><span class="d-num">37</span>+ const [currentView, setCurrentView] = useState(isOmMap ? 'om-map' : 'feed');</div>
            <div class="d-line"><span class="d-num">38</span>   useEffect(() => {</div>
            <div class="d-line"><span class="d-num">39</span>     const onHashChange = () => {</div>
            <div class="d-line d-add"><span class="d-num">40</span>+      if (window.location.hash === '#/om-map') setCurrentView('om-map');</div>
            <div class="d-line d-del"><span class="d-num">41</span>-      else setCurrentView('feed');</div>
            <div class="d-line"><span class="d-num">42</span>     };</div>
            <div class="d-line"><span class="d-num">43</span>     window.addEventListener('hashchange', onHashChange);</div>
            <div class="d-line"><span class="d-num">44</span>     return () => window.removeEventListener('hashchange', onHashChange);</div>
            <div class="d-line"><span class="d-num">45</span>   }, []);</div>
          </div>

          <div class="test-summary-bar">
            <span style="color:var(--accent-ok); font-weight:700;">● Vitest: 8/8 тестов успешно пройдено (0.19s)</span>
            <div style="color:var(--text-muted); display:flex; gap:12px;">
              <span>ПУТИ: ✓</span> <span>ОТСУТСТВИЕ: ✓</span> <span>МАСКАРАД: ✓</span> <span>ОКНА: ✓</span> <span>СОСЕДИ: ✓</span>
            </div>
          </div>
        </div>
      </div>

      <!-- VIEW 3: OPERATION MAP (n8n DAG CARDS) -->
      <div class="tab-view" id="view-map">
        <div class="map-screen-wrap">
          <div class="ladder-bar">
            <div class="ladder-pill active">L0 · стадии продукта</div>
            <div class="ladder-pill">R0 · исследование</div>
            <div class="ladder-pill">L1 · карта блоков</div>
            <div class="ladder-pill">R1 · исследование блоков</div>
            <div class="ladder-pill">L2 · операции</div>
            <div class="ladder-pill">L3 · атомарные работы</div>
          </div>

          <div class="map-canvas-area">
            <div class="map-grid-cards" id="nodes-grid-wrap"></div>
          </div>
        </div>
      </div>

      <!-- VIEW 4: MILESTONE TASKS (9) -->
      <div class="tab-view" id="view-tasks">
        <div class="tasks-screen-wrap" id="tasks-list-wrap"></div>
      </div>

    </div>

  </section>

</main>

<script>
// Real data injection
const r2Nodes = """ + json.dumps(map_data["graphs"]["r2"]["nodes"][:20], ensure_ascii=False) + """;
const tasksList = """ + json.dumps(remaining_tasks, ensure_ascii=False) + """;

// Tab Switching
function switchCanvasTab(tabName) {
  document.querySelectorAll('.c-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

  const btn = document.getElementById('tab-btn-' + tabName);
  const view = document.getElementById('view-' + tabName);
  if (btn) btn.classList.add('active');
  if (view) view.classList.add('active');
}

// Model Cycling
const models = ['Claude 3.7 Sonnet', 'DeepSeek-R1 (DeepThink)', 'Codex Reviewer'];
let curModelIdx = 0;
function cycleModel() {
  curModelIdx = (curModelIdx + 1) % models.length;
  document.getElementById('active-model-label').textContent = models[curModelIdx];
}

// Thought Accordion
function toggleThought() {
  const body = document.getElementById('thought-text');
  const arr = document.getElementById('thought-arrow');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    arr.textContent = '▾';
  } else {
    body.style.display = 'none';
    arr.textContent = '▸';
  }
}

// Task Approvals
function approveCurrentTask() {
  const card = document.getElementById('hero-decision-card');
  if (!card) return;
  card.style.transition = 'all 200ms ease';
  card.style.opacity = '0';
  card.style.transform = 'translateY(-10px)';
  setTimeout(() => {
    card.classList.add('resolved');
    addChatMessage('Вы (Владелец)', 'Одобрил слияние коммита f3bf191 в ветку om-map.');
    setTimeout(() => {
      addChatMessage('✦ Architect', 'Принято! Коммит влит. Запускаю следующую задачу D8.4d из очереди рубежа L3.');
    }, 500);
  }, 200);
}

function rejectCurrentTask() {
  const card = document.getElementById('hero-decision-card');
  if (card) card.classList.add('resolved');
}

function addChatMessage(author, text) {
  const feed = document.getElementById('chat-feed');
  const msg = document.createElement('div');
  msg.className = 'chat-bubble';
  msg.innerHTML = `
    <div class="chat-author">
      <span style="color:#fff;">${author}</span>
      <span>Только что</span>
    </div>
    <div class="chat-text">${text}</div>
  `;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
}

function sendChatPrompt() {
  const input = document.getElementById('chat-composer-input');
  const text = input.value.trim();
  if (!text) return;
  addChatMessage('Вы (Владелец)', text);
  input.value = '';

  setTimeout(() => {
    addChatMessage('✦ Architect', 'Понял задачу: «' + text + '». Проверяю код витрины и текущие требования рубежа L3.');
  }, 600);
}

function reloadBrowserFrame() {
  const f = document.getElementById('product-iframe');
  if (f) f.src = f.src;
}

// Populate Map Cards
function renderMapCards() {
  const wrap = document.getElementById('nodes-grid-wrap');
  if (!wrap) return;
  wrap.innerHTML = r2Nodes.map(n => `
    <div class="map-node-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="node-kind-badge" style="background:${n.kind === 'root' ? 'rgba(143,129,255,0.15)' : 'rgba(59,130,246,0.15)'}; color:${n.kind === 'root' ? '#8f81ff' : '#5ab0ff'};">${n.kind || 'BLOCK'}</span>
        <span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-muted);">${n.id}</span>
      </div>
      <div style="font-weight:600; font-size:12.5px; color:#fff;">${n.title || n.id}</div>
      <div style="font-size:11.5px; color:var(--text-muted); line-height:1.4;">${n.purpose || ''}</div>
    </div>
  `).join('');
}

// Populate Tasks Roster
function renderTasksRoster() {
  const wrap = document.getElementById('tasks-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = tasksList.map(t => `
    <div class="task-row-card">
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="color:#fff; font-size:13.5px;">${t.id}: ${t.title || 'Задача'}</strong>
          <span style="font-size:10px; font-weight:700; color:var(--accent-warn); background:rgba(242,176,75,0.15); padding:1px 6px; border-radius:3px;">РУБЕЖ L3</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">
          Исполнитель: ${t.worker || 'worker'} · Прогонов: ${t.runs || 1}
        </div>
      </div>
      <button class="btn btn-ghost" onclick="switchCanvasTab('code')">Смотреть дифф →</button>
    </div>
  `).join('');
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendChatPrompt();
    return;
  }
  if (e.key === '1') switchCanvasTab('product');
  if (e.key === '2') switchCanvasTab('code');
  if (e.key === '3') switchCanvasTab('map');
  if (e.key === '4') switchCanvasTab('tasks');
  if (e.key === ' ') {
    e.preventDefault();
    approveCurrentTask();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  renderMapCards();
  renderTasksRoster();
  const initTab = location.hash.replace('#', '');
  if (['product', 'code', 'map', 'tasks'].includes(initTab)) {
    switchCanvasTab(initTab);
  }
});

window.addEventListener('hashchange', () => {
  const t = location.hash.replace('#', '');
  if (['product', 'code', 'map', 'tasks'].includes(t)) {
    switchCanvasTab(t);
  }
});
</script>
</body>
</html>
"""

with open(TARGET_HTML, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Successfully compiled Human-First Harness to {TARGET_HTML}")
