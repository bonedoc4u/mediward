/**
 * ActionMenu — Escape must close only the menu. Inside the patient sheet it
 * used to reach Radix's Escape handler too and close the whole record.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActionMenu from '../components/ui/ActionMenu';

afterEach(cleanup);

function setup(onSelect = vi.fn()) {
  render(
    <ActionMenu label="More actions" items={[{ key: 'ref', label: 'Referral letter', onSelect }]}>
      <span>⋯</span>
    </ActionMenu>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return onSelect;
}

describe('ActionMenu', () => {
  it('opens a menu and focuses its first item', () => {
    setup();
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Referral letter');
  });

  it('runs the chosen action and closes', () => {
    const onSelect = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Referral letter' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape without letting the key reach outer handlers (e.g. a sheet)', () => {
    setup();
    const outer = vi.fn();
    document.addEventListener('keydown', outer, true);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Referral letter' }), { key: 'Escape' });
    document.removeEventListener('keydown', outer, true);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }));
  });
});
