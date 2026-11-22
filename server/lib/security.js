import crypto from 'node:crypto';

const SECRET = process.env.SETHU_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SETHU_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[sethu] SETHU_SECRET not set: sessions will reset on restart.');
}

const b64 = (s) => Buffer.from(s).toString('base64url');

export function signToken(payload, ttlSeconds = 60 * 60 * 12) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function checkSecret(secret, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(secret), salt, 32);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export const hmac = (data, key = SECRET) => crypto.createHmac('sha256', key).update(data).digest('hex');
export const otpCode = () => String(crypto.randomInt(100000, 1000000));
