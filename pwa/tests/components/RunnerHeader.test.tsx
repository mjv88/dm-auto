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

  it('renders extension number and PBX name', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByText('Ext. 101 · Kunde GmbH')).toBeInTheDocument();
  });

  it('renders avatar with correct initials for full name', () => {
    render(<RunnerHeader {...defaultProps} />);
    expect(screen.getByText('MK')).toBeInTheDocument();
  });

  it('renders single initial for single-word name', () => {
    render(<RunnerHeader {...defaultProps} displayName="Maria" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('renders initials from first and last word of multi-part name', () => {
    render(<RunnerHeader {...defaultProps} displayName="Maria Anna Klein" />);
    expect(screen.getByText('MK')).toBeInTheDocument();
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
