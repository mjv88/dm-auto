'use client';

import { Button } from './ui/Button';

interface ErrorInfo {
  icon: string;
  titleDe: string;
  titleEn: string;
  messageDe: string;
  messageEn: string;
  canRetry: boolean;
}

const ERROR_MAP: Record<string, ErrorInfo> = {
  NOT_A_RUNNER: {
    icon: '🚫',
    titleDe: 'Kein Zugriff',
    titleEn: 'No Access',
    messageDe: 'Ihr Konto ist nicht als Runner eingerichtet. Kontaktieren Sie die IT.',
    messageEn: "Your account isn't set up as a Runner. Contact IT.",
    canRetry: false,
  },
  RUNNER_NOT_CONFIGURED: {
    icon: '🚫',
    titleDe: 'Einrichtung erforderlich',
    titleEn: 'Setup Required',
    messageDe: 'Ihr Konto muss vom Administrator eingerichtet werden.',
    messageEn: 'Your account needs setup. Contact your administrator.',
    canRetry: false,
  },
  PBX_NOT_AUTHORIZED: {
    icon: '🚫',
    titleDe: 'Ungültiger Link',
    titleEn: 'Invalid Link',
    messageDe: 'Dieser Link entspricht nicht Ihrem Konto.',
    messageEn: "This link doesn't match your account.",
    canRetry: true,
  },
  PBX_UNAVAILABLE: {
    icon: '📡',
    titleDe: 'Telefonanlage nicht erreichbar',
    titleEn: 'Phone System Unavailable',
    messageDe: 'Ihre Telefonanlage ist gerade nicht erreichbar. Bitte versuchen Sie es erneut.',
    messageEn: "Can't reach your phone system right now. Try again.",
    canRetry: true,
  },
  SAME_DEPT: {
    icon: 'ℹ️',
    titleDe: 'Bereits in dieser Abteilung',
    titleEn: 'Already in This Department',
    messageDe: 'Sie befinden sich bereits in dieser Abteilung.',
    messageEn: "You're already in this department.",
    canRetry: false,
  },
  RATE_LIMITED: {
    icon: '⏱',
    titleDe: 'Zu viele Wechsel',
    titleEn: 'Too Many Switches',
    messageDe: 'Sie haben zu viele Abteilungswechsel durchgeführt. Bitte warten Sie eine Stunde.',
    messageEn: 'Too many switches. Try again in an hour.',
    canRetry: false,
  },
  XAPI_AUTH_FAILED: {
    icon: '🚫',
    titleDe: 'Authentifizierungsfehler',
    titleEn: 'Authentication Error',
    messageDe: 'Authentifizierungsfehler. Kontaktieren Sie Ihren Administrator.',
    messageEn: 'Authentication error. Contact admin.',
    canRetry: false,
  },
  OFFLINE: {
    icon: '📡',
    titleDe: 'Keine Verbindung',
    titleEn: 'No Connection',
    messageDe: 'Keine Internetverbindung.',
    messageEn: 'No internet connection.',
    canRetry: true,
  },
};

const UNKNOWN_ERROR: ErrorInfo = {
  icon: '❓',
  titleDe: 'Unbekannter Fehler',
  titleEn: 'Unknown Error',
  messageDe: 'Ein unerwarteter Fehler ist aufgetreten.',
  messageEn: 'An unexpected error occurred.',
  canRetry: true,
};

interface ErrorScreenProps {
  errorCode: string;
  onRetry?: () => void;
}

export default function ErrorScreen({ errorCode, onRetry }: ErrorScreenProps) {
  const info = ERROR_MAP[errorCode] ?? UNKNOWN_ERROR;
  const showRetry = info.canRetry && onRetry != null;

  return (
    <main
      role="main"
      aria-live="assertive"
      aria-atomic="true"
      className="flex flex-col items-center justify-center min-h-screen bg-brand-bg px-8 py-12 text-center"
    >
      <span aria-hidden="true" className="text-5xl mb-6 select-none">
        {info.icon}
      </span>

      <h1 className="text-xl font-bold text-brand-text mb-1">{info.titleDe}</h1>
      <p className="text-sm text-brand-secondary mb-1">{info.titleEn}</p>

      <p className="text-base text-brand-text mt-4 mb-2 max-w-xs">{info.messageDe}</p>
      <p className="text-sm text-brand-secondary max-w-xs">{info.messageEn}</p>

      <p className="text-xs text-brand-secondary/60 mt-4 font-mono">
        Code: {errorCode}
      </p>

      {showRetry && (
        <div className="mt-8 w-full max-w-xs">
          <Button variant="primary" size="full" onClick={onRetry} aria-label="Erneut versuchen">
            Erneut versuchen
          </Button>
        </div>
      )}
    </main>
  );
}
