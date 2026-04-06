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
      className="bg-white border-b border-gray-100"
    >
      {/* Logo */}
      <div className="flex justify-center pt-4 pb-2">
        <Image src="/icons/logo.png" alt="Runner Hub" width={64} height={64} priority />
      </div>

      {/* Profile row */}
      <div className="flex items-center gap-3 px-4 pb-4">
        {/* Extension number in circle */}
        <div
          className="flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-full bg-brand-blue text-white text-sm font-bold select-none"
        >
          {extensionNumber}
        </div>

        {/* Display name */}
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-brand-text leading-tight truncate">
            {displayName}
          </p>
        </div>
      </div>
    </header>
  );
}
