import { useEffect, useState } from 'react';
import {
  FiEye, FiEdit2, FiTrash2, FiX, FiCheckCircle, FiXCircle, FiPrinter, FiClock,
  FiLock, FiEyeOff, FiLogOut, FiPlusCircle, FiSearch, FiRefreshCw, FiList,
  FiFileText, FiDollarSign, FiCreditCard, FiUsers, FiUser, FiCalendar,
  FiBarChart2, FiSettings, FiHome, FiDownload, FiUpload, FiAlertTriangle,
  FiInfo, FiChevronLeft, FiChevronRight, FiChevronDown, FiFilter, FiShield,
} from 'react-icons/fi';

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
  return (
    <div className="center-state">
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{title}</div>
      {hint && <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>{hint}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="center-state">
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f43f5e' }}>Something went wrong</div>
      <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>{error?.message || 'Unknown error'}</div>
      {onRetry && <button className="btn secondary" style={{ marginTop: 16 }} onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Badge({ value }) {
  const valStr = String(value || '');
  return <span className={`badge ${valStr}`}>{valStr.replace(/_/g, ' ')}</span>;
}

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close" style={{ padding: '4px 8px', display: 'flex' }}><FiX size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: '#334155', lineHeight: 1.6 }}>{message}</p>
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

