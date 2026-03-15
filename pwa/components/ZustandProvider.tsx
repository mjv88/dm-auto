'use client';

import { useEffect } from 'react';
import { restoreSession } from '@/lib/store';

export default function ZustandProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    restoreSession();
  }, []);

  return <>{children}</>;
}
