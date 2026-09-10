const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost/siva-murugan-chit-fund/backend/public').replace(/\/$/, '');

// App-scoped storage key so this app never shares a session with any other app
// served from the same origin (e.g. the reference chit-fund-system on localhost).
const TOKEN_KEY = 'smcf.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Lets AuthContext react to a server-side "force logout".
let onSessionTerminated = null;
export function setSessionTerminatedHandler(fn) { onSessionTerminated = fn; }

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error_code;
    this.body = body;
    this.errors = body?.errors || null;
  }
}

async function request(method, path, { body, params, signal } = {}) {
  const url = new URL(BASE + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, signal });
  } catch (e) {
    throw new ApiError(0, { message: 'Cannot reach the API. Is the PHP server running?' });
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }

  if (!res.ok) {
    if (res.status === 401 && onSessionTerminated) {
      const terminated = data?.error_code === 'SESSION_TERMINATED';
      onSessionTerminated(
        terminated ? data.message : 'Your session has ended. Please sign in again.',
        terminated
      );
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

async function download(path, params, fallbackName = 'export.xlsx') {
  const url = new URL(BASE + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const headers = { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch {}
    if (res.status === 401 && body?.error_code === 'SESSION_TERMINATED' && onSessionTerminated) onSessionTerminated(body.message);
    throw new ApiError(res.status, body || { message: `Export failed (${res.status})` });
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename="?([^"]+)"?/);
  const name = m ? m[1] : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function upload(path, file, field = 'file') {
  const url = new URL(BASE + path);
  const fd = new FormData();
  fd.append(field, file);
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p, opts) => request('GET', p, opts),
  post: (p, body, opts) => request('POST', p, { ...opts, body }),
  put: (p, body, opts) => request('PUT', p, { ...opts, body }),
  patch: (p, body, opts) => request('PATCH', p, { ...opts, body }),
  del: (p, body, opts) => request('DELETE', p, { ...opts, body }),
  download,
  upload,
};

export { BASE as API_BASE };

export const money = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(v || 0));

export const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
