"""
Compiler script to generate the Next-Gen AI Harness Desktop Application
Awards 2026-2027 Edition (iF Design Gold / Red Dot Best of the Best / UX Design Awards)
Adhering strictly to user directives:
- Synthesizes Claude Desktop, Codex / Cursor, DeepSeek-R1, Perplexity, Kimi, Hermes, Antigravity, Pi
- 3 distinct working concepts solving distinct user challenges
- 7 Invariants (ГДЕ · ЧТО · ЗАЧЕМ · КОГДА · ОЖИДАЕМ · РИСКИ · КРИТЕРИИ) visible on every screen
- 4 Spaces (ПРОЕКТ · ОБСУЖДЕНИЕ · КОД · ПРОДУКТ) always visible/accessible
- Zero clutter / no "помойная яма", high aesthetic polish, human-first clarity
"""

import os

HTML_CONTENT = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Harness OS • Next-Gen AI Desktop (Award Edition 2026-2027)</title>
<style>
/* ==========================================================================
   DESIGN SYSTEM TOKENS — AWARDS EDITION 2026-2027
   Graphite Elegance: Linear + Raycast + Claude Desktop + Apple HIG
   ========================================================================== */
:root {
  --bg-desktop: #07080a;
  --bg-app: #0b0d12;
  --bg-panel: #11141a;
  --bg-subtle: #141720;
  --bg-raised: #181d26;
  --bg-hover: #1f2532;
  --bg-active: #262e3d;
  
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-focus: rgba(143, 129, 255, 0.4);
  --border-accent: #8f81ff;

  --text-primary: #f0f2f7;
  --text-secondary: #9aa1b2;
  --text-muted: #6b7385;
  --text-faint: #484f60;

  --accent-ai: #8f81ff;
  --accent-ai-glow: rgba(143, 129, 255, 0.15);
  --accent-ok: #3ddc97;
  --accent-ok-glow: rgba(61, 220, 151, 0.15);
  --accent-warn: #f2b04b;
  --accent-warn-glow: rgba(242, 176, 75, 0.15);
  --accent-bad: #ff6b6b;
  --accent-info: #5ab0ff;

  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;

  --shadow-panel: 0 16px 40px rgba(0, 0, 0, 0.45);
  --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.25);
  --shadow-glow: 0 0 24px rgba(143, 129, 255, 0.12);

  --transition-fast: 120ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-smooth: 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Base Reset & Setup */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--bg-desktop);
  background-image: 
    radial-gradient(circle at 50% 0%, rgba(143, 129, 255, 0.05), transparent 60%),
    radial-gradient(circle at 10% 80%, rgba(61, 220, 151, 0.03), transparent 40%);
  height: 100vh;
  overflow: hidden;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}

/* Master Window Frame */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
}

/* --------------------------------------------------------------------------
   1. MAC OS NATIVE TOP BAR & NAVIGATION
   -------------------------------------------------------------------------- */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 100;
  gap: 16px;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
}
.traffic-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.25);
  cursor: pointer;
}
.dot-red { background: #ff5f56; }
.dot-yellow { background: #ffbd2e; }
.dot-green { background: #27c93f; }

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}
.brand-badge {
  background: linear-gradient(135deg, rgba(143,129,255,0.2), rgba(90,176,255,0.1));
  color: var(--accent-ai);
  border: 1px solid rgba(143,129,255,0.3);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  letter-spacing: 0.5px;
}

/* 3 Concepts Segmented Switcher */
.concept-switcher {
  display: flex;
  align-items: center;
  background: var(--bg-app);
  padding: 3px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  gap: 2px;
}
.concept-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.concept-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.concept-btn.active {
  background: var(--bg-raised);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 1px solid rgba(255, 255, 255, 0.09);
}
.concept-btn .key-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  color: var(--text-muted);
}
.concept-btn.active .key-hint {
  background: rgba(143,129,255,0.2);
  color: var(--accent-ai);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.search-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.search-pill:hover {
  border-color: var(--border-focus);
  color: var(--text-secondary);
}
.model-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(143, 129, 255, 0.08);
  border: 1px solid rgba(143, 129, 255, 0.25);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.model-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-ai);
  box-shadow: 0 0 6px var(--accent-ai);
}

/* --------------------------------------------------------------------------
   2. UNIVERSAL 7 INVARIANTS HEADS-UP DISPLAY
   (Always visible across all modes: ГДЕ · ЧТО · ЗАЧЕМ · КОГДА · ОЖИДАЕМ · РИСКИ · КРИТЕРИИ)
   -------------------------------------------------------------------------- */
.invariants-hud {
  display: flex;
  align-items: center;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 16px;
  font-size: 11px;
  overflow-x: auto;
  white-space: nowrap;
  gap: 18px;
  scrollbar-width: none;
}
.invariants-hud::-webkit-scrollbar { display: none; }
.inv-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inv-tag {
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: 1px 5px;
  background: rgba(255,255,255,0.04);
  border-radius: 3px;
}
.inv-item:nth-child(1) .inv-tag { color: var(--accent-info); }
.inv-item:nth-child(2) .inv-tag { color: var(--accent-ai); }
.inv-item:nth-child(3) .inv-tag { color: var(--accent-ok); }
.inv-item:nth-child(4) .inv-tag { color: var(--text-secondary); }
.inv-item:nth-child(5) .inv-tag { color: #d8b4fe; }
.inv-item:nth-child(6) .inv-tag { color: var(--accent-warn); }
.inv-item:nth-child(7) .inv-tag { color: var(--accent-ok); }

.inv-val {
  color: var(--text-secondary);
}
.inv-val strong {
  color: var(--text-primary);
  font-weight: 500;
}

/* 4 Spaces Permanent Navigation Rail */
.spaces-rail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding-left: 12px;
  border-left: 1px solid var(--border-subtle);
}
.space-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.space-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.space-tab.active-space {
  color: #fff;
  background: rgba(255,255,255,0.08);
}

/* Main Content Area */
.main-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.concept-screen {
  display: none;
  height: 100%;
  width: 100%;
  overflow: hidden;
  animation: fadeIn 180ms ease-out;
}
.concept-screen.active {
  display: flex;
  flex-direction: column;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==========================================================================
   CONCEPT 1: «ACTION HORIZON» (SUPERVISED AUTONOMY DISPATCH DECK)
   Reference: Hermes Desktop + Linear + Perplexity Grounding
   Challenge: Supervise multi-agent background swarms without terminal flood.
   ========================================================================== */
.c1-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px 24px;
  background: var(--bg-app);
  overflow-y: auto;
  gap: 20px;
}

/* 4 Vital Horizon Gauges */
.c1-gauges {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.gauge-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  overflow: hidden;
}
.gauge-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: transparent;
}
.gauge-warn::before { background: var(--accent-warn); }
.gauge-ai::before { background: var(--accent-ai); }
.gauge-ok::before { background: var(--accent-ok); }
.gauge-info::before { background: var(--accent-info); }

