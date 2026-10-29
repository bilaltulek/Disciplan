import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/shared/api/client';
import {
  DEFAULT_SETTINGS, type Complexity, type StartPage, type ThemeMode, type UserSettings,
} from '@/shared/settings/defaults';

interface SettingsResponse {
  settings?: Partial<UserSettings>;
}

interface SettingsContextValue {
  settings: UserSettings;
  loadingSettings: boolean;
  refreshSettings: () => Promise<UserSettings>;
  saveSettings: (partial: Partial<UserSettings>) => Promise<UserSettings>;
  themePreviewMode: ThemeMode | null;
  setThemePreviewMode: (mode: ThemeMode | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const isThemeMode = (value: unknown): value is ThemeMode => ['light', 'dark', 'system'].includes(String(value));
const isStartPage = (value: unknown): value is StartPage => ['dashboard', 'timeline', 'history'].includes(String(value));
const isComplexity = (value: unknown): value is Complexity => ['Easy', 'Medium', 'Hard'].includes(String(value));

const normalizeSettings = (raw?: Partial<UserSettings>): UserSettings => ({
  theme_mode: isThemeMode(raw?.theme_mode) ? raw.theme_mode : DEFAULT_SETTINGS.theme_mode,
  start_page: isStartPage(raw?.start_page) ? raw.start_page : DEFAULT_SETTINGS.start_page,
  assignment_default_complexity: isComplexity(raw?.assignment_default_complexity)
    ? raw.assignment_default_complexity
    : DEFAULT_SETTINGS.assignment_default_complexity,
  assignment_default_items: Number.isInteger(Number(raw?.assignment_default_items))
    ? Number(raw?.assignment_default_items)
    : DEFAULT_SETTINGS.assignment_default_items,
  confirm_assignment_delete: raw?.confirm_assignment_delete === undefined
    ? DEFAULT_SETTINGS.confirm_assignment_delete
    : Boolean(raw.confirm_assignment_delete),
});

const getResolvedTheme = (themeMode: ThemeMode): 'light' | 'dark' => {
  if (themeMode === 'light' || themeMode === 'dark') return themeMode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (themeMode: ThemeMode) => {
  document.documentElement.classList.toggle('dark', getResolvedTheme(themeMode) === 'dark');
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [themePreviewMode, setThemePreviewMode] = useState<ThemeMode | null>(null);

  const refreshSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const data = await apiRequest<SettingsResponse>('/api/settings', { method: 'GET', headers: {} });
    const normalized = normalizeSettings(data.settings);
    setSettings(normalized);
    return normalized;
  }, [user]);

  const saveSettings = useCallback(async (partial: Partial<UserSettings>) => {
    const data = await apiRequest<SettingsResponse>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    });
    const normalized = normalizeSettings(data.settings);
    setSettings(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        setSettings(DEFAULT_SETTINGS);
        setLoadingSettings(false);
        return;
      }
      setLoadingSettings(true);
      try {
        await refreshSettings();
      } catch {
        if (active) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (active) setLoadingSettings(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [user, refreshSettings]);

  const effectiveThemeMode = themePreviewMode || settings.theme_mode;

  useEffect(() => {
    applyTheme(effectiveThemeMode);
    if (effectiveThemeMode !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [effectiveThemeMode]);

  const value = useMemo(() => ({
    settings, loadingSettings, refreshSettings, saveSettings, themePreviewMode, setThemePreviewMode,
  }), [settings, loadingSettings, refreshSettings, saveSettings, themePreviewMode]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider.');
  return context;
};
