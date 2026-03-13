'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { adminPost } from '@/lib/adminApi';

interface CsvRow {
  email: string;
  extension: string;
  pbx_fqdn: string;
  allowed_dept_ids?: string;
}

interface ImportResult {
  email: string;
  status: 'success' | 'error';
  message?: string;
}

export default function CsvImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data);
      },
      error: () => {
        setRows([]);
      },
    });
  }

  async function handleImport() {
    setImporting(true);
    setProgress(0);
    const importResults: ImportResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await adminPost('/admin/runners', {
          email: row.email,
          extension: row.extension,
          pbx_fqdn: row.pbx_fqdn,
          allowed_dept_ids: row.allowed_dept_ids
            ? row.allowed_dept_ids
                .split(';')
                .map((s) => parseInt(s.trim(), 10))
                .filter(Boolean)
            : [],
        });
        importResults.push({ email: row.email, status: 'success' });
      } catch (err) {
        importResults.push({
          email: row.email,
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setResults(importResults);
    setImporting(false);
  }

  function handleReset() {
    setRows([]);
    setFileName(null);
    setResults([]);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Import Runners from CSV</h2>
        <p className="text-xs text-gray-400 mb-4">
          CSV must have columns: email, extension, pbx_fqdn. Optional: allowed_dept_ids
          (semicolon-separated).
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        {fileName && rows.length > 0 && (
          <>
            <p className="text-sm text-gray-600 mt-3">
              {fileName} &mdash; {rows.length} row(s) parsed
            </p>

            {/* Preview table */}
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-left text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left text-gray-500">Extension</th>
                    <th className="px-3 py-2 text-left text-gray-500">PBX FQDN</th>
                    <th className="px-3 py-2 text-left text-gray-500">Dept IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-1.5 text-gray-700">{row.email}</td>
                      <td className="px-3 py-1.5 text-gray-700">{row.extension}</td>
                      <td className="px-3 py-1.5 text-gray-700">{row.pbx_fqdn}</td>
                      <td className="px-3 py-1.5 text-gray-700">{row.allowed_dept_ids ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <p className="text-xs text-gray-400 mt-1 px-3">
                  ... and {rows.length - 10} more rows
                </p>
              )}
            </div>

            {!importing && results.length === 0 && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleImport}
                  className="rounded-md px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: '#0078D4' }}
                >
                  Import {rows.length} runner(s)
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {/* Progress bar */}
        {importing && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: '#0078D4' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{progress}% complete</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-4 space-y-1">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Import Results</h3>
            {results.map((r, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-1.5 rounded ${
                  r.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {r.email}: {r.status === 'success' ? 'Imported' : r.message}
              </div>
            ))}
            <button
              onClick={handleReset}
              className="mt-3 rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Import another file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
