"""
Generator for Next-Gen AI Harness Awards 2026-2027 Platform
Delivers 3 Distinct UX/UI Concepts:
1. Studio Horizon (Adaptive Dock & Lens)
2. Node Swarm Canvas (Spatial Infinite Graph with up to 64 agents)
3. Zen Director (Zero-Noise Apple/Pi-like Focus)
Includes complete Agent & Provider Management (Anthropic, DeepSeek, OpenAI, Ollama Local),
Operation Map, Code Diff, Live Preview, and 7 Invariants + 5 Passes.
"""

import json
import os

TARGET_HTML = "/Users/kostenchuksergey/REPORTS/workbench-design/core/harness-awards-platform.html"

html = r'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>⚡ Next-Gen AI Harness • Awards 2026–2027 Edition</title>
<style>
:root {
  --bg-black: #08090d;
  --bg-app: #0d0f15;
  --bg-surface: #131620;
  --bg-card: #181c28;
  --bg-card-hover: #1e2434;
  --bg-glass: rgba(19, 22, 32, 0.75);
  --bg-input: #0a0c12;

  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --border-accent: rgba(143, 129, 255, 0.4);

  --text-main: #f4f6fa;
  --text-muted: #8e96a8;
  --text-dim: #555d70;

  --ai-purple: #8f81ff;
  --ai-glow: rgba(143, 129, 255, 0.25);
  --ok-emerald: #3ddc97;
  --ok-glow: rgba(61, 220, 151, 0.25);
  --warn-amber: #f2b04b;
  --info-cyan: #5ab0ff;
  --danger-coral: #ff6b6b;

  --font-ui: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;

  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  --shadow-sm: 0 2px 8px rgba(0,0,0,0.4);
  --shadow-md: 0 8px 24px rgba(0,0,0,0.5);
  --shadow-lg: 0 16px 48px rgba(0,0,0,0.7);
  --shadow-glow: 0 0 24px var(--ai-glow);

  --transition: 120ms cubic-bezier(0.16, 1, 0.3, 1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  background: var(--bg-black);
  color: var(--text-main);
  font-size: 13px;
  line-height: 1.5;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ════════════ MASTER HEADER (macOS Chrome + Concept Switcher) ════════════ */
.master-header {
  height: 52px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  z-index: 100;
  user-select: none;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.traffic-lights {
  display: flex;
  gap: 7px;
}
.tl-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.tl-red { background: #ff5f56; }
.tl-yellow { background: #ffbd2e; }
.tl-green { background: #27c93f; }

.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 13.5px;
  letter-spacing: -0.2px;
}
.project-crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 3px 9px;
  border-radius: var(--radius-pill);
}

/* Concept Switcher Tabs */
.concept-switcher {
  display: flex;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 3px;
  border-radius: var(--radius-pill);
  gap: 2px;
}
.c-pill {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  gap: 6px;
}
.c-pill:hover {
  color: var(--text-main);
  background: rgba(255,255,255,0.05);
}
.c-pill.active {
  background: var(--ai-purple);
  color: #fff;
  box-shadow: 0 2px 10px var(--ai-glow);
}
.c-pill .hotkey {
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.7;
  background: rgba(0,0,0,0.25);
  padding: 1px 5px;
  border-radius: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stats-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}
.stats-chip strong { color: var(--ok-emerald); }

.btn-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
  transition: all var(--transition);
}
.btn-header:hover {
  background: var(--bg-card);
  border-color: var(--border-strong);
}
.btn-header.primary {
  background: linear-gradient(135deg, var(--ai-purple), #6350ff);
  border: none;
  color: #fff;
  box-shadow: 0 2px 12px var(--ai-glow);
}
.btn-header.primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ════════════ MAIN CONTAINER ════════════ */
.main-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg-app);
}

.concept-page {
  position: absolute;
  inset: 0;
  display: none;
  overflow: hidden;
}
.concept-page.active {
  display: flex;
}

/* ════════════ CONCEPT 1: STUDIO HORIZON ════════════ */
.c1-layout {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 360px 1fr 400px;
  overflow: hidden;
}

/* Left: Human-to-Lead Chat */
.c1-col-chat {
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.panel-head {
  height: 44px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-weight: 600;
  font-size: 12.5px;
}
.chat-stream {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg-author {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}
.msg-bubble {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.55;
}
.msg-bubble.user {
  background: rgba(143, 129, 255, 0.12);
  border-color: rgba(143, 129, 255, 0.25);
  align-self: flex-end;
  max-width: 90%;
}
.msg-bubble code {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: rgba(0,0,0,0.3);
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--info-cyan);
}

/* DeepThink Accordion */
.thought-box {
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(143,129,255,0.2);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin: 6px 0;
}
.thought-head {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--ai-purple);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  user-select: none;
}
.thought-body {
  padding: 8px 10px;
  font-size: 11.5px;
  color: var(--text-muted);
  border-top: 1px solid rgba(255,255,255,0.04);
  line-height: 1.5;
}

/* Tool Badges */
.tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: var(--font-mono);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-muted);
}
.tool-tag.ok { color: var(--ok-emerald); border-color: rgba(61,220,151,0.25); }

/* Composer */
.chat-composer {
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
}
.composer-box {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-box:focus-within {
  border-color: var(--border-accent);
  box-shadow: 0 0 12px var(--ai-glow);
}
.composer-input {
  width: 100%;
  height: 52px;
  background: transparent;
  border: none;
  color: #fff;
  font-family: var(--font-ui);
  font-size: 13px;
  resize: none;
  outline: none;
}
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.model-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  color: var(--ai-purple);
  cursor: pointer;
}
.btn-send {
  background: var(--ai-purple);
  border: none;
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
}
.btn-send:hover { filter: brightness(1.1); }

