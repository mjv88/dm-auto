'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';

const BASE_LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/pbx', label: 'PBX' },
  { href: '/admin/runners', label: 'Runners' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/settings', label: 'Settings' },
];

const SUPER_ADMIN_LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin/companies', label: 'Companies' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const role = useRunnerStore((s) => s.role);

  const links = role === 'super_admin'
    ? [...SUPER_ADMIN_LINKS, ...BASE_LINKS]
    : BASE_LINKS;

  return (
    <nav className="bg-white border-b">
      <div className="max-w-5xl mx-auto flex overflow-x-auto">
        {links.map(({ href, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
