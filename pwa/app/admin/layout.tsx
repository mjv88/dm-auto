'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRunnerStore } from '@/lib/store';
import AdminNav from '@/components/admin/AdminNav';
import CompanySwitcher from '@/components/admin/CompanySwitcher';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authStatus = useRunnerStore((s) => s.authStatus);
  const role = useRunnerStore((s) => s.role);

  useEffect(() => {
    if (authStatus === 'authenticated' && role === 'runner') {
      router.replace('/departments');
    }
  }, [authStatus, role, router]);

  if (authStatus !== 'authenticated' || role === 'runner') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Admin Console</h1>
          <div className="flex items-center gap-4">
            <CompanySwitcher />
            <Link href="/departments" className="text-sm text-blue-600 hover:underline">
              &larr; Back to Runner
            </Link>
          </div>
        </div>
      </header>
      <AdminNav />
      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">{children}</div>
    </div>
  );
}
