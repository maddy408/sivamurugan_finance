import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { API_BASE } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import {
  FiX, FiMenu, FiUser, FiLogOut, FiCheck, FiHome, FiCheckSquare,
  FiPieChart, FiDollarSign, FiBarChart2, FiSettings, FiGlobe, FiChevronDown
} from 'react-icons/fi';

const NAV = [
  { to: '/', key: 'nav.dashboard', defaultLabel: 'Dashboard', end: true, perm: 'dashboard.view', icon: FiHome },
  { to: '/collection', key: 'nav.collection', defaultLabel: 'Collection', perm: 'collection.view', icon: FiCheckSquare },
  { to: '/pending', key: 'nav.pending', defaultLabel: 'Pending Dues', perm: 'pending.view', icon: FiCheckSquare },
  { to: '/customers', key: 'nav.customers', defaultLabel: 'Customers', perm: 'customers.view', icon: FiUser },
  { to: '/loans', key: 'nav.chits', defaultLabel: 'Chits', perm: 'loans.view', icon: FiPieChart },
  { to: '/finance', key: 'nav.finance', defaultLabel: 'Expenses & Income', perm: 'expenses.view', icon: FiDollarSign },
  { to: '/reports', key: 'nav.reports', defaultLabel: 'Reports', perm: 'reports.view', icon: FiBarChart2 },
  { to: '/settings', key: 'nav.settings', defaultLabel: 'Settings', perm: 'settings.view', icon: FiSettings },
];

const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
];

export default function Layout() {
  const { user, logout, can, isAdmin, meta } = useAuth();
  const { t, lang, setLang } = useI18n();
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

  // Support triggering mobile drawer from external buttons (e.g. 3 lines icon on Dashboard)
  useEffect(() => {
    const handler = () => setMobileOpen((o) => !o);
    window.addEventListener('toggle-mobile-drawer', handler);
    return () => window.removeEventListener('toggle-mobile-drawer', handler);
  }, []);

  return (
    <div className="app">
      <header className="top-navbar">
        <div className="top-navbar-container">
          {/* Brand Container with Capsule Pill Border */}
          <Link to="/" className="brand-container" onClick={closeDrawer}>
            <div className="brand-logo-pill">
              <img
                src={orgLogo && !logoBroken ? API_BASE + orgLogo : '/logo.jpeg'}
                alt="logo"
                onError={() => setLogoBroken(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div className="brand-text-wrap">
              <span className="brand-title">{t('app.title', 'Siva Murugan Chit Fund')}</span>
              <span className="brand-subtitle">Chit Fund Management</span>
            </div>
          </Link>

          {/* Navigation Links with Icons (Desktop) */}
          <nav className="top-nav">
            {items.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {Icon && <Icon size={15} style={{ flexShrink: 0 }} />}
                  <span>{t(n.key, n.defaultLabel)}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Right Tools: Royal Blue English Pill + Logout Button + Hamburger */}
          <div className="user-tools">
            <LangSwitcher lang={lang} setLang={setLang} />
            <button
              className="btn-icon logout-icon-btn"
              onClick={doLogout}
              title={t('nav.logout', 'Logout')}
              aria-label={t('nav.logout', 'Logout')}
            >
              <FiLogOut size={16} />
            </button>
            <button
              className="mobile-nav-btn"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={t('Toggle navigation menu', 'Toggle navigation menu')}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Backdrop Overlay */}
      <div
        className={`mobile-drawer-overlay ${mobileOpen ? 'open' : ''}`}
        onClick={closeDrawer}
        aria-hidden={!mobileOpen}
      />

      {/* Mobile Slide-Over Drawer (Clean White & Royal Blue Theme) */}
      <aside
        className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation drawer"
      >
        <div className="drawer-header">
          <div className="drawer-user">
            <div className="drawer-avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
            <div className="drawer-user-info">
              <div className="drawer-name">{user?.name}</div>
              <div className="drawer-role">{t(user?.role_name || user?.role || '')}</div>
            </div>
          </div>
          <button
            className="drawer-close-btn"
            onClick={closeDrawer}
            aria-label={t('Close menu', 'Close menu')}
          >
            <FiX size={18} />
          </button>
        </div>

        <nav className="drawer-nav">
          {items.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}
                onClick={closeDrawer}
              >
                {Icon && <Icon size={16} style={{ flexShrink: 0 }} />}
                <span>{t(n.key, n.defaultLabel)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="drawer-footer">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('Language:', 'Language:')}</span>
            <div className="drawer-lang-toggle" style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 20 }}>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  style={{
                    border: 'none',
                    borderRadius: 16,
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: l.code === lang ? '#1d4ed8' : 'transparent',
                    color: l.code === lang ? '#ffffff' : '#475569',
                    boxShadow: l.code === lang ? '0 1px 4px rgba(29, 78, 216, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="drawer-logout-btn" onClick={doLogout}>
            <FiLogOut size={16} /> {t('nav.logout', 'Logout')}
          </button>
        </div>
      </aside>

      <main className="main-layout">
        <Outlet />
      </main>
    </div>
  );
}

function LangSwitcher({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        className="lang-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        type="button"
        style={{
          background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 20,
          padding: '5px 14px',
          fontWeight: 700,
          fontSize: 12.5,
          boxShadow: '0 2px 8px rgba(13, 40, 86, 0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <FiGlobe size={14} style={{ color: '#ffffff' }} />
        <span className="lang-switcher-label" style={{ color: '#ffffff', fontWeight: 700, display: 'inline', fontSize: 12.5 }}>
          {current.label}
        </span>
        <FiChevronDown size={13} style={{ color: '#ffffff' }} />
      </button>
      {open && (
        <div className="lang-switcher-menu" role="listbox">
          {LANGS.map((l) => (
            <button key={l.code} className={`lang-switcher-item ${l.code === lang ? 'active' : ''}`}
              role="option" aria-selected={l.code === lang}
              type="button"
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
