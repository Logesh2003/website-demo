import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { SiteHeader, Field } from '../components/ui.jsx';
import { api, session } from '../api.js';
import { useDemo } from './Landing.jsx';

export default function Login() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const openDemo = useDemo();
  const [mode, setMode] = useState('passcode'); // passcode | otp | reset
  const [mobile, setMobile] = useState(params.get('mobile') || '');
  const [passcode, setPasscode] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [error, setError] = useState(params.get('expired') ? 'Your session ended. Please sign in again.' : '');
  const [busy, setBusy] = useState(false);

  const finish = (s) => { session.set(s); nav('/app'); };
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const sendCode = () => run(async () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('Enter a valid 10-digit mobile number.');
    const r = await api('/auth/otp/send', { method: 'POST', body: { mobile, purpose: mode === 'reset' ? 'reset' : 'login', lang } });
    setSent(r);
  });

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'passcode') return run(async () => finish(await api('/auth/login', { method: 'POST', body: { mobile, passcode } })));
    if (!sent) return sendCode();
    return run(async () => {
      const { verifyToken } = await api('/auth/otp/verify', { method: 'POST', body: { mobile, code } });
      if (mode === 'otp') finish(await api('/auth/login-otp', { method: 'POST', body: { verifyToken } }));
      else finish(await api('/auth/reset-passcode', { method: 'POST', body: { verifyToken, passcode: newPass } }));
    });
  };

  const switchMode = (m) => { setMode(m); setSent(null); setCode(''); setError(''); };

  return (
    <>
      <SiteHeader><span className="small muted">{t('new_here')}</span> <Link className="btn btn-ghost btn-sm" to="/register">{t('create_acc')}</Link></SiteHeader>
      <main className="auth-main" style={{ minHeight: 'calc(100svh - 65px)', alignItems: 'flex-start' }}>
        <form className="card pad auth-card stack" style={{ maxWidth: 440, marginTop: '6vh' }} onSubmit={submit} noValidate>
          <div>
            <h1 style={{ fontSize: 26 }}>{mode === 'reset' ? t('reset') : t('login_title')}</h1>
            <p className="muted" style={{ margin: 0 }}>{t('login_sub')}</p>
          </div>
          {mode !== 'reset' && (
            <div className="seg" role="group" aria-label="Sign-in method">
              <button type="button" aria-pressed={mode === 'passcode'} onClick={() => switchMode('passcode')}>{t('with_passcode')}</button>
              <button type="button" aria-pressed={mode === 'otp'} onClick={() => switchMode('otp')}>{t('with_otp')}</button>
            </div>
          )}
          {error && <div className="alert alert-bad" role="alert">{error}</div>}
          <Field label={t('mobile')}>
            <div className="input-group">
              <span className="prefix">+91</span>
              <input className="input" inputMode="numeric" autoComplete="username" maxLength={10} value={mobile} disabled={!!sent} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
          </Field>
          {mode === 'passcode' && (
            <Field label={t('with_passcode')}>
              <input className="input" type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            </Field>
          )}
          {mode !== 'passcode' && sent && (
            <>
              {sent.devCode && <div className="alert alert-brand small">{t('dev_code')} <b>{sent.devCode}</b></div>}
              <Field label={t('otp')}>
                <input className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </Field>
              {mode === 'reset' && (
                <Field label={t('new_passcode')} hint={t('passcode_hint')}>
                  <input className="input" type="password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                </Field>
              )}
            </>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {mode === 'passcode' ? t('sign_in') : !sent ? t('send_code') : mode === 'reset' ? t('reset') : t('sign_in')}
          </button>
          <div className="row between small">
            {mode === 'reset'
              ? <button type="button" className="btn btn-quiet btn-sm" onClick={() => switchMode('passcode')}>← {t('back')}</button>
              : <button type="button" className="btn btn-quiet btn-sm" onClick={() => switchMode('reset')}>{t('forgot')}</button>}
            <button type="button" className="btn btn-quiet btn-sm" onClick={openDemo}>{t('try_demo')}</button>
          </div>
        </form>
      </main>
    </>
  );
}
