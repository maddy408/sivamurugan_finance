import { api } from '../api/client';
import DataTable from '../components/DataTable';
import { useList } from '../hooks/useList';
import { useI18n } from '../state/I18nContext';
import { FiX } from 'react-icons/fi';

export default function AuditLogs() {
  const { t, lang } = useI18n();
  const list = useList('/api/audit-logs', { initialPerPage: 50 });

  const columns = [
    { key: 'created_at', header: t('When', 'When'), render: (r) => String(r.created_at).replace('T', ' ').slice(0, 19) },
    { key: 'actor_name', header: t('Actor', 'Actor'), render: (r) => r.actor_name || r.actor_username || '—' },
    { key: 'actor_role', header: t('Role', 'Role') },
    { key: 'action', header: t('Action', 'Action') },
    { key: 'module', header: t('Module', 'Module') },
    { key: 'entity_type', header: t('Entity', 'Entity'), render: (r) => r.entity_type ? `${r.entity_type}#${r.entity_id}` : '—' },
    { key: 'reason', header: t('Reason', 'Reason'), render: (r) => r.reason || '—' },
    { key: 'ip', header: t('IP', 'IP') },
  ];

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder={t('Search action, module, reason…', 'Search action, module, reason…')} value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <input placeholder={t('module', 'module')} value={list.filters.module || ''} onChange={(e) => list.setFilter('module', e.target.value)} />
        <input placeholder={t('action', 'action')} value={list.filters.action || ''} onChange={(e) => list.setFilter('action', e.target.value)} />
        <input type="date" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{t('Clear filters', 'Clear filters')} <FiX size={12} /></button>}
      </div>
      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle={t("No audit entries", "No audit entries")}
      />
    </>
  );
}