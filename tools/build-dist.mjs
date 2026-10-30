// 產生可直接部署的靜態網站資料夾 dist/（Cloudflare Pages、GitHub Pages、Netlify 都能用）。
// 用法：node tools/build-dist.mjs
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'index.html'), join(dist, 'index.html'));
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true });
// Cloudflare Pages 的標頭設定：程式檔每次都檢查是否有新版，避免更新後手機還在跑舊版
await writeFile(join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
/src/*
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
`);
console.log('已產生 dist/：index.html、src/、_headers');
