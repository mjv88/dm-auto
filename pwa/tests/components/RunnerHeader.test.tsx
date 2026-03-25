import { render, screen } from '@testing-library/react';
import RunnerHeader from '@/components/RunnerHeader';

describe('RunnerHeader', () => {
  const defaultProps = {
    displayName: 'Maria Klein',
    extensionNumber: '101',
    pbxName: 'Kunde GmbH',
    pbxFqdn: 'kunde-gmbh.3cx.eu',
  };

  it('renders display name', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByText('Maria Klein')).toBeInTheDocument();
  });

  it('renders extension number in the avatar circle', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders fallback extension when none provided', () => {
    render(<RunnerHeader {...defaultProps} extensionNumber={undefined} />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders display name only (no PBX subtitle)', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByText('Maria Klein')).toBeInTheDocument();
    // PBX name is no longer rendered in the header
    expect(screen.queryByText(/Kunde GmbH/)).not.toBeInTheDocument();
  });

  it('has accessible header landmark', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('has aria-label on the header', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByLabelText('Runner-Profil')).toBeInTheDocument();
  });
});
