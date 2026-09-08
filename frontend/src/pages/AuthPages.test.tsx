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
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: authMocks.login, register: authMocks.register }),
}));

const renderPage = (page: ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('public authentication pages', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    authMocks.login.mockReset();
    authMocks.register.mockReset();
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

  it('uses the stored neutral theme and exposes legal document structure', () => {
    window.localStorage.setItem('disciplan-landing-theme', 'dark');
    const { container } = renderPage(<LegalPage document="privacy" />);

    expect(container.querySelector('.public-auth')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-landing-theme', 'dark');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
    expect(screen.getByText('Draft for owner and legal review')).toBeInTheDocument();
  });
});
