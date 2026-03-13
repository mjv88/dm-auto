import { render, screen } from '@testing-library/react';
import { Spinner } from '@/components/ui/Spinner';

describe('Spinner', () => {
  it('renders with role="status"', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has default aria-label', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Laden…')).toBeInTheDocument();
  });

  it('uses custom label', () => {
    render(<Spinner label="Loading data…" />);
    expect(screen.getByLabelText('Loading data…')).toBeInTheDocument();
  });

  it('renders sm size', () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole('status')).toHaveClass('h-4', 'w-4');
  });

  it('renders md size by default', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('h-6', 'w-6');
  });

  it('renders lg size', () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole('status')).toHaveClass('h-10', 'w-10');
  });

  it('applies animate-spin class', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('animate-spin');
  });
});
