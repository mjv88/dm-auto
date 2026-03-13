'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';

interface ConfirmSheetProps {
  open: boolean;
  fromDept: string;
  toDept: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmSheet({
  open,
  fromDept,
  toDept,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o && !isLoading) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] sheet-slide-up focus:outline-none"
          aria-modal="true"
          aria-describedby="confirm-sheet-desc"
        >
          {/* Handle bar */}
          <div aria-hidden="true" className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200" />

          <Dialog.Title className="text-lg font-bold text-brand-text mb-1">
            Abteilung wechseln?
          </Dialog.Title>

          <p id="confirm-sheet-desc" className="text-brand-secondary text-sm mb-6">
            Switch department?
          </p>

          {/* From → To */}
          <div className="flex items-center justify-center gap-3 mb-8 px-4 py-4 bg-brand-bg rounded-card">
            <span className="font-medium text-brand-secondary text-sm truncate">{fromDept}</span>
            <span aria-hidden="true" className="text-brand-secondary flex-shrink-0">→</span>
            <span className="font-semibold text-brand-text text-sm truncate">{toDept}</span>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="full"
              onClick={onConfirm}
              disabled={isLoading}
              aria-label={isLoading ? 'Wird gewechselt…' : `Zu ${toDept} wechseln`}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" label="Wechseln…" />
                  <span>Wird gewechselt…</span>
                </span>
              ) : (
                'Bestätigen'
              )}
            </Button>

            <Button
              variant="ghost"
              size="full"
              onClick={onCancel}
              disabled={isLoading}
              aria-label="Abbrechen"
            >
              Abbrechen
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
