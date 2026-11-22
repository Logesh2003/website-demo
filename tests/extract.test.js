import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { parseRollText, parseCardText } from '../server/lib/rollParse.js';
import { setExtractClient, normaliseVoter } from '../server/lib/extract.js';

const EN_PAGE = `Assembly Constituency No and Name : 25 - Mylapore  Part No. : 3
Section No and Name : 1-Kutchery Road
1 ABC1234567
Name : Lakshmi R
Husband's Name: Ramesh K
House Number : 12/4
Age : 34 Gender : Female
2 ABC1234568
Name : Ramesh K
Father's Name: Kannan
House Number : 12/4
Age : 39 Gender : Male
3 XYZ7654321
Name ; Selvi M
Father's Name - Murugan
House No. 15
Age: 19 Gender: Female`;

const TA_PAGE = `4 TNA0001112
பெயர் : முருகன் சு
தந்தையின் பெயர் : சுப்பையா
வீட்டு எண் : 7
வயது : 52 பாலினம் : ஆண்
5 TNA0001113
பெயர் : வள்ளி மு
கணவர் பெயர் : முருகன்
வீட்டு எண் : 7
வயது : 47 பாலினம் : பெண்`;

describe('OCR text parser', () => {
  it('parses English roll boxes, including noisy separators', () => {
    const r = parseRollText(EN_PAGE);
    expect(r.header).toMatchObject({ assemblyNo: '25', partNo: '3' });
    expect(r.voters).toHaveLength(3);
    expect(r.voters[0]).toMatchObject({ serial: 1, epic: 'ABC1234567', epicValid: true, name: 'Lakshmi R', relationType: 'Husband', relationName: 'Ramesh K', houseNo: '12/4', age: 34, gender: 'F' });
    expect(r.voters[2]).toMatchObject({ epic: 'XYZ7654321', name: 'Selvi M', relationType: 'Father', age: 19, gender: 'F', houseNo: '15' });
  });
  it('parses Tamil roll boxes and keeps Tamil names', () => {
    const r = parseRollText(TA_PAGE);
    expect(r.voters).toHaveLength(2);
    expect(r.voters[0]).toMatchObject({ serial: 4, epic: 'TNA0001112', nameTamil: 'முருகன் சு', relationType: 'Father', age: 52, gender: 'M', houseNo: '7' });
    expect(r.voters[1]).toMatchObject({ relationType: 'Husband', gender: 'F', age: 47 });
  });
  it('handles real Tamil OCR output: zero-width joiners, wrapped values, photo-box noise', async () => {
    const fs = await import('node:fs');
    const raw = fs.readFileSync('tests/fixtures/ocr-raw-ta.txt', 'utf8');
    const expected = JSON.parse(fs.readFileSync('tests/fixtures/sample-roll-ta.expected.json', 'utf8'));
    const r = parseRollText(raw);
    expect(r.header).toMatchObject({ assemblyNo: '25', assemblyName: 'மயிலாப்பூர்', partNo: '7' });
    expect(r.voters).toHaveLength(15);
    const bySerial = new Map(r.voters.map((v) => [v.serial, v]));
    const right = (f) => expected.filter((e) => bySerial.get(e.serial)?.[f] === e[f]).length;
    expect(right('relationType')).toBeGreaterThanOrEqual(14);
    expect(right('houseNo')).toBeGreaterThanOrEqual(14);
    expect(right('age')).toBeGreaterThanOrEqual(14);
    expect(right('gender')).toBeGreaterThanOrEqual(14);
    expect(right('nameTamil')).toBeGreaterThanOrEqual(9);
    expect(bySerial.get(4).relationName).toBe('சுப்பையா'); // value wrapped to next line, 'ட' noise dropped
    expect(bySerial.get(5).relationName).toBe('முருகன் சு'); // wrapped initial joined back
  });

  it('full offline pipeline output (preprocessed + English EPIC pass) stays at measured accuracy', async () => {
    const fs = await import('node:fs');
    const r = parseRollText(fs.readFileSync('tests/fixtures/ocr-raw-ta-2.txt', 'utf8'));
    const expected = JSON.parse(fs.readFileSync('tests/fixtures/sample-roll-ta.expected.json', 'utf8'));
    const by = new Map(r.voters.map((v) => [v.serial, v]));
    const right = (f) => expected.filter((e) => by.get(e.serial)?.[f] === e[f]).length;
    expect(r.voters).toHaveLength(15);
    expect(right('epic')).toBeGreaterThanOrEqual(14);
    expect(right('nameTamil')).toBeGreaterThanOrEqual(12);
    for (const f of ['relationType', 'houseNo', 'age', 'gender']) expect(right(f)).toBe(15);
    expect(by.get(14)).toMatchObject({ nameTamil: 'கார்த்திக் ரா', relationType: 'Father', relationName: 'ராஜேந்திரன்' });
  });

  it('reads an EPIC card', () => {
    const c = parseCardText('ELECTION COMMISSION OF INDIA\nIDENTITY CARD\nKLM 4455667\nName : Arun Kumar\nFather\'s Name : Selvam\nGender : Male\nDate of Birth : 01/01/2000');
    expect(c).toMatchObject({ documentType: 'epic_card', epic: 'KLM4455667', name: 'Arun Kumar', gender: 'M', confidence: 'medium' });
    expect(c.age).toBeGreaterThanOrEqual(25);
  });
  it('normalises bad values safely', () => {
    expect(normaliseVoter({ epic: 'ab c12-34567', age: 7, gender: 'X' })).toMatchObject({ epic: 'ABC1234567', epicValid: true, age: 0, gender: '' });
  });
});

