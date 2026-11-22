import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { SiteHeader, Field, Choice, Icon } from '../components/ui.jsx';
import { api, session, inr } from '../api.js';

const DRAFT = 'sethu.reg.draft';
const isMobile = (m) => /^[6-9]\d{9}$/.test(m);
const isName = (n) => n.trim().length >= 3 && /^[\p{L}\p{M} .'-]+$/u.test(n.trim());
const isPasscode = (p) => p.length >= 6 && /\d/.test(p) && /[A-Za-z]/.test(p);
const STEP_OF = { fullName: 0, mobile: 0, role: 1, affiliation: 1, party: 1, electionType: 2, position: 2, localBody: 2, wardNumber: 2, assemblyId: 2, booths: 2, passcode: 3, consent: 3 };

const EMPTY = { fullName: '', mobile: '', role: '', affiliation: '', party: '', electionType: 'assembly', position: '', localBody: '', wardNumber: '', district: '', assemblyId: '', booths: [] };

function loadDraft() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT)) }; } catch { return EMPTY; }
}
function attribution() {
  const p = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'gclid', 'fbclid', 'ref'];
  return Object.fromEntries(keys.filter((k) => p.get(k)).map((k) => [k, p.get(k).slice(0, 100)]));
}

export default function Register() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [f, setF] = useState(loadDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [meta, setMeta] = useState(null);
  const [otp, setOtp] = useState({ sent: false, code: '', devCode: '', token: '', busy: false, cooldown: 0 });
  const [passcode, setPasscode] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const headRef = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    api('/public/meta').then(setMeta).catch(() => {});
    api('/public/track', { method: 'POST', body: { kind: 'register_start' } }).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify(f)); } catch { /* ignore */ } }, [f]);
  useEffect(() => { headRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (!otp.cooldown) return;
    const id = setTimeout(() => setOtp((o) => ({ ...o, cooldown: o.cooldown - 1 })), 1000);
    return () => clearTimeout(id);
  }, [otp.cooldown]);

  const steps = [t('step_verify'), t('step_role'), t('step_area'), t('step_finish')];

  async function sendCode() {
    const e = {};
    if (!isName(f.fullName)) e.fullName = 'Enter your full name (at least 3 letters).';
    if (!isMobile(f.mobile)) e.mobile = 'Enter a valid 10-digit mobile number starting with 6–9.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setOtp((o) => ({ ...o, busy: true }));
    setFormError('');
    try {
      const r = await api('/auth/otp/send', { method: 'POST', body: { mobile: f.mobile, purpose: 'register', lang } });
      setOtp((o) => ({ ...o, sent: true, busy: false, devCode: r.devCode || '', cooldown: 30, code: '' }));
    } catch (err) {
      setOtp((o) => ({ ...o, busy: false }));
      if (err.code === 'ALREADY_REGISTERED') setFormError('exists');
      else setErrors({ mobile: err.message });
    }
  }

  async function verifyCode() {
    setOtp((o) => ({ ...o, busy: true }));
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { mobile: f.mobile, code: otp.code } });
      setOtp((o) => ({ ...o, busy: false, token: r.verifyToken }));
      setErrors({});
    } catch (err) {
      setOtp((o) => ({ ...o, busy: false }));
      setErrors({ otp: err.message + (err.body?.attemptsLeft != null ? ` (${err.body.attemptsLeft} left)` : '') });
    }
  }

  function validateStep(s) {
    const e = {};
    if (s === 0 && !otp.token) e.otp = 'Verify your number to continue.';
    if (s === 1) {
      if (!f.role) e.role = 'Choose your role.';
      if (!f.affiliation) e.affiliation = 'Choose your affiliation.';
      if (f.affiliation === 'party' && !f.party) e.party = 'Choose your party.';
    }
    if (s === 2) {
      if (f.electionType !== 'assembly') {
        if (!f.position) e.position = 'Choose the position.';
        if (f.localBody.trim().length < 2) e.localBody = 'Enter the local body name.';
        if (!/^\d{1,3}$/.test(f.wardNumber)) e.wardNumber = 'Enter the ward number.';
      }
      if (!f.district) e.district = 'Choose your district.';
      if (!f.assemblyId) e.assemblyId = 'Choose your constituency.';
      if (!f.booths.length) e.booths = 'Pick at least one booth.';
    }
    if (s === 3) {
      if (!isPasscode(passcode)) e.passcode = 'Use 6+ characters with letters and numbers.';
      if (!consent) e.consent = 'Please accept to continue.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validateStep(step)) return;
    api('/public/track', { method: 'POST', body: { kind: 'register_step', meta: { step: step + 1 } } }).catch(() => {});
    setStep((s) => s + 1);
  }

  async function submit(e) {
    e.preventDefault();
    if (step < 3) return next();
    if (!validateStep(3)) return;
    setBusy(true);
    setFormError('');
    try {
      const r = await api('/auth/register', {
        method: 'POST',
        body: { ...f, assemblyId: Number(f.assemblyId), passcode, consent, verifyToken: otp.token, lang, attribution: attribution() },
      });
      session.set({ token: r.token, user: r.user });
      try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
      setDone(r);
    } catch (err) {
      if (err.code === 'VALIDATION') {
        setErrors(err.fields);
        const first = Math.min(...Object.keys(err.fields).map((k) => STEP_OF[k] ?? 3));
        setStep(first);
      } else if (err.code === 'MOBILE_NOT_VERIFIED') {
        setOtp({ sent: false, code: '', devCode: '', token: '', busy: false, cooldown: 0 });
        setStep(0);
        setFormError(err.message);
      } else if (err.code === 'ALREADY_REGISTERED') setFormError('exists');
      else setFormError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <SiteHeader><span className="small muted">{t('reg_have')}</span> <Link className="btn btn-ghost btn-sm" to="/login">{t('nav_signin')}</Link></SiteHeader>
      <div className="auth-wrap">
        <aside className="auth-aside">
          <h2>{t('reg_title')}</h2>
          <ul>
            {['how1', 'how2', 'how3', 'how4'].map((k) => <li key={k}><Icon name="check" />{t(k)}</li>)}
          </ul>
          <div style={{ marginTop: 'auto', opacity: .8 }} className="small">{t('f6_d')}</div>
        </aside>
        <main className="auth-main">
          <div className="auth-card">
            {done ? <Done done={done} t={t} nav={nav} /> : (
              <form onSubmit={submit} noValidate>
                <h1 tabIndex={-1} ref={headRef} style={{ fontSize: 28, outline: 'none' }}>{t('reg_title')}</h1>
                <p className="muted">{t('reg_sub')}</p>
                <ol className="stepper" aria-label="Progress">
                  {steps.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'cur' : ''} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</li>)}
                </ol>

                {formError === 'exists' ? (
                  <div className="alert alert-warn" style={{ marginBottom: 16 }}>
                    This number already has a Sethu account. <Link to={`/login?mobile=${f.mobile}`}>Sign in</Link> or reset your passcode with a one-time code.
                  </div>
                ) : formError && <div className="alert alert-bad" role="alert" style={{ marginBottom: 16 }}>{formError}</div>}

                {step === 0 && (
                  <div className="stack">
                    <Field label={t('full_name')} error={errors.fullName}>
                      <input className="input" autoComplete="name" value={f.fullName} placeholder={t('full_name_ph')} onChange={(e) => set('fullName', e.target.value)} disabled={!!otp.token} />
                    </Field>
                    <Field label={t('mobile')} error={errors.mobile} hint="We send a one-time code to confirm this number.">
                      <div className="input-group">
                        <span className="prefix">+91</span>
                        <input className="input" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={f.mobile} placeholder={t('mobile_ph')}
                          onChange={(e) => { set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10)); setFormError(''); }} disabled={otp.sent} />
                        {!otp.sent && <button type="button" className="btn btn-primary" onClick={sendCode} disabled={otp.busy}>{t('send_code')}</button>}
                      </div>
                    </Field>
                    {otp.sent && !otp.token && (
                      <div className="card pad stack" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                        <div className="row between small">
                          <span>{t('code_sent')} <b>+91 {f.mobile}</b></span>
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOtp({ sent: false, code: '', devCode: '', token: '', busy: false, cooldown: 0 })}>{t('change_number')}</button>
                        </div>
                        {otp.devCode && <div className="alert alert-brand small">{t('dev_code')} <b>{otp.devCode}</b></div>}
                        <Field label={t('otp')} error={errors.otp}>
                          <div className="input-group">
                            <input className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp.code} placeholder="••••••"
                              onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (otp.code.length === 6) verifyCode(); } }} />
                            <button type="button" className="btn btn-primary" onClick={verifyCode} disabled={otp.code.length !== 6 || otp.busy}>{t('verify')}</button>
                          </div>
                        </Field>
                        <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: 'start' }} onClick={sendCode} disabled={otp.cooldown > 0 || otp.busy}>
                          {t('resend')}{otp.cooldown > 0 && ` (${otp.cooldown}s)`}
                        </button>
                      </div>
                    )}
                    {otp.token && <div className="alert alert-ok row"><Icon name="check" /> {t('verified')}: +91 {f.mobile}</div>}
                    {errors.otp && !otp.sent && <span className="err">{errors.otp}</span>}
                  </div>
                )}

                {step === 1 && (
                  <div className="stack">
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="lbl" style={{ fontWeight: 600, marginBottom: 8 }}>{t('your_role')}</legend>
                      <div className="choices">
                        {['planning', 'confirmed', 'team', 'functionary'].map((r) => <Choice key={r} name="role" value={r} current={f.role} onChange={(v) => set('role', v)} title={t(`role_${r}`)} />)}
                      </div>
                      {errors.role && <span className="err">{errors.role}</span>}
                    </fieldset>
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="lbl" style={{ fontWeight: 600, marginBottom: 8 }}>{t('affiliation')}</legend>
                      <div className="choices">
                        <Choice name="aff" value="party" current={f.affiliation} onChange={(v) => set('affiliation', v)} title={t('aff_party')} />
                        <Choice name="aff" value="independent" current={f.affiliation} onChange={(v) => { set('affiliation', v); set('party', ''); }} title={t('aff_independent')} />
                      </div>
                      {errors.affiliation && <span className="err">{errors.affiliation}</span>}
                    </fieldset>
                    {f.affiliation === 'party' && (
                      <Field label={t('party')} error={errors.party}>
                        <select className="select" value={f.party} onChange={(e) => set('party', e.target.value)}>
                          <option value="">{t('select')}</option>
                          {(meta?.parties || []).map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>
                )}

                {step === 2 && <AreaStep f={f} set={set} setF={setF} errors={errors} meta={meta} t={t} />}

                {step === 3 && (
                  <div className="stack">
                    <div className="card pad" style={{ boxShadow: 'none' }}>
                      <div className="panel-title"><h2>{t('review')}</h2><button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}>Edit</button></div>
                      <dl className="review">
                        <dt>{t('full_name')}</dt><dd>{f.fullName}</dd>
                        <dt>{t('mobile')}</dt><dd>+91 {f.mobile}</dd>
                        <dt>{t('your_role')}</dt><dd>{t(`role_${f.role}`)} · {f.affiliation === 'party' ? f.party : t('aff_independent')}</dd>
                        <dt>{t('election')}</dt><dd>{t(`el_${f.electionType}`)}{f.electionType !== 'assembly' && ` · ${f.position}, ${f.localBody} ward ${f.wardNumber}`}</dd>
                        <dt>{t('booths')}</dt><dd>{f.booths.length} {t('selected')}</dd>
                      </dl>
                      <QuoteBox count={f.booths.length} t={t} />
                    </div>
                    <Field label={t('passcode')} error={errors.passcode} hint={t('passcode_hint')}>
                      <input className="input" type="password" autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
                    </Field>
                    <label className="check">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span className="small">{t('consent')}</span>
                    </label>
                    {errors.consent && <span className="err">{errors.consent}</span>}
                  </div>
                )}

                <div className="wizard-actions">
                  {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => { setErrors({}); setStep((s) => s - 1); }}>← {t('back')}</button> : <span />}
                  {step < 3
                    ? <button type="submit" className="btn btn-primary" disabled={step === 0 && !otp.token}>{t('next')} →</button>
                    : <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('creating') : t('create')}</button>}
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

