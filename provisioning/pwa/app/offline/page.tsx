'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

export default function OfflinePage() {
  // Attempt to reload when network comes back online
  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      {/* Brand mark */}
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[#0078D4]">
        <span className="text-4xl font-bold text-white">R</span>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Runner Hub</h1>

      {/* Offline indicator */}
      <div className="mb-6 mt-4 flex items-center gap-2 text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        <span className="text-base">Keine Internetverbindung</span>
      </div>

      <p className="mb-8 max-w-xs text-sm text-gray-400">
        Bitte überprüfe deine Verbindung und versuche es erneut.
      </p>

      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-[#0078D4] px-6 py-3 text-sm font-medium text-white active:opacity-80"
      >
        Erneut versuchen
      </button>
    </main>
  );
}
