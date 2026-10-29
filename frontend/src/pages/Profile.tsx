import { useEffect, useState } from 'react';
import { Loader2, Mail, Shield, User } from 'lucide-react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

const initials = (name?: string) => name
  ? name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2)
  : 'U';

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { settings } = useSettings();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => setName(user?.name || ''), [user?.name]);

  const save = async () => {
    setSaving(true);
    setStatus('');
    const result = await updateProfile(name.trim());
    setStatus(result.success ? 'Profile updated.' : result.error || 'Profile update failed.');
    setSaving(false);
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <main className="app-container app-page account-page">
        <header className="account-heading"><p className="app-eyebrow">Account</p><h1 className="app-page-heading">My Profile</h1><p>Manage your identity and review your current application preferences.</p></header>
        <Card className="account-card">
          <CardHeader className="account-card-header flex flex-row items-center gap-4">
            <div className="account-profile-mark" aria-hidden="true">{initials(user?.name)}</div>
            <div><CardTitle className="text-xl">{user?.name}</CardTitle><CardDescription>{user?.email}</CardDescription></div>
          </CardHeader>
          <CardContent className="account-fields">
            <div className="account-field">
              <Label htmlFor="name">Display Name</Label>
              <div className="account-input"><User /><Input id="name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></div>
            </div>
            <div className="account-field"><Label htmlFor="email">Email Address</Label><div className="account-input"><Mail /><Input id="email" value={user?.email || ''} readOnly /></div></div>
            <div className="account-field"><Label htmlFor="role">Account Role</Label><div className="account-input"><Shield /><Input id="role" value="Student" readOnly /></div></div>
            <div className="account-save-row"><p className={status.includes('failed') ? 'account-status is-error' : 'account-status'} role="status">{status}</p><Button onClick={() => void save()} disabled={saving || name.trim() === user?.name || name.trim().length < 2}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile</Button></div>
          </CardContent>
        </Card>
        <Card className="account-card"><CardHeader className="account-card-header"><CardTitle>Preferences</CardTitle><CardDescription>Current app preferences from your settings.</CardDescription></CardHeader><CardContent className="account-preferences"><div className="account-field"><Label htmlFor="pref-theme">Theme</Label><Input id="pref-theme" value={settings.theme_mode} readOnly /></div><div className="account-field"><Label htmlFor="pref-start-page">Start Page</Label><Input id="pref-start-page" value={settings.start_page} readOnly /></div></CardContent></Card>
        <div className="account-signout"><Button variant="destructive" onClick={() => void logout()}>Sign Out</Button></div>
      </main>
    </div>
  );
}
