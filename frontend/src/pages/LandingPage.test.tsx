import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

const renderLandingPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>);

describe('product-first landing page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('presents the real product story with one primary heading and sequential sections', () => {
    const { container } = renderLandingPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Know what to study next.');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'A plan is useful only if it survives the week.',
      'Turn one assignment into a workable plan.',
      'Move through the work day by day.',
      'Get help without giving up control.',
      'The same work, from plan to done.',
      'Make the next assignment easier to start.',
    ]);

    expect(screen.getByText('Assistant-proposed changes publish only after you approve them.')).toBeInTheDocument();
    expect(screen.getByText('Dashboard', { selector: '.product-flow strong' })).toBeInTheDocument();
    expect(screen.getByText('Timeline', { selector: '.product-flow strong' })).toBeInTheDocument();
    expect(screen.getByText('Assistant', { selector: '.product-flow strong' })).toBeInTheDocument();
    expect(screen.getByText('History', { selector: '.product-flow strong' })).toBeInTheDocument();
    expect(container.querySelectorAll('.product-visual img')).toHaveLength(5);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
  });

  it('preserves account destinations and section targets', () => {
    const { container } = renderLandingPage();

    expect(screen.getAllByRole('link', { name: /get started/i })[0]).toHaveAttribute('href', '/signup');
    expect(screen.getAllByRole('link', { name: /log in/i })[0]).toHaveAttribute('href', '/login');
    expect(container.querySelector('.product-actions a[href="/login"]')).toHaveClass('product-button-secondary');
    expect(container.querySelector('.product-nav-login')).toHaveClass('product-button-secondary');
    expect(screen.getAllByRole('link', { name: 'Product' })[0]).toHaveAttribute('href', '#product');
    expect(screen.getAllByRole('link', { name: 'Timeline' })[0]).toHaveAttribute('href', '#timeline');
    expect(screen.getAllByRole('link', { name: 'Assistant' })[0]).toHaveAttribute('href', '#assistant');
    expect(container.querySelector('#product')).toBeInTheDocument();
    expect(container.querySelector('#timeline')).toBeInTheDocument();
    expect(container.querySelector('#assistant')).toBeInTheDocument();
    expect(container.querySelector('#history')).toBeInTheDocument();
  });

  it('uses stored preference, persists changes, and switches product imagery', async () => {
    window.localStorage.setItem('disciplan-landing-theme', 'dark');
    const { container } = renderLandingPage();
    const root = container.querySelector('.product-landing');
    const dashboardImage = screen.getByAltText(/Dashboard showing assignment cards/i);

    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(dashboardImage).toHaveAttribute('src', expect.stringContaining('dashboard-overview-dark-desktop.webp'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(dashboardImage).toHaveAttribute('src', expect.stringContaining('dashboard-overview-light-desktop.webp'));
    await waitFor(() => expect(window.localStorage.getItem('disciplan-landing-theme')).toBe('light'));
  });

  it('falls back to the operating-system theme when no preference is stored', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const { container } = renderLandingPage();
    expect(container.querySelector('.product-landing')).toHaveAttribute('data-theme', 'dark');
  });
});
