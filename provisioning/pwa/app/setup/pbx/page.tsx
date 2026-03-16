'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectPbx } from '@/lib/setupApi';

type AuthMode = 'xapi' | 'user_credentials';

export default function SetupPbxPage() {
  const router = useRouter();
  const [fqdn, setFqdn] = useState('');
  const [pbxName, setPbxName] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('xapi');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!fqdn.trim() || !pbxName.trim()) {
      setError('FQDN and PBX name are required');
      return;
    }

    setLoading(true);
    try {
      const credentials =
        authMode === 'xapi'
          ? { mode: 'xapi' as const, clientId: clientId.trim(), secret: secret.trim() }
          : { mode: 'user_credentials' as const, username: username.trim(), password: password.trim() };

      await connectPbx({
        fqdn: fqdn.trim(),
        name: pbxName.trim(),
        authMode,
        credentials,
      });
      setAuthenticated(true);
      setTimeout(() => router.push('/admin'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect PBX');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-lg p-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Connect your PBX</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your 3CX PBX details to connect.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="fqdn" className="block text-sm font-medium text-gray-700 mb-1">
            PBX FQDN
          </label>
          <input
            id="fqdn"
            type="text"
            required
            placeholder="pbx.example.com"
            value={fqdn}
            onChange={(e) => setFqdn(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="pbx-name" className="block text-sm font-medium text-gray-700 mb-1">
            PBX name
          </label>
          <input
            id="pbx-name"
            type="text"
            required
            placeholder="Main Office PBX"
            value={pbxName}
            onChange={(e) => setPbxName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="auth-mode" className="block text-sm font-medium text-gray-700 mb-1">
            Authentication mode
          </label>
          <select
            id="auth-mode"
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="xapi">xAPI (Client Credentials)</option>
            <option value="user_credentials">User Credentials</option>
          </select>
        </div>

        {authMode === 'xapi' ? (
          <>
            <div>
              <label htmlFor="client-id" className="block text-sm font-medium text-gray-700 mb-1">
                Client ID
              </label>
              <input
                id="client-id"
                type="text"
                required
                placeholder="xapi-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="secret" className="block text-sm font-medium text-gray-700 mb-1">
                Client Secret
              </label>
              <input
                id="secret"
                type="password"
                required
                placeholder="xapi-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 text-center">
            {error}
          </p>
        )}

        {authenticated && (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-green-700 font-medium">
              Successfully authenticated with PBX
            </p>
            <p className="text-xs text-gray-500">
              Fetching extensions... Redirecting to admin dashboard.
            </p>
          </div>
        )}

        {!authenticated && (
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#0078D4' }}
          >
            {loading ? 'Connecting & authenticating...' : 'Connect PBX'}
          </button>
        )}
      </form>
    </div>
  );
}
