'use client';

export const dynamic = 'force-dynamic';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore, useAllowedDepts, useCurrentDept, useRunnerProfile } from '@/lib/store';
import { getDepartments, switchDepartment } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
import RunnerHeader from '@/components/RunnerHeader';
import StatusBadge from '@/components/StatusBadge';
import DeptCard from '@/components/DeptCard';
import ConfirmSheet from '@/components/ConfirmSheet';
import SuccessToast from '@/components/SuccessToast';
import type { Dept } from '@/types/auth';

const SLOW_REQUEST_THRESHOLD_MS = 5_000;

// Memoised list item — avoids re-rendering unchanged cards when store updates
const MemoizedDeptCard = memo(DeptCard);

export default function DepartmentsPage() {
  const router = useRouter();

  const allowedDepts = useAllowedDepts();
  const currentDept = useCurrentDept();
  const runnerProfile = useRunnerProfile();
  const selectedPbxFqdn = useRunnerStore((s) => s.selectedPbxFqdn);
  const setCurrentDept = useRunnerStore((s) => s.setCurrentDept);
  const setAllowedDepts = useRunnerStore((s) => s.setAllowedDepts);

  const sessionToken = useRunnerStore((s) => s.sessionToken);

  const [pendingDept, setPendingDept] = useState<Dept | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [successDeptName, setSuccessDeptName] = useState('');
  const [isSlow, setIsSlow] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);

  const setRunnerProfile = useRunnerStore((s) => s.setRunnerProfile);
  const setSelectedPbxFqdn = useRunnerStore((s) => s.setSelectedPbxFqdn);

  // Check email verification status for email-auth users
  useEffect(() => {
    if (!sessionToken) return;
    try {
      const payload = JSON.parse(atob(sessionToken.split('.')[1]));
      if (payload.emailVerified === false) {
        setEmailVerified(false);
      }
    } catch {
      // Not a JWT or no emailVerified claim — assume verified
    }
  }, [sessionToken]);

  // Auto-fetch departments if store is empty (email/password login doesn't populate store)
  useEffect(() => {
    if (!sessionToken || allowedDepts.length > 0) return;

    try {
      const payload = JSON.parse(atob(sessionToken.split('.')[1]));
      const pbxFqdn = payload.pbxFqdn;
      const extNum = payload.extensionNumber;

      if (!pbxFqdn) return; // no PBX assigned

      // Set runner profile from JWT if not already set
      if (!runnerProfile) {
        setRunnerProfile({
          id: payload.runnerId ?? '',
          name: payload.email ?? 'Runner',
          email: payload.email ?? '',
          extension: extNum ?? '',
          pbxFqdn,
          allowedDepts: [],
          currentDept: null,
        });
      }

      // Set selected PBX
      if (!selectedPbxFqdn) {
        setSelectedPbxFqdn(pbxFqdn);
      }

      // Fetch departments from API
      getDepartments(pbxFqdn).then((depts) => {
        setAllowedDepts(depts);
        // Set current dept from the first one or find it
        if (depts.length > 0 && !currentDept) {
          // Try to get current dept from API response
          fetch(`${API_URL}/runner/departments`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          })
            .then(r => r.json())
            .then((data: { currentDeptId?: number; currentDeptName?: string }) => {
              if (data.currentDeptId) {
                const found = depts.find(d => d.id === data.currentDeptId);
                if (found) setCurrentDept(found);
              }
            })
            .catch(() => {});
        }
      }).catch(() => {});
    } catch {
      // JWT decode failed
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  const handleResend = useCallback(async () => {
    if (!sessionToken) return;
    try {
      await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
    } catch {
      // silently ignore resend errors
    }
  }, [sessionToken]);

  // Pull-to-refresh touch tracking
  const touchStartY = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show "taking longer than usual" message when an operation exceeds 5s
  useEffect(() => {
    if (isSwitching || isRefreshing) {
      slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_REQUEST_THRESHOLD_MS);
    } else {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlow(false);
    }
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [isSwitching, isRefreshing]);

  const handleRefresh = useCallback(async () => {
    if (!selectedPbxFqdn || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const depts = await getDepartments(selectedPbxFqdn);
      setAllowedDepts(depts);
    } catch {
      // silently ignore refresh errors
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedPbxFqdn, isRefreshing, setAllowedDepts]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      const scrollTop = contentRef.current?.scrollTop ?? 0;
      if (delta > 70 && scrollTop === 0) {
        handleRefresh();
      }
    },
    [handleRefresh],
  );

  async function handleConfirm() {
    if (!pendingDept || !selectedPbxFqdn) return;
    setIsSwitching(true);
    try {
      await switchDepartment(selectedPbxFqdn, pendingDept.groupId);
      setCurrentDept(pendingDept);
      setPendingDept(null);
      setSuccessDeptName(pendingDept.name);
      setShowToast(true);
    } catch (err: unknown) {
      setPendingDept(null);
      // AppError carries a typed .code; plain Errors fall back to 'UNKNOWN'.
      const code =
        err != null && typeof (err as { code?: string }).code === 'string'
          ? (err as { code: string }).code
          : 'UNKNOWN';
      router.push(`/error?code=${encodeURIComponent(code)}`);
    } finally {
      setIsSwitching(false);
    }
  }

  const otherDepts = allowedDepts.filter((d) => d.id !== currentDept?.id);
  const currentDeptName = currentDept?.name ?? '—';

  // Extension with zero allowed departments
  const hasNoDepts = allowedDepts.length === 0;
  // PBX returned departments but none differ from current (only current is in list)
  const hasNoOtherDepts = !hasNoDepts && otherDepts.length === 0;

  return (
    <>
      <div
        ref={contentRef}
        className="flex flex-col min-h-screen bg-brand-bg overflow-y-auto pb-16"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Email verification banner */}
        {!emailVerified && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            Please verify your email. Check your inbox or{' '}
            <button onClick={handleResend} className="underline font-medium">resend verification email</button>
          </div>
        )}

        {/* Header row with refresh button pinned top-right */}
        <div className="relative">
          <RunnerHeader
            displayName={runnerProfile?.name}
            extensionNumber={runnerProfile?.extension}
            pbxName={runnerProfile?.pbxFqdn ?? undefined}
            pbxFqdn={runnerProfile?.pbxFqdn ?? undefined}
          />
          <button
            type="button"
            aria-label="Abteilungen aktualisieren"
            data-testid="refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-brand-secondary hover:text-brand-blue disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg
              className={isRefreshing ? 'animate-spin' : ''}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>

        {/* Status badge */}
        <div className="px-4 pt-4 pb-2">
          <StatusBadge
            deptName={currentDeptName}
            variant={isSwitching ? 'switching' : 'active'}
          />
        </div>

        {/* Slow request warning */}
        {isSlow && (
          <p
            role="status"
            aria-live="polite"
            className="px-4 py-2 text-xs text-amber-600 text-center"
          >
            This is taking longer than usual…
          </p>
        )}

        {/* Department list */}
        <div className="px-4 pb-8 space-y-3 flex-1">
          {hasNoDepts ? (
            <p
              role="status"
              className="mt-6 text-sm text-brand-secondary text-center"
            >
              No departments available
            </p>
          ) : (
            <>
              <p className="text-xs text-brand-secondary uppercase tracking-wide font-semibold mt-2">
                Aktuell hier
              </p>

              {currentDept ? (
                <MemoizedDeptCard dept={currentDept} isCurrent isDisabled />
              ) : (
                <p className="text-sm text-brand-secondary">—</p>
              )}

              {hasNoOtherDepts ? (
                <p
                  role="status"
                  className="mt-4 text-sm text-brand-secondary text-center"
                >
                  No departments found
                </p>
              ) : (
                <>
                  <p className="text-xs text-brand-secondary uppercase tracking-wide font-semibold mt-4">
                    Wechseln zu
                  </p>
                  {otherDepts.map((dept) => (
                    <MemoizedDeptCard
                      key={dept.id}
                      dept={dept}
                      onClick={() => setPendingDept(dept)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={pendingDept !== null}
        fromDept={currentDeptName}
        toDept={pendingDept?.name ?? ''}
        onConfirm={handleConfirm}
        onCancel={() => setPendingDept(null)}
        isLoading={isSwitching}
      />

      <SuccessToast
        deptName={successDeptName}
        isVisible={showToast}
        onDismiss={() => setShowToast(false)}
      />
    </>
  );
}
