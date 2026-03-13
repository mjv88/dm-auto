import { Spinner } from './ui/Spinner';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <main
      role="main"
      aria-busy="true"
      aria-live="polite"
      aria-label="Wird geladen"
      className="flex flex-col items-center justify-center min-h-screen bg-white gap-6"
    >
      {/* Logo / wordmark */}
      <div className="flex flex-col items-center gap-1 select-none">
        <span className="text-2xl font-bold text-brand-blue tracking-tight">Runner Hub</span>
        <span className="text-xs text-brand-secondary">3CX Department Switcher</span>
      </div>

      <Spinner size="lg" label="Wird geladen…" />

      {message && (
        <p className="text-sm text-brand-secondary">{message}</p>
      )}
    </main>
  );
}
