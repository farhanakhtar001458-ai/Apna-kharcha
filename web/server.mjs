/* ==========================================================================
   Apna AI — zero-dependency local server.
   - serves the static chat UI
   - proxies chat completions to an OpenAI-compatible endpoint or Gemini
   - falls back to a local mock stream when no API key is configured
   API keys are never logged and never written to disk.
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors *",
};

function sendJson(res, status, obj, extra = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...SECURITY_HEADERS,
  });
}
function emit(res, event) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ------------------------------ SSE upstream parsing ------------------------------ */
async function* sseFrames(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 2); }
  }
  buf = (buf + decoder.decode()).replace(/\r\n/g, '\n');
  if (buf.trim()) yield buf;
}
function frameData(frame) {
  return frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
}

/* ------------------------------ Mock provider ------------------------------ */
function buildMockReply(messages, model) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const question = String(lastUser?.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return [
    '### Running in mock mode',
    '',
    'No API key is configured, so this reply is generated **locally** — no request left this machine. Open **Settings → Provider** to connect OpenAI, Gemini, or any OpenAI-compatible endpoint (Groq, Together, Ollama, LM Studio, vLLM…).',
    '',
    question ? `> You asked: ${question}` : '> Send a message to see it echoed here.',
    '',
    'What already works without a key:',
    '',
    '- Streaming replies with the same token-by-token animation',
    '- Multiple conversations, rename, delete, search, and share',
    '- Dark / light / system theme, persisted locally',
    '- Markdown, fenced code blocks with copy buttons, and file attachments',
    '- Animated shape/orb, voice dictation, and keyboard shortcuts',
    '',
    'A tiny example of the code rendering:',
    '',
    '```js',
    "const reply = await fetch('/api/chat', {",
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json' },",
    '  body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),',
    '});',
    '```',
    '',
    `Once a key is saved, the same UI streams from \`${model}\` through the local proxy instead.`,
  ].join('\n');
}
async function streamMock(res, messages, model, stream) {
  const reply = buildMockReply(messages, model);
  if (!stream) { emit(res, { type: 'delta', text: reply }); emit(res, { type: 'done' }); return; }
  const chunks = reply.match(/\S+\s*|\s+/g) || [reply];
  for (const c of chunks) {
    if (res.writableEnded) return;
    emit(res, { type: 'delta', text: c });
    await sleep(14);
  }
  emit(res, { type: 'done' });
}

/* ------------------------------ Providers ------------------------------ */
function normalizeUrl(baseUrl) {
  const raw = String(baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Base URL is not a valid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Base URL must use http or https');
  return raw;
}

async function streamOpenAICompatible(res, opts, signal) {
  const { baseUrl, apiKey, model, messages, systemPrompt, temperature, maxTokens, stream } = opts;
  const url = `${normalizeUrl(baseUrl)}/chat/completions`;
  const full = [];
  if (systemPrompt) full.push({ role: 'system', content: systemPrompt });
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system')) continue;
    if (typeof m.content !== 'string') continue;
    full.push({ role: m.role, content: m.content });
  }
  const body = { model, messages: full, temperature, stream: true };
  if (/^o[1-9]/.test(model)) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Accept': 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    let message = `Provider returned HTTP ${upstream.status}`;
    try { const j = JSON.parse(detail); message = j.error?.message || j.message || message; } catch { if (detail) message += `: ${detail.slice(0, 180)}`; }
    throw new Error(message);
  }
  const ctype = upstream.headers.get('content-type') || '';
  let buffer = '';
  if (!ctype.includes('event-stream')) {
    const data = await upstream.json().catch(() => ({}));
    const text = data.choices?.[0]?.message?.content || data.content || '';
    if (!text) throw new Error(data.error?.message || 'Provider returned no text');
    buffer += text;
    if (stream) { for (const c of text.match(/\S+\s*|\s+/g) || [text]) { emit(res, { type: 'delta', text: c }); await sleep(10); } }
    else emit(res, { type: 'delta', text: text });
    emit(res, { type: 'done' });
    return;
  }
  for await (const frame of sseFrames(upstream.body)) {
    if (res.writableEnded) break;
    const data = frameData(frame);
    if (!data || data === '[DONE]') continue;
    let parsed;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed.error) throw new Error(parsed.error.message || 'Provider error');
    const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? '';
    if (typeof delta === 'string' && delta) {
      buffer += delta;
      if (stream) emit(res, { type: 'delta', text: delta });
    }
  }
  if (!stream) emit(res, { type: 'delta', text: buffer });
  if (!buffer) throw new Error('Provider returned an empty response');
  emit(res, { type: 'done' });
}

