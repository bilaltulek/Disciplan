import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/shared/api/client';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthResponse {
  user: AuthUser;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  updateProfile: (name: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const allowedStartPages = new Set(['dashboard', 'timeline', 'history']);
const toStartRoute = (startPage: unknown): string => (
  typeof startPage === 'string' && allowedStartPages.has(startPage) ? `/${startPage}` : '/dashboard'
);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const data = await apiRequest<AuthResponse>('/api/me', { method: 'GET', headers: {}, suppressAuthRedirect: true });
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    const handle = () => { setUser(null); navigate('/login'); };
    window.addEventListener('auth:unauthorized', handle);
    return () => window.removeEventListener('auth:unauthorized', handle);
  }, [navigate]);

  const resolveStartRoute = async () => {
    try {
      const settings = await apiRequest<{ settings?: { start_page?: string } }>('/api/settings', { method: 'GET', headers: {} });
      return toStartRoute(settings.settings?.start_page);
    } catch {
      return '/dashboard';
    }
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const data = await apiRequest<AuthResponse>('/api/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      navigate(await resolveStartRoute());
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed.' };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<AuthResult> => {
    try {
      const data = await apiRequest<AuthResponse>('/api/register', {
        method: 'POST', body: JSON.stringify({ name, email, password }),
      });
      setUser(data.user);
      navigate(await resolveStartRoute());
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Registration failed.' };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/logout', { method: 'POST', headers: {} });
    } catch {
      // Local auth state must still be cleared when the server session has expired.
    }
    setUser(null);
    navigate('/login');
  };

  const updateProfile = async (name: string): Promise<AuthResult> => {
    try {
      const data = await apiRequest<AuthResponse>('/api/profile', {
        method: 'PATCH', body: JSON.stringify({ name }),
      });
      setUser(data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Profile update failed.' };
    }
  };

  const value = useMemo(() => ({ user, loading, login, register, updateProfile, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
};
