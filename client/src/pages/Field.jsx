import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, LangToggle } from '../components/ui.jsx';
import Capture from '../components/Capture.jsx';

/** Booth-agent page opened from a WhatsApp link. No account needed; the link is the credential. */
export default function Field() {
  const { token } = useParams();
  const { data, error, loading } = useAsync(() => api('/agent/me', { headers: { 'x-agent-token': token } }), [token]);
  return (
    <div style={{ minHeight: '100svh' }}>
      <header className="site-head"><div className="container">
        <span className="logo"><img src="/favicon.svg" width="30" height="30" alt="" /><span>Sethu<small>Booth agent</small></span></span>
        <nav className="site-nav"><LangToggle /></nav>
      </div></header>
      <main className="container" style={{ padding: '20px var(--gutter) 60px' }}>
        {loading && <div className="skeleton" style={{ height: 200 }} />}
        {error && (
          <div className="card pad" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
            <h1 style={{ fontSize: 22 }}>This link has stopped working</h1>
            <p className="muted">{error.message}</p>
          </div>
        )}
        {data && (
          <>
            <div className="topbar">
              <div><h1>Vanakkam, {data.volunteer?.name?.split(' ')[0] || 'friend'}</h1>
                <div className="muted small">Collecting for {data.candidate} · {data.assembly} · Booths {data.booths.join(', ')}</div></div>
            </div>
            <Capture booths={data.booths} claude={data.claude} agentToken={token} isDemo={data.isDemo} />
          </>
        )}
      </main>
    </div>
  );
}
