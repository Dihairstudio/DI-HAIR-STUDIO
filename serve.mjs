/* Static file server for production hosting (Railway).
   The site itself is plain HTML/CSS/JS — this only hands the files over.
   No dependencies: Node's http + fs only, so the build has nothing to install.

   node serve.mjs            # local test  -> http://localhost:8080
   PORT=8099 node serve.mjs  # Railway sets PORT itself

   Serves index.html at "/", keeps every relative path working
   (css/…, js/…, pages/…, assets/…) and blocks path traversal. */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* URL -> file inside ROOT, or null when missing/outside the project.
   Dot files/folders (.git, .vscode, .env …) are never served. */
function resolveFile(url) {
  let p = decodeURIComponent(String(url || '/').split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p.split(/[/\\]/).some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..')) return null;
  const target = resolve(join(ROOT, normalize(p).replace(/^[/\\]+/, '')));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  let info;
  try { info = statSync(target); } catch { return null; }
  if (!info.isFile()) return null;
  return { file: target, size: info.size };
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method Not Allowed');
  }
  const hit = resolveFile(req.url);
  if (!hit) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  const ext = extname(hit.file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': hit.size,
    /* HTML always revalidated so a deploy shows up immediately; assets are
       safe to cache for an hour (they carry the content in the file name). */
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(hit.file).on('error', () => res.destroy()).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`DI HAIR STUDIO — static server on http://${HOST}:${PORT} (root ${ROOT})`);
});
