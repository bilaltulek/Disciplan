import React, { useEffect, useMemo, useState } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Eye, Gauge, Shield } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';

const Settings = () => {
  const {
    settings,
    saveSettings,
    setThemePreviewMode,
  } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setThemePreviewMode(draft.theme_mode);
    return () => setThemePreviewMode(null);
  }, [draft.theme_mode, setThemePreviewMode]);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveSettings(draft);
      setThemePreviewMode(null);
      setStatus('Settings saved.');
    } catch (error) {
      setStatus(error.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell transition-colors duration-300">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">Settings</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" /> Appearance</CardTitle>
            <CardDescription>Control how Disciplan looks for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="theme_mode" className="text-base">Theme</Label>
              <select
                id="theme_mode"
                value={draft.theme_mode}
                onChange={(e) => setDraft((prev) => ({ ...prev, theme_mode: e.target.value }))}
                className="glass-input h-10 rounded-xl border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="w-5 h-5" /> Productivity</CardTitle>
            <CardDescription>Set defaults that speed up assignment planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="start_page" className="text-base">Start page after login</Label>
              <select
                id="start_page"
                value={draft.start_page}
                onChange={(e) => setDraft((prev) => ({ ...prev, start_page: e.target.value }))}
                className="glass-input h-10 rounded-xl border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
                onChange={(e) => setDraft((prev) => ({ ...prev, assignment_default_complexity: e.target.value }))}
                className="glass-input h-10 rounded-xl border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
                className="glass-input"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Safety</CardTitle>
            <CardDescription>Manage confirmation prompts for irreversible actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
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

        <div className="mb-6 flex items-center justify-between">
          <p className={`text-sm ${status.includes('Failed') ? 'text-red-500' : 'text-muted-foreground'}`}>{status}</p>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        <Card className="border-red-200/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600"><Lock className="w-5 h-5" /> Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-red-600">Delete Account</Label>
                <p className="text-sm text-muted-foreground">Permanently remove your account and all data.</p>
              </div>
              <Button variant="destructive">Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
