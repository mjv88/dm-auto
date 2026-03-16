'use client';

import { Fragment, useState } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  actions?: (row: T) => React.ReactNode;
  expandedRow?: (row: T) => React.ReactNode;
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  page,
  totalPages,
  onPageChange,
  actions,
  expandedRow,
}: DataTableProps<T>) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {expandedRow && <th className="px-4 py-3 w-8" />}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  {col.header}
                </th>
              ))}
              {actions && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const key = rowKey(row);
              const isExpanded = expandedKeys.has(key);
              return (
                <Fragment key={key}>
                  <tr className="border-b hover:bg-gray-50 transition-colors">
                    {expandedRow && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(key)}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? '\u25BC' : '\u25B6'}
                        </button>
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-gray-700">
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                    {actions && <td className="px-4 py-3 text-right">{actions(row)}</td>}
                  </tr>
                  {isExpanded && expandedRow && (
                    <tr className="bg-gray-50">
                      <td colSpan={columns.length + (actions ? 1 : 0) + 1} className="px-6 py-4">
                        {expandedRow(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (expandedRow ? 1 : 0) + (actions ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {page !== undefined && totalPages !== undefined && onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="text-sm text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="text-sm text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
