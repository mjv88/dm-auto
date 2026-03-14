'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const authStatus = useRunnerStore((s) => s.authStatus);
  const isAdmin = useRunnerStore((s) => s.isAdmin);
  const reset = useRunnerStore((s) => s.reset);

  // Don't show on auth pages
  if (authStatus !== 'authenticated') return null;
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password') || pathname.startsWith('/verify-email') || pathname.startsWith('/callback')) return null;

  function handleLogout() {
    reset();
    router.push('/login');
  }

  const tabs = [
    { href: '/departments', label: 'Home', icon: HomeIcon, show: true, exact: true },
    { href: '/admin', label: 'Admin', icon: AdminIcon, show: isAdmin, exact: false },
    { href: '/setup', label: 'Setup', icon: SetupIcon, show: isAdmin, exact: false },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {visibleTabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.icon active={active} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogoutIcon />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}

// Simple SVG icons (24x24, stroke-based)
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function AdminIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function SetupIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
