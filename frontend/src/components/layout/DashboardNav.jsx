import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  History, 
  Network, 
  User, 
  Settings, 
  LogOut, 
  BookOpen 
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DashboardNav = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/timeline', label: 'Timeline', icon: Network },
    { href: '/history', label: 'History', icon: History },
  ];

  // Helper to determine if a link is active
  const isActive = (path) => location.pathname === path;

  // Helper for initials
  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'U';

  return (
    <nav className="glass-nav mx-4 mt-4 rounded-2xl px-6 py-4 sticky top-3 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
            <div className="glass-accent p-2 rounded-xl">
                <BookOpen className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl text-foreground tracking-tight">Disciplan</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
                <Link 
                    key={item.href} 
                    to={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        isActive(item.href) 
                            ? 'glass-chip text-primary shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/45'
                    }`}
                >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                </Link>
            ))}
        </div>

        <div className="flex items-center gap-4">
            <DropdownMenu>
                <DropdownMenuTrigger className="focus:outline-none">
                    <Avatar className="cursor-pointer hover:ring-2 hover:ring-primary/25 transition-all">
                        <AvatarFallback className="text-foreground font-bold text-xs">
                            {getInitials(user?.name)}
                        </AvatarFallback>
                    </Avatar>
                </DropdownMenuTrigger>
                
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                            <span className="text-sm font-medium leading-none">{user?.name}</span>
                            <span className="text-xs leading-none text-muted-foreground font-normal">{user?.email}</span>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    <Link to="/profile">
                        <DropdownMenuItem className="cursor-pointer">
                            <User className="mr-2 h-4 w-4" />
                            <span>Profile</span>
                        </DropdownMenuItem>
                    </Link>
                    
                    <Link to="/settings">
                        <DropdownMenuItem className="cursor-pointer">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                    </Link>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem 
                        className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50/80"
                        onClick={logout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNav;
