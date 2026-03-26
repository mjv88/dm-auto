'use client';

export default function MigrationPage() {
  return (
    <div className="w-full h-[calc(100vh-120px)]">
      <iframe
        src="/migration-dashboard.html"
        className="w-full h-full border-0"
        title="3CX Migration Plan"
      />
    </div>
  );
}
