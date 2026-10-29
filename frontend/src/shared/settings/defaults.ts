export type ThemeMode = 'light' | 'dark' | 'system';
export type StartPage = 'dashboard' | 'timeline' | 'history';
export type Complexity = 'Easy' | 'Medium' | 'Hard';

export interface UserSettings {
  theme_mode: ThemeMode;
  start_page: StartPage;
  assignment_default_complexity: Complexity;
  assignment_default_items: number;
  confirm_assignment_delete: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme_mode: 'light',
  start_page: 'dashboard',
  assignment_default_complexity: 'Medium',
  assignment_default_items: 5,
  confirm_assignment_delete: true,
};
