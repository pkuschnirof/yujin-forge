/**
 * Yujin Forge -- chat panel HTML.
 *
 * Generated as a single self-contained HTML string that the
 * chat server serves at GET /. No framework, no build step --
 * the panel runs inside any modern browser.
 *
 * Three modes (memory rule yujin_assistant_3_modes from Yujin
 * Koe), persisted in localStorage:
 *
 *   globito       small floating bubble bottom-right
 *   ventana chica 360x560 panel: chat history + input
 *   ventana grande overlay: chat left, project preview right
 *
 * Voice button is rendered but disabled with a tooltip ('voice
 * arrives in v1.0') until the SPEC 5 voice integration lands.
 */
import { VERSION } from '../version.js';

export interface PanelConfig {
  projectRoot: string;
  projectName: string;
  port: number;
}

export function renderPanelHtml(cfg: PanelConfig): string {
  // Inject runtime config via a <script> block. NEVER use string
  // interpolation for user-controlled values in the HTML body --
  // we control all inputs here (projectRoot + projectName come
  // from the local filesystem, port is a number) but the JSON
  // wrapper keeps the boundary clean.
  const runtimeConfig = JSON.stringify({
    projectName: cfg.projectName,
    projectRoot: cfg.projectRoot,
    port:        cfg.port,
    version:     VERSION,
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yujin Forge -- chat (${escapeHtml(cfg.projectName)})</title>
<style>
:root {
  --bg-1: #f5f0e6; --bg-2: #e0d8c4;
  --ink: #1a1a1a; --ink-muted: #555; --ink-subtle: rgba(0,0,0,0.55);
  --indigo: #4f5b87; --amber: #c8a04d;
  --border: #d4cbb8; --border-subtle: rgba(0,0,0,0.08);
  --ok: #3fa85e; --err: #8b3530; --warn: #d4950a;
  --bubble-user: #4f5b87; --bubble-asst: #ffffff;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(135deg, var(--bg-1), var(--bg-2));
  color: var(--ink); line-height: 1.5;
}
.kanji { font-family: "Noto Serif JP", serif; color: var(--amber); }

/* ---- globito (collapsed) ---- */
#yf-globito {
  position: fixed; bottom: 16px; right: 16px;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--indigo); color: white;
  display: flex; align-items: center; justify-content: center;
  font-family: "Noto Serif JP", serif; font-size: 26px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.18);
  cursor: pointer; border: 0; z-index: 100;
  transition: transform .12s ease;
}
#yf-globito:hover { transform: scale(1.05); }

/* ---- mini (ventana chica) ---- */
#yf-mini {
  position: fixed; bottom: 16px; right: 16px;
  width: 360px; height: 560px;
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,0.18);
  display: flex; flex-direction: column; overflow: hidden;
  z-index: 100;
}

/* ---- full (ventana grande) ---- */
#yf-full {
  position: fixed; inset: 16px;
  background: rgba(26,26,26,0.35); backdrop-filter: blur(6px);
  display: flex; align-items: stretch; justify-content: center;
  z-index: 200;
}
#yf-full .panel {
  display: flex; flex-direction: column;
  width: 100%; max-width: 1200px;
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 12px 36px rgba(0,0,0,0.18);
}
#yf-full .body {
  display: flex; flex: 1; min-height: 0;
}
#yf-full .body .chat-col {
  width: 420px; flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border);
}
#yf-full .body .pizarra {
  flex: 1; min-width: 0; background: white;
  display: flex; align-items: center; justify-content: center;
  padding: 32px; text-align: center;
}
#yf-full .body .pizarra h3 { margin-bottom: 8px; }
#yf-full .body .pizarra p { color: var(--ink-muted); max-width: 440px; }
#yf-full .body .pizarra .kanji-big { font-size: 96px; opacity: 0.4; }

