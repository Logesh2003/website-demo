import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { quote } from '../server/lib/pricing.js';
import { validateRegistration, isMobile, isPasscode } from '../server/lib/validate.js';
import { votersForBooth } from '../server/lib/voters.js';
import { hmac } from '../server/lib/security.js';

process.env.SETHU_WEBHOOK_SECRET = 'whsec_test';
let app;
beforeAll(() => { app = createApp({ db: openDb(':memory:'), devOtp: true }); });

const MOBILE = '9123456780';
const base = {
  fullName: 'Kavitha Raman', mobile: MOBILE, role: 'confirmed', affiliation: 'independent', electionType: 'assembly',
  assemblyId: 9, booths: [1, 2, 3], passcode: 'vote2026', consent: true,
};

async function verify(mobile, purpose = 'register') {
  const s = await request(app).post('/api/auth/otp/send').send({ mobile, purpose });
  expect(s.status).toBe(200);
  const v = await request(app).post('/api/auth/otp/verify').send({ mobile, code: s.body.devCode });
  expect(v.status).toBe(200);
  return v.body.verifyToken;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('pure helpers', () => {
  it('prices by tier with GST', () => {
    expect(quote(1)).toMatchObject({ base: 1500, gst: 270, total: 1770 });
    expect(quote(6)).toMatchObject({ tier: 'cluster', base: 11000 });
    expect(quote(500).tier).toBe('constituency');
    expect(quote('junk').boothCount).toBe(1);
  });
  it('validates mobiles and passcodes', () => {
    expect(isMobile('9876543210')).toBe(true);
    expect(isMobile('1234567890')).toBe(false);
    expect(isMobile('98765')).toBe(false);
    expect(isPasscode('abc123')).toBe(true);
    expect(isPasscode('123456')).toBe(false);
  });
  it('requires local-body fields only for local elections', () => {
    expect(validateRegistration(base)).toEqual({});
    const e = validateRegistration({ ...base, electionType: 'rural' });
    expect(Object.keys(e).sort()).toEqual(['localBody', 'position', 'wardNumber']);
  });
  it('accepts Tamil script names', () => {
    expect(validateRegistration({ ...base, fullName: 'கவிதா ராமன்' }).fullName).toBeUndefined();
  });
  it('generates deterministic synthetic rolls', () => {
    const a = votersForBooth(9, 1);
    const b = votersForBooth(9, 1);
    expect(a.length).toBeGreaterThan(600);
    expect(a[0]).toEqual(b[0]);
  });
});

describe('registration flow', () => {
  it('rejects registration without OTP verification', async () => {
    const r = await request(app).post('/api/auth/register').send(base);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('MOBILE_NOT_VERIFIED');
  });

  it('locks OTP after too many wrong attempts', async () => {
    const m = '9000011111';
    await request(app).post('/api/auth/otp/send').send({ mobile: m });
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/otp/verify').send({ mobile: m, code: '000000' });
    const r = await request(app).post('/api/auth/otp/verify').send({ mobile: m, code: '000000' });
    expect(r.body.error).toBe('OTP_LOCKED');
  });

  it('returns field errors for invalid data', async () => {
    const token = await verify('9000022222');
    const r = await request(app).post('/api/auth/register').send({ ...base, mobile: '9000022222', verifyToken: token, passcode: 'short', booths: [] });
    expect(r.status).toBe(422);
    expect(r.body.fields).toHaveProperty('passcode');
    expect(r.body.fields).toHaveProperty('booths');
  });

  it('registers, blocks duplicates, and logs in', async () => {
    const token = await verify(MOBILE);
    const r = await request(app).post('/api/auth/register').send({ ...base, verifyToken: token, booths: [3, 1, 2, 2, 9999] });
    expect(r.status).toBe(201);
    expect(r.body.user.booths).toEqual([1, 2, 3]);
    expect(r.body.user.status).toBe('registered');
    expect(r.body.quote.total).toBe(5310);

    const dup = await request(app).post('/api/auth/otp/send').send({ mobile: MOBILE, purpose: 'register' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/auth/login').send({ mobile: MOBILE, passcode: 'wrong1' });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send({ mobile: MOBILE, passcode: 'vote2026' });
    expect(ok.status).toBe(200);
  });
});

describe('candidate workspace', () => {
  let token;
  beforeAll(async () => {
    token = (await request(app).post('/api/auth/login').send({ mobile: MOBILE, passcode: 'vote2026' })).body.token;
  });

  it('masks voters before payment and blocks paid features', async () => {
    const r = await request(app).get('/api/me/voters').set(bearer(token));
    expect(r.body.masked).toBe(true);
    expect(r.body.voters[0].name).toContain('••••');
    expect(r.body.voters[0].mobile).toBeNull();
    expect((await request(app).get('/api/me/export.csv').set(bearer(token))).status).toBe(402);
    expect((await request(app).put(`/api/me/voters/${r.body.voters[0].id}/tag`).set(bearer(token)).send({ sentiment: 'supporter' })).status).toBe(402);
  });

  it('cannot read voters outside own booths', async () => {
    const r = await request(app).get('/api/me/voters/9-50-1').set(bearer(token));
    expect(r.status).toBe(404);
  });

  it('runs UPI payment → UTR → admin approval → unmasked data', async () => {
    const p = await request(app).post('/api/me/payments').set(bearer(token));
    expect(p.status).toBe(200);
    expect(p.body.upi).toMatch(/^upi:\/\/pay\?/);
    expect(p.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(p.body.payment.total).toBe(5310);

    expect((await request(app).post(`/api/me/payments/${p.body.payment.id}/utr`).set(bearer(token)).send({ utr: '123' })).status).toBe(422);
    const u = await request(app).post(`/api/me/payments/${p.body.payment.id}/utr`).set(bearer(token)).send({ utr: '412345678901' });
    expect(u.body.status).toBe('submitted');

    const adminTok = (await request(app).post('/api/auth/login').send({ mobile: '9999999999', passcode: 'admin1234' })).body.token;
    expect((await request(app).get('/api/admin/payments').set(bearer(token))).status).toBe(403);
    const pending = await request(app).get('/api/admin/payments').set(bearer(adminTok));
    expect(pending.body.payments).toHaveLength(1);
    await request(app).post(`/api/admin/payments/${p.body.payment.id}/approve`).set(bearer(adminTok));

    const v = await request(app).get('/api/me/voters?q=a').set(bearer(token));
    expect(v.body.masked).toBe(false);
    const csv = await request(app).get('/api/me/export.csv?booth=1').set(bearer(token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('EPIC');
    const audit = await request(app).get('/api/admin/audit').set(bearer(adminTok));
    expect(audit.body.audit.some((a) => a.action === 'export_csv')).toBe(true);
  });

  it('tags voters and reflects sentiment in segments', async () => {
    const list = await request(app).get('/api/me/voters?booth=1&pageSize=10').set(bearer(token));
    for (const v of list.body.voters.slice(0, 4)) {
      const t = await request(app).put(`/api/me/voters/${v.id}/tag`).set(bearer(token)).send({ sentiment: 'supporter', contacted: true });
      expect(t.status).toBe(200);
    }
    const seg = await request(app).post('/api/me/segments/preview').set(bearer(token)).send({ segment: { sentiments: ['supporter'] } });
    expect(seg.body.audience).toBe(4);
    const ov = await request(app).get('/api/me/overview').set(bearer(token));
    expect(ov.body.sentiment.supporter).toBe(4);
    expect(ov.body.totals.contacted).toBe(4);
  });

  it('creates broadcast requests with cost estimate', async () => {
    const r = await request(app).post('/api/me/broadcasts').set(bearer(token)).send({ channel: 'sms', message: 'Vanakkam! Please vote on polling day.', segment: { booths: [1] } });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending_review');
    expect(r.body.cost.total).toBeGreaterThan(0);
  });

  it('manages volunteers and tasks scoped to own booths', async () => {
    expect((await request(app).post('/api/me/volunteers').set(bearer(token)).send({ name: 'Arun', mobile: '123' })).status).toBe(422);
    const v = await request(app).post('/api/me/volunteers').set(bearer(token)).send({ name: 'Arun', mobile: '9876500009', booths: [1, 77] });
    expect(v.status).toBe(201);
    expect((await request(app).post('/api/me/tasks').set(bearer(token)).send({ title: 'Outside booth', boothNo: 77 })).status).toBe(422);
    const t = await request(app).post('/api/me/tasks').set(bearer(token)).send({ title: 'Door-to-door', boothNo: 1, volunteerId: v.body.id });
    expect((await request(app).patch(`/api/me/tasks/${t.body.id}`).set(bearer(token)).send({ status: 'done' })).status).toBe(200);
    const team = await request(app).get('/api/me/team').set(bearer(token));
    expect(team.body.volunteers[0].booths).toEqual([1]);
  });
});

describe('security', () => {
  it('rejects tampered tokens', async () => {
    const r = await request(app).get('/api/me').set(bearer('eyJ1aWQiOjF9.forged'));
    expect(r.status).toBe(401);
  });
  it('verifies webhook signatures', async () => {
    const tok = (await request(app).post('/api/auth/demo')).body.token;
    expect(tok).toBeTruthy();
    const body = JSON.stringify({ ref: 'NOPE', amount: 1 });
    expect((await request(app).post('/api/payments/webhook').set('x-sethu-signature', 'bad').set('content-type', 'application/json').send(body)).status).toBe(401);
    const ok = await request(app).post('/api/payments/webhook').set('x-sethu-signature', hmac(body, 'whsec_test')).set('content-type', 'application/json').send(body);
    expect(ok.status).toBe(404); // signature fine, unknown ref
  });
  it('returns JSON 404 for unknown API routes', async () => {
    const r = await request(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('NOT_FOUND');
  });
});
