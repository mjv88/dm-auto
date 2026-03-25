'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';
import { getIvrs, getIvrDetail } from '@/lib/ivrApi';
import type { IvrSummary, IvrDetail, PromptType } from '@/types/ivr';
import PromptSlot from '@/components/ivr/PromptSlot';
import DtmfMenu from '@/components/ivr/DtmfMenu';
import RecordSheet from '@/components/ivr/RecordSheet';

export default function IvrPage() {
  const router = useRouter();
  const ivrAccess = useRunnerStore((s) => s.ivrAccess);
  const authStatus = useRunnerStore((s) => s.authStatus);
  const [ivrs, setIvrs] = useState<IvrSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<IvrDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordingSlot, setRecordingSlot] = useState<PromptType | null>(null);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      router.push('/login');
      return;
    }
    if (!ivrAccess) {
      router.push('/departments');
      return;
    }
    getIvrs()
      .then(setIvrs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [authStatus, ivrAccess, router]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-16">
        <p className="text-sm text-gray-400">Loading IVRs...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Your IVRs</h1>
        <p className="text-sm text-gray-500 mb-6">Manage greetings for your locations</p>

        {ivrs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No IVRs assigned to your departments</p>
        ) : (
          <div className="space-y-3">
            {ivrs.map((ivr) => (
              <div key={ivr.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => handleExpand(ivr)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div>
                    <p className="font-semibold text-gray-800">{ivr.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Ext. {ivr.number} · {ivr.groups[0]?.name ?? ''}</p>
                  </div>
                  <span className="text-gray-400">{expandedId === ivr.id ? '\u25BE' : '\u25B8'}</span>
                </button>

                {expandedId === ivr.id && (
                  <div className="px-4 pb-4 border-t">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
