'use client';

interface AuditEntry {
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

interface AuditRowDetailProps {
  entry: AuditEntry;
}

export default function AuditRowDetail({ entry }: AuditRowDetailProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      {entry.errorMessage && (
        <div className="sm:col-span-2">
          <span className="font-medium text-gray-500">Error: </span>
          <span className="text-red-600">{entry.errorMessage}</span>
        </div>
      )}
      {entry.ipAddress && (
        <div>
          <span className="font-medium text-gray-500">IP: </span>
          <span className="text-gray-700">{entry.ipAddress}</span>
        </div>
      )}
      {entry.userAgent && (
        <div>
          <span className="font-medium text-gray-500">User Agent: </span>
          <span className="text-gray-700 break-all">{entry.userAgent}</span>
        </div>
      )}
      {entry.deviceId && (
        <div>
          <span className="font-medium text-gray-500">Device ID: </span>
          <span className="text-gray-700">{entry.deviceId}</span>
        </div>
      )}
      {!entry.errorMessage && !entry.ipAddress && !entry.userAgent && !entry.deviceId && (
        <div className="text-gray-400">No additional details available.</div>
      )}
    </div>
  );
}