describe('roll import + field capture', () => {
  let app, tok, admin;
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  beforeAll(async () => {
    process.env.SETHU_EXTRACT_ENGINE = '';
    app = createApp({ db: openDb(':memory:'), devOtp: true });
    const mobile = '9123400001';
    const s = await request(app).post('/api/auth/otp/send').send({ mobile });
    const v = await request(app).post('/api/auth/otp/verify').send({ mobile, code: s.body.devCode });
    const r = await request(app).post('/api/auth/register').send({ fullName: 'Import Tester', mobile, role: 'confirmed', affiliation: 'independent', electionType: 'assembly', assemblyId: 9, booths: [3, 4], passcode: 'test1234', consent: true, verifyToken: v.body.verifyToken });
    tok = r.body.token;
    admin = (await request(app).post('/api/auth/login').send({ mobile: '9999999999', passcode: 'admin1234' })).body.token;
  });
  afterAll(() => setExtractClient(null));

  it('rejects imports for booths outside the plan', async () => {
    const r = await request(app).post('/api/imports').set(bearer(tok)).send({ assemblyId: 9, boothNo: 50, engine: 'ocr' });
    expect(r.status).toBe(403);
  });

  it('imports OCR text, lets the user review, and commits real voters that replace the sample', async () => {
    const before = await request(app).get('/api/me/booths').set(bearer(tok));
    expect(before.body.booths.find((b) => b.no === 3).hasRoll).toBe(false);

    const imp = (await request(app).post('/api/imports').set(bearer(tok)).send({ assemblyId: 9, boothNo: 3, filename: 'part3.pdf', engine: 'ocr' })).body.import;
    expect(imp.engine).toBe('ocr');
    const p1 = await request(app).post(`/api/imports/${imp.id}/pages`).set(bearer(tok)).send({ page: 1, text: EN_PAGE });
    expect(p1.body.found).toBe(3);
    const p2 = await request(app).post(`/api/imports/${imp.id}/pages`).set(bearer(tok)).send({ page: 2, text: TA_PAGE });
    expect(p2.body.found).toBe(2);
    // Re-running page 1 replaces it instead of duplicating
    await request(app).post(`/api/imports/${imp.id}/pages`).set(bearer(tok)).send({ page: 1, text: EN_PAGE });
    let got = (await request(app).get(`/api/imports/${imp.id}`).set(bearer(tok))).body.import;
    expect(got.rows).toHaveLength(5);

    // Review: fix a name, exclude one row
    got.rows[2].name = 'Selvi Murugan';
    got.rows[4].include = false;
    expect((await request(app).put(`/api/imports/${imp.id}/rows`).set(bearer(tok)).send({ rows: got.rows })).status).toBe(200);
    const c = await request(app).post(`/api/imports/${imp.id}/commit`).set(bearer(tok));
    expect(c.body).toMatchObject({ inserted: 4, updated: 0 });
    expect((await request(app).post(`/api/imports/${imp.id}/commit`).set(bearer(tok))).status).toBe(409);

    const after = await request(app).get('/api/me/booths').set(bearer(tok));
    const b3 = after.body.booths.find((b) => b.no === 3);
    expect(b3).toMatchObject({ hasRoll: true, voters: 4 });

    // Activate plan so names are visible
    const pay = await request(app).post('/api/me/payments').set(bearer(tok));
    await request(app).post(`/api/me/payments/${pay.body.payment.id}/utr`).set(bearer(tok)).send({ utr: '998877665544' });
    await request(app).post(`/api/admin/payments/${pay.body.payment.id}/approve`).set(bearer(admin));
    const list = await request(app).get('/api/me/voters?booth=3').set(bearer(tok));
    expect(list.body.voters.map((v) => v.name)).toContain('Selvi Murugan');
    expect(list.body.voters.find((v) => v.epic === 'ABC1234567').source).toBe('roll_import');
  });

  it('re-importing the same EPICs updates instead of duplicating', async () => {
    const imp = (await request(app).post('/api/imports').set(bearer(tok)).send({ assemblyId: 9, boothNo: 3, engine: 'ocr' })).body.import;
    await request(app).post(`/api/imports/${imp.id}/pages`).set(bearer(tok)).send({ page: 1, text: EN_PAGE });
    const c = await request(app).post(`/api/imports/${imp.id}/commit`).set(bearer(tok));
    expect(c.body).toMatchObject({ inserted: 0, updated: 3 });
  });

  it('uses Claude when configured (mocked) and handles refusals', async () => {
    let call;
    setExtractClient({ beta: { messages: { create: async (params) => {
      call = params;
      if (params.messages[0].content[1].text.includes('electoral roll')) {
        return { stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ pageType: 'voter_list', header: { assemblyNo: '25', assemblyName: 'Mylapore', partNo: '4', pollingStation: 'Corporation School, Kutchery Road', sectionName: '' }, voters: [{ serial: 1, epic: 'QWE1112223', name: 'Divya S', nameTamil: 'திவ்யா சு', relationType: 'Father', relationName: 'Suresh', houseNo: '3', age: 28, gender: 'F', deleted: false }] }) }] };
      }
      return { stop_reason: 'refusal', content: [] };
    } } } });
    const status = await request(app).get('/api/extract/status').set(bearer(tok));
    expect(status.body.claude).toBe(true);
    const imp = (await request(app).post('/api/imports').set(bearer(tok)).send({ assemblyId: 9, boothNo: 4, engine: 'claude' })).body.import;
    expect(imp.engine).toBe('claude');
    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const p = await request(app).post(`/api/imports/${imp.id}/pages`).set(bearer(tok)).send({ page: 1, image: img });
    expect(p.body.voters[0]).toMatchObject({ name: 'Divya S', nameTamil: 'திவ்யா சு', epicValid: true });
    expect(call.output_config.format.type).toBe('json_schema');
    expect(call.fallbacks).toBe('default');
    expect(call.model).toBe('claude-opus-5-5');
    await request(app).post(`/api/imports/${imp.id}/commit`).set(bearer(tok));
    const booths = (await request(app).get('/api/me/booths').set(bearer(tok))).body.booths;
    expect(booths.find((b) => b.no === 4).name).toBe('Corporation School, Kutchery Road');

    const refused = await request(app).post('/api/capture/extract').set(bearer(tok)).send({ image: img });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('EXTRACT_REFUSED');
    expect((await request(app).post('/api/capture/extract').set(bearer(tok)).send({ image: 'data:text/plain;base64,aGk=' })).status).toBe(422);
    setExtractClient(null);
  });

  it('booth agent link: capture, EPIC match enriches existing voter, consent required for mobile', async () => {
    const vol = await request(app).post('/api/me/volunteers').set(bearer(tok)).send({ name: 'Kathir', mobile: '9876512345', booths: [3] });
    const link = await request(app).post(`/api/me/volunteers/${vol.body.id}/link`).set(bearer(tok));
    const agentTok = link.body.path.split('/field/')[1];
    const agent = { 'x-agent-token': agentTok };
    const me = await request(app).get('/api/agent/me').set(agent);
    expect(me.body).toMatchObject({ booths: [3], volunteer: { name: 'Kathir' } });

    expect((await request(app).post('/api/capture/voters').set(agent).send({ boothNo: 4, name: 'X Y' })).status).toBe(422); // not their booth
    const noConsent = await request(app).post('/api/capture/voters').set(agent).send({ boothNo: 3, epic: 'ABC1234567', name: 'Lakshmi R', mobile: '9840011223' });
    expect(noConsent.body.fields).toHaveProperty('consentMobile');

    const m = await request(app).post('/api/capture/voters').set(agent).send({ boothNo: 3, epic: 'ABC1234567', name: 'Lakshmi R', mobile: '9840011223', consentMobile: true, sentiment: 'supporter' });
    expect(m.body).toMatchObject({ matched: true, voterId: '9-3-1' });
    const fresh = await request(app).post('/api/capture/voters').set(agent).send({ boothNo: 3, epic: 'NEW1234567', name: 'New Voter', age: 18, gender: 'M' });
    expect(fresh.body.matched).toBe(false);

    const v = await request(app).get('/api/me/voters/9-3-1').set(bearer(tok));
    expect(v.body.voter.mobile).toBe('9840011223');
    expect(v.body.voter.tag.sentiment).toBe('supporter');
    const recent = await request(app).get('/api/capture/recent').set(agent);
    expect(recent.body.voters.map((x) => x.epic)).toContain('NEW1234567');

    await request(app).delete(`/api/me/volunteers/${vol.body.id}`).set(bearer(tok));
    expect((await request(app).get('/api/agent/me').set(agent)).status).toBe(401);
  });

  it('demo workspace cannot write real data', async () => {
    const demo = (await request(app).post('/api/auth/demo')).body.token;
    const r = await request(app).post('/api/capture/voters').set(bearer(demo)).send({ boothNo: (await request(app).get('/api/me').set(bearer(demo))).body.user.booths[0], name: 'Demo Person' });
    expect(r.body.demo).toBe(true);
  });
});
