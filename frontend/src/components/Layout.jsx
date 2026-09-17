import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { API_BASE } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import { FiX, FiMenu, FiUser, FiLogOut, FiCheck } from 'react-icons/fi';

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

const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
];

export default function Layout() {
  const { user, logout, can, isAdmin, meta } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
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
            <div className="brand-logo-pill" style={{ padding: 0, background: '#fff', overflow: 'hidden' }}>
              <img src={orgLogo && !logoBroken ? API_BASE + orgLogo : '/logo.jpeg'} alt="logo"
                onError={() => setLogoBroken(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
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
            <LangSwitcher lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} />
            <button className="btn-icon logout-icon-btn" onClick={doLogout} title={t('nav.logout', 'Logout')} aria-label={t('nav.logout', 'Logout')}>
              <IconLogout />
            </button>
            <button className="mobile-nav-btn" onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation" aria-expanded={mobileOpen}>
              {mobileOpen ? <FiX size={20} /> : <FiMenu size={20} />}
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
        <NavLink to="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FiUser size={15} /> {t('nav.profile', 'Profile')}</NavLink>
        <button className="drawer-logout" onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FiLogOut size={15} /> {t('nav.logout', 'Logout')}</button>
      </div>

      <main className="main-layout">
        <Outlet />
      </main>
    </div>
  );
}

function LangSwitcher({ lang, setLang, open, setOpen }) {
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (
    <div className="lang-switcher" onMouseLeave={() => setOpen(false)}>
      <button className="lang-switcher-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current.flag}</span>
        <span className="lang-switcher-label">{current.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="lang-switcher-menu" role="listbox">
          {LANGS.map((l) => (
            <button key={l.code} className={`lang-switcher-item ${l.code === lang ? 'active' : ''}`}
              role="option" aria-selected={l.code === lang}
              onClick={() => { setLang(l.code); setOpen(false); }}>
              <span>{l.flag}</span><span>{l.label}</span>
              {l.code === lang && <span className="lang-switcher-check"><FiCheck size={13} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconLogout() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
