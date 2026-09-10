import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Spinner, ErrorState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export default function EmployeePermissions() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('permissions.edit');

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loans, setLoans] = useState([]);
  const [locSel, setLocSel] = useState([]);
  const [loanSel, setLoanSel] = useState([]);
  const [overrides, setOverrides] = useState({});   // code -> 'allow'|'deny'|undefined
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null); setData(null);
    Promise.all([
      api.get(`/api/employees/${id}/permissions`),
      api.get('/api/locations', { params: { per_page: 200 } }),
      api.get('/api/loans', { params: { per_page: 200 } }),
    ]).then(([p, l, ln]) => {
      setData(p.data);
      setLocations(l.data);
      setLoans(ln.data);
      setLocSel(p.data.assigned_locations.map((x) => x.id));
      setLoanSel(p.data.assigned_loans.map((x) => x.loan_id));
      const ov = {};
      p.data.permissions.forEach((x) => { if (x.override) ov[x.code] = x.override; });
      setOverrides(ov);
    }).catch(setError);
  };
  useEffect(load, [id]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const cycle = (code, roleDefault) => {
    setOverrides((o) => {
      const cur = o[code];
      const next = { ...o };
      // cycle: default -> allow -> deny -> default
      if (!cur) next[code] = roleDefault ? 'deny' : 'allow';
      else if (cur === 'allow') next[code] = 'deny';
      else if (cur === 'deny') delete next[code];
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/employees/${id}/permissions`, {
        overrides: Object.entries(overrides).map(([code, effect]) => ({ code, effect })),
        location_ids: locSel,
        loan_ids: loanSel,
      });
      toast.success('Saved. The employee must sign in again.');
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const byModule = data.permissions.reduce((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  const effState = (p) => {
    const ov = overrides[p.code];
    if (ov === 'allow') return 'ALLOW (override)';
    if (ov === 'deny') return 'DENY (override)';
    return p.role_default ? 'allow (role default)' : 'not granted';
  };

  return (
    <>
      <div className="toolbar">
        <Link to="/employees" className="btn sm secondary">← Employees</Link>
        <h1 style={{ margin: 0, fontSize: 18 }}>Employee access &amp; permissions</h1>
        <div style={{ flex: 1 }} />
        {editable && <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Assigned locations</h2></div>
          <div className="card-body">
            <select multiple value={locSel.map(String)} disabled={!editable} style={{ width: '100%', minHeight: 150 }}
              onChange={(e) => setLocSel(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Directly assigned loans / chits</h2></div>
          <div className="card-body">
            <select multiple value={loanSel.map(String)} disabled={!editable} style={{ width: '100%', minHeight: 150 }}
              onChange={(e) => setLoanSel(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
              {loans.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.customer_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Module &amp; action permissions</h2>
          <span className="muted">click a row to cycle default → allow → deny</span>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Module</th><th>Action</th><th>Effective</th></tr></thead>
            <tbody>
              {Object.entries(byModule).map(([mod, perms]) =>
                perms.map((p, idx) => (
                  <tr key={p.code} style={{ cursor: editable ? 'pointer' : 'default' }}
                    onClick={() => editable && cycle(p.code, p.role_default)}>
                    <td>{idx === 0 ? mod : ''}</td>
                    <td>{p.action}</td>
                    <td>{effState(p)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
