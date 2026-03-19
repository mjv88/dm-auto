'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';

const BASE_LINKS = [
  { href: '/admin',          label: 'Dashboard',  exact: true },
  { href: '/admin/users',    label: 'Users' },
  { href: '/admin/pbx',      label: 'PBX' },
  { href: '/admin/runners',  label: 'Runners' },
  { href: '/admin/settings', label: 'MS-Entra' },
  { href: '/admin/audit',    label: 'Audit Log' },
];

const SUPER_ADMIN_LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/system',    label: 'System' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const role = useRunnerStore((s) => s.role);

  // Order: Dashboard | Companies* | Users | PBX | Runners | MS-Entra | Audit Log | System*
  // (* super_admin only)
  const links = role === 'super_admin'
    ? [BASE_LINKS[0], ...SUPER_ADMIN_LINKS.slice(0, 1), ...BASE_LINKS.slice(1), SUPER_ADMIN_LINKS[1]]
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
