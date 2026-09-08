import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import LandingNav, { type LandingTheme } from '@/components/layout/LandingNav';
import './landing.css';

const LANDING_THEME_KEY = 'disciplan-landing-theme';

const productFlow = [
  { name: 'Dashboard', detail: 'Create and monitor assignments.' },
  { name: 'Timeline', detail: 'Work through scheduled days.' },
  { name: 'Assistant', detail: 'Explain, plan, or propose revisions.' },
  { name: 'History', detail: 'Review completed work.' },
];

const getInitialTheme = (): LandingTheme => {
  try {
    const saved = window.localStorage.getItem(LANDING_THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface ProductVisualProps {
  name: 'dashboard-overview' | 'dashboard-plan' | 'timeline' | 'assistant' | 'history';
  alt: string;
  theme: LandingTheme;
  className?: string;
  eager?: boolean;
  forceDark?: boolean;
  desktopHeight?: number;
}

const ProductVisual = ({
  name,
  alt,
  theme,
  className = '',
  eager = false,
  forceDark = false,
  desktopHeight = 825,
}: ProductVisualProps) => {
  const visualTheme = forceDark ? 'dark' : theme;
  const base = `/landing/product/${name}-${visualTheme}`;
  return (
    <picture className={`product-visual ${className}`.trim()}>
      <source media="(max-width: 699px)" srcSet={`${base}-mobile.webp`} />
      <img
        src={`${base}-desktop.webp`}
        alt={alt}
        width={1440}
        height={desktopHeight}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding={eager ? 'sync' : 'async'}
      />
    </picture>
  );
};

const LandingPage = () => {
  const [theme, setTheme] = useState<LandingTheme>(getInitialTheme);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANDING_THEME_KEY, theme);
    } catch {
      // The active page can still use the selected theme without persistence.
    }
  }, [theme]);

  return (
    <div className="product-landing" data-theme={theme}>
      <a className="product-skip-link" href="#main-content">Skip to content</a>
      <LandingNav theme={theme} onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))} />

      <main id="main-content">
        <section className="product-hero product-shell" aria-labelledby="landing-title">
          <div className="product-hero-intro">
            <div className="product-hero-copy">
              <h1 id="landing-title">Know what to study next.</h1>
              <p>Disciplan turns assignments into manageable work and keeps your plan visible as the week changes.</p>
              <div className="product-actions">
                <Link to="/signup" className="product-button">Get started <ArrowRight size={16} /></Link>
                <Link to="/login" className="product-button product-button-secondary">Log in</Link>
              </div>
            </div>
            <p className="product-trust-note"><span aria-hidden="true" />Assistant-proposed changes publish only after you approve them.</p>
          </div>

          <figure className="product-hero-frame">
            <ProductVisual
              name="dashboard-overview"
              theme={theme}
              eager
              desktopHeight={620}
              alt="Disciplan Dashboard showing assignment cards, progress, due dates, and plan access."
            />
          </figure>
        </section>

        <section className="product-principle product-shell" aria-labelledby="principle-title">
          <p className="product-label">One connected plan</p>
          <h2 id="principle-title">A plan is useful only if it survives the week.</h2>
          <p>Create it on Dashboard, work through it in Timeline, adjust with Assistant, and see the result in History.</p>
        </section>

        <section id="product" className="product-shell product-section" aria-labelledby="dashboard-title">
          <div className="product-showcase product-dashboard-showcase">
            <figure className="product-showcase-media">
              <ProductVisual
                name="dashboard-plan"
                theme={theme}
                desktopHeight={864}
                alt="The real Disciplan Study Plan dialog showing generated tasks, scheduled dates, durations, completion controls, and plan feedback."
              />
            </figure>
            <div className="product-showcase-copy">
              <p className="product-label">Dashboard</p>
              <h2 id="dashboard-title">Turn one assignment into a workable plan.</h2>
              <p>Add the due date, workload, difficulty, and brief. Disciplan creates dated tasks with estimated study time.</p>
              <p className="product-detail">Track progress from the same assignment card, reopen the plan, and mark individual tasks complete.</p>
            </div>
          </div>
        </section>

        <section id="timeline" className="product-shell product-section product-timeline-section" aria-labelledby="timeline-title">
          <div className="product-showcase-copy">
            <p className="product-label">Timeline</p>
            <h2 id="timeline-title">Move through the work day by day.</h2>
            <p>Timeline opens on today, keeps nearby dates in view, and lets you complete, edit, delete, or hide finished tasks.</p>
          </div>
          <figure className="product-timeline-frame">
            <ProductVisual
              name="timeline"
              theme={theme}
              desktopHeight={864}
              alt="Disciplan Timeline focused on today with three scheduled tasks, completion status, durations, and nearby days in view."
            />
          </figure>
        </section>

        <section id="assistant" className="product-shell product-section" aria-labelledby="assistant-title">
          <div className="product-assistant-showcase">
            <header>
              <div>
                <p className="product-label">Assistant</p>
                <h2 id="assistant-title">Get help without giving up control.</h2>
              </div>
              <p>Ask for an explanation, guided study session, resources, task breakdown, or schedule. Review proposed repairs before anything changes.</p>
            </header>
            <figure className="product-assistant-frame">
              <ProductVisual
                name="assistant"
                theme={theme}
                forceDark
                desktopHeight={660}
                alt="The real Disciplan Assistant showing a planning conversation and an approval-required schedule revision with Keep current plan and Approve changes choices."
              />
            </figure>
          </div>
        </section>

        <section id="history" className="product-shell product-section" aria-labelledby="history-title">
          <div className="product-history-showcase">
            <div className="product-history-copy">
              <p className="product-label">One workspace</p>
              <h2 id="history-title">The same work, from plan to done.</h2>
              <p>Every view answers a different question about the same assignments and tasks.</p>
              <ol className="product-flow" aria-label="How Disciplan fits together">
                {productFlow.map((item) => (
                  <li key={item.name}><strong>{item.name}</strong><span>{item.detail}</span></li>
                ))}
              </ol>
            </div>
            <figure className="product-history-frame">
              <ProductVisual
                name="history"
                theme={theme}
                desktopHeight={720}
                alt="Disciplan Completion History showing completed-task totals, study time, recent activity, and filters."
              />
            </figure>
          </div>
        </section>

        <section className="product-shell product-final" aria-labelledby="final-title">
          <div>
            <p className="product-label">Start with the next assignment</p>
            <h2 id="final-title">Make the next assignment easier to start.</h2>
          </div>
          <div className="product-final-actions">
            <Link to="/signup" className="product-button product-button-inverse">Get started <ArrowRight size={16} /></Link>
            <Link to="/login">Log in to your account</Link>
          </div>
        </section>
      </main>

      <footer className="product-footer">
        <div className="product-shell product-footer-inner">
          <Link to="/" className="product-wordmark" aria-label="Disciplan home">
            <span className="product-wordmark-mark" aria-hidden="true"><BookOpen size={14} strokeWidth={1.8} /></span>
            <span>Disciplan</span>
          </Link>
          <nav aria-label="Footer navigation">
            <a href="#product">Product</a>
            <a href="#timeline">Timeline</a>
            <a href="#assistant">Assistant</a>
            <a href="#history">History</a>
          </nav>
          <div className="product-footer-account"><Link to="/login">Log in</Link><Link to="/signup">Create account</Link></div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
