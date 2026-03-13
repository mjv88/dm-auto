import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmSheet from '@/components/ConfirmSheet';

// Radix Dialog uses pointer events; enable them in jsdom
beforeAll(() => {
  // @ts-expect-error jsdom limitation workaround
  window.PointerEvent = MouseEvent;
  Object.defineProperty(document, 'hasPointerCapture', { value: () => false });
});

const defaultProps = {
  open: true,
  fromDept: 'Sales',
  toDept: 'Support',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('ConfirmSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog when open is true', () => {
    render(<ConfirmSheet {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows fromDept name', () => {
    render(<ConfirmSheet {...defaultProps} />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows toDept name', () => {
    render(<ConfirmSheet {...defaultProps} />);
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('shows title', () => {
    render(<ConfirmSheet {...defaultProps} />);
    expect(screen.getByText('Abteilung wechseln?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    render(<ConfirmSheet {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(`Zu Support wechseln`));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<ConfirmSheet {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Abbrechen'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows spinner and disables buttons when isLoading is true', () => {
    render(<ConfirmSheet {...defaultProps} isLoading />);
    expect(screen.getByLabelText('Wechseln…')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not call onConfirm when loading', () => {
    render(<ConfirmSheet {...defaultProps} isLoading />);
    const confirmBtn = screen.getByLabelText('Wird gewechselt…');
    fireEvent.click(confirmBtn);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });
});
