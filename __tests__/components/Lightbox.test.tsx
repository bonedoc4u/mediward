import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Investigation } from '../../types';

const mockSignedUrl = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => mockSignedUrl.value,
}));

import Lightbox from '../../components/radiology/Lightbox';

const makeInv = (overrides: Partial<Investigation> = {}): Investigation => ({
  id: 'inv1', date: '2026-07-01', type: 'X-Ray', findings: '', imageUrl: 'hospital-1/IP001/abc.jpg',
  ...overrides,
});

describe('Lightbox', () => {
  it('shows the loading spinner for an image whose signed URL has not resolved yet', () => {
    mockSignedUrl.value = undefined;
    render(<Lightbox inv={makeInv()} onClose={vi.fn()} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the image once its signed URL resolves', () => {
    mockSignedUrl.value = 'https://signed.example/abc.jpg';
    render(<Lightbox inv={makeInv()} onClose={vi.fn()} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/abc.jpg');
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('shows the PDF\'s identity immediately, without the image spinner, even before the signed URL resolves', () => {
    mockSignedUrl.value = undefined;
    render(<Lightbox inv={makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })} onClose={vi.fn()} />);
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.getByText('Preparing link…')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a working "Open PDF" link once the signed URL resolves', () => {
    mockSignedUrl.value = 'https://signed.example/culture.pdf';
    render(<Lightbox inv={makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /open pdf in new tab/i })).toHaveAttribute('href', 'https://signed.example/culture.pdf');
  });
});
