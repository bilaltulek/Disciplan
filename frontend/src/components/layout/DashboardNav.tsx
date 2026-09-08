import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  History,
  Network,
  User,
  Settings,
  LogOut,
  BookOpen,
  Bot,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DashboardNav = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { href: '/assistant', label: 'Assistant', icon: Bot },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/timeline', label: 'Timeline', icon: Network },
    { href: '/history', label: 'History', icon: History },
  ];

  const isActive = (path: string) => location.pathname === path;
  const getInitials = (name?: string) => name
    ? name.split(' ').map((part) => part[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link to="/" className="app-wordmark" aria-label="Disciplan home">
          <span className="app-wordmark-mark" aria-hidden="true"><BookOpen className="h-[17px] w-[17px]" strokeWidth={1.8} /></span>
          <span>Disciplan</span>
        </Link>

        <nav className="app-nav-links" aria-label="Application">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`app-nav-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger className="app-avatar-trigger" aria-label="Open account menu">
            <Avatar className="app-avatar">
              <AvatarFallback className="app-avatar-fallback">{getInitials(user?.name)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="app-account-menu w-56">
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

            <DropdownMenuItem className="app-menu-destructive cursor-pointer" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardNav;
