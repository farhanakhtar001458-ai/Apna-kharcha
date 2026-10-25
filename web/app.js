/* ==========================================================================
   Apna AI — client-side chat workspace.
   Evidence-backed reconstruction notes: docs/REA-EVIDENCE.md
   No external scripts, fonts, or analytics. All state lives in localStorage.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const KEYS = {
  conversations: 'apna_ai.conversations.v1',
  settings: 'apna_ai.settings.v1',
  theme: 'apna_ai.theme',
  active: 'apna_ai.activeId',
};

const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are Apna AI, a helpful, concise assistant. Be clear and honest about uncertainty.',
  stream: true,
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  conversations: [],
  activeId: null,
  theme: 'dark',
  generating: false,
  controller: null,
  attachments: [],
  recognition: null,
  search: '',
};

/* ------------------------------ Persistence ------------------------------ */
function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { toast('Storage full — could not save.', true); }
}
function loadState() {
  state.settings = { ...DEFAULT_SETTINGS, ...readJson(KEYS.settings, {}) };
  state.settings.models = Array.isArray(state.settings.models) ? state.settings.models : [...DEFAULT_SETTINGS.models];
  state.conversations = Array.isArray(readJson(KEYS.conversations, [])) ? readJson(KEYS.conversations, []) : [];
  state.theme = localStorage.getItem(KEYS.theme) || 'dark';
  state.activeId = localStorage.getItem(KEYS.active) || null;
  if (!state.conversations.some(c => c.id === state.activeId)) state.activeId = null;
}
function saveConversations() {
  writeJson(KEYS.conversations, state.conversations);
  localStorage.setItem(KEYS.active, state.activeId || '');
  renderChatList();
  updateStorageInfo();
}
function activeConversation() { return state.conversations.find(c => c.id === state.activeId) || null; }
function uid() { return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

/* ------------------------------ Theme ------------------------------ */
function resolvedTheme() {
  if (state.theme !== 'system') return state.theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  const dark = resolvedTheme() === 'dark';
  $('#themeIcon use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('#themeLabel').textContent = dark ? 'Light mode' : 'Dark mode';
  const sel = $('#themeSelect'); if (sel) sel.value = state.theme;
  blobs.forEach(b => b.recolor());
}
function toggleTheme() {
  state.theme = state.theme === 'system' ? 'dark' : state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEYS.theme, state.theme);
  applyTheme();
}

/* ------------------------------ Markdown (safe, minimal) ------------------------------ */
function inlineMd(s) {
  let e = escapeHtml(s);
  const codes = [];
  e = e.replace(/`([^`\n]+)`/g, (_, c) => { const i = codes.push(c) - 1; return `@@IC_${i}@@`; });
  e = e.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  e = e.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  e = e.replace(/@@IC_(\d+)@@/g, (_, i) => `<code>${codes[+i]}</code>`);
  return e;
}
function codeHtml(lang, code) {
  // Code travels in a data attribute (HTML-escaped) so copy buttons work for every
  // message without a growing side-table, including during streaming re-renders.
  return `<pre><div class="code-head"><span>${escapeHtml(lang || 'text')}</span>` +
    `<button type="button" class="copy-code" data-code="${escapeHtml(code)}">${icon('i-copy')}<span>Copy</span></button></div>` +
    `<code>${escapeHtml(code)}</code></pre>`;
}
function renderMarkdown(src) {
  const blocks = [];
  let text = String(src ?? '').replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.push({ lang: (lang || '').trim(), code: code.replace(/\s+$/, '') }) - 1;
    return `\n\n@@CODEBLOCK_${i}@@\n\n`;
  });
  const lines = text.split('\n');
  let out = '', listType = null, inQuote = false;
  const flushList = () => { if (listType) { out += `</${listType}>`; listType = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const cb = line.trim().match(/^@@CODEBLOCK_(\d+)@@$/);
    if (cb) { flushList(); if (inQuote) { out += '</blockquote>'; inQuote = false; } const b = blocks[+cb[1]]; if (b) out += codeHtml(b.lang, b.code); continue; }
    if (!line.trim()) { flushList(); if (inQuote) { out += '</blockquote>'; inQuote = false; } continue; }
    if (/^-{3,}$/.test(line.trim())) { flushList(); out += '<hr>'; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushList(); const lvl = Math.min(m[1].length + 1, 4); out += `<h${lvl}>${inlineMd(m[2])}</h${lvl}>`; continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (listType !== 'ul') { flushList(); out += '<ul>'; listType = 'ul'; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (listType !== 'ol') { flushList(); out += '<ol>'; listType = 'ol'; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushList(); if (!inQuote) { out += '<blockquote>'; inQuote = true; } out += `<p>${inlineMd(m[1])}</p>`; continue; }
    flushList(); if (inQuote) { out += '</blockquote>'; inQuote = false; }
    out += `<p>${inlineMd(line)}</p>`;
  }
  flushList(); if (inQuote) out += '</blockquote>';
  return out || '<p></p>';
}

/* ------------------------------ Rendering ------------------------------ */
function renderChatList() {
  const list = $('#chatList');
  const q = state.search.trim().toLowerCase();
  const convs = [...state.conversations]
    .filter(c => !q || (c.title || '').toLowerCase().includes(q) || (c.messages || []).some(m => (m.content || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!convs.length) {
    list.innerHTML = `<div class="empty-history">${q ? 'No chats match your search.' : 'Your conversations will appear here. Everything is stored locally in this browser.'}</div>`;
    return;
  }
  const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = [['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Previous 30 days', []], ['Older', []]];
  for (const c of convs) {
    const t = c.updatedAt || 0;
    if (t >= startOfToday) groups[0][1].push(c);
    else if (t >= startOfToday - 86400000) groups[1][1].push(c);
    else if (t >= startOfToday - 7 * 86400000) groups[2][1].push(c);
    else if (t >= startOfToday - 30 * 86400000) groups[3][1].push(c);
    else groups[4][1].push(c);
  }
  let html = '';
  for (const [label, items] of groups) {
    if (!items.length) continue;
    html += `<div class="chat-group-title">${label}</div>`;
    for (const c of items) {
      html += `<div class="chat-item ${c.id === state.activeId ? 'active' : ''}" data-chat-id="${escapeHtml(c.id)}" role="button" tabindex="0" title="${escapeHtml(c.title)}">
        <span class="chat-item-title">${escapeHtml(c.title || 'New chat')}</span>
        <span class="chat-item-actions">
          <button data-action="rename" title="Rename">${icon('i-edit')}</button>
          <button data-action="delete" title="Delete">${icon('i-trash')}</button>
        </span>
      </div>`;
    }
  }
  list.innerHTML = html;
}

function renderMessages() {
  const container = $('#messages');
  const conv = activeConversation();
  const msgs = conv ? conv.messages : [];
  $('#emptyState').hidden = msgs.length > 0;
  if (!msgs.length) { container.innerHTML = ''; return; }
  container.innerHTML = msgs.map((m, i) => messageHtml(m, i)).join('');
  requestAnimationFrame(scrollToBottom);
}
function messageHtml(m, i) {
  if (m.role === 'user') {
    return `<div class="message user" data-index="${i}">
      <div class="user-bubble">${escapeHtml(m.content)}</div>
      <div class="msg-actions">
        <button class="msg-action" data-action="copy" title="Copy">${icon('i-copy')}</button>
        <button class="msg-action" data-action="edit" title="Edit">${icon('i-edit')}</button>
      </div>
    </div>`;
  }
  const typing = '<div class="typing"><span></span><span></span><span></span></div>';
  const body = m.error
    ? `<div class="msg-error">${escapeHtml(m.content)}</div>`
    : (m.content ? renderMarkdown(m.content) : (m.streaming ? typing : ''));
  return `<div class="message assistant ${m.streaming ? 'streaming' : ''}" data-index="${i}">
    <div class="message-avatar" aria-hidden="true"></div>
    <div class="assistant-body">
      <div class="assistant-name">Apna AI</div>
      <div class="msg-content">${body || typing}</div>
      <div class="msg-actions">
        <button class="msg-action" data-action="copy" title="Copy">${icon('i-copy')}</button>
        <button class="msg-action" data-action="up" title="Good response">${icon('i-up')}</button>
        <button class="msg-action" data-action="down" title="Bad response">${icon('i-down')}</button>
        <button class="msg-action" data-action="speak" title="Read aloud">${icon('i-sound')}</button>
        <button class="msg-action" data-action="regenerate" title="Regenerate">${icon('i-refresh')}</button>
      </div>
    </div>
  </div>`;
}
function scrollToBottom(force = false) {
  const el = $('#chatScroll');
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  if (force || nearBottom) el.scrollTop = el.scrollHeight;
}

function updateHeader() {
  const mock = isMock();
  $('#modelName').textContent = 'Apna AI';
  $('#modelSub').textContent = mock ? 'mock · offline' : (state.settings.model || 'custom');
  $('#providerBadge').textContent = mock ? 'Mock mode · no key' : `${state.settings.model} · ${state.settings.provider === 'gemini' ? 'Gemini' : 'OpenAI-compatible'}`;
  $('#disclaimer').innerHTML = mock
    ? 'Apna AI can make mistakes. Check important info. <span class="dot">·</span> <button class="link-btn" id="disclaimerSettings">Configure API provider</button>'
    : `Connected via local proxy · ${escapeHtml(state.settings.model)}. Apna AI can make mistakes. Check important info.`;
}

function isMock() {
  return state.settings.provider === 'mock' || !String(state.settings.apiKey || '').trim();
}

/* ------------------------------ Conversations ------------------------------ */
function newChat() {
  if (state.generating) stopGenerating();
  state.activeId = null;
  state.attachments = [];
  renderAttachments();
  $('#promptInput').value = '';
  autoResize();
  saveConversations();
  renderMessages();
  closeSidebar();
  $('#promptInput').focus();
}
function selectChat(id) {
  if (state.generating) stopGenerating();
  state.activeId = id;
  saveConversations();
  renderMessages();
  closeSidebar();
  $('#promptInput').focus();
}
function ensureConversation(firstText) {
  let conv = activeConversation();
  if (!conv) {
    conv = { id: uid(), title: titleFrom(firstText), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    state.conversations.unshift(conv);
    state.activeId = conv.id;
  }
  return conv;
}
function titleFrom(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean ? (clean.length > 42 ? clean.slice(0, 42).trimEnd() + '…' : clean) : 'New chat';
}
function deleteChat(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.activeId === id) state.activeId = null;
  saveConversations(); renderMessages();
  toast('Chat deleted');
}
function renameChat(id) {
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;
  const next = window.prompt('Rename chat', conv.title);
  if (next !== null && next.trim()) { conv.title = next.trim().slice(0, 80); saveConversations(); }
}

/* ------------------------------ Sending / streaming ------------------------------ */
function autoResize() {
  const ta = $('#promptInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  $('#sendBtn').disabled = !ta.value.trim() && !state.attachments.length && !state.generating;
}
function renderAttachments() {
  const tray = $('#attachmentTray');
  if (!state.attachments.length) { tray.hidden = true; tray.innerHTML = ''; return; }
  tray.hidden = false;
  tray.innerHTML = state.attachments.map((a, i) => `<span class="attachment-chip">${icon('i-copy')}<span>${escapeHtml(a.name)}</span><button data-remove-attachment="${i}" aria-label="Remove">${icon('i-close')}</button></span>`).join('');
}
function buildUserText() {
  let text = $('#promptInput').value.trim();
  if (state.attachments.length) {
    const parts = state.attachments.map(a => `--- File: ${a.name} ---\n${a.content}`);
    text = (text ? text + '\n\n' : '') + parts.join('\n\n');
  }
  return text;
}
async function send() {
  const text = buildUserText();
  if (!text || state.generating) return;
  const conv = ensureConversation(text);
  conv.messages.push({ role: 'user', content: text });
  if (!conv.title || conv.title === 'New chat') conv.title = titleFrom(text);
  conv.updatedAt = Date.now();
  saveConversations();
  $('#promptInput').value = '';
  state.attachments = [];
  renderAttachments();
  autoResize();
  renderMessages();
  await generateReply(conv);
}
async function generateReply(conv) {
  const assistant = { role: 'assistant', content: '', streaming: true };
  conv.messages.push(assistant);
  conv.updatedAt = Date.now();
  saveConversations();
  renderMessages();
  setGenerating(true);

  const contentEl = () => $$('.message.assistant').at(-1)?.querySelector('.msg-content');
  let buffer = '';
  let pending = false;
  const paint = () => {
    pending = false;
    const el = contentEl();
    if (el) {
      const typing = '<div class="typing"><span></span><span></span><span></span></div>';
      el.innerHTML = (buffer ? renderMarkdown(buffer) : typing) + (state.generating ? '<span class="stream-caret"></span>' : '');
    }
    scrollToBottom();
  };
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(paint); } };
  const onDelta = (t) => { buffer += t; schedule(); };

  const payload = {
    // The last entry is the empty assistant placeholder we just pushed; exclude it.
    messages: conv.messages.slice(0, -1)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role, content: m.content })),
    provider: state.settings.provider,
    baseUrl: state.settings.baseUrl,
    apiKey: state.settings.apiKey,
    model: state.settings.model,
    temperature: Number(state.settings.temperature),
    maxTokens: Number(state.settings.maxTokens),
    systemPrompt: state.settings.systemPrompt,
    stream: !!state.settings.stream,
  };

  state.controller = new AbortController();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: state.controller.signal,
    });
    if (!res.ok && !res.headers.get('content-type')?.includes('event-stream')) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Server returned ${res.status}. ${detail.slice(0, 200)}`);
    }
    if (res.headers.get('content-type')?.includes('event-stream')) {
      await readSse(res, (evt) => {
        if (evt.type === 'delta') onDelta(evt.text || '');
        else if (evt.type === 'error') throw new Error(evt.message || 'Provider error');
        else if (evt.type === 'done' && !buffer && evt.text) onDelta(evt.text);
      });
    } else {
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onDelta(data.content || '');
    }
    assistant.content = buffer;
    assistant.streaming = false;
  } catch (err) {
    if (err.name === 'AbortError') {
      assistant.content = buffer || '*(stopped)*';
      assistant.streaming = false;
    } else {
      assistant.content = buffer ? buffer + `\n\n> ⚠️ ${err.message}` : err.message;
      assistant.error = !buffer;
      assistant.streaming = false;
      toast(err.message, true);
    }
  } finally {
    setGenerating(false);
    state.controller = null;
    autoResize();
    conv.updatedAt = Date.now();
    saveConversations();
    renderMessages();
  }
}
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const handle = (raw) => {
    const dataLines = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart());
    if (!dataLines.length) return;
    const payload = dataLines.join('\n');
    if (!payload || payload === '[DONE]') return;
    try { onEvent(JSON.parse(payload)); }
    catch (e) { if (e instanceof SyntaxError) return; throw e; }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
  }
  buf += decoder.decode();
  if (buf.trim()) handle(buf.replace(/\r/g, ''));
}
function setGenerating(on) {
  state.generating = on;
  const btn = $('#sendBtn');
  btn.classList.toggle('generating', on);
  $('#sendIcon use').setAttribute('href', on ? '#i-stop' : '#i-arrow-up');
  btn.title = on ? 'Stop generating' : 'Send message';
  btn.disabled = false;
  $('#promptInput').placeholder = on ? 'Apna AI is replying…' : 'Ask anything';
}
function stopGenerating() {
  if (state.controller) state.controller.abort();
}

