import { useEffect, useMemo, useState } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Eye, Gauge, Shield, CalendarClock, Brain } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { apiRequest } from '@/shared/api/client';
import type { Complexity, StartPage, ThemeMode } from '@/shared/settings/defaults';

type PlanningProfile = {
  version: number;
  timezone: string;
  weekday_available_minutes: Record<number, number>;
  max_daily_minutes: number;
  preferred_session_minutes: number;
};

type PreferenceMemory = {
  id: string;
  memory_key: string;
  memory_value: unknown;
  status: 'proposed' | 'confirmed' | 'rejected';
};

const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultProfile = {
  version: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weekday_available_minutes: { 0: 0, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 0 },
  max_daily_minutes: 120,
  preferred_session_minutes: 45,
};

const Settings = () => {
  const {
    settings,
    saveSettings,
    setThemePreviewMode,
  } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<PlanningProfile>(defaultProfile);
  const [savedProfile, setSavedProfile] = useState<PlanningProfile>(defaultProfile);
  const [memories, setMemories] = useState<PreferenceMemory[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    void apiRequest<{ profile: PlanningProfile }>('/api/planning-profile', { method: 'GET', headers: {} })
      .then((response) => { setProfile(response.profile); setSavedProfile(response.profile); })
      .catch(() => setStatus('Failed to load planning profile.'));
  }, []);

  const loadMemories = async () => {
    const response = await apiRequest<{ memories: PreferenceMemory[] }>('/api/preference-memories', { method: 'GET', headers: {} });
    setMemories(response.memories);
  };

  useEffect(() => { void loadMemories().catch(() => undefined); }, []);

  useEffect(() => {
    setThemePreviewMode(draft.theme_mode);
    return () => setThemePreviewMode(null);
  }, [draft.theme_mode, setThemePreviewMode]);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings)
    || JSON.stringify(profile) !== JSON.stringify(savedProfile), [draft, settings, profile, savedProfile]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveSettings(draft);
      const response = await apiRequest<{ profile: PlanningProfile }>('/api/planning-profile', {
        method: 'PATCH', body: JSON.stringify({ ...profile, expectedVersion: savedProfile.version }),
      });
      setProfile(response.profile);
      setSavedProfile(response.profile);
      setThemePreviewMode(null);
      setStatus('Settings saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Permanently delete your account, assignments, conversations, plans, and tasks? This cannot be undone.')) return;
    const password = window.prompt('Enter your password to confirm account deletion:');
    if (!password) return;
    try {
      await apiRequest('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      window.location.assign('/');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete account.');
    }
  };

  const handleMemory = async (memory: PreferenceMemory, action: 'confirm' | 'delete') => {
    try {
      await apiRequest(`/api/preference-memories/${memory.id}${action === 'confirm' ? '/confirm' : ''}`, {
        method: action === 'confirm' ? 'POST' : 'DELETE', headers: {},
      });
      await loadMemories();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update preference memory.');
    }
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <main className="app-container app-page settings-page">
        <header className="settings-heading"><p className="app-eyebrow">Preferences</p><h1 className="app-page-heading">Settings</h1><p>Set your planning capacity, defaults, and safety controls.</p></header>

        <Card className="settings-section">
          <CardHeader className="settings-section-header">
            <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" /> Appearance</CardTitle>
            <CardDescription>Control how Disciplan looks for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="theme_mode" className="text-base">Theme</Label>
              <select
                id="theme_mode"
                value={draft.theme_mode}
                onChange={(e) => setDraft((prev) => ({ ...prev, theme_mode: e.target.value as ThemeMode }))}
                className="app-select h-11 px-3 py-2 text-sm"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="settings-section">
          <CardHeader className="settings-section-header">
            <CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5" /> Planning capacity</CardTitle>
            <CardDescription>These explicit limits keep agent-created plans realistic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="planning_timezone">Timezone</Label>
              <Input id="planning_timezone" value={profile.timezone} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/Chicago" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="max_daily_minutes">Maximum minutes per day</Label><Input id="max_daily_minutes" type="number" min={1} max={1440} value={profile.max_daily_minutes} onChange={(event) => setProfile((current) => ({ ...current, max_daily_minutes: Number(event.target.value) }))} /></div>
              <div className="grid gap-2"><Label htmlFor="preferred_session_minutes">Preferred session minutes</Label><Input id="preferred_session_minutes" type="number" min={5} max={480} value={profile.preferred_session_minutes} onChange={(event) => setProfile((current) => ({ ...current, preferred_session_minutes: Number(event.target.value) }))} /></div>
            </div>
            <fieldset className="settings-weekdays"><legend>Available minutes by weekday</legend>
              {weekdayLabels.map((label, day) => <div key={label}><Label htmlFor={`weekday-${day}`}>{label}</Label><Input id={`weekday-${day}`} type="number" min={0} max={1440} value={profile.weekday_available_minutes[day]} onChange={(event) => setProfile((current) => ({ ...current, weekday_available_minutes: { ...current.weekday_available_minutes, [day]: Number(event.target.value) } }))} /></div>)}
            </fieldset>
          </CardContent>
        </Card>

        <Card className="settings-section">
          <CardHeader className="settings-section-header">
            <CardTitle className="flex items-center gap-2"><Gauge className="w-5 h-5" /> Productivity</CardTitle>
            <CardDescription>Set defaults that speed up assignment planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="start_page" className="text-base">Start page after login</Label>
              <select
                id="start_page"
                value={draft.start_page}
                onChange={(e) => setDraft((prev) => ({ ...prev, start_page: e.target.value as StartPage }))}
                className="app-select h-11 px-3 py-2 text-sm"
              >
                <option value="dashboard">Dashboard</option>
                <option value="timeline">Timeline</option>
                <option value="history">History</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assignment_default_complexity" className="text-base">Default assignment difficulty</Label>
              <select
                id="assignment_default_complexity"
                value={draft.assignment_default_complexity}
                onChange={(e) => setDraft((prev) => ({ ...prev, assignment_default_complexity: e.target.value as Complexity }))}
                className="app-select h-11 px-3 py-2 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assignment_default_items" className="text-base">Default workload items</Label>
              <Input
                id="assignment_default_items"
                type="number"
                min={1}
                max={30}
                value={draft.assignment_default_items}
                onChange={(e) => setDraft((prev) => ({
                  ...prev,
                  assignment_default_items: Number.parseInt(e.target.value, 10) || 1,
                }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="settings-section">
          <CardHeader className="settings-section-header">
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Safety</CardTitle>
            <CardDescription>Manage confirmation prompts for irreversible actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="settings-toggle-row">
              <div className="space-y-0.5">
                <Label className="text-base">Confirm before deleting assignment</Label>
                <p className="text-sm text-muted-foreground">Show a browser confirmation prompt before deleting.</p>
              </div>
              <Switch
                checked={draft.confirm_assignment_delete}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, confirm_assignment_delete: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="settings-save-row">
          <p className={status.toLowerCase().includes('failed') ? 'settings-status is-error' : 'settings-status'} role="status">{status}</p>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        <Card className="settings-section">
          <CardHeader className="settings-section-header"><CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" /> Agent memory</CardTitle><CardDescription>Only preferences you confirm are used across conversations.</CardDescription></CardHeader>
          <CardContent className="settings-memories">
            {memories.length === 0 && <p className="settings-empty">No saved or proposed preferences.</p>}
            {memories.map((memory) => <div key={memory.id} className={`settings-memory ${memory.status === 'proposed' ? 'is-proposed' : ''}`}><div><p>{memory.memory_key.replaceAll('_', ' ')} · {memory.status}</p><span>{String(memory.memory_value)}</span></div><div>{memory.status === 'proposed' && <Button size="sm" onClick={() => void handleMemory(memory, 'confirm')}>Confirm</Button>}<Button size="sm" variant="outline" onClick={() => void handleMemory(memory, 'delete')}>Delete</Button></div></div>)}
          </CardContent>
        </Card>

        <Card className="settings-section settings-danger">
          <CardHeader className="settings-section-header">
            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="settings-danger-row">
              <div className="space-y-0.5">
                <Label className="text-base">Delete Account</Label>
                <p className="text-sm text-muted-foreground">Permanently remove your account and all data.</p>
              </div>
              <Button variant="destructive" onClick={() => void handleDeleteAccount()}>Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
