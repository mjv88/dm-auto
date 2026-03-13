import { clsx } from 'clsx';

interface RunnerHeaderProps {
  displayName?: string;
  extensionNumber?: string;
  pbxName?: string;
  pbxFqdn?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function RunnerHeader({ displayName = 'Runner', extensionNumber = '--', pbxName = '--', pbxFqdn }: RunnerHeaderProps) {
  const initials = getInitials(displayName);

  return (
    <header
      aria-label="Runner-Profil"
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 max-h-[72px]"
    >
      {/* Avatar */}
      <div
        aria-hidden="true"
        className={clsx(
          'flex-shrink-0 flex items-center justify-center',
          'h-10 w-10 rounded-full bg-brand-blue text-white text-sm font-semibold select-none'
        )}
      >
        {initials}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brand-text leading-tight truncate">
          {displayName}
        </p>
        <p
          className="text-xs text-brand-secondary leading-tight truncate"
          title={pbxFqdn}
        >
          Ext. {extensionNumber} · {pbxName}
        </p>
      </div>
    </header>
  );
}
