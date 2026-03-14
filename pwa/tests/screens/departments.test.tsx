import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import DepartmentsPage from '@/app/departments/page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../lib/api', () => ({
  getDepartments: jest.fn(),
  switchDepartment: jest.fn(),
}));

// Radix Dialog needs pointer events in jsdom
beforeAll(() => {
  // @ts-expect-error jsdom limitation
  window.PointerEvent = MouseEvent;
  Object.defineProperty(document, 'hasPointerCapture', { value: () => false });
});

// ── Store mock ─────────────────────────────────────────────────────────────────

const SALES: import('@/types/auth').Dept = { id: 1, name: 'Sales', groupId: 10 };
const SUPPORT: import('@/types/auth').Dept = { id: 2, name: 'Support', groupId: 20 };
const RECEPTION: import('@/types/auth').Dept = { id: 3, name: 'Reception', groupId: 30 };

const mockSetCurrentDept = jest.fn();
const mockSetAllowedDepts = jest.fn();

const baseStore = {
  allowedDepts: [SALES, SUPPORT, RECEPTION],
  currentDept: SALES,
  runnerProfile: {
    id: 'r1',
    name: 'Maria K.',
    email: 'maria@test.com',
    extension: '101',
    pbxFqdn: 'test.pbx.com',
    allowedDepts: [SALES, SUPPORT, RECEPTION],
    currentDept: SALES,
  },
  selectedPbxFqdn: 'test.pbx.com',
  setCurrentDept: mockSetCurrentDept,
  setAllowedDepts: mockSetAllowedDepts,
};

jest.mock('@/lib/store', () => ({
  useAllowedDepts: () => baseStore.allowedDepts,
  useCurrentDept: () => baseStore.currentDept,
  useRunnerProfile: () => baseStore.runnerProfile,
  useRunnerStore: (selector: (s: typeof baseStore) => unknown) => selector(baseStore),
}));

// ── Import API mocks after jest.mock calls ────────────────────────────────────

import { switchDepartment, getDepartments } from '../../lib/api';

const mockSwitchDepartment = switchDepartment as jest.MockedFunction<typeof switchDepartment>;
const mockGetDepartments = getDepartments as jest.MockedFunction<typeof getDepartments>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<DepartmentsPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DepartmentsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with 3 allowed depts', () => {
    renderPage();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Reception')).toBeInTheDocument();
  });

  it('current dept card is disabled', () => {
    renderPage();
    const salesBtn = screen.getByRole('button', { name: /Sales – aktuell/i });
    expect(salesBtn).toBeDisabled();
  });

  it('non-current dept cards are enabled', () => {
    renderPage();
    const supportBtn = screen.getByRole('button', { name: /Zu Support wechseln/i });
    const receptionBtn = screen.getByRole('button', { name: /Zu Reception wechseln/i });
    expect(supportBtn).not.toBeDisabled();
    expect(receptionBtn).not.toBeDisabled();
  });

  it('tapping a dept card opens ConfirmSheet', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Support')).toBeInTheDocument();
  });

  it('confirm calls switchDepartment with correct args', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Zu Support wechseln/i }));

    await waitFor(() => {
      expect(mockSwitchDepartment).toHaveBeenCalledWith('test.pbx.com', 20);
    });
  });

  it('success shows toast with dept name', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Zu Support wechseln/i }));

    await waitFor(() => {
      expect(screen.getByText(/Switched to Support/i)).toBeInTheDocument();
    });
  });

  it('success updates store with new current dept', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Zu Support wechseln/i }));

    await waitFor(() => {
      expect(mockSetCurrentDept).toHaveBeenCalledWith(SUPPORT);
    });
  });

  it('API failure navigates to error screen', async () => {
    const appErr = new Error('PBX_UNAVAILABLE');
    (appErr as unknown as { code: string }).code = 'PBX_UNAVAILABLE';
    mockSwitchDepartment.mockRejectedValue(appErr);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Zu Support wechseln/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/error?code=PBX_UNAVAILABLE');
    });
  });

  it('cancel closes ConfirmSheet', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Zu Support wechseln/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Abbrechen'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refresh button calls getDepartments', async () => {
    mockGetDepartments.mockResolvedValue([]);
    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('refresh-btn'));
    });

    expect(mockGetDepartments).toHaveBeenCalledWith('test.pbx.com');
  });
});