/* Center: Agent Fleet Management */
.c1-col-fleet {
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fleet-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.1px;
  color: #fff;
}
.agent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.agent-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all var(--transition);
  position: relative;
}
.agent-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}
.agent-card.active-work {
  border-color: rgba(61, 220, 151, 0.35);
  box-shadow: 0 4px 16px rgba(61, 220, 151, 0.08);
}
.agent-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.agent-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
.icon-orch { background: rgba(143,129,255,0.15); color: var(--ai-purple); }
.icon-rev { background: rgba(242,176,75,0.15); color: var(--warn-amber); }
.icon-work { background: rgba(61,220,151,0.15); color: var(--ok-emerald); }

.agent-name {
  font-weight: 600;
  font-size: 12.5px;
  color: #fff;
}
.agent-role {
  font-size: 10.5px;
  color: var(--text-muted);
}
.agent-status-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-running { background: rgba(61,220,151,0.12); color: var(--ok-emerald); }
.status-waiting { background: rgba(242,176,75,0.12); color: var(--warn-amber); }
.status-idle { background: rgba(255,255,255,0.06); color: var(--text-dim); }

.agent-model-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  cursor: pointer;
}
.agent-model-pill:hover { border-color: var(--border-accent); color: #fff; }

.agent-task-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
  height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.agent-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

/* Operation Map Mini Timeline */
.op-map-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ladder-steps {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.ladder-card {
  flex: 1;
  min-width: 90px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ladder-card.active {
  border-color: var(--ai-purple);
  background: rgba(143,129,255,0.08);
}
.ladder-num { font-size: 9.5px; font-weight: 700; color: var(--ai-purple); }
.ladder-name { font-size: 11px; font-weight: 600; color: #fff; }

/* Right: Passport 7 Invariants & Product */
.c1-col-focus {
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.focus-tabs {
  height: 40px;
  border-bottom: 1px solid var(--border);
  display: flex;
  padding: 0 12px;
  gap: 8px;
}
.f-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0 8px;
  transition: all var(--transition);
}
.f-tab.active {
  color: #fff;
  border-bottom-color: var(--ai-purple);
}
.focus-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Decision Passport Card */
.passport-card {
  margin: 16px;
  background: linear-gradient(145deg, #1c202d, #141722);
  border: 1px solid rgba(143, 129, 255, 0.4);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-md);
}
.passport-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.passport-tag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--warn-amber);
  background: rgba(242,176,75,0.12);
  padding: 2px 7px;
  border-radius: var(--radius-xs);
}
.invariants-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
}
.inv-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inv-k { font-size: 9.5px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; }
.inv-v { font-size: 11px; color: var(--text-main); font-family: var(--font-mono); }

.passport-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-approve {
  flex: 1;
  background: var(--ok-emerald);
  color: #062315;
  border: none;
  font-weight: 700;
  font-size: 12px;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all var(--transition);
}
.btn-approve:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-ghost-sm {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border);
  color: var(--text-main);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.btn-ghost-sm:hover { background: rgba(255,255,255,0.1); }

/* Live Webview or Diff View in right column */
.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
}
.preview-box {
  flex: 1;
  background: #000;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preview-bar {
  height: 32px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}
.preview-iframe {
  flex: 1;
  border: none;
  background: #0a0c10;
}

/* ════════════ CONCEPT 2: NODE SWARM CANVAS ════════════ */
.c2-layout {
  width: 100%;
  height: 100%;
  position: relative;
  background: radial-gradient(circle at 50% 50%, #111420 0%, #08090d 100%);
  overflow: hidden;
}
.canvas-grid-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
}
.canvas-node-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.canvas-graph {
  display: flex;
  align-items: center;
  gap: 48px;
  position: relative;
}
.graph-stage-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.c2-node-card {
  width: 220px;
  background: rgba(22, 26, 38, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: all var(--transition);
  position: relative;
}
.c2-node-card:hover {
  border-color: var(--ai-purple);
  transform: scale(1.03);
  box-shadow: var(--shadow-glow);
}
.c2-node-card.active-stage {
  border-color: var(--ok-emerald);
  box-shadow: 0 0 20px var(--ok-glow);
}
.node-agent-chip {
  position: absolute;
  top: -12px;
  right: 12px;
  background: var(--ai-purple);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  box-shadow: 0 2px 8px var(--ai-glow);
  display: flex;
  align-items: center;
  gap: 4px;
}
.c2-floating-chat {
  position: absolute;
  bottom: 24px;
  left: 24px;
  width: 380px;
  height: 440px;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 50;
}
.c2-floating-inspector {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 420px;
  height: 480px;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 50;
}
.c2-swarm-scaler {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 40;
}

/* ════════════ CONCEPT 3: ZEN DIRECTOR ════════════ */
.c3-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-black);
  position: relative;
}
.c3-centered-stream {
  width: 100%;
  max-width: 760px;
  flex: 1;
  overflow-y: auto;
  padding: 32px 20px 100px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.c3-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.c3-author {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
}
.c3-author.ai { color: var(--ai-purple); }
.c3-prose {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-main);
}
.c3-decision-panel {
  background: linear-gradient(145deg, #131722, #0d1017);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 12px 0;
}
.c3-floating-composer {
  position: absolute;
  bottom: 32px;
  width: 100%;
  max-width: 760px;
  background: rgba(19, 22, 32, 0.85);
  backdrop-filter: blur(24px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  padding: 8px 14px 8px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-lg);
}
.c3-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 14px;
  outline: none;
}
.c3-bottom-strip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: rgba(0,0,0,0.6);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 11px;
  color: var(--text-muted);
}

