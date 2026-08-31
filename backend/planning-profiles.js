const db = require('./db');

const DEFAULT_WEEKDAY_MINUTES = Object.freeze({ 0: 0, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 0 });

const defaultPlanningProfile = () => ({
  version: 0,
  timezone: 'UTC',
  weekday_available_minutes: { ...DEFAULT_WEEKDAY_MINUTES },
  max_daily_minutes: 120,
  preferred_session_minutes: 45,
});

const isTimezone = (value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const validatePlanningProfile = (input) => {
  const issues = [];
  if (typeof input?.timezone !== 'string' || !isTimezone(input.timezone)) issues.push('timezone');
  if (!Number.isInteger(input?.max_daily_minutes) || input.max_daily_minutes < 1 || input.max_daily_minutes > 1440) issues.push('max_daily_minutes');
  if (!Number.isInteger(input?.preferred_session_minutes) || input.preferred_session_minutes < 5
      || input.preferred_session_minutes > 480 || input.preferred_session_minutes > input.max_daily_minutes) {
    issues.push('preferred_session_minutes');
  }
  const availability = input?.weekday_available_minutes;
  if (!availability || typeof availability !== 'object'
      || !Array.from({ length: 7 }, (_, day) => day).every((day) => Number.isInteger(availability[day]) && availability[day] >= 0 && availability[day] <= 1440)) {
    issues.push('weekday_available_minutes');
  }
  return issues;
};

const getPlanningProfile = async (userId) => {
  const result = await db.query(
    `SELECT version, timezone, weekday_available_minutes, max_daily_minutes, preferred_session_minutes
     FROM user_planning_profiles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || defaultPlanningProfile();
};

const updatePlanningProfile = async ({ userId, expectedVersion, profile }) => {
  const issues = validatePlanningProfile(profile);
  if (issues.length) return { issues };
  const result = await db.query(
    `INSERT INTO user_planning_profiles (
       user_id, version, timezone, weekday_available_minutes, max_daily_minutes, preferred_session_minutes
     ) VALUES ($1, 1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       version = user_planning_profiles.version + 1,
       timezone = EXCLUDED.timezone,
       weekday_available_minutes = EXCLUDED.weekday_available_minutes,
       max_daily_minutes = EXCLUDED.max_daily_minutes,
       preferred_session_minutes = EXCLUDED.preferred_session_minutes,
       updated_at = CURRENT_TIMESTAMP
     WHERE user_planning_profiles.version = $6
     RETURNING version, timezone, weekday_available_minutes, max_daily_minutes, preferred_session_minutes`,
    [
      userId,
      profile.timezone,
      JSON.stringify(profile.weekday_available_minutes),
      profile.max_daily_minutes,
      profile.preferred_session_minutes,
      expectedVersion,
    ],
  );
  return result.rows[0] ? { profile: result.rows[0] } : { conflict: true };
};

module.exports = {
  DEFAULT_WEEKDAY_MINUTES,
  defaultPlanningProfile,
  getPlanningProfile,
  isTimezone,
  updatePlanningProfile,
  validatePlanningProfile,
};
