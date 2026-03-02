import { describe, it, expect } from 'vitest';
import { calculatePOD, getStatusColor } from '../utils/calculations';

/** Returns a YYYY-MM-DD string in local timezone (avoids UTC off-by-one in IST/non-UTC envs). */
function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('calculatePOD', () => {
  it('returns 0 when DOS is today', () => {
    const today = localDate(new Date());
    expect(calculatePOD(today)).toBe(0);
  });

  it('returns correct POD for a past date', () => {
    const threeDaysAgo = localDate(new Date(Date.now() - 3 * 86_400_000));
    expect(calculatePOD(threeDaysAgo)).toBe(3);
  });

  it('returns undefined for a future DOS (not yet operated)', () => {
    const tomorrow = localDate(new Date(Date.now() + 86_400_000));
    expect(calculatePOD(tomorrow)).toBeUndefined();
  });

  it('returns undefined when no DOS is provided', () => {
    expect(calculatePOD(undefined)).toBeUndefined();
  });
});

describe('getStatusColor', () => {
  it('returns red classes for PAC Pending', () => {
    const result = getStatusColor('PAC Pending');
    expect(result).toContain('red');
  });

  it('returns green classes for PAC Fit', () => {
    const result = getStatusColor('PAC Fit');
    expect(result).toContain('green');
  });

  it('returns orange + animate-pulse for Critical', () => {
    const result = getStatusColor('Critical');
    expect(result).toContain('orange');
    expect(result).toContain('animate-pulse');
  });

  it('returns grey/default for unknown status', () => {
    const result = getStatusColor('Unknown Status');
    expect(result).toContain('gray');
  });

  it('is case-insensitive', () => {
    expect(getStatusColor('pac fit')).toBe(getStatusColor('PAC Fit'));
  });
});
