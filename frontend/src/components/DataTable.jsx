import { Spinner, EmptyState, ErrorState } from './ui';

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
    <div className="card">
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
            <span>item{selArray.length > 1 ? 's' : ''} selected</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {bulkActions}
            <button className="btn sm secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => onSelectChange([])}>
              Clear
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
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortable && onSort?.(c.key)}
                  style={{ cursor: c.sortable ? 'pointer' : 'default', textAlign: c.align || 'left' }}
                >
                  {c.header}
                  {c.sortable && sortBy === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && !error && validRows.map((row, i) => {
              const rowId = row.id ?? i;
              const isSelected = selSet.has(String(rowId));
              return (
                <tr key={rowId} style={isSelected ? { background: '#eff6ff' } : undefined}>
                  {isSelectable && (
                    <td style={{ width: 38, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(rowId)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={onRetry} />}
      {!loading && !error && validRows.length === 0 && (
        <EmptyState title={emptyTitle || 'No records found'} hint={emptyHint} />
      )}

      {!loading && !error && (
        <div className="pagination">
          <span>{total} record{total === 1 ? '' : 's'}</span>
          <select value={perPage} onChange={(e) => onPerPage?.(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <button className="btn sm secondary" disabled={page <= 1} onClick={() => onPage?.(page - 1)}>Prev</button>
          <span>Page {page} of {Math.max(1, totalPages || 1)}</span>
          <button className="btn sm secondary" disabled={page >= (totalPages || 1)} onClick={() => onPage?.(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
