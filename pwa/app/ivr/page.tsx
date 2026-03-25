'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore, useRunnerProfile } from '@/lib/store';
import { getIvrs, triggerRecording, getCustomPrompts, deleteCustomPrompt } from '@/lib/ivrApi';
import type { CustomPrompt } from '@/lib/ivrApi';
import type { IvrSummary } from '@/types/ivr';
import RunnerHeader from '@/components/RunnerHeader';

type RecordingState = 'idle' | 'naming' | 'recording' | 'done' | 'error';

export default function IvrPage() {
  const router = useRouter();
  const ivrAccess = useRunnerStore((s) => s.ivrAccess);
  const authStatus = useRunnerStore((s) => s.authStatus);
  const runnerProfile = useRunnerProfile();
  const [ivrs, setIvrs] = useState<IvrSummary[]>([]);
  const [prompts, setPrompts] = useState<CustomPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Recording state
  const [activeIvrId, setActiveIvrId] = useState<number | null>(null);
  const [recordState, setRecordState] = useState<RecordingState>('idle');
  const [recordName, setRecordName] = useState('');
  const [recordedFilename, setRecordedFilename] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Expanded IVR (to show prompts dropdown)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [ivrData, promptData] = await Promise.all([getIvrs(), getCustomPrompts()]);
      setIvrs(ivrData);
      setPrompts(promptData);
    } catch (err) {
      console.error('Failed to load IVR data:', err);
    } finally {
      setLoading(false);
    }
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
    loadData().finally(() => setIsRefreshing(false));
  }

  function resetRecording() {
    setActiveIvrId(null);
    setRecordState('idle');
    setRecordName('');
    setRecordedFilename('');
    setErrorMsg('');
  }

  function handleNewClick(ivr: IvrSummary) {
    if (activeIvrId === ivr.id && recordState !== 'idle') {
      resetRecording();
      return;
    }
    setExpandedId(null); // close dropdown if open
    setActiveIvrId(ivr.id);
    setRecordState('naming');
    setRecordName('');
    setRecordedFilename('');
    setErrorMsg('');
  }

  function handleExpandToggle(ivr: IvrSummary) {
    if (expandedId === ivr.id) {
      setExpandedId(null);
    } else {
      resetRecording(); // close record flow if open
      setExpandedId(ivr.id);
    }
  }

  async function handleRecord(ivr: IvrSummary) {
    if (!recordName.trim()) return;
    setRecordState('recording');
    try {
      const filename = await triggerRecording(ivr.id, recordName.trim());
      setRecordedFilename(filename);
      setRecordState('done');
      // Refresh prompts list after recording
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
          aria-label="IVRs aktualisieren"
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
      <div className="px-4 pt-4 pb-8 space-y-2 flex-1">
        {ivrs.length === 0 ? (
          <p className="mt-6 text-sm text-brand-secondary text-center">No IVRs assigned to your departments</p>
        ) : (
          ivrs.map((ivr) => {
            const isRecording = activeIvrId === ivr.id && recordState !== 'idle';
            const isExpanded = expandedId === ivr.id;

            return (
              <div key={ivr.id}>
                {/* IVR row */}
                <div className={`w-full flex items-center px-4 py-3 rounded-xl bg-white transition-all border shadow-sm ${
                  isRecording ? 'border-2 border-blue-400' : isExpanded ? 'border-2 border-gray-400' : 'border-gray-200'
                }`}>
                  {/* IVR info — clickable to expand prompts */}
                  <button
                    onClick={() => handleExpandToggle(ivr)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate block">{ivr.name}</span>
                    <span className="text-xs text-gray-400">Ext. {ivr.number}</span>
                  </button>

                  {/* Prompts count badge */}
                  <button
                    onClick={() => handleExpandToggle(ivr)}
                    className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200"
                    title="View recordings"
                  >
                    {prompts.length} rec.
                  </button>

                  {/* + New button */}
                  <button
                    onClick={() => handleNewClick(ivr)}
                    className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isRecording
                        ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        : 'text-white hover:opacity-90'
                    }`}
                    style={!isRecording ? { backgroundColor: '#0078D4' } : undefined}
                  >
                    {isRecording ? 'Cancel' : '+ New'}
                  </button>
                </div>

                {/* Expanded: custom prompts dropdown */}
                {isExpanded && (
                  <div className="mt-1 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                    {prompts.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">No custom recordings yet</p>
                    ) : (
                      prompts.map((p) => (
                        <div key={p.filename} className="flex items-center px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 truncate block">{p.filename}</span>
                          </div>
                          <button
                            onClick={() => handleDeletePrompt(p.filename)}
                            className="ml-2 px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                            title="Delete recording"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Inline recording flow */}
                {isRecording && (
                  <div className="mt-1 rounded-xl bg-white border border-gray-200 shadow-sm px-4 py-4">
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
                          onKeyDown={(e) => { if (e.key === 'Enter' && recordName.trim()) handleRecord(ivr); }}
                        />
                        {recordName.trim() && (
                          <button
                            onClick={() => handleRecord(ivr)}
                            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
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
                      <div className="text-center py-4">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto animate-pulse text-blue-600 mb-3">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        <p className="text-sm font-medium text-gray-700">Calling your phone...</p>
                        <p className="text-xs text-gray-400 mt-1">Record your announcement and hang up when done</p>
                      </div>
                    )}

                    {recordState === 'done' && (
                      <div className="text-center py-4">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-green-500 mb-2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <p className="text-sm font-medium text-gray-700">Recording triggered!</p>
                        <p className="text-xs text-gray-400 mt-1">Saved as <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{recordedFilename}</span></p>
                        <button onClick={resetRecording} className="mt-3 text-sm text-blue-600 font-medium hover:underline">Done</button>
                      </div>
                    )}

                    {recordState === 'error' && (
                      <div className="text-center py-4">
                        <p className="text-sm text-red-600 mb-2">{errorMsg}</p>
                        <div className="flex justify-center gap-3">
                          <button onClick={() => setRecordState('naming')} className="text-sm text-blue-600 font-medium hover:underline">Try again</button>
                          <button onClick={resetRecording} className="text-sm text-gray-500 font-medium hover:underline">Cancel</button>
                        </div>
                      </div>
                    )}
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
