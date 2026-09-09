import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { defaultPlanningProfile, isTimezone, validatePlanningProfile } = require('./planning-profiles');

describe('planning profiles', () => {
  it('validates IANA timezones', () => {
    expect(isTimezone('America/Chicago')).toBe(true);
    expect(isTimezone('Chicago-ish')).toBe(false);
  });

  it('requires seven bounded weekday capacities and a feasible session size', () => {
    const profile = defaultPlanningProfile();
    expect(validatePlanningProfile(profile)).toEqual([]);
    expect(validatePlanningProfile({ ...profile, preferred_session_minutes: 200 })).toContain('preferred_session_minutes');
    expect(validatePlanningProfile({ ...profile, weekday_available_minutes: { 1: 60 } })).toContain('weekday_available_minutes');
  });
});
