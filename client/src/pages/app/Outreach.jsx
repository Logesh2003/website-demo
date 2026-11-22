import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api, inr, num } from '../../api.js';
import { Field, SENT, useToast, useAsync } from '../../components/ui.jsx';

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', max: 1000, desc: 'Image + text via approved template' },
  { key: 'sms', label: 'SMS', max: 320, desc: 'DLT-registered text, 2 parts max' },
  { key: 'voice', label: 'Voice call', max: 1000, desc: 'Your recorded message (script below)' },
];
const TEMPLATES = {
  en: 'Vanakkam {name}! I am contesting from your area. Polling is at booth {booth}. Your vote matters — please come and vote.',
  ta: 'வணக்கம் {name}! உங்கள் பகுதியில் போட்டியிடுகிறேன். உங்கள் வாக்குச்சாவடி எண் {booth}. உங்கள் வாக்கு முக்கியம் — தவறாமல் வாக்களியுங்கள்.',
};
const STATUS = { pending_review: ['tag-warn', 'In review'], approved: ['tag-ok', 'Approved'], rejected: ['tag-bad', 'Rejected'] };

export default function Outreach() {
  const { user } = useOutletContext();
  const toast = useToast();
  const active = user.status === 'active';
  const [seg, setSeg] = useState({ booths: [], gender: '', ageMin: '', ageMax: '', firstTime: false, sentiments: [] });
  const [preview, setPreview] = useState(null);
  const [channel, setChannel] = useState('whatsapp');
  const [message, setMessage] = useState(TEMPLATES.en);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useAsync(() => api('/me/broadcasts'), []);

  useEffect(() => {
    const id = setTimeout(() => api('/me/segments/preview', { method: 'POST', body: { segment: seg } }).then(setPreview).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [seg]);

  const toggle = (k, v) => setSeg((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const ch = CHANNELS.find((c) => c.key === channel);
  const cost = preview?.costs?.[channel];
  const sample = message.replace('{name}', 'Lakshmi').replace('{booth}', seg.booths[0] || user.booths[0]);

  async function submit() {
    setBusy(true);
    try {
      const r = await api('/me/broadcasts', { method: 'POST', body: { channel, message, segment: seg, scheduledFor: when || null } });
      toast(`Sent for review: ${num(r.audience)} voters, ${inr(r.cost.total)}`);
      history.reload();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar"><div><h1>Outreach</h1><div className="muted small">Build an audience, write once, reach them on the channel they use.</div></div></div>
      <div className="grid stack-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="card pad stack">
          <div className="panel-title"><h2>1 · Audience</h2></div>
          <div className="field">
            <span className="lbl">Booths <span className="muted small">({seg.booths.length || 'all'})</span></span>
            <div className="row" style={{ gap: 6 }}>
              {user.booths.map((b) => (
                <button key={b} type="button" className={`btn btn-sm ${seg.booths.includes(b) ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={seg.booths.includes(b)} onClick={() => toggle('booths', b)}>{b}</button>
              ))}
            </div>
          </div>
          <div className="grid g3">
            <Field label="Gender">
              <select className="select" value={seg.gender} onChange={(e) => setSeg({ ...seg, gender: e.target.value })}><option value="">All</option><option value="F">Women</option><option value="M">Men</option><option value="T">Third gender</option></select>
            </Field>
            <Field label="Age from"><input className="input" inputMode="numeric" value={seg.ageMin} onChange={(e) => setSeg({ ...seg, ageMin: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="to"><input className="input" inputMode="numeric" value={seg.ageMax} onChange={(e) => setSeg({ ...seg, ageMax: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={seg.firstTime} onChange={(e) => setSeg({ ...seg, firstTime: e.target.checked })} />Only first-time voters (18–19)</label>
          <div className="field">
            <span className="lbl">Sentiment</span>
            <div className="sent">
              {[...SENT, { key: 'unknown', label: 'Not tagged', color: 'var(--line-strong)' }].map((s) => (
                <button key={s.key} type="button" aria-pressed={seg.sentiments.includes(s.key)} onClick={() => toggle('sentiments', s.key)}><i className="dot" style={{ background: s.color }} />{s.label}</button>
              ))}
            </div>
          </div>
          <div className="quote-box" aria-live="polite">
            <div><div className="small">Audience</div><b>{preview ? num(preview.audience) : '…'}</b></div>
            <div style={{ textAlign: 'right' }}><div className="small">Reachable (has mobile)</div><b>{preview ? num(preview.reachable) : '…'}</b></div>
          </div>
        </section>

        <section className="card pad stack">
          <div className="panel-title"><h2>2 · Message</h2>
            <div className="seg" role="group" aria-label="Template language">
              <button type="button" aria-pressed={message === TEMPLATES.en} onClick={() => setMessage(TEMPLATES.en)}>EN</button>
              <button type="button" aria-pressed={message === TEMPLATES.ta} onClick={() => setMessage(TEMPLATES.ta)} lang="ta">தமிழ்</button>
            </div>
          </div>
          <div className="choices">
            {CHANNELS.map((c) => (
              <label key={c.key} className={`choice${channel === c.key ? ' on' : ''}`}>
                <input type="radio" name="ch" checked={channel === c.key} onChange={() => setChannel(c.key)} />
                <span className="radio" aria-hidden="true" />
                <span><b>{c.label}</b><span className="small muted">{c.desc}</span><br /><span className="small">{inr(preview?.costs?.[c.key]?.rate ?? 0)}/voter</span></span>
              </label>
            ))}
          </div>
          <Field label={channel === 'voice' ? 'Voice script' : 'Message'} hint={`${message.length}/${ch.max} · use {name} and {booth} to personalise`}>
            <textarea className="input" value={message} maxLength={ch.max} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="alert small"><b>Preview:</b> {sample}</div>
          <Field label="Schedule (optional)"><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <div className="row between">
            <div><div className="small muted">Estimated cost incl. GST</div><b style={{ fontSize: 22 }}>{cost ? inr(cost.total) : '…'}</b></div>
            {active
              ? <button className="btn btn-primary" onClick={submit} disabled={busy || !preview?.reachable}>Send for review</button>
              : <Link className="btn btn-accent" to="/app/billing">Unlock to send</Link>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Every broadcast is checked by our team for Model Code of Conduct and DLT compliance before it goes out.</p>
        </section>
      </div>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="panel-title"><h2>Broadcast history</h2></div>
        {history.data?.broadcasts.length ? (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Channel</th><th>Message</th><th className="num">Audience</th><th className="num">Cost</th><th>Status</th></tr></thead>
            <tbody>{history.data.broadcasts.map((b) => (
              <tr key={b.id}><td className="small">{b.created_at.slice(0, 16)}</td><td>{b.channel}</td><td className="small" style={{ maxWidth: 360 }}>{b.message.slice(0, 90)}{b.message.length > 90 && '…'}</td><td className="num">{num(b.audience)}</td><td className="num">{inr(b.cost)}</td><td><span className={`tag ${STATUS[b.status]?.[0]}`}>{STATUS[b.status]?.[1] || b.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty">No broadcasts yet.</div>}
      </section>
    </>
  );
}
