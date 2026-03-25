'use client';

import { useRef, useState } from 'react';
import { getPromptAudioUrl } from '@/lib/ivrApi';
import type { PromptType } from '@/types/ivr';

interface PromptSlotProps {
  label: string;
  promptType: PromptType;
  filename: string | null;
  onRecord: (promptType: PromptType) => void;
  onUpload: (promptType: PromptType) => void;
}

export default function PromptSlot({ label, promptType, filename, onRecord, onUpload }: PromptSlotProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (!filename || !audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 truncate">{filename ?? 'No prompt set'}</p>
      </div>
      <div className="flex gap-1 ml-2 shrink-0">
        {filename && (
          <>
            <audio
              ref={audioRef}
              src={getPromptAudioUrl(filename)}
              onEnded={() => setPlaying(false)}
              preload="none"
            />
            <button
              onClick={handlePlay}
              className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
              title={playing ? 'Stop' : 'Play'}
            >
              {playing ? '\u23F9' : '\u25B6'}
            </button>
          </>
        )}
        <button
          onClick={() => onRecord(promptType)}
          className="px-2 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 text-blue-600"
          title="Record new"
        >
          Record
        </button>
        <button
          onClick={() => onUpload(promptType)}
          className="px-2 py-1 text-xs rounded bg-gray-50 hover:bg-gray-100 text-gray-600"
          title="Upload file"
        >
          Upload
        </button>
      </div>
    </div>
  );
}