/* ---- shared header ---- */
.header {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--indigo); color: white;
  padding: 10px 12px; flex-shrink: 0;
}
.header .brand { display: flex; gap: 8px; align-items: center; }
.header .brand .k { font-family: "Noto Serif JP", serif; font-size: 22px; line-height: 1; }
.header .brand .t { display: flex; flex-direction: column; line-height: 1.1; }
.header .brand .t .name { font-size: 14px; font-weight: 600; }
.header .brand .t .proj { font-size: 11px; opacity: 0.8; }
.header .actions { display: flex; gap: 4px; }
.header .actions button {
  background: rgba(255,255,255,0.1); color: white;
  border: 0; padding: 6px 8px; border-radius: 4px;
  font-size: 12px; cursor: pointer;
}
.header .actions button:hover { background: rgba(255,255,255,0.2); }

/* ---- chat stream ---- */
.stream { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.empty { color: var(--ink-muted); text-align: center; padding: 32px 16px; }
.empty .k { font-size: 56px; }
.bubble { max-width: 80%; padding: 9px 12px; border-radius: 14px; font-size: 14px; word-wrap: break-word; }
.bubble.user { align-self: flex-end;
  background: var(--bubble-user); color: white; border-bottom-right-radius: 4px; }
.bubble.asst { align-self: flex-start;
  background: var(--bubble-asst); color: var(--ink);
  border: 1px solid var(--border); border-bottom-left-radius: 4px;
}
.bubble pre { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
  background: rgba(0,0,0,0.05); padding: 8px; border-radius: 6px; overflow-x: auto; margin: 4px 0; }
.bubble code { font-family: ui-monospace, monospace; background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.thinking { display: flex; gap: 4px; }
.thinking span { width: 6px; height: 6px; border-radius: 50%; background: var(--indigo); opacity: 0.4; animation: pulse 1s infinite; }
.thinking span:nth-child(2) { animation-delay: 0.15s; }
.thinking span:nth-child(3) { animation-delay: 0.3s; }
@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

/* ---- input bar ---- */
.bar { border-top: 1px solid var(--border-subtle); background: white;
  padding: 8px; display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.bar input { flex: 1; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 6px; font-size: 14px; font-family: inherit; }
.bar input:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px rgba(79,91,135,0.12); }
.bar .mic, .bar .send {
  border: 0; border-radius: 50%; width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: white;
}
.bar .mic { background: #aaa; cursor: not-allowed; }
.bar .send { background: var(--indigo); padding: 0 12px; width: auto; border-radius: 6px;
  font-size: 13px; font-weight: 600; }
.bar .send:disabled { background: #aaa; cursor: not-allowed; }

/* ---- status row ---- */
.status { font-size: 11px; color: var(--ink-muted); padding: 4px 12px; text-align: center; flex-shrink: 0; }
.status.err { color: var(--err); }

/* ---- hidden helper ---- */
.hidden { display: none !important; }
</style>
</head>
<body>

<button id="yf-globito" title="Hablar con Yujin Forge">侑</button>

<div id="yf-mini" class="hidden">
  <div class="header">
    <div class="brand">
      <span class="k">侑</span>
      <div class="t"><span class="name">Yujin Forge</span><span class="proj" id="proj-mini"></span></div>
    </div>
    <div class="actions">
      <button id="mini-full" title="Maximizar">⛶</button>
      <button id="mini-close" title="Cerrar">✕</button>
    </div>
  </div>
  <div id="stream-mini" class="stream"></div>
  <div class="status" id="status-mini"></div>
  <form id="bar-mini" class="bar" onsubmit="return false">
    <button type="button" class="mic" title="Voz disponible en v1.0">🎙</button>
    <input type="text" placeholder="Pregúntale a Yujin" autocomplete="off">
    <button type="submit" class="send">Enviar</button>
  </form>
</div>

<div id="yf-full" class="hidden">
  <div class="panel">
    <div class="header">
      <div class="brand">
        <span class="k">侑</span>
        <div class="t"><span class="name">Yujin Forge</span><span class="proj" id="proj-full"></span></div>
      </div>
      <div class="actions">
        <button id="full-mini" title="Reducir">▭</button>
        <button id="full-close" title="Cerrar">✕</button>
      </div>
    </div>
    <div class="body">
      <div class="chat-col">
        <div id="stream-full" class="stream"></div>
        <div class="status" id="status-full"></div>
        <form id="bar-full" class="bar" onsubmit="return false">
          <button type="button" class="mic" title="Voz disponible en v1.0">🎙</button>
          <input type="text" placeholder="Pregúntale a Yujin" autocomplete="off">
          <button type="submit" class="send">Enviar</button>
        </form>
      </div>
      <div class="pizarra">
        <div>
          <div class="kanji-big">空</div>
          <h3>Pizarra</h3>
          <p>Acá viste la preview del proyecto en vivo cuando Yujin
             aplique cambios al código. Por ahora el chat solo
             sugiere.</p>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const CONFIG = ${runtimeConfig};
const MODE_KEY = 'yf-chat-mode';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let state = {
  mode: 'globito',
  messages: [],
  busy: false,
};

function loadMode() {
  const m = localStorage.getItem(MODE_KEY);
  return (m === 'mini' || m === 'full' || m === 'globito') ? m : 'globito';
}
function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (_) {} }

function showMode(mode) {
  state.mode = mode;
  saveMode(mode);
  $('#yf-globito').classList.toggle('hidden', mode !== 'globito');
  $('#yf-mini').classList.toggle('hidden',    mode !== 'mini');
  $('#yf-full').classList.toggle('hidden',    mode !== 'full');
  if (mode !== 'globito') {
    setTimeout(() => $('#bar-' + (mode === 'full' ? 'full' : 'mini') + ' input').focus(), 30);
  }
}

function setProj() {
  const txt = CONFIG.projectName + ' ' + 'v' + CONFIG.version;
  $('#proj-mini').textContent = txt;
  $('#proj-full').textContent = txt;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Tiny markdown subset for assistant bubbles. */
function renderMd(src) {
  let out = escapeHtml(src);
  out = out.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g,
    (_, code) => '<pre>' + code.trim() + '</pre>');
  out = out.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  out = out.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  out = out.replace(/\\n/g, '<br>');
  return out;
}

function renderStream() {
  for (const target of [$('#stream-mini'), $('#stream-full')]) {
    target.innerHTML = '';
    if (state.messages.length === 0) {
      target.innerHTML = '<div class="empty"><div class="kanji k">侑仁</div><p>Yujin Forge en línea. Pediles cambios al proyecto.</p></div>';
    } else {
      for (const m of state.messages) {
        const div = document.createElement('div');
        div.className = 'bubble ' + m.role;
        if (m.role === 'assistant') div.innerHTML = renderMd(m.content);
        else div.textContent = m.content;
        target.appendChild(div);
      }
    }
    if (state.busy) {
      const d = document.createElement('div');
      d.className = 'bubble asst';
      d.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>';
      target.appendChild(d);
    }
    target.scrollTop = target.scrollHeight;
  }
}

function setStatus(text, isErr) {
  for (const id of ['#status-mini', '#status-full']) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
  }
}

function setBusy(b) {
  state.busy = b;
  for (const sel of ['#bar-mini .send', '#bar-full .send', '#bar-mini input', '#bar-full input']) {
    const el = $(sel);
    if (el) el.disabled = b;
  }
  renderStream();
}

async function send(text) {
  text = text.trim();
  if (!text || state.busy) return;
  state.messages.push({ role: 'user', content: text });
  renderStream();
  setBusy(true);
  setStatus('');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: state.messages }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || ('HTTP ' + res.status), true);
      // Drop the unanswered user message so the user can retry.
      state.messages.pop();
      return;
    }
    state.messages.push({ role: 'assistant', content: data.message.text });
  } catch (err) {
    setStatus(String(err && err.message ? err.message : err), true);
    state.messages.pop();
  } finally {
    setBusy(false);
  }
}

function attachBar(form) {
  const input = form.querySelector('input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    send(v);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setProj();
  showMode(loadMode());
  $('#yf-globito').addEventListener('click', () => showMode('mini'));
  $('#mini-full').addEventListener('click', () => showMode('full'));
  $('#mini-close').addEventListener('click', () => showMode('globito'));
  $('#full-mini').addEventListener('click', () => showMode('mini'));
  $('#full-close').addEventListener('click', () => showMode('globito'));
  attachBar($('#bar-mini'));
  attachBar($('#bar-full'));
  renderStream();
});
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
