import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { Logo, LangToggle, Icon } from '../../components/ui.jsx';
import { api, session } from '../../api.js';

const NAV = [
  { to: '/app', end: true, icon: 'home', label: 'Overview' },
  { to: '/app/booths', icon: 'map', label: 'Booths' },
  { to: '/app/voters', icon: 'users', label: 'Voters' },
  { to: '/app/capture', icon: 'camera', label: 'Capture', mobile: true },
  { to: '/app/import', icon: 'upload', label: 'Import roll', desktop: true },
  { to: '/app/outreach', icon: 'send', label: 'Outreach', desktop: true },
  { to: '/app/team', icon: 'board', label: 'Team' },
  { to: '/app/billing', icon: 'wallet', label: 'Plan' },
];

export default function Layout() {
  const nav = useNavigate();
  const [user, setUser] = useState(session.get()?.user || null);
  const refresh = useCallback(() => api('/me').then((r) => { setUser(r.user); session.set({ ...session.get(), user: r.user }); }).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = () => { session.clear(); nav('/'); };
  const items = user?.isAdmin ? [{ to: '/app/admin', icon: 'admin', label: 'Admin' }] : NAV;

  useEffect(() => { if (user?.isAdmin && !window.location.pathname.startsWith('/app/admin')) nav('/app/admin', { replace: true }); }, [user, nav]);

  return (
    <div className="shell">
      <a href="#app-main" className="skip">Skip to content</a>
      <aside className="side">
        <Logo to="/app" />
        <nav aria-label="Workspace">
          {items.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>)}
        </nav>
        <div className="foot">
          {user && !user.isAdmin && (
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="small" style={{ fontWeight: 700 }}>{user.isDemo ? 'demo-candidate' : user.fullName}</div>
              <div className="small muted">{user.assemblyName} · {user.booths.length} booths</div>
              <div style={{ marginTop: 8 }}><PlanTag status={user.status} /></div>
            </div>
          )}
          <LangToggle />
          <button className="btn btn-ghost btn-sm" onClick={logout}><Icon name="logout" size={16} />Sign out</button>
        </div>
      </aside>
      <main className="main" id="app-main">
        {user?.isDemo && (
          <div className="banner no-print">
            <span><b>Demo workspace.</b> Synthetic voters for Mylapore. Changes you make are visible to other demo visitors.</span>
            <Link className="btn btn-sm btn-primary" to="/register">Create your own</Link>
          </div>
        )}
        {user && !user.isAdmin && user.status !== 'active' && (
          <div className="banner no-print">
            <span>{user.status === 'pending_review'
              ? <><b>Payment under review.</b> We are matching your UTR — usually within the hour.</>
              : <><b>Free preview.</b> Booth statistics are live. Unlock voter names, search, tagging and outreach.</>}</span>
            {user.status !== 'pending_review' && <Link className="btn btn-sm btn-accent" to="/app/billing">Unlock full plan</Link>}
          </div>
        )}
        {user ? <Outlet context={{ user, refresh }} /> : <div className="skeleton" style={{ height: 200 }} />}
      </main>
      <nav className="mob-nav" aria-label="Workspace">
        {items.filter((n) => !n.desktop).map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>)}
      </nav>
    </div>
  );
}

export function PlanTag({ status }) {
  if (status === 'active') return <span className="tag tag-ok">● Active plan</span>;
  if (status === 'pending_review') return <span className="tag tag-warn">● Payment in review</span>;
  return <span className="tag">● Free preview</span>;
}
