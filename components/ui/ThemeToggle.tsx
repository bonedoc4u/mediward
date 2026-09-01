import React from 'react';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const NEXT: Record<'light' | 'dark' | 'system', 'light' | 'dark' | 'system'> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const ICON = {
  light: Sun,
  dark: Moon,
  system: MonitorSmartphone,
};

const LABEL = {
  light: 'Light theme active — tap for dark',
  dark: 'Dark theme active — tap to follow system',
  system: 'Following system theme — tap for light',
};

export function ThemeToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];

  const className = variant === 'dark'
    ? 'p-2 hover:bg-slate-800 rounded-lg text-slate-300'
    : 'p-2 hover:bg-surface-sunken rounded-lg text-ink-muted';

  return (
    <button
      onClick={() => setPreference(NEXT[preference])}
      className={className}
      aria-label={LABEL[preference]}
      title={LABEL[preference]}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
