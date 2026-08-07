import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave   = vi.hoisted(() => vi.fn());
const mockLoad   = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
vi.mock('../../services/persistence', () => ({
  saveToStorage: mockSave,
  loadFromStorage: mockLoad,
  removeFromStorage: mockRemove,
}));

const mockCheckBiometry = vi.hoisted(() => vi.fn());
const mockAuthenticate  = vi.hoisted(() => vi.fn());
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: mockCheckBiometry,
    authenticate: mockAuthenticate,
  },
}));

import {
  isBiometricCredentialValid,
  isBiometricAvailable,
  promptBiometric,
  storeBiometricCredential,
  loadBiometricCredential,
  clearBiometricCredential,
  type BiometricCredential,
} from '../../services/biometricAuthService';

beforeEach(() => {
  mockSave.mockReset();
  mockLoad.mockReset();
  mockRemove.mockReset();
  mockCheckBiometry.mockReset();
  mockAuthenticate.mockReset();
});

describe('isBiometricCredentialValid', () => {
  it('is true for a credential that has not expired yet', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 2000 };
    expect(isBiometricCredentialValid(cred, 1000)).toBe(true);
  });

  it('is false for a credential exactly at its expiry instant', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 1000 };
    expect(isBiometricCredentialValid(cred, 1000)).toBe(false);
  });

  it('is false for an expired credential', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 1000 };
    expect(isBiometricCredentialValid(cred, 2000)).toBe(false);
  });

  it('is false for null (no credential stored)', () => {
    expect(isBiometricCredentialValid(null, 1000)).toBe(false);
  });
});

describe('storeBiometricCredential', () => {
  it('saves under the biometric_credential key with the given refreshToken/expiresAt', async () => {
    await storeBiometricCredential('my-refresh-token', 5000);
    expect(mockSave).toHaveBeenCalledWith('biometric_credential', { refreshToken: 'my-refresh-token', expiresAt: 5000 });
  });
});

describe('loadBiometricCredential', () => {
  it('returns the stored credential when present', async () => {
    mockLoad.mockReturnValue({ refreshToken: 'tok', expiresAt: 5000 });
    const result = await loadBiometricCredential();
    expect(mockLoad).toHaveBeenCalledWith('biometric_credential');
    expect(result).toEqual({ refreshToken: 'tok', expiresAt: 5000 });
  });

  it('returns null when nothing is stored', async () => {
    mockLoad.mockReturnValue(null);
    const result = await loadBiometricCredential();
    expect(result).toBeNull();
  });
});

describe('clearBiometricCredential', () => {
  it('removes the biometric_credential key', async () => {
    await clearBiometricCredential();
    expect(mockRemove).toHaveBeenCalledWith('biometric_credential');
  });
});

describe('isBiometricAvailable', () => {
  it('returns true when the platform reports biometrics available', async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: true });
    expect(await isBiometricAvailable()).toBe(true);
  });

  it('returns false when the platform reports biometrics unavailable', async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: false });
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('returns false (never throws) if checkBiometry itself throws', async () => {
    mockCheckBiometry.mockRejectedValue(new Error('platform error'));
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });
});

describe('promptBiometric', () => {
  it('returns true when authenticate resolves (successful scan)', async () => {
    mockAuthenticate.mockResolvedValue(undefined);
    expect(await promptBiometric('test reason')).toBe(true);
  });

  it('returns false (never throws) when authenticate rejects — covers both a real failure and a user cancel', async () => {
    mockAuthenticate.mockRejectedValue(new Error('user cancelled'));
    await expect(promptBiometric('test reason')).resolves.toBe(false);
  });
});
