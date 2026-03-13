'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import CsvImporter from '@/components/admin/CsvImporter';

export default function PbxImportPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">CSV Import</h2>
        <Link href="/admin/pbx" className="text-sm text-blue-600 hover:underline">
          &larr; Back to PBX
        </Link>
      </div>
      <CsvImporter />
    </div>
  );
}
