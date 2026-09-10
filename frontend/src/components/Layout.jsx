import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
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
  { to: '/locations', key: 'nav.locations', defaultLabel: 'Locations', perm: 'locations.view', adminOnly: true },
  { to: '/settings', key: 'nav.settings', defaultLabel: 'Settings', perm: 'settings.view' },
];

export default function Layout() {
  const { user, logout, can, isAdmin, meta } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const nav = useNavigate();

  const items = NAV.filter((n) => (!n.adminOnly || isAdmin) && can(n.perm));
  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const orgLogo = meta?.organization?.logo_path;   // e.g. "/api/settings/organization/logo?v=123"

  return (
    <div className="app">
      {/* ---------- Single-Row Top Header Navbar ---------- */}
      <header className="top-navbar">
        <div className="top-navbar-container">
          {/* Brand Logo & Title */}
          <Link to="/" className="brand-container">
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

          {/* Desktop Horizontal Navigation Links (Single Row) */}
          <nav className="top-nav">
            {items.map((n) => (
              <NavLink 
                key={n.to} 
                to={n.to} 
                end={n.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {t(n.key, n.defaultLabel)}
              </NavLink>
            ))}
          </nav>

          {/* User Profile & Action Tools */}
          <div className="user-tools">
            <button 
              className="btn sm secondary" 
              onClick={async () => { await logout(); nav('/login'); }}
              title={t('nav.logout', 'Logout')}
            >
              {t('nav.logout', 'Logout')}
            </button>

            {/* Mobile Hamburger Toggle */}
            <button 
              className="mobile-nav-btn" 
              onClick={() => setMobileOpen((o) => !o)} 
              aria-label="Toggle navigation"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        <div className={`mobile-drawer ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)}>
          {items.map((n) => (
            <NavLink 
              key={n.to} 
              to={n.to} 
              end={n.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {t(n.key, n.defaultLabel)}
            </NavLink>
          ))}
          <NavLink to="/profile">👤 {t('nav.profile', 'Profile')}</NavLink>
        </div>
      </header>

      {/* ---------- Main Content Container ---------- */}
      <main className="main-layout">
        <Outlet />
      </main>
    </div>
  );
}
