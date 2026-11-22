const KEY = 'sethu.session';

export const asset = (p) => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : base + '/'}${p.replace(/^\//, '')}`;
};

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
  set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.fields = body?.fields || {};
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body, raw, headers: extra } = {}) {
  const s = session.get();
  const headers = { ...(extra || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (s?.token && !headers['x-agent-token']) headers.Authorization = `Bearer ${s.token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { error: 'NETWORK', message: 'No connection. Check your internet and try again.' });
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s?.token && !headers['x-agent-token'] && !path.startsWith('/auth')) {
    session.clear();
    window.location.assign('/login?expired=1');
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const num = (n) => Number(n || 0).toLocaleString('en-IN');
