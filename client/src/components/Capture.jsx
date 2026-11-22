import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, Icon, SENT, useToast } from './ui.jsx';
import { imageToCanvas, canvasToDataUrl, ocrCanvas, onOcrProgress } from '../lib/ocr.js';

const EMPTY = { epic: '', name: '', nameTamil: '', relationType: '', relationName: '', age: '', gender: '', houseNo: '', mobile: '', consentMobile: false, sentiment: '', note: '' };
const DOCS = { epic_card: 'EPIC card', voter_slip: 'Voter slip', paper_form: 'Paper form', other: 'Photo' };

/** Photo → details → confirm → save. Works for a signed-in candidate or a booth agent link. */
export default function Capture({ booths, claude, agentToken, isDemo }) {
  const toast = useToast();
  const headers = agentToken ? { 'x-agent-token': agentToken } : undefined;
  const [booth, setBooth] = useState(booths[0] || '');
  const [f, setF] = useState(EMPTY);
  const [photo, setPhoto] = useState(null);
  const [reading, setReading] = useState('');
  const [meta, setMeta] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const camRef = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const loadRecent = () => api('/capture/recent', { headers }).then((r) => setRecent(r.voters)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRecent(); onOcrProgress((m) => m.status === 'recognizing text' && setReading(`Reading… ${Math.round(m.progress * 100)}%`)); return () => onOcrProgress(null); }, []);

  async function onPhoto(file) {
    if (!file) return;
    setErrors({});
    setReading('Preparing photo…');
    try {
      const canvas = await imageToCanvas(file, 2000);
      setPhoto(canvas.toDataURL('image/jpeg', 0.6));
      const body = claude ? { image: canvasToDataUrl(canvas, 1600) } : { text: await (setReading('Loading offline OCR…'), ocrCanvas(canvas)) };
      setReading(claude ? 'Reading with AI…' : 'Matching fields…');
      const { result } = await api('/capture/extract', { method: 'POST', body, headers });
      setMeta(result);
      setF((s) => ({
        ...s,
        epic: result.epic || s.epic, name: result.name || s.name, nameTamil: result.nameTamil || s.nameTamil,
        relationType: result.relationType || s.relationType, relationName: result.relationName || s.relationName,
        age: result.age || s.age, gender: result.gender || s.gender, houseNo: result.houseNo || s.houseNo, mobile: result.mobile || s.mobile,
      }));
      if (result.partNo && booths.includes(Number(result.partNo))) setBooth(Number(result.partNo));
      toast(result.confidence === 'low' ? 'Some details were unclear. Please check every field.' : 'Details filled in. Please check before saving.');
    } catch (e) {
      toast(e.message);
    } finally { setReading(''); }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const r = await api('/capture/voters', { method: 'POST', headers, body: { ...f, boothNo: Number(booth), age: Number(f.age) || 0 } });
      toast(r.demo ? 'Demo mode: nothing was saved.' : r.matched ? 'Matched an existing voter on the roll and updated their details.' : 'New voter saved.');
      setF(EMPTY); setPhoto(null); setMeta(null);
      loadRecent();
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="grid stack-sm" style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, .85fr)', alignItems: 'start' }}>
      <form className="card pad stack" onSubmit={save} noValidate>
        <div className="capture-shot">
          {photo ? <img src={photo} alt="Captured document" /> : (
            <div className="capture-empty">
              <Icon name="camera" size={30} />
              <b>Photograph an EPIC card, voter slip or paper form</b>
              <span className="small muted">Hold it flat, fill the frame, avoid glare. The photo is read and then discarded. It is not stored.</span>
            </div>
          )}
          {reading && <div className="capture-reading" role="status">{reading}</div>}
        </div>
        <div className="row">
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn btn-primary" onClick={() => camRef.current?.click()} disabled={!!reading}>{photo ? 'Retake photo' : 'Take photo'}</button>
          {meta && <span className={`tag ${meta.confidence === 'high' ? 'tag-ok' : meta.confidence === 'medium' ? 'tag-brand' : 'tag-warn'}`}>{DOCS[meta.documentType] || 'Photo'} · {meta.confidence} confidence</span>}
          <span className="small muted">Or type the details below</span>
        </div>

        <div className="grid g2">
          <Field label="Booth" error={errors.boothNo}>
            <select className="select" value={booth} onChange={(e) => setBooth(e.target.value)}>{booths.map((b) => <option key={b} value={b}>Booth {b}</option>)}</select>
          </Field>
          <Field label="EPIC number" error={errors.epic} hint="3 letters + 7 digits">
            <input className="input mono" value={f.epic} maxLength={12} onChange={(e) => set('epic', e.target.value.toUpperCase().replace(/\s/g, ''))} />
          </Field>
        </div>
        <div className="grid g2">
          <Field label="Name (English)" error={errors.name}><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Name (Tamil)"><input className="input" lang="ta" value={f.nameTamil} onChange={(e) => set('nameTamil', e.target.value)} /></Field>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)' }}>
          <Field label="Relation">
            <select className="select" value={f.relationType} onChange={(e) => set('relationType', e.target.value)}><option value="">–</option><option>Father</option><option>Husband</option><option>Mother</option><option>Other</option></select>
          </Field>
          <Field label="Relative’s name"><input className="input" value={f.relationName} onChange={(e) => set('relationName', e.target.value)} /></Field>
        </div>
        <div className="grid g3k" style={{ gap: 10 }}>
          <Field label="Age"><input className="input" inputMode="numeric" maxLength={3} value={f.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Gender">
            <select className="select" value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">–</option><option value="F">Female</option><option value="M">Male</option><option value="T">Third gender</option></select>
          </Field>
          <Field label="House no."><input className="input" value={f.houseNo} onChange={(e) => set('houseNo', e.target.value)} /></Field>
        </div>
        <Field label="Mobile (optional)" error={errors.mobile}>
          <div className="input-group"><span className="prefix">+91</span><input className="input" inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} /></div>
        </Field>
        {f.mobile && (
          <label className="check small"><input type="checkbox" checked={f.consentMobile} onChange={(e) => set('consentMobile', e.target.checked)} />The voter agreed to share this number for campaign updates.</label>
        )}
        {errors.consentMobile && <span className="err">{errors.consentMobile}</span>}
        <div className="field"><span className="lbl" style={{ fontWeight: 600 }}>How did the conversation go?</span>
          <div className="sent">
            {SENT.map((s) => <button key={s.key} type="button" aria-pressed={f.sentiment === s.key} onClick={() => set('sentiment', f.sentiment === s.key ? '' : s.key)}><i className="dot" style={{ background: s.color }} />{s.label}</button>)}
          </div>
        </div>
        <Field label="Note"><input className="input" value={f.note} maxLength={500} placeholder="e.g. Needs ration card help; prefers evening visits" onChange={(e) => set('note', e.target.value)} /></Field>
        <button className="btn btn-primary btn-block" disabled={saving || !!reading}>{saving ? 'Saving…' : 'Save voter'}</button>
        {isDemo && <p className="small muted" style={{ margin: 0 }}>Demo mode: you can try reading photos but nothing is saved.</p>}
      </form>

      <section className="card pad">
        <div className="panel-title"><h2>Recently captured</h2><span className="small muted">{recent.length}</span></div>
        {recent.length === 0 && <p className="small muted">Nothing yet. Saved voters appear here and in the Voters list straight away.</p>}
        {recent.map((v) => (
          <div key={v.id} className="row between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <div><b>{v.name}</b>{v.nameTamil && v.nameTamil !== v.name && <span lang="ta" className="small muted"> · {v.nameTamil}</span>}
              <div className="small muted">Booth {v.boothNo}{v.epic && ` · ${v.epic}`}{v.age ? ` · ${v.age}` : ''}</div></div>
            {v.mobile && <span className="tag tag-brand">has mobile</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