/* ════════════ MODALS & DRAWERS ════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-overlay.open { display: flex; }

.modal-dialog {
  width: 520px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title { font-size: 16px; font-weight: 700; color: #fff; }
.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label { font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
.form-input, .form-select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  color: #fff;
  font-size: 13px;
  outline: none;
}
.form-input:focus, .form-select:focus {
  border-color: var(--ai-purple);
}
.role-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.role-pill {
  font-size: 11px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  color: var(--text-muted);
}
.role-pill:hover, .role-pill.selected {
  background: var(--ai-purple);
  color: #fff;
  border-color: var(--ai-purple);
}

/* Slide-up Fleet Drawer for Concept 3 */
.drawer-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 380px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-accent);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.7);
  display: none;
  flex-direction: column;
  z-index: 200;
  padding: 18px 24px;
}
.drawer-bottom.open { display: flex; }
</style>
</head>
<body>

<!-- ════════════ MASTER HEADER ════════════ -->
<header class="master-header">
  <div class="header-left">
    <div class="traffic-lights">
      <div class="tl-dot tl-red"></div>
      <div class="tl-dot tl-yellow"></div>
      <div class="tl-dot tl-green"></div>
    </div>
    <div class="app-brand">
      <span>⚡ Harness Awards 26/27</span>
      <span class="project-crumb">OMG-Dev / main</span>
    </div>
  </div>

  <!-- 3 DISTINCT UX/UI CONCEPTS -->
  <div class="concept-switcher">
    <button class="c-pill active" id="pill-c1" onclick="switchConcept('c1')">
      <span>1. Studio Horizon</span>
      <span class="hotkey">1</span>
    </button>
    <button class="c-pill" id="pill-c2" onclick="switchConcept('c2')">
      <span>2. Swarm Canvas</span>
      <span class="hotkey">2</span>
    </button>
    <button class="c-pill" id="pill-c3" onclick="switchConcept('c3')">
      <span>3. Zen Director</span>
      <span class="hotkey">3</span>
    </button>
  </div>

  <div class="header-right">
    <div class="stats-chip">
      <span id="agents-count-header">👥 <strong>5 агентов</strong> в работе</span>
      <span>·</span>
      <span>💰 $0.18</span>
    </div>
    <button class="btn-header" onclick="openProvidersModal()">
      <span>⚙️ Провайдеры (4)</span>
    </button>
    <button class="btn-header primary" onclick="openAddAgentModal()">
      <span>+ Новый агент</span>
    </button>
  </div>
</header>

