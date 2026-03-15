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

export default function RunnerHeader({ displayName = 'Runner', extensionNumber = '--' }: RunnerHeaderProps) {
  const initials = getInitials(displayName);

  return (
    <header
      aria-label="Runner-Profil"
      className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100"
    >
      {/* Avatar */}
      <div
        aria-hidden="true"
        className={clsx(
          'flex-shrink-0 flex items-center justify-center',
          'h-11 w-11 rounded-full bg-brand-blue text-white text-sm font-semibold select-none'
        )}
      >
        {initials}
      </div>

      {/* Name + extension badge */}
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-brand-text leading-tight truncate">
          {displayName}
        </p>
        <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-500 font-mono">
          Ext. {extensionNumber}
        </span>
      </div>
    </header>
  );
}
