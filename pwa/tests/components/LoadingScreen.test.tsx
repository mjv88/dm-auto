import { render, screen } from '@testing-library/react';
import LoadingScreen from '@/components/LoadingScreen';

describe('LoadingScreen', () => {
  it('renders Runner Hub wordmark', () => {
    render(<LoadingScreen />);
    expect(screen.getByText('Runner Hub')).toBeInTheDocument();
  });

  it('renders a spinner', () => {
    render(<LoadingScreen />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-busy attribute', () => {
    render(<LoadingScreen />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('has aria-live for announcements', () => {
    render(<LoadingScreen />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders optional message when provided', () => {
    render(<LoadingScreen message="Authentifizierung läuft…" />);
    expect(screen.getByText('Authentifizierung läuft…')).toBeInTheDocument();
  });

  it('does not render message area when no message provided', () => {
    render(<LoadingScreen />);
    expect(screen.queryByText(/läuft/i)).not.toBeInTheDocument();
  });
});
