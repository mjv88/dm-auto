import Image from 'next/image';

interface RunnerHeaderProps {
  displayName?: string;
  extensionNumber?: string;
  pbxName?: string;
  pbxFqdn?: string;
}

export default function RunnerHeader({ displayName = 'Runner', extensionNumber = '--' }: RunnerHeaderProps) {
  return (
    <header
      aria-label="Runner-Profil"
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100"
    >
      <Image
        src="/icons/logo.png"
        alt="Runner Hub"
        width={44}
        height={44}
        className="flex-shrink-0"
        priority
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-gray-900 leading-tight truncate">
          {displayName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Ext. {extensionNumber}
        </p>
      </div>
    </header>
  );
}
