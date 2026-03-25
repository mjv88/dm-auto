'use client';

import { useState, useCallback, useRef } from 'react';
import type { IvrSummary, IvrDetail, PromptType } from '@/types/ivr';
import { getIvrDetail, uploadPromptFile, assignPrompt } from '@/lib/ivrApi';
import PromptSlot from './PromptSlot';
import DtmfMenu from './DtmfMenu';
import RecordSheet from './RecordSheet';

export default function IvrCard({ ivr }: { ivr: IvrSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<IvrDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordingSlot, setRecordingSlot] = useState<PromptType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState<PromptType | null>(null);

  const handleExpand = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const d = await getIvrDetail(ivr.id);
        setDetail(d);
      } catch (err) {
        console.error('Failed to load IVR detail:', err);
      } finally {
        setLoading(false);
      }
    }
  }, [expanded, detail, ivr.id]);

  const refresh = useCallback(async () => {
    const d = await getIvrDetail(ivr.id);
    setDetail(d);
  }, [ivr.id]);

  const handleUploadClick = (pt: PromptType) => {
    setUploadSlot(pt);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadSlot) return;
    try {
      const uploadedFilename = await uploadPromptFile(ivr.id, file);
      await assignPrompt(ivr.id, uploadSlot, uploadedFilename);
      await refresh();
    } catch (err) {
      alert((err as Error).message);
    }
    e.target.value = '';
    setUploadSlot(null);
  };

  const deptName = ivr.groups[0]?.name ?? 'Unknown';

  return (
    <div className="border rounded-xl overflow-hidden mb-3 bg-white shadow-sm">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <div>
          <p className="font-medium text-gray-800">{ivr.name}</p>
          <p className="text-xs text-gray-400">IVR {ivr.number} &middot; {deptName}</p>
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t">
          {loading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
          ) : detail ? (
            <>
              <PromptSlot label="Main Greeting" promptType="main" filename={detail.promptFilename} onRecord={setRecordingSlot} onUpload={handleUploadClick} />
              <PromptSlot label="After Hours" promptType="offHours" filename={detail.outOfOfficeRoute.prompt} onRecord={setRecordingSlot} onUpload={handleUploadClick} />
              <PromptSlot label="Holidays" promptType="holidays" filename={detail.holidaysRoute.prompt} onRecord={setRecordingSlot} onUpload={handleUploadClick} />
              <PromptSlot label="Break" promptType="break" filename={detail.breakRoute.prompt} onRecord={setRecordingSlot} onUpload={handleUploadClick} />
              <DtmfMenu forwards={detail.forwards} />
            </>
          ) : null}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".wav" className="hidden" onChange={handleFileSelected} />

      {recordingSlot && detail && (
        <RecordSheet
          ivrId={ivr.id}
          ivrNumber={ivr.number}
          promptType={recordingSlot}
          onComplete={() => { setRecordingSlot(null); refresh(); }}
          onClose={() => setRecordingSlot(null)}
        />
      )}
    </div>
  );
}
