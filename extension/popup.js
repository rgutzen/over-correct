/* Over-Correct — popup */

const dialEl    = document.getElementById('dial');
const modeLabel = document.getElementById('mode-label');
const applyBtn  = document.getElementById('apply-btn');
const apiTypeEl = document.getElementById('api-type');
const apiKeyEl  = document.getElementById('api-key');
const apiUrlEl  = document.getElementById('api-url');
const modelEl   = document.getElementById('api-model');
const rowUrl    = document.getElementById('row-url');
const saveBtn   = document.getElementById('save-btn');

const MODELS = {
  anthropic: [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
  ],
  openai: [
    'llama3.2',
    'llama3.1:8b',
    'mistral',
    'gemma2',
    'phi3',
    'mixtral:8x7b',
    'gpt-4o-mini',
    'gpt-4o',
  ],
};

function populateModels(apiType, savedModel) {
  const options = MODELS[apiType] ?? MODELS.anthropic;
  modelEl.innerHTML = '';
  options.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === savedModel) opt.selected = true;
    modelEl.appendChild(opt);
  });
  // If saved model isn't in list, add it as selected option
  if (savedModel && !options.includes(savedModel)) {
    const opt = document.createElement('option');
    opt.value = savedModel;
    opt.textContent = savedModel;
    opt.selected = true;
    modelEl.insertBefore(opt, modelEl.firstChild);
  }
}

// ─── Dial mode labels ──────────────────────────────────────────────
const MODES = [
  { max: -7,  label: 'nuclear chaos',         cls: 'chaos-mode' },
  { max: -4,  label: 'heavy distortion',      cls: 'chaos-mode' },
  { max: -1,  label: 'introducing errors',    cls: 'chaos-mode' },
  { max:  0,  label: 'pass-through',          cls: 'neutral-mode' },
  { max:  1,  label: 'spell-check only',      cls: '' },
  { max:  2,  label: 'standard autocorrect',  cls: '' },
  { max:  4,  label: 'aggressive correction', cls: '' },
  { max:  6,  label: 'hallucinating',         cls: 'hallucinate-mode' },
  { max: 10,  label: 'freeform creation',     cls: 'hallucinate-mode' },
];

function updateMode(v) {
  const m = MODES.find(m => v <= m.max) ?? MODES[MODES.length - 1];
  modeLabel.textContent = m.label;
  modeLabel.className   = 'mode-label ' + m.cls;
}

// ─── Load saved state ──────────────────────────────────────────────
chrome.storage.sync.get(['dial', 'apiType', 'apiKey', 'apiUrl', 'model'], (stored) => {
  const v = parseFloat(stored.dial ?? 1);
  dialEl.value = v;
  updateMode(v);

  const apiType = stored.apiType ?? 'anthropic';
  apiTypeEl.value = apiType;
  apiKeyEl.value  = stored.apiKey ?? '';
  apiUrlEl.value  = stored.apiUrl ?? '';
  rowUrl.style.display = apiType === 'openai' ? '' : 'none';
  populateModels(apiType, stored.model ?? '');
});

// ─── Dial interaction ──────────────────────────────────────────────
dialEl.addEventListener('input', () => {
  const v = parseFloat(dialEl.value);
  updateMode(v);
  chrome.storage.sync.set({ dial: v });
});

apiTypeEl.addEventListener('change', () => {
  rowUrl.style.display = apiTypeEl.value === 'openai' ? '' : 'none';
  populateModels(apiTypeEl.value, '');
});

// ─── Save settings ─────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  chrome.storage.sync.set({
    apiType: apiTypeEl.value,
    apiKey:  apiKeyEl.value.trim(),
    apiUrl:  apiUrlEl.value.trim(),
    model:   modelEl.value.trim(),
  });
  settings.hidden = true;
  saveBtn.textContent = 'Saved ✓';
  setTimeout(() => { saveBtn.textContent = 'Save'; }, 1200);
});

// ─── Apply button (triggers content script in active tab) ──────────
applyBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'trigger' });
    window.close();
  }
});
