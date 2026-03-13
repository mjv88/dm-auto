'use client';

import { useEffect } from 'react';

interface SuccessToastProps {
  deptName: string;
  isVisible: boolean;
  onDismiss: () => void;
}

export default function SuccessToast({ deptName, isVisible, onDismiss }: SuccessToastProps) {
  useEffect(() => {
    if (!isVisible) return;
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [isVisible, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="success-toast"
      className={[
        'fixed top-0 left-0 right-0 z-50 flex justify-center',
        'px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]',
        'transition-transform duration-300 ease-out',
        isVisible ? 'translate-y-0' : '-translate-y-full',
      ].join(' ')}
    >
      <div className="bg-brand-green text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 text-sm font-medium max-w-sm w-full">
        <span aria-hidden="true">✅</span>
        <span>Switched to {deptName}</span>
      </div>
    </div>
  );
}
