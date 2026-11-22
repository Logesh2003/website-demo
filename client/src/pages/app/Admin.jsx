import { useState } from 'react';
import { useOutletContext, Navigate } from 'react-router-dom';
import { api, inr, num, qs } from '../../api.js';
import { Kpi, useAsync, useToast, ErrorBox } from '../../components/ui.jsx';
import { PlanTag } from './Layout.jsx';

export default function Admin() {
  const { user } = useOutletContext();
  const [tab, setTab] = useState('payments');
  if (!user.isAdmin) return <Navigate to="/app" replace />;
  return (
    <>
      <div className="topbar"><div><h1>Admin console</h1><div className="muted small">Registrations, payments, outreach approvals, audit trail</div></div>
        <div className="seg" role="tablist">
          {[['payments', 'Payments'], ['registrations', 'Registrations'], ['broadcasts', 'Broadcasts'], ['audit', 'Audit log']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <Stats />
      <div style={{ marginTop: 16 }}>
        {tab === 'payments' && <Payments />}
        {tab === 'registrations' && <Registrations />}
        {tab === 'broadcasts' && <Broadcasts />}
        {tab === 'audit' && <Audit />}
      </div>
    </>
  );
}

function Stats() {
  const { data } = useAsync(() => api('/admin/stats'), []);
  if (!data) return null;
  const f = data.funnel;
  const steps = [['Landing views', f.landing], ['Started sign-up', f.started], ['OTP sent', f.otpSent], ['Verified', f.verified], ['Registered', f.registered], ['Paid', f.paid]];
  const max = Math.max(1, ...steps.map((s) => s[1]));
  return (
    <div className="grid stack-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
      <div className="grid g2">
        <Kpi label="Revenue (approved)" value={inr(data.revenue)} />
        <Kpi label="Payments to review" value={data.pendingPayments} />
        <Kpi label="Active candidates" value={data.byStatus.active || 0} detail={`${data.byStatus.registered || 0} free · ${data.byStatus.pending_review || 0} in review`} />
        <Kpi label="Broadcasts to review" value={data.pendingBroadcasts} />
      </div>
      <section className="card pad">
        <div className="panel-title"><h2>Sign-up funnel</h2><span className="small muted">unique numbers</span></div>
        <div className="bars">
          {steps.map(([l, n]) => <div key={l} className="bar-row" style={{ gridTemplateColumns: '120px minmax(0,1fr) 50px' }}><span className="small">{l}</span><div className="bar-track"><span style={{ width: `${(n / max) * 100}%`, background: 'var(--brand)' }} /></div><span className="num">{num(n)}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function Payments() {
  const toast = useToast();
  const [status, setStatus] = useState('submitted');
  const { data, error, reload } = useAsync(() => api(`/admin/payments?status=${status}`), [status]);
  const decide = async (id, d) => {
    const note = d === 'reject' ? prompt('Reason shown to the candidate', 'UTR not found in bank statement') : null;
    if (d === 'reject' && note === null) return;
    try { await api(`/admin/payments/${id}/${d}`, { method: 'POST', body: { note } }); toast(d === 'approve' ? 'Approved — plan is now active' : 'Rejected'); reload(); } catch (e) { toast(e.message); }
  };
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <section className="card pad">
      <div className="panel-title"><h2>Payments</h2>
        <select className="select" style={{ width: 'auto', minHeight: 36 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="submitted">UTR submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="created">Not paid yet</option></select>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Candidate</th><th>Ref</th><th className="num">Amount</th><th>UTR</th><th>Booths</th><th>Created</th><th /></tr></thead>
        <tbody>
          {data?.payments.map((p) => (
            <tr key={p.id}><td><b>{p.full_name}</b><div className="small muted">{p.mobile}</div></td><td className="small">{p.ref}</td><td className="num">{inr(p.total)}</td><td style={{ fontFamily: 'ui-monospace, monospace' }}>{p.utr || '—'}</td><td>{p.booth_count}</td><td className="small">{p.created_at.slice(0, 16)}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>{p.status === 'submitted' && <><button className="btn btn-sm btn-primary" onClick={() => decide(p.id, 'approve')}>Approve</button><button className="btn btn-sm btn-danger" onClick={() => decide(p.id, 'reject')}>Reject</button></>}</td></tr>
          ))}
          {data && !data.payments.length && <tr><td colSpan={7} className="empty">Nothing here.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}

function Registrations() {
  const [f, setF] = useState({ q: '', status: '' });
  const { data } = useAsync(() => api(`/admin/registrations?${qs(f)}`), [f.q, f.status]);
  return (
    <section className="card pad">
      <div className="panel-title"><h2>Registrations {data && <span className="muted small">({data.registrations.length})</span>}</h2>
        <div className="row"><input className="input" style={{ minHeight: 36, width: 220 }} placeholder="Search name, mobile, AC" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className="select" style={{ width: 'auto', minHeight: 36 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option><option value="registered">Free preview</option><option value="pending_review">In review</option><option value="active">Active</option></select></div>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Name</th><th>Mobile</th><th>Election</th><th>Constituency</th><th>Party</th><th className="num">Booths</th><th>Status</th><th>Joined</th></tr></thead>
        <tbody>{data?.registrations.map((r) => (
          <tr key={r.id}><td><b>{r.fullName}</b>{r.isDemo && <span className="tag" style={{ marginLeft: 6 }}>demo</span>}</td><td>{r.mobile}</td><td className="small">{r.electionType}{r.position && ` · ${r.position}`}</td><td>{r.assemblyName}<div className="small muted">{r.district}</div></td><td>{r.party || 'Independent'}</td><td className="num">{r.booths.length}</td><td><PlanTag status={r.status} /></td><td className="small">{r.createdAt.slice(0, 10)}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function Broadcasts() {
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/admin/broadcasts'), []);
  const decide = async (id, d) => { try { await api(`/admin/broadcasts/${id}/${d}`, { method: 'POST' }); toast(`Broadcast ${d}d`); reload(); } catch (e) { toast(e.message); } };
  return (
    <section className="card pad">
      <div className="panel-title"><h2>Outreach requests</h2></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Candidate</th><th>Channel</th><th>Message</th><th className="num">Audience</th><th className="num">Cost</th><th>Status</th><th /></tr></thead>
        <tbody>{data?.broadcasts.map((b) => (
          <tr key={b.id}><td><b>{b.full_name}</b><div className="small muted">{b.mobile}</div></td><td>{b.channel}</td><td className="small" style={{ maxWidth: 380 }}>{b.message}</td><td className="num">{num(b.audience)}</td><td className="num">{inr(b.cost)}</td><td>{b.status}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}>{b.status === 'pending_review' && <><button className="btn btn-sm btn-primary" onClick={() => decide(b.id, 'approve')}>Approve</button><button className="btn btn-sm btn-danger" onClick={() => decide(b.id, 'reject')}>Reject</button></>}</td></tr>
        ))}
        {data && !data.broadcasts.length && <tr><td colSpan={7} className="empty">No requests.</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

function Audit() {
  const { data } = useAsync(() => api('/admin/audit'), []);
  return (
    <section className="card pad">
      <div className="panel-title"><h2>Audit log</h2><span className="small muted">Exports, payments, consent — kept for DPDP accountability</span></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{data?.audit.map((a) => <tr key={a.id}><td className="small">{a.created_at}</td><td>{a.full_name || 'System'}</td><td><span className="tag">{a.action}</span></td><td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>{a.detail}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