/* ------------------------------ Message actions ------------------------------ */
function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}
function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'err' : ''}`;
  el.innerHTML = `${icon(isError ? 'i-close' : 'i-check')}<span>${escapeHtml(message)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, 2600);
}
function shareConversation() {
  const conv = activeConversation();
  if (!conv || !conv.messages.length) { toast('Nothing to share yet', true); return; }
  const md = `# ${conv.title}\n\n` + conv.messages.map(m => `**${m.role === 'user' ? 'You' : 'Apna AI'}:**\n\n${m.content}`).join('\n\n---\n\n');
  copyText(md).then(() => toast('Conversation copied as Markdown')).catch(() => toast('Could not copy', true));
}
function regenerate() {
  const conv = activeConversation();
  if (!conv || state.generating) return;
  const lastAssistant = conv.messages.map(m => m.role).lastIndexOf('assistant');
  if (lastAssistant >= 0) conv.messages.splice(lastAssistant, 1);
  conv.updatedAt = Date.now();
  saveConversations(); renderMessages();
  generateReply(conv);
}
function editMessage(index) {
  const conv = activeConversation();
  if (!conv || state.generating) return;
  const text = conv.messages[index]?.content || '';
  conv.messages.splice(index);
  saveConversations(); renderMessages();
  $('#promptInput').value = text;
  autoResize();
  $('#promptInput').focus();
  toast('Edit your message and press Enter');
}
function speak(text) {
  if (!window.speechSynthesis) { toast('Speech synthesis not available', true); return; }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, ' code block ')));
}

