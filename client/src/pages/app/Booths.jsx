import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, num } from '../../api.js';
import { useAsync, ErrorBox, Skeleton, StackBar, SENT, Legend } from '../../components/ui.jsx';

export const strengthColor = (s) => (s == null ? 'var(--s-neutral)' : s >= 60 ? 'var(--s-supporter)' : s >= 40 ? 'var(--s-leaning)' : 'var(--s-opposed)');
const hex = (s) => (s == null ? '#9a9486' : s >= 60 ? '#0f766e' : s >= 40 ? '#5fb3a5' : '#d4573b');

export default function Booths() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api('/me/booths'), []);
  const [sort, setSort] = useState('no');

  const rows = useMemo(() => {
    if (!data) return [];
    const r = [...data.booths];
    const by = { no: (a, b) => a.no - b.no, voters: (a, b) => b.voters - a.voters, strength: (a, b) => (a.strength ?? 101) - (b.strength ?? 101), coverage: (a, b) => a.coverage - b.coverage };
    return r.sort(by[sort]);
  }, [data, sort]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton h={440} />;

  return (
    <>
      <div className="topbar">
        <div><h1>Booths</h1><div className="muted small">{data.booths.length} booths · {data.center?.name}</div></div>
        <Legend items={[{ label: 'Strong (60%+)', color: 'var(--s-supporter)' }, { label: 'Swing (40–59%)', color: 'var(--s-leaning)' }, { label: 'Weak (<40%)', color: 'var(--s-opposed)' }, { label: 'Not enough tags yet', color: 'var(--s-neutral)' }]} />
      </div>
      <div className="map card" style={{ padding: 0 }}>
        <MapContainer bounds={data.booths.length ? data.booths.map((b) => [b.lat, b.lng]) : [[data.center.lat, data.center.lng]]} boundsOptions={{ padding: [30, 30], maxZoom: 15 }} style={{ height: '100%' }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {data.booths.map((b) => (
            <CircleMarker key={b.no} center={[b.lat, b.lng]} radius={6 + Math.sqrt(b.voters) / 6} pathOptions={{ color: '#fff', weight: 2, fillColor: hex(b.strength), fillOpacity: 0.9 }}
              eventHandlers={{ click: () => nav(`/app/voters?booth=${b.no}`) }}>
              <Tooltip><b>Booth #{b.no}</b><br />{b.name}<br />{num(b.voters)} voters · {b.strength == null ? `${b.coverage}% tagged` : `${b.strength}% support`}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="panel-title">
          <h2>Booth table</h2>
          <label className="row small">Sort by
            <select className="select" style={{ minHeight: 36, width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="no">Booth number</option><option value="voters">Most voters</option><option value="strength">Weakest first</option><option value="coverage">Least tagged</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Polling station</th><th className="num">Voters</th><th className="num">Women</th><th className="num">Under 30</th><th style={{ minWidth: 160 }}>Sentiment</th><th className="num">Strength</th><th /></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.no}>
                  <td><b>{b.no}</b></td>
                  <td style={{ maxWidth: 320 }}>{b.name}</td>
                  <td className="num">{num(b.voters)}</td>
                  <td className="num">{Math.round((b.female / b.voters) * 100)}%</td>
                  <td className="num">{num(b.young)}</td>
                  <td>
                    <StackBar total={b.voters} parts={SENT.map((s) => ({ label: s.label, value: b.sentiment[s.key], color: s.color }))} />
                    <span className="small muted">{b.coverage}% tagged</span>
                  </td>
                  <td className="num"><span className="tag" style={{ color: '#fff', background: strengthColor(b.strength) }}>{b.strength == null ? '—' : `${b.strength}%`}</span></td>
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    <Link className="btn btn-sm btn-ghost" to={`/app/voters?booth=${b.no}`}>Voters</Link>
                    <Link className="btn btn-sm btn-quiet" to={`/app/booths/${b.no}`}>Report</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
