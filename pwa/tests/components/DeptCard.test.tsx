import { render, screen, fireEvent } from '@testing-library/react';
import DeptCard from '@/components/DeptCard';
import type { Dept } from '@/types/auth';

const dept: Dept = { id: 1, name: 'Sales', groupId: 10 };

describe('DeptCard', () => {
  it('renders department name', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows "Assigned" badge when isCurrent is true', () => {
    render(<DeptCard dept={dept} isCurrent />);
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('shows "Change" label when not current and not confirming', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.getByText('Change')).toBeInTheDocument();
  });

  it('does not show "Assigned" badge when isCurrent is false', () => {
    render(<DeptCard dept={dept} />);
    expect(screen.queryByText('Assigned')).not.toBeInTheDocument();
  });

  it('current card does not have tabIndex (not clickable)', () => {
    render(<DeptCard dept={dept} isCurrent />);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('tabindex');
  });

  it('non-current card has tabIndex 0', () => {
    render(<DeptCard dept={dept} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('tabindex', '0');
  });

  it('calls onSelect when clicked (not current, not confirming)', () => {
    const onSelect = jest.fn();
    render(<DeptCard dept={dept} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(dept);
  });

  it('does not call onSelect when isCurrent', () => {
    const onSelect = jest.fn();
    render(<DeptCard dept={dept} isCurrent onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows Confirm and Cancel buttons when isConfirming', () => {
    render(<DeptCard dept={dept} isConfirming />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows "Switching..." when isConfirming and isLoading', () => {
    render(<DeptCard dept={dept} isConfirming isLoading />);
    expect(screen.getByText('Switching...')).toBeInTheDocument();
  });

  it('calls onConfirmSwitch when Confirm button is clicked', () => {
    const onConfirmSwitch = jest.fn();
    render(<DeptCard dept={dept} isConfirming onConfirmSwitch={onConfirmSwitch} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirmSwitch).toHaveBeenCalledTimes(1);
    expect(onConfirmSwitch).toHaveBeenCalledWith(dept);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<DeptCard dept={dept} isConfirming onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
