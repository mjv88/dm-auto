'use client';

import { clsx } from 'clsx';
import type { Dept } from '@/types/auth';
import { Badge } from './ui/Badge';

interface DeptCardProps {
  dept: Dept;
  isCurrent?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
}

const MAX_NAME_LENGTH = 40;

function truncateName(name: string): string {
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH)}\u2026` : name;
}

export default function DeptCard({ dept, isCurrent = false, isDisabled = false, onClick }: DeptCardProps) {
  const displayName = truncateName(dept.name);

  return (
    <button
      type="button"
      role="button"
      aria-label={isCurrent ? `${displayName} – aktuell` : `Zu ${displayName} wechseln`}
      aria-current={isCurrent ? 'true' : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      disabled={isDisabled}
      onClick={onClick}
      className={clsx(
        'w-full text-left flex items-center justify-between px-4 min-h-[44px] rounded-card shadow-card bg-white transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2',
        isCurrent && 'border-l-4 border-brand-blue bg-gray-50',
        !isCurrent && !isDisabled && 'hover:shadow-md active:scale-[0.98] cursor-pointer',
        isDisabled && 'opacity-40 pointer-events-none cursor-default'
      )}
    >
      <span
        className={clsx(
          'text-base font-medium truncate',
          isCurrent ? 'text-brand-secondary' : 'text-brand-text'
        )}
        title={dept.name.length > MAX_NAME_LENGTH ? dept.name : undefined}
      >
        {displayName}
      </span>

      {isCurrent && (
        <Badge variant="info" aria-label="Aktuell hier">
          Aktuell hier
        </Badge>
      )}
    </button>
  );
}
