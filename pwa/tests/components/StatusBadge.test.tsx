import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders "Aktuell in: Sales" text', () => {
    render(<StatusBadge deptName="Sales" />);
    expect(screen.getByText('Aktuell in: Sales')).toBeInTheDocument();
  });

  it('renders with active variant by default', () => {
    render(<StatusBadge deptName="Support" />);
    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
  });

  it('has role="status" for screen readers', () => {
    render(<StatusBadge deptName="Reception" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    render(<StatusBadge deptName="Sales" />);
    expect(screen.getByLabelText('Aktuell in: Sales')).toBeInTheDocument();
  });

  it('renders switching variant', () => {
    render(<StatusBadge deptName="Support" variant="switching" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders error variant', () => {
    render(<StatusBadge deptName="Sales" variant="error" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders department name correctly', () => {
    render(<StatusBadge deptName="Reception" />);
    expect(screen.getByText('Aktuell in: Reception')).toBeInTheDocument();
  });
});
