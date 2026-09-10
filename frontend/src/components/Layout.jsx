import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { API_BASE } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';

const NAV = [
  { to: '/', key: 'nav.dashboard', defaultLabel: 'Dashboard', end: true, perm: 'dashboard.view' },
  { to: '/collection', key: 'nav.collection', defaultLabel: 'Collection', perm: 'collection.view' },
  { to: '/pending', key: 'nav.pending', defaultLabel: 'Pending Dues', perm: 'pending.view' },
  { to: '/customers', key: 'nav.customers', defaultLabel: 'Customers', perm: 'customers.view' },
  { to: '/loans', key: 'nav.chits', defaultLabel: 'Chits / Loans', perm: 'loans.view' },
  { to: '/finance', key: 'nav.finance', defaultLabel: 'Expenses & Income', perm: 'expenses.view' },
  { to: '/reports', key: 'nav.reports', defaultLabel: 'Reports', perm: 'reports.view' },
  { to: '/settings', key: 'nav.settings', defaultLabel: 'Settings', perm: 'settings.view' },
];

export default function Layout() {
  const { user, logout, can, isAdmin, meta } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  const items = NAV.filter((n) => (!n.adminOnly || isAdmin) && can(n.perm));
  const orgLogo = meta?.organization?.logo_path;
  const closeDrawer = () => setMobileOpen(false);
  const doLogout = async () => { closeDrawer(); await logout(); nav('/login'); };

  // Close the drawer on route change; lock body scroll while it's open.
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.body.classList.toggle('drawer-open', mobileOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [mobileOpen]);

  return (
    <div className="app">
      <header className="top-navbar">
        <div className="top-navbar-container">
          <Link to="/" className="brand-container" onClick={closeDrawer}>
            {orgLogo && !logoBroken ? (
              <div className="brand-logo-pill" style={{ padding: 0, background: '#fff', overflow: 'hidden' }}>
                <img src={API_BASE + orgLogo} alt="logo"
                  onError={() => setLogoBroken(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div className="brand-logo-pill">SM</div>
            )}
            <div className="brand-text-wrap">
              <span className="brand-title">{t('app.title', 'Siva Murugan Chit Fund')}</span>
              <span className="brand-subtitle">Chit Fund Management</span>
            </div>
          </Link>

          <nav className="top-nav">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {t(n.key, n.defaultLabel)}
              </NavLink>
            ))}
          </nav>

          <div className="user-tools">
            <button className="btn sm secondary" onClick={doLogout} title={t('nav.logout', 'Logout')}>
              {t('nav.logout', 'Logout')}
            </button>
            <button className="mobile-nav-btn" onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation" aria-expanded={mobileOpen}>
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-over drawer (scrim + panel). Tapping anywhere closes it.
          Rendered OUTSIDE <header> so its position:fixed resolves against the
          viewport — the header's backdrop-filter would otherwise become the
          containing block and clamp the drawer to the header's height. */}
      <div className={`mobile-drawer ${mobileOpen ? 'open' : ''}`} onClick={closeDrawer} role="dialog" aria-modal="true">
        <div className="drawer-user">
          <div className="drawer-avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
          <div>
            <div className="drawer-name">{user?.name}</div>
            <div className="drawer-role">{user?.role}</div>
          </div>
        </div>
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => (isActive ? 'active' : '')}>
            {t(n.key, n.defaultLabel)}
          </NavLink>
        ))}
        <NavLink to="/profile">👤 {t('nav.profile', 'Profile')}</NavLink>
        <button className="drawer-logout" onClick={doLogout}>⎋ {t('nav.logout', 'Logout')}</button>
      </div>

      <main className="main-layout">
        <Outlet />
      </main>
    </div>
  );
}
