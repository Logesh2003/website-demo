import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams, Link } from 'react-router-dom';
import { api, qs, num } from '../../api.js';
import { Icon, SENT, ErrorBox, useToast } from '../../components/ui.jsx';

const GENDER = { M: 'Male', F: 'Female', T: 'Third gender' };

export default function Voters() {
  const { user } = useOutletContext();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = { q: params.get('q') || '', booth: params.get('booth') || '', gender: params.get('gender') || '', sentiment: params.get('sentiment') || '', ageMin: params.get('ageMin') || '', ageMax: params.get('ageMax') || '', firstTime: params.get('firstTime') || '', hasMobile: params.get('hasMobile') || '', page: params.get('page') || '1' };
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(null);
  const active = user.status === 'active';

  const update = (patch) => {
    const next = { ...filters, page: '1', ...patch };
    setParams(qs(next), { replace: true });
  };
  const key = params.toString();
  useEffect(() => {
    let live = true;
    setError(null);
    api(`/me/voters?${qs({ ...filters, pageSize: 25 })}`).then((d) => live && setData(d)).catch((e) => live && setError(e));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { const id = setTimeout(() => { if (q !== filters.q) update({ q }); }, 300); return () => clearTimeout(id); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function exportCsv() {
    try {
      const res = await api(`/me/export.csv?${qs({ booth: filters.booth })}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `sethu-voters${filters.booth ? '-booth-' + filters.booth : ''}.csv` });
      a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded. This export is recorded in your audit log.');
    } catch (e) { toast(e.message); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const onTagged = (id, tag) => setData((d) => d && ({ ...d, voters: d.voters.map((v) => (v.id === id ? { ...v, tag } : v)) }));

  return (
    <>
      <div className="topbar">
        <div><h1>Voters</h1><div className="muted small">{data ? `${num(data.total)} matching` : 'Loading…'}</div></div>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={!active} title={active ? 'Download CSV' : 'Available on the full plan'}><Icon name="download" size={18} />Export CSV</button>
      </div>
      {!active && <div className="alert alert-warn" style={{ marginBottom: 14 }}><Icon name="lock" size={16} /> Names and EPIC numbers are masked in the free preview, and search by name is off. <Link to="/app/billing">Unlock the full plan</Link> to see and tag voters.</div>}

      <div className="filters">
        <input className="input" placeholder={active ? 'Search name, EPIC or relation name' : 'Search is on the full plan'} value={q} onChange={(e) => setQ(e.target.value)} disabled={!active} aria-label="Search voters" />
        <select className="select" value={filters.booth} onChange={(e) => update({ booth: e.target.value })} aria-label="Booth">
          <option value="">All booths</option>
          {user.booths.map((b) => <option key={b} value={b}>Booth {b}</option>)}
        </select>
        <select className="select" value={filters.gender} onChange={(e) => update({ gender: e.target.value })} aria-label="Gender">
          <option value="">Any gender</option><option value="F">Women</option><option value="M">Men</option><option value="T">Third gender</option>
        </select>
        <select className="select" value={filters.sentiment} onChange={(e) => update({ sentiment: e.target.value })} aria-label="Sentiment">
          <option value="">Any sentiment</option>{SENT.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}<option value="unknown">Not tagged</option>
        </select>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <input className="input" inputMode="numeric" placeholder="Age from" value={filters.ageMin} onChange={(e) => update({ ageMin: e.target.value.replace(/\D/g, '') })} aria-label="Minimum age" />
          <input className="input" inputMode="numeric" placeholder="to" value={filters.ageMax} onChange={(e) => update({ ageMax: e.target.value.replace(/\D/g, '') })} aria-label="Maximum age" />
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="check small"><input type="checkbox" checked={filters.firstTime === '1'} onChange={(e) => update({ firstTime: e.target.checked ? '1' : '' })} />First-time voters</label>
        <label className="check small"><input type="checkbox" checked={filters.hasMobile === '1'} onChange={(e) => update({ hasMobile: e.target.checked ? '1' : '' })} />Has mobile</label>
        {params.toString() && <button className="btn btn-quiet btn-sm" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear filters</button>}
      </div>

      {error && <ErrorBox error={error} />}
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Booth</th><th>Sl.</th><th>Name</th><th>Relation</th><th className="num">Age</th><th>Gender</th><th>House</th><th>EPIC</th><th>Tag</th></tr></thead>
          <tbody>
            {data?.voters.map((v) => (
              <tr key={v.id} className="click" onClick={() => setOpen(v.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(v.id)}>
                <td>{v.boothNo}</td><td className="muted">{v.serial}</td>
                <td><b>{v.name}</b>{v.nameTamil && v.nameTamil !== v.name && <div className="small muted" lang="ta">{v.nameTamil}</div>}{v.source && v.source !== 'sample' && <span className={`tag ${v.source === 'field' ? 'tag-warn' : 'tag-ok'}`} style={{ marginLeft: 6, fontSize: 11 }}>{v.source === 'field' ? 'Field' : 'Roll'}</span>}</td>
                <td className="small muted">{v.relation}: {v.relationName}</td>
                <td className="num">{v.age}</td><td>{GENDER[v.gender]}</td><td>{v.house}</td>
                <td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>{v.epic}</td>
                <td>{v.tag?.sentiment ? <SentTag s={v.tag.sentiment} /> : <span className="muted small">—</span>}</td>
              </tr>
            ))}
            {data && !data.voters.length && <tr><td colSpan={9} className="empty">No voters match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="pager">
          <span className="small muted">Page {data.page} of {pages}</span>
          <div className="row">
            <button className="btn btn-sm btn-ghost" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}>← Prev</button>
            <button className="btn btn-sm btn-ghost" disabled={data.page >= pages} onClick={() => update({ page: String(data.page + 1) })}>Next →</button>
          </div>
        </div>
      )}
      {open && <VoterDrawer id={open} active={active} onClose={() => setOpen(null)} onOpen={setOpen} onTagged={onTagged} />}
    </>
  );
}

export function SentTag({ s }) {
  const m = SENT.find((x) => x.key === s);
  return <span className="tag"><i className="dot" style={{ background: m.color }} />{m.label}</span>;
}

function VoterDrawer({ id, active, onClose, onOpen, onTagged }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setD(null);
    api(`/me/voters/${id}`).then((r) => { setD(r); setNote(r.voter.tag?.note || ''); }).catch((e) => toast(e.message));
  }, [id, toast]);
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  async function save(patch) {
    if (!active) return toast('Activate your plan to tag voters.');
    setSaving(true);
    const tag = { sentiment: d.voter.tag?.sentiment || null, note, contacted: !!d.voter.tag?.contacted, ...patch };
    try {
      const r = await api(`/me/voters/${id}/tag`, { method: 'PUT', body: tag });
      setD((x) => ({ ...x, voter: { ...x.voter, tag: r.tag } }));
      onTagged(id, r.tag);
      toast('Saved');
    } catch (e) { toast(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Voter details" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><span className="small muted">Booth {d?.voter.boothNo} · Sl. {d?.voter.serial}</span><button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {!d ? <div className="skeleton" style={{ height: 200, marginTop: 16 }} /> : (
          <div className="stack" style={{ marginTop: 8 }}>
            <div>
              <h2 style={{ fontSize: 22, margin: 0 }}>{d.voter.name}</h2>
              <div className="muted">{d.voter.relation}: {d.voter.relationName} · {d.voter.age} yrs · {GENDER[d.voter.gender]}</div>
            </div>
            <dl className="review">
              <dt>EPIC</dt><dd style={{ fontFamily: 'ui-monospace, monospace' }}>{d.voter.epic}</dd>
              <dt>House</dt><dd>{d.voter.house}</dd>
              <dt>Section</dt><dd>{d.voter.section}</dd>
              <dt>Mobile</dt><dd>{d.voter.mobile ? `+91 ${d.voter.mobile}` : <span className="muted">Not on record</span>}</dd>
            </dl>
            {d.voter.mobile && active && (
              <div className="row">
                <a className="btn btn-sm btn-ghost" href={`tel:+91${d.voter.mobile}`}><Icon name="phone" size={16} />Call</a>
                <a className="btn btn-sm btn-ghost" href={`https://wa.me/91${d.voter.mobile}?text=${encodeURIComponent(`Vanakkam ${d.voter.name},`)}`} target="_blank" rel="noreferrer"><Icon name="chat" size={16} />WhatsApp</a>
              </div>
            )}
            <div>
              <div className="lbl" style={{ fontWeight: 600, marginBottom: 8 }}>Sentiment</div>
              <div className="sent">
                {SENT.map((s) => (
                  <button key={s.key} type="button" style={{ color: s.color }} aria-pressed={d.voter.tag?.sentiment === s.key} disabled={saving || !active}
                    onClick={() => save({ sentiment: d.voter.tag?.sentiment === s.key ? null : s.key })}>
                    <i className="dot" style={{ background: s.color }} /><span style={{ color: 'var(--ink)' }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={!!d.voter.tag?.contacted} disabled={!active} onChange={(e) => save({ contacted: e.target.checked })} />Contacted by our team</label>
            <label className="field"><span className="lbl">Notes</span>
              <textarea className="input" value={note} disabled={!active} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wants streetlight fixed near the temple. Prefers Tamil." maxLength={500} />
            </label>
            <button className="btn btn-primary" disabled={saving || !active} onClick={() => save({ note })}>Save note</button>
            <div>
              <div className="panel-title" style={{ marginTop: 10 }}><h2>Household ({d.family.length + 1})</h2><span className="small muted">House {d.voter.house}</span></div>
              {d.family.length === 0 && <p className="small muted">Lives alone on the roll.</p>}
              {d.family.map((m) => (
                <button key={m.id} type="button" className="card row between" style={{ width: '100%', padding: 10, marginTop: 6, boxShadow: 'none', cursor: 'pointer', textAlign: 'left', background: 'var(--surface)' }} onClick={() => onOpen(m.id)}>
                  <span><b>{m.name}</b> <span className="small muted">· {m.age} · {GENDER[m.gender]}</span></span>
                  {m.tag?.sentiment ? <SentTag s={m.tag.sentiment} /> : <span className="small muted">Not tagged</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
