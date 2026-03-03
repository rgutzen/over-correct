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
  .wrapper { position: relative; display: inline-block; }
  .badge {
    display: flex; align-items: center; gap: 6px;
    background: #1a1710; border: 1px solid #38311e;
    border-radius: 20px; padding: 6px 13px 6px 10px;
    font: 500 13px/1 'Courier New', monospace;
    color: #ede8d8; cursor: pointer; pointer-events: all;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,.5);
    opacity: 0; transform: translateY(4px);
    transition: opacity .15s, transform .15s, border-color .15s;
  }
  .badge.visible  { opacity: 1; transform: translateY(0); }
  .badge.spinning .dot { animation: spin .6s linear infinite; }
  .dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #e8b84b; flex-shrink: 0;
    transition: background .3s;
  }
  .dot.chaos       { background: #e05a38; }
  .dot.hallucinate { background: #b57bf7; }
  .dot.neutral     { background: #7a6d55; }
  @keyframes spin { to { transform: rotate(360deg); border-radius: 2px; } }
  .popover {
    position: absolute; bottom: calc(100% + 8px); right: 0;
    background: #1a1710; border: 1px solid #38311e;
    border-radius: 12px; padding: 10px 14px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    opacity: 0; pointer-events: none; transform: translateY(4px);
    transition: opacity .15s, transform .15s;
  }
  .popover.open { opacity: 1; pointer-events: all; transform: translateY(0); }
  .vdial-lbl {
    font: italic 500 9px/1 'Courier New', monospace; color: #7a6d55;
  }
  .vdial-lbl.top { color: #b57bf7; }
  .vdial-lbl.bot { color: #e05a38; }
  .vdial-row { display: flex; align-items: center; gap: 10px; }
  .vdial-val {
    font: 700 13px/1 'Courier New', monospace; color: #ede8d8; min-width: 30px;
  }
  input[type=range].vdial {
    writing-mode: vertical-lr; direction: rtl;
    -webkit-appearance: none; appearance: none;
    width: 14px; height: 160px;
    background: linear-gradient(to bottom, #b57bf7 0%, #e8b84b 25%, #221e14 50%, #e05a38 100%);
    border-radius: 7px; outline: none; cursor: pointer;
  }
  input[type=range].vdial::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px; height: 22px; border-radius: 50%;
    background: #ede8d8; border: 3px solid #0f0d09;
    box-shadow: 0 0 0 2px #e8b84b; cursor: grab;
  }
  input[type=range].vdial::-webkit-slider-thumb:active { cursor: grabbing; }
  input[type=range].vdial::-moz-range-thumb {
    width: 22px; height: 22px; border-radius: 50%;
    background: #ede8d8; border: 3px solid #0f0d09;
    box-shadow: 0 0 0 2px #e8b84b; cursor: grab;
  }
`;
shadow.appendChild(styleEl);

const wrapper = document.createElement('div');
wrapper.className = 'wrapper';
shadow.appendChild(wrapper);

const badge = document.createElement('div');
badge.className = 'badge';
badge.innerHTML = '<span class="dot"></span><span class="label">OC</span>';
wrapper.appendChild(badge);

const dot   = badge.querySelector('.dot');
const label = badge.querySelector('.label');

const popover = document.createElement('div');
popover.className = 'popover';
popover.innerHTML = `
  <span class="vdial-lbl top">hallucinate</span>
  <div class="vdial-row">
    <input type="range" class="vdial" min="-10" max="10" step="0.5" value="1">
    <span class="vdial-val">+1</span>
  </div>
  <span class="vdial-lbl bot">chaos</span>
`;
wrapper.appendChild(popover);

const vdial    = popover.querySelector('.vdial');
const vdialVal = popover.querySelector('.vdial-val');

function updateVdialDisplay(val) {
  vdialVal.textContent = (val > 0 ? '+' : '') + val;
}

// ─── Badge positioning ─────────────────────────────────────────────
let activeEl = null;
let rafId    = null;
let pinned   = false;

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
  if (pinned || popover.classList.contains('open')) return;
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
  setTimeout(hideBadge, 400);
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

// ─── Badge hover: pin while mouse is over badge/popover ────────────
badge.addEventListener('mouseenter',   () => { pinned = true; });
wrapper.addEventListener('mouseleave', () => {
  pinned = false;
  setTimeout(hideBadge, 400);
});

// ─── Badge click ───────────────────────────────────────────────────
badge.addEventListener('click', () => triggerOverCorrect());

// ─── Badge right-click: vertical dial picker ───────────────────────
badge.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!popover.classList.contains('open')) {
    const { dial = 1 } = await chrome.storage.sync.get('dial');
    const v = parseFloat(dial);
    vdial.value = v;
    updateVdialDisplay(v);
  }
  popover.classList.toggle('open');
});

vdial.addEventListener('input', async () => {
  const val = parseFloat(vdial.value);
  updateVdialDisplay(val);
  await chrome.storage.sync.set({ dial: val });
  syncDotColor();
});

// Stop propagation so document click doesn't immediately close the popover
popover.addEventListener('pointerdown', (e) => e.stopPropagation());
popover.addEventListener('click',       (e) => e.stopPropagation());

document.addEventListener('click', () => {
  popover.classList.remove('open');
  setTimeout(hideBadge, 400);
});
document.addEventListener('contextmenu', () => {
  popover.classList.remove('open');
  setTimeout(hideBadge, 400);
});

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
