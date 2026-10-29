import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import LegalPage from './LegalPage';

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: authMocks.login, register: authMocks.register }),
}));

vi.mock('@/shared/api/client', () => ({ apiRequest: authMocks.apiRequest }));

const renderPage = (page: ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('public authentication pages', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    authMocks.login.mockReset();
    authMocks.register.mockReset();
    authMocks.apiRequest.mockReset().mockResolvedValue({ google: false, microsoft: false, sso: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a semantic credential login and preserves the login call', async () => {
    authMocks.login.mockResolvedValue({ success: true });
    renderPage(<LoginPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /google|microsoft|sso/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(authMocks.login).toHaveBeenCalledWith('student@example.com', 'secure-password'));
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/signup');
  });

  it('announces credential errors and restores the login action', async () => {
    authMocks.login.mockResolvedValue({ success: false, error: 'Invalid credentials.' });
    renderPage(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('renders semantic signup fields, legal notice, and preserves registration', async () => {
    authMocks.register.mockResolvedValue({ success: true });
    renderPage(<SignupPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByText(/at least 13/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alex Student' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authMocks.register).toHaveBeenCalledWith('Alex Student', 'alex@example.com', 'secure-password'));
  });

  it('uses the stored neutral theme and exposes the published privacy policy', () => {
    window.localStorage.setItem('disciplan-landing-theme', 'dark');
    const { container } = renderPage(<LegalPage document="privacy" />);

    expect(container.querySelector('.public-auth')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-landing-theme', 'dark');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11);
    expect(screen.getByText('Effective September 8, 2026')).toBeInTheDocument();
    expect(screen.getByText(/does not sell personal data, use student data for advertising/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:disciplansupport@gmail.com');
    expect(screen.queryByText(/draft for owner/i)).not.toBeInTheDocument();
  });

  it('publishes the operator and governing law in the terms', () => {
    renderPage(<LegalPage document="terms" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText(/operated by Bilal Tulek in Texas, United States/i)).toBeInTheDocument();
    expect(screen.getByText(/governed by the laws of the State of Texas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  it('shows only providers reported as fully configured and never shows GitHub', async () => {
    authMocks.apiRequest.mockResolvedValue({ google: true, microsoft: false, sso: true });
    renderPage(<LoginPage />);

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/api/auth/google/start?intent=login');
    expect(screen.getByRole('link', { name: 'Continue with SSO' })).toHaveAttribute('href', '/api/auth/sso/start?intent=login');
    expect(screen.queryByRole('link', { name: /microsoft/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
  });

  it('announces safe provider callback errors', () => {
    render(<MemoryRouter initialEntries={['/login?auth_error=state_invalid']}><LoginPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('expired or was already used');
  });
});
