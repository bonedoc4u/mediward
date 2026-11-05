import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from '../../components/LoginPage';

vi.mock('../../contexts/AppContext', () => ({
  useAuth: () => ({ login: vi.fn(), loginWithBiometric: vi.fn() }),
}));

// No biometric hardware in tests: keep the fingerprint button hidden.
vi.mock('../../services/biometricAuthService', () => ({
  isBiometricAvailable: vi.fn().mockResolvedValue(false),
  loadBiometricCredential: vi.fn().mockResolvedValue(null),
  isBiometricCredentialValid: vi.fn().mockReturnValue(false),
}));

describe('LoginPage accessibility', () => {
  it('ties each visible label to its input', () => {
    render(<LoginPage />);
    // getByLabelText only succeeds when <label htmlFor> matches the input id —
    // a placeholder-only field (the previous markup) fails this query.
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('gives the show-password toggle an accessible name and state', () => {
    render(<LoginPage />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // Reachable by keyboard (was tabIndex=-1).
    expect(toggle).not.toHaveAttribute('tabindex', '-1');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('wires the footer links to their callbacks without submitting the form', () => {
    const onPrivacy = vi.fn();
    const onTerms = vi.fn();
    render(<LoginPage onPrivacy={onPrivacy} onTerms={onTerms} />);

    const privacy = screen.getByRole('button', { name: 'Privacy Policy' });
    const terms = screen.getByRole('button', { name: 'Terms of Service' });
    expect(privacy).toHaveAttribute('type', 'button');
    expect(terms).toHaveAttribute('type', 'button');

    fireEvent.click(privacy);
    fireEvent.click(terms);
    expect(onPrivacy).toHaveBeenCalledTimes(1);
    expect(onTerms).toHaveBeenCalledTimes(1);
  });
});
