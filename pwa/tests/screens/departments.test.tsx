import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DepartmentsPage from '@/app/departments/page';

// -- Mocks --------------------------------------------------------------------

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../lib/api', () => ({
  getDepartments: jest.fn(),
  switchDepartment: jest.fn(),
}));

// -- Store mock ---------------------------------------------------------------

const SALES: import('@/types/auth').Dept = { id: 1, name: 'Sales', groupId: 10 };
const SUPPORT: import('@/types/auth').Dept = { id: 2, name: 'Support', groupId: 20 };
const RECEPTION: import('@/types/auth').Dept = { id: 3, name: 'Reception', groupId: 30 };

const mockSetCurrentDept = jest.fn();
const mockSetAllowedDepts = jest.fn();

const baseStore: Record<string, unknown> = {
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
  pbxOptions: [{ pbxFqdn: 'test.pbx.com', pbxName: 'Test PBX' }],
  sessionToken: null,
  setCurrentDept: mockSetCurrentDept,
  setAllowedDepts: mockSetAllowedDepts,
  setRunnerProfile: jest.fn(),
  setSelectedPbxFqdn: jest.fn(),
};

jest.mock('@/lib/store', () => ({
  useAllowedDepts: () => baseStore.allowedDepts,
  useCurrentDept: () => baseStore.currentDept,
  useRunnerProfile: () => baseStore.runnerProfile,
  useRunnerStore: (selector: (s: typeof baseStore) => unknown) => selector(baseStore),
}));

// -- Import API mocks after jest.mock calls -----------------------------------

import { switchDepartment, getDepartments } from '../../lib/api';

const mockSwitchDepartment = switchDepartment as jest.MockedFunction<typeof switchDepartment>;
const mockGetDepartments = getDepartments as jest.MockedFunction<typeof getDepartments>;

// -- Helpers ------------------------------------------------------------------

function renderPage() {
  return render(<DepartmentsPage />);
}

// -- Tests --------------------------------------------------------------------

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

  it('current dept card shows "Assigned" badge', () => {
    renderPage();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('non-current dept cards show "Change" label', () => {
    renderPage();
    const changeLabels = screen.getAllByText('Change');
    expect(changeLabels).toHaveLength(2); // Support + Reception
  });

  it('tapping a non-current dept card shows confirm/cancel', () => {
    renderPage();

    // Click Support "Change" row
    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);

    // Should now show Confirm and Cancel buttons
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('confirm calls switchDepartment with correct args', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    // Click Support row to enter confirming state
    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);

    // Click Confirm
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockSwitchDepartment).toHaveBeenCalledWith('test.pbx.com', 20);
    });
  });

  it('success shows toast with dept name', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText(/Switched to Support/i)).toBeInTheDocument();
    });
  });

  it('success updates store with new current dept', async () => {
    mockSwitchDepartment.mockResolvedValue(undefined);
    renderPage();

    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockSetCurrentDept).toHaveBeenCalledWith(SUPPORT);
    });
  });

  it('API failure navigates to error screen', async () => {
    const appErr = new Error('PBX_UNAVAILABLE');
    (appErr as unknown as { code: string }).code = 'PBX_UNAVAILABLE';
    mockSwitchDepartment.mockRejectedValue(appErr);
    renderPage();

    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/error?code=PBX_UNAVAILABLE');
    });
  });

  it('cancel hides confirm/cancel buttons', () => {
    renderPage();

    const supportRow = screen.getByText('Support').closest('[role="button"]')!;
    fireEvent.click(supportRow);
    expect(screen.getByText('Confirm')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
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