<!-- ════════════ MAIN VIEWPORT ════════════ -->
<main class="main-viewport">

  <!-- ════════════ 1. STUDIO HORIZON (ADAPTIVE DOCK) ════════════ -->
  <section class="concept-page active" id="page-c1">
    <div class="c1-layout">
      
      <!-- Left: Dialogue with Lead Architect -->
      <aside class="c1-col-chat">
        <div class="panel-head">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--ai-purple);">✦</span>
            <span>Ведущий Архитектор</span>
          </div>
          <span style="font-size:11px; color:var(--ok-emerald);">● В сети</span>
        </div>

        <div class="chat-stream" id="c1-chat-stream">
          <div class="msg">
            <div class="msg-author">
              <span style="color:var(--ai-purple); font-weight:600;">Architect (Claude 3.7 Sonnet)</span>
              <span>14:30</span>
            </div>
            <div class="msg-bubble">
              Приветствую! Я координирую работу команды на рубеже <strong>L3 (Авторизация и витрина)</strong>.<br>
              Я развернул 4 воркеров:
              <ul style="margin:6px 0 6px 18px;">
                <li>Worker 1 (DeepSeek-R1): вёрстка виджета Telegram.</li>
                <li>Worker 2 (Claude 3.7): бэкенд эндпоинт <code>/api/auth</code>.</li>
                <li>Worker 3 (Llama 3.3 Ollama Local): аудит секретов.</li>
                <li>Reviewer (o3-mini): проверка тестов и Конституции.</li>
              </ul>
            </div>
          </div>

          <!-- Collapsible CoT -->
          <div class="thought-box">
            <div class="thought-head" onclick="toggleC1Thought()">
              <span>▸ Ход мыслей Архитектора (DeepThink: 16с)</span>
              <span id="c1-thought-arr">▾</span>
            </div>
            <div class="thought-body" id="c1-thought-body">
              1. Оценил дерево зависимостей: компонент авторизации изолирован.<br>
              2. Назначил воркеров в отдельные git-worktrees для устранения конфликтов слияния.<br>
              3. Запустил Vitest: 12/12 тестов пройдены успешно.
            </div>
          </div>

          <div class="msg">
            <div class="msg-author">
              <span style="color:var(--ai-purple); font-weight:600;">Architect</span>
              <span>14:32</span>
            </div>
            <div class="msg-bubble">
              Коммит <code>e4a19b2</code> готов. Справа открыта карточка с 7 инвариантами и живое превью кнопки. Жду вашего подтверждения.
            </div>
            <div style="display:flex; gap:6px; margin-top:4px;">
              <span class="tool-tag ok">✓ Vitest 12/12</span>
              <span class="tool-tag">📄 TelegramButton.tsx (+42 -0)</span>
            </div>
          </div>
        </div>

        <div class="chat-composer">
          <div class="composer-box">
            <textarea class="composer-input" id="c1-composer-input" placeholder="Поставить задачу Архитектору или всей стае..."></textarea>
            <div class="composer-bar">
              <div class="model-badge" onclick="openProvidersModal()">
                <span>✦ Claude 3.7 Sonnet</span>
                <span style="font-size:9px;">▾</span>
              </div>
              <button class="btn-send" onclick="sendC1Message()">Отправить ↵</button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Center: Agent Fleet Management & Operation Map -->
      <section class="c1-col-fleet">
        <div class="panel-head">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>👥 Командный мостик флота</span>
            <span style="color:var(--text-muted); font-size:11px;">(4 активных воркера)</span>
          </div>
          <button class="btn-ghost-sm" onclick="openAddAgentModal()">+ Добавить воркера</button>
        </div>

        <div class="fleet-scroll">
          
          <div class="section-title">
            <span>Агенты в работе</span>
            <span style="font-size:11px; color:var(--text-muted); font-weight:400;">Изоляция: Git Worktrees</span>
          </div>

          <div class="agent-grid" id="c1-agent-grid">
            <!-- Dynamically populated by JS -->
          </div>

          <!-- Operation Map Stage Progress -->
          <div class="op-map-container">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:#fff; font-size:12.5px;">🗺️ Operation Map · Маршрут проекта</strong>
              <span style="font-size:11px; color:var(--ai-purple); font-weight:600;">Этап 3 из 5: L3</span>
            </div>
            <div class="ladder-steps">
              <div class="ladder-card">
                <span class="ladder-num">L0</span>
                <span class="ladder-name">Идея & ТЗ</span>
                <span style="font-size:10px; color:var(--ok-emerald);">✓ Готово</span>
              </div>
              <div class="ladder-card">
                <span class="ladder-num">L1</span>
                <span class="ladder-name">Архитектура</span>
                <span style="font-size:10px; color:var(--ok-emerald);">✓ Готово</span>
              </div>
              <div class="ladder-card">
                <span class="ladder-num">L2</span>
                <span class="ladder-name">Контракты</span>
                <span style="font-size:10px; color:var(--ok-emerald);">✓ Готово</span>
              </div>
              <div class="ladder-card active">
                <span class="ladder-num">L3</span>
                <span class="ladder-name">Реализация</span>
                <span style="font-size:10px; color:var(--warn-amber);">● В работе</span>
              </div>
              <div class="ladder-card">
                <span class="ladder-num">L4</span>
                <span class="ladder-name">Релиз</span>
                <span style="font-size:10px; color:var(--text-dim);">Ожидает</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      <!-- Right: Decision Passport & Product Preview -->
      <aside class="c1-col-focus">
        <div class="focus-tabs">
          <button class="f-tab active" id="c1-ftab-pass" onclick="switchC1Focus('pass')">📋 Паспорт решения</button>
          <button class="f-tab" id="c1-ftab-prod" onclick="switchC1Focus('prod')">🚀 Живой продукт</button>
          <button class="f-tab" id="c1-ftab-diff" onclick="switchC1Focus('diff')">💻 Дифф кода</button>
        </div>

        <div class="focus-content">
          
          <!-- Passport Card -->
          <div class="passport-card" id="c1-passport-block">
            <div class="passport-head">
              <span class="passport-tag">⚠️ ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА</span>
              <span style="font-size:11px; color:var(--ok-emerald); font-weight:600;">● Vitest: 12/12 OK</span>
            </div>

            <div style="font-weight:700; font-size:13.5px; color:#fff;">
              Слияние кнопки Telegram Auth от Worker #1
            </div>

            <div class="invariants-grid">
              <div class="inv-item">
                <span class="inv-k">📍 ГДЕ</span>
                <span class="inv-v">src/auth/TelegramBtn.tsx</span>
              </div>
              <div class="inv-item">
                <span class="inv-k">⚡ ЧТО</span>
                <span class="inv-v">Виджет беспарольного входа</span>
              </div>
              <div class="inv-item">
                <span class="inv-k">🎯 ЗАЧЕМ</span>
                <span class="inv-v">Конверсия в 1 клик</span>
              </div>
              <div class="inv-item">
                <span class="inv-k">⏱ КОГДА</span>
                <span class="inv-v">Рубеж L3 · Блокирует релиз</span>
              </div>
              <div class="inv-item">
                <span class="inv-k">📦 ОЖИДАЕМ</span>
                <span class="inv-v">Плавный вход без перезагрузки</span>
              </div>
              <div class="inv-item">
                <span class="inv-k">🛡️ РИСКИ</span>
                <span class="inv-v">Нулевые (чистая изоляция)</span>
              </div>
            </div>

            <div class="passport-actions">
              <button class="btn-approve" onclick="approveC1Task()">
                <span>✓ Одобрить слияние</span>
                <span style="font-size:10px; background:rgba(0,0,0,0.2); padding:1px 5px; border-radius:3px;">Space</span>
              </button>
              <button class="btn-ghost-sm" onclick="switchC1Focus('diff')">Дифф</button>
              <button class="btn-ghost-sm" onclick="rejectC1Task()">✕ Отклонить</button>
            </div>
          </div>

          <!-- Product or Diff Area -->
          <div class="preview-container">
            <div class="preview-box">
              <div class="preview-bar">
                <span style="color:var(--ok-emerald);">● LIVE</span>
                <span style="color:#fff;">http://localhost:3000/#/om-map</span>
              </div>
              <iframe class="preview-iframe" id="c1-iframe" src="http://localhost:3000/#/om-map"></iframe>
            </div>
          </div>

        </div>
      </aside>

    </div>
  </section>

  <!-- ════════════ 2. NODE SWARM CANVAS (SPATIAL GRAPH) ════════════ -->
  <section class="concept-page" id="page-c2">
    <div class="c2-layout">
      <div class="canvas-grid-pattern"></div>

      <!-- Top Swarm Density Scaler -->
      <div class="c2-swarm-scaler">
        <span style="font-weight:600; color:#fff;">Стая агентов:</span>
        <input type="range" id="c2-swarm-range" min="3" max="64" value="5" oninput="updateSwarmDensity(this.value)" style="cursor:pointer;">
        <span style="font-family:var(--font-mono); color:var(--ok-emerald); font-weight:700;" id="c2-swarm-val">5 агентов</span>
      </div>

      <!-- Graph Layer -->
      <div class="canvas-node-layer">
        <div class="canvas-graph">
          
          <div class="graph-stage-col">
            <div class="c2-node-card" onclick="selectNode('N1')">
              <div class="node-agent-chip">👑 Orchestrator</div>
              <span style="font-size:10.5px; color:var(--ai-purple); font-weight:700;">STAGE 1 · INTAKE</span>
              <strong style="color:#fff; font-size:13px;">Декомпозиция поручения</strong>
              <span style="font-size:11px; color:var(--text-muted);">Разбиение задачи на 4 параллельных воркера</span>
            </div>
          </div>

          <div class="graph-stage-col">
            <div class="c2-node-card active-stage" onclick="selectNode('N2')">
              <div class="node-agent-chip">⚡ Worker 1 (UI)</div>
              <span style="font-size:10.5px; color:var(--ok-emerald); font-weight:700;">STAGE 2 · FRONTEND</span>
              <strong style="color:#fff; font-size:13px;">Telegram Auth Widget</strong>
              <span style="font-size:11px; color:var(--text-muted);">Модель: DeepSeek-R1 · +42 строки</span>
            </div>
            <div class="c2-node-card" onclick="selectNode('N3')">
              <div class="node-agent-chip">⚡ Worker 2 (API)</div>
              <span style="font-size:10.5px; color:var(--info-cyan); font-weight:700;">STAGE 2 · BACKEND</span>
              <strong style="color:#fff; font-size:13px;">Auth Verification Endpoint</strong>
              <span style="font-size:11px; color:var(--text-muted);">Модель: Claude 3.7 · эндпоинт готов</span>
            </div>
          </div>

          <div class="graph-stage-col">
            <div class="c2-node-card" onclick="selectNode('N4')">
              <div class="node-agent-chip">🧐 Reviewer</div>
              <span style="font-size:10.5px; color:var(--warn-amber); font-weight:700;">STAGE 3 · QUALITY GATE</span>
              <strong style="color:#fff; font-size:13px;">Конституция & 5 Проходов</strong>
              <span style="font-size:11px; color:var(--text-muted);">Модель: o3-mini · 12/12 тестов OK</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Floating Chat Island (Bottom Left) -->
      <div class="c2-floating-chat">
        <div class="panel-head" style="background:rgba(0,0,0,0.3);">
          <span>💬 Чат проекта</span>
          <span style="font-size:11px; color:var(--text-muted);">Esc свернуть</span>
        </div>
        <div class="chat-stream" id="c2-chat-stream">
          <div class="msg">
            <div class="msg-author"><span style="color:var(--ai-purple);">Orchestrator</span></div>
            <div class="msg-bubble" style="font-size:12px;">Стая распределена по 3 узлам графа. Кликните любой узел для фокуса.</div>
          </div>
        </div>
        <div class="chat-composer">
          <div class="composer-box">
            <input class="composer-input" id="c2-input" placeholder="Указание для стаи..." style="height:32px;">
          </div>
        </div>
      </div>

      <!-- Floating Inspector (Bottom Right) -->
      <div class="c2-floating-inspector">
        <div class="panel-head" style="background:rgba(0,0,0,0.3);">
          <span id="c2-insp-title">🔍 Инспектор узла: STAGE 2 (UI)</span>
          <button class="btn-ghost-sm" style="padding:2px 8px; font-size:10.5px;" onclick="approveC1Task()">Одобрить (Space)</button>
        </div>
        <div style="flex:1; padding:14px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
          <div class="invariants-grid">
            <div class="inv-item"><span class="inv-k">ГДЕ</span><span class="inv-v">TelegramBtn.tsx</span></div>
            <div class="inv-item"><span class="inv-k">ЧТО</span><span class="inv-v">Кнопка входа</span></div>
            <div class="inv-item"><span class="inv-k">ОЖИДАЕМ</span><span class="inv-v">1-клик вход</span></div>
            <div class="inv-item"><span class="inv-k">РИСКИ</span><span class="inv-v">Изолирован</span></div>
          </div>
          <div style="font-weight:600; font-size:12px; color:#fff;">Живое превью продукта:</div>
          <iframe src="http://localhost:3000/#/om-map" style="flex:1; border:1px solid var(--border); border-radius:6px; min-height:180px;"></iframe>
        </div>
      </div>

    </div>
  </section>

  <!-- ════════════ 3. ZEN DIRECTOR (ZERO-NOISE FOCUS) ════════════ -->
  <section class="concept-page" id="page-c3">
    <div class="c3-layout">
      
      <div class="c3-centered-stream" id="c3-stream">
        
        <div class="c3-message">
          <div class="c3-author ai">✦ Ведущий Архитектор</div>
          <div class="c3-prose">
            Я сформировал команду из 4 воркеров и провел реализацию рубежа <strong>L3 (Авторизация и витрина)</strong>.
            Фронтенд закончил кнопку входа, бэкенд поднял верификацию, тесты полностью пройдены.
          </div>
        </div>

        <!-- Decision Box -->
        <div class="c3-decision-panel">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:700; color:var(--warn-amber); text-transform:uppercase;">ТРЕБУЕТСЯ ВАШЕ ПОДТВЕРЖДЕНИЕ</span>
            <span style="color:var(--ok-emerald); font-weight:600; font-size:11.5px;">✓ 12/12 тестов ОК</span>
          </div>

          <h2 style="font-size:18px; color:#fff;">Слияние кнопки Telegram Auth в ветку main</h2>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12.5px;">
            <div><strong>Где:</strong> <code>src/auth/TelegramBtn.tsx</code></div>
            <div><strong>Что:</strong> Нативный компонент авторизации</div>
            <div><strong>Зачем:</strong> Вход без ввода логина и пароля</div>
            <div><strong>Риски:</strong> Нулевые (чистый изолированный worktree)</div>
          </div>

          <div style="display:flex; gap:12px; margin-top:8px;">
            <button class="btn-approve" style="padding:12px; font-size:13px;" onclick="approveC1Task()">
              <span>✓ ОДОБРИТЬ СЛИЯНИЕ (Нажмите Пробел)</span>
            </button>
            <button class="btn-ghost-sm" onclick="openDrawer()">👥 Управление флотом (4 агента)</button>
          </div>
        </div>

      </div>

      <!-- Floating Composer -->
      <div class="c3-floating-composer">
        <input class="c3-input" id="c3-input" placeholder="Напишите указание Архитектору...">
        <button class="btn-send" onclick="sendC3Message()">Отправить ↵</button>
      </div>

      <!-- Bottom Strip -->
      <div class="c3-bottom-strip">
        <span onclick="openDrawer()" style="cursor:pointer; color:var(--ai-purple); font-weight:600;">👥 4 агента активны (открыть флот)</span>
        <span>🗺️ Этап L3 (68% завершено)</span>
        <span>💰 $0.18 за сессию</span>
        <span onclick="openProvidersModal()" style="cursor:pointer;">⚙️ Провайдеры: 4 активны</span>
      </div>

    </div>
  </section>

