// C2 Cosmetic Golden generator/verifier (Section 159E).
// Serves the frontend root and renders tests/c2-golden/c2-cosmetics.html through
// the REAL shared render module, then writes three permanent cosmetic golden PNGs:
// parity, z-model combinations, and shop-preview (protecting the 159D face fix).
// Run from the frontend root:  node tests/c2-golden/c2-cosmetics.run.mjs
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.css':'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('requestfailed', r => errs.push('asset failed: ' + r.url()));
await page.goto(`http://localhost:${port}/tests/c2-golden/c2-cosmetics.html`, { waitUntil: 'networkidle' });
await page.waitForFunction('window.__done === true', { timeout: 15000 });

const map = {
  sheetParity: 'tests/c2-golden/c2-cosmetics-parity.png',
  sheetCombos: 'tests/c2-golden/c2-cosmetics-combos.png',
  sheetShop:   'tests/c2-golden/c2-cosmetics-shop.png',
};
for (const [id, file] of Object.entries(map)) {
  await (await page.$('#' + id)).screenshot({ path: file });
}
await browser.close(); server.close();
console.log('errors:', errs.length ? errs : 'none');
console.log('goldens written:', Object.values(map).join(', '));
process.exit(errs.length ? 1 : 0);
