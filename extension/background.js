/* Over-Correct — background service worker (Manifest V3, ES module) */

// ─── Context menu setup ───────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       'overcorrect',
    title:    'Over-Correct selection',
    contexts: ['selection', 'editable'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'overcorrect') return;
  chrome.tabs.sendMessage(tab.id, { type: 'trigger' });
});

// ─── Keyboard command ─────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'overcorrect') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'trigger' });
});

// ─── LLM streaming via port ───────────────────────────────────────
// content.js connects with name 'oc-stream', sends { type:'process', system, user, maxTokens }
// background responds with  { type:'chunk', content } ... { type:'done' }
//                       or  { type:'error', message }

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'oc-stream') return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'process') return;
    try {
      const settings = await chrome.storage.sync.get(['apiType', 'apiKey', 'apiUrl', 'model']);
      const gen = settings.apiType === 'openai'
        ? streamOpenAI(settings, msg.system, msg.user, msg.maxTokens, controller.signal)
        : streamAnthropic(settings, msg.system, msg.user, msg.maxTokens, controller.signal);

      for await (const chunk of gen) {
        port.postMessage({ type: 'chunk', content: chunk });
      }
      port.postMessage({ type: 'done' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        port.postMessage({ type: 'error', message: err.message });
      }
    }
  });
});

// ─── Anthropic API streaming ──────────────────────────────────────
async function* streamAnthropic(settings, system, user, maxTokens, signal) {
  const key = settings.apiKey?.trim();
  if (!key) throw new Error('No API key set. Click the extension icon → Settings.');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      settings.model || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      stream:     true,
      system,
      messages:   [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 120)}`);
  }

  yield* parseSseAnthropic(resp.body);
}

async function* parseSseAnthropic(body) {
  const reader = body.getReader();
  const dec    = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const evt = JSON.parse(raw);
        if (evt.type === 'content_block_delta' && evt.delta?.text) yield evt.delta.text;
      } catch { /* skip */ }
    }
  }
}

// ─── OpenAI-compatible API streaming ──────────────────────────────
// Works with: OpenRouter, Groq, local Ollama (/v1), any OAI-spec endpoint.
async function* streamOpenAI(settings, system, user, maxTokens, signal) {
  const base = (settings.apiUrl || 'http://localhost:11434/v1').replace(/\/$/, '');
  const key  = settings.apiKey?.trim() || 'ollama'; // Ollama ignores the key

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:      settings.model || 'llama3.2',
      max_tokens: maxTokens,
      stream:     true,
      messages:   [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${body.slice(0, 120)}`);
  }

  yield* parseSseOpenAI(resp.body);
}

async function* parseSseOpenAI(body) {
  const reader = body.getReader();
  const dec    = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const chunk = JSON.parse(raw).choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch { /* skip */ }
    }
  }
}
