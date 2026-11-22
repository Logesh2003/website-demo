// End-to-end smoke test against a running server (npm run build && npm start).
// Usage: node tests/e2e.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const SHOTS = process.argv[3] || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(`✓ ${name}`); } catch (e) { results.push(`✗ ${name}: ${e.message.split('\n')[0]}`); }
};
const mobile = '9' + String(Math.floor(100000000 + Math.random() * 899999999));

async function newPage(viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('tile.openstreetmap') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const noHScroll = async (page) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) throw new Error(`horizontal overflow ${over}px`);
};

const page = await newPage();

await step('landing renders + language toggle', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: true });
  await page.getByRole('button', { name: 'தமிழ்' }).first().click();
  await page.getByText('கைபேசியிலிருந்தே').first().waitFor();
  await page.screenshot({ path: `${SHOTS}/02-landing-ta.png` });
  await page.getByRole('button', { name: 'EN' }).first().click();
});

await step('pricing calculator responds', async () => {
  await page.locator('input[type=range]').fill('30');
  await page.getByText('₹28,320').waitFor({ timeout: 3000 });
});

await step('register: verify mobile with OTP', async () => {
  await page.goto(`${BASE}/register?utm_source=e2e`);
  await page.getByLabel('Full name').fill('Kavitha Raman');
  await page.getByLabel('WhatsApp number').fill(mobile);
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.locator('.alert-brand b').textContent()).trim();
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByText('Verified:').waitFor();
  await page.screenshot({ path: `${SHOTS}/03-register-verify.png` });
  await page.getByRole('button', { name: /Continue/ }).click();
});

