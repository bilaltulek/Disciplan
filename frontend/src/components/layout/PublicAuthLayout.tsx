import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './public-auth.css';

export type PublicTheme = 'light' | 'dark';

const PUBLIC_THEME_KEY = 'disciplan-landing-theme';

const getInitialTheme = (): PublicTheme => {
  try {
    const storedTheme = window.localStorage.getItem(PUBLIC_THEME_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  } catch {
    // System preference still provides a stable theme when storage is unavailable.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface PublicAuthLayoutProps {
  children: ReactNode;
  description: string;
  title: string;
  width?: 'form' | 'document';
}

const PublicAuthLayout = ({ children, description, title, width = 'form' }: PublicAuthLayoutProps) => {
  const [theme] = useState<PublicTheme>(getInitialTheme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.landingTheme = theme;
    root.style.colorScheme = theme;
    return () => {
      delete root.dataset.landingTheme;
      root.style.removeProperty('color-scheme');
    };
  }, [theme]);

  return (
    <div className="public-auth" data-theme={theme}>
      <Link className="public-auth-wordmark" to="/" aria-label="Disciplan home">Disciplan</Link>
      <main className={`public-auth-main public-auth-main-${width}`}>
        <header className="public-auth-header">
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
    </div>
  );
};

export default PublicAuthLayout;
