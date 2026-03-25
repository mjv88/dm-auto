'use client';

import type { IvrForward } from '@/types/ivr';

const FORWARD_LABELS: Record<string, (fwd: IvrForward) => string> = {
  RepeatPrompt: () => 'Repeat greeting',
  Extension: (f) => `Extension ${f.forwardDN}`,
  RingGroup: (f) => `Ring Group ${f.forwardDN}`,
  IVR: (f) => `Sub-menu ${f.forwardDN}`,
  Queue: (f) => `Queue ${f.forwardDN}`,
  VoiceMail: (f) => `Voicemail ${f.forwardDN}`,
  CallByName: () => 'Directory',
  CustomInput: (f) => `Audio: ${f.customData ?? ''}`,
  EndCall: () => 'End call',
};

function getLabel(fwd: IvrForward): string {
  const fn = FORWARD_LABELS[fwd.forwardType];
  return fn ? fn(fwd) : `${fwd.forwardType} ${fwd.forwardDN}`;
}

export default function DtmfMenu({ forwards }: { forwards: IvrForward[] }) {
  if (!forwards.length) return null;

  // Sort by input key
  const sorted = [...forwards].sort((a, b) => a.input.localeCompare(b.input));

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Menu</p>
      <div className="bg-gray-50 rounded-lg p-2 text-sm">
        {sorted.map((fwd) => (
          <div key={fwd.id} className="flex gap-3 py-1">
            <span className="font-mono text-gray-400 w-6 text-center">{fwd.input}</span>
            <span className="text-gray-700">{getLabel(fwd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
