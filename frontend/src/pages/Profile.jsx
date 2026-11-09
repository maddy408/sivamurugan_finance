import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';

export default function Profile() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  return (
    <div className="card">
      <div className="card-head"><h2>{t('My Profile', 'My Profile')}</h2></div>
      <div className="card-body">
        <dl className="kv">
          <dt>{t('Name', 'Name')}</dt><dd>{user?.name}</dd>
          <dt>{t('Username', 'Username')}</dt><dd>{user?.username}</dd>
          <dt>{t('Email', 'Email')}</dt><dd>{user?.email || '—'}</dd>
          <dt>{t('Role', 'Role')}</dt><dd>{t(user?.role_name || user?.role, user?.role_name || user?.role)}</dd>
          <dt>{t('Permissions', 'Permissions')}</dt><dd>{(user?.permissions || []).length} {lang === 'ta' ? 'வழங்கப்பட்டது' : 'granted'}</dd>
        </dl>
      </div>
    </div>
  );
}