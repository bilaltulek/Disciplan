import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const LandingNav = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={`landing-nav ${scrolled ? 'landing-nav-scrolled' : ''}`}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="inline-flex items-center gap-2 font-bold text-foreground tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md">
          <span className="glass-accent p-2 rounded-xl"><BookOpen className="w-4 h-4" /></span>
          <span className="text-xl">Disciplan</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm">
          <a className="landing-nav-link" href="#how-it-works">How it works</a>
          <a className="landing-nav-link" href="#features">Features</a>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" className="landing-nav-link-btn">
              Log In
            </Button>
          </Link>

          <Link to="/signup" className="inline-flex">
            <Button className="focus-visible:ring-2 focus-visible:ring-primary/60">
              Sign Up
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default LandingNav;
