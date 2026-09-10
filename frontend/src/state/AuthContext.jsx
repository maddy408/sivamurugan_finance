import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, tokenStore, setSessionTerminatedHandler } from '../api/client';

const AuthContext = createContext(null);

// How often the client silently checks that its session is still valid.
// This is what makes Force Logout / permission changes take effect WITHOUT a
// browser refresh (the server revokes the session; the next poll gets a 401).
const SESSION_POLL_MS = 12000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [terminatedMessage, setTerminatedMessage] = useState(null);
  const userRef = useRef(null);
  userRef.current = user;

  const loadMeta = useCallback(async () => {
    try {
      const res = await api.get('/api/meta/bootstrap');
      setMeta(res.data);
      return res.data;
    } catch { return null; }
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return; }
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data);
      await loadMeta();
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadMeta]);

  useEffect(() => {
    setSessionTerminatedHandler((msg, terminated) => {
      tokenStore.clear();
      setUser(null);
      setMeta(null);
      setTerminatedMessage(
        msg || (terminated
          ? 'Your session has been terminated by an administrator.'
          : 'Your session has ended. Please sign in again.')
      );
    });
    refresh();
  }, [refresh]);

  // ---- background session poll (force-logout / permission-change detection) ----
  useEffect(() => {
    const id = setInterval(async () => {
      if (!tokenStore.get() || !userRef.current) return;
      try {
        const res = await api.get('/api/auth/me');
        // pick up permission / scope changes live
        setUser((prev) => (JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data));
      } catch {
        // api client already fired setSessionTerminatedHandler on 401
      }
    }, SESSION_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const login = useCallback(async (username, password) => {
    setTerminatedMessage(null);
    const res = await api.post('/api/auth/login', { username, password });
    tokenStore.set(res.data.token);
    setUser(res.data.user);
    await loadMeta();
    return res.data.user;
  }, [loadMeta]);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
    tokenStore.clear();
    setUser(null);
    setMeta(null);
  }, []);

  const can = useCallback(
    (code) => !!user && (user.role === 'ADMIN' || (user.permissions || []).includes(code)),
    [user]
  );

  const value = useMemo(() => ({
    user, meta, loading, terminatedMessage, setTerminatedMessage,
    login, logout, refresh, refreshMeta: loadMeta, can,
    isAdmin: user?.role === 'ADMIN',
  }), [user, meta, loading, terminatedMessage, login, logout, refresh, loadMeta, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