function AreaStep({ f, set, setF, errors, meta, t }) {
  const [assemblies, setAssemblies] = useState([]);
  const [booths, setBooths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!f.district) { setAssemblies([]); return; }
    api(`/public/assemblies?district=${encodeURIComponent(f.district)}`).then((r) => setAssemblies(r.assemblies)).catch(() => setAssemblies([]));
  }, [f.district]);
  useEffect(() => {
    if (!f.assemblyId) { setBooths([]); return; }
    setLoading(true);
    api(`/public/assemblies/${f.assemblyId}/booths`).then((r) => setBooths(r.booths)).catch(() => setBooths([])).finally(() => setLoading(false));
  }, [f.assemblyId]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return booths;
    return booths.filter((b) => String(b.no) === n || b.name.toLowerCase().includes(n) || b.locality.toLowerCase().includes(n));
  }, [booths, q]);
  const sel = new Set(f.booths);
  const toggle = (no) => set('booths', sel.has(no) ? f.booths.filter((x) => x !== no) : [...f.booths, no].sort((a, b) => a - b));
  const positions = f.electionType === 'assembly' ? [] : meta?.positions?.[f.electionType] || [];

  return (
    <div className="stack">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t('election')}</legend>
        <div className="choices">
          {['assembly', 'rural', 'urban'].map((v) => (
            <Choice key={v} name="el" value={v} current={f.electionType} onChange={(x) => setF((s) => ({ ...s, electionType: x, position: '' }))} title={t(`el_${v}`)} desc={t(`el_${v}_d`)} />
          ))}
        </div>
      </fieldset>
      {f.electionType !== 'assembly' && (
        <div className="grid stack-sm" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,.6fr)' }}>
          <Field label={t('position')} error={errors.position}>
            <select className="select" value={f.position} onChange={(e) => set('position', e.target.value)}>
              <option value="">{t('select')}</option>
              {positions.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={t('local_body')} error={errors.localBody}>
            <input className="input" value={f.localBody} onChange={(e) => set('localBody', e.target.value)} />
          </Field>
          <Field label={t('ward')} error={errors.wardNumber}>
            <input className="input" inputMode="numeric" maxLength={3} value={f.wardNumber} onChange={(e) => set('wardNumber', e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
      )}
      <div className="grid g2">
        <Field label={t('district')} error={errors.district}>
          <select className="select" value={f.district} onChange={(e) => setF((s) => ({ ...s, district: e.target.value, assemblyId: '', booths: [] }))}>
            <option value="">{t('select')}</option>
            {(meta?.districts || []).map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label={t('assembly')} error={errors.assemblyId} hint={f.electionType !== 'assembly' ? 'The assembly constituency your ward falls in.' : undefined}>
          <select className="select" value={f.assemblyId} disabled={!f.district} onChange={(e) => setF((s) => ({ ...s, assemblyId: e.target.value, booths: [] }))}>
            <option value="">{f.district ? t('select') : t('choose_district')}</option>
            {assemblies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      {f.assemblyId && (
        <div className="field">
          <span className="lbl">{t('booths')} <span className="muted small">· {f.booths.length} {t('selected')} / {booths.length}</span></span>
          <div className="booth-picker">
            <div className="bar">
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <input className="input" style={{ minHeight: 38 }} placeholder={t('search_booths')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search_booths')} />
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('booths', [...new Set([...f.booths, ...shown.map((b) => b.no)])].sort((a, b) => a - b))}>{t('select_all')}</button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => set('booths', [])}>{t('clear')}</button>
            </div>
            <div className="booth-list" role="group" aria-label={t('booths')}>
              {loading && <div className="empty">Loading booths…</div>}
              {!loading && !shown.length && <div className="empty">No booth matches “{q}”.</div>}
              {shown.slice(0, 400).map((b) => (
                <label key={b.no} className="booth-row">
                  <input type="checkbox" checked={sel.has(b.no)} onChange={() => toggle(b.no)} />
                  <span className="no">#{b.no}</span>
                  <span className="nm" title={b.name}>{b.name}</span>
                  <span className="muted small">{b.voters.toLocaleString('en-IN')}</span>
                </label>
              ))}
            </div>
          </div>
          {errors.booths && <span className="err">{errors.booths}</span>}
          {f.booths.length > 0 && <QuoteBox count={f.booths.length} t={t} />}
        </div>
      )}
    </div>
  );
}

function QuoteBox({ count, t }) {
  const [qt, setQt] = useState(null);
  useEffect(() => {
    if (!count) return;
    const id = setTimeout(() => api(`/public/quote?booths=${count}`).then(setQt).catch(() => {}), 150);
    return () => clearTimeout(id);
  }, [count]);
  if (!qt) return null;
  return (
    <div className="quote-box" aria-live="polite">
      <div>
        <div className="small">{t('your_price')}: {qt.label}</div>
        {qt.nextTier && <div className="small">Next slab from {qt.nextTier.atBooths} booths</div>}
      </div>
      <div style={{ textAlign: 'right' }}><b>{inr(qt.total)}</b><div className="small">{inr(qt.base)} + {inr(qt.gst)} GST</div></div>
    </div>
  );
}

function Done({ done, t, nav }) {
  return (
    <div className="stack" style={{ textAlign: 'center', paddingTop: 30 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center', margin: '0 auto' }}><Icon name="check" size={32} /></div>
      <h1 style={{ fontSize: 28 }}>{t('done_title')}</h1>
      <p className="muted">{t('done_sub')}</p>
      <div className="card pad" style={{ textAlign: 'left', boxShadow: 'none' }}>
        <dl className="review">
          <dt>Username</dt><dd>{done.user.mobile}</dd>
          <dt>{t('assembly')}</dt><dd>{done.user.assemblyName}</dd>
          <dt>{t('booths')}</dt><dd>{done.user.booths.length}</dd>
          <dt>{t('your_price')}</dt><dd>{inr(done.quote.total)} <span className="muted small">({done.quote.label})</span></dd>
        </dl>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => nav('/app')}>{t('open_ws')}</button>
        <button className="btn btn-accent" onClick={() => nav('/app/billing')}>{t('pay_now')}</button>
      </div>
    </div>
  );
}
