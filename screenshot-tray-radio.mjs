import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/catering.html', { waitUntil: 'networkidle0', timeout: 30000 });
// Wait for React to render
await page.waitForSelector('.ct-add-btn', { timeout: 10000 });
await new Promise(r => setTimeout(r, 1000));

const nextIdx = () => fs.readdirSync('./temporary screenshots').filter(f => f.endsWith('.png')).length + 1;

const allBtns = await page.$$('.ct-add-btn');
console.log('ct-add-btn found:', allBtns.length);

// Open poke tray modal (first button)
await allBtns[0].click();
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: `./temporary screenshots/screenshot-${nextIdx()}-poke-tray-radio.png` });

// Close
const closeBtn = await page.$('.ct-modal-close');
if (closeBtn) {
  await closeBtn.click();
  await new Promise(r => setTimeout(r, 700));
}

// Re-query and open sides modal (0=poke,1=premium,2=cooked,3=tofu, then sides: 4=rice,5=greens,6=sides)
const btns2 = await page.$$('.ct-add-btn');
await btns2[6].click();
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: `./temporary screenshots/screenshot-${nextIdx()}-sides-radio.png` });

await browser.close();
console.log('done');
