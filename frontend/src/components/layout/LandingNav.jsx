import React from 'react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';

const LandingNav = () => {
  return (
    <nav className="glass-nav mx-4 mt-4 rounded-2xl flex items-center justify-between px-6 py-4 sticky top-3 z-50">
      <div className="text-2xl font-bold tracking-tighter text-foreground">
        Disciplan
      </div>
      
      <div className="flex items-center gap-4">
        <div className="glass-chip p-1.5 rounded-xl flex gap-2">
            <Link to="/login">
                <Button variant="ghost" className="text-primary hover:bg-white/70">
                    Log In
                </Button>
            </Link>
            
            <Link to="/signup" className="inline-flex">
                <Button>
                    Sign Up
                </Button>
            </Link>
        </div>
      </div>
    </nav>
  );
};

export default LandingNav;
