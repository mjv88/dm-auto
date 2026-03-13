import { render, screen, fireEvent } from '@testing-library/react';
import DeptCard from '@/components/DeptCard';
import type { Dept } from '@/types/auth';

const dept: Dept = { id: 1, name: 'Sales', groupId: 10 };

describe('DeptCard', () => {
  it('renders department name', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows "Aktuell hier" badge when isCurrent is true', () => {
    render(<DeptCard dept={dept} isCurrent />);
    expect(screen.getByText('Aktuell hier')).toBeInTheDocument();
  });

  it('does not show badge when isCurrent is false', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.queryByText('Aktuell hier')).not.toBeInTheDocument();
  });

  it('sets aria-current when isCurrent is true', () => {
    render(<DeptCard dept={dept} isCurrent />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<DeptCard dept={dept} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when isDisabled is true', () => {
    render(<DeptCard dept={dept} isDisabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(<DeptCard dept={dept} isDisabled onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has accessible aria-label describing switch action', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Zu Sales wechseln');
  });

  it('has accessible aria-label indicating current when isCurrent', () => {
    render(<DeptCard dept={dept} isCurrent />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Sales – aktuell');
  });
});
