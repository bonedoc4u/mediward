import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Investigation } from '../../types';

const mockSignedUrl = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => mockSignedUrl.value,
}));

import { InvestigationThumb } from '../../components/AdmissionList';

const makeInv = (overrides: Partial<Investigation> = {}): Investigation => ({
  id: 'inv1', date: '2026-07-01', type: 'X-Ray', findings: '', imageUrl: 'hospital-1/IP001/abc.jpg',
  ...overrides,
});

describe('InvestigationThumb', () => {
  it('shows the modality icon (not a broken image) for an image whose signed URL has not resolved yet', () => {
    mockSignedUrl.value = undefined;
    render(<InvestigationThumb inv={makeInv()} onClick={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the image once its signed URL resolves', () => {
    mockSignedUrl.value = 'https://signed.example/abc.jpg';
    render(<InvestigationThumb inv={makeInv()} onClick={vi.fn()} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/abc.jpg');
  });

  it('shows the modality icon for a PDF even before the signed URL resolves — never a broken <img>', () => {
    mockSignedUrl.value = undefined;
    render(<InvestigationThumb inv={makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })} onClick={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('still shows the modality icon for a PDF once its signed URL resolves (never renders <img> for a PDF)', () => {
    mockSignedUrl.value = 'https://signed.example/culture.pdf';
    render(<InvestigationThumb inv={makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })} onClick={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
