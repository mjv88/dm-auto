import { render, screen, fireEvent } from '@testing-library/react';
import ErrorScreen from '@/components/ErrorScreen';

describe('ErrorScreen', () => {
  it('renders NOT_A_RUNNER error messages in German and English', () => {
    render(<ErrorScreen errorCode="NOT_A_RUNNER" />);
    expect(screen.getByText(/Kein Zugriff/i)).toBeInTheDocument();
    expect(screen.getByText(/Your account isn't set up as a Runner/i)).toBeInTheDocument();
  });

  it('renders PBX_UNAVAILABLE with retry button', () => {
    const onRetry = jest.fn();
    render(<ErrorScreen errorCode="PBX_UNAVAILABLE" onRetry={onRetry} />);
    expect(screen.getByText(/Telefonanlage nicht erreichbar/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Erneut versuchen/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders RATE_LIMITED without retry button', () => {
    render(<ErrorScreen errorCode="RATE_LIMITED" />);
    expect(screen.getByText(/Zu viele Wechsel/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Erneut versuchen/i })).not.toBeInTheDocument();
  });

  it('renders NOT_A_RUNNER without retry button', () => {
    render(<ErrorScreen errorCode="NOT_A_RUNNER" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders RUNNER_NOT_CONFIGURED message', () => {
    render(<ErrorScreen errorCode="RUNNER_NOT_CONFIGURED" />);
    expect(screen.getByText(/Einrichtung erforderlich/i)).toBeInTheDocument();
  });

  it('renders OFFLINE with retry button', () => {
    const onRetry = jest.fn();
    render(<ErrorScreen errorCode="OFFLINE" onRetry={onRetry} />);
    expect(screen.getByText(/Keine Verbindung/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Erneut versuchen/i })).toBeInTheDocument();
  });

  it('shows error code', () => {
    render(<ErrorScreen errorCode="RATE_LIMITED" />);
    expect(screen.getByText(/Code: RATE_LIMITED/)).toBeInTheDocument();
  });

  it('renders unknown error code gracefully', () => {
    render(<ErrorScreen errorCode="TOTALLY_UNKNOWN" />);
    expect(screen.getByText(/Unbekannter Fehler/i)).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument();
  });

  it('does not show retry button when onRetry is not provided', () => {
    render(<ErrorScreen errorCode="PBX_UNAVAILABLE" />);
    expect(screen.queryByRole('button', { name: /Erneut versuchen/i })).not.toBeInTheDocument();
  });

  it('has main landmark role', () => {
    render(<ErrorScreen errorCode="NOT_A_RUNNER" />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
