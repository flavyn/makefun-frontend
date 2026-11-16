import { createRequire } from 'node:module';
const require = createRequire('D:/dipsik/bugbounty/browser/');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 160)); });
for (const hash of ['#/', '#/bounty/makefun-frontend-01', '#/bounty/makefun-frontend-01/leaderboard', '#/u/nightshift-labs', '#/?q=code&sort=pot', '#/nope']) {
  await page.goto('http://127.0.0.1:8124/' + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 20000 }).catch(() => errors.push('READY TIMEOUT ' + hash));
  await page.waitForTimeout(350);
  const info = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    rows: document.querySelectorAll('.lrow').length,
    stats: document.querySelectorAll('.stat').length,
    h1: document.querySelector('h1')?.textContent?.slice(0, 60) ?? '',
    net: document.getElementById('nettext')?.textContent ?? '',
    view: document.getElementById('view').innerHTML.length,
  }));
  console.log(hash.padEnd(42), JSON.stringify(info));
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
