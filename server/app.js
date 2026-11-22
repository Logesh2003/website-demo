import express from 'express';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { openDb } from './db.js';
import { DISTRICTS, ASSEMBLIES, assemblyById, boothsFor, LOCAL_BODY_POSITIONS } from './data/geo.js';
import { votersForBooth, maskVoter, ageBand, AGE_BANDS } from './lib/voters.js';
import { TIERS, quote, broadcastCost, BROADCAST_RATES, GST_RATE } from './lib/pricing.js';
import { signToken, verifyToken, hashSecret, checkSecret, hmac, otpCode } from './lib/security.js';
import { isMobile, isPasscode, isUtr, validateRegistration, PARTIES, ROLES } from './lib/validate.js';
import { sendOtp } from './lib/notify.js';
import { claudeEnabled, extractRollPage, extractCard, normaliseVoter } from './lib/extract.js';
import { parseRollText, parseCardText } from './lib/rollParse.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const SENTIMENTS = ['supporter', 'leaning', 'neutral', 'opposed'];
const UPI_VPA = process.env.SETHU_UPI_VPA || 'sethu.demo@upi';

export function createApp({ db = openDb(), devOtp = process.env.NODE_ENV !== 'production' || process.env.SETHU_DEV_OTP === '1' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const json = express.json({ limit: '100kb' });
  const bigJson = express.json({ limit: '8mb' }); // page images / field photos
  const BIG = /^\/api\/(imports\/\d+\/pages|capture\/extract)$/;
  // The webhook needs the raw body for signature checks, so skip JSON parsing there.
  app.use((req, res, next) => (req.path === '/api/payments/webhook' ? next() : BIG.test(req.path) ? bigJson(req, res, next) : json(req, res, next)));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
    next();
  });

  // ---------- helpers ----------
  const q = (sql) => db.prepare(sql);
  const log = (kind, mobile = null, meta = null) => q('INSERT INTO events (kind, mobile, meta) VALUES (?, ?, ?)').run(kind, mobile, meta ? JSON.stringify(meta) : null);
  const audit = (userId, action, detail) => q('INSERT INTO audit (user_id, action, detail) VALUES (?, ?, ?)').run(userId, action, detail ? JSON.stringify(detail) : null);
  const fail = (res, status, code, message, extra = {}) => res.status(status).json({ error: code, message, ...extra });

  const buckets = new Map();
  const limiter = (max, windowMs) => (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, t: now };
    if (now - b.t > windowMs) { b.n = 0; b.t = now; }
    b.n++;
    buckets.set(key, b);
    if (b.n > max) return fail(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.');
    next();
  };

  const publicUser = (u) => u && ({
    id: u.id, mobile: u.mobile, fullName: u.full_name, role: u.role, affiliation: u.affiliation, party: u.party,
    electionType: u.election_type, position: u.position, localBody: u.local_body, wardNumber: u.ward_number,
    district: u.district, assemblyId: u.assembly_id, assemblyName: assemblyById(u.assembly_id)?.name || null,
    booths: JSON.parse(u.booths || '[]'), status: u.status, isAdmin: !!u.is_admin, isDemo: !!u.is_demo,
    lang: u.lang, electionDate: u.election_date, createdAt: u.created_at,
  });

  function auth(req, res, next) {
    const token = (req.get('authorization') || '').replace(/^Bearer /, '');
    const p = verifyToken(token);
    if (!p || p.typ !== 'session') return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in again.');
    const u = q('SELECT * FROM users WHERE id = ?').get(p.uid);
    if (!u) return fail(res, 401, 'UNAUTHENTICATED', 'Account not found.');
    req.user = u;
    req.booths = JSON.parse(u.booths || '[]');
    next();
  }
  const admin = (req, res, next) => (req.user.is_admin ? next() : fail(res, 403, 'FORBIDDEN', 'Admins only.'));
  const session = (u) => ({ token: signToken({ typ: 'session', uid: u.id }), user: publicUser(u) });

  const tagsFor = (uid) => {
    const m = new Map();
    for (const t of q('SELECT voter_id, sentiment, note, contacted FROM voter_tags WHERE user_id = ?').all(uid)) m.set(t.voter_id, t);
    return m;
  };
  const rollFor = (u, booths) => booths.flatMap((no) => boothRoll(u.assembly_id, no));
  const isActive = (u) => u.status === 'active';

  // ---------- roll data: real first, synthetic sample only where nothing real exists ----------
  const SYNTHETIC = process.env.SETHU_SYNTHETIC !== '0';
  const realRowsStmt = q('SELECT * FROM voters WHERE assembly_id = ? AND booth_no = ? AND deleted = 0 ORDER BY serial');
  const toVoter = (r) => ({
    id: `${r.assembly_id}-${r.booth_no}-${r.serial}`, serial: r.serial, epic: r.epic || '', name: r.name, nameTamil: r.name_ta || '',
    relation: r.relation || '', relationName: r.relation_name || '', age: r.age || 0, gender: r.gender || '',
    house: r.house || '', houseKey: (r.house || '').split('/')[0] || `s${r.serial}`, section: r.section || 1, mobile: r.mobile || null,
    assemblyId: r.assembly_id, boothNo: r.booth_no, source: r.source,
  });
  /** Voters for one booth. Imported roll replaces the sample; field captures are added on top. */
  function boothRoll(aid, no) {
    const rows = realRowsStmt.all(aid, no).map(toVoter);
    if (rows.some((r) => r.source === 'roll_import')) return rows;
    const sample = SYNTHETIC ? votersForBooth(aid, no).map((v) => ({ ...v, source: 'sample' })) : [];
    return [...sample, ...rows];
  }
  function boothList(aid) {
    const meta = new Map(q('SELECT * FROM booth_meta WHERE assembly_id = ?').all(aid).map((m) => [m.booth_no, m]));
    const counts = new Map(q(`SELECT booth_no, COUNT(*) n, SUM(source = 'roll_import') r FROM voters WHERE assembly_id = ? AND deleted = 0 GROUP BY booth_no`).all(aid).map((r) => [r.booth_no, r]));
    return boothsFor(aid).map((b) => {
      const m = meta.get(b.no);
      const c = counts.get(b.no);
      const hasRoll = !!c?.r;
      return {
        ...b, name: m?.name || b.name, address: m?.address || null, lat: m?.lat ?? b.lat, lng: m?.lng ?? b.lng,
        voters: hasRoll ? c.n : (SYNTHETIC ? b.voters : 0) + (c?.n || 0), hasRoll, sample: !hasRoll && SYNTHETIC,
      };
    });
  }

  function matchSegment(v, s, tags) {
    if (s.booths?.length && !s.booths.includes(v.boothNo)) return false;
    if (s.gender && v.gender !== s.gender) return false;
    if (s.ageMin && v.age < Number(s.ageMin)) return false;
    if (s.ageMax && v.age > Number(s.ageMax)) return false;
    if (s.firstTime && v.age > 19) return false;
    if (s.hasMobile && !v.mobile) return false;
    if (s.sentiments?.length) {
      const sen = tags.get(v.id)?.sentiment || 'unknown';
      if (!s.sentiments.includes(sen)) return false;
    }
    if (s.q) {
      const needle = String(s.q).toLowerCase();
      if (!v.name.toLowerCase().includes(needle) && !v.epic.toLowerCase().includes(needle) && !(v.relationName || '').toLowerCase().includes(needle)) return false;
    }
    return true;
  }
  const cleanSegment = (s = {}) => ({
    booths: Array.isArray(s.booths) ? s.booths.map(Number).filter(Number.isFinite) : [],
    gender: ['M', 'F', 'T'].includes(s.gender) ? s.gender : '',
    ageMin: s.ageMin ? Math.max(18, Number(s.ageMin)) : '',
    ageMax: s.ageMax ? Math.min(120, Number(s.ageMax)) : '',
    firstTime: !!s.firstTime,
    hasMobile: !!s.hasMobile,
    sentiments: Array.isArray(s.sentiments) ? s.sentiments.filter((x) => [...SENTIMENTS, 'unknown'].includes(x)) : [],
    q: typeof s.q === 'string' ? s.q.slice(0, 60) : '',
  });

  // ---------- public ----------
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/public/meta', (req, res) => {
    res.json({
      districts: DISTRICTS.map((d) => d.name),
      parties: PARTIES, roles: ROLES, positions: LOCAL_BODY_POSITIONS,
      tiers: TIERS.map((t) => ({ ...t, maxBooths: Number.isFinite(t.maxBooths) ? t.maxBooths : null })),
      gstRate: GST_RATE, broadcastRates: BROADCAST_RATES, devOtp,
    });
  });

  app.get('/api/public/assemblies', (req, res) => {
    const { district } = req.query;
    const list = ASSEMBLIES.filter((a) => !district || a.district === district).map(({ id, name, district: d, boothCount }) => ({ id, name, district: d, boothCount }));
    res.json({ assemblies: list });
  });

  app.get('/api/public/assemblies/:id/booths', (req, res) => {
    const ac = assemblyById(req.params.id);
    if (!ac) return fail(res, 404, 'NOT_FOUND', 'Constituency not found.');
    res.json({ assembly: { id: ac.id, name: ac.name, district: ac.district, lat: ac.lat, lng: ac.lng }, booths: boothList(ac.id) });
  });

  app.get('/api/public/quote', (req, res) => res.json(quote(req.query.booths)));

  const TRACK_KINDS = ['landing_view', 'register_start', 'register_step', 'demo_open', 'pricing_view'];
  app.post('/api/public/track', limiter(60, 60_000), (req, res) => {
    const { kind, meta } = req.body || {};
    if (!TRACK_KINDS.includes(kind)) return fail(res, 400, 'BAD_KIND', 'Unknown event.');
    log(kind, null, typeof meta === 'object' ? meta : null);
    res.json({ ok: true });
  });

  // ---------- auth ----------
  app.post('/api/auth/otp/send', limiter(10, 60_000), async (req, res) => {
    const { mobile, purpose = 'register', lang } = req.body || {};
    if (!isMobile(mobile)) return fail(res, 400, 'INVALID_MOBILE', 'Enter a valid 10-digit mobile number.');
    const user = q('SELECT id FROM users WHERE mobile = ?').get(mobile);
    if (purpose === 'register' && user) return fail(res, 409, 'ALREADY_REGISTERED', 'This number already has an account. Sign in instead.');
    if (purpose !== 'register' && !user) return fail(res, 404, 'NOT_REGISTERED', 'No account for this number yet. Create one first.');

    const now = Date.now();
    const row = q('SELECT * FROM otps WHERE mobile = ?').get(mobile);
    let sends = 1;
    let windowStart = now;
    if (row && now - row.window_start < 3600_000) {
      if (row.sends >= OTP_MAX_SENDS_PER_HOUR) return fail(res, 429, 'OTP_LIMIT', 'Too many codes requested. Try again in an hour.');
      sends = row.sends + 1;
      windowStart = row.window_start;
    }
    const code = otpCode();
    q(`INSERT INTO otps (mobile, code_hash, expires_at, attempts, sends, window_start) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(mobile) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sends = excluded.sends, window_start = excluded.window_start`)
      .run(mobile, hmac(`${mobile}:${code}`), now + OTP_TTL_MS, sends, windowStart);
    try {
      const { channel } = await sendOtp(mobile, code, lang);
      log('otp_sent', mobile, { purpose, channel });
      res.json({ sent: true, channel, expiresIn: OTP_TTL_MS / 1000, ...(devOtp ? { devCode: code } : {}) });
    } catch (e) {
      fail(res, 502, 'OTP_SEND_FAILED', 'Could not send the code right now. Please try again.');
    }
  });

  app.post('/api/auth/otp/verify', limiter(20, 60_000), (req, res) => {
    const { mobile, code } = req.body || {};
    const row = isMobile(mobile) && q('SELECT * FROM otps WHERE mobile = ?').get(mobile);
    if (!row) return fail(res, 400, 'OTP_INVALID', 'Request a new code.');
    if (row.expires_at < Date.now()) return fail(res, 400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
    if (row.attempts >= OTP_MAX_ATTEMPTS) return fail(res, 429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
    if (hmac(`${mobile}:${String(code)}`) !== row.code_hash) {
      q('UPDATE otps SET attempts = attempts + 1 WHERE mobile = ?').run(mobile);
      return fail(res, 400, 'OTP_WRONG', 'That code is not right.', { attemptsLeft: OTP_MAX_ATTEMPTS - row.attempts - 1 });
    }
    q('UPDATE otps SET expires_at = 0 WHERE mobile = ?').run(mobile); // single use
    log('otp_verified', mobile);
    res.json({ verifyToken: signToken({ typ: 'mobile', mobile }, 30 * 60) });
  });

  const verifiedMobile = (t) => {
    const p = verifyToken(t);
    return p?.typ === 'mobile' ? p.mobile : null;
  };

  app.post('/api/auth/register', limiter(10, 60_000), (req, res) => {
    const b = req.body || {};
    const mobile = verifiedMobile(b.verifyToken);
    if (!mobile || mobile !== b.mobile) return fail(res, 400, 'MOBILE_NOT_VERIFIED', 'Verify your mobile number with the code first.');
    const errors = validateRegistration(b);
    const ac = assemblyById(b.assemblyId);
    if (!ac) errors.assemblyId = 'Choose a valid constituency.';
    const valid = new Set(boothsFor(b.assemblyId).map((x) => x.no));
    const booths = [...new Set((b.booths || []).map(Number))].filter((n) => valid.has(n)).sort((a, c) => a - c);
    if (ac && booths.length === 0) errors.booths = 'Pick at least one booth.';
    if (Object.keys(errors).length) return fail(res, 422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: errors });
    if (q('SELECT 1 FROM users WHERE mobile = ?').get(mobile)) return fail(res, 409, 'ALREADY_REGISTERED', 'This number already has an account.');

    const attribution = b.attribution && typeof b.attribution === 'object' ? JSON.stringify(b.attribution).slice(0, 1000) : null;
    const info = q(`INSERT INTO users (mobile, full_name, role, affiliation, party, election_type, position, local_body, ward_number,
      district, assembly_id, booths, passcode_hash, lang, consent_at, consent_ip, attribution, election_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`).run(
      mobile, b.fullName.trim(), b.role, b.affiliation, b.affiliation === 'party' ? b.party : null, b.electionType,
      b.electionType === 'assembly' ? null : b.position, b.electionType === 'assembly' ? null : String(b.localBody).trim(),
      b.electionType === 'assembly' ? null : String(b.wardNumber), ac.district, ac.id, JSON.stringify(booths),
      hashSecret(b.passcode), b.lang === 'ta' ? 'ta' : 'en', req.ip, attribution, null);
    const u = q('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    log('registered', mobile, { assembly: ac.id, booths: booths.length });
    audit(u.id, 'register', { booths: booths.length, consent: true });
    res.status(201).json({ ...session(u), quote: quote(booths.length) });
  });

  app.post('/api/auth/login', limiter(10, 60_000), (req, res) => {
    const { mobile, passcode } = req.body || {};
    const u = isMobile(mobile) && q('SELECT * FROM users WHERE mobile = ?').get(mobile);
    if (!u || !checkSecret(passcode, u.passcode_hash)) return fail(res, 401, 'BAD_CREDENTIALS', 'Mobile number or passcode is incorrect.');
    log('login', mobile, { method: 'passcode' });
    res.json(session(u));
  });

  app.post('/api/auth/login-otp', limiter(10, 60_000), (req, res) => {
    const mobile = verifiedMobile(req.body?.verifyToken);
    const u = mobile && q('SELECT * FROM users WHERE mobile = ?').get(mobile);
    if (!u) return fail(res, 401, 'BAD_CREDENTIALS', 'Verification failed. Request a new code.');
    log('login', mobile, { method: 'otp' });
    res.json(session(u));
  });

  app.post('/api/auth/reset-passcode', limiter(10, 60_000), (req, res) => {
    const mobile = verifiedMobile(req.body?.verifyToken);
    const u = mobile && q('SELECT * FROM users WHERE mobile = ?').get(mobile);
    if (!u) return fail(res, 401, 'BAD_CREDENTIALS', 'Verification failed. Request a new code.');
    if (!isPasscode(req.body.passcode)) return fail(res, 422, 'VALIDATION', 'Passcode needs 6+ characters with letters and numbers.');
    q('UPDATE users SET passcode_hash = ? WHERE id = ?').run(hashSecret(req.body.passcode), u.id);
    audit(u.id, 'passcode_reset');
    res.json(session(u));
  });

  app.post('/api/auth/demo', limiter(20, 60_000), (req, res) => {
    const u = q('SELECT * FROM users WHERE is_demo = 1 LIMIT 1').get();
    log('demo_open');
    res.json(session(u));
  });

  // ---------- candidate ----------
  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  app.patch('/api/me', auth, (req, res) => {
    const { lang, electionDate } = req.body || {};
    if (lang && ['en', 'ta'].includes(lang)) q('UPDATE users SET lang = ? WHERE id = ?').run(lang, req.user.id);
    if (electionDate !== undefined) {
      if (electionDate && !/^\d{4}-\d{2}-\d{2}$/.test(electionDate)) return fail(res, 422, 'VALIDATION', 'Use YYYY-MM-DD.');
      q('UPDATE users SET election_date = ? WHERE id = ?').run(electionDate || null, req.user.id);
    }
    res.json({ user: publicUser(q('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });

  app.get('/api/me/overview', auth, (req, res) => {
    const u = req.user;
    const roll = rollFor(u, req.booths);
    const tags = tagsFor(u.id);
    const gender = { M: 0, F: 0, T: 0 };
    const ages = Object.fromEntries(AGE_BANDS.map((b) => [b, { M: 0, F: 0, T: 0 }]));
    const sentiment = { supporter: 0, leaning: 0, neutral: 0, opposed: 0, unknown: 0 };
    let ageSum = 0, withMobile = 0, firstTime = 0, contacted = 0;
    for (const v of roll) {
      gender[v.gender]++;
      ages[ageBand(v.age)][v.gender]++;
      ageSum += v.age;
      if (v.mobile) withMobile++;
      if (v.age <= 19) firstTime++;
      const t = tags.get(v.id);
      sentiment[t?.sentiment || 'unknown']++;
      if (t?.contacted) contacted++;
    }
    const taskCounts = Object.fromEntries(q('SELECT status, COUNT(*) n FROM tasks WHERE user_id = ? GROUP BY status').all(u.id).map((r) => [r.status, r.n]));
    res.json({
      plan: { status: u.status, active: isActive(u), quote: quote(req.booths.length || 1) },
      assembly: assemblyById(u.assembly_id) || null,
      totals: { booths: req.booths.length, voters: roll.length, withMobile, firstTime, contacted, avgAge: roll.length ? +(ageSum / roll.length).toFixed(1) : 0 },
      gender, ages, sentiment,
      tasks: { todo: taskCounts.todo || 0, doing: taskCounts.doing || 0, done: taskCounts.done || 0 },
      volunteers: q('SELECT COUNT(*) n FROM volunteers WHERE user_id = ?').get(u.id).n,
      electionDate: u.election_date,
    });
  });

  app.get('/api/me/booths', auth, (req, res) => {
    const u = req.user;
    const tags = tagsFor(u.id);
    const all = new Map(boothList(u.assembly_id).map((b) => [b.no, b]));
    const booths = req.booths.map((no) => {
      const b = all.get(no);
      const roll = boothRoll(u.assembly_id, no);
      const s = { supporter: 0, leaning: 0, neutral: 0, opposed: 0 };
      let F = 0, young = 0;
      for (const v of roll) {
        if (v.gender === 'F') F++;
        if (v.age <= 29) young++;
        const sen = tags.get(v.id)?.sentiment;
        if (sen) s[sen]++;
      }
      const tagged = s.supporter + s.leaning + s.neutral + s.opposed;
      // Strength: weighted support among tagged voters (0–100), null until 5% tagged.
      const strength = tagged >= roll.length * 0.05 ? Math.round(((s.supporter + s.leaning * 0.5) / tagged) * 100) : null;
      return { ...b, voters: roll.length, female: F, male: roll.length - F, young, sentiment: s, tagged, coverage: Math.round((tagged / roll.length) * 100), strength };
    });
    res.json({ booths, center: assemblyById(u.assembly_id) });
  });

  app.get('/api/me/booths/:no/report', auth, (req, res) => {
    const no = Number(req.params.no);
    if (!req.booths.includes(no)) return fail(res, 404, 'NOT_FOUND', 'Booth not in your plan.');
    const u = req.user;
    const roll = boothRoll(u.assembly_id, no);
    const booth = boothList(u.assembly_id).find((b) => b.no === no);
    const ages = Object.fromEntries(AGE_BANDS.map((b) => [b, 0]));
    const sections = {};
    roll.forEach((v) => { ages[ageBand(v.age)]++; sections[v.section] = (sections[v.section] || 0) + 1; });
    const families = new Set(roll.map((v) => v.houseKey)).size;
    res.json({ booth, assembly: assemblyById(u.assembly_id), voters: roll.length, families, ages, sections,
      gender: { M: roll.filter((v) => v.gender === 'M').length, F: roll.filter((v) => v.gender === 'F').length, T: roll.filter((v) => v.gender === 'T').length } });
  });

  app.get('/api/me/voters', auth, (req, res) => {
    const u = req.user;
    const tags = tagsFor(u.id);
    const s = cleanSegment({ ...req.query, booths: req.query.booth ? [req.query.booth] : [], sentiments: req.query.sentiment ? [req.query.sentiment] : [], firstTime: req.query.firstTime === '1', hasMobile: req.query.hasMobile === '1' });
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const page = Math.max(1, Number(req.query.page) || 1);
    const active = isActive(u);
    // Search by name/EPIC is a paid feature; free preview can only filter demographics.
    if (!active) s.q = '';
    const matched = rollFor(u, req.booths).filter((v) => matchSegment(v, s, tags));
    const slice = matched.slice((page - 1) * pageSize, page * pageSize).map((v) => {
      const out = active ? v : maskVoter(v);
      return { ...out, tag: tags.get(v.id) || null };
    });
    res.json({ total: matched.length, page, pageSize, masked: !active, voters: slice });
  });

  const findVoter = (u, booths, id) => {
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(id || '');
    if (!m || Number(m[1]) !== u.assembly_id || !booths.includes(Number(m[2]))) return null;
    return boothRoll(u.assembly_id, Number(m[2])).find((v) => v.id === id) || null;
  };

  app.get('/api/me/voters/:id', auth, (req, res) => {
    const v = findVoter(req.user, req.booths, req.params.id);
    if (!v) return fail(res, 404, 'NOT_FOUND', 'Voter not found in your booths.');
    const tags = tagsFor(req.user.id);
    const active = isActive(req.user);
    const family = boothRoll(v.assemblyId, v.boothNo).filter((x) => x.houseKey === v.houseKey && x.id !== v.id)
      .map((x) => ({ ...(active ? x : maskVoter(x)), tag: tags.get(x.id) || null }));
    res.json({ voter: { ...(active ? v : maskVoter(v)), tag: tags.get(v.id) || null }, family });
  });

  app.put('/api/me/voters/:id/tag', auth, (req, res) => {
    if (!isActive(req.user)) return fail(res, 402, 'PLAN_REQUIRED', 'Activate your plan to tag voters.');
    const v = findVoter(req.user, req.booths, req.params.id);
    if (!v) return fail(res, 404, 'NOT_FOUND', 'Voter not found in your booths.');
    const { sentiment = null, note = '', contacted = false } = req.body || {};
    if (sentiment && !SENTIMENTS.includes(sentiment)) return fail(res, 422, 'VALIDATION', 'Unknown sentiment.');
    q(`INSERT INTO voter_tags (user_id, voter_id, sentiment, note, contacted, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, voter_id) DO UPDATE SET sentiment = excluded.sentiment, note = excluded.note, contacted = excluded.contacted, updated_at = excluded.updated_at`)
      .run(req.user.id, v.id, sentiment, String(note).slice(0, 500), contacted ? 1 : 0);
    res.json({ ok: true, tag: { sentiment, note, contacted: contacted ? 1 : 0 } });
  });

  app.get('/api/me/export.csv', auth, (req, res) => {
    if (!isActive(req.user)) return fail(res, 402, 'PLAN_REQUIRED', 'Activate your plan to export voter lists.');
    const tags = tagsFor(req.user.id);
    const s = cleanSegment({ booths: req.query.booth ? [req.query.booth] : [] });
    const rows = rollFor(req.user, req.booths).filter((v) => matchSegment(v, s, tags));
    audit(req.user.id, 'export_csv', { rows: rows.length, booth: req.query.booth || 'all' });
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const head = ['Booth', 'Serial', 'EPIC', 'Name', 'Relation', 'Relation name', 'Age', 'Gender', 'House', 'Section', 'Mobile', 'Sentiment'];
    const body = rows.map((v) => [v.boothNo, v.serial, v.epic, v.name, v.relation, v.relationName, v.age, v.gender, v.house, v.section, v.mobile, tags.get(v.id)?.sentiment].map(esc).join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sethu-voters.csv"' });
    res.send('﻿' + [head.map(esc).join(','), ...body].join('\n'));
  });

  // Outreach
  app.post('/api/me/segments/preview', auth, (req, res) => {
    const s = cleanSegment(req.body?.segment);
    s.booths = s.booths.filter((b) => req.booths.includes(b));
    const tags = tagsFor(req.user.id);
    const matched = rollFor(req.user, req.booths).filter((v) => matchSegment(v, s, tags));
    const reachable = matched.filter((v) => v.mobile).length;
    res.json({ audience: matched.length, reachable, costs: Object.fromEntries(Object.keys(BROADCAST_RATES).map((c) => [c, broadcastCost(c, reachable)])) });
  });

  app.post('/api/me/broadcasts', auth, (req, res) => {
    if (!isActive(req.user)) return fail(res, 402, 'PLAN_REQUIRED', 'Activate your plan to send broadcasts.');
    const { channel, message, scheduledFor } = req.body || {};
    if (!BROADCAST_RATES[channel]) return fail(res, 422, 'VALIDATION', 'Choose SMS, WhatsApp or voice.');
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > (channel === 'sms' ? 320 : 1000)) return fail(res, 422, 'VALIDATION', 'Message length is not valid for this channel.');
    const s = cleanSegment(req.body.segment);
    s.booths = s.booths.filter((b) => req.booths.includes(b));
    s.hasMobile = true;
    const tags = tagsFor(req.user.id);
    const audience = rollFor(req.user, req.booths).filter((v) => matchSegment(v, s, tags)).length;
    if (!audience) return fail(res, 422, 'EMPTY_AUDIENCE', 'No reachable voters match this segment.');
    const cost = broadcastCost(channel, audience);
    const info = q('INSERT INTO broadcasts (user_id, channel, segment, message, audience, cost, scheduled_for) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, channel, JSON.stringify(s), message.trim(), audience, cost.total, scheduledFor || null);
    audit(req.user.id, 'broadcast_request', { id: Number(info.lastInsertRowid), channel, audience });
    res.status(201).json({ id: Number(info.lastInsertRowid), audience, cost, status: 'pending_review' });
  });

  app.get('/api/me/broadcasts', auth, (req, res) => {
    res.json({ broadcasts: q('SELECT * FROM broadcasts WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id).map((b) => ({ ...b, segment: JSON.parse(b.segment) })) });
  });

  // Team
  app.get('/api/me/team', auth, (req, res) => {
    res.json({
      volunteers: q('SELECT * FROM volunteers WHERE user_id = ? ORDER BY id').all(req.user.id).map((v) => ({ ...v, booths: JSON.parse(v.booths) })),
      tasks: q('SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC').all(req.user.id),
    });
  });
  app.post('/api/me/volunteers', auth, (req, res) => {
    const { name, mobile, booths = [] } = req.body || {};
    if (!name || String(name).trim().length < 2) return fail(res, 422, 'VALIDATION', 'Enter the volunteer name.');
    if (!isMobile(mobile)) return fail(res, 422, 'VALIDATION', 'Enter a valid 10-digit mobile number.');
    const bs = booths.map(Number).filter((b) => req.booths.includes(b));
    const info = q('INSERT INTO volunteers (user_id, name, mobile, booths) VALUES (?, ?, ?, ?)').run(req.user.id, String(name).trim(), mobile, JSON.stringify(bs));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  app.delete('/api/me/volunteers/:id', auth, (req, res) => {
    q('UPDATE tasks SET volunteer_id = NULL WHERE user_id = ? AND volunteer_id = ?').run(req.user.id, req.params.id);
    q('DELETE FROM volunteers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/me/tasks', auth, (req, res) => {
    const { title, boothNo = null, volunteerId = null, due = null } = req.body || {};
    if (!title || String(title).trim().length < 3) return fail(res, 422, 'VALIDATION', 'Describe the task.');
    if (boothNo && !req.booths.includes(Number(boothNo))) return fail(res, 422, 'VALIDATION', 'Booth not in your plan.');
    const info = q('INSERT INTO tasks (user_id, title, booth_no, volunteer_id, due) VALUES (?, ?, ?, ?, ?)').run(req.user.id, String(title).trim().slice(0, 200), boothNo ? Number(boothNo) : null, volunteerId ? Number(volunteerId) : null, due);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  app.patch('/api/me/tasks/:id', auth, (req, res) => {
    const { status } = req.body || {};
    if (!['todo', 'doing', 'done'].includes(status)) return fail(res, 422, 'VALIDATION', 'Unknown status.');
    const r = q('UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?').run(status, req.params.id, req.user.id);
    if (!r.changes) return fail(res, 404, 'NOT_FOUND', 'Task not found.');
    res.json({ ok: true });
  });
  app.delete('/api/me/tasks/:id', auth, (req, res) => {
    q('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  // Billing
  app.get('/api/me/billing', auth, (req, res) => {
    res.json({
      status: req.user.status,
      quote: quote(req.booths.length || 1),
      payments: q('SELECT id, ref, booth_count, base, gst, total, utr, status, note, created_at, reviewed_at FROM payments WHERE user_id = ? ORDER BY id DESC').all(req.user.id),
    });
  });

  app.post('/api/me/payments', auth, async (req, res) => {
    if (req.user.status === 'active') return fail(res, 409, 'ALREADY_ACTIVE', 'Your plan is already active.');
    const open = q("SELECT * FROM payments WHERE user_id = ? AND status IN ('created','submitted') ORDER BY id DESC").get(req.user.id);
    const qt = quote(req.booths.length || 1);
    let p = open;
    if (!p || p.total !== qt.total) {
      if (p) q("UPDATE payments SET status = 'rejected', note = 'Superseded' WHERE id = ? AND status = 'created'").run(p.id);
      const ref = 'STU' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const info = q('INSERT INTO payments (user_id, ref, booth_count, base, gst, total) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, ref, qt.boothCount, qt.base, qt.gst, qt.total);
      p = q('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
    }
    const upi = `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent('Sethu Campaign')}&am=${p.total}.00&cu=INR&tn=${encodeURIComponent(p.ref)}&tr=${p.ref}`;
    const qr = await QRCode.toDataURL(upi, { margin: 1, width: 280 });
    res.json({ payment: p, upi, qr, vpa: UPI_VPA });
  });

  app.post('/api/me/payments/:id/utr', auth, (req, res) => {
    const { utr } = req.body || {};
    if (!isUtr(utr)) return fail(res, 422, 'VALIDATION', 'UTR is the 12-digit number in your UPI app’s payment details.');
    const p = q('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!p) return fail(res, 404, 'NOT_FOUND', 'Payment not found.');
    if (p.status === 'approved') return fail(res, 409, 'ALREADY_APPROVED', 'This payment is already approved.');
    if (q('SELECT 1 FROM payments WHERE utr = ? AND id != ?').get(utr, p.id)) return fail(res, 409, 'DUPLICATE_UTR', 'This UTR was already used for another payment.');
    q("UPDATE payments SET utr = ?, status = 'submitted' WHERE id = ?").run(utr, p.id);
    q("UPDATE users SET status = 'pending_review' WHERE id = ? AND status = 'registered'").run(req.user.id);
    audit(req.user.id, 'utr_submitted', { payment: p.id });
    log('utr_submitted', req.user.mobile);
    res.json({ ok: true, status: 'submitted' });
  });

  const approvePayment = (p, by) => {
    q("UPDATE payments SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?").run(p.id);
    q("UPDATE users SET status = 'active' WHERE id = ?").run(p.user_id);
    audit(by, 'payment_approved', { payment: p.id, user: p.user_id });
    log('paid', null, { payment: p.id });
  };

  // Payment-gateway webhook (e.g. Razorpay / Cashfree / bank UPI collect). HMAC-signed.
  app.post('/api/payments/webhook', express.raw({ type: '*/*' }), (req, res) => {
    const secret = process.env.SETHU_WEBHOOK_SECRET;
    if (!secret) return fail(res, 503, 'NOT_CONFIGURED', 'Webhook not configured.');
    const raw = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const sig = req.get('x-sethu-signature') || '';
    const expected = hmac(raw, secret);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return fail(res, 401, 'BAD_SIGNATURE', 'Invalid signature.');
    const { ref, utr, amount } = JSON.parse(raw);
    const p = q('SELECT * FROM payments WHERE ref = ?').get(ref);
    if (!p) return fail(res, 404, 'NOT_FOUND', 'Unknown reference.');
    if (Number(amount) !== p.total) return fail(res, 422, 'AMOUNT_MISMATCH', 'Amount does not match.');
    if (utr && isUtr(utr)) q('UPDATE payments SET utr = ? WHERE id = ?').run(utr, p.id);
    if (p.status !== 'approved') approvePayment(p, null);
    res.json({ ok: true });
  });

  // ---------- image extraction: electoral-roll import ----------
  const canUseBooth = (u, aid, booth) => !!u.is_admin || (u.assembly_id === aid && JSON.parse(u.booths || '[]').includes(booth));
  const importRow = (r, page) => ({ ...normaliseVoter(r), page: Number(page) || Number(r.page) || 0, include: r.include !== false && !r.deleted });
  const getImport = (req, res) => {
    const imp = q('SELECT * FROM imports WHERE id = ?').get(req.params.id);
    if (!imp || (!req.user.is_admin && imp.user_id !== req.user.id)) { fail(res, 404, 'NOT_FOUND', 'Import not found.'); return null; }
    return imp;
  };
  const importOut = (imp) => ({ ...imp, header: imp.header ? JSON.parse(imp.header) : null, rows: JSON.parse(imp.rows) });

  app.get('/api/extract/status', auth, (req, res) => res.json({ claude: claudeEnabled() && !req.user.is_demo, synthetic: SYNTHETIC }));

  app.post('/api/imports', auth, (req, res) => {
    const { assemblyId, boothNo, filename = '', engine } = req.body || {};
    const aid = Number(assemblyId ?? req.user.assembly_id);
    const bno = Number(boothNo);
    if (!assemblyById(aid) || !boothsFor(aid).some((b) => b.no === bno)) return fail(res, 422, 'VALIDATION', 'Choose a valid constituency and booth.');
    if (!canUseBooth(req.user, aid, bno)) return fail(res, 403, 'FORBIDDEN', 'You can only import rolls for booths in your plan.');
    const eng = engine === 'claude' && claudeEnabled() && !req.user.is_demo ? 'claude' : 'ocr';
    const info = q('INSERT INTO imports (user_id, assembly_id, booth_no, filename, engine) VALUES (?, ?, ?, ?, ?)').run(req.user.id, aid, bno, String(filename).slice(0, 200), eng);
    res.status(201).json({ import: importOut(q('SELECT * FROM imports WHERE id = ?').get(info.lastInsertRowid)) });
  });

  app.get('/api/imports', auth, (req, res) => {
    const rows = req.user.is_admin
      ? q('SELECT i.*, u.full_name FROM imports i JOIN users u ON u.id = i.user_id ORDER BY i.id DESC LIMIT 100').all()
      : q('SELECT * FROM imports WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
    res.json({ imports: rows.map((r) => ({ ...r, rows: undefined, rowCount: JSON.parse(r.rows).length, header: r.header ? JSON.parse(r.header) : null })) });
  });

  app.get('/api/imports/:id', auth, (req, res) => { const imp = getImport(req, res); if (imp) res.json({ import: importOut(imp) }); });

  // One page at a time: either an image (Claude reads it) or OCR text from the browser.
  app.post('/api/imports/:id/pages', auth, async (req, res, next) => {
    try {
      const imp = getImport(req, res);
      if (!imp) return;
      if (imp.status !== 'draft') return fail(res, 409, 'NOT_DRAFT', 'This import is already finished.');
      const { page, image, text } = req.body || {};
      let result;
      if (image && imp.engine === 'claude') result = await extractRollPage(image);
      else if (typeof text === 'string') result = parseRollText(text.slice(0, 200_000));
      else return fail(res, 422, 'VALIDATION', imp.engine === 'claude' ? 'Send the page image.' : 'Send the OCR text for this page.');
      const rows = JSON.parse(imp.rows).filter((r) => r.page !== Number(page)); // re-running a page replaces it
      const added = result.voters.map((v) => importRow(v, page));
      const header = { ...(imp.header ? JSON.parse(imp.header) : {}) };
      for (const [k, v] of Object.entries(result.header || {})) if (v && !header[k]) header[k] = v;
      q('UPDATE imports SET rows = ?, header = ?, pages = MAX(pages, ?) WHERE id = ?').run(JSON.stringify([...rows, ...added].sort((a, b) => a.page - b.page || a.serial - b.serial)), JSON.stringify(header), Number(page) || 0, imp.id);
      res.json({ page: Number(page), pageType: result.pageType, found: added.length, header, voters: added, engine: result.engine });
    } catch (e) {
      if (e.status) return fail(res, e.status, e.code, e.message);
      next(e);
    }
  });

  app.put('/api/imports/:id/rows', auth, (req, res) => {
    const imp = getImport(req, res);
    if (!imp) return;
    if (imp.status !== 'draft') return fail(res, 409, 'NOT_DRAFT', 'This import is already finished.');
    if (!Array.isArray(req.body?.rows) || req.body.rows.length > 5000) return fail(res, 422, 'VALIDATION', 'Send the reviewed rows.');
    const rows = req.body.rows.map((r) => ({ ...importRow(r, r.page), include: r.include !== false }));
    q('UPDATE imports SET rows = ? WHERE id = ?').run(JSON.stringify(rows), imp.id);
    res.json({ ok: true, rows: rows.length });
  });

  app.post('/api/imports/:id/commit', auth, (req, res) => {
    const imp = getImport(req, res);
    if (!imp) return;
    if (imp.status !== 'draft') return fail(res, 409, 'NOT_DRAFT', 'This import is already finished.');
    if (req.user.is_demo) return fail(res, 403, 'DEMO', 'The demo workspace cannot save imports. Create your own account to load real rolls.');
    const rows = JSON.parse(imp.rows).filter((r) => r.include && (r.name || r.nameTamil));
    if (!rows.length) return fail(res, 422, 'EMPTY', 'No rows selected to save.');
    const aid = imp.assembly_id, bno = imp.booth_no;
    const byEpic = q('SELECT id FROM voters WHERE assembly_id = ? AND epic = ?');
    const bySerial = q('SELECT id FROM voters WHERE assembly_id = ? AND booth_no = ? AND serial = ?');
    const maxSerial = q('SELECT COALESCE(MAX(serial), 0) m FROM voters WHERE assembly_id = ? AND booth_no = ? AND serial < 100000');
    const upd = q(`UPDATE voters SET booth_no = ?, serial = ?, epic = COALESCE(NULLIF(?, ''), epic), name = ?, name_ta = COALESCE(NULLIF(?, ''), name_ta), relation = ?, relation_name = ?,
      age = ?, gender = ?, house = ?, source = 'roll_import', import_id = ?, deleted = 0, updated_at = datetime('now') WHERE id = ?`);
    const ins = q(`INSERT INTO voters (assembly_id, booth_no, serial, epic, name, name_ta, relation, relation_name, age, gender, house, source, import_id)
      VALUES (?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), ?, ?, ?, ?, ?, 'roll_import', ?)`);
    let inserted = 0, updated = 0;
    db.exec('BEGIN');
    try {
      for (const r of rows) {
        const serial = r.serial > 0 && r.serial < 100000 ? r.serial : maxSerial.get(aid, bno).m + 1;
        const epic = r.epicValid ? r.epic : '';
        const hit = (epic && byEpic.get(aid, epic)) || bySerial.get(aid, bno, serial);
        const vals = [r.name || r.nameTamil, r.nameTamil, r.relationType || null, r.relationName || null, r.age || null, r.gender || null, r.houseNo || null, imp.id];
        if (hit) {
          // Free the target serial if another row holds it, then move this voter there.
          const clash = bySerial.get(aid, bno, serial);
          if (clash && clash.id !== hit.id) q('UPDATE voters SET serial = serial + 200000 WHERE id = ?').run(clash.id);
          upd.run(bno, serial, epic, ...vals.slice(0, 7), imp.id, hit.id); updated++;
        } else { ins.run(aid, bno, serial, epic, ...vals); inserted++; }
      }
      const h = imp.header ? JSON.parse(imp.header) : {};
      if (h.pollingStation) {
        q(`INSERT INTO booth_meta (assembly_id, booth_no, name) VALUES (?, ?, ?)
           ON CONFLICT(assembly_id, booth_no) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`).run(aid, bno, String(h.pollingStation).slice(0, 200));
      }
      q("UPDATE imports SET status = 'committed', committed_rows = ?, committed_at = datetime('now') WHERE id = ?").run(rows.length, imp.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(req.user.id, 'roll_import', { import: imp.id, assembly: aid, booth: bno, inserted, updated });
    res.json({ ok: true, inserted, updated });
  });

  app.delete('/api/imports/:id', auth, (req, res) => {
    const imp = getImport(req, res);
    if (!imp) return;
    if (imp.status === 'draft') q("UPDATE imports SET status = 'discarded' WHERE id = ?").run(imp.id);
    res.json({ ok: true });
  });

  // ---------- field capture: candidate or a booth agent via signed link ----------
  function authOrAgent(req, res, next) {
    const agentTok = req.get('x-agent-token');
    if (!agentTok) return auth(req, res, next);
    const p = verifyToken(agentTok);
    const vol = p?.typ === 'agent' && q('SELECT * FROM volunteers WHERE id = ? AND user_id = ?').get(p.vid, p.uid);
    const u = vol && q('SELECT * FROM users WHERE id = ?').get(p.uid);
    if (!u) return fail(res, 401, 'AGENT_LINK_INVALID', 'This field link is no longer valid. Ask your candidate for a new one.');
    req.user = u;
    req.agent = vol;
    const own = JSON.parse(u.booths || '[]');
    const assigned = JSON.parse(vol.booths || '[]').filter((b) => own.includes(b));
    req.booths = assigned.length ? assigned : own;
    next();
  }

  app.post('/api/me/volunteers/:id/link', auth, (req, res) => {
    const vol = q('SELECT * FROM volunteers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!vol) return fail(res, 404, 'NOT_FOUND', 'Volunteer not found.');
    const token = signToken({ typ: 'agent', uid: req.user.id, vid: vol.id }, 60 * 24 * 3600);
    audit(req.user.id, 'agent_link_created', { volunteer: vol.id });
    res.json({ path: `/field/${token}`, expiresInDays: 60 });
  });

  app.get('/api/agent/me', authOrAgent, (req, res) => {
    res.json({
      candidate: req.user.full_name, assembly: assemblyById(req.user.assembly_id)?.name, booths: req.booths,
      volunteer: req.agent ? { id: req.agent.id, name: req.agent.name } : null, claude: claudeEnabled() && !req.user.is_demo, isDemo: !!req.user.is_demo,
    });
  });

  app.post('/api/capture/extract', authOrAgent, async (req, res, next) => {
    try {
      const { image, text } = req.body || {};
      if (image && claudeEnabled() && !req.user.is_demo) return res.json({ result: await extractCard(image) });
      if (typeof text === 'string') return res.json({ result: parseCardText(text.slice(0, 50_000)) });
      fail(res, 422, 'USE_OCR', 'Send OCR text (image reading is not configured).');
    } catch (e) {
      if (e.status) return fail(res, e.status, e.code, e.message);
      next(e);
    }
  });

  app.post('/api/capture/voters', authOrAgent, (req, res) => {
    const b = req.body || {};
    const booth = Number(b.boothNo);
    if (!req.booths.includes(booth)) return fail(res, 422, 'VALIDATION', 'Choose one of your booths.', { fields: { boothNo: 'Choose one of your booths.' } });
    const v = normaliseVoter(b);
    const fields = {};
    if (!v.name && !v.nameTamil) fields.name = 'Enter the voter name.';
    if (v.epic && !v.epicValid) fields.epic = 'EPIC number looks wrong (3 letters + 7 digits).';
    if (b.mobile && !isMobile(b.mobile)) fields.mobile = 'Enter a valid 10-digit mobile.';
    if (b.mobile && b.consentMobile !== true) fields.consentMobile = 'Confirm the voter agreed to share their number.';
    if (Object.keys(fields).length) return fail(res, 422, 'VALIDATION', 'Please fix the highlighted fields.', { fields });
    if (req.user.is_demo) return res.json({ ok: true, demo: true, matched: false, message: 'Demo mode: nothing was saved.' });

    const aid = req.user.assembly_id;
    const by = req.agent ? `agent:${req.agent.id}:${req.agent.name}` : `user:${req.user.id}`;
    const mobile = b.mobile && b.consentMobile === true ? b.mobile : null;
    const existing = v.epicValid && q('SELECT * FROM voters WHERE assembly_id = ? AND epic = ?').get(aid, v.epic);
    let voterId, matched = false;
    if (existing) {
      matched = true;
      q(`UPDATE voters SET mobile = COALESCE(?, mobile), name_ta = COALESCE(NULLIF(?, ''), name_ta), captured_by = ?, updated_at = datetime('now') WHERE id = ?`).run(mobile, v.nameTamil, by, existing.id);
      voterId = `${existing.assembly_id}-${existing.booth_no}-${existing.serial}`;
    } else {
      const serial = q('SELECT COALESCE(MAX(serial), 100000) + 1 s FROM voters WHERE assembly_id = ? AND booth_no = ? AND serial >= 100000').get(aid, booth).s;
      q(`INSERT INTO voters (assembly_id, booth_no, serial, epic, name, name_ta, relation, relation_name, age, gender, house, mobile, source, captured_by)
         VALUES (?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, 'field', ?)`)
        .run(aid, booth, serial, v.epic, v.name || v.nameTamil, v.nameTamil, v.relationType || null, v.relationName || null, v.age || null, v.gender || null, v.houseNo || null, mobile, by);
      voterId = `${aid}-${booth}-${serial}`;
    }
    if (['supporter', 'leaning', 'neutral', 'opposed'].includes(b.sentiment) || b.note) {
      q(`INSERT INTO voter_tags (user_id, voter_id, sentiment, note, contacted, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'))
         ON CONFLICT(user_id, voter_id) DO UPDATE SET sentiment = COALESCE(excluded.sentiment, sentiment), note = COALESCE(NULLIF(excluded.note, ''), note), contacted = 1, updated_at = excluded.updated_at`)
        .run(req.user.id, voterId, b.sentiment || null, String(b.note || '').slice(0, 500));
    }
    audit(req.user.id, 'field_capture', { voter: voterId, matched, by, mobile: !!mobile });
    res.status(201).json({ ok: true, matched, voterId });
  });

  app.get('/api/capture/recent', authOrAgent, (req, res) => {
    const by = req.agent ? `agent:${req.agent.id}:%` : `%`;
    const rows = q(`SELECT * FROM voters WHERE assembly_id = ? AND captured_by LIKE ? ORDER BY updated_at DESC, id DESC LIMIT 20`).all(req.user.assembly_id, by);
    res.json({ voters: rows.filter((r) => req.booths.includes(r.booth_no)).map(toVoter).map((v) => ({ ...v, capturedBy: rows.find((r) => r.serial === v.serial && r.booth_no === v.boothNo)?.captured_by })) });
  });

  // ---------- admin ----------
  app.get('/api/admin/stats', auth, admin, (req, res) => {
    const count = (kind) => q('SELECT COUNT(DISTINCT COALESCE(mobile, id)) n FROM events WHERE kind = ?').get(kind).n;
    const byStatus = Object.fromEntries(q('SELECT status, COUNT(*) n FROM users WHERE is_admin = 0 AND is_demo = 0 GROUP BY status').all().map((r) => [r.status, r.n]));
    const revenue = q("SELECT COALESCE(SUM(total),0) n FROM payments WHERE status = 'approved'").get().n;
    const daily = q("SELECT date(created_at) d, COUNT(*) n FROM users WHERE is_admin = 0 AND is_demo = 0 GROUP BY d ORDER BY d DESC LIMIT 14").all();
    res.json({
      funnel: { landing: count('landing_view'), started: count('register_start'), otpSent: count('otp_sent'), verified: count('otp_verified'), registered: count('registered'), paid: count('paid') },
      byStatus, revenue, daily, pendingPayments: q("SELECT COUNT(*) n FROM payments WHERE status = 'submitted'").get().n,
      pendingBroadcasts: q("SELECT COUNT(*) n FROM broadcasts WHERE status = 'pending_review'").get().n,
    });
  });

  app.get('/api/admin/registrations', auth, admin, (req, res) => {
    const { status, q: needle } = req.query;
    let rows = q('SELECT * FROM users WHERE is_admin = 0 ORDER BY id DESC LIMIT 500').all().map(publicUser);
    if (status) rows = rows.filter((r) => r.status === status);
    if (needle) { const n = String(needle).toLowerCase(); rows = rows.filter((r) => r.fullName.toLowerCase().includes(n) || r.mobile.includes(n) || (r.assemblyName || '').toLowerCase().includes(n)); }
    res.json({ registrations: rows });
  });

  app.get('/api/admin/payments', auth, admin, (req, res) => {
    const status = req.query.status || 'submitted';
    res.json({ payments: q('SELECT p.*, u.full_name, u.mobile FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = ? ORDER BY p.id DESC').all(status) });
  });

  app.post('/api/admin/payments/:id/:decision', auth, admin, (req, res) => {
    const p = q('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!p) return fail(res, 404, 'NOT_FOUND', 'Payment not found.');
    if (req.params.decision === 'approve') approvePayment(p, req.user.id);
    else if (req.params.decision === 'reject') {
      q("UPDATE payments SET status = 'rejected', note = ?, reviewed_at = datetime('now') WHERE id = ?").run(String(req.body?.note || 'UTR not found').slice(0, 200), p.id);
      q("UPDATE users SET status = 'registered' WHERE id = ? AND status = 'pending_review'").run(p.user_id);
      audit(req.user.id, 'payment_rejected', { payment: p.id });
    } else return fail(res, 400, 'BAD_DECISION', 'approve or reject');
    res.json({ ok: true });
  });

  app.get('/api/admin/broadcasts', auth, admin, (req, res) => {
    res.json({ broadcasts: q('SELECT b.*, u.full_name, u.mobile FROM broadcasts b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT 100').all() });
  });
  app.post('/api/admin/broadcasts/:id/:decision', auth, admin, (req, res) => {
    const map = { approve: 'approved', reject: 'rejected' };
    if (!map[req.params.decision]) return fail(res, 400, 'BAD_DECISION', 'approve or reject');
    q('UPDATE broadcasts SET status = ? WHERE id = ?').run(map[req.params.decision], req.params.id);
    audit(req.user.id, `broadcast_${map[req.params.decision]}`, { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  app.get('/api/admin/audit', auth, admin, (req, res) => {
    res.json({ audit: q('SELECT a.*, u.full_name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200').all() });
  });

  app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', 'No such endpoint.'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'BAD_JSON', 'Malformed JSON.');
    console.error(err);
    fail(res, 500, 'SERVER_ERROR', 'Something went wrong. Please try again.');
  });

  return app;
}
