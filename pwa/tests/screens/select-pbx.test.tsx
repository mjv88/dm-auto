import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SelectPBXPage from '@/app/select-pbx/page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../lib/api', () => ({
  getDepartments: jest.fn(),
}));

// ── Store mock ─────────────────────────────────────────────────────────────────

import type { PBXOption } from '@/types/auth';

const PBX_A: PBXOption = { pbxFqdn: 'kunde-gmbh.3cx.eu', pbxName: 'Kunde GmbH' };
const PBX_B: PBXOption = { pbxFqdn: 'andere-ag.3cx.eu', pbxName: 'Andere AG' };

const mockSetSelectedPbxFqdn = jest.fn();
const mockSetAllowedDepts = jest.fn();

const baseStore = {
  pbxOptions: [PBX_A, PBX_B],
  runnerProfile: {
    id: 'r1',
    name: 'Maria K.',
    email: 'maria@test.com',
    extension: '101',
    pbxFqdn: null,
    allowedDepts: [],
    currentDept: null,
  },
  setSelectedPbxFqdn: mockSetSelectedPbxFqdn,
  setAllowedDepts: mockSetAllowedDepts,
};

jest.mock('@/lib/store', () => ({
  useRunnerStore: (selector: (s: typeof baseStore) => unknown) => selector(baseStore),
}));

import { getDepartments } from '../../lib/api';
const mockGetDepartments = getDepartments as jest.MockedFunction<typeof getDepartments>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<SelectPBXPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SelectPBXPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all PBX options', () => {
    renderPage();
    expect(screen.getByText('Kunde GmbH')).toBeInTheDocument();
    expect(screen.getByText('Andere AG')).toBeInTheDocument();
  });

  it('renders PBX fqdn as secondary text', () => {
    renderPage();
    expect(screen.getByText('kunde-gmbh.3cx.eu')).toBeInTheDocument();
    expect(screen.getByText('andere-ag.3cx.eu')).toBeInTheDocument();
  });

  it('tap sets store.selectedPbxFqdn and navigates to /departments', async () => {
    mockGetDepartments.mockResolvedValue([]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Select Kunde GmbH/i }));

    await waitFor(() => {
      expect(mockSetSelectedPbxFqdn).toHaveBeenCalledWith('kunde-gmbh.3cx.eu');
      expect(mockPush).toHaveBeenCalledWith('/departments');
    });
  });

  it('tap calls getDepartments with the selected fqdn', async () => {
    mockGetDepartments.mockResolvedValue([]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Select Andere AG/i }));

    await waitFor(() => {
      expect(mockGetDepartments).toHaveBeenCalledWith('andere-ag.3cx.eu');
    });
  });

  it('updates store with fetched departments', async () => {
    const depts = [{ id: 1, name: 'Sales', groupId: 10 }];
    mockGetDepartments.mockResolvedValue(depts);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Select Kunde GmbH/i }));

    await waitFor(() => {
      expect(mockSetAllowedDepts).toHaveBeenCalledWith(depts);
    });
  });

  it('still navigates even if getDepartments throws', async () => {
    mockGetDepartments.mockRejectedValue(new Error('network error'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Select Kunde GmbH/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/departments');
    });
  });

  it('no back button is shown', () => {
    renderPage();
    const backBtn = screen.queryByRole('button', { name: /back|zurück/i });
    expect(backBtn).not.toBeInTheDocument();
  });
});
