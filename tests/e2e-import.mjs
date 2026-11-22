// Browser test for real-data features: roll import (PDF text layer + image OCR), review,
// commit, field capture by a booth agent link. Usage: node tests/e2e-import.mjs [baseUrl] [shotsDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5174';
const SHOTS = process.argv[3] || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = [];
const errors = [];
const step = async (name, fn) => { try { await fn(); results.push(`✓ ${name}`); } catch (e) { results.push(`✗ ${name}: ${e.message.split('\n')[0]}`); } };
const api = async (p, opts = {}) => {
  const r = await fetch(BASE + '/api' + p, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return r.json();
};

// Set up an active candidate with booth 7 via the API (the UI sign-up is covered in e2e.mjs).
const mobile = '9' + String(Math.floor(100000000 + Math.random() * 899999999));
const sent = await api('/auth/otp/send', { method: 'POST', body: { mobile } });
const { verifyToken } = await api('/auth/otp/verify', { method: 'POST', body: { mobile, code: sent.devCode } });
const reg = await api('/auth/register', { method: 'POST', body: { fullName: 'Roll Tester', mobile, role: 'confirmed', affiliation: 'independent', electionType: 'assembly', assemblyId: 9, booths: [6, 7, 8], passcode: 'test1234', consent: true, verifyToken } });
const pay = await api('/me/payments', { method: 'POST', token: reg.token });
await api(`/me/payments/${pay.payment.id}/utr`, { method: 'POST', token: reg.token, body: { utr: String(Date.now()).slice(-12) } });
const adm = await api('/auth/login', { method: 'POST', body: { mobile: '9999999999', passcode: 'admin1234' } });
await api(`/admin/payments/${pay.payment.id}/approve`, { method: 'POST', token: adm.token });

const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(([s]) => localStorage.setItem('sethu.session', s), [JSON.stringify({ token: reg.token, user: reg.user })]);
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/tile\.openstreetmap|401|favicon/.test(m.text()) && errors.push(m.text()));

await step('import a digital PDF (text layer) → review → save', async () => {
  await page.goto(`${BASE}/app/import`);
  await page.getByText('Drop the roll PDF').waitFor();
  await page.locator('select').first().selectOption('7');
  await page.locator('.dropzone input[type=file]').setInputFiles(path.resolve('tests/fixtures/sample-roll.pdf'));
  await page.getByText(/Review 15 voters/).waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${SHOTS}/20-import-review.png`, fullPage: true });
  const firstName = await page.locator('.review-tbl tbody tr').first().locator('input.cell').nth(2).inputValue();
  if (firstName !== 'Lakshmi R') throw new Error('first name parsed as ' + firstName);
  await page.getByText('Corporation Middle School, Kutchery Road').first().waitFor();
  await page.getByRole('button', { name: /Save 15 voters/ }).click();
  await page.getByText(/Saved: 15 new/).waitFor();
});

await step('imported voters replace the sample in Voters list', async () => {
  await page.goto(`${BASE}/app/voters?booth=7`);
  await page.getByText('15 matching').waitFor();
  await page.getByText('Lakshmi R').first().waitFor();
  await page.locator('.tag', { hasText: 'Roll' }).first().waitFor();
  await page.screenshot({ path: `${SHOTS}/21-voters-real.png` });
});

await step('import a scanned image with offline OCR (Tamil+English Tesseract)', async () => {
  await page.goto(`${BASE}/app/import`);
  await page.locator('select').first().selectOption('8');
  await page.locator('.dropzone input[type=file]').setInputFiles(path.resolve('tests/fixtures/sample-roll.png'));
  await page.getByText(/Review \d+ voters/).waitFor({ timeout: 240000 });
  const heading = await page.getByText(/Review \d+ voters/).textContent();
  const n = Number(heading.match(/\d+/)[0]);
  results.push(`  · OCR found ${n}/15 voter boxes on the scanned page`);
  if (n < 10) throw new Error(`OCR found only ${n} voters`);
  await page.screenshot({ path: `${SHOTS}/22-import-ocr.png`, fullPage: true });
  await page.getByRole('button', { name: 'Discard import' }).click().catch(() => {});
});

await step('booth agent field link: capture by photo (OCR) and save', async () => {
  page.once('dialog', (d) => d.accept());
  await page.goto(`${BASE}/app/team`);
  await page.getByLabel('Name').fill('Kathir');
  await page.locator('form').filter({ hasText: 'Add a volunteer' }).locator('input[inputmode=numeric]').fill('9876500111');
  await page.locator('form').filter({ hasText: 'Add a volunteer' }).getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Add volunteer' }).click();
  await page.getByText('Volunteer added').waitFor();
  const team = await api('/me/team', { token: reg.token });
  const vol = team.volunteers.find((v) => v.name === 'Kathir');
  const { path: fieldPath } = await api(`/me/volunteers/${vol.id}/link`, { method: 'POST', token: reg.token });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  m.setDefaultTimeout(20000);
  m.on('pageerror', (e) => errors.push('agent: ' + e.message));
  await m.goto(BASE + fieldPath);
  await m.getByText('Vanakkam, Kathir').waitFor();
  await m.locator('input[type=file][capture]').setInputFiles(path.resolve('tests/fixtures/sample-card.jpg'));
  await m.getByText(/Details filled in|Some details were unclear/).waitFor({ timeout: 240000 });
  const epic = await m.getByLabel('EPIC number').inputValue();
  results.push(`  · capture prefilled EPIC "${epic}", name "${await m.getByLabel('Name (English)').inputValue()}"`);
  await m.getByLabel('Mobile (optional)').fill('9840012345');
  await m.getByRole('button', { name: 'Save voter' }).click();
  await m.getByText('Confirm the voter agreed').first().waitFor();
  await m.getByRole('checkbox', { name: /The voter agreed to share/ }).check();
  await m.getByRole('button', { name: 'Supporter' }).click();
  await m.getByRole('button', { name: 'Save voter' }).click();
  await m.getByText(/Matched an existing voter|New voter saved/).waitFor();
  await m.screenshot({ path: `${SHOTS}/23-agent-capture.png`, fullPage: true });
  await phone.close();
});

await step('candidate sees captured mobile + supporter tag', async () => {
  const v = await api('/me/voters?booth=7&sentiment=supporter', { token: reg.token });
  if (!v.voters.some((x) => x.mobile === '9840012345')) throw new Error('captured voter not found with mobile');
});

await browser.close();
console.log(results.join('\n'));
console.log(errors.length ? `\nPage errors:\n${[...new Set(errors)].join('\n')}` : '\nNo page errors.');
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
