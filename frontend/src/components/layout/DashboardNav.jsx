import React from 'react';
import { NavLink } from 'react-router-dom';
import { Layout, Network, History, User, Settings } from 'lucide-react';

const DashboardNav = () => {
  const navItems = [
    { name: 'Tasks', path: '/dashboard', icon: <Layout size={18} /> },
    { name: 'Timeline', path: '/timeline', icon: <Network size={18} /> },
    { name: 'History', path: '/history', icon: <History size={18} /> },
  ];

  const secondaryItems = [
    { name: 'Profile', path: '/profile', icon: <User size={18} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={18} /> },
  ];

  return (
    <nav className="w-full bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Disciplan</h1>
            
            <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {navItems.map((item) => (
                    <NavLink 
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) => 
                            `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                isActive 
                                ? 'bg-white text-blue-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-900'
                            }`
                        }
                    >
                        {item.icon}
                        {item.name}
                    </NavLink>
                ))}
            </div>
        </div>

        <div className="flex items-center gap-4">
            {secondaryItems.map((item) => (
                 <NavLink 
                 key={item.name}
                 to={item.path}
                 className="text-slate-400 hover:text-blue-600 transition-colors"
                 title={item.name}
             >
                 {item.icon}
             </NavLink>
            ))}
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                JD
            </div>
        </div>
    </nav>
  );
};

export default DashboardNav;