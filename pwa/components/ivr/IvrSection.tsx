'use client';

import { useEffect, useState } from 'react';
import { useIvrAccess } from '@/lib/store';
import { getIvrs } from '@/lib/ivrApi';
import type { IvrSummary } from '@/types/ivr';
import IvrCard from './IvrCard';

export default function IvrSection() {
  const ivrAccess = useIvrAccess();
  const [ivrs, setIvrs] = useState<IvrSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ivrAccess) {
      setLoading(false);
      return;
    }
    getIvrs()
      .then(setIvrs)
      .catch((err) => console.error('Failed to load IVRs:', err))
      .finally(() => setLoading(false));
  }, [ivrAccess]);

  if (!ivrAccess) return null;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Your IVRs</h2>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-4">Loading IVRs...</p>
      ) : ivrs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No IVRs assigned to your departments</p>
      ) : (
        ivrs.map((ivr) => <IvrCard key={ivr.id} ivr={ivr} />)
      )}
    </div>
  );
}
