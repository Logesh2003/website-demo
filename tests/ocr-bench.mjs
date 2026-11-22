// Measures offline OCR accuracy on the Tamil sample roll, field by field.
// Usage (server running): node tests/ocr-bench.mjs [baseUrl] [fixture] [expected.json]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5174';
const FIX = process.argv[3] || 'tests/fixtures/sample-roll-ta.png';
const EXP = JSON.parse(fs.readFileSync(process.argv[4] || 'tests/fixtures/sample-roll-ta.expected.json', 'utf8'));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const api = async (p, o = {}) => (await fetch(BASE + '/api' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })).json();

const mobile = '9' + String(Math.floor(100000000 + Math.random() * 899999999));
const sent = await api('/auth/otp/send', { method: 'POST', body: { mobile } });
const { verifyToken } = await api('/auth/otp/verify', { method: 'POST', body: { mobile, code: sent.devCode } });
const reg = await api('/auth/register', { method: 'POST', body: { fullName: 'OCR Bench', mobile, role: 'confirmed', affiliation: 'independent', electionType: 'assembly', assemblyId: 9, booths: [9], passcode: 'test1234', consent: true, verifyToken } });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(([s]) => localStorage.setItem('sethu.session', s), [JSON.stringify({ token: reg.token, user: reg.user })]);
const page = await ctx.newPage();
let rawText = '';
page.on('request', (r) => { if (r.url().includes('/pages') && r.method() === 'POST') { try { rawText += JSON.parse(r.postData()).text || ''; } catch { /* image */ } } });
const t0 = Date.now();
await page.goto(`${BASE}/app/import`);
await page.locator('.dropzone input[type=file]').setInputFiles(path.resolve(FIX));
await page.getByText(/Review \d+ voters|No voter boxes/).waitFor({ timeout: 300000 });
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const { imports } = await api('/imports', { token: reg.token });
const { import: imp } = await api(`/imports/${imports[0].id}`, { token: reg.token });
await browser.close();

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const fields = ['epic', 'nameTamil', 'relationType', 'houseNo', 'age', 'gender'];
const score = Object.fromEntries(fields.map((f) => [f, 0]));
let found = 0;
const misses = [];
for (const e of EXP) {
  const r = imp.rows.find((x) => x.epic === e.epic) || imp.rows.find((x) => x.serial === e.serial);
  if (!r) { misses.push(`#${e.serial} not found`); continue; }
  found++;
  for (const f of fields) {
    const got = f === 'nameTamil' ? norm(r.nameTamil || r.name) : f === 'age' ? Number(r.age) : norm(r[f]);
    const want = f === 'age' ? Number(e[f]) : norm(e[f]);
    if (got === want) score[f]++; else misses.push(`#${e.serial} ${f}: got "${got}" want "${want}"`);
  }
}
console.log(`Found ${found}/${EXP.length} voters (${imp.rows.length} rows) in ${secs}s`);
for (const f of fields) console.log(`  ${f.padEnd(13)} ${score[f]}/${EXP.length}`);
console.log('Header:', JSON.stringify(imp.header));
console.log(misses.slice(0, 40).join('\n'));
if (process.env.RAW) fs.writeFileSync(process.env.RAW, rawText);