</main>

<!-- ════════════ MODAL: ADD AGENT (FLEET MANAGEMENT) ════════════ -->
<div class="modal-overlay" id="modal-add-agent">
  <div class="modal-dialog">
    <div class="modal-head">
      <div class="modal-title">+ Создать и назначить агента</div>
      <button class="btn-close" onclick="closeModals()">✕</button>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Быстрые шаблоны ролей:</label>
        <div class="role-pills">
          <span class="role-pill selected" onclick="pickRole(this, 'Frontend Specialist', 'UI, компоненты, верстка')">🎨 Frontend</span>
          <span class="role-pill" onclick="pickRole(this, 'Backend Engineer', 'API, роуты, базы данных')">⚡ Backend</span>
          <span class="role-pill" onclick="pickRole(this, 'Security Auditor', '5 проходов, аудит утечек')">🛡️ Security</span>
          <span class="role-pill" onclick="pickRole(this, 'Test Runner', 'Vitest, E2E тесты')">🧪 QA & Tests</span>
          <span class="role-pill" onclick="pickRole(this, 'Doc Writer', 'CJM, спецификации')">📝 Docs</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Имя агента и роль:</label>
        <input class="form-input" id="new-agent-name" value="Worker #5 · Frontend Specialist">
      </div>

      <div class="form-group">
        <label class="form-label">Провайдер интеллекта:</label>
        <select class="form-select" id="new-agent-provider" onchange="updateModelSelect(this.value)">
          <option value="anthropic">Anthropic (Claude Direct API)</option>
          <option value="deepseek">DeepSeek (Direct API)</option>
          <option value="openai">OpenAI (Codex / o3-mini / GPT-4o)</option>
          <option value="ollama">Ollama (Локально на Mac M3 Max, $0.00)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Модель:</label>
        <select class="form-select" id="new-agent-model">
          <option value="Claude 3.7 Sonnet">Claude 3.7 Sonnet (Рекомендуется для кода)</option>
          <option value="Claude 3.5 Haiku">Claude 3.5 Haiku (Быстрая)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Поручение для агента:</label>
        <input class="form-input" id="new-agent-task" value="Оптимизация мобильных отступов и темной темы">
      </div>

      <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-muted);">
        <input type="checkbox" id="new-agent-worktree" checked>
        <label for="new-agent-worktree">Изолированный Git Worktree (защита от порчи файлов)</label>
      </div>

      <button class="btn-header primary" style="padding:10px; margin-top:8px; justify-content:center;" onclick="confirmAddAgent()">
        🚀 Запустить агента во флот
      </button>
    </div>
  </div>
