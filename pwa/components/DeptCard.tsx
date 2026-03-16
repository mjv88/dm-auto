'use client';

import { clsx } from 'clsx';
import type { Dept } from '@/types/auth';

interface DeptCardProps {
  dept: Dept;
  isCurrent?: boolean;
  isLoading?: boolean;
  isConfirming?: boolean;
  onSelect?: (dept: Dept) => void;
  onConfirmSwitch?: (dept: Dept) => void;
  onCancel?: () => void;
}

export default function DeptCard({ dept, isCurrent = false, isLoading = false, isConfirming = false, onSelect, onConfirmSwitch, onCancel }: DeptCardProps) {
  function handleRowClick() {
    if (!isCurrent && !isConfirming) {
      onSelect?.(dept);
    }
  }

  function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    onConfirmSwitch?.(dept);
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    onCancel?.();
  }

  return (
    <div
      role="button"
      tabIndex={isCurrent ? undefined : 0}
      onClick={!isCurrent && !isConfirming ? handleRowClick : undefined}
      onKeyDown={!isCurrent && !isConfirming ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(); } : undefined}
      className={clsx(
        'w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white transition-all',
        isCurrent
          ? 'border-2 border-green-400 shadow-sm'
          : 'border border-gray-200 shadow-sm hover:shadow-md cursor-pointer',
      )}
    >
      {/* Department name */}
      <span
        className={clsx(
          'text-sm font-medium truncate flex-1',
          isCurrent ? 'text-gray-900' : 'text-gray-700'
        )}
      >
        {dept.name}
      </span>

      {/* Right side: Assigned / Change / Confirm */}
      {isCurrent ? (
        <span className="ml-3 text-sm font-semibold text-green-600 whitespace-nowrap">
          Assigned
        </span>
      ) : isConfirming ? (
        <div className="ml-3 flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <span className="text-xs text-blue-600 font-medium">Switching...</span>
          ) : (
            <>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-3 py-1 text-xs font-medium text-white rounded-md"
                style={{ backgroundColor: '#0078D4' }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="ml-3 text-sm font-medium text-blue-600 whitespace-nowrap">
          Change
        </span>
      )}
    </div>
  );
}
