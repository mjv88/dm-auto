'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore, useRunnerProfile } from '@/lib/store';
import { getIvrs, getIvrDetail } from '@/lib/ivrApi';
import type { IvrSummary, IvrDetail, PromptType } from '@/types/ivr';
import RunnerHeader from '@/components/RunnerHeader';
import PromptSlot from '@/components/ivr/PromptSlot';
import DtmfMenu from '@/components/ivr/DtmfMenu';
import RecordSheet from '@/components/ivr/RecordSheet';

export default function IvrPage() {
  const router = useRouter();
  const ivrAccess = useRunnerStore((s) => s.ivrAccess);
  const authStatus = useRunnerStore((s) => s.authStatus);
  const runnerProfile = useRunnerProfile();
  const [ivrs, setIvrs] = useState<IvrSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<IvrDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordingSlot, setRecordingSlot] = useState<PromptType | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadIvrs = useCallback(() => {
    getIvrs()
      .then(setIvrs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      router.push('/login');
      return;
    }
    if (!ivrAccess) {
      router.push('/departments');
      return;
    }
    loadIvrs();
  }, [authStatus, ivrAccess, router, loadIvrs]);

  async function handleExpand(ivr: IvrSummary) {
    if (expandedId === ivr.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(ivr.id);
    setDetailLoading(true);
    try {
      const d = await getIvrDetail(ivr.id);
      setDetail(d);
    } catch (err) {
      console.error('Failed to load IVR detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refresh() {
    if (expandedId) {
      const d = await getIvrDetail(expandedId);
      setDetail(d);
    }
  }

  function handleRefresh() {
    setIsRefreshing(true);
    setExpandedId(null);
    setDetail(null);
    getIvrs()
      .then(setIvrs)
      .catch(console.error)
      .finally(() => setIsRefreshing(false));
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
      {/* Same header as departments page */}
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
          <svg
            className={isRefreshing ? 'animate-spin' : ''}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>

      {/* IVR list — same spacing as department cards */}
      <div className="px-4 pt-4 pb-8 space-y-2 flex-1">
        {ivrs.length === 0 ? (
          <p className="mt-6 text-sm text-brand-secondary text-center">
            No IVRs assigned to your departments
          </p>
        ) : (
          ivrs.map((ivr) => (
            <div key={ivr.id}>
              {/* IVR row — matches DeptCard styling */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleExpand(ivr)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExpand(ivr); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white transition-all border shadow-sm hover:shadow-md cursor-pointer ${
                  expandedId === ivr.id ? 'border-2 border-blue-400' : 'border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">{ivr.name}</span>
                  <span className="text-xs text-gray-400">Ext. {ivr.number}</span>
                </div>
                <span className="ml-3 text-sm font-medium text-blue-600 whitespace-nowrap">
                  {expandedId === ivr.id ? 'Close' : 'Manage'}
                </span>
              </div>

              {/* Expanded detail panel */}
              {expandedId === ivr.id && (
                <div className="mt-1 rounded-xl bg-white border border-gray-200 shadow-sm px-4 py-3">
                  {detailLoading ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
                  ) : detail ? (
                    <>
                      <PromptSlot label="Main Greeting" promptType="main" filename={detail.promptFilename} onRecord={setRecordingSlot} onUpload={() => {}} />
                      <PromptSlot label="After Hours" promptType="offHours" filename={detail.outOfOfficeRoute.prompt} onRecord={setRecordingSlot} onUpload={() => {}} />
                      <PromptSlot label="Holidays" promptType="holidays" filename={detail.holidaysRoute.prompt} onRecord={setRecordingSlot} onUpload={() => {}} />
                      <PromptSlot label="Break" promptType="break" filename={detail.breakRoute.prompt} onRecord={setRecordingSlot} onUpload={() => {}} />
                      <DtmfMenu forwards={detail.forwards} />
                    </>
                  ) : null}
                </div>
              )}

              {recordingSlot && detail && expandedId === ivr.id && (
                <RecordSheet
                  ivrId={ivr.id}
                  ivrNumber={ivr.number}
                  promptType={recordingSlot}
                  onComplete={() => { setRecordingSlot(null); refresh(); }}
                  onClose={() => setRecordingSlot(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
