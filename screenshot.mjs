import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'temporary screenshots');

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Auto-increment filename, never overwrite
function nextFilename(label) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
  const nums  = files.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? '0')).filter(Boolean);
  const next  = nums.length ? Math.max(...nums) + 1 : 1;
  return label
    ? `screenshot-${next}-${label}.png`
    : `screenshot-${next}.png`;
}

const url   = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// Scroll through page to trigger IntersectionObserver callbacks
await page.evaluate(async () => {
  const totalHeight = document.body.scrollHeight;
  const step = 400;
  for (let y = 0; y < totalHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
// Let animations settle
await new Promise(r => setTimeout(r, 1000));

const filename = nextFilename(label);
const outPath  = path.join(dir, filename);
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`screenshot saved → temporary screenshots/${filename}`);