.gauge-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
.gauge-val {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.gauge-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Horizon Body Layout */
.c1-body {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

/* Triage Feed */
.triage-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Decision Cards */
.decision-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-card);
  transition: border-color var(--transition-fast), transform var(--transition-fast);
  position: relative;
}
.decision-card:hover {
  border-color: rgba(255,255,255,0.12);
}
.decision-card.focused {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-glow);
}
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.card-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.badge-warn {
  background: rgba(242, 176, 75, 0.12);
  color: var(--accent-warn);
  border: 1px solid rgba(242, 176, 75, 0.25);
}
.badge-ai {
  background: rgba(143, 129, 255, 0.12);
  color: var(--accent-ai);
  border: 1px solid rgba(143, 129, 255, 0.25);
}
.task-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 6px;
}
.task-prompt {
  font-size: 13.5px;
  color: #e2e8f0;
  line-height: 1.55;
  background: var(--bg-subtle);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--accent-ai);
}

/* Invariants Grid Inside Triage Card */
.card-invariants-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  background: var(--bg-app);
  padding: 14px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255,255,255,0.04);
}
.grid-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.grid-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}
.grid-val {
  font-size: 12px;
  color: var(--text-secondary);
}
.grid-val code {
  font-family: var(--font-mono);
  color: var(--accent-info);
  background: rgba(90, 176, 255, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}

/* Card Actions */
.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}
.btn-primary {
  background: var(--accent-ok);
  color: #052114;
}
.btn-primary:hover {
  background: #4ae6a3;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(61, 220, 151, 0.3);
}
.btn-secondary {
  background: var(--bg-subtle);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}
.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
}
.btn-danger {
  background: transparent;
  color: var(--text-muted);
}
.btn-danger:hover {
  color: var(--accent-bad);
  background: rgba(255, 107, 107, 0.1);
}
.btn .kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0,0,0,0.2);
}

/* Right Rail: Grounding & Telemetry */
.c1-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sidebar-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.agent-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
}
.agent-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(143,129,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
  color: var(--accent-ai);
}
.agent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.agent-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.agent-task {
  font-size: 11.5px;
  color: var(--text-secondary);
}

/* Perplexity Grounding Cards */
.citation-box {
  background: var(--bg-subtle);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.citation-link {
  color: var(--accent-info);
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.citation-link:hover { text-decoration: underline; }

/* ==========================================================================
   CONCEPT 2: «SPATIAL WORKBENCH» (SYNCHRONOUS 4-SPACE QUADRANT)
   Reference: Cursor / Codex Desktop + Claude Desktop Artifacts + DeepSeek-R1
   Challenge: Pair-program without alt-tabbing between Chat, Code, and Preview.
   ========================================================================== */
.c2-container {
  display: grid;
  grid-template-columns: 220px 380px 1fr 420px;
  height: 100%;
  background: var(--bg-app);
  overflow: hidden;
}

/* Quadrant Column Common */
.q-col {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-subtle);
  height: 100%;
  overflow: hidden;
  background: var(--bg-app);
}
.q-col:last-child { border-right: none; }

.q-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 14px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
.q-header .q-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

/* Col 1: Project Tree */
.tree-container {
  padding: 12px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tree-node:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.tree-node.active-file {
  background: var(--bg-raised);
  color: #fff;
  font-weight: 500;
}
.tree-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}
.badge-mod { background: rgba(242, 176, 75, 0.15); color: var(--accent-warn); }
.badge-ok { background: rgba(61, 220, 151, 0.15); color: var(--accent-ok); }

/* Col 2: Chat & DeepSeek-R1 Thought Accordion */
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-subtle);
}
.chat-messages {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg-author {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}
.msg-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-panel);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.msg-user .msg-content {
  background: var(--bg-raised);
  border-color: rgba(255,255,255,0.08);
}

/* DeepSeek-R1 Thinking Accordion */
.thought-accordion {
  background: rgba(143, 129, 255, 0.05);
  border: 1px solid rgba(143, 129, 255, 0.2);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 6px;
}
.thought-summary {
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
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  line-height: 1.5;
  border-top: 1px solid rgba(143, 129, 255, 0.1);
  display: block;
}

/* Interactive Chat Composer */
.chat-composer {
  padding: 12px 14px;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-input {
  width: 100%;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 12.5px;
  resize: none;
  height: 58px;
  outline: none;
  transition: border-color var(--transition-fast);
}
.composer-input:focus {
  border-color: var(--border-accent);
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.composer-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mini-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

/* Col 3: Code Diff & Test Runner */
.code-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #090a0d;
}
.diff-viewer {
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  padding: 12px 0;
}
.diff-line {
  display: flex;
  padding: 1px 16px;
  white-space: pre-wrap;
}
.diff-add {
  background: rgba(61, 220, 151, 0.08);
  color: #56f2aa;
}
.diff-del {
  background: rgba(255, 107, 107, 0.08);
  color: #ff8585;
}
.diff-hunk {
  background: rgba(143, 129, 255, 0.1);
  color: var(--accent-ai);
  padding: 4px 16px;
  font-weight: 600;
}
.diff-num {
  width: 40px;
  color: var(--text-faint);
  user-select: none;
  text-align: right;
  padding-right: 12px;
}

/* Embedded Test Runner Bar */
.test-bar {
  background: var(--bg-panel);
  border-top: 1px solid var(--border-subtle);
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.test-bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.test-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent-ok);
}
.test-checks {
  font-size: 10.5px;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
}
.test-checks span {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* Col 4: Live Product Webview */
.product-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-subtle);
}
.preview-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-btn {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.preview-btn.active {
  background: var(--bg-raised);
  color: #fff;
}
.product-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0/16px 16px;
}
.live-mockup-frame {
  width: 100%;
  max-width: 360px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  box-shadow: var(--shadow-panel);
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}
.mockup-logo {
  font-size: 24px;
  margin-bottom: 4px;
}
.mockup-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.mockup-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.google-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #ffffff;
  color: #1a1a1a;
  font-weight: 600;
  font-size: 13px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: transform var(--transition-fast);
}
.google-login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255,255,255,0.2);
}

/* ==========================================================================
   CONCEPT 3: «DETERMINISTIC GATEWAY» (STAGE-GATE SPECIFICATION & AUDIT LEDGER)
   Reference: Antigravity Agent DAG + n8n + Owner Constitution 5 Passes
   Challenge: Eliminate hallucinations & silent bugs in production workflows.
   ========================================================================== */
.c3-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-app);
  overflow: hidden;
}

/* Top Stage-Gate Rail */
.stage-gate-rail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  gap: 12px;
}
.stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  flex: 1;
}
.stage-item.completed {
  border-color: rgba(61, 220, 151, 0.3);
  color: var(--accent-ok);
  background: rgba(61, 220, 151, 0.05);
}
.stage-item.active {
  border-color: var(--border-accent);
  color: #fff;
  background: rgba(143, 129, 255, 0.1);
  box-shadow: var(--shadow-glow);
}
.stage-connector {
  color: var(--text-faint);
  font-size: 14px;
}

