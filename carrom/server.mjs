/* ==========================================================================
   Apna Carrom — zero-dependency static server.
   Binds 0.0.0.0 so the sandbox preview proxy can reach it.  No data is sent
   anywhere: the game is entirely offline and stores state in localStorage.
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3100);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors *",
};

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(body),
    ...HEADERS,
  });
  res.end(body);
}

async function serve(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return json(res, 400, { error: 'Bad path' }); }
  if (rel.includes('\0')) return json(res, 400, { error: 'Bad path' });
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.resolve(ROOT, '.' + rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return json(res, 403, { error: 'Forbidden' });
  let stat;
  try { stat = await fsp.stat(target); } catch { return json(res, 404, { error: 'Not found' }); }
  if (stat.isDirectory()) return json(res, 404, { error: 'Not found' });
  if (!stat.isFile()) return json(res, 404, { error: 'Not found' });
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
    ...HEADERS,
  });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname; }
  catch { return json(res, 400, { error: 'Bad request' }); }
  try {
    if (pathname === '/api/health') return json(res, 200, { ok: true, service: 'apna-carrom', version: '1.0.0' });
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API route' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return await serve(req, res, pathname);
  } catch {
    if (!res.headersSent) return json(res, 500, { error: 'Internal server error' });
    if (!res.writableEnded) res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Apna Carrom running at http://${HOST}:${PORT}`);
});
