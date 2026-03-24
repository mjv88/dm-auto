'use client';

import { useState } from 'react';
import { triggerRecording, assignPrompt } from '@/lib/ivrApi';
import type { PromptType } from '@/types/ivr';

type RecordState = 'naming' | 'calling' | 'confirming' | 'saving' | 'done' | 'error';

interface RecordSheetProps {
  ivrId: number;
  ivrNumber: string;
  promptType: PromptType;
  onComplete: () => void;
  onClose: () => void;
}

const PROMPT_LABELS: Record<PromptType, string> = {
  main: 'Main Greeting',
  offHours: 'After Hours',
  holidays: 'Holidays',
  break: 'Break',
};

export default function RecordSheet({ ivrId, ivrNumber, promptType, onComplete, onClose }: RecordSheetProps) {
  const [state, setState] = useState<RecordState>('naming');
  const [name, setName] = useState(`${ivrNumber}-${promptType}`);
  const [recordingFilename, setRecordingFilename] = useState('');
  const [error, setError] = useState('');

  const handleCall = async () => {
    try {
      setState('calling');
      const filename = await triggerRecording(ivrId, name);
      setRecordingFilename(filename);
      setState('confirming');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  const handleAssign = async () => {
    try {
      setState('saving');
      await assignPrompt(ivrId, promptType, recordingFilename);
      setState('done');
      setTimeout(onComplete, 1000);
    } catch (err) {
      // Recording might not be ready yet
      setError((err as Error).message);
      setState('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-md p-6 pb-8 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Record {PROMPT_LABELS[promptType]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {state === 'naming' && (
          <>
            <label className="block text-sm text-gray-600 mb-1">Name this recording</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
              placeholder="e.g. summer-promo"
            />
            <button
              onClick={handleCall}
              disabled={!name}
              className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              Call my phone
            </button>
          </>
        )}

        {state === 'calling' && (
          <div className="text-center py-6">
            <div className="animate-pulse text-blue-600 text-4xl mb-3">&#128222;</div>
            <p className="text-sm text-gray-600">Calling your extension...</p>
            <p className="text-xs text-gray-400 mt-1">Record your greeting and hang up when done</p>
          </div>
        )}

        {state === 'confirming' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Recording saved as <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{recordingFilename}</span>
            </p>
            <button
              onClick={handleAssign}
              className="w-full bg-green-600 text-white rounded-lg py-3 font-medium"
            >
              Save as {PROMPT_LABELS[promptType]}
            </button>
          </>
        )}

        {state === 'saving' && (
          <div className="text-center py-6">
            <div className="animate-spin text-2xl mb-2">&#8987;</div>
            <p className="text-sm text-gray-600">Assigning prompt...</p>
          </div>
        )}

        {state === 'done' && (
          <div className="text-center py-6">
            <div className="text-green-500 text-4xl mb-2">&#10003;</div>
            <p className="text-sm text-gray-600">Prompt updated!</p>
          </div>
        )}

        {state === 'error' && (
          <>
            <div className="text-center py-4">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <p className="text-xs text-gray-400">If you just recorded, wait a moment and try again.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setError(''); setState('confirming'); }} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">
                Retry
              </button>
              <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2 text-sm">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
