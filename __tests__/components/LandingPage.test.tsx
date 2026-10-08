import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LandingPage from '../../components/LandingPage';

describe('LandingPage (public, unauthenticated marketing page)', () => {
  it('renders the hero headline, tagline, and feature grid', () => {
    render(<LandingPage onSignIn={vi.fn()} onPrivacy={vi.fn()} onTerms={vi.fn()} />);
    expect(screen.getByText(/Clinical Ward Management/i)).toBeInTheDocument();
    expect(screen.getByText('Smart. Simple. Secure.')).toBeInTheDocument();
    expect(screen.getByText('Ward Dashboard')).toBeInTheDocument();
    expect(screen.getByText('OT List Scheduling')).toBeInTheDocument();
    expect(screen.getByText('Discharge Summaries')).toBeInTheDocument();
  });

  it('renders the illustrative product preview, clearly labeled as such', () => {
    render(<LandingPage onSignIn={vi.fn()} onPrivacy={vi.fn()} onTerms={vi.fn()} />);
    // Label must make clear this is a mockup, never mistaken for a real
    // screenshot or real patient data.
    expect(screen.getByText(/illustrative preview/i)).toBeInTheDocument();
    expect(screen.getByText('Patient A')).toBeInTheDocument();
  });

  it('renders the roadmap/compliance line without overclaiming current status', () => {
    render(<LandingPage onSignIn={vi.fn()} onPrivacy={vi.fn()} onTerms={vi.fn()} />);
    expect(screen.getByText(/on the roadmap/i)).toBeInTheDocument();
  });

  it('calls onSignIn when a Sign In button is clicked', () => {
    const onSignIn = vi.fn();
    render(<LandingPage onSignIn={onSignIn} onPrivacy={vi.fn()} onTerms={vi.fn()} />);
    // Two Sign In buttons exist (top nav + hero) — either one firing the
    // callback confirms the wiring works.
    fireEvent.click(screen.getAllByText('Sign In')[0]);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('calls onPrivacy and onTerms from the footer links', () => {
    const onPrivacy = vi.fn();
    const onTerms = vi.fn();
    render(<LandingPage onSignIn={vi.fn()} onPrivacy={onPrivacy} onTerms={onTerms} />);
    fireEvent.click(screen.getByText('Privacy Policy'));
    fireEvent.click(screen.getByText('Terms of Service'));
    expect(onPrivacy).toHaveBeenCalledTimes(1);
    expect(onTerms).toHaveBeenCalledTimes(1);
  });
});