</div>

<!-- ════════════ MODAL: PROVIDERS & KEYS ════════════ -->
<div class="modal-overlay" id="modal-providers">
  <div class="modal-dialog">
    <div class="modal-head">
      <div class="modal-title">⚙️ Подключенные провайдеры моделей</div>
      <button class="btn-close" onclick="closeModals()">✕</button>
    </div>

    <div class="modal-body">
      <div style="display:flex; flex-direction:column; gap:10px;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:10px 12px; border-radius:6px; border:1px solid var(--border);">
          <div>
            <strong style="color:#fff;">Anthropic</strong>
            <div style="font-size:11px; color:var(--text-muted);">Claude 3.7 Sonnet, Haiku · API Key активен</div>
          </div>
          <span style="color:var(--ok-emerald); font-weight:700; font-size:11.5px;">✓ ПОДКЛЮЧЕНО</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:10px 12px; border-radius:6px; border:1px solid var(--border);">
          <div>
            <strong style="color:#fff;">DeepSeek</strong>
            <div style="font-size:11px; color:var(--text-muted);">DeepSeek-R1 (DeepThink), V3 · API Key активен</div>
          </div>
          <span style="color:var(--ok-emerald); font-weight:700; font-size:11.5px;">✓ ПОДКЛЮЧЕНО</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:10px 12px; border-radius:6px; border:1px solid var(--border);">
          <div>
            <strong style="color:#fff;">OpenAI</strong>
            <div style="font-size:11px; color:var(--text-muted);">o3-mini, GPT-4o · API Key активен</div>
          </div>
          <span style="color:var(--ok-emerald); font-weight:700; font-size:11.5px;">✓ ПОДКЛЮЧЕНО</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:10px 12px; border-radius:6px; border:1px solid var(--border);">
          <div>
            <strong style="color:#fff;">Ollama (Локальный сервер)</strong>
            <div style="font-size:11px; color:var(--text-muted);">http://localhost:11434 · Llama 3.3, Qwen 2.5 Coder (Mac M3 Max)</div>
          </div>
          <span style="color:var(--ok-emerald); font-weight:700; font-size:11.5px;">✓ ЛОКАЛЬНО ($0)</span>
        </div>

      </div>

      <button class="btn-ghost-sm" style="margin-top:6px; justify-content:center;" onclick="closeModals()">
        Закрыть настройки
      </button>
    </div>
  </div>
