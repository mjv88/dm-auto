'use client';

// Zustand uses a global store and does not require a Context Provider.
// This component exists as an explicit root wrapper for future hydration
// or devtools integration without changing the component tree contract.
export default function ZustandProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
