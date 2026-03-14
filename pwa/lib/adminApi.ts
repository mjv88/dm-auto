import { useRunnerStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

function appendTenantId(path: string): string {
  const tenantId = useRunnerStore.getState().selectedAdminTenantId;
  if (!tenantId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}tenantId=${encodeURIComponent(tenantId)}`;
}

export async function adminFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = useRunnerStore.getState().sessionToken;
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const fullPath = appendTenantId(path);
  const resp = await fetch(`${API_URL}${fullPath}`, { ...options, headers });
  if (resp.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login?redirect=/admin';
  }
  return resp;
}

export async function adminGet<T>(path: string): Promise<T> {
  const resp = await adminFetch(path);
  if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await adminFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `POST ${path} failed`);
  }
  return resp.json() as Promise<T>;
}

export async function adminPut<T>(path: string, body: unknown): Promise<T> {
  const resp = await adminFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `PUT ${path} failed`);
  }
  return resp.json() as Promise<T>;
}

export async function adminDelete(path: string): Promise<void> {
  const resp = await adminFetch(path, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) throw new Error(`DELETE ${path} failed: ${resp.status}`);
}
