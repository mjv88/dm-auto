import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    const { container } = render(<Badge>Default</Badge>);
    expect(container.firstChild).toHaveClass('bg-gray-100');
  });

  it('applies success variant', () => {
    const { container } = render(<Badge variant="success">Done</Badge>);
    expect(container.firstChild).toHaveClass('text-brand-green');
  });

  it('applies warning variant', () => {
    const { container } = render(<Badge variant="warning">Wait</Badge>);
    expect(container.firstChild).toHaveClass('text-amber-700');
  });

  it('applies error variant', () => {
    const { container } = render(<Badge variant="error">Error</Badge>);
    expect(container.firstChild).toHaveClass('text-brand-red');
  });

  it('applies info variant', () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    expect(container.firstChild).toHaveClass('text-brand-blue');
  });

  it('is pill-shaped (rounded-full)', () => {
    const { container } = render(<Badge>Pill</Badge>);
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('accepts custom className', () => {
    const { container } = render(<Badge className="extra-class">Custom</Badge>);
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
