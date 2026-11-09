import { useEffect, useState, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../state/I18nContext';
import {
  FiEye, FiEdit2, FiTrash2, FiX, FiCheckCircle, FiXCircle, FiPrinter, FiClock,
  FiLock, FiEyeOff, FiLogOut, FiPlusCircle, FiSearch, FiRefreshCw, FiList,
  FiFileText, FiDollarSign, FiCreditCard, FiUsers, FiUser, FiCalendar,
  FiBarChart2, FiSettings, FiHome, FiDownload, FiUpload, FiAlertTriangle,
  FiInfo, FiChevronLeft, FiChevronRight, FiChevronDown, FiFilter, FiShield,
  FiMapPin, FiPhone, FiMail, FiAlertCircle
} from 'react-icons/fi';

export function FieldError({ error }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <span className="field-error-msg err" role="alert">
      <FiAlertCircle size={12} style={{ flexShrink: 0, marginTop: 1, color: '#ef4444' }} />
      <span>{t(error, error)}</span>
    </span>
  );
}

// One place that maps the app's icon vocabulary to react-icons/fi — every
// screen imports icons from here (or from this module's re-exports) instead
// of using emoji characters, which don't render as glyphs on some systems.
export {
  FiEye as IconEyeOutline, FiEyeOff, FiLock, FiLogOut, FiPlusCircle, FiSearch,
  FiRefreshCw, FiList, FiFileText, FiDollarSign, FiCreditCard, FiUsers, FiUser,
  FiCalendar, FiBarChart2, FiSettings, FiHome, FiDownload, FiUpload,
  FiAlertTriangle, FiInfo, FiChevronLeft, FiChevronRight, FiChevronDown,
  FiFilter, FiShield, FiCheckCircle, FiXCircle as IconCancel, FiPrinter as IconPrint,
  FiClock as IconHistory,
};

/**
 * Multi-select checkbox picker with search, scroll, count and clear.
 * value = array of ids (numbers); options = [{id, name}].
 */