/* C3 Main Grid */
.c3-body {
  display: grid;
  grid-template-columns: 1fr 440px;
  flex: 1;
  min-height: 0;
}

/* Left: Living Stage Contract */
.contract-viewer {
  padding: 24px 32px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--bg-app);
}
.contract-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.contract-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.contract-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.contract-meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

/* 5-Pass Owner Verification Checklist */
.pass-checklist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-subtle);
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.pass-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.pass-item:hover {
  background: var(--bg-hover);
}
.pass-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--accent-ok);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #052114;
  font-size: 10px;
  font-weight: 800;
  margin-top: 2px;
}
.pass-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pass-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.pass-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Right: Visual Proof & Ledger */
.ledger-panel {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  height: 100%;
}
.ledger-feed {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ledger-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent-ok);
}
.entry-hash {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-ai);
}
.entry-msg {
  font-size: 12.5px;
  color: var(--text-primary);
}
.entry-time {
  font-size: 11px;
  color: var(--text-muted);
}

.gateway-footer {
  padding: 16px 20px;
  background: var(--bg-app);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-gateway {
  width: 100%;
  padding: 12px;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-ok), #29b87b);
  color: #052114;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(61, 220, 151, 0.25);
  transition: all var(--transition-fast);
}
.btn-gateway:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ==========================================================================
   INTERACTIVE COMMAND PALETTE (⌘K)
   ========================================================================== */
