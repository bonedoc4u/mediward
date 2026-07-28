import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Investigation } from '../../types';

const mockSignedUrl = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => mockSignedUrl.value,
}));

import Lightbox from '../../components/radiology/Lightbox';
import { closeActiveLightbox } from '../../hooks/useLightboxBackHandler';

const makeInv = (overrides: Partial<Investigation> = {}): Investigation => ({
  id: 'inv1', date: '2026-07-01', type: 'X-Ray', findings: '', imageUrl: 'hospital-1/IP001/abc.jpg',
  ...overrides,
});

describe('Lightbox', () => {
  it('shows the loading spinner for an image whose signed URL has not resolved yet', () => {
    mockSignedUrl.value = undefined;
    render(<Lightbox investigations={[makeInv()]} initialIndex={0} onClose={vi.fn()} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the image once its signed URL resolves', () => {
    mockSignedUrl.value = 'https://signed.example/abc.jpg';
    render(<Lightbox investigations={[makeInv()]} initialIndex={0} onClose={vi.fn()} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/abc.jpg');
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('shows the PDF\'s identity immediately, without the image spinner, even before the signed URL resolves', () => {
    mockSignedUrl.value = undefined;
    render(<Lightbox investigations={[makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })]} initialIndex={0} onClose={vi.fn()} />);
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.getByText('Preparing link…')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a working "Open PDF" link once the signed URL resolves', () => {
    mockSignedUrl.value = 'https://signed.example/culture.pdf';
    render(<Lightbox investigations={[makeInv({ imageUrl: 'hospital-1/IP001/culture.pdf' })]} initialIndex={0} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /open pdf in new tab/i })).toHaveAttribute('href', 'https://signed.example/culture.pdf');
  });

  describe('Next/Previous navigation', () => {
    const three = [
      makeInv({ id: 'inv1', type: 'X-Ray' }),
      makeInv({ id: 'inv2', type: 'CT' }),
      makeInv({ id: 'inv3', type: 'MRI' }),
    ];

    it('hides Previous and shows Next on the first of several investigations', () => {
      render(<Lightbox investigations={three} initialIndex={0} onClose={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /previous investigation/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next investigation/i })).toBeInTheDocument();
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('hides Next and shows Previous on the last of several investigations', () => {
      render(<Lightbox investigations={three} initialIndex={2} onClose={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /next investigation/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous investigation/i })).toBeInTheDocument();
      expect(screen.getByText('3/3')).toBeInTheDocument();
    });

    it('clicking Next advances to the next investigation without closing', () => {
      const onClose = vi.fn();
      render(<Lightbox investigations={three} initialIndex={0} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /next investigation/i }));
      expect(screen.getByText('2/3')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('clicking Previous goes back to the prior investigation', () => {
      render(<Lightbox investigations={three} initialIndex={2} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /previous investigation/i }));
      expect(screen.getByText('2/3')).toBeInTheDocument();
    });

    it('does not show Prev/Next buttons or a counter for a single investigation', () => {
      render(<Lightbox investigations={[makeInv()]} initialIndex={0} onClose={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /previous investigation/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next investigation/i })).not.toBeInTheDocument();
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    });
  });

  describe('hardware back-button integration', () => {
    it('registers itself while mounted so the global back handler closes it, and unregisters on unmount', () => {
      const onClose = vi.fn();
      const { unmount } = render(<Lightbox investigations={[makeInv()]} initialIndex={0} onClose={onClose} />);

      expect(closeActiveLightbox()).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);

      unmount();
      expect(closeActiveLightbox()).toBe(false);
    });
  });
});