export function CheckboxPicker({ label, options = [], value = [], onChange, searchPlaceholder = 'Search…', emptyText = 'No options', maxHeight = 250 }) {
  const [q, setQ] = useState('');
  const sel = new Set(value.map(Number));
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const allFilteredIds = filtered.map((o) => Number(o.id));
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => sel.has(id));

  const toggle = (id) => {
    const n = new Set(sel);
    n.has(Number(id)) ? n.delete(Number(id)) : n.add(Number(id));
    onChange([...n]);
  };
  const toggleAll = () => {
    const n = new Set(sel);
    if (allSelected) allFilteredIds.forEach((id) => n.delete(id));
    else allFilteredIds.forEach((id) => n.add(id));
    onChange([...n]);
  };

  return (
    <div className="field">
      {label && (
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label}</span>
          <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>
            Selected: {sel.size}
            {sel.size > 0 && (
              <button type="button" className="btn sm secondary" style={{ marginLeft: 8, padding: '2px 10px', fontSize: 11 }} onClick={() => onChange([])}>Clear</button>
            )}
          </span>
        </label>
      )}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: 8, borderBottom: '1px solid var(--line-subtle)', background: '#f8fafc' }}>
          <input type="search" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)}
            style={{ width: '100%' }} />
        </div>
        {filtered.length > 3 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line-subtle)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all{q ? ' (matching)' : ''}
          </label>
        )}
        <div style={{ maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {filtered.length === 0 && <div className="muted" style={{ padding: 14, textAlign: 'center', fontSize: 13 }}>{emptyText}</div>}
          {filtered.map((o) => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
              <input type="checkbox" checked={sel.has(Number(o.id))} onChange={() => toggle(o.id)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 14 }}>{o.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="center-state">
      <div className="spinner" />
      <div style={{ marginTop: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', hint }) {
  const { t } = useI18n();
  return (
    <div className="center-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 14px' }}>
        <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: '#f0f7ff', zIndex: 0 }} />
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none" style={{ position: 'relative', zIndex: 1 }}>
          <path d="M12 6C10.8954 6 10 6.89543 10 8V40C10 41.1046 10.8954 42 12 42H36C37.1046 42 38 41.1046 38 40V16L28 6H12Z" fill="#FFFFFF" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
          <path d="M28 6V16H38" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" fill="#eff6ff" />
          <line x1="16" y1="22" x2="32" y2="22" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="28" x2="28" y2="28" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="34" x2="24" y2="34" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
          <circle cx="34" cy="34" r="7" fill="#1d4ed8" stroke="#FFFFFF" strokeWidth="2" />
          <line x1="34" y1="31" x2="34" y2="34.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="34" cy="37" r="0.9" fill="#FFFFFF" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t(title, title)}</div>
      {hint && <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>{t(hint, hint)}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="center-state">
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f43f5e' }}>{t('Something went wrong', 'Something went wrong')}</div>
      <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>{error?.message ? t(error.message, error.message) : t('Unknown error', 'Unknown error')}</div>
      {onRetry && <button className="btn secondary" style={{ marginTop: 16 }} onClick={onRetry}>{t('Retry', 'Retry')}</button>}
    </div>
  );
}

export function Badge({ value }) {
  const { t } = useI18n();
  const valStr = String(value || '');
  // Display-only: the raw collection/receipt status stored and matched on
  // everywhere else in the app is still 'posted' - only the label shown to
  // the user reads "COMPLETED" (className keeps the raw value so the
  // existing .badge.posted colour rule still applies unchanged).
  const rawLabel = valStr.toLowerCase() === 'posted' ? 'COMPLETED' : valStr.replace(/_/g, ' ');
  const label = t(rawLabel, rawLabel);
  return <span className={`badge ${valStr}`}>{label}</span>;
}

export function Modal({ title, onClose, children, footer, size }) {
  const { t } = useI18n();
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Portaled to a flat child of <body> (not rendered inline wherever the
  // modal happens to be used) — this is what makes print work correctly.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{typeof title === 'string' ? t(title, title) : title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label={t('Close', 'Close')} style={{ padding: '4px 8px', display: 'flex' }}><FiX size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, error, icon: PropIcon, children, className }) {
  const { t } = useI18n();
  let Icon = PropIcon;
  if (!Icon && label) {
    const lbl = String(label).toLowerCase();
    if (lbl.includes('password')) Icon = FiLock;
    else if (lbl.includes('phone') || lbl.includes('mobile')) Icon = FiPhone;
    else if (lbl.includes('email') || lbl.includes('mail')) Icon = FiMail;
    else if (lbl.includes('amount') || lbl.includes('cash') || lbl.includes('upi') || lbl.includes('balance') || lbl.includes('rate') || lbl.includes('cap') || lbl.includes('price') || lbl.includes('due') || lbl.includes('emi') || lbl.includes('principal') || lbl.includes('fine') || lbl.includes('charges') || lbl.includes('paid')) Icon = FiDollarSign;
    else if (lbl.includes('date') || lbl.includes('grace') || lbl.includes('tenure') || lbl.includes('schedule') || lbl.includes('frequency') || lbl.includes('day') || lbl.includes('start') || lbl.includes('close') || lbl.includes('month') || lbl.includes('year')) Icon = FiCalendar;
    else if (lbl.includes('cust') || lbl.includes('user') || lbl.includes('emp') || lbl.includes('giver') || lbl.includes('name') || lbl.includes('assign')) Icon = FiUser;
    else if (lbl.includes('account') || lbl.includes('payment') || lbl.includes('method') || lbl.includes('mode') || lbl.includes('source') || lbl.includes('destination') || lbl.includes('disburs')) Icon = FiCreditCard;
    else if (lbl.includes('address') || lbl.includes('city') || lbl.includes('state') || lbl.includes('street')) Icon = FiMapPin;
    else if (lbl.includes('code') || lbl.includes('bill') || lbl.includes('ref') || lbl.includes('category') || lbl.includes('notes') || lbl.includes('remark') || lbl.includes('type') || lbl.includes('sort')) Icon = FiFileText;
    else Icon = FiFileText;
  }

  const childArray = Array.isArray(children) ? children : [children];
  const isAlreadyWrapped = childArray.some(
    (c) => c && typeof c === 'object' && c.props && (
      (typeof c.props.className === 'string' && (
        c.props.className.includes('input-with-icon') ||
        c.props.className.includes('input-icon-wrap') ||
        c.props.className.includes('segmented')
      ))
    )
  );

  const displayLabel = typeof label === 'string' ? t(label, label) : label;

  if (isAlreadyWrapped || !Icon) {
    return (
      <div className={`form-field-group ${className || ''}`}>
        {label && <label className="form-field-label">{displayLabel}</label>}
        {children}
        {error && <FieldError error={error} />}
      </div>
    );
  }

  // Find the primary input-like element (input, select, textarea)
  const inputIdx = childArray.findIndex(
    (c) => c && typeof c === 'object' && (c.type === 'input' || c.type === 'select' || c.type === 'textarea')
  );

  if (inputIdx === -1) {
    return (
      <div className={`form-field-group ${className || ''}`}>
        {label && <label className="form-field-label">{displayLabel}</label>}
        {children}
        {error && <FieldError error={error} />}
      </div>
    );
  }

  let primaryInput = childArray[inputIdx];
  if (error && primaryInput) {
    primaryInput = cloneElement(primaryInput, {
      className: `${primaryInput.props.className || ''} is-invalid`.trim(),
      'aria-invalid': true,
    });
  }
  const otherChildren = childArray.filter((_, idx) => idx !== inputIdx);

  return (
    <div className={`form-field-group ${className || ''}`}>
      {label && <label className="form-field-label">{displayLabel}</label>}
      <div className="input-with-icon">
        <div className="input-icon-pill"><Icon size={13} /></div>
        {primaryInput}
      </div>
      {otherChildren}
      {error && <FieldError error={error} />}
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }) {
  const { t } = useI18n();
  return (
    <Modal
      title={typeof title === 'string' ? t(title, title) : title}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose} disabled={busy}>{t('Cancel', 'Cancel')}</button>
          <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? t('Working…', 'Working…') : t(confirmLabel, confirmLabel)}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: '#334155', lineHeight: 1.6 }}>{typeof message === 'string' ? t(message, message) : message}</p>
    </Modal>
  );
}

export function IconView(props) {
  return <FiEye size={15} {...props} />;
}

export function IconEdit(props) {
  return <FiEdit2 size={15} {...props} />;
}

export function IconDelete(props) {
  return <FiTrash2 size={15} {...props} />;
}