await step('register: role validation + selection', async () => {
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByText('Choose your role.').waitFor();
  await page.getByText('Confirmed candidate').click();
  await page.getByText('Independent', { exact: true }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
});

await step('register: constituency + booth picker + live quote', async () => {
  await page.getByLabel('District', { exact: true }).selectOption('Chennai');
  await page.getByLabel('Assembly constituency', { exact: true }).selectOption({ label: 'Mylapore' });
  await page.locator('.booth-row').first().waitFor();
  await page.getByPlaceholder('Search booth number').fill('Gandhi');
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await page.locator('.quote-box').waitFor();
  await page.screenshot({ path: `${SHOTS}/04-register-booths.png` });
  await page.getByRole('button', { name: /Continue/ }).click();
});

await step('register: passcode + consent → account created', async () => {
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Please accept to continue.').waitFor();
  await page.getByLabel('Create a passcode').fill('vote2026');
  await page.locator('.check input').check();
  await page.screenshot({ path: `${SHOTS}/05-register-review.png` });
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Your workspace is ready').waitFor();
  await page.screenshot({ path: `${SHOTS}/06-register-done.png` });
});

await step('workspace overview (free preview)', async () => {
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await page.getByText('Voters in your booths').waitFor();
  await page.getByText('Free preview.').waitFor();
  await page.screenshot({ path: `${SHOTS}/07-overview-preview.png`, fullPage: true });
});

await step('voters masked in preview', async () => {
  await page.goto(`${BASE}/app/voters`);
  await page.locator('.tbl tbody tr').first().waitFor();
  const name = await page.locator('.tbl tbody tr td b').first().textContent();
  if (!name.includes('••••')) throw new Error('name not masked: ' + name);
});

await step('billing: UPI QR + UTR submission', async () => {
  await page.goto(`${BASE}/app/billing`);
  await page.getByRole('button', { name: /Pay .* by UPI/ }).click();
  await page.locator('img.qr').waitFor();
  await page.getByLabel(/12-digit UTR/).fill('12345');
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await page.getByText('UTR is the 12-digit number').first().waitFor();
  await page.screenshot({ path: `${SHOTS}/08-billing-qr.png` });
  await page.getByLabel(/12-digit UTR/).fill(String(Date.now()).slice(-12));
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await page.getByText('Payment under review.').waitFor();
});

await step('admin approves payment', async () => {
  const admin = await newPage();
  await admin.goto(`${BASE}/login`);
  await admin.getByLabel('WhatsApp number').fill('9999999999');
  await admin.getByLabel('Passcode', { exact: true }).fill('admin1234');
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.getByText('Admin console').waitFor();
  await admin.getByRole('row', { name: /Kavitha Raman/ }).getByRole('button', { name: 'Approve' }).click();
  await admin.getByText('Approved — plan is now active').waitFor();
  await admin.screenshot({ path: `${SHOTS}/09-admin.png`, fullPage: true });
});

await step('active plan: names visible, tag voter, household', async () => {
  await page.goto(`${BASE}/app/voters`);
  await page.locator('.tbl tbody tr').first().waitFor();
  const name = await page.locator('.tbl tbody tr td b').first().textContent();
  if (name.includes('••••')) throw new Error('still masked');
  await page.locator('.tbl tbody tr').first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Supporter' }).click();
  await page.getByText('Saved').waitFor();
  await page.screenshot({ path: `${SHOTS}/10-voter-drawer.png` });
  await page.keyboard.press('Escape');
});

await step('booth map + report', async () => {
  await page.goto(`${BASE}/app/booths`);
  await page.locator('.leaflet-container').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/11-booths.png`, fullPage: true });
  await page.getByRole('link', { name: 'Report' }).first().click();
  await page.getByText(/Booth #\d+ report/).waitFor();
});

await step('outreach: segment preview + send for review', async () => {
  await page.goto(`${BASE}/app/outreach`);
  await page.getByText('Only first-time voters').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByText(/Sent for review/).waitFor();
  await page.screenshot({ path: `${SHOTS}/12-outreach.png`, fullPage: true });
});

await step('team: add task and move it', async () => {
  await page.goto(`${BASE}/app/team`);
  await page.getByLabel('New task').fill('Visit senior citizens in section 1');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByText('Visit senior citizens in section 1').waitFor();
  await page.locator('.task', { hasText: 'Visit senior citizens' }).getByRole('button', { name: '→ In progress' }).click();
  await page.locator('.lane', { hasText: 'In progress' }).getByText('Visit senior citizens').waitFor();
});

await step('login with passcode + wrong passcode error', async () => {
  const p = await newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel('WhatsApp number').fill(mobile);
  await p.getByLabel('Passcode', { exact: true }).fill('wrong999');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByText('incorrect').waitFor();
  await p.getByLabel('Passcode', { exact: true }).fill('vote2026');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByText('Voters in your booths').waitFor();
});

await step('mobile layouts (390px): no horizontal scroll', async () => {
  const m = await newPage({ width: 390, height: 844 });
  for (const [path, file] of [['/', '13-mobile-landing'], ['/register', '14-mobile-register']]) {
    await m.goto(BASE + path);
    await m.waitForTimeout(300);
    await noHScroll(m);
    await m.screenshot({ path: `${SHOTS}/${file}.png`, fullPage: path === '/' });
  }
  await m.getByRole('link', { name: 'Sign in' }).first().click();
  await m.getByRole('button', { name: 'Try the demo' }).click();
  await m.getByText('Voters in your booths').waitFor();
  await noHScroll(m);
  await m.screenshot({ path: `${SHOTS}/15-mobile-overview.png`, fullPage: true });
  await m.goto(`${BASE}/app/voters`);
  await m.locator('.tbl tbody tr').first().waitFor();
  await noHScroll(m);
});

await step('dark mode renders', async () => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1366, height: 860 } });
  const d = await ctx.newPage();
  await d.goto(BASE);
  await d.getByRole('heading', { level: 1 }).waitFor();
  await d.screenshot({ path: `${SHOTS}/16-dark-landing.png` });
});

await browser.close();
console.log(results.join('\n'));
console.log(errors.length ? `\nConsole errors:\n${[...new Set(errors)].join('\n')}` : '\nNo console errors.');
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
