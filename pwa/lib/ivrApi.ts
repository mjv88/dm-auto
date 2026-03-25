import type { IvrSummary, IvrDetail, PromptType } from '@/types/ivr';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function ivrFetch(path: string, options?: RequestInit) {
  // Import store lazily to avoid circular deps
  const { useRunnerStore } = await import('./store');
  const token = useRunnerStore.getState().sessionToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include' as RequestCredentials,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `IVR API error: ${res.status}`);
  }

  return res;
}

export async function getIvrs(): Promise<IvrSummary[]> {
  const res = await ivrFetch('/runner/ivrs');
  const data = await res.json();
  return data.ivrs;
}

export async function getIvrDetail(id: number): Promise<IvrDetail> {
  const res = await ivrFetch(`/runner/ivrs/${id}`);
  return res.json();
}

export function getPromptAudioUrl(filename: string): string {
  return `${API_URL}/runner/ivrs/prompts/${encodeURIComponent(filename)}`;
}

export async function triggerRecording(ivrId: number, filename: string): Promise<string> {
  const res = await ivrFetch(`/runner/ivrs/${ivrId}/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  const data = await res.json();
  return data.recordingFilename;
}

export async function uploadPromptFile(ivrId: number, file: File): Promise<string> {
  // Read file as base64 for JSON upload (no multipart needed)
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  const res = await ivrFetch(`/runner/ivrs/${ivrId}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData: base64, originalFilename: file.name }),
  });
  const data = await res.json();
  return data.uploadedFilename;
}

export interface CustomPrompt {
  filename: string;
  displayName: string;
  fileLink: string;
  canBeDeleted: boolean;
}

export async function getCustomPrompts(): Promise<CustomPrompt[]> {
  const res = await ivrFetch('/runner/ivrs/prompts');
  const data = await res.json();
  return data.prompts;
}

export async function deleteCustomPrompt(filename: string): Promise<void> {
  await ivrFetch(`/runner/ivrs/prompts/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export async function assignPrompt(
  ivrId: number,
  promptType: PromptType,
  filename: string,
): Promise<{ newFilename: string; previousFilename: string | null }> {
  const res = await ivrFetch(`/runner/ivrs/${ivrId}/assign-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptType, filename }),
  });
  return res.json();
}
