'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteRunners } from '@/lib/setupApi';

export default function SetupInvitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailsSent, setEmailsSent] = useState<number | null>(null);

  async function handleSendEmails() {
    setError('');
    setLoading(true);
    try {
      const res = await inviteRunners('email');
      setEmailsSent(res.sent ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    setError('');
    setLoading(true);
    try {
      const res = await inviteRunners('link');
      if (res.link) {
        await navigator.clipboard.writeText(res.link);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get invite link');
    } finally {
      setLoading(false);
    }
  }

  function handleFinish() {
    router.push('/admin');
  }

  return (
    <div className="rounded-2xl bg-white shadow-lg p-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Invite runners</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send invite emails to your runners or share a registration link.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleSendEmails}
          className="w-full flex items-center justify-center rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#0078D4' }}
        >
          {loading ? 'Sending...' : 'Send invite emails'}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center rounded-md border border-gray-300 px-4 py-3 min-h-[44px] text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {linkCopied ? 'Link copied!' : 'Copy registration link'}
        </button>
      </div>

      {emailsSent !== null && (
        <p className="mt-4 text-sm text-green-700 text-center">
          Sent {emailsSent} invite email(s).
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      <hr className="my-6 border-gray-200" />

      <button
        type="button"
        onClick={handleFinish}
        className="w-full flex items-center justify-center rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        Finish setup
      </button>
    </div>
  );
}
