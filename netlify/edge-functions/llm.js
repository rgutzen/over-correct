/**
 * Over-Correct — Netlify Edge Function
 * Proxies to Claude Haiku and re-emits a simpler SSE stream.
 *
 * Env var required: ANTHROPIC_API_KEY
 *
 * Request:  POST /api/llm  { system, user, maxTokens }
 * Response: SSE stream      data: {"chunk":"..."}\n\n
 *                           data: {"done":true}\n\n
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001';
const CORS_HEADERS  = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (request) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let system, user, maxTokens;
  try {
    ({ system, user, maxTokens } = await request.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not set on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens ?? 512,
      stream:     true,
      system,
      messages:   [{ role: 'user', content: user }],
    }),
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic ${upstream.status}: ${body}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  // Transform Anthropic SSE → our simpler SSE format, then stream to client
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    const reader = upstream.body.getReader();
    const dec    = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              await writer.write(enc.encode(`data: ${JSON.stringify({ chunk: evt.delta.text })}\n\n`));
            }
          } catch { /* partial line, skip */ }
        }
      }
      await writer.write(enc.encode('data: {"done":true}\n\n'));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
    },
  });
};

export const config = { path: '/api/llm' };
