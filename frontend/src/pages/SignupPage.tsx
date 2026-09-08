import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import PublicAuthLayout from '@/components/layout/PublicAuthLayout';
import { useAuth } from '@/context/AuthContext';

const SignupPage = () => {
  const { register } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const result = await register(formData.name, formData.email, formData.password);
    if (!result.success) {
      setError(result.error || 'Registration failed.');
      setLoading(false);
    }
  };

  return (
    <PublicAuthLayout title="Create an account" description="Start planning your next assignment">
      <form className="public-auth-form" onSubmit={handleSubmit}>
        <div className="public-auth-field">
          <label htmlFor="signup-name">Name</label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Enter your name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            required
          />
        </div>
        <div className="public-auth-field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={formData.password}
            onChange={(event) => setFormData({ ...formData, password: event.target.value })}
            required
          />
        </div>
        {error && <p className="public-auth-error" role="alert">{error}</p>}
        <button className="public-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="public-auth-switch">Already have an account?<Link to="/login">Log in</Link></p>
      <p className="public-auth-notice">
        By creating an account, you confirm you are at least 13 and agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </PublicAuthLayout>
  );
};

export default SignupPage;
