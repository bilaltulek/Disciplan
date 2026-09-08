import { useEffect, useState } from 'react';
import { BookOpen, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';

export type LandingTheme = 'light' | 'dark';

interface LandingNavProps {
  theme: LandingTheme;
  onToggleTheme: () => void;
}

const LandingNav = ({ theme, onToggleTheme }: LandingNavProps) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`product-nav${scrolled ? ' is-scrolled' : ''}`}>
      <div className="product-nav-inner">
        <Link to="/" className="product-wordmark" aria-label="Disciplan home">
          <span className="product-wordmark-mark" aria-hidden="true"><BookOpen size={17} strokeWidth={1.8} /></span>
          <span>Disciplan</span>
        </Link>

        <nav className="product-nav-links" aria-label="Landing page sections">
          <a href="#product">Product</a>
          <a href="#timeline">Timeline</a>
          <a href="#assistant">Assistant</a>
        </nav>

        <nav className="product-nav-account" aria-label="Account">
          <button
            type="button"
            className="product-theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <Link to="/login" className="product-nav-login">Log in</Link>
          <Link to="/signup" className="product-button product-button-small">Get started</Link>
        </nav>
      </div>
    </header>
  );
};

export default LandingNav;
