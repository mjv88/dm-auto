'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore, useRunnerProfile } from '@/lib/store';
import { getIvrs, getIvrDetail, triggerRecording, getCustomPrompts, deleteCustomPrompt } from '@/lib/ivrApi';
import type { CustomPrompt } from '@/lib/ivrApi';
import type { IvrSummary, IvrDetail } from '@/types/ivr';
import RunnerHeader from '@/components/RunnerHeader';
import DtmfMenu from '@/components/ivr/DtmfMenu';

type RecordingState = 'idle' | 'naming' | 'recording' | 'done' | 'error';

const PROMPT_LABELS: Record<string, string> = {
  RepeatPrompt: 'Repeat', Extension: 'Extension', RingGroup: 'Ring Group',
  IVR: 'Sub-menu', Queue: 'Queue', VoiceMail: 'Voicemail',
  CallByName: 'Directory', CustomInput: 'Audio', EndCall: 'End call',
};

export default function IvrPage() {
  const router = useRouter();
  const ivrAccess = useRunnerStore((s) => s.ivrAccess);
  const authStatus = useRunnerStore((s) => s.authStatus);
  const runnerProfile = useRunnerProfile();
  const [ivrs, setIvrs] = useState<IvrSummary[]>([]);
  const [prompts, setPrompts] = useState<CustomPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Expanded IVR detail
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<IvrDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Recording state
  const [recordingIvrId, setRecordingIvrId] = useState<number | null>(null);
  const [recordState, setRecordState] = useState<RecordingState>('idle');
  const [recordName, setRecordName] = useState('');
  const [recordedFilename, setRecordedFilename] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const ivrData = await getIvrs();
      setIvrs(ivrData);
    } catch (err) {
      console.error('Failed to load IVRs:', err);
    }
    try {
      const promptData = await getCustomPrompts();
      setPrompts(promptData);
    } catch (err) {
      console.error('Failed to load prompts:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') { router.push('/login'); return; }
    if (!ivrAccess) { router.push('/departments'); return; }
    loadData();
  }, [authStatus, ivrAccess, router, loadData]);

  function handleRefresh() {
    setIsRefreshing(true);
    resetRecording();
    setExpandedId(null);
    setDetail(null);
    loadData().finally(() => setIsRefreshing(false));
  }

  function resetRecording() {
    setRecordingIvrId(null);
    setRecordState('idle');
    setRecordName('');
    setRecordedFilename('');
    setErrorMsg('');
  }

  async function handleExpand(ivr: IvrSummary) {
    if (expandedId === ivr.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(ivr.id);
    setDetailLoading(true);
    resetRecording();
    try {
      const d = await getIvrDetail(ivr.id);
      setDetail(d);
    } catch (err) {
      console.error('Failed to load IVR detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleNewClick(ivr: IvrSummary) {
    if (recordingIvrId === ivr.id) {
      resetRecording();
      return;
    }
    setRecordingIvrId(ivr.id);
    setRecordState('naming');
    setRecordName('');
    setRecordedFilename('');
    setErrorMsg('');
  }

  async function handleRecord(ivr: IvrSummary) {
    if (!recordName.trim()) return;
    setRecordState('recording');
    try {
      const filename = await triggerRecording(ivr.id, recordName.trim());
      setRecordedFilename(filename);
      setRecordState('done');
      getCustomPrompts().then(setPrompts).catch(console.error);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setRecordState('error');
    }
  }

  async function handleDeletePrompt(filename: string) {
    if (!confirm(`Delete recording "${filename}"?`)) return;
    try {
      await deleteCustomPrompt(filename);
      setPrompts((prev) => prev.filter((p) => p.filename !== filename));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-brand-bg items-center justify-center pb-16">
        <p className="text-sm text-brand-secondary">Loading IVRs...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-bg overflow-y-auto pb-16">
      {/* Header */}
      <div className="relative">
        <RunnerHeader
          displayName={runnerProfile?.name}
          extensionNumber={runnerProfile?.extension}
          pbxName={runnerProfile?.pbxFqdn ?? undefined}
          pbxFqdn={runnerProfile?.pbxFqdn ?? undefined}
        />
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-brand-secondary hover:text-brand-blue disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <svg className={isRefreshing ? 'animate-spin' : ''} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>

      {/* IVR list */}
      <div className="px-4 pt-4 pb-8 space-y-3 flex-1">
        {ivrs.length === 0 ? (
          <p className="mt-6 text-sm text-brand-secondary text-center">No IVRs assigned to your departments</p>
        ) : (
          ivrs.map((ivr) => {
            const isExpanded = expandedId === ivr.id;
            const isRecording = recordingIvrId === ivr.id && recordState !== 'idle';

            return (
              <div key={ivr.id}>
                {/* IVR row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExpand(ivr)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExpand(ivr); }}
                  className={`w-full flex items-center px-4 py-3 rounded-xl bg-white transition-all border shadow-sm hover:shadow-md cursor-pointer ${
                    isExpanded ? 'border-2 border-blue-400' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">{ivr.name}</span>
                    <span className="text-xs text-gray-400">Ext. {ivr.number} · {ivr.groups[0]?.name ?? ''}</span>
                  </div>
                  <span className="ml-3 text-sm font-medium text-blue-600 whitespace-nowrap">
                    {isExpanded ? 'Close' : 'Details'}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-1 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                    {detailLoading ? (
                      <p className="text-sm text-gray-400 py-6 text-center">Loading IVR details...</p>
                    ) : detail ? (
                      <div className="divide-y divide-gray-100">
                        {/* Current prompts */}
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Prompts</p>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Main Greeting</span>
                              <span className="text-gray-800 font-medium">{detail.promptFilename || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">After Hours</span>
                              <span className="text-gray-800 font-medium">{detail.outOfOfficeRoute.prompt || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Holidays</span>
                              <span className="text-gray-800 font-medium">{detail.holidaysRoute.prompt || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Break</span>
                              <span className="text-gray-800 font-medium">{detail.breakRoute.prompt || '—'}</span>
                            </div>
                          </div>
                        </div>

                        {/* DTMF Menu */}
                        {detail.forwards.length > 0 && (
                          <div className="px-4 py-3">
                            <DtmfMenu forwards={detail.forwards} />
                          </div>
                        )}

                        {/* IVR Settings */}
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Settings</p>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Timeout</span>
                              <span className="text-gray-800 font-medium">{detail.timeout}s</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Type</span>
                              <span className="text-gray-800 font-medium">{detail.ivrType}</span>
                            </div>
                          </div>
                        </div>

                        {/* Custom recordings */}
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Recordings</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleNewClick(ivr); }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                isRecording
                                  ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  : 'text-white hover:opacity-90'
                              }`}
                              style={!isRecording ? { backgroundColor: '#0078D4' } : undefined}
                            >
                              {isRecording ? 'Cancel' : '+ New'}
                            </button>
                          </div>

                          {prompts.length === 0 ? (
                            <p className="text-xs text-gray-400">No custom recordings yet</p>
                          ) : (
                            <div className="space-y-1">
                              {prompts.map((p) => (
                                <div key={p.filename} className="flex items-center justify-between py-1.5">
                                  <span className="text-sm text-gray-700 truncate flex-1">{p.filename}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeletePrompt(p.filename); }}
                                    className="ml-2 px-2 py-0.5 rounded text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Inline recording flow */}
                        {isRecording && (
                          <div className="px-4 py-4 bg-gray-50">
                            {recordState === 'naming' && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-2">Name for this recording</label>
                                <input
                                  type="text"
                                  value={recordName}
                                  onChange={(e) => setRecordName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                  placeholder={`e.g. ${ivr.name.toLowerCase().replace(/\s+/g, '-')}-greeting`}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && recordName.trim()) handleRecord(ivr); }}
                                />
                                {recordName.trim() && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRecord(ivr); }}
                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90"
                                    style={{ backgroundColor: '#0078D4' }}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                                    </svg>
                                    Record — call my phone
                                  </button>
                                )}
                              </div>
                            )}
                            {recordState === 'recording' && (
                              <div className="text-center py-3">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto animate-pulse text-blue-600 mb-2">
                                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                                </svg>
                                <p className="text-sm font-medium text-gray-700">Calling your phone...</p>
                                <p className="text-xs text-gray-400 mt-1">Record your announcement and hang up</p>
                              </div>
                            )}
                            {recordState === 'done' && (
                              <div className="text-center py-3">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-green-500 mb-2">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <p className="text-sm font-medium text-gray-700">Recording triggered!</p>
                                <p className="text-xs text-gray-400 mt-1">Saved as <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">{recordedFilename}</span></p>
                                <button onClick={(e) => { e.stopPropagation(); resetRecording(); }} className="mt-2 text-sm text-blue-600 font-medium hover:underline">Done</button>
                              </div>
                            )}
                            {recordState === 'error' && (
                              <div className="text-center py-3">
                                <p className="text-sm text-red-600 mb-2">{errorMsg}</p>
                                <button onClick={(e) => { e.stopPropagation(); setRecordState('naming'); }} className="text-sm text-blue-600 font-medium hover:underline mr-3">Try again</button>
                                <button onClick={(e) => { e.stopPropagation(); resetRecording(); }} className="text-sm text-gray-500 font-medium hover:underline">Cancel</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
