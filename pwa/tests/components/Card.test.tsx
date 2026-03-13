import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies shadow-card class', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass('shadow-card');
  });

  it('applies rounded-card class', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass('rounded-card');
  });

  it('applies bg-white class', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass('bg-white');
  });

  it('accepts and merges custom className', () => {
    const { container } = render(<Card className="my-custom">content</Card>);
    expect(container.firstChild).toHaveClass('my-custom');
    expect(container.firstChild).toHaveClass('bg-white');
  });

  it('applies padding by default', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('skips padding when noPadding is set', () => {
    const { container } = render(<Card noPadding>content</Card>);
    expect(container.firstChild).not.toHaveClass('p-4');
  });
});
