'use client';

import { useState, useMemo } from 'react';
import type { PbxExtension } from '@/lib/setupApi';

const PAGE_SIZE = 100;

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
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const exts = extensions ?? [];
    if (!search.trim()) return exts;
    const q = search.toLowerCase();
    return exts.filter(
      (ext) =>
        ext.extensionNumber.includes(q) ||
        (ext.displayName?.toLowerCase().includes(q) ?? false) ||
        (ext.email?.toLowerCase().includes(q) ?? false) ||
        (ext.currentGroupName?.toLowerCase().includes(q) ?? false),
    );
  }, [extensions, search]);

  // Reset to first page when search changes
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.extensionNumber));
  const allPageSelected = paged.length > 0 && paged.every((e) => selected.has(e.extensionNumber));

  function toggleAll() {
    const next = new Set(selected);
    if (allFilteredSelected) {
      for (const ext of filtered) next.delete(ext.extensionNumber);
    } else {
      for (const ext of filtered) next.add(ext.extensionNumber);
    }
    onSelectionChange(next);
  }

  function togglePage() {
    const next = new Set(selected);
    if (allPageSelected) {
      for (const ext of paged) next.delete(ext.extensionNumber);
    } else {
      for (const ext of paged) next.add(ext.extensionNumber);
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
      {/* Search + counts */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search name, email, ext, department..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {selected.size}/{filtered.length}
        </span>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={toggleAll}
          className="text-blue-600 hover:underline"
        >
          {allFilteredSelected ? 'Deselect all' : `Select all ${filtered.length}`}
        </button>
        {totalPages > 1 && (
          <button
            type="button"
            onClick={togglePage}
            className="text-blue-600 hover:underline"
          >
            {allPageSelected ? 'Deselect page' : 'Select page'}
          </button>
        )}
      </div>

      {/* Card list */}
      <div className="space-y-2 max-h-[28rem] overflow-y-auto">
        {paged.map((ext) => (
          <div
            key={ext.extensionNumber}
            onClick={() => toggleOne(ext.extensionNumber)}
            className={`flex items-center gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors ${
              selected.has(ext.extensionNumber)
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(ext.extensionNumber)}
              onChange={() => toggleOne(ext.extensionNumber)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-gray-900">
                  {ext.extensionNumber}
                </span>
                <span className="text-sm text-gray-700 truncate">
                  {ext.displayName ?? '-'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {ext.currentGroupName && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {ext.currentGroupName}
                  </span>
                )}
                {ext.email && (
                  <span className="text-xs text-gray-400 truncate">
                    {ext.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {paged.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            No extensions found
          </p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
