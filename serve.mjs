// 零相依的本地伺服器。用法：node serve.mjs [埠號=8080]
// 送出 COOP/COEP 標頭（之後若把模擬搬進 Worker + SharedArrayBuffer 會用到）。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const port = +(process.argv[2] ?? process.env.PORT ?? 8080);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); }
}).listen(port, '0.0.0.0', () => {
  console.log(`極簡塔防・日夜潮汐 → http://localhost:${port}/`);
  console.log(`壓力測試     → http://localhost:${port}/?bench=12000`);
  // 同一個 Wi-Fi 下的手機可以用這些網址開
  for (const list of Object.values(networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`手機（同一個 Wi-Fi）→ http://${a.address}:${port}/`);
  }
});