</div>

<!-- ════════════ DRAWER FOR CONCEPT 3 ════════════ -->
<div class="drawer-bottom" id="zen-drawer">
  <div class="modal-head">
    <div class="modal-title">👥 Флот агентов в работе (Рубеж L3)</div>
    <button class="btn-close" onclick="closeDrawer()">✕</button>
  </div>
  <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-top:14px; overflow-y:auto;" id="zen-drawer-grid">
    <!-- Populated by JS -->
  </div>
</div>

<!-- ════════════ JAVASCRIPT APP LOGIC ════════════ -->
<script>
// State Store
const state = {
  activeConcept: 'c1',
  agents: [
    { id: 'a1', name: '👑 Orchestrator', role: 'Координатор проекта', provider: 'Anthropic', model: 'Claude 3.7 Sonnet', status: 'running', task: 'Координация рубежа L3 и декомпозиция задач', tokens: 4120, cost: '$0.06', icon: 'icon-orch' },
    { id: 'a2', name: '🧐 Reviewer', role: 'Аудит и Конституция', provider: 'OpenAI', model: 'o3-mini', status: 'waiting', task: 'Проверка 5 проходов и запуск Vitest 12/12', tokens: 1840, cost: '$0.02', icon: 'icon-rev' },
    { id: 'a3', name: '⚡ Worker 1 (UI)', role: 'Frontend Specialist', provider: 'DeepSeek', model: 'DeepSeek-R1', status: 'running', task: 'Вёрстка виджета Telegram в TelegramBtn.tsx', tokens: 2400, cost: '$0.01', icon: 'icon-work' },
    { id: 'a4', name: '⚡ Worker 2 (API)', role: 'Backend Engineer', provider: 'Anthropic', model: 'Claude 3.7 Sonnet', status: 'running', task: 'Маршрут валидации хэша Telegram в /api/auth', tokens: 3100, cost: '$0.04', icon: 'icon-work' },
    { id: 'a5', name: '⚡ Worker 3 (Security)', role: 'Local Security Checker', provider: 'Ollama', model: 'Llama 3.3 70B', status: 'idle', task: 'Локальный аудит приватности и утечек секретов', tokens: 5200, cost: '$0.00', icon: 'icon-work' }
  ]
};

// Switch Concept
function switchConcept(cName) {
  state.activeConcept = cName;
  document.querySelectorAll('.c-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.concept-page').forEach(p => p.classList.remove('active'));

  const pill = document.getElementById('pill-' + cName);
  const page = document.getElementById('page-' + cName);
  if (pill) pill.classList.add('active');
  if (page) page.classList.add('active');
}

// Render Agents Grid
function renderAgents() {
  const grid = document.getElementById('c1-agent-grid');
  const drawerGrid = document.getElementById('zen-drawer-grid');
  if (!grid) return;

  const html = state.agents.map(a => `
    <div class="agent-card ${a.status === 'running' ? 'active-work' : ''}">
      <div class="agent-top">
        <div class="agent-identity">
          <div class="agent-icon ${a.icon || 'icon-work'}">${a.name.substring(0, 2)}</div>
          <div>
            <div class="agent-name">${a.name}</div>
            <div class="agent-role">${a.role}</div>
          </div>
        </div>
        <span class="agent-status-badge ${a.status === 'running' ? 'status-running' : (a.status === 'waiting' ? 'status-waiting' : 'status-idle')}">
          ${a.status === 'running' ? '● В работе' : (a.status === 'waiting' ? '● Ждет ревью' : '○ Готов')}
        </span>
      </div>

      <div class="agent-model-pill" onclick="openProvidersModal()">
        <span>${a.provider}: ${a.model}</span>
        <span>⚙️</span>
      </div>

      <div class="agent-task-desc">${a.task}</div>

      <div class="agent-foot">
        <span>Токены: ${a.tokens} (${a.cost})</span>
        <button class="btn-ghost-sm" style="padding:2px 6px; font-size:10px;" onclick="cycleAgentStatus('${a.id}')">
          ${a.status === 'running' ? 'Пауза' : 'Пуск'}
        </button>
      </div>
    </div>
  `).join('');

  grid.innerHTML = html;
  if (drawerGrid) drawerGrid.innerHTML = html;

  document.getElementById('agents-count-header').innerHTML = `👥 <strong>${state.agents.length} агентов</strong> во флоте`;
}

function cycleAgentStatus(id) {
  const ag = state.agents.find(a => a.id === id);
  if (!ag) return;
  ag.status = ag.status === 'running' ? 'idle' : 'running';
  renderAgents();
}

