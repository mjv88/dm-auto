/**
 * src/xapi/ivr.ts
 *
 * IVR (Receptionist) typed interfaces and helper functions.
 * xAPI calls are made via XAPIClient methods added in client.ts.
 * Upload and download use direct fetch (need multipart/streaming).
 */

import { XAPIClient, PBXUnavailableError } from './client.js';
import { getXAPIToken } from './auth.js';

// ── Response shapes ───────────────────────────────────────────────────────────

export interface XAPIReceptionistSummary {
  id:             number;
  number:         string;
  name:           string;
  ivrType:        string;
  promptFilename: string | null;
  groups:         Array<{ groupId: number; name: string }>;
}

export interface XAPIReceptionistDetail {
  id:              number;
  number:          string;
  name:            string;
  ivrType:         string;
  timeout:         number;
  promptFilename:  string | null;
  outOfOfficeRoute: { prompt: string; isPromptEnabled: boolean };
  breakRoute:       { prompt: string; isPromptEnabled: boolean };
  holidaysRoute:    { prompt: string; isPromptEnabled: boolean };
  forwards:        XAPIIvrForward[];
  groups:          Array<{ groupId: number; name: string }>;
}

export interface XAPIIvrForward {
  id:          number;
  input:       string;
  forwardType: string;
  forwardDN:   string;
  peerType?:   string;
  customData?: string;
}

export interface XAPICustomPrompt {
  filename:    string;
  displayName: string;
  fileLink:    string;
  canBeDeleted: boolean;
}

// ── Typed wrappers ────────────────────────────────────────────────────────────

export function parseReceptionistList(raw: unknown): XAPIReceptionistSummary[] {
  const data = raw as { value: Array<Record<string, any>> };
  return data.value.map(r => ({
    id:             r.Id,
    number:         r.Number,
    name:           r.Name,
    ivrType:        r.IVRType ?? 'Default',
    promptFilename: r.PromptFilename ?? null,
    groups:         (r.Groups ?? []).map((g: any) => ({ groupId: g.GroupId, name: g.Name })),
  }));
}

export function parseReceptionistDetail(data: Record<string, any>): XAPIReceptionistDetail {
  return {
    id:              data.Id,
    number:          data.Number,
    name:            data.Name,
    ivrType:         data.IVRType ?? 'Default',
    timeout:         data.Timeout,
    promptFilename:  data.PromptFilename ?? null,
    outOfOfficeRoute: {
      prompt: data.OutOfOfficeRoute?.Prompt ?? '',
      isPromptEnabled: data.OutOfOfficeRoute?.IsPromptEnabled ?? true,
    },
    breakRoute: {
      prompt: data.BreakRoute?.Prompt ?? '',
      isPromptEnabled: data.BreakRoute?.IsPromptEnabled ?? true,
    },
    holidaysRoute: {
      prompt: data.HolidaysRoute?.Prompt ?? '',
      isPromptEnabled: data.HolidaysRoute?.IsPromptEnabled ?? true,
    },
    forwards: (data.Forwards ?? []).map((f: any) => ({
      id: f.Id, input: f.Input, forwardType: f.ForwardType,
      forwardDN: f.ForwardDN ?? '', peerType: f.PeerType, customData: f.CustomData,
    })),
    groups: (data.Groups ?? []).map((g: any) => ({ groupId: g.GroupId, name: g.Name })),
  };
}

export function parseCustomPrompts(raw: unknown): XAPICustomPrompt[] {
  const data = raw as { value: Array<Record<string, any>> };
  return data.value
    .filter(p => p.CanBeDeleted === true)
    .map(p => ({
      filename:    p.Filename,
      displayName: p.DisplayName,
      fileLink:    p.FileLink,
      canBeDeleted: p.CanBeDeleted,
    }));
}

/** Build PATCH body for a specific prompt slot. */
export function buildPromptPatchBody(
  field: 'main' | 'offHours' | 'holidays' | 'break',
  filename: string,
): Record<string, unknown> {
  switch (field) {
    case 'main':
      return { PromptFilename: filename };
    case 'offHours':
      return { OutOfOfficeRoute: { Prompt: filename, IsPromptEnabled: true } };
    case 'holidays':
      return { HolidaysRoute: { Prompt: filename, IsPromptEnabled: true } };
    case 'break':
      return { BreakRoute: { Prompt: filename, IsPromptEnabled: true } };
  }
}

// ── Direct fetch methods (multipart upload / streaming download) ─────────────

/**
 * Upload a .wav file to the PBX as a custom prompt.
 * Uses multipart/form-data POST to /xapi/v1/customPrompts.
 * The PBX auto-scopes the file to the caller's group (e.g. Custom/GRP0002/filename.wav).
 * Returns the group-scoped path from the response.
 */
export async function uploadCustomPrompt(
  pbxFqdn: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const token = await getXAPIToken(pbxFqdn);
  const url = `https://${pbxFqdn}/xapi/v1/customPrompts`;

  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'audio/wav' });
  formData.append('file', blob, filename);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new PBXUnavailableError(`Prompt upload failed: HTTP ${res.status}`);
    }
    // Response: { "@odata.context": "...", "value": "Custom/GRP0002/filename.wav" }
    const data = await res.json() as { value?: string };
    return data.value ?? filename;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Download/stream a prompt audio file from the PBX.
 */
export async function downloadPromptFile(
  pbxFqdn: string,
  fileLink: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const token = await getXAPIToken(pbxFqdn);
  const url = fileLink.startsWith('http')
    ? fileLink
    : `https://${pbxFqdn}${fileLink}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new PBXUnavailableError(`Prompt download failed: HTTP ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      contentType: res.headers.get('content-type') ?? 'audio/wav',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
