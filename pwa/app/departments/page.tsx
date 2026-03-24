'use client';

export const dynamic = 'force-dynamic';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore, useAllowedDepts, useCurrentDept, useRunnerProfile, useIvrAccess } from '@/lib/store';
import { getDepartments, switchDepartment } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
import RunnerHeader from '@/components/RunnerHeader';
import DeptCard from '@/components/DeptCard';
import SuccessToast from '@/components/SuccessToast';
import type { Dept } from '@/types/auth';

const SLOW_REQUEST_THRESHOLD_MS = 5_000;

export default function DepartmentsPage() {
  const router = useRouter();

  const allowedDepts = useAllowedDepts();
  const currentDept = useCurrentDept();
  const runnerProfile = useRunnerProfile();
  const selectedPbxFqdn = useRunnerStore((s) => s.selectedPbxFqdn);
  const pbxOptions = useRunnerStore((s) => s.pbxOptions);
  const setCurrentDept = useRunnerStore((s) => s.setCurrentDept);
  const setAllowedDepts = useRunnerStore((s) => s.setAllowedDepts);

  const sessionToken = useRunnerStore((s) => s.sessionToken);

  const [switchingDeptId, setSwitchingDeptId] = useState<number | null>(null);
  const [confirmingDeptId, setConfirmingDeptId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [successDeptName, setSuccessDeptName] = useState('');
  const isSwitching = switchingDeptId !== null;
  const [isSlow, setIsSlow] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);

  const setRunnerProfile = useRunnerStore((s) => s.setRunnerProfile);
  const setSelectedPbxFqdn = useRunnerStore((s) => s.setSelectedPbxFqdn);
  const setIvrAccess = useRunnerStore((s) => s.setIvrAccess);

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

    let cancelled = false;

    async function loadData() {
      try {
        const payload = JSON.parse(atob(sessionToken!.split('.')[1]));
        const pbxFqdn = payload.pbxFqdn;
        const extNum = payload.extensionNumber;

        if (!pbxFqdn) return;

        // Fetch display name from profile API
        if (!runnerProfile) {
          let displayName = payload.email ?? 'Runner';
          try {
            const profileResp = await fetch(`${API_URL}/runner/profile`, {
              credentials: 'include',
              headers: { 'Authorization': `Bearer ${sessionToken}` },
            });
            if (profileResp.ok) {
              const profile = await profileResp.json();
              displayName = profile.displayName ?? displayName;
            }
          } catch { /* fallback to email */ }

          if (!cancelled) {
            setRunnerProfile({
              id: payload.runnerId ?? '',
              name: displayName,
              email: payload.email ?? '',
              extension: extNum ?? '',
              pbxFqdn,
              allowedDepts: [],
              currentDept: null,
            });
          }
        }

        if (!selectedPbxFqdn && !cancelled) {
          setSelectedPbxFqdn(pbxFqdn);
        }

        // Fetch departments
        const deptsResp = await fetch(`${API_URL}/runner/departments`, {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${sessionToken}` },
        });
        if (deptsResp.ok && !cancelled) {
          const data = await deptsResp.json() as {
            currentDeptId?: number;
            currentDeptName?: string;
            allowedDepts?: Array<{ id: number; name: string }>;
            ivrAccess?: boolean;
          };
          const depts = (data.allowedDepts ?? []).map(d => ({ id: d.id, name: d.name, groupId: d.id }));
          setAllowedDepts(depts);
          if (data.ivrAccess !== undefined) setIvrAccess(data.ivrAccess);
          if (data.currentDeptId && !currentDept) {
            const found = depts.find(d => d.id === data.currentDeptId);
            if (found) setCurrentDept(found);
          }
        }
      } catch {
        // JWT decode or fetch failed
      }
    }

    loadData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  const handleResend = useCallback(async () => {
    if (!sessionToken) return;
    try {
      await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
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

  async function handleConfirmSwitch(dept: Dept) {
    if (!selectedPbxFqdn) return;
    setSwitchingDeptId(dept.id);
    try {
      await switchDepartment(selectedPbxFqdn, dept.groupId);
      setCurrentDept(dept);
      setSuccessDeptName(dept.name);
      setShowToast(true);
    } catch (err: unknown) {
      const code =
        err != null && typeof (err as { code?: string }).code === 'string'
          ? (err as { code: string }).code
          : 'UNKNOWN';
      router.push(`/error?code=${encodeURIComponent(code)}`);
    } finally {
      setSwitchingDeptId(null);
    }
  }

  const handleChangePbx = useCallback(() => {
    try {
      localStorage.removeItem('runner_last_pbx_fqdn');
    } catch {
      // localStorage unavailable
    }
    router.push('/select-pbx');
  }, [router]);

  const isMultiPbx = pbxOptions.length > 1;

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

        {/* Change PBX link for multi-PBX runners */}
        {isMultiPbx && (
          <div className="px-4 pt-1 pb-0">
            <button
              type="button"
              onClick={handleChangePbx}
              className="text-xs text-brand-blue hover:underline"
            >
              Change PBX
            </button>
          </div>
        )}

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
        <div className="px-4 pt-4 pb-8 space-y-2 flex-1">
          {hasNoDepts ? (
            <p
              role="status"
              className="mt-6 text-sm text-brand-secondary text-center"
            >
              No departments available
            </p>
          ) : (
            <>
              {/* Current department first */}
              {currentDept && (
                <DeptCard dept={currentDept} isCurrent />
              )}

              {/* Other departments */}
              {otherDepts.map((dept) => (
                <DeptCard
                  key={dept.id}
                  dept={dept}
                  isConfirming={confirmingDeptId === dept.id}
                  isLoading={switchingDeptId === dept.id}
                  onSelect={(d) => setConfirmingDeptId(d.id)}
                  onConfirmSwitch={(d) => { setConfirmingDeptId(null); handleConfirmSwitch(d); }}
                  onCancel={() => setConfirmingDeptId(null)}
                />
              ))}

              {hasNoOtherDepts && (
                <p className="mt-4 text-sm text-brand-secondary text-center">
                  No other departments available
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <SuccessToast
        deptName={successDeptName}
        isVisible={showToast}
        onDismiss={() => setShowToast(false)}
      />
    </>
  );
}
