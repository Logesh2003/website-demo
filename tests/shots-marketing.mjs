// Captures real screenshots of the running app for the marketing site.
// Usage: node tests/shots-marketing.mjs [baseUrl]  → writes client/public/images/app-*.jpg
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'client/public/images';
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const call = async (p, token, body, method) => (await fetch(BASE + '/api' + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })).json();

// Seed the demo with realistic tagging so the strength map has colour.
const demo = (await (await fetch(BASE + '/api/auth/demo', { method: 'POST' })).json());
const S = ['supporter', 'supporter', 'leaning', 'neutral', 'opposed'];
let k = 0;
for (const [i, b] of demo.user.booths.entries()) {
  const list = await call(`/me/voters?booth=${b}&pageSize=100`, demo.token);
  const bias = [0, 0, 1, 3, 0, 4, 1, 0, 2, 4, 0, 1][i % 12];
  for (const v of list.voters.slice(0, 70)) {
    const s = S[(k++ * 7 + bias * 3) % 5 === 4 && bias < 3 ? 2 : (k * 3 + bias) % 5];
    await call(`/me/voters/${v.id}/tag`, demo.token, { sentiment: s, contacted: k % 3 === 0 }, 'PUT');
  }
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
await desk.addInitScript(([s]) => { localStorage.setItem('sethu.session', s); localStorage.setItem('sethu.lang', 'en'); }, [JSON.stringify({ token: demo.token, user: demo.user })]);
const p = await desk.newPage();
const hideBanner = () => p.addStyleTag({ content: '.banner{display:none!important}' });

await p.goto(`${BASE}/app`); await p.getByText('Voters in your booths').waitFor(); await hideBanner(); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/app-overview.jpg`, type: 'jpeg', quality: 82, clip: { x: 240, y: 0, width: 1040, height: 640 } });

await p.goto(`${BASE}/app/booths`); await p.locator('.leaflet-container').waitFor(); await hideBanner(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/app-booths.jpg`, type: 'jpeg', quality: 82, clip: { x: 240, y: 0, width: 1040, height: 560 } });

await p.goto(`${BASE}/app/voters?booth=${demo.user.booths[0]}`); await p.locator('.tbl tbody tr').first().waitFor(); await hideBanner();
await p.locator('.tbl tbody tr').nth(2).click(); await p.getByRole('dialog').waitFor(); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/app-voter.jpg`, type: 'jpeg', quality: 82, clip: { x: 600, y: 0, width: 680, height: 720 } });

await p.goto(`${BASE}/app/import`); await p.getByText('Drop the roll PDF').waitFor(); await hideBanner();
await p.locator('select').first().selectOption(String(demo.user.booths[6]));
await p.locator('.dropzone input[type=file]').setInputFiles(path.resolve('tests/fixtures/sample-roll.pdf'));
await p.getByText(/Review \d+ voters/).waitFor({ timeout: 60000 }); await p.waitForTimeout(300);
const rv = await p.locator('section', { hasText: /Review \d+ voters/ }).last().boundingBox();
await p.screenshot({ path: `${OUT}/app-import.jpg`, type: 'jpeg', quality: 82, fullPage: true, clip: { x: rv.x, y: rv.y, width: rv.width, height: Math.min(rv.height, 520) } });

// Phone: field capture with a photo read
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.addInitScript(([s]) => { localStorage.setItem('sethu.session', s); localStorage.setItem('sethu.lang', 'en'); }, [JSON.stringify({ token: demo.token, user: demo.user })]);
const m = await phone.newPage();
await m.goto(`${BASE}/app/capture`); await m.getByText('Field capture').first().waitFor(); await m.addStyleTag({ content: '.banner{display:none!important}' });
await m.locator('input[type=file][capture]').setInputFiles(path.resolve('tests/fixtures/sample-card.jpg'));
await m.getByText(/Details filled in|Some details were unclear/).waitFor({ timeout: 240000 });
await m.waitForTimeout(3500); // let the toast clear
await m.getByRole('button', { name: 'Supporter' }).click();
await m.evaluate(() => window.scrollTo(0, 0));
await m.waitForTimeout(300);
await m.screenshot({ path: `${OUT}/app-capture-phone.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 390, height: 780 } });

await browser.close();
console.log('screenshots written to', OUT);
