/**
 * lib/setupApi.ts
 *
 * Fetch wrapper for the self-service onboarding wizard.
 * Uses the sessionToken from the Zustand store for auth.
 */

import { useProvisioningStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function setupFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = useProvisioningStore.getState().sessionToken;
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (resp.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login?redirect=/setup';
  }
  return resp;
}

// Types

export interface SetupStatus {
  hasCompany: boolean;
  hasPbx: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  adminEmails: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// API functions

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
  useProvisioningStore.getState().setSessionToken(data.sessionToken);
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

export async function getCompanyName(tenantId: string): Promise<string | null> {
  const resp = await fetch(`${API_URL}/company/${tenantId}/name`);
  if (!resp.ok) return null;
  const data = await resp.json() as { name: string };
  return data.name;
}
