import React, {
  createContext, useState, useContext, useEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/shared/api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const data = await apiRequest('/api/me', { method: 'GET', headers: {} });
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const login = async (email, password) => {
    try {
      const data = await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      navigate('/dashboard');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const data = await apiRequest('/api/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setUser(data.user);
      navigate('/dashboard');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/logout', { method: 'POST', headers: {} });
    } catch {
      // ignore, local state still clears
    }

    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
