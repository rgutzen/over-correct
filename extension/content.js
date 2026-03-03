/* Over-Correct — content script
   Depends on: shared/chaos.js  (ocApplyChaos)
               shared/prompts.js (ocGetPrompts) */

// ─── Floating badge (Shadow DOM for style isolation) ───────────────
const host = document.createElement('div');
host.id = 'oc-host';
Object.assign(host.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none' });
document.documentElement.appendChild(host);

const shadow = host.attachShadow({ mode: 'closed' });

const styleEl = document.createElement('style');
styleEl.textContent = `
  :host { all: initial; }
  .badge {
    display: flex; align-items: center; gap: 5px;
    background: #1a1710; border: 1px solid #38311e;
    border-radius: 20px; padding: 4px 10px 4px 7px;
    font: 500 11px/1 'Courier New', monospace;
    color: #ede8d8; cursor: pointer; pointer-events: all;
    user-select: none; transition: border-color .15s, opacity .15s;
    box-shadow: 0 2px 8px rgba(0,0,0,.5);
    opacity: 0; transform: translateY(4px);
    transition: opacity .15s, transform .15s, border-color .15s;
  }
  .badge.visible  { opacity: 1; transform: translateY(0); }
  .badge.spinning .dot { animation: spin .6s linear infinite; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #e8b84b; flex-shrink: 0;
    transition: background .3s;
  }
  .dot.chaos       { background: #e05a38; }
  .dot.hallucinate { background: #b57bf7; }
  .dot.neutral     { background: #7a6d55; }
  @keyframes spin { to { transform: rotate(360deg); border-radius: 2px; } }
`;
shadow.appendChild(styleEl);

const badge = document.createElement('div');
badge.className = 'badge';
badge.innerHTML = '<span class="dot"></span><span class="label">OC</span>';
shadow.appendChild(badge);

const dot   = badge.querySelector('.dot');
const label = badge.querySelector('.label');

// ─── Badge positioning ─────────────────────────────────────────────
let activeEl = null;
let rafId    = null;

function positionBadge() {
  if (!activeEl || !document.contains(activeEl)) { hideBadge(); return; }
  const r = activeEl.getBoundingClientRect();
  // Clamp inside viewport with 8px margin
  const bW = 80, bH = 30;
  const left = Math.min(r.right - bW, window.innerWidth  - bW - 8);
  const top  = Math.min(r.bottom - bH - 6, window.innerHeight - bH - 8);
  host.style.left = `${Math.max(8, left)}px`;
  host.style.top  = `${Math.max(8, top)}px`;
}

function showBadge(el) {
  activeEl = el;
  badge.classList.add('visible');
  positionBadge();
}

function hideBadge() {
  badge.classList.remove('visible');
  activeEl = null;
}

// Reposition on scroll/resize
window.addEventListener('scroll', positionBadge, { passive: true, capture: true });
window.addEventListener('resize', positionBadge, { passive: true });

// ─── Detect editable fields ────────────────────────────────────────
function isEditable(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    return ['', 'text', 'search', 'email', 'url', 'tel'].includes(el.type ?? '');
  }
  return el.isContentEditable;
}

document.addEventListener('focusin', (e) => {
  if (isEditable(e.target)) showBadge(e.target);
}, true);

document.addEventListener('focusout', () => {
  // Small delay so a click on the badge doesn't immediately hide it
  setTimeout(() => {
    if (!shadow.contains(document.activeElement)) hideBadge();
  }, 150);
}, true);

// ─── Read / write text fields ──────────────────────────────────────
function getFieldText(el) {
  if (el.isContentEditable) return el.innerText;
  return el.value ?? '';
}

function setFieldText(el, text) {
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
  } else {
    // Trigger React/Vue/Angular synthetic events via the native setter
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ─── Dial color helper ─────────────────────────────────────────────
function dialClass(v) {
  if (v < -0.5) return 'chaos';
  if (v < 0.5)  return 'neutral';
  if (v > 3)    return 'hallucinate';
  return '';
}

// ─── Trigger Over-Correct ──────────────────────────────────────────
let currentPort = null;

async function triggerOverCorrect() {
  const el = activeEl || document.activeElement;
  if (!isEditable(el)) return;

  const text = getFieldText(el);
  if (!text.trim()) return;

  // Read current dial from storage
  const { dial = 1 } = await chrome.storage.sync.get('dial');
  const v = parseFloat(dial);

  // Chaos: runs locally, no LLM needed
  if (v < 0) {
    const result = ocApplyChaos(text, v);
    setFieldText(el, result);
    flashBadge('done');
    return;
  }

  // Pass-through
  if (v === 0) { flashBadge('done'); return; }

  // LLM path via background port
  if (currentPort) { try { currentPort.disconnect(); } catch {} }

  const [system, user] = ocGetPrompts(text, v);
  const maxTokens = Math.max(256, Math.min(2048, Math.floor(text.length * 3 / 8)));

  badge.classList.add('spinning');
  label.textContent = '…';

  let accumulated = '';
  const targetEl = el; // capture in case focus changes

  currentPort = chrome.runtime.connect({ name: 'oc-stream' });
  currentPort.postMessage({ type: 'process', system, user, maxTokens });

  currentPort.onMessage.addListener((msg) => {
    if (msg.type === 'chunk') {
      accumulated += msg.content;
      setFieldText(targetEl, accumulated);
    } else if (msg.type === 'done') {
      badge.classList.remove('spinning');
      label.textContent = 'OC';
      flashBadge('done');
      currentPort = null;
    } else if (msg.type === 'error') {
      badge.classList.remove('spinning');
      label.textContent = '⚠';
      setTimeout(() => { label.textContent = 'OC'; }, 2500);
      console.error('[Over-Correct]', msg.message);
      currentPort = null;
    }
  });

  currentPort.onDisconnect.addListener(() => {
    badge.classList.remove('spinning');
    label.textContent = 'OC';
    currentPort = null;
  });
}

function flashBadge(state) {
  badge.style.borderColor = state === 'done' ? '#e8b84b' : '#e05a38';
  setTimeout(() => { badge.style.borderColor = ''; }, 600);
}

// ─── Badge click ───────────────────────────────────────────────────
badge.addEventListener('click', () => triggerOverCorrect());

// ─── Update badge dot color when dial changes ──────────────────────
async function syncDotColor() {
  const { dial = 1 } = await chrome.storage.sync.get('dial');
  dot.className = 'dot ' + dialClass(parseFloat(dial));
}
syncDotColor();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.dial) syncDotColor();
});

// ─── Message from background (keyboard command / context menu) ─────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'trigger') triggerOverCorrect();
});
