import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, inr } from '../../api.js';
import { Field, useAsync, useToast, ErrorBox, Skeleton } from '../../components/ui.jsx';
import { PlanTag } from './Layout.jsx';

const PAY = { created: ['tag', 'Awaiting payment'], submitted: ['tag-warn', 'UTR in review'], approved: ['tag-ok', 'Approved'], rejected: ['tag-bad', 'Rejected'] };

export default function Billing() {
  const { user, refresh } = useOutletContext();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('/me/billing'), []);
  const [order, setOrder] = useState(null);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const start = async () => { setBusy(true); try { setOrder(await api('/me/payments', { method: 'POST' })); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  const submitUtr = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{12}$/.test(utr)) return setErr('UTR is the 12-digit number shown in your UPI app after paying.');
    setBusy(true);
    try { await api(`/me/payments/${order.payment.id}/utr`, { method: 'POST', body: { utr } }); toast('Thanks! We are verifying your payment.'); setOrder(null); setUtr(''); reload(); refresh(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton h={300} />;
  const qt = data.quote;
  const isMobileUA = /Android|iPhone|iPad/i.test(navigator.userAgent);

  return (
    <>
      <div className="topbar"><div><h1>Plan &amp; billing</h1><div className="muted small">{user.assemblyName} · {user.booths.length} booths</div></div><PlanTag status={data.status} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card pad stack">
          <div className="panel-title"><h2>{qt.label}</h2><span className="tag tag-brand">{qt.boothCount} booths</span></div>
          <dl className="review">
            <dt>Plan price</dt><dd>{inr(qt.base)}</dd>
            <dt>GST (18%)</dt><dd>{inr(qt.gst)}</dd>
            <dt>Total</dt><dd style={{ fontSize: 22 }}>{inr(qt.total)}</dd>
            <dt>Per booth</dt><dd>{inr(qt.perBooth)}</dd>
          </dl>
          {qt.nextTier && <p className="small muted" style={{ margin: 0 }}>Add booths up to {qt.nextTier.atBooths - 1} without changing slab.</p>}
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Full voter names, EPIC search, household view</li><li>Sentiment tagging, notes and booth strength map</li><li>CSV export (audit-logged) and printable booth reports</li><li>Outreach by SMS, WhatsApp and voice (billed per send)</li>
          </ul>
          {data.status === 'registered' && !order && <button className="btn btn-accent btn-block" onClick={start} disabled={busy}>Pay {inr(qt.total)} by UPI</button>}
          {data.status === 'pending_review' && <div className="alert alert-warn">Your UTR is being verified. You will get full access as soon as it is matched — usually within the hour.</div>}
          {data.status === 'active' && <div className="alert alert-ok">Your plan is active. Thank you!</div>}
        </section>

        {order && (
          <section className="card pad stack" style={{ textAlign: 'center' }}>
            <div className="panel-title" style={{ justifyContent: 'center' }}><h2>Step 1 · Pay {inr(order.payment.total)}</h2></div>
            <img className="qr" src={order.qr} alt={`UPI QR code to pay ${inr(order.payment.total)} to ${order.vpa}`} style={{ margin: '0 auto' }} />
            <div className="small">Scan with any UPI app — GPay, PhonePe, Paytm, BHIM.<br />UPI ID <b>{order.vpa}</b> · Ref <b>{order.payment.ref}</b></div>
            {isMobileUA && <a className="btn btn-primary" href={order.upi}>Open UPI app</a>}
            <form onSubmit={submitUtr} className="stack" style={{ textAlign: 'left' }}>
              <div className="panel-title" style={{ marginBottom: 0 }}><h2>Step 2 · Enter the UTR</h2></div>
              <Field label="12-digit UTR / UPI reference" error={err} hint="Find it under ‘Transaction details’ in your UPI app.">
                <input className="input" inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 412345678901" />
              </Field>
              <button className="btn btn-primary btn-block" disabled={busy}>Submit for verification</button>
            </form>
          </section>
        )}

        {!order && (
          <section className="card pad">
            <div className="panel-title"><h2>Payments</h2></div>
            {data.payments.length ? (
              <table className="tbl"><thead><tr><th>Ref</th><th className="num">Amount</th><th>UTR</th><th>Status</th></tr></thead>
                <tbody>{data.payments.map((p) => <tr key={p.id}><td className="small">{p.ref}<div className="muted">{p.created_at.slice(0, 10)}</div></td><td className="num">{inr(p.total)}</td><td className="small">{p.utr || '—'}</td><td><span className={`tag ${PAY[p.status][0]}`}>{PAY[p.status][1]}</span>{p.note && <div className="small muted">{p.note}</div>}</td></tr>)}</tbody>
              </table>
            ) : <div className="empty">No payments yet.</div>}
          </section>
        )}
      </div>
    </>
  );
}
