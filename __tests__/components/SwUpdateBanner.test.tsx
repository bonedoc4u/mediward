import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// vite-plugin-pwa's virtual module — not resolvable under vitest, and a real
// service-worker registration can't be exercised in jsdom anyway. Mocked as a
// real hook (not a plain object) so its state re-renders the component
// exactly like the real useRegisterSW does.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => {
    const [needRefresh, setNeedRefresh] = React.useState(true);
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      updateServiceWorker: vi.fn(),
    };
  },
}));

import SwUpdateBanner from '../../components/SwUpdateBanner';

describe('SwUpdateBanner dismiss behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('re-shows the update banner after the snooze period instead of staying dismissed forever', () => {
    render(<SwUpdateBanner />);
    expect(screen.getByText('New version available')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss update banner'));
    expect(screen.queryByText('New version available')).not.toBeInTheDocument();

    // A dismissal that lasts for the rest of a multi-day ward session means
    // the device is silently stuck on old code with no further reminder —
    // this is the exact gap that left an iPhone on a pre-fix build.
    act(() => { vi.advanceTimersByTime(30 * 60 * 1000); });
    expect(screen.getByText('New version available')).toBeInTheDocument();
  });
});
