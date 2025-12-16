import React from 'react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';

const LandingNav = () => {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b sticky top-0 z-50">
      <div className="text-2xl font-bold tracking-tighter text-slate-900">
        Disciplan
      </div>
      
      <div className="flex items-center gap-4">
        {/* The Colored Box for Login/Signup you requested */}
        <div className="bg-blue-50 p-1.5 rounded-lg flex gap-2">
            <Link to="/login">
                <Button variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-100">
                    Log In
                </Button>
            </Link>
            
            <Link to="/signup">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    Sign Up
                </Button>
            </Link>
        </div>
      </div>
    </nav>
  );
};

export default LandingNav;