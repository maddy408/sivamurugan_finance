import { Spinner, EmptyState, ErrorState } from './ui';
import { useI18n } from '../state/I18nContext';

const PAGE_SIZES = [10, 25, 50, 100, 200];

/**
 * Presentational table with server-side pagination/sort controls.
 * The parent owns the query state and refetches on change.
 */
export default function DataTable({
  columns, rows, loading, error, onRetry,
  page, perPage, total, totalPages,
  sortBy, sortDir, onSort, onPage, onPerPage,
  emptyTitle, emptyHint,
  selectedIds,
  onSelectChange,
  selectable = false,
  bulkActions,
}) {
  const { t, lang } = useI18n();
  const isSelectable = selectable || typeof onSelectChange === 'function';
  const selArray = Array.isArray(selectedIds) ? selectedIds : [];
  const selSet = new Set(selArray.map(String));

  const validRows = rows || [];
  const pageRowIds = validRows.map((r) => String(r.id));
  const isAllSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selSet.has(id));

  const toggleAll = () => {
    if (!onSelectChange) return;
    if (isAllSelected) {
      onSelectChange(selArray.filter((id) => !pageRowIds.includes(String(id))));
    } else {
      const combined = Array.from(new Set([...selArray.map(String), ...pageRowIds]));
      onSelectChange(combined);
    }
  };

  const toggleRow = (id) => {
    if (!onSelectChange) return;
    const strId = String(id);
    if (selSet.has(strId)) {
      onSelectChange(selArray.filter((item) => String(item) !== strId));
    } else {
      onSelectChange([...selArray, id]);
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
      {isSelectable && selArray.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff', borderBottom: '1px solid var(--line)', gap: 12
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: '#3b82f6', color: '#ffffff', borderRadius: 12,
              padding: '2px 8px', fontSize: 12, fontWeight: 800
            }}>
              {selArray.length}
            </span>
            <span>{lang === 'ta' ? 'தேர்வு செய்யப்பட்டது' : `item${selArray.length > 1 ? 's' : ''} selected`}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {bulkActions}
            <button className="btn sm secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => onSelectChange([])}>
              {t('Clear', 'Clear')}
            </button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {isSelectable && (
                <th style={{ width: 38, textAlign: 'center', cursor: 'default' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleAll}
                    disabled={loading || validRows.length === 0}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
              )}
              {columns.map((c) => {
                const headerText = typeof c.header === 'string' ? t(c.header, c.header) : c.header;
                return (
                  <th
                    key={c.key}
                    title={typeof c.header === 'string' ? headerText : undefined}
                    onClick={() => c.sortable && onSort?.(c.key)}
                    style={{ cursor: c.sortable ? 'pointer' : 'default', textAlign: c.align || 'left', width: c.width || undefined }}
                  >
                    {headerText}
                    {c.sortable ? (
                      <span style={{ fontSize: 11, marginLeft: 4, opacity: sortBy === c.key ? 1 : 0.45 }}>
                        {sortBy === c.key ? (sortDir === 'desc' ? '∨' : '∧') : '⇅'}
                      </span>
                    ) : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && !error && validRows.map((row, i) => {
              const rowId = row.id ?? i;
              const isSelected = selSet.has(String(rowId));
              return (
                <tr key={rowId} style={isSelected ? { background: '#eff6ff' } : undefined}>
                  {isSelectable && (
                    <td data-label="" style={{ width: 38, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(rowId)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                  )}
                  {columns.map((c) => {
                    const mobileLabel = /^(_a|action|actions)$/i.test(c.key) ? '' : (typeof c.header === 'string' ? t(c.header, c.header) : '');
                    return (
                      <td
                        key={c.key}
                        data-label={mobileLabel}
                        style={{ textAlign: c.align || 'left', width: c.width || undefined }}
                      >
                        {c.render ? c.render(row, i) : (row[c.key] ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={onRetry} />}
      {!loading && !error && validRows.length === 0 && (
        <EmptyState title={emptyTitle ? t(emptyTitle, emptyTitle) : t('No records found', 'No records found')} hint={emptyHint ? t(emptyHint, emptyHint) : undefined} />
      )}

      {!loading && !error && (
        <div className="pagination">
          <div className="pagination-info">
            <span className="pagination-total">{total} {lang === 'ta' ? 'பதிவுகள்' : (total === 1 ? 'record' : 'records')}</span>
            <select className="pagination-per-page" value={perPage} onChange={(e) => onPerPage?.(Number(e.target.value))}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / {lang === 'ta' ? 'பக்கம்' : 'page'}</option>)}
            </select>
          </div>
          <div className="pagination-controls">
            <button className="btn sm secondary pagination-btn" disabled={page <= 1} onClick={() => onPage?.(page - 1)}>
              {t('Prev', 'Prev')}
            </button>
            <span className="pagination-page-indicator">
              {lang === 'ta' ? `பக்கம் ${page} / ${Math.max(1, totalPages || 1)}` : `Page ${page} of ${Math.max(1, totalPages || 1)}`}
            </span>
            <button className="btn sm secondary pagination-btn" disabled={page >= (totalPages || 1)} onClick={() => onPage?.(page + 1)}>
              {t('Next', 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
