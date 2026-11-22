import { useEffect, useRef, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api, num } from '../../api.js';
import { useToast, Icon, ErrorBox } from '../../components/ui.jsx';
import { pdfPages, imageToCanvas, canvasToDataUrl, ocrRollPage, onOcrProgress } from '../../lib/ocr.js';

const GENDER = { M: 'Male', F: 'Female', T: 'Third gender', '': '?' };

export default function Import() {
  const { user } = useOutletContext();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [booth, setBooth] = useState(user.booths[0] || '');
  const [engine, setEngine] = useState('ocr');
  const [imp, setImp] = useState(null);
  const [pages, setPages] = useState([]); // {page, state, found, thumb, error}
  const [busy, setBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    api('/extract/status').then((s) => { setStatus(s); setEngine(s.claude ? 'claude' : 'ocr'); }).catch(setError);
    api('/imports').then((r) => setHistory(r.imports)).catch(() => {});
    onOcrProgress((m) => {
      if (m.status === 'recognizing text') setOcrMsg(`Reading text… ${Math.round(m.progress * 100)}%`);
      else if (m.status?.includes('loading')) setOcrMsg('Loading Tamil + English OCR (first time only, ~15 MB)…');
    });
    return () => onOcrProgress(null);
  }, []);

  const setPage = (page, patch) => setPages((ps) => ps.map((p) => (p.page === page ? { ...p, ...patch } : p)));

  async function processPage(impId, page, canvas, text) {
    setPage(page, { state: 'reading' });
    try {
      let body;
      if (engine === 'claude') body = { page, image: canvasToDataUrl(canvas) };
      else body = { page, text: text || await ocrRollPage(canvas) };
      const r = await api(`/imports/${impId}/pages`, { method: 'POST', body });
      setPage(page, { state: r.pageType === 'voter_list' ? 'done' : 'skipped', found: r.found, how: text ? 'text layer' : engine === 'claude' ? 'Claude' : 'OCR' });
    } catch (e) {
      setPage(page, { state: 'error', error: e.message });
    }
  }

  async function start(files) {
    if (!files?.length) return;
    if (!booth) return toast('Choose a booth first.');
    setBusy(true); setError(null); setRows([]); cancelRef.current = false;
    try {
      const { import: created } = await api('/imports', { method: 'POST', body: { assemblyId: user.assemblyId, boothNo: Number(booth), filename: [...files].map((f) => f.name).join(', '), engine } });
      setImp(created);
      setPages([]);
      let n = 0;
      for (const file of files) {
        if (cancelRef.current) break;
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          for await (const p of pdfPages(file)) {
            if (cancelRef.current) break;
            n += 1;
            const pageNo = n;
            setPages((ps) => [...ps, { page: pageNo, state: 'queued', thumb: p.canvas.toDataURL('image/jpeg', 0.4) }]);
            await processPage(created.id, pageNo, p.canvas, p.text);
          }
        } else if (file.type.startsWith('image/')) {
          n += 1;
          const pageNo = n;
          const canvas = await imageToCanvas(file);
          setPages((ps) => [...ps, { page: pageNo, state: 'queued', thumb: canvas.toDataURL('image/jpeg', 0.4) }]);
          await processPage(created.id, pageNo, canvas, null);
        }
      }
      const { import: full } = await api(`/imports/${created.id}`);
      setImp(full);
      setRows(full.rows);
      setOcrMsg('');
      if (!full.rows.length) toast('No voter boxes were found. Check the file is an electoral roll.');
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const edit = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const issues = (r) => [!r.epicValid && 'EPIC', !(r.name || r.nameTamil) && 'name', !r.age && 'age', !r.gender && 'gender'].filter(Boolean);
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => filter === 'all' || (filter === 'issues' ? issues(r).length : !r.include));
  const included = rows.filter((r) => r.include).length;
  const withIssues = rows.filter((r) => issues(r).length).length;

  async function commit() {
    setBusy(true);
    try {
      await api(`/imports/${imp.id}/rows`, { method: 'PUT', body: { rows } });
      const r = await api(`/imports/${imp.id}/commit`, { method: 'POST' });
      toast(`Saved: ${r.inserted} new, ${r.updated} updated voters in booth ${imp.booth_no}`);
      setImp(null); setRows([]); setPages([]);
      api('/imports').then((h) => setHistory(h.imports)).catch(() => {});
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function discard() {
    if (!confirm('Discard this import? Nothing will be saved.')) return;
    await api(`/imports/${imp.id}`, { method: 'DELETE' }).catch(() => {});
    setImp(null); setRows([]); setPages([]);
  }

  if (error && !imp) return <ErrorBox error={error} />;

  return (
    <>
      <div className="topbar">
        <div><h1>Import electoral roll</h1><div className="muted small">Load the official roll for a booth from PDF or photos. You check every row before it is saved.</div></div>
      </div>

      {!imp && (
        <div className="grid stack-sm" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, .8fr)', alignItems: 'start' }}>
          <section className="card pad stack">
            <div className="grid g2">
              <label className="field"><span className="lbl" style={{ fontWeight: 600 }}>Booth (part number)</span>
                <select className="select" value={booth} onChange={(e) => setBooth(e.target.value)}>
                  {user.booths.map((b) => <option key={b} value={b}>Booth {b}</option>)}
                </select>
              </label>
              {status?.claude ? (
                <div className="field"><span className="lbl" style={{ fontWeight: 600 }}>Reading method</span>
                  <div className="seg" role="group" aria-label="Reading method">
                    <button type="button" aria-pressed={engine === 'claude'} onClick={() => setEngine('claude')}>AI</button>
                    <button type="button" aria-pressed={engine === 'ocr'} onClick={() => setEngine('ocr')}>On this device</button>
                  </div>
                </div>
              ) : <span />}
            </div>
            <div className="small muted">
              {engine === 'claude'
                ? 'Each page image is read by AI, which copes best with faded scans and unusual layouts.'
                : 'Pages are read on this device, in Tamil and English. Nothing is uploaded until you save. Digital PDFs are read exactly; for scans and photos, check names in the review table (about 20–30 seconds per page).'}
            </div>
            <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); start(e.dataTransfer.files); }}>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple onChange={(e) => start(e.target.files)} disabled={busy} />
              <Icon name="download" size={28} />
              <b>Drop the roll PDF or page photos here</b>
              <span className="small muted">or tap to choose · PDF, JPG, PNG · one booth per import</span>
            </label>
          </section>
          <section className="card pad">
            <div className="panel-title"><h2>Where do I get the roll?</h2></div>
            <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 8 }}>
              <li>Candidates and recognised parties receive certified roll copies from the Electoral Registration Officer (ERO) of the constituency.</li>
              <li>The Chief Electoral Officer, Tamil Nadu publishes the final roll as one PDF per part (booth). Download the parts you need yourself.</li>
              <li>Photograph pages flat, in good light, one page per photo.</li>
            </ul>
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>Use roll data only for your campaign, under the DPDP Act 2023 and ECI rules. Every import is recorded in the audit log.</p>
          </section>
        </div>
      )}

      {imp && (
        <section className="card pad" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <h2>Booth {imp.booth_no} · {imp.filename}</h2>
            <span className="small muted">{engine === 'claude' ? 'AI reading' : 'Offline OCR'}{busy && ocrMsg ? ` · ${ocrMsg}` : ''}</span>
          </div>
          <div className="pages">
            {pages.map((p) => (
              <div key={p.page} className={`pg pg-${p.state}`} title={p.error || ''}>
                {p.thumb && <img src={p.thumb} alt={`Page ${p.page}`} />}
                <span>p{p.page} · {p.state === 'done' ? `${p.found} voters` : p.state === 'skipped' ? 'cover/summary' : p.state === 'error' ? 'failed' : p.state === 'reading' ? 'reading…' : 'queued'}</span>
              </div>
            ))}
          </div>
          {busy && <button className="btn btn-sm btn-ghost" style={{ marginTop: 10 }} onClick={() => { cancelRef.current = true; }}>Stop after this page</button>}
          {pages.some((p) => p.state === 'error') && <div className="alert alert-bad small" style={{ marginTop: 10 }}>{pages.filter((p) => p.state === 'error').map((p) => `Page ${p.page}: ${p.error}`).join(' · ')}</div>}
          {imp.header && Object.values(imp.header).some(Boolean) && (
            <dl className="review" style={{ marginTop: 14 }}>
              {imp.header.assemblyName && <><dt>Constituency</dt><dd>{imp.header.assemblyNo} {imp.header.assemblyName}</dd></>}
              {imp.header.partNo && <><dt>Part no.</dt><dd>{imp.header.partNo}{String(imp.header.partNo) !== String(imp.booth_no) && <span className="tag tag-warn" style={{ marginLeft: 8 }}>does not match booth {imp.booth_no}</span>}</dd></>}
              {imp.header.pollingStation && <><dt>Polling station</dt><dd>{imp.header.pollingStation}</dd></>}
            </dl>
          )}
        </section>
      )}

      {imp && !busy && rows.length > 0 && (
        <section className="card pad">
          <div className="panel-title">
            <h2>Review {num(rows.length)} voters</h2>
            <div className="seg" role="group" aria-label="Filter rows">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
              <button type="button" aria-pressed={filter === 'issues'} onClick={() => setFilter('issues')}>Needs check ({withIssues})</button>
              <button type="button" aria-pressed={filter === 'excluded'} onClick={() => setFilter('excluded')}>Excluded ({rows.length - included})</button>
            </div>
          </div>
          <p className="small muted">Fields highlighted in amber could not be read with confidence. Click any cell to correct it. Untick rows you don’t want to save (for example, deleted entries).</p>
          <div className="table-wrap" style={{ maxHeight: 520, overflow: 'auto' }}>
            <table className="tbl review-tbl">
              <thead><tr><th>Save</th><th>Pg</th><th>Sl.</th><th>EPIC</th><th>Name</th><th>Tamil</th><th>Relation</th><th>Relative</th><th>House</th><th>Age</th><th>Gender</th></tr></thead>
              <tbody>
                {shown.map(({ r, i }) => {
                  const bad = issues(r);
                  const cls = (k) => (bad.includes(k) ? 'cell-warn' : '');
                  return (
                    <tr key={i} className={r.include ? '' : 'row-off'}>
                      <td><input type="checkbox" checked={r.include} onChange={(e) => edit(i, 'include', e.target.checked)} aria-label={`Save row ${i + 1}`} /></td>
                      <td className="muted">{r.page}</td>
                      <td><input className="cell" style={{ width: 54 }} inputMode="numeric" value={r.serial || ''} onChange={(e) => edit(i, 'serial', Number(e.target.value.replace(/\D/g, '')))} /></td>
                      <td><input className={`cell mono ${cls('EPIC')}`} style={{ width: 120 }} value={r.epic} onChange={(e) => { const v = e.target.value.toUpperCase(); edit(i, 'epic', v); edit(i, 'epicValid', /^[A-Z]{3}\d{7}$/.test(v)); }} /></td>
                      <td><input className={`cell ${cls('name')}`} value={r.name} onChange={(e) => edit(i, 'name', e.target.value)} /></td>
                      <td><input className="cell" lang="ta" value={r.nameTamil} onChange={(e) => edit(i, 'nameTamil', e.target.value)} /></td>
                      <td><select className="cell" value={r.relationType} onChange={(e) => edit(i, 'relationType', e.target.value)}><option value="">–</option><option>Father</option><option>Husband</option><option>Mother</option><option>Other</option></select></td>
                      <td><input className="cell" value={r.relationName} onChange={(e) => edit(i, 'relationName', e.target.value)} /></td>
                      <td><input className="cell" style={{ width: 70 }} value={r.houseNo} onChange={(e) => edit(i, 'houseNo', e.target.value)} /></td>
                      <td><input className={`cell ${cls('age')}`} style={{ width: 52 }} inputMode="numeric" value={r.age || ''} onChange={(e) => edit(i, 'age', Number(e.target.value.replace(/\D/g, '')))} /></td>
                      <td><select className={`cell ${cls('gender')}`} value={r.gender} onChange={(e) => edit(i, 'gender', e.target.value)}>{Object.entries(GENDER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={discard}>Discard import</button>
            <div className="row">
              <span className="small muted">{included} of {rows.length} will be saved to booth {imp.booth_no}</span>
              <button className="btn btn-primary" onClick={commit} disabled={busy || !included || user.isDemo} title={user.isDemo ? 'Not available in the demo' : ''}>Save {included} voters</button>
            </div>
          </div>
          {user.isDemo && <p className="small muted" style={{ marginTop: 8 }}>The demo can read files but not save them. <Link to="/register">Create your account</Link> to load real rolls.</p>}
        </section>
      )}

      {!imp && history.length > 0 && (
        <section className="card pad" style={{ marginTop: 16 }}>
          <div className="panel-title"><h2>Past imports</h2></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Booth</th><th>File</th><th>Method</th><th className="num">Rows</th><th>Status</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td className="small">{h.created_at.slice(0, 16)}</td><td>{h.booth_no}</td><td className="small" style={{ maxWidth: 260 }}>{h.filename}</td><td>{h.engine === 'claude' ? 'AI' : 'OCR'}</td><td className="num">{h.committed_rows ?? h.rowCount}</td><td><span className={`tag ${h.status === 'committed' ? 'tag-ok' : h.status === 'draft' ? 'tag-warn' : ''}`}>{h.status}</span></td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
