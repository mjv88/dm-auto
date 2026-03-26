'use client';

export default function MigrationPage() {
  return (
    <div className="-mx-4 -mt-6 w-[calc(100%+2rem)] h-[calc(100vh-110px)]">
      <iframe
        src="/migration-dashboard.html"
        className="w-full h-full border-0"
        title="3CX Migration Plan"
      />
    </div>
  );
}
