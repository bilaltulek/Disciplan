import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicAuthLayout from '@/components/layout/PublicAuthLayout';
import AuthProviders from '@/components/auth/AuthProviders';
import { authErrorMessage } from '@/components/auth/auth-errors';
import { useAuth } from '@/context/AuthContext';

const LoginPage = () => {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(formData.email, formData.password);
    if (!result.success) {
      setError(result.error || 'Login failed.');
      setLoading(false);
    }
  };

  return (
    <PublicAuthLayout title="Log in" description="Enter your details">
      <form className="public-auth-form" onSubmit={handleSubmit}>
        <div className="public-auth-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
            required
          />
        </div>
        <div className="public-auth-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={(event) => setFormData({ ...formData, password: event.target.value })}
            required
          />
        </div>
        {(error || authErrorMessage(searchParams.get('auth_error'))) && (
          <p className="public-auth-error" role="alert">{error || authErrorMessage(searchParams.get('auth_error'))}</p>
        )}
        <button className="public-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <AuthProviders intent="login" />
      <p className="public-auth-switch">Don&apos;t have an account?<Link to="/signup">Create account</Link></p>
    </PublicAuthLayout>
  );
};

export default LoginPage;
