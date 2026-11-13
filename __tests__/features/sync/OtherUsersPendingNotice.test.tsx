import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { enqueue, setQueueOwner, clearMainQueue } from '../../../services/syncQueue';
import OtherUsersPendingNotice from '../../../src/features/sync/OtherUsersPendingNotice';
import { otherUsersPendingMessage } from '../../../src/features/sync/otherUsersPending';

// Audit DATA-05: another user's unsent changes now stay on the phone instead
// of being sent under the wrong name. Somebody must be told they are there.
describe('otherUsersPendingMessage', () => {
  it('names the user and uses the singular for one change', () => {
    expect(otherUsersPendingMessage(1, ['Dr. A'])).toBe(
      '1 unsent change made by Dr. A is stored on this phone. It will be sent when Dr. A signs in here again.',
    );
  });
  it('uses the plural and falls back to "another user" when the name is unknown', () => {
    expect(otherUsersPendingMessage(3, [])).toBe(
      '3 unsent changes made by another user are stored on this phone. They will be sent when another user signs in here again.',
    );
  });
});

describe('<OtherUsersPendingNotice />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setQueueOwner(null);
    clearMainQueue();
  });
  afterEach(() => vi.useRealTimers());

  const show = async () => {
    render(<OtherUsersPendingNotice />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  };

  it("shows Dr. A's waiting changes to Dr. B, and stays until it is dismissed", async () => {
    setQueueOwner({ id: 'user-a', name: 'Dr. A' });
    enqueue('upsert_round', { patient_ip_no: 'TEST-0001' });
    enqueue('insert_vital', { patient_ip_no: 'TEST-0002' });
    setQueueOwner({ id: 'user-b', name: 'Dr. B' });

    await show();
    expect(screen.getByRole('status')).toHaveTextContent('2 unsent changes made by Dr. A are stored on this phone');

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });   // unlike a pop-up, it does not time out
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide this notice' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows nothing when the only unsent changes are the signed-in user\'s own', async () => {
    setQueueOwner({ id: 'user-b', name: 'Dr. B' });
    enqueue('upsert_round', { patient_ip_no: 'TEST-0001' });
    await show();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