/* ------------------------------ Settings modal ------------------------------ */
function openSettings() {
  const s = state.settings;
  $('#baseUrl').value = s.baseUrl || '';
  $('#apiKey').value = s.apiKey || '';
  $('#modelInput').value = s.model || '';
  $('#temperature').value = s.temperature;
  $('#tempValue').textContent = s.temperature;
  $('#maxTokens').value = s.maxTokens;
  $('#systemPrompt').value = s.systemPrompt || '';
  $('#streamToggle').checked = !!s.stream;
  $('#themeSelect').value = state.theme;
  setProviderSegment(s.provider);
  renderModelChips(s.models || []);
  $('#connectionStatus').hidden = true;
  $('#settingsModal').hidden = false;
  updateStorageInfo();
  $('#baseUrl').focus();
}
function closeSettings() {
  const modal = $('#settingsModal');
  modal.classList.add('closing');
  setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); }, 380);
}
function setProviderSegment(provider) {
  $$('#providerSegmented button').forEach(b => b.classList.toggle('active', b.dataset.provider === provider));
  const isGemini = provider === 'gemini';
  $('#baseUrlField').hidden = isGemini || provider === 'mock';
  $('#apiKeyField').hidden = provider === 'mock';
  $('#apiKey').placeholder = isGemini ? 'AIza… (or set GEMINI_API_KEY)' : 'sk-… (or set OPENAI_API_KEY)';
}
function formSettings() {
  return {
    ...state.settings,
    provider: $('#providerSegmented .active')?.dataset.provider || 'openai',
    baseUrl: $('#baseUrl').value.trim(),
    apiKey: $('#apiKey').value.trim(),
    model: $('#modelInput').value.trim() || 'gpt-4o-mini',
    temperature: Number($('#temperature').value),
    maxTokens: Math.max(64, Number($('#maxTokens').value) || 2048),
    systemPrompt: $('#systemPrompt').value,
    stream: $('#streamToggle').checked,
  };
}
function saveSettings() {
  state.settings = formSettings();
  state.theme = $('#themeSelect').value;
  localStorage.setItem(KEYS.theme, state.theme);
  writeJson(KEYS.settings, state.settings);
  applyTheme(); updateHeader(); renderModelMenu();
  closeSettings();
  toast(isMock() ? 'Saved — running in mock mode' : 'Settings saved');
}
function renderModelChips(models) {
  $('#modelChips').innerHTML = (models || []).slice(0, 12).map(m => `<button type="button" class="model-chip" data-model="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('');
}
function updateStorageInfo() {
  let bytes = 0;
  for (const k of Object.values(KEYS)) { const v = localStorage.getItem(k); if (v) bytes += v.length + k.length; }
  $('#storageInfo').textContent = `${state.conversations.length} chats · ~${(bytes / 1024).toFixed(1)} KB local`;
}
function setConnectionStatus(message, ok) {
  const el = $('#connectionStatus');
  el.hidden = false;
  el.className = `connection-status ${ok ? 'ok' : 'err'}`;
  el.textContent = message;
}
async function testConnection() {
  const s = formSettings();
  const btn = $('#testConnection');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Testing…';
  try {
    if (s.provider === 'mock' || !s.apiKey) {
      setConnectionStatus('Mock mode: no network request needed. Add an API key to use a live provider.', true);
      return;
    }
    const res = await fetch('/api/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: s.provider, baseUrl: s.baseUrl, apiKey: s.apiKey }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    const found = Array.isArray(data.models) ? data.models.length : 0;
    setConnectionStatus(`Connection OK. ${found ? `${found} models available.` : 'Endpoint reachable.'}`, true);
    if (found) { s.models = data.models.slice(0, 20); renderModelChips(s.models); state.settings = s; renderModelMenu(); }
  } catch (e) { setConnectionStatus(`Connection failed: ${e.message}`, false); }
  finally { btn.disabled = false; btn.textContent = 'Test connection'; }
}
async function fetchModels() {
  const s = formSettings();
  if (s.provider === 'mock' || !s.apiKey) { setConnectionStatus('Add an API key first (or use mock mode).', false); return; }
  const res = await fetch('/api/models', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: s.provider, baseUrl: s.baseUrl, apiKey: s.apiKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) { setConnectionStatus(data.error, false); return; }
  s.models = data.models || [];
  state.settings = s;
  renderModelChips(s.models);
  setConnectionStatus(`${s.models.length} models found. Click a chip to use it.`, true);
}

/* ------------------------------ Model dropdown ------------------------------ */
function renderModelMenu() {
  const menu = $('#modelMenu');
  const models = (state.settings.models || []).slice(0, 12);
  let html = `<div class="dropdown-label">Apna AI</div>
    <button class="dropdown-item" data-model="__mock__">${icon('i-bolt')}<span class="dropdown-item-main"><strong>Mock (offline)</strong><small>Local demo replies, no API key</small></span></button>
    <div class="dropdown-label">Connected models</div>`;
  html += models.map(m => `<button class="dropdown-item" data-model="${escapeHtml(m)}">${icon('i-sparkle')}<span class="dropdown-item-main"><strong>${escapeHtml(m)}</strong><small>${state.settings.provider === 'gemini' ? 'Google Gemini' : 'OpenAI-compatible endpoint'}</small></span>${m === state.settings.model ? icon('i-check') : ''}</button>`).join('');
  html += `<div class="dropdown-label">Manage</div><button class="dropdown-item" data-model="__settings__">${icon('i-settings')}<span class="dropdown-item-main"><strong>Settings &amp; providers</strong><small>Base URL, API key, generation options</small></span></button>`;
  menu.innerHTML = html;
}
function toggleModelMenu(force) {
  const menu = $('#modelMenu');
  const show = force ?? menu.hidden;
  menu.hidden = !show;
  $('#modelButton').setAttribute('aria-expanded', String(show));
}

/* ------------------------------ Sidebar ------------------------------ */
function closeSidebar() { $('#app').classList.remove('sidebar-open'); }
function toggleSidebar() { $('#app').classList.toggle('sidebar-open'); }

/* ------------------------------ Voice / orb animation ------------------------------ */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
class Blob {
  constructor(canvas, { points = 72, wobble = 0.11, speed = 1 } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.points = points; this.wobble = wobble; this.speed = speed;
    this.raf = null; this.colors = ['#7b8cff', '#b06cf5', '#4ecdc4'];
    this.recolor();
  }
  recolor() {
    const cs = getComputedStyle(document.documentElement);
    this.colors = ['--orb-a', '--orb-b', '--orb-c'].map(k => cs.getPropertyValue(k).trim() || '#7b8cff');
    if (this.raf === null) this.draw(0);
  }
  start() {
    if (this.raf !== null || reduceMotion) { this.draw(0); return; }
    const loop = (t) => { this.draw(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null; } }
  draw(t) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * 0.33;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(cx - base, cy - base, cx + base, cy + base);
    g.addColorStop(0, this.colors[0]); g.addColorStop(0.55, this.colors[1]); g.addColorStop(1, this.colors[2]);
    ctx.save();
    ctx.shadowColor = this.colors[1]; ctx.shadowBlur = w * 0.14;
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= this.points; i++) {
      const a = (i / this.points) * Math.PI * 2;
      const r = base * (1
        + this.wobble * Math.sin(3 * a + t / (940 / this.speed))
        + this.wobble * 0.62 * Math.cos(5 * a - t / (1370 / this.speed))
        + this.wobble * 0.4 * Math.sin(2 * a + t / (1810 / this.speed)));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx - base * .28, cy - base * .34, base * .34, base * .18, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
const blobs = [];
function initBlobs() {
  blobs.push(new Blob($('#orbCanvas'), { wobble: 0.1, speed: 1 }));
  blobs.push(new Blob($('#voiceCanvas'), { wobble: 0.14, speed: 1.5 }));
  blobs[0].start();
}
function openVoice() {
  $('#voiceOverlay').hidden = false;
  $('#voiceSubtitle').textContent = 'A visual, animated companion. Press start to dictate.';
  blobs[1].start();
}
function closeVoice() {
  $('#voiceOverlay').hidden = true;
  blobs[1].stop();
  stopRecognition();
}
function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('#voiceSubtitle').textContent = 'Speech recognition is not available in this browser. Try Chrome or Edge.'; toast('Speech recognition unavailable', true); return; }
  if (state.recognition) { stopRecognition(); return; }
  const rec = new SR();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    $('#voiceSubtitle').textContent = text || 'Listening…';
    if (e.results[e.results.length - 1].isFinal && text.trim()) {
      $('#promptInput').value = text.trim();
      autoResize();
      closeVoice();
      $('#promptInput').focus();
    }
  };
  rec.onerror = () => { $('#voiceSubtitle').textContent = 'Could not start dictation. Check microphone permission.'; stopRecognition(); };
  rec.onend = () => stopRecognition();
  try { rec.start(); state.recognition = rec; $('#voiceStart').classList.add('listening'); $('#voiceSubtitle').textContent = 'Listening…'; }
  catch { toast('Could not start dictation', true); }
}
function stopRecognition() {
  if (state.recognition) { try { state.recognition.stop(); } catch { /* already stopped */ } state.recognition = null; }
  $('#voiceStart').classList.remove('listening');
}

/* ------------------------------ Attachments ------------------------------ */
async function handleFiles(files) {
  for (const f of Array.from(files)) {
    if (f.size > 512 * 1024) { toast(`${f.name} is too large (max 512 KB)`, true); continue; }
    try {
      const content = await f.text();
      state.attachments.push({ name: f.name, content: content.slice(0, 60000) });
    } catch { toast(`Could not read ${f.name}`, true); }
  }
  renderAttachments(); autoResize();
}

/* ------------------------------ Wiring ------------------------------ */
function wire() {
  $('#newChatBtn').addEventListener('click', newChat);
  $('#mobileMenu').addEventListener('click', toggleSidebar);
  $('#desktopOpen').addEventListener('click', () => $('#app').classList.remove('sidebar-collapsed'));
  $('#sidebarCollapse').addEventListener('click', () => $('#app').classList.add('sidebar-collapsed'));
  $('#scrim').addEventListener('click', closeSidebar);
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#profileBtn').addEventListener('click', openSettings);
  $('#userRow').addEventListener('click', openSettings);
  $('#shareBtn').addEventListener('click', shareConversation);
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderChatList(); });

  $('#chatList').addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item'); if (!item) return;
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      if (actionBtn.dataset.action === 'delete') deleteChat(item.dataset.chatId);
      else renameChat(item.dataset.chatId);
      return;
    }
    selectChat(item.dataset.chatId);
  });
  $('#chatList').addEventListener('keydown', (e) => {
    const item = e.target.closest('.chat-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectChat(item.dataset.chatId); }
  });

  $('#promptInput').addEventListener('input', autoResize);
  $('#promptInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('#sendBtn').addEventListener('click', () => state.generating ? stopGenerating() : send());
  $('#suggestions').addEventListener('click', (e) => {
    const btn = e.target.closest('.suggestion'); if (!btn) return;
    $('#promptInput').value = btn.dataset.prompt;
    autoResize(); $('#promptInput').focus();
  });

  $('#messages').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action], .copy-code');
    if (!btn) return;
    const copyCode = btn.classList.contains('copy-code');
    if (copyCode) {
      const text = btn.dataset.code || '';
      copyText(text).then(() => { btn.querySelector('span').textContent = 'Copied'; setTimeout(() => { const s = btn.querySelector('span'); if (s) s.textContent = 'Copy'; }, 1600); });
      return;
    }
    const msg = e.target.closest('.message'); if (!msg) return;
    const index = Number(msg.dataset.index);
    const conv = activeConversation(); if (!conv) return;
    const m = conv.messages[index]; if (!m) return;
    switch (btn.dataset.action) {
      case 'copy': copyText(m.content || '').then(() => toast('Copied')); break;
      case 'edit': editMessage(index); break;
      case 'regenerate': regenerate(); break;
      case 'speak': speak(m.content || ''); break;
      case 'up': case 'down':
        btn.classList.toggle('active');
        $$('.msg-action[data-action="up"], .msg-action[data-action="down"]', msg).forEach(b => { if (b !== btn) b.classList.remove('active'); });
        toast(btn.dataset.action === 'up' ? 'Thanks for the feedback' : 'Feedback noted');
        break;
    }
  });

  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('#attachmentTray').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-attachment]'); if (!btn) return;
    state.attachments.splice(Number(btn.dataset.removeAttachment), 1);
    renderAttachments(); autoResize();
  });
  $('#toolsBtn').addEventListener('click', () => toast('Tools: attach files, voice mode, and code copy are built in.'));
  $('#micBtn').addEventListener('click', () => state.recognition ? stopRecognition() : startRecognition());
  $('#voiceBtn').addEventListener('click', openVoice);
  $('#voiceClose').addEventListener('click', closeVoice);
  $('#voiceStart').addEventListener('click', startRecognition);
  $('#voiceStop').addEventListener('click', closeVoice);

  // Model dropdown
  $('#modelButton').addEventListener('click', (e) => { e.stopPropagation(); toggleModelMenu(); });
  $('#modelMenu').addEventListener('click', (e) => {
    const item = e.target.closest('[data-model]'); if (!item) return;
    const value = item.dataset.model;
    toggleModelMenu(false);
    if (value === '__settings__') { openSettings(); return; }
    if (value === '__mock__') { state.settings.provider = 'mock'; }
    else { state.settings.model = value; if (state.settings.provider === 'mock') state.settings.provider = 'openai'; }
    writeJson(KEYS.settings, state.settings);
    updateHeader(); renderModelMenu();
    toast(value === '__mock__' ? 'Switched to mock mode' : `Model: ${value}`);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.model-wrap')) toggleModelMenu(false);
    if (e.target.id === 'disclaimerSettings') openSettings();
  });

  // Settings modal
  $('#closeSettings').addEventListener('click', closeSettings);
  $('#cancelSettings').addEventListener('click', closeSettings);
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#testConnection').addEventListener('click', testConnection);
  $('#fetchModels').addEventListener('click', fetchModels);
  $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  $('#providerSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-provider]'); if (!btn) return;
    setProviderSegment(btn.dataset.provider);
  });
  $('#toggleKey').addEventListener('click', () => {
    const input = $('#apiKey'); const show = input.type === 'password';
    input.type = show ? 'text' : 'password'; $('#toggleKey').textContent = show ? 'Hide' : 'Show';
  });
  $('#temperature').addEventListener('input', (e) => { $('#tempValue').textContent = e.target.value; });
  $('#themeSelect').addEventListener('change', (e) => { state.theme = e.target.value; localStorage.setItem(KEYS.theme, state.theme); applyTheme(); });
  $('#modelChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-model]'); if (!chip) return;
    $('#modelInput').value = chip.dataset.model;
  });
  $('#clearData').addEventListener('click', () => {
    if (!window.confirm('Delete all local chats and stored settings? This cannot be undone.')) return;
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    state.conversations = []; state.activeId = null; state.settings = { ...DEFAULT_SETTINGS };
    applyTheme(); updateHeader(); renderModelMenu(); renderChatList(); renderMessages();
    openSettings(); toast('Local data cleared');
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (!$('#voiceOverlay').hidden) closeVoice();
      else if (!$('#settingsModal').hidden) closeSettings();
      else toggleModelMenu(false);
      return;
    }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); $('#app').classList.add('sidebar-open'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newChat(); }
  });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) blobs.forEach(b => b.stop());
    else { if (!$('#emptyState').hidden) blobs[0].start(); if (!$('#voiceOverlay').hidden) blobs[1].start(); }
  });
}

function init() {
  loadState();
  applyTheme();
  wire();
  initBlobs();
  renderChatList();
  renderMessages();
  renderModelMenu();
  updateHeader();
  autoResize();
  updateStorageInfo();
  // stop the empty-state orb while a conversation is open
  if ($('#emptyState').hidden) blobs[0].stop();
  // keep orb lifecycle in sync with the empty state
  new MutationObserver(() => {
    if ($('#emptyState').hidden) blobs[0].stop(); else blobs[0].start();
  }).observe($('#emptyState'), { attributes: true, attributeFilter: ['hidden'] });
}
init();
