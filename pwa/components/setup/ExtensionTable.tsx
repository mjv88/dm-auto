'use client';

import { useState, useMemo } from 'react';
import type { PbxExtension } from '@/lib/setupApi';

interface ExtensionTableProps {
  extensions: PbxExtension[];
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export default function ExtensionTable({
  extensions,
  selected,
  onSelectionChange,
}: ExtensionTableProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return extensions;
    const q = search.toLowerCase();
    return extensions.filter(
      (ext) =>
        ext.extensionNumber.includes(q) ||
        (ext.displayName?.toLowerCase().includes(q) ?? false) ||
        (ext.email?.toLowerCase().includes(q) ?? false),
    );
  }, [extensions, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.extensionNumber));

  function toggleAll() {
    const next = new Set(selected);
    if (allFilteredSelected) {
      for (const ext of filtered) next.delete(ext.extensionNumber);
    } else {
      for (const ext of filtered) next.add(ext.extensionNumber);
    }
    onSelectionChange(next);
  }

  function toggleOne(extNum: string) {
    const next = new Set(selected);
    if (next.has(extNum)) {
      next.delete(extNum);
    } else {
      next.add(extNum);
    }
    onSelectionChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search extensions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {selected.size} selected
        </span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="w-10 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Ext</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium">Name</th>
              <th className="px-3 py-2 text-left text-gray-600 font-medium hidden sm:table-cell">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((ext) => (
              <tr
                key={ext.extensionNumber}
                className={`cursor-pointer hover:bg-gray-50 ${
                  selected.has(ext.extensionNumber) ? 'bg-blue-50' : ''
                }`}
                onClick={() => toggleOne(ext.extensionNumber)}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(ext.extensionNumber)}
                    onChange={() => toggleOne(ext.extensionNumber)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-gray-900">{ext.extensionNumber}</td>
                <td className="px-3 py-2 text-gray-700">{ext.displayName ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{ext.email ?? '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  No extensions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