// Focus tabs in Concept 1
function switchC1Focus(tab) {
  document.querySelectorAll('.f-tab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('c1-ftab-' + tab);
  if (btn) btn.classList.add('active');

  const pass = document.getElementById('c1-passport-block');
  const frame = document.getElementById('c1-iframe');
  if (tab === 'pass') {
    pass.style.display = 'flex';
  } else if (tab === 'prod') {
    pass.style.display = 'none';
    frame.src = 'http://localhost:3000/#/om-map';
  } else if (tab === 'diff') {
    pass.style.display = 'none';
    frame.src = 'http://localhost:8766/core/workbench-unified.html#code';
  }
}

// CoT toggle
function toggleC1Thought() {
  const b = document.getElementById('c1-thought-body');
  const a = document.getElementById('c1-thought-arr');
  if (b.style.display === 'none') {
    b.style.display = 'block';
    a.textContent = '▾';
  } else {
    b.style.display = 'none';
    a.textContent = '▸';
  }
}

// Approve / Reject Task
function approveC1Task() {
  const card = document.getElementById('c1-passport-block');
  if (card) {
    card.style.transition = 'all 200ms ease';
    card.style.opacity = '0.3';
    card.style.pointerEvents = 'none';
  }

  // Add confirmation message to chat
  addMessage('Вы (Владелец)', 'Одобрил слияние кнопки Telegram Auth. Влито в ветку main.');
  setTimeout(() => {
    addMessage('✦ Architect', 'Принято! Коммит влит. Worker 1 переведен на задачу мобильной адаптации.');
    if (card) card.style.display = 'none';
  }, 500);
}

function rejectC1Task() {
  addMessage('Вы (Владелец)', 'Отклонил слияние: требуется доработать анимацию нажатия кнопки.');
}

function addMessage(author, text) {
  const stream = document.getElementById('c1-chat-stream');
  if (!stream) return;
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `
    <div class="msg-author"><span style="color:#fff;">${author}</span> <span>Только что</span></div>
    <div class="msg-bubble">${text}</div>
  `;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}

function sendC1Message() {
  const inp = document.getElementById('c1-composer-input');
  const t = inp.value.trim();
  if (!t) return;
  addMessage('Вы (Владелец)', t);
  inp.value = '';
  setTimeout(() => {
    addMessage('✦ Architect', 'Поручение принято в работу: «' + t + '». Назначаю свободного воркера.');
  }, 600);
}

function sendC3Message() {
  const inp = document.getElementById('c3-input');
  const t = inp.value.trim();
  if (!t) return;
  const stream = document.getElementById('c3-stream');
  const div = document.createElement('div');
  div.className = 'c3-message';
  div.innerHTML = `<div class="c3-author" style="color:#fff;">Вы</div><div class="c3-prose">${t}</div>`;
  stream.appendChild(div);
  inp.value = '';
  setTimeout(() => {
    const r = document.createElement('div');
    r.className = 'c3-message';
    r.innerHTML = `<div class="c3-author ai">✦ Ведущий Архитектор</div><div class="c3-prose">Понял вас. Задача направлена воркеру.</div>`;
    stream.appendChild(r);
    stream.scrollTop = stream.scrollHeight;
  }, 600);
}

// Swarm density scaler for Concept 2
function updateSwarmDensity(val) {
  document.getElementById('c2-swarm-val').textContent = val + ' агентов';
}

function selectNode(nId) {
  document.getElementById('c2-insp-title').textContent = '🔍 Инспектор узла: ' + nId;
}

// Modals
function openAddAgentModal() {
  document.getElementById('modal-add-agent').classList.add('open');
}
function openProvidersModal() {
  document.getElementById('modal-providers').classList.add('open');
}
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

function pickRole(el, name, task) {
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('new-agent-name').value = `Worker #${state.agents.length + 1} · ${name}`;
  document.getElementById('new-agent-task').value = task;
}

function updateModelSelect(provider) {
  const sel = document.getElementById('new-agent-model');
  sel.innerHTML = '';
  if (provider === 'anthropic') {
    sel.innerHTML = '<option value="Claude 3.7 Sonnet">Claude 3.7 Sonnet (Рекомендуется)</option><option value="Claude 3.5 Haiku">Claude 3.5 Haiku</option>';
  } else if (provider === 'deepseek') {
    sel.innerHTML = '<option value="DeepSeek-R1">DeepSeek-R1 (DeepThink)</option><option value="DeepSeek-V3">DeepSeek-V3 (Fast Coder)</option>';
  } else if (provider === 'openai') {
    sel.innerHTML = '<option value="o3-mini">o3-mini (High Reasoning)</option><option value="GPT-4o">GPT-4o</option>';
  } else if (provider === 'ollama') {
    sel.innerHTML = '<option value="Llama 3.3 70B">Llama 3.3 70B (Local M3 Max)</option><option value="Qwen 2.5 Coder">Qwen 2.5 Coder 32B</option>';
  }
}

function confirmAddAgent() {
  const name = document.getElementById('new-agent-name').value;
  const prov = document.getElementById('new-agent-provider');
  const provName = prov.options[prov.selectedIndex].text.split(' ')[0];
  const model = document.getElementById('new-agent-model').value;
  const task = document.getElementById('new-agent-task').value;

  state.agents.push({
    id: 'a' + (state.agents.length + 1),
    name: name,
    role: 'Специалист стаи',
    provider: provName,
    model: model,
    status: 'running',
    task: task,
    tokens: 0,
    cost: '$0.00',
    icon: 'icon-work'
  });

  closeModals();
  renderAgents();
}

// Drawer for C3
function openDrawer() {
  document.getElementById('zen-drawer').classList.add('open');
}
function closeDrawer() {
  document.getElementById('zen-drawer').classList.remove('open');
}

// Hotkeys
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === '1') switchConcept('c1');
  if (e.key === '2') switchConcept('c2');
  if (e.key === '3') switchConcept('c3');
  if (e.key === ' ') {
    e.preventDefault();
    approveC1Task();
  }
  if (e.key === 'Escape') {
    closeModals();
    closeDrawer();
  }
});

// Init
function applyHash(h) {
  closeModals();
  closeDrawer();
  if (['c1', 'c2', 'c3'].includes(h)) {
    switchConcept(h);
  } else if (h === 'modal-agent') {
    switchConcept('c1');
    openAddAgentModal();
  } else if (h === 'modal-providers') {
    switchConcept('c1');
    openProvidersModal();
  } else if (h === 'drawer-c3') {
    switchConcept('c3');
    openDrawer();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  renderAgents();
  const initHash = location.hash.replace('#', '');
  if (initHash) applyHash(initHash);
});

window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (h) applyHash(h);
});
</script>
</body>
</html>
'''

with open(TARGET_HTML, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Successfully generated Awards 2026-2027 Platform to {TARGET_HTML}")
