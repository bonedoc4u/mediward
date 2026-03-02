import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AuditLogViewer from '../../components/AuditLogViewer';
import { AuthUser, AuditEntry } from '../../types';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../contexts/AppContext', () => ({
  useApp: vi.fn(),
}));

vi.mock('../../services/auditLog', () => ({
  fetchAuditLog: vi.fn().mockResolvedValue([]),
}));

import { useApp } from '../../contexts/AppContext';
import { fetchAuditLog } from '../../services/auditLog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (role: AuthUser['role']): AuthUser => ({
  id: 'u1',
  email: 'test@hospital.com',
  name: 'Test User',
  role,
  hospitalId: '00000000-0000-0000-0000-000000000001',
  sessionExpiry: Date.now() + 3_600_000,
});

const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'e1',
  timestamp: new Date().toISOString(),
  action: 'CREATE',
  userId: 'u1',
  userName: 'Dr. Smith',
  entity: 'Patient',
  entityId: 'IP001',
  details: 'Admitted new patient',
  ...overrides,
} as AuditEntry);

/** Renders the component and flushes all async state updates (React 19 compatible). */
async function renderAndSettle(jsx: React.ReactElement) {
  await act(async () => {
    render(jsx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAuditLog).mockResolvedValue([]);
});

// ─── Access Guard ─────────────────────────────────────────────────────────────

describe('AuditLogViewer – access guard', () => {
  it('renders "Access Denied" for attending role', async () => {
    vi.mocked(useApp).mockReturnValue({ user: makeUser('attending') } as any);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/Only admins can view/i)).toBeInTheDocument();
  });

  it('renders "Access Denied" for resident role', async () => {
    vi.mocked(useApp).mockReturnValue({ user: makeUser('resident') } as any);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders "Access Denied" for house_surgeon role', async () => {
    vi.mocked(useApp).mockReturnValue({ user: makeUser('house_surgeon') } as any);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders "Access Denied" when user is null (unauthenticated)', async () => {
    vi.mocked(useApp).mockReturnValue({ user: null } as any);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('shows "Access Denied" even after fetch resolves (useEffect runs before early return)', async () => {
    // React hooks always run — useEffect fires load() even for non-admin users.
    // The component still renders the access guard because the user hasn't changed.
    vi.mocked(useApp).mockReturnValue({ user: makeUser('attending') } as any);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});

// ─── Admin renders audit viewer ───────────────────────────────────────────────

describe('AuditLogViewer – admin view', () => {
  beforeEach(() => {
    vi.mocked(useApp).mockReturnValue({ user: makeUser('admin') } as any);
  });

  it('does NOT show "Access Denied" for admin', async () => {
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });

  it('shows the Refresh button', async () => {
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('calls fetchAuditLog with limit 300 on mount', async () => {
    await renderAndSettle(<AuditLogViewer />);
    expect(fetchAuditLog).toHaveBeenCalledWith(300);
  });

  it('shows empty state after loading resolves with no data', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([]);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('No audit events found')).toBeInTheDocument();
  });

  it('shows error message when fetchAuditLog throws', async () => {
    vi.mocked(fetchAuditLog).mockRejectedValue(new Error('Network error'));
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders all action filter chips', async () => {
    await renderAndSettle(<AuditLogViewer />);
    for (const label of ['ALL', 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});

// ─── Data rendering ───────────────────────────────────────────────────────────

describe('AuditLogViewer – data rendering', () => {
  beforeEach(() => {
    vi.mocked(useApp).mockReturnValue({ user: makeUser('admin') } as any);
  });

  it('renders entry details text in the table', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([makeEntry()]);
    await renderAndSettle(<AuditLogViewer />);
    // entry.details is unique — only rendered once (table + mobile list)
    expect(screen.getAllByText('Admitted new patient').length).toBeGreaterThan(0);
  });

  it('renders action badge for each entry', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([makeEntry({ action: 'DELETE' })]);
    await renderAndSettle(<AuditLogViewer />);
    // DELETE badge appears in both desktop table and mobile list
    expect(screen.getAllByText('DELETE').length).toBeGreaterThan(0);
  });

  it('shows singular "1 event" count for a single entry', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([makeEntry()]);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText('1 event')).toBeInTheDocument();
  });

  it('shows plural "N events" count for multiple entries', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2', details: 'Second action' }),
    ]);
    await renderAndSettle(<AuditLogViewer />);
    // "2 events" appears in both the header count and the stats panel — use getAllByText
    expect(screen.getAllByText('2 events').length).toBeGreaterThan(0);
  });

  it('shows the analytics stats panel when there are entries', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([makeEntry()]);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.getByText(/Last 24/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/Most Active/i)).toBeInTheDocument();
  });

  it('does not show the stats panel when there are no entries', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue([]);
    await renderAndSettle(<AuditLogViewer />);
    expect(screen.queryByText(/Total Loaded/i)).not.toBeInTheDocument();
  });
});
