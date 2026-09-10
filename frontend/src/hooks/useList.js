import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Standard server-side list state: search + filters + sort + pagination.
 * Nothing is filtered client-side; every change refetches from the API.
 */
export function useList(path, { initialPerPage = 10, initialSort = '', initialDir = 'asc', filters: initialFilters = {} } = {}) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [sortBy, setSortBy] = useState(initialSort);
  const [sortDir, setSortDir] = useState(initialDir);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState(null);

  const debounceRef = useRef();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(path, {
        params: {
          q, page, per_page: perPage,
          sort_by: sortBy, sort_dir: sortDir,
          ...filters,
        },
        signal,
      });
      setRows(Array.isArray(res.data) ? res.data : (res.data?.rows || res.data?.loans || []));
      setExtra(Array.isArray(res.data) ? null : res.data);
      setPagination(res.pagination || { total: (res.data || []).length, total_pages: 1 });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e);
    } finally {
      setLoading(false);
    }
  }, [path, q, page, perPage, sortBy, sortDir, filters, tick]);

  useEffect(() => {
    const ctrl = new AbortController();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(ctrl.signal), 250);
    return () => { clearTimeout(debounceRef.current); ctrl.abort(); };
  }, [load]);

  const onSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
    setPage(1);
  };
  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  // Reset search + every filter + sort + page. Triggers a fresh API load (no browser refresh).
  const clear = useCallback(() => {
    setQ('');
    setFilters(initialFilters ? { ...initialFilters } : {});
    setSortBy(initialSort);
    setSortDir(initialDir);
    setPage(1);
  }, [initialSort, initialDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = !!q || Object.values(filters || {}).some((v) => v !== '' && v !== undefined && v !== null);

  return {
    q, setQ: (v) => { setQ(v); setPage(1); },
    filters, setFilter, setFilters,
    page, setPage, perPage, setPerPage: (v) => { setPerPage(v); setPage(1); },
    sortBy, sortDir, onSort,
    rows, pagination, extra, loading, error, reload, clear, hasFilters,
  };
}
