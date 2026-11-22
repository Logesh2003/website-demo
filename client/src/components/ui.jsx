import { createContext, useCallback, useContext, useEffect, useId, useState, Children, cloneElement, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { num } from '../api.js';

const P = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  send: 'm22 2-7 20-4-9-9-4 20-7Z',
  board: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v7h-4z',
  print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h2',
  check: 'M20 6 9 17l-5-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-4.9A8.4 8.4 0 1 1 21 11.5Z',
  x: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
};

export function Icon({ name, size = 20, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ to = '/' }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="logo" aria-label="Voiz of Aram home">
      <img src="/images/voiz-of-aram-logo.jpg" alt="Voiz of Aram" className="logo-badge" />
      <span className="logo-text">
        <span className="brand-name">{t('brand')}</span>
        <small className="brand-tagline">{t('tagline')}</small>
      </span>
    </Link>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button type="button" aria-pressed={lang === 'ta'} onClick={() => setLang('ta')} lang="ta">தமிழ்</button>
    </div>
  );
}

export function SiteHeader({ children }) {
  return (
    <header className="site-head">
      <div className="container">
        <Logo />
        <nav className="site-nav" aria-label="Main">
          {children}
          <LangToggle />
        </nav>
      </div>
    </header>
  );
}

const CONTROLS = new Set(['input', 'select', 'textarea']);

// Explicit id/htmlFor labelling (not wrapping) so the accessible name is just the
// label text, and errors/hints are announced via aria-describedby.
export function Field({ label, error, hint, children }) {
  const uid = useId();
  const cid = `${uid}-c`;
  const did = `${uid}-d`;
  const describe = error || hint ? did : undefined;
  let wired = false;
  const wire = (el) => {
    if (wired || !isValidElement(el)) return el;
    if (CONTROLS.has(el.type)) {
      wired = true;
      return cloneElement(el, { id: cid, 'aria-describedby': describe, 'aria-invalid': error ? true : undefined });
    }
    if (el.props?.children) return cloneElement(el, {}, Children.map(el.props.children, wire));
    return el;
  };
  const content = Children.map(children, wire);
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="lbl" htmlFor={cid} style={{ fontWeight: 600, fontSize: 14 }}>{label}</label>
      {content}
      {hint && !error && <span className="hint" id={did}>{hint}</span>}
      {error && <span className="err" id={did} role="alert">{error}</span>}
    </div>
  );
}

export function Choice({ name, value, current, onChange, title, desc }) {
  const on = current === value;
  return (
    <label className={`choice${on ? ' on' : ''}`}>
      <input type="radio" name={name} value={value} checked={on} onChange={() => onChange(value)} />
      <span className="radio" aria-hidden="true" />
      <span><b>{title}</b>{desc && <span className="muted small">{desc}</span>}</span>
    </label>
  );
}

export function Kpi({ label, value, detail }) {
  return (
    <div className="card kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {detail && <div className="d">{detail}</div>}
    </div>
  );
}

export const SENT = [
  { key: 'supporter', label: 'Supporter', color: 'var(--s-supporter)' },
  { key: 'leaning', label: 'Leaning', color: 'var(--s-leaning)' },
  { key: 'neutral', label: 'Neutral', color: 'var(--s-neutral)' },
  { key: 'opposed', label: 'Opposed', color: 'var(--s-opposed)' },
];

export function StackBar({ parts, total, label }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="stackbar" role="img" aria-label={label || parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
      {parts.map((p) => p.value > 0 && <span key={p.label} title={`${p.label}: ${num(p.value)}`} style={{ width: `${(p.value / Math.max(1, sum)) * 100}%`, background: p.color }} />)}
    </div>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i className="dot" style={{ background: i.color }} />{i.label}{i.value != null && <b>&nbsp;{num(i.value)}</b>}</span>)}</div>;
}

export function Skeleton({ h = 18, w = '100%' }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => setMsg(m), []);
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(id); }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function useAsync(fn, deps = []) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    return fn().then((data) => set({ loading: false, data, error: null })).catch((error) => set({ loading: false, data: null, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="alert alert-bad row between">
      <span>{error?.message || 'Something went wrong.'}</span>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
