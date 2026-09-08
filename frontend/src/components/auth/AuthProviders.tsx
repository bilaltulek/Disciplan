import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/shared/api/client';

interface ProviderCapabilities {
  google: boolean;
  microsoft: boolean;
  sso: boolean;
}

type AuthIntent = 'login' | 'signup';

const providers = [
  { key: 'google', label: 'Google' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'sso', label: 'SSO' },
] as const;

const ProviderMark = ({ provider }: { provider: typeof providers[number]['key'] }) => {
  if (provider === 'microsoft') {
    return <span className="auth-provider-mark auth-provider-mark-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  if (provider === 'sso') return <span className="auth-provider-mark auth-provider-mark-sso" aria-hidden="true">SSO</span>;
  return <span className="auth-provider-mark auth-provider-mark-google" aria-hidden="true">G</span>;
};

const AuthProviders = ({ intent }: { intent: AuthIntent }) => {
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<ProviderCapabilities>('/api/auth/providers', {
      method: 'GET', headers: {}, suppressAuthRedirect: true,
    }).then((available) => {
      if (active) setCapabilities(available);
    }).catch(() => {
      if (active) setCapabilities(null);
    });
    return () => { active = false; };
  }, []);

  const enabled = useMemo(() => providers.filter((provider) => capabilities?.[provider.key]), [capabilities]);
  if (enabled.length === 0) return null;

  return (
    <section className="public-auth-providers" aria-label="Other authentication options">
      <div className="public-auth-divider"><span>Or continue with</span></div>
      <div className="public-auth-provider-list">
        {enabled.map((provider) => (
          <a key={provider.key} className="public-auth-provider" href={`/api/auth/${provider.key}/start?intent=${intent}`}>
            <ProviderMark provider={provider.key} />
            Continue with {provider.label}
          </a>
        ))}
      </div>
    </section>
  );
};

export default AuthProviders;