async function streamGemini(res, opts, signal) {
  const { apiKey, model, messages, systemPrompt, temperature, maxTokens, stream } = opts;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const contents = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
  };
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    let message = `Gemini returned HTTP ${upstream.status}`;
    try { const j = JSON.parse(detail); message = j.error?.message || message; } catch { if (detail) message += `: ${detail.slice(0, 180)}`; }
    throw new Error(message);
  }
  let buffer = '';
  for await (const frame of sseFrames(upstream.body)) {
    if (res.writableEnded) break;
    const data = frameData(frame);
    if (!data) continue;
    let parsed;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed.error) throw new Error(parsed.error.message || 'Gemini error');
    const parts = parsed.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (typeof p.text === 'string' && p.text) {
        buffer += p.text;
        if (stream) emit(res, { type: 'delta', text: p.text });
      }
    }
  }
  if (!stream) emit(res, { type: 'delta', text: buffer });
  if (!buffer) throw new Error('Gemini returned an empty response');
  emit(res, { type: 'done' });
}

async function listModels(opts) {
  const { provider, baseUrl, apiKey } = opts;
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`Gemini returned HTTP ${r.status}`);
    const j = await r.json();
    return (j.models || []).map(m => m.name?.replace(/^models\//, '')).filter(Boolean).sort();
  }
  const url = `${normalizeUrl(baseUrl)}/models`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Endpoint returned HTTP ${r.status}`);
  const j = await r.json();
  return (j.data || j.models || []).map(m => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean).sort();
}

/* ------------------------------ Route handlers ------------------------------ */
async function handleChat(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
  const opts = {
    provider: body.provider === 'gemini' ? 'gemini' : body.provider === 'mock' ? 'mock' : 'openai',
    baseUrl: body.baseUrl || 'https://api.openai.com/v1',
    apiKey: String(body.apiKey || '').trim() || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '',
    model: body.model || 'gpt-4o-mini',
    messages: Array.isArray(body.messages) ? body.messages.slice(-40) : [],
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 8000) : '',
    temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
    maxTokens: Math.min(Math.max(Number(body.maxTokens) || 2048, 64), 128000),
    stream: body.stream !== false,
  };
  if (!opts.messages.length) return sendJson(res, 400, { error: 'No messages supplied' });

  openSse(res);
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    if (opts.provider === 'mock' || !opts.apiKey) {
      await streamMock(res, opts.messages, opts.model, opts.stream);
    } else if (opts.provider === 'gemini') {
      await streamGemini(res, opts, controller.signal);
    } else {
      await streamOpenAICompatible(res, opts, controller.signal);
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      const message = e.name === 'TimeoutError' ? 'Provider request timed out' : (e.message || 'Unknown provider error');
      emit(res, { type: 'error', message });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}

async function handleModels(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
  const provider = body.provider === 'gemini' ? 'gemini' : 'openai';
  const apiKey = String(body.apiKey || '').trim() || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!apiKey) return sendJson(res, 400, { error: 'No API key provided' });
  try {
    const models = await listModels({ provider, baseUrl: body.baseUrl, apiKey });
    return sendJson(res, 200, { models });
  } catch (e) {
    return sendJson(res, 502, { error: e.message || 'Could not reach provider' });
  }
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: 'Bad path' }); }
  if (rel.includes('\0')) return sendJson(res, 400, { error: 'Bad path' });
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.resolve(ROOT, '.' + rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  let stat;
  try { stat = await fsp.stat(target); } catch { 
    // SPA fallback for extensionless paths
    if (!path.extname(target)) {
      try { stat = await fsp.stat(path.join(ROOT, 'index.html')); } catch { return sendJson(res, 404, { error: 'Not found' }); }
      return serveFile(res, path.join(ROOT, 'index.html'), stat);
    }
    return sendJson(res, 404, { error: 'Not found' });
  }
  if (stat.isDirectory()) return serveFile(res, path.join(target, 'index.html'), await fsp.stat(path.join(target, 'index.html')).catch(() => null));
  return serveFile(res, target, stat);
}
function serveFile(res, file, stat) {
  if (!stat || !stat.isFile()) return sendJson(res, 404, { error: 'Not found' });
  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
    ...SECURITY_HEADERS,
  };
  res.writeHead(200, headers);
  if (fs.existsSync(file)) fs.createReadStream(file).pipe(res);
  else res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    if (pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'apna-ai', version: '1.0.0' });
    if (pathname === '/api/chat' && req.method === 'POST') return await handleChat(req, res);
    if (pathname === '/api/models' && req.method === 'POST') return await handleModels(req, res);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown API route' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
    return await serveStatic(req, res, pathname);
  } catch (e) {
    if (!res.headersSent) return sendJson(res, 500, { error: 'Internal server error' });
    if (!res.writableEnded) res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Apna AI running at http://${HOST}:${PORT}`);
  console.log('No API key configured on the server; the browser can supply one in Settings, or set OPENAI_API_KEY / GEMINI_API_KEY.');
});
