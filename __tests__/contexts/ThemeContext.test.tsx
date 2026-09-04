import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';

function TestConsumer() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setPreference('dark')}>set-dark</button>
      <button onClick={() => setPreference('light')}>set-light</button>
      <button onClick={() => setPreference('system')}>set-system</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('defaults to system preference with no stored value', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId('preference').textContent).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('setting dark sets the data-theme attribute and persists it', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => screen.getByText('set-dark').click());
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('mediward_theme_preference')).toBe('dark');
  });

  it('setting light sets data-theme to light explicitly', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => screen.getByText('set-light').click());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('returning to system removes the data-theme attribute', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => screen.getByText('set-dark').click());
    act(() => screen.getByText('set-system').click());
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('reads a previously stored preference on mount', () => {
    localStorage.setItem('mediward_theme_preference', 'dark');
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('throws when useTheme is called outside a ThemeProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useTheme must be used within a ThemeProvider');
    consoleError.mockRestore();
  });
});
