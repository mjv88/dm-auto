'use client';

interface AuditEntry {
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  device_id?: string;
}

interface AuditRowDetailProps {
  entry: AuditEntry;
}

export default function AuditRowDetail({ entry }: AuditRowDetailProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      {entry.error_message && (
        <div className="sm:col-span-2">
          <span className="font-medium text-gray-500">Error: </span>
          <span className="text-red-600">{entry.error_message}</span>
        </div>
      )}
      {entry.ip_address && (
        <div>
          <span className="font-medium text-gray-500">IP: </span>
          <span className="text-gray-700">{entry.ip_address}</span>
        </div>
      )}
      {entry.user_agent && (
        <div>
          <span className="font-medium text-gray-500">User Agent: </span>
          <span className="text-gray-700 break-all">{entry.user_agent}</span>
        </div>
      )}
      {entry.device_id && (
        <div>
          <span className="font-medium text-gray-500">Device ID: </span>
          <span className="text-gray-700">{entry.device_id}</span>
        </div>
      )}
      {!entry.error_message && !entry.ip_address && !entry.user_agent && !entry.device_id && (
        <div className="text-gray-400">No additional details available.</div>
      )}
    </div>
  );
}
