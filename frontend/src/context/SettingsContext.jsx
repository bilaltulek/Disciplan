import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/shared/api/client';
import { DEFAULT_SETTINGS } from '@/shared/settings/defaults';

const SettingsContext = createContext(null);

const normalizeSettings = (raw) => ({
  theme_mode: raw?.theme_mode || DEFAULT_SETTINGS.theme_mode,
  start_page: raw?.start_page || DEFAULT_SETTINGS.start_page,
  assignment_default_complexity: raw?.assignment_default_complexity || DEFAULT_SETTINGS.assignment_default_complexity,
  assignment_default_items: Number.parseInt(raw?.assignment_default_items, 10) || DEFAULT_SETTINGS.assignment_default_items,
  confirm_assignment_delete: raw?.confirm_assignment_delete === undefined
    ? DEFAULT_SETTINGS.confirm_assignment_delete
    : !!raw.confirm_assignment_delete,
});

const getResolvedTheme = (themeMode) => {
  if (themeMode === 'light') return 'light';
  if (themeMode === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (themeMode) => {
  const resolved = getResolvedTheme(themeMode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
};

export const SettingsProvider = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [themePreviewMode, setThemePreviewMode] = useState(null);

  const refreshSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const data = await apiRequest('/api/settings', { method: 'GET', headers: {} });
    const normalized = normalizeSettings(data?.settings);
    setSettings(normalized);
    return normalized;
  }, [user]);

  const saveSettings = useCallback(async (partial) => {
    const data = await apiRequest('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    });
    const normalized = normalizeSettings(data?.settings);
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
    load();
    return () => {
      active = false;
    };
  }, [user, refreshSettings]);

  const effectiveThemeMode = themePreviewMode || settings.theme_mode;

  useEffect(() => {
    applyTheme(effectiveThemeMode);

    if (effectiveThemeMode !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');

    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [effectiveThemeMode]);

  const value = useMemo(() => ({
    settings,
    loadingSettings,
    refreshSettings,
    saveSettings,
    themePreviewMode,
    setThemePreviewMode,
  }), [settings, loadingSettings, refreshSettings, saveSettings, themePreviewMode]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => useContext(SettingsContext);
