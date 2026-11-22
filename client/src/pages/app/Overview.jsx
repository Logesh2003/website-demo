import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, num, inr } from '../../api.js';
import { Kpi, StackBar, Legend, SENT, useAsync, ErrorBox, Skeleton, useToast } from '../../components/ui.jsx';

const G = [{ k: 'M', label: 'Men', color: 'var(--g-m)' }, { k: 'F', label: 'Women', color: 'var(--g-f)' }, { k: 'T', label: 'Third gender', color: 'var(--g-t)' }];

export default function Overview() {
  const { user, refresh } = useOutletContext();
  const { data, error, loading, reload } = useAsync(() => api('/me/overview'), []);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <div className="grid g4">{[1, 2, 3, 4].map((i) => <div key={i} className="card kpi"><Skeleton h={60} /></div>)}</div>;
  const d = data;
  const maxBand = Math.max(...Object.values(d.ages).map((b) => b.M + b.F + b.T));
  const tagged = d.totals.voters - d.sentiment.unknown;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Vanakkam, {user.fullName.split(' ')[0]}</h1>
          <div className="muted small">{d.assembly?.name}, {d.assembly?.district} · {d.totals.booths} booths in your plan</div>
        </div>
        <Countdown date={d.electionDate} onSaved={() => { reload(); refresh(); }} />
      </div>

      <div className="grid g4">
        <Kpi label="Voters in your booths" value={num(d.totals.voters)} detail={`Avg age ${d.totals.avgAge}`} />
        <Kpi label="First-time voters (18–19)" value={num(d.totals.firstTime)} detail={`${((d.totals.firstTime / d.totals.voters) * 100).toFixed(1)}% of roll`} />
        <Kpi label="Reachable by phone" value={num(d.totals.withMobile)} detail={`${Math.round((d.totals.withMobile / d.totals.voters) * 100)}% have a mobile on record`} />
        <Kpi label="Tagged so far" value={num(tagged)} detail={`${num(d.totals.contacted)} contacted · ${((tagged / d.totals.voters) * 100).toFixed(1)}% coverage`} />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <section className="card pad">
          <div className="panel-title"><h2>Age &amp; gender profile</h2><span className="muted small">voters per age band</span></div>
          <div className="bars">
            {Object.entries(d.ages).map(([band, v]) => {
              const tot = v.M + v.F + v.T;
              return (
                <div key={band} className="bar-row">
                  <span className="muted">{band}</span>
                  <div className="bar-track" style={{ width: `${(tot / maxBand) * 100}%` }} role="img" aria-label={`${band}: ${v.M} men, ${v.F} women, ${v.T} third gender`}>
                    {G.map((g) => <span key={g.k} style={{ width: `${(v[g.k] / Math.max(1, tot)) * 100}%`, background: g.color }} />)}
                  </div>
                  <span className="num">{num(tot)}</span>
                </div>
              );
            })}
          </div>
          <Legend items={G.map((g) => ({ label: g.label, color: g.color, value: d.gender[g.k] }))} />
        </section>

        <section className="card pad">
          <div className="panel-title"><h2>Voter sentiment</h2><Link className="small" to="/app/voters">Tag voters →</Link></div>
          {tagged === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              <p>No voters tagged yet.</p>
              <p className="small">Tag supporters, leaners and neutrals as your team meets people. Booth strength and outreach segments update instantly.</p>
            </div>
          ) : (
            <>
              <StackBar parts={SENT.map((s) => ({ label: s.label, value: d.sentiment[s.key], color: s.color }))} />
              <Legend items={SENT.map((s) => ({ label: s.label, color: s.color, value: d.sentiment[s.key] }))} />
              <p className="small muted" style={{ marginTop: 12 }}>Untagged: {num(d.sentiment.unknown)} voters. Support among tagged: <b>{Math.round(((d.sentiment.supporter + d.sentiment.leaning * 0.5) / tagged) * 100)}%</b></p>
            </>
          )}
          <div className="grid g3k" style={{ marginTop: 18, gap: 10 }}>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}><div className="small muted">Volunteers</div><b style={{ fontSize: 20 }}>{d.volunteers}</b></div>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}><div className="small muted">Open tasks</div><b style={{ fontSize: 20 }}>{d.tasks.todo + d.tasks.doing}</b></div>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}><div className="small muted">Done</div><b style={{ fontSize: 20 }}>{d.tasks.done}</b></div>
          </div>
        </section>
      </div>

      {!d.plan.active && (
        <section className="card pad" style={{ marginTop: 16 }}>
          <div className="row between">
            <div>
              <h2 style={{ fontSize: 18 }}>Unlock the full voter list for {d.totals.booths} booths</h2>
              <p className="muted" style={{ margin: 0 }}>Names, EPIC search, family view, tagging, CSV export and outreach. {d.plan.quote.label} · {inr(d.plan.quote.total)} incl. GST.</p>
            </div>
            <Link className="btn btn-accent" to="/app/billing">Unlock now</Link>
          </div>
        </section>
      )}

      <div className="grid g3" style={{ marginTop: 16 }}>
        <QuickLink to="/app/booths" title="Booth strength map" text="See which booths need attention today." />
        <QuickLink to="/app/outreach" title="Plan an outreach" text="Build a segment and see reach and cost." />
        <QuickLink to="/app/team" title="Assign booth tasks" text="Give your agents clear work for the week." />
      </div>
    </>
  );
}

function QuickLink({ to, title, text }) {
  return (
    <Link to={to} className="card pad" style={{ textDecoration: 'none', color: 'inherit' }}>
      <b>{title} →</b>
      <div className="muted small">{text}</div>
    </Link>
  );
}

function Countdown({ date, onSaved }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(date || '');
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60_000); return () => clearInterval(id); }, []);
  const save = async () => {
    try { await api('/me', { method: 'PATCH', body: { electionDate: val } }); setEdit(false); onSaved(); toast('Polling date saved'); } catch (e) { toast(e.message); }
  };
  if (edit || !date) {
    return (
      <div className="row">
        <label className="small muted" htmlFor="pdate">Polling day</label>
        <input id="pdate" type="date" className="input" style={{ minHeight: 38, width: 170 }} value={val} onChange={(e) => setVal(e.target.value)} />
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!val}>Save</button>
      </div>
    );
  }
  const ms = new Date(date + 'T07:00:00+05:30') - Date.now();
  const days = Math.max(0, Math.floor(ms / 864e5));
  const hrs = Math.max(0, Math.floor((ms % 864e5) / 36e5));
  return (
    <button type="button" className="countdown" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setEdit(true)} title="Change polling date">
      <div><b>{days}</b><span className="small muted">days</span></div>
      <div><b>{hrs}</b><span className="small muted">hours</span></div>
      <div style={{ textAlign: 'left', background: 'none' }}><span className="small muted">to polling day</span><br /><span className="small">{new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    </button>
  );
}
