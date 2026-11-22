import { Link, useParams } from 'react-router-dom';
import { api, num } from '../../api.js';
import { useAsync, ErrorBox, Skeleton, Kpi, Icon } from '../../components/ui.jsx';

export default function BoothReport() {
  const { no } = useParams();
  const { data, error, loading, reload } = useAsync(() => api(`/me/booths/${no}/report`), [no]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton h={300} />;
  const max = Math.max(...Object.values(data.ages));
  return (
    <>
      <div className="topbar">
        <div>
          <Link to="/app/booths" className="small no-print">← All booths</Link>
          <h1>Booth #{data.booth.no} report</h1>
          <div className="muted small">{data.booth.name} · {data.assembly.name}, {data.assembly.district}</div>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}><Icon name="print" size={18} />Print</button>
      </div>
      <div className="grid g4">
        <Kpi label="Voters" value={num(data.voters)} />
        <Kpi label="Households" value={num(data.families)} detail={`${(data.voters / data.families).toFixed(1)} voters per house`} />
        <Kpi label="Women" value={num(data.gender.F)} detail={`${Math.round((data.gender.F / data.voters) * 100)}%`} />
        <Kpi label="Men" value={num(data.gender.M)} detail={data.gender.T ? `+ ${data.gender.T} third gender` : undefined} />
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <section className="card pad">
          <div className="panel-title"><h2>Age bands</h2></div>
          <div className="bars">
            {Object.entries(data.ages).map(([band, n]) => (
              <div key={band} className="bar-row"><span className="muted">{band}</span><div className="bar-track"><span style={{ width: `${(n / max) * 100}%`, background: 'var(--brand)' }} /></div><span className="num">{num(n)}</span></div>
            ))}
          </div>
        </section>
        <section className="card pad">
          <div className="panel-title"><h2>Sections (streets)</h2></div>
          <table className="tbl"><tbody>{Object.entries(data.sections).map(([s, n]) => <tr key={s}><td>Section {s}</td><td className="num">{num(n)} voters</td></tr>)}</tbody></table>
          <p className="small muted" style={{ marginTop: 12 }}>Sample data. Generated {new Date().toLocaleDateString('en-IN')} by Sethu.</p>
        </section>
      </div>
    </>
  );
}
