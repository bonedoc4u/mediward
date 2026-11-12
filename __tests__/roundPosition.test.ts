import { describe, it, expect } from 'vitest';
import { resolveRoundPosition, isHorizontalSwipe, SWIPE_MIN_DISTANCE } from '../utils/roundPosition';

const list = (...ids: string[]) => ids.map(ipNo => ({ ipNo }));

describe('resolveRoundPosition — Round Mode stays on the patient, not the position', () => {
  it('starts at the first patient', () => {
    expect(resolveRoundPosition(list('A', 'B', 'C'), null, 0)).toEqual({ index: 0, ipNo: 'A', lost: false });
  });

  it('resumes at a saved position when no patient is remembered yet', () => {
    expect(resolveRoundPosition(list('A', 'B', 'C'), null, 2)).toEqual({ index: 2, ipNo: 'C', lost: false });
  });

  // The bug: a colleague admits a patient who sorts earlier in the list.
  // Position 1 used to become a different patient while the doctor typed.
  it('follows the same patient when someone is admitted before them', () => {
    expect(resolveRoundPosition(list('NEW', 'A', 'B', 'C'), 'B', 1)).toEqual({ index: 2, ipNo: 'B', lost: false });
  });

  it('follows the same patient when someone before them is discharged', () => {
    expect(resolveRoundPosition(list('B', 'C'), 'B', 1)).toEqual({ index: 0, ipNo: 'B', lost: false });
  });

  it('follows the same patient when the list is re-ordered (bed move)', () => {
    expect(resolveRoundPosition(list('C', 'A', 'B'), 'B', 1)).toEqual({ index: 2, ipNo: 'B', lost: false });
  });

  it('when the patient has left the list, shows whoever is now at that position and says so', () => {
    expect(resolveRoundPosition(list('A', 'C'), 'B', 1)).toEqual({ index: 1, ipNo: 'C', lost: true });
  });

  it('when the last patient has left, falls back to the new last patient', () => {
    expect(resolveRoundPosition(list('A', 'B'), 'C', 2)).toEqual({ index: 1, ipNo: 'B', lost: true });
  });

  it('handles an empty list', () => {
    expect(resolveRoundPosition([], null, 0)).toEqual({ index: 0, ipNo: null, lost: false });
    expect(resolveRoundPosition([], 'B', 3)).toEqual({ index: 0, ipNo: null, lost: true });
  });

  it('survives a corrupt saved position', () => {
    expect(resolveRoundPosition(list('A', 'B'), null, NaN).index).toBe(0);
    expect(resolveRoundPosition(list('A', 'B'), null, -4).index).toBe(0);
    expect(resolveRoundPosition(list('A', 'B'), null, 99).index).toBe(1);
  });
});

describe('isHorizontalSwipe — only a deliberate sideways swipe changes the patient', () => {
  it('accepts a long, flat swipe in either direction', () => {
    expect(isHorizontalSwipe(120, 10)).toBe(true);
    expect(isHorizontalSwipe(-120, -10)).toBe(true);
  });

  // The bug: any 50px of sideways drift changed the patient, even mid-scroll.
  it('rejects a vertical scroll that drifts sideways', () => {
    expect(isHorizontalSwipe(60, 300)).toBe(false);
    expect(isHorizontalSwipe(90, 200)).toBe(false);
  });

  it('rejects a diagonal movement', () => {
    expect(isHorizontalSwipe(100, 80)).toBe(false);
  });

  it('rejects a short sideways nudge', () => {
    expect(isHorizontalSwipe(SWIPE_MIN_DISTANCE - 1, 0)).toBe(false);
    expect(isHorizontalSwipe(SWIPE_MIN_DISTANCE, 0)).toBe(true);
  });
});
