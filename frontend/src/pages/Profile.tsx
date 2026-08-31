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
      <div className="container mx-auto p-6 md:p-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">My Profile</h1>
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="w-16 h-16 rounded-full bg-cyan-100/70 text-primary text-xl font-bold flex items-center justify-center" aria-hidden="true">{initials(user?.name)}</div>
            <div><CardTitle className="text-xl">{user?.name}</CardTitle><CardDescription>{user?.email}</CardDescription></div>
          </CardHeader>
          <CardContent className="grid gap-6 mt-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Display Name</Label>
              <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className="pl-9" /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="email">Email Address</Label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="email" value={user?.email || ''} readOnly className="pl-9" /></div></div>
            <div className="grid gap-2"><Label htmlFor="role">Account Role</Label><div className="relative"><Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="role" value="Student" readOnly className="pl-9" /></div></div>
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground" role="status">{status}</p><Button onClick={() => void save()} disabled={saving || name.trim() === user?.name || name.trim().length < 2}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile</Button></div>
          </CardContent>
        </Card>
        <Card className="mb-6"><CardHeader><CardTitle>Preferences</CardTitle><CardDescription>Current app preferences from your settings.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="pref-theme">Theme</Label><Input id="pref-theme" value={settings.theme_mode} readOnly /></div><div className="grid gap-2"><Label htmlFor="pref-start-page">Start Page</Label><Input id="pref-start-page" value={settings.start_page} readOnly /></div></CardContent></Card>
        <div className="flex justify-end"><Button variant="destructive" onClick={() => void logout()}>Sign Out</Button></div>
      </div>
    </div>
  );
}
