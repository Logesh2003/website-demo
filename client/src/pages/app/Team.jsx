import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Field, useAsync, useToast, ErrorBox, Icon } from '../../components/ui.jsx';

const LANES = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];

export default function Team() {
  const { user } = useOutletContext();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => api('/me/team'), []);
  const [vol, setVol] = useState({ name: '', mobile: '', booths: [] });
  const [task, setTask] = useState({ title: '', boothNo: '', volunteerId: '' });

  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); reload(); } catch (e) { toast(e.message); } };
  const addVol = (e) => { e.preventDefault(); act(() => api('/me/volunteers', { method: 'POST', body: vol }).then(() => setVol({ name: '', mobile: '', booths: [] })), 'Volunteer added'); };
  const addTask = (e) => { e.preventDefault(); act(() => api('/me/tasks', { method: 'POST', body: { ...task, boothNo: task.boothNo || null, volunteerId: task.volunteerId || null } }).then(() => setTask({ title: '', boothNo: '', volunteerId: '' })), 'Task added'); };
  const sendLink = async (v) => {
    try {
      const r = await api(`/me/volunteers/${v.id}/link`, { method: 'POST' });
      const url = window.location.origin + r.path;
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
      const text = `Vanakkam ${v.name.split(' ')[0]}! Use this link to add voters you meet in booths ${v.booths.join(', ') || 'assigned to you'}. Take a photo of their voter ID card and check the details before saving. Link: ${url}`;
      window.open(`https://wa.me/91${v.mobile}?text=${encodeURIComponent(text)}`, '_blank', 'noreferrer');
      toast('Link copied and opened in WhatsApp. It works for 60 days; removing the volunteer turns it off.');
    } catch (e) { toast(e.message); }
  };
  const volName = (id) => data?.volunteers.find((v) => v.id === id)?.name;

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <div className="topbar"><div><h1>Team</h1><div className="muted small">Booth agents and the work they own.</div></div></div>

      <form className="card pad row" onSubmit={addTask} style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: '2 1 260px' }}><Field label="New task"><input className="input" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="e.g. Visit all first-time voters in section 2" /></Field></div>
        <div style={{ flex: '1 1 120px' }}><Field label="Booth"><select className="select" value={task.boothNo} onChange={(e) => setTask({ ...task, boothNo: e.target.value })}><option value="">Any</option>{user.booths.map((b) => <option key={b} value={b}>Booth {b}</option>)}</select></Field></div>
        <div style={{ flex: '1 1 160px' }}><Field label="Assign to"><select className="select" value={task.volunteerId} onChange={(e) => setTask({ ...task, volunteerId: e.target.value })}><option value="">Unassigned</option>{data?.volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field></div>
        <button className="btn btn-primary">Add task</button>
      </form>

      <div className="kanban">
        {LANES.map(([key, label]) => {
          const items = data?.tasks.filter((t) => t.status === key) || [];
          return (
            <section key={key} className="lane" aria-label={label}>
              <h3><span>{label}</span><span>{items.length}</span></h3>
              {items.map((t) => (
                <article key={t.id} className="task">
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div className="small muted">{t.booth_no ? `Booth ${t.booth_no}` : 'All booths'}{t.volunteer_id ? ` · ${volName(t.volunteer_id) || ''}` : ''}</div>
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    {LANES.filter(([k]) => k !== key).map(([k, l]) => <button key={k} className="btn btn-sm btn-ghost" onClick={() => act(() => api(`/me/tasks/${t.id}`, { method: 'PATCH', body: { status: k } }))}>→ {l}</button>)}
                    <button className="btn btn-sm btn-quiet" aria-label="Delete task" onClick={() => act(() => api(`/me/tasks/${t.id}`, { method: 'DELETE' }))}><Icon name="x" size={16} /></button>
                  </div>
                </article>
              ))}
              {!items.length && <p className="small muted" style={{ marginTop: 10 }}>Nothing here.</p>}
            </section>
          );
        })}
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <section className="card pad">
          <div className="panel-title"><h2>Volunteers ({data?.volunteers.length || 0})</h2></div>
          {data?.volunteers.map((v) => (
            <div key={v.id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div><b>{v.name}</b><div className="small muted">+91 {v.mobile} · {v.booths.length ? `Booths ${v.booths.join(', ')}` : 'No booths assigned'}</div></div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => sendLink(v)} title="Send a field-capture link on WhatsApp"><Icon name="link" size={16} />Field link</button>
                <a className="btn btn-sm btn-quiet" href={`https://wa.me/91${v.mobile}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${v.name}`}><Icon name="chat" size={16} /></a>
                <button className="btn btn-sm btn-quiet" aria-label={`Remove ${v.name}`} onClick={() => confirm(`Remove ${v.name}?`) && act(() => api(`/me/volunteers/${v.id}`, { method: 'DELETE' }), 'Removed')}><Icon name="x" size={16} /></button>
              </div>
            </div>
          ))}
          {data && !data.volunteers.length && <p className="muted small">Add your booth agents to start assigning work.</p>}
        </section>
        <form className="card pad stack" onSubmit={addVol}>
          <div className="panel-title"><h2>Add a volunteer</h2></div>
          <Field label="Name"><input className="input" value={vol.name} onChange={(e) => setVol({ ...vol, name: e.target.value })} /></Field>
          <Field label="Mobile"><div className="input-group"><span className="prefix">+91</span><input className="input" inputMode="numeric" maxLength={10} value={vol.mobile} onChange={(e) => setVol({ ...vol, mobile: e.target.value.replace(/\D/g, '') })} /></div></Field>
          <div className="field"><span className="lbl">Booths</span>
            <div className="row" style={{ gap: 6 }}>{user.booths.map((b) => <button type="button" key={b} className={`btn btn-sm ${vol.booths.includes(b) ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={vol.booths.includes(b)} onClick={() => setVol({ ...vol, booths: vol.booths.includes(b) ? vol.booths.filter((x) => x !== b) : [...vol.booths, b] })}>{b}</button>)}</div>
          </div>
          <button className="btn btn-primary">Add volunteer</button>
        </form>
      </div>
    </>
  );
}
