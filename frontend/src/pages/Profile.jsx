import { useAuth } from '../state/AuthContext';

export default function Profile() {
  const { user } = useAuth();
  return (
    <div className="card">
      <div className="card-head"><h2>My Profile</h2></div>
      <div className="card-body">
        <dl className="kv">
          <dt>Name</dt><dd>{user?.name}</dd>
          <dt>Username</dt><dd>{user?.username}</dd>
          <dt>Email</dt><dd>{user?.email || '—'}</dd>
          <dt>Role</dt><dd>{user?.role_name || user?.role}</dd>
          <dt>Permissions</dt><dd>{(user?.permissions || []).length} granted</dd>
        </dl>
      </div>
    </div>
  );
}
