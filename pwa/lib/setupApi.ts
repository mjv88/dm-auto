/**
 * lib/setupApi.ts
 *
 * Fetch wrapper for the self-service onboarding wizard.
 * Auth is handled via httpOnly cookies (credentials: 'include').
 */

import { useRunnerStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function setupFetch(path: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers });
  if (resp.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login?redirect=/setup';
  }
  return resp;
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface SetupStatus {
  hasCompany: boolean;
  hasPbx: boolean;
  hasRunners: boolean;
  runnerCount: number;
}

export interface Tenant {
  id: string;
  name: string;
  entraTenantId: string;
  entraGroupId: string;
  adminEmails: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PbxExtension {
  id: string;
  pbxCredentialId: string;
  extensionNumber: string;
  email: string | null;
  displayName: string | null;
  currentGroupId: string | null;
  currentGroupName: string | null;
  fetchedAt: string;
}

export interface CreateRunnersResult {
  created: string[];
  skipped: string[];
  errors: Array<{ extension: string; reason: string }>;
}

// ── API functions ───────────────────────────────────────────────────────────────

export async function getSetupStatus(): Promise<SetupStatus> {
  const resp = await setupFetch('/setup/status');
  if (!resp.ok) throw new Error('Failed to get setup status');
  return resp.json() as Promise<SetupStatus>;
}

export async function createCompany(name: string): Promise<{ tenant: Tenant; sessionToken: string }> {
  const resp = await setupFetch('/setup/company', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Failed to create company');
  }
  const data = await resp.json() as { tenant: Tenant; sessionToken: string };
  // Update session token in store with the one containing tenantId
  useRunnerStore.getState().setSessionToken(data.sessionToken);
  return data;
}

export async function connectPbx(body: {
  fqdn: string;
  name: string;
  authMode: 'xapi' | 'user_credentials';
  credentials:
    | { mode: 'xapi'; clientId: string; secret: string }
    | { mode: 'user_credentials'; username: string; password: string };
}): Promise<{ pbx: Record<string, unknown> }> {
  const resp = await setupFetch('/setup/pbx', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Failed to connect PBX');
  }
  return resp.json() as Promise<{ pbx: Record<string, unknown> }>;
}

export async function getExtensions(opts?: {
  pbxId?: string;
  department?: string;
  search?: string;
}): Promise<{ extensions: PbxExtension[]; departments: string[]; pbxId: string }> {
  const params = new URLSearchParams();
  if (opts?.pbxId) params.set('pbxId', opts.pbxId);
  if (opts?.department) params.set('department', opts.department);
  if (opts?.search) params.set('search', opts.search);
  const query = params.toString() ? `?${params}` : '';
  const resp = await setupFetch(`/setup/extensions${query}`);
  if (!resp.ok) throw new Error('Failed to get extensions');
  return resp.json() as Promise<{ extensions: PbxExtension[]; departments: string[]; pbxId: string }>;
}

export async function createRunners(extensionNumbers: string[]): Promise<CreateRunnersResult> {
  const resp = await setupFetch('/setup/runners', {
    method: 'POST',
    body: JSON.stringify({ extensionNumbers }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Failed to create runners');
  }
  return resp.json() as Promise<CreateRunnersResult>;
}

export async function inviteRunners(mode: 'email' | 'link'): Promise<{ sent?: number; link?: string }> {
  const resp = await setupFetch('/setup/invite', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Failed to invite runners');
  }
  return resp.json() as Promise<{ sent?: number; link?: string }>;
}

export async function getCompanyName(tenantId: string): Promise<string | null> {
  const resp = await fetch(`${API_URL}/company/${tenantId}/name`);
  if (!resp.ok) return null;
  const data = await resp.json() as { name: string };
  return data.name;
}