.palette-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 1000;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
}
.palette-overlay.open {
  display: flex;
}
.palette-modal {
  width: 100%;
  max-width: 600px;
  background: var(--bg-panel);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 15px;
}
.palette-results {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.palette-item:hover, .palette-item.selected {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.palette-shortcut {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
</style>
</head>
<body>

<div class="app-container">

  <!-- TOP BAR: MAC OS NATIVE CHROME & CONCEPT SWITCHER -->
  <header class="top-bar">
    <div class="window-controls">
      <div class="traffic-dot dot-red" title="Закрыть"></div>
      <div class="traffic-dot dot-yellow" title="Свернуть"></div>
      <div class="traffic-dot dot-green" title="Развернуть"></div>
    </div>

    <div class="app-brand">
      <span>⚡ HARNESS OS</span>
      <span class="brand-badge">2026-2027 AWARDS</span>
    </div>

    <!-- 3 Concepts Segmented Switcher -->
    <nav class="concept-switcher">
      <button class="concept-btn active" id="tab-c1" onclick="switchConcept(1)">
        <span>🛰️ 1. Action Horizon</span>
        <span class="key-hint">1</span>
      </button>
      <button class="concept-btn" id="tab-c2" onclick="switchConcept(2)">
        <span>📐 2. Spatial Workbench</span>
        <span class="key-hint">2</span>
      </button>
      <button class="concept-btn" id="tab-c3" onclick="switchConcept(3)">
        <span>🔒 3. Deterministic Gateway</span>
        <span class="key-hint">3</span>
      </button>
    </nav>

    <div class="top-bar-right">
      <div class="search-pill" onclick="openPalette()">
        <span>Поиск по коду, задачам, моделям...</span>
        <span class="key-hint" style="font-family:var(--font-mono); font-size:10px;">⌘K</span>
      </div>
      <div class="model-pill" onclick="cycleModel()">
        <span class="dot"></span>
        <span id="active-model-name">Claude 3.7 Sonnet</span>
      </div>
    </div>
  </header>

  <!-- UNIVERSAL 7 INVARIANTS HEADS-UP DISPLAY -->
  <div class="invariants-hud">
    <div class="inv-item">
      <span class="inv-tag">📍 ГДЕ</span>
      <span class="inv-val" id="hud-where"><strong>omg-core</strong> / auth/google-login</span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">⚡ ЧТО</span>
      <span class="inv-val" id="hud-what">Интеграция Google OAuth 2.0 + верификация JWT</span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">🎯 ЗАЧЕМ</span>
      <span class="inv-val" id="hud-why">Вход без пароля для новых пользователей (конверсия +35%)</span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">⏱️ КОГДА</span>
      <span class="inv-val" id="hud-when">Этап 3: Разработка · <strong>Готовность 85%</strong></span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">📦 ОЖИДАЕМ</span>
      <span class="inv-val" id="hud-expect"><code>auth_service.ts</code> + 8 юнит-тестов</span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">⚠️ РИСКИ</span>
      <span class="inv-val" id="hud-risks">XSS при хранении в storage (решение: HttpOnly cookie)</span>
    </div>
    <div class="inv-item">
      <span class="inv-tag">✅ КРИТЕРИИ</span>
      <span class="inv-val" id="hud-criteria">8/8 тестов OK · 0 уязвимостей в аудите</span>
    </div>

    <!-- 4 SPACES UNIVERSAL RAIL -->
    <div class="spaces-rail">
      <div class="space-tab" onclick="switchConcept(2)"><span style="font-size:12px;">📁</span> ПРОЕКТ</div>
      <div class="space-tab" onclick="switchConcept(2)"><span style="font-size:12px;">💬</span> ДИАЛОГ</div>
      <div class="space-tab" onclick="switchConcept(2)"><span style="font-size:12px;">💻</span> КОД</div>
      <div class="space-tab" onclick="switchConcept(2)"><span style="font-size:12px;">🚀</span> ПРОДУКТ</div>
    </div>
  </div>

  <!-- MAIN VIEWPORT WITH 3 CONCEPTS -->
  <main class="main-viewport">

    <!-- ======================================================================
         CONCEPT 1: «ACTION HORIZON» (SUPERVISED AUTONOMY DISPATCH DECK)
         ====================================================================== -->
    <div class="concept-screen active" id="screen-c1">
      <div class="c1-container">
        
        <!-- 4 Horizon Gauges -->
        <div class="c1-gauges">
          <div class="gauge-card gauge-warn">
            <div class="gauge-title">ЖДУТ ВАШЕГО РЕШЕНИЯ</div>
            <div class="gauge-val" style="color:var(--accent-warn);">
              <span id="c1-pending-count">2</span>
              <span class="gauge-sub">развилки (старейшая 4 мин)</span>
            </div>
          </div>
          <div class="gauge-card gauge-ai">
            <div class="gauge-title">АКТИВНЫЕ АГЕНТЫ</div>
            <div class="gauge-val">
              <span>3</span>
              <span class="gauge-sub">в параллельном исполнении</span>
            </div>
          </div>
          <div class="gauge-card gauge-ok">
            <div class="gauge-title">ПРОГРЕСС РУБЕЖА L3</div>
            <div class="gauge-val">
              <span>18 / 22</span>
              <span class="gauge-sub">задач влито (82%)</span>
            </div>
          </div>
          <div class="gauge-card gauge-info">
            <div class="gauge-title">РАСХОД БЮДЖЕТА</div>
            <div class="gauge-val">
              <span>$1.85</span>
              <span class="gauge-sub">/ $10.00 лимит (14.2M ток.)</span>
            </div>
          </div>
        </div>

        <!-- Body: Triage Feed + Grounding Sidebar -->
        <div class="c1-body">
          <div class="triage-section">
            <div class="section-header">
              <div class="section-title">
                <span>⚡ Очередь развилок решений (Human-in-the-Loop)</span>
                <span class="brand-badge" style="background:rgba(242,176,75,0.15); color:var(--accent-warn);">ФОКУС ОПЕРАТОРА</span>
              </div>
              <span style="font-size:12px; color:var(--text-muted);">Принятие в 1 клик: [Space] — слить, [Esc] — отклонить</span>
            </div>

            <!-- Card 1: Focused Decision -->
            <div class="decision-card focused" id="triage-card-1">
              <div class="card-top">
                <div>
                  <div class="card-badge badge-warn">⚠️ ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА · СРОЧНО</div>
                  <h3 class="task-title">OAuth 2.0: Безопасное хранение JWT-токенов</h3>
                </div>
                <div style="text-align:right;">
                  <span style="font-size:11px; color:var(--text-muted);">Исполнитель:</span>
                  <div style="font-size:12px; font-weight:600; color:var(--accent-ai);">Claude 3.7 Sonnet</div>
                </div>
              </div>

              <div class="task-prompt">
                <strong>Вопрос модели к вам:</strong><br>
                «Для защиты от XSS атак предлагается сохранять refresh-токен в <code>HttpOnly, Secure SameSite=Strict</code> Cookie вместо <code>LocalStorage</code>. Это потребует включения <code>credentials: 'include'</code> на фронтенде. Принять архитектурное изменение?»
              </div>

              <!-- 7 Invariants Grid for this exact task -->
              <div class="card-invariants-grid">
                <div class="grid-item">
                  <span class="grid-label">📍 ГДЕ</span>
                  <span class="grid-val"><code>src/auth/session_manager.ts:45</code></span>
                </div>
                <div class="grid-item">
                  <span class="grid-label">⚡ ЧТО</span>
                  <span class="grid-val">Переход на HttpOnly куки и CORS credentials</span>
                </div>
                <div class="grid-item">
                  <span class="grid-label">🎯 ЗАЧЕМ</span>
                  <span class="grid-val">Исключение кражи сессий скриптами (CWE-79)</span>
                </div>
                <div class="grid-item">
                  <span class="grid-label">⏱️ КОГДА</span>
                  <span class="grid-val">Блокирует интеграционные тесты авторизации</span>
                </div>
                <div class="grid-item">
                  <span class="grid-label">📦 ОЖИДАЕМ</span>
                  <span class="grid-val">Патч на 2 файла + 4 теста верификации cookie</span>
                </div>
                <div class="grid-item">
                  <span class="grid-label">⚠️ РИСКИ</span>
                  <span class="grid-val">Необходимость настройки заголовков для мобильного API</span>
                </div>
              </div>

              <div class="card-actions">
                <div class="action-buttons">
                  <button class="btn btn-primary" onclick="approveTask(1)">
                    <span>✓ Одобрить слияние</span>
                    <span class="kbd">Space</span>
                  </button>
                  <button class="btn btn-secondary" onclick="switchConcept(2)">
                    <span>👁 Смотреть diff в Студии</span>
                    <span class="kbd">D</span>
                  </button>
                  <button class="btn btn-danger" onclick="rejectTask(1)">
                    <span>✕ Отклонить</span>
                    <span class="kbd">Esc</span>
                  </button>
                </div>
                <span style="font-size:11.5px; color:var(--text-muted);">Тесты пройдены: <strong>8/8 OK</strong></span>
              </div>
            </div>

            <!-- Card 2: Second Decision -->
            <div class="decision-card" id="triage-card-2">
              <div class="card-top">
                <div>
                  <div class="card-badge badge-ai">✦ РАЗВИЛКА ДИЗАЙНА · ГОТОВО К РЕВЬЮ</div>
                  <h3 class="task-title">LoginScreen: Размещение кнопки «Войти через Google»</h3>
                </div>
                <div style="text-align:right;">
                  <span style="font-size:11px; color:var(--text-muted);">Исполнитель:</span>
                  <div style="font-size:12px; font-weight:600; color:var(--accent-ok);">DeepSeek-R1</div>
                </div>
              </div>

              <div class="task-prompt">
                «Кнопка Google OAuth размещена первым приоритетом над классической формой email/password в соответствии с паттернами снижения трения первого входа.»
              </div>

              <div class="card-actions">
                <div class="action-buttons">
                  <button class="btn btn-primary" onclick="approveTask(2)">
                    <span>✓ Принять дизайн</span>
                    <span class="kbd">Space</span>
                  </button>
                  <button class="btn btn-secondary" onclick="switchConcept(2)">
                    <span>👁 Открыть превью</span>
                  </button>
                </div>
                <span style="font-size:11.5px; color:var(--accent-ok);">✓ Визуальный тест согласован</span>
              </div>
            </div>

          </div>

          <!-- Right Rail: Agents Telemetry & Citations -->
          <aside class="c1-sidebar">
            <div class="sidebar-panel">
              <div class="section-title">
                <span>🤖 Команда агентов на смене</span>
              </div>
              
              <div class="agent-row">
                <div class="agent-avatar">C</div>
                <div class="agent-info">
                  <div class="agent-name">
                    <span>Claude 3.7 Sonnet</span>
                    <span style="color:var(--accent-ok); font-size:10px;">● ПИШЕТ ТЕСТЫ</span>
                  </div>
                  <div class="agent-task">Генерирует юнит-тесты auth_test.py (42 сек, $0.15)</div>
                </div>
              </div>

              <div class="agent-row">
                <div class="agent-avatar" style="color:var(--accent-ok); background:rgba(61,220,151,0.15);">R1</div>
                <div class="agent-info">
                  <div class="agent-name">
                    <span>DeepSeek-R1 (DeepThink)</span>
                    <span style="color:var(--accent-ai); font-size:10px;">● РАССУЖДЕНИЕ</span>
                  </div>
                  <div class="agent-task">Аудит граничных условий истечения времени сессий (CoT: 28с)</div>
                </div>
              </div>

              <div class="agent-row">
                <div class="agent-avatar" style="color:var(--accent-info); background:rgba(90,176,255,0.15);">X</div>
                <div class="agent-info">
                  <div class="agent-name">
                    <span>Codex Reviewer</span>
                    <span style="color:var(--text-muted); font-size:10px;">◷ В ОЖИДАНИИ</span>
                  </div>
                  <div class="agent-task">Ожидает слияния задачи #1 для финального линтинга</div>
                </div>
              </div>
            </div>

            <!-- Perplexity Grounding Citations -->
            <div class="sidebar-panel">
              <div class="section-title">
                <span>📚 Обоснования и факты (Perplexity Engine)</span>
              </div>
              <div class="citation-box">
                <strong>[1] Стандарт безопасности:</strong><br>
                <a href="#" class="citation-link">RFC 6749: OAuth 2.0 Threat Model ↗</a>
                <div>Подтверждает обязательность флага HttpOnly против кражи учетных данных.</div>
              </div>
              <div class="citation-box">
                <strong>[2] Замер производительности:</strong><br>
                <span style="color:var(--text-primary); font-weight:500;">SQLite benchmark:</span> 0.08с на проверку валидности сессии (запас по задержке 12×).
              </div>
            </div>
          </aside>
        </div>

      </div>
    </div>

    <!-- ======================================================================
         CONCEPT 2: «SPATIAL WORKBENCH» (SYNCHRONOUS 4-SPACE QUADRANT)
         ====================================================================== -->
    <div class="concept-screen" id="screen-c2">
      <div class="c2-container">
        
        <!-- QUADRANT 1: ПРОЕКТ (Файловое дерево & Рубежи) -->
        <div class="q-col" style="width: 220px;">
          <div class="q-header">
            <div class="q-title"><span>📁</span> ПРОЕКТ</div>
            <span>L3</span>
          </div>
          <div class="tree-container">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); padding:6px 10px; text-transform:uppercase;">
              ЭТАПЫ РАБОТЫ
            </div>
            <div class="tree-node"><span style="color:var(--accent-ok);">✓</span> L0 Спецификация</div>
            <div class="tree-node"><span style="color:var(--accent-ok);">✓</span> L1 Архитектура</div>
            <div class="tree-node active-file"><span style="color:var(--accent-ai);">◐</span> L2 Разработка <span class="tree-badge badge-mod">3/4</span></div>
            <div class="tree-node"><span style="color:var(--text-faint);">🔒</span> L3 Продакшен</div>

            <div style="font-size:11px; font-weight:700; color:var(--text-muted); padding:12px 10px 6px; text-transform:uppercase;">
              ФАЙЛЫ ВЕТКИ
            </div>
            <div class="tree-node active-file" onclick="selectFile('auth_service.ts')">
              <span>📄</span> auth_service.ts <span class="tree-badge badge-mod">M</span>
            </div>
            <div class="tree-node" onclick="selectFile('LoginScreen.tsx')">
              <span>⚛️</span> LoginScreen.tsx <span class="tree-badge badge-mod">M</span>
            </div>
            <div class="tree-node" onclick="selectFile('auth.test.ts')">
              <span>🧪</span> auth.test.ts <span class="tree-badge badge-ok">✓</span>
            </div>
            <div class="tree-node" onclick="selectFile('session.ts')">
              <span>📄</span> session.ts
            </div>
            <div class="tree-node" onclick="selectFile('types.ts')">
              <span>📄</span> types.ts
            </div>
          </div>
        </div>

        <!-- QUADRANT 2: ДИАЛОГ (Claude 3.7 + DeepSeek-R1 CoT Accordion) -->
        <div class="q-col" style="width: 380px;">
          <div class="q-header">
            <div class="q-title"><span>💬</span> ДИАЛОГ С МОДЕЛЬЮ</div>
            <span style="color:var(--accent-ai); font-size:10px;">Thinking: ON</span>
          </div>

          <div class="chat-container">
            <div class="chat-messages" id="chat-messages-list">
              <!-- User message -->
              <div class="chat-msg msg-user">
                <div class="msg-author">
                  <span style="font-weight:600; color:#fff;">Вы (Владелец)</span>
                  <span>14:02</span>
                </div>
                <div class="msg-content">
                  Реализуй интеграцию Google OAuth: метод верификации токена в <code>auth_service.ts</code> и добавь кнопку входа на экран.
                </div>
              </div>

              <!-- Model response with DeepSeek Thought -->
              <div class="chat-msg">
                <div class="msg-author">
                  <span style="font-weight:600; color:var(--accent-ai);">✦ Claude 3.7 + DeepSeek-R1</span>
                  <span>14:03</span>
                </div>
                
                <!-- Collapsible CoT Accordion -->
                <div class="thought-accordion">
                  <div class="thought-summary" onclick="toggleThought()">
                    <span>▸ Рассуждение модели (DeepThink: 18с · 1,420 токенов)</span>
                    <span id="thought-arrow">▾</span>
                  </div>
                  <div class="thought-body" id="thought-body-content">
                    1. Анализирую контракт OAuth 2.0: требуется валидация id_token через Google API.<br>
                    2. Выбираю схему защиты: отклонять токены без verified_email.<br>
                    3. Создаю чистую сигнатуру <code>verifyGoogleToken(token: string)</code>.<br>
                    4. Покрываю тестами: валидный токен, истекший токен, сетевой сбой.<br>
                    5. Готовлю дифф для ревью владельцем.
                  </div>
                </div>

                <div class="msg-content">
                  Сделано! Я добавил функцию <code>verifyGoogleToken</code> с валидацией полезной нагрузки и интегрировал кнопку в <code>LoginScreen.tsx</code>.<br><br>
                  Все <strong>8 юнит-тестов</strong> успешно прошли. Дифф готов к слиянию в соседней панели.
                </div>
              </div>
            </div>

            <!-- Interactive Chat Composer -->
            <div class="chat-composer">
              <textarea class="composer-input" id="user-composer-text" placeholder="Поручите модели задачу... (например: добавь обработку ошибки 401)"></textarea>
              <div class="composer-footer">
                <div class="composer-tools">
                  <span class="mini-pill">Код</span>
                  <span class="mini-pill">Автотест</span>
                </div>
                <button class="btn btn-primary" style="padding:5px 12px; font-size:12px;" onclick="sendUserMessage()">
                  <span>Отправить</span>
                  <span class="kbd">⌘↵</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- QUADRANT 3: КОД (Syntax-Highlighted Diff & Vitest Bar) -->
        <div class="q-col">
          <div class="q-header">
            <div class="q-title"><span>💻</span> КОД & ДИФФ <code id="active-file-header" style="color:var(--accent-info); font-family:var(--font-mono);">auth_service.ts</code></div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-primary" style="padding:3px 8px; font-size:11px;" onclick="acceptDiff()">✓ Принять коммит</button>
            </div>
          </div>

          <div class="code-container">
            <div class="diff-viewer" id="diff-content-view">
              <div class="diff-hunk">@@ -14,6 +14,24 @@ export class AuthService {</div>
              <div class="diff-line"><span class="diff-num">14</span>   constructor(private readonly db: Database) {}</div>
              <div class="diff-line"><span class="diff-num">15</span> </div>
              <div class="diff-line diff-del"><span class="diff-num">16</span>-  // TODO: Add OAuth provider verification</div>
              <div class="diff-line diff-add"><span class="diff-num">16</span>+  async verifyGoogleToken(idToken: string): Promise<UserSession> {</div>
              <div class="diff-line diff-add"><span class="diff-num">17</span>+    if (!idToken) throw new AuthError("TOKEN_EMPTY");</div>
              <div class="diff-line diff-add"><span class="diff-num">18</span>+    </div>
              <div class="diff-line diff-add"><span class="diff-num">19</span>+    const ticket = await this.googleClient.verifyIdToken({</div>
              <div class="diff-line diff-add"><span class="diff-num">20</span>+      idToken,</div>
              <div class="diff-line diff-add"><span class="diff-num">21</span>+      audience: process.env.GOOGLE_CLIENT_ID,</div>
              <div class="diff-line diff-add"><span class="diff-num">22</span>+    });</div>
              <div class="diff-line diff-add"><span class="diff-num">23</span>+    const payload = ticket.getPayload();</div>
              <div class="diff-line diff-add"><span class="diff-num">24</span>+    if (!payload?.email_verified) throw new AuthError("EMAIL_UNVERIFIED");</div>
              <div class="diff-line diff-add"><span class="diff-num">25</span>+    </div>
              <div class="diff-line diff-add"><span class="diff-num">26</span>+    return this.findOrCreateUser({</div>
              <div class="diff-line diff-add"><span class="diff-num">27</span>+      email: payload.email!,</div>
              <div class="diff-line diff-add"><span class="diff-num">28</span>+      googleSub: payload.sub,</div>
              <div class="diff-line diff-add"><span class="diff-num">29</span>+    });</div>
              <div class="diff-line diff-add"><span class="diff-num">30</span>+  }</div>
              <div class="diff-line"><span class="diff-num">31</span> </div>
              <div class="diff-line"><span class="diff-num">32</span>   async logout(sessionId: string): Promise<void> {</div>
            </div>

            <!-- Vitest Realtime Status -->
            <div class="test-bar">
              <div class="test-bar-row">
                <div class="test-status">
                  <span>● 8/8 тестов пройдено (0.28s)</span>
                  <span style="color:var(--text-muted); font-size:11px;">· Typecheck чистый</span>
                </div>
                <div style="font-size:11px; color:var(--accent-ok); font-weight:600;">100% COVERAGE</div>
              </div>
              <div class="test-checks">
                <span>ПУТИ: <strong style="color:var(--accent-ok);">✓</strong></span>
                <span>ОТСУТСТВИЕ: <strong style="color:var(--accent-ok);">✓</strong></span>
                <span>МАСКАРАД: <strong style="color:var(--accent-ok);">✓</strong></span>
                <span>ОКНА: <strong style="color:var(--accent-ok);">✓</strong></span>
                <span>СОСЕДИ: <strong style="color:var(--accent-ok);">✓</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- QUADRANT 4: ПРОДУКТ (Живое интерактивное превью работающего UI) -->
        <div class="q-col" style="width: 420px;">
          <div class="q-header">
            <div class="q-title"><span>🚀</span> ПРОДУКТ <span style="font-size:10px; color:var(--accent-ok); font-family:var(--font-mono);">:3000/login</span></div>
            <div class="preview-controls">
              <button class="preview-btn active" onclick="setDevice('desktop')">Desktop</button>
              <button class="preview-btn" onclick="setDevice('mobile')">Mobile</button>
            </div>
          </div>

          <div class="product-canvas">
            <div class="live-mockup-frame" id="live-product-frame">
              <div class="mockup-logo">⚡</div>
              <h4 class="mockup-title">Вход в систему</h4>
              <p class="mockup-desc">Авторизуйтесь в рабочем пространстве OMG Harness для продолжения.</p>

              <!-- The created button! -->
              <button class="google-login-btn" onclick="simulateGoogleLogin()">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                <span>Войти через Google</span>
              </button>

              <div style="font-size:11px; color:var(--text-muted); margin-top:8px;" id="login-state-label">
                или используйте рабочий email
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ======================================================================
         CONCEPT 3: «DETERMINISTIC GATEWAY» (STAGE-GATE CONVEYOR & LEDGER)
         ====================================================================== -->
    <div class="concept-screen" id="screen-c3">
      <div class="c3-container">
        
        <!-- Top Stage-Gate Rail -->
        <div class="stage-gate-rail">
          <div class="stage-item completed">
            <span>✓</span> 1. СПЕЦИФИКАЦИЯ
          </div>
          <span class="stage-connector">──►</span>
          <div class="stage-item completed">
            <span>✓</span> 2. АРХИТЕКТУРА & ГРАФ
          </div>
          <span class="stage-connector">──►</span>
          <div class="stage-item active">
            <span>◐</span> 3. РЕАЛИЗАЦИЯ (L3)
          </div>
          <span class="stage-connector">──►</span>
          <div class="stage-item">
            <span>🔒</span> 4. ШЛЮЗ ВЕРИФИКАЦИИ
          </div>
          <span class="stage-connector">──►</span>
          <div class="stage-item">
            <span>🔒</span> 5. ПРОДАКШЕН MAIN
          </div>
        </div>

        <!-- C3 Main Layout -->
        <div class="c3-body">
          
          <!-- Living Stage Contract -->
          <div class="contract-viewer">
            <div class="contract-card">
              <div class="contract-header">
                <div>
                  <div class="card-badge badge-ai">БОРТОВОЙ ФОРМУЛЯР ШЛЮЗА L3→L4</div>
                  <h2 class="contract-title">Спецификация интеграции OAuth 2.0</h2>
                  <div class="contract-meta">
                    <span>Версия: <strong>v1.4-frozen</strong></span>
                    <span>Хеш контракта: <code>sha:f3bf191</code></span>
                    <span>Ответственный архитектор: <strong>Claude 3.7</strong></span>
                  </div>
                </div>
                <div class="brand-badge" style="background:rgba(61,220,151,0.15); color:var(--accent-ok);">ГОТОВО К ПРИЕМКЕ</div>
              </div>

              <!-- 5-Pass Self-Check Gate Checklist -->
              <div class="pass-checklist">
                <div style="font-size:12px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">
                  КОНСТИТУЦИЯ ВЛАДЕЛЬЦА: 5 ОБЯЗАТЕЛЬНЫХ ПРОХОДОВ ВЕРИФИКАЦИИ
                </div>

                <div class="pass-item" onclick="toggleCheck(this)">
                  <div class="pass-checkbox">✓</div>
                  <div class="pass-text">
                    <span class="pass-title">1. ПУТИ (All Entry Paths Covered)</span>
                    <span class="pass-desc">Проверены все пути входа: прямая кнопка, авторедирект, повторная попытка при ошибке 401.</span>
                  </div>
                </div>

                <div class="pass-item" onclick="toggleCheck(this)">
                  <div class="pass-checkbox">✓</div>
                  <div class="pass-text">
                    <span class="pass-title">2. ОТСУТСТВИЕ (Typed Rejection)</span>
                    <span class="pass-desc">Отсутствие токена или email_verified вызывает типизированный AuthError, а не молчаливый пропуск.</span>
                  </div>
                </div>

                <div class="pass-item" onclick="toggleCheck(this)">
                  <div class="pass-checkbox">✓</div>
                  <div class="pass-text">
                    <span class="pass-title">3. МАСКАРАД (Anti-Spoofing & Signature Guard)</span>
                    <span class="pass-desc">Проверена защита от подделки jwt_token через проверку подписи открытыми ключами Google.</span>
                  </div>
                </div>

                <div class="pass-item" onclick="toggleCheck(this)">
                  <div class="pass-checkbox">✓</div>
                  <div class="pass-text">
                    <span class="pass-title">4. ОКНА (No Check-then-Act Window)</span>
                    <span class="pass-desc">Исключен временной зазор между верификацией сессии и записью в БД с использованием атомарной транзакции.</span>
                  </div>
                </div>

                <div class="pass-item" onclick="toggleCheck(this)">
                  <div class="pass-checkbox">✓</div>
                  <div class="pass-text">
                    <span class="pass-title">5. СОСЕДИ (Full Clean Typecheck & Tests)</span>
                    <span class="pass-desc">Смежные модули (биллинг, профиль) компилируются без предупреждений TypeScript, 8/8 тестов зеленые.</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Proof Ledger & Cryptographic Sign -->
          <div class="ledger-panel">
            <div class="q-header">
              <div class="q-title"><span>📜</span> БОРТОВОЙ ЖУРНАЛ ДОКАЗАТЕЛЬСТВ</div>
              <span style="font-size:10px; color:var(--text-muted);">НЕИЗМЕНЯЕМЫЙ ЛОГ</span>
            </div>

            <div class="ledger-feed">
              <div class="ledger-entry">
                <div class="entry-hash">sha: 8f4c21a · Claude 3.7</div>
                <div class="entry-msg">Генерация auth_service.ts с валидацией payload.sub</div>
                <div class="entry-time">14:02:18 · 0 warning</div>
              </div>

              <div class="ledger-entry">
                <div class="entry-hash">sha: d91e32b · Vitest Suite</div>
                <div class="entry-msg">8/8 юнит-тестов успешно пройдены за 0.28с</div>
                <div class="entry-time">14:02:45 · exit 0</div>
              </div>

              <div class="ledger-entry">
                <div class="entry-hash">sha: e02a99c · Security Gate</div>
                <div class="entry-msg">Проверка OWASP CWE-79: HttpOnly cookies активны</div>
                <div class="entry-time">14:03:10 · 0 cve</div>
              </div>

              <div class="ledger-entry" style="border-left-color:var(--accent-ai);">
                <div class="entry-hash">sha: f3bf191 · Владелец</div>
                <div class="entry-msg">Подтверждение архитектурного решения о хранении сессий</div>
                <div class="entry-time">14:04:02 · подпись подтверждена</div>
              </div>
            </div>

            <div class="gateway-footer">
              <button class="btn-gateway" onclick="signGateway()">
                <span>🔒 ПОДПИСАТЬ ШЛЮЗ L3→L4 И ОТПРАВИТЬ В MAIN</span>
              </button>
              <div style="font-size:11px; text-align:center; color:var(--text-muted);">
                Требуется 5 из 5 проверок Конституции для активации слияния
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>

  </main>
</div>

<!-- ========================================================================
     INTERACTIVE COMMAND PALETTE MODAL (⌘K)
     ======================================================================== -->
<div class="palette-overlay" id="palette-modal" onclick="closePaletteOnBackdrop(event)">
  <div class="palette-modal">
    <div class="palette-input-wrap">
      <span>🔍</span>
      <input type="text" class="palette-input" id="palette-search-input" placeholder="Поиск концепций, файлов, действий..." onkeyup="filterPalette()">
      <span class="key-hint" style="font-family:var(--font-mono); font-size:10px;">ESC</span>
    </div>
    <div class="palette-results">
      <div class="palette-item selected" onclick="switchConcept(1); closePalette();">
        <span>🛰️ Переключить на <strong>Action Horizon</strong> (Диспетчерская решений)</span>
        <span class="palette-shortcut">1</span>
      </div>
      <div class="palette-item" onclick="switchConcept(2); closePalette();">
        <span>📐 Переключить на <strong>Spatial Workbench</strong> (4 Пространства)</span>
        <span class="palette-shortcut">2</span>
      </div>
      <div class="palette-item" onclick="switchConcept(3); closePalette();">
        <span>🔒 Переключить на <strong>Deterministic Gateway</strong> (Рельсы истины)</span>
        <span class="palette-shortcut">3</span>
      </div>
      <div class="palette-item" onclick="cycleModel(); closePalette();">
        <span>🤖 Сменить активную модель (Claude 3.7 / DeepSeek-R1 / GPT-4o)</span>
        <span class="palette-shortcut">M</span>
      </div>
      <div class="palette-item" onclick="simulateGoogleLogin(); closePalette();">
        <span>🚀 Запустить живой вход через Google в превью</span>
        <span class="palette-shortcut">G</span>
      </div>
    </div>
  </div>
</div>

<!-- ========================================================================
     CLIENT-SIDE INTERACTIVE ENGINE
     ======================================================================== -->
<script>
// State Management
let currentConcept = 1;
const models = ['Claude 3.7 Sonnet', 'DeepSeek-R1 (DeepThink)', 'OpenAI o3-mini'];
let activeModelIdx = 0;

// Switch Concepts (1, 2, 3)
function switchConcept(num) {
  currentConcept = num;
  
  // Update header buttons
  document.querySelectorAll('.concept-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx + 1 === num);
  });

  // Update screens
  document.querySelectorAll('.concept-screen').forEach((screen, idx) => {
    screen.classList.toggle('active', idx + 1 === num);
  });

  // Update hash
  location.hash = '#c' + num;

  // Update HUD values dynamically per concept
  updateHUD(num);
}

function updateHUD(conceptNum) {
  const whereEl = document.getElementById('hud-where');
  const whatEl = document.getElementById('hud-what');
  const whyEl = document.getElementById('hud-why');
  const whenEl = document.getElementById('hud-when');
  const expectEl = document.getElementById('hud-expect');
  const risksEl = document.getElementById('hud-risks');
  const critEl = document.getElementById('hud-criteria');

  if (conceptNum === 1) {
    whereEl.innerHTML = '<strong>omg-core</strong> / triage/action-horizon';
    whatEl.textContent = 'Диспетчерская решений: 2 развилки требуют слова владельца';
    whyEl.textContent = 'Управление без чтения бесконечных консольных логов';
    whenEl.textContent = 'Фокус сейчас · Старейшая развилка 4 мин';
    expectEl.innerHTML = '1-клик слияние <code>Space</code> / отказ <code>Esc</code>';
    risksEl.textContent = 'Паралич внимания при >5 фоновых агентах';
    critEl.textContent = '0 непроверенных слияний · Мгновенное одобрение';
  } else if (conceptNum === 2) {
    whereEl.innerHTML = '<strong>omg-core</strong> / auth/google-login';
    whatEl.textContent = 'Интеграция Google OAuth 2.0 + верификация JWT';
    whyEl.textContent = 'Вход без пароля для новых пользователей (конверсия +35%)';
    whenEl.textContent = 'Этап 3: Разработка · Готовность 85%';
    expectEl.innerHTML = '<code>auth_service.ts</code> + 8 юнит-тестов';
    risksEl.textContent = 'XSS при хранении в storage (решение: HttpOnly cookie)';
    critEl.textContent = '8/8 тестов OK · 0 уязвимостей в аудите';
  } else if (conceptNum === 3) {
    whereEl.innerHTML = '<strong>omg-core</strong> / gateway/stage-l3-l4';
    whatEl.textContent = 'Бортовой формуляр и проверка 5 проходов Конституции';
    whyEl.textContent = 'Гарантия 0% галлюцинаций перед слиянием в main';
    whenEl.textContent = 'Шлюз допуска к релизу L4';
    expectEl.innerHTML = 'Криптографическая подпись шлюза <code>f3bf191</code>';
    risksEl.textContent = 'Молчаливый сбой конвейера при нетипизированных ошибках';
    critEl.textContent = '5 из 5 проверок пройдены · Подпись владельца';
  }
}

// Model Cycling
function cycleModel() {
  activeModelIdx = (activeModelIdx + 1) % models.length;
  document.getElementById('active-model-name').textContent = models[activeModelIdx];
}

// Concept 1 Actions
function approveTask(id) {
  const card = document.getElementById('triage-card-' + id);
  if (!card) return;
  card.style.transition = 'all 240ms ease-out';
  card.style.opacity = '0';
  card.style.transform = 'translateX(40px)';
  setTimeout(() => {
    card.remove();
    const countEl = document.getElementById('c1-pending-count');
    const newCount = Math.max(0, parseInt(countEl.textContent) - 1);
    countEl.textContent = newCount;
    if (newCount === 0) {
      document.querySelector('.triage-section').innerHTML += `
        <div style="background:var(--bg-panel); border:1px solid rgba(61,220,151,0.2); border-radius:var(--radius-lg); padding:32px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🟢</div>
          <h3 style="color:#fff; font-size:18px;">Все развилки обработаны!</h3>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:4px;">Агенты продолжают работу в автономном режиме без блокировок.</p>
        </div>
      `;
    }
  }, 240);
}

function rejectTask(id) {
  approveTask(id);
}

// Concept 2 Chat & Thought
function toggleThought() {
  const body = document.getElementById('thought-body-content');
  const arrow = document.getElementById('thought-arrow');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    arrow.textContent = '▾';
  } else {
    body.style.display = 'none';
    arrow.textContent = '▸';
  }
}

function sendUserMessage() {
  const input = document.getElementById('user-composer-text');
  const text = input.value.trim();
  if (!text) return;

  const list = document.getElementById('chat-messages-list');
  
  // User bubble
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg msg-user';
  userMsg.innerHTML = `
    <div class="msg-author">
      <span style="font-weight:600; color:#fff;">Вы (Владелец)</span>
      <span>Сейчас</span>
    </div>
    <div class="msg-content">${text}</div>
  `;
  list.appendChild(userMsg);
  input.value = '';
  list.scrollTop = list.scrollHeight;

  // Simulated Model Response
  setTimeout(() => {
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-msg';
    aiMsg.innerHTML = `
      <div class="msg-author">
        <span style="font-weight:600; color:var(--accent-ai);">✦ Claude 3.7 Sonnet</span>
        <span>Сейчас</span>
      </div>
      <div class="msg-content">
        Принято. Я проверил ваше поручение <em>«${text}»</em>. Внес необходимые правки в код, обновил тесты и проверил соответствие 7 инвариантам.
      </div>
    `;
    list.appendChild(aiMsg);
    list.scrollTop = list.scrollHeight;
  }, 600);
}

function selectFile(filename) {
  document.getElementById('active-file-header').textContent = filename;
  document.querySelectorAll('.tree-node').forEach(n => {
    if (n.textContent.includes(filename)) {
      n.classList.add('active-file');
    } else if (n.querySelector('.tree-badge')) {
      n.classList.remove('active-file');
    }
  });
}

function acceptDiff() {
  alert('Коммит f3bf191 успешно слит в ветку om-map!');
}

function setDevice(type) {
  const frame = document.getElementById('live-product-frame');
  document.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (type === 'mobile') {
    frame.style.maxWidth = '300px';
    frame.style.padding = '20px 16px';
  } else {
    frame.style.maxWidth = '360px';
    frame.style.padding = '28px 24px';
  }
}

function simulateGoogleLogin() {
  const label = document.getElementById('login-state-label');
  label.innerHTML = '<span style="color:var(--accent-ok); font-weight:600;">✓ Успешный вход: sergey@omg.dev (JWT Valid)</span>';
}

// Concept 3 Actions
function toggleCheck(el) {
  const check = el.querySelector('.pass-checkbox');
  if (check.textContent === '✓') {
    check.textContent = '';
    check.style.background = 'var(--bg-app)';
    check.style.border = '1px solid var(--border-subtle)';
  } else {
    check.textContent = '✓';
    check.style.background = 'var(--accent-ok)';
    check.style.border = 'none';
  }
}

function signGateway() {
  alert('Шлюз L3→L4 успешно подписан криптографической подписью владельца! Конвейер разблокирован для развертывания в Main.');
}

// Command Palette (⌘K)
function openPalette() {
  document.getElementById('palette-modal').classList.add('open');
  document.getElementById('palette-search-input').focus();
}
function closePalette() {
  document.getElementById('palette-modal').classList.remove('open');
}
function closePaletteOnBackdrop(e) {
  if (e.target.id === 'palette-modal') closePalette();
}
function filterPalette() {
  const val = document.getElementById('palette-search-input').value.toLowerCase();
  document.querySelectorAll('.palette-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(val) ? 'flex' : 'none';
  });
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  // Ignore inside inputs
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      sendUserMessage();
    }
    return;
  }

  if (e.key === '1') switchConcept(1);
  if (e.key === '2') switchConcept(2);
  if (e.key === '3') switchConcept(3);
  
  if (e.key === ' ' && currentConcept === 1) {
    e.preventDefault();
    approveTask(1);
  }
  if (e.key === 'Escape') {
    closePalette();
    if (currentConcept === 1) rejectTask(1);
  }

  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openPalette();
  }
});

// Initialize on page load based on URL hash
window.addEventListener('DOMContentLoaded', () => {
  if (location.hash === '#c2' || location.hash === '#spatial') switchConcept(2);
  else if (location.hash === '#c3' || location.hash === '#gateway') switchConcept(3);
  else switchConcept(1);
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#c1') switchConcept(1);
  else if (location.hash === '#c2') switchConcept(2);
  else if (location.hash === '#c3') switchConcept(3);
});
</script>

</body>
</html>
"""

def main():
    target_path = "/Users/kostenchuksergey/REPORTS/workbench-design/core/workbench-unified.html"
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(HTML_CONTENT)
    print(f"Successfully compiled Awards-Level AI Harness to {target_path}")

if __name__ == "__main__":
    main()
