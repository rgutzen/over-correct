# ~~Auto~~ Over-Correct

> *What if autocorrect didn't know when to stop?*

Over-Correct is a text tool built for a **[Stupid Hackathon](https://itp.nyu.edu/itp/event-itp-ima-stupid-hackathon-2026/)**. It takes the familiar concept of autocorrect and attaches a dial — then turns that dial way past where any reasonable person would stop.

---

## The Dial

The dial runs from **−10** to **+10**:

| Range | What happens |
|-------|-------------|
| `−10 → −1` | Increasingly introduces typos, garbles your text, sows linguistic chaos |
| `0` | Pass-through — does absolutely nothing |
| `0 → 1` | Spell-check and light grammar correction |
| `1 → 3` | Assertive autocorrect — infers your intent even from a mess |
| `3 → 6` | Hallucination begins — it *will* find meaning in any noise |
| `6 → 10` | Full creative derangement — your text is just a random seed now |

At dial = 1, it behaves like a sensible autocorrect. At dial = 10, you can type `qwerty asdfgh zxcvbn` and receive back a formal letter of complaint about the declining quality of artisanal bread.

The negative side runs in the browser with no AI — purely algorithmic chaos. The positive side calls a language model.

---

## The Stupid Philosophy

Standard autocorrect is already slightly presumptuous. It quietly decides what you *meant* to say. Over-Correct just makes that presumption explicit — and dials it up to eleven. (Or down to minus ten, if you want to watch Shakespeare become soup.)

There is no useful application for this. That's the point.

---

## Usage — three ways

### 1. Web app, online (Claude Haiku)

Visit the deployed site. No local setup needed.

Click **⚙** → set **LLM backend** to **Claude Haiku (online)**.

The server-side Edge Function calls Claude Haiku and streams the response. The negative (chaos) side always runs in your browser, no API needed.

---

### 2. Web app, local (Ollama)

Run your own model on your own machine.

1. Install [Ollama](https://ollama.com) and pull a model:
   ```bash
   ollama pull llama3.2
   ```

2. Start Ollama with browser CORS enabled:
   ```bash
   OLLAMA_ORIGINS=* ollama serve
   ```

3. Open the app (or `frontend/index.html` directly), click **⚙** → keep backend as **Ollama (local)**.

Any model Ollama supports will work. Slower models lean into the experience.

---

### 3. Browser extension — apply it anywhere

Install the extension and Over-Correct any text field on any website.

**Setup:**
1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked**, select the `extension/` folder.
3. Click the **OC** toolbar icon → **⚙** → enter your API key:
   - **Anthropic key** (`sk-ant-…`): calls Claude directly, no CORS issue.
   - **OpenAI-compatible** + base URL: works with OpenRouter, Groq, or local Ollama.

**Usage:**
- Focus any text field on any page — a small **OC** badge appears.
- Click the badge, or press **Ctrl+Shift+O** (⌘⇧O on Mac).
- The text in the field is replaced live as the response streams in.
- Right-click selected text → **Over-Correct selection** also works.
- The dial in the popup controls the intensity. Chaos mode (negative) runs locally — no API call.

---

## Deploying your own instance to Netlify

The repo is structured for zero-config Netlify deployment.

```
netlify.toml              → publish = "frontend", no build step
netlify/edge-functions/   → Claude Haiku streaming proxy at /api/llm
frontend/                 → static HTML + CSS + JS
```

Steps:
1. Push this repo to GitHub.
2. On [netlify.com](https://netlify.com): **Add new site → Import from Git**.
3. Select the repo. Netlify auto-detects `netlify.toml` — no settings to change.
4. Under **Site configuration → Environment variables**, add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
5. Redeploy (or it deploys automatically on the next push).

Users visiting the site select **Claude Haiku (online)** in the ⚙ settings. Ollama still works if they have it running locally.

---

## Project structure

```
frontend/                   Static web app (the whole app — no build step)
  index.html                Entry point
  style.css                 Minimal overlay editor + thick gradient dial
  app.js                    Chaos engine, prompt builder, Ollama + Netlify streaming

extension/                  Browser extension (Manifest V3, no build step)
  manifest.json
  background.js             Service worker: LLM calls (Anthropic / OpenAI-compat)
  content.js                Floating badge, text-field manipulation
  popup.html/css/js         Dial UI + settings
  shared/chaos.js           Shared chaos engine
  shared/prompts.js         Shared prompt builder

netlify/edge-functions/
  llm.js                    Deno Edge Function: proxies to Claude Haiku, re-emits SSE

backend/                    Optional Python server (serves static files locally)
  main.py                   FastAPI, StaticFiles only
  llm.py                    Ollama + Claude backend abstraction
  prompts.py                Prompt tier logic
  chaos.py                  Python chaos engine
```

---

## Technical notes

**Chaos engine** (negative dial): runs in the browser (and in the extension content script). Layers of degradation: adjacent-key substitutions, transpositions, letter drops, homophone swaps, word scrambling, and at extreme values, full character soup. No network call.

**Prompt tiers** (positive dial): four escalating system prompts as the dial increases:

| Dial | Mode |
|------|------|
| 0–1 | Spell-check / grammar fix |
| 1–3 | Intent inference and assertive rewriting |
| 3–6 | Meaning extraction from noise — hallucination starts |
| 6–10 | Input is entropy; random output form assigned (haiku, legal disclaimer, pirate's log, ransom note, …) |

**Streaming**: the web app uses `fetch` with a `ReadableStream` reader. The extension uses a Chrome runtime port between the content script and background service worker. Both update the UI token-by-token.
