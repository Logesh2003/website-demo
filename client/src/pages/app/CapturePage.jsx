import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync } from '../../components/ui.jsx';
import Capture from '../../components/Capture.jsx';

export default function CapturePage() {
  const { user } = useOutletContext();
  const { data } = useAsync(() => api('/extract/status'), []);
  return (
    <>
      <div className="topbar"><div><h1>Field capture</h1><div className="muted small">Add voters you meet door to door. Booth agents can do this from their own phone using a link from the Team page.</div></div></div>
      {data && <Capture booths={user.booths} claude={data.claude} isDemo={user.isDemo} />}
    </>
  );
}
