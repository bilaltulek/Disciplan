const { enumerateDates, weekday } = require('./date-only');

const DEFAULT_PROFILE = Object.freeze({
  timezone: 'UTC',
  weekdayAvailableMinutes: { 0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 },
  maxDailyMinutes: 120,
  preferredSessionMinutes: 45,
});

const normalizeProfile = (profile = {}) => {
  const supplied = profile || {};
  return ({
  ...DEFAULT_PROFILE,
  ...supplied,
  weekdayAvailableMinutes: {
    ...DEFAULT_PROFILE.weekdayAvailableMinutes,
    ...(supplied.weekdayAvailableMinutes || supplied.weekday_available_minutes || {}),
  },
  maxDailyMinutes: supplied.maxDailyMinutes || supplied.max_daily_minutes || DEFAULT_PROFILE.maxDailyMinutes,
  preferredSessionMinutes: supplied.preferredSessionMinutes || supplied.preferred_session_minutes || DEFAULT_PROFILE.preferredSessionMinutes,
  });
};

const buildDailyCapacity = ({ startDate, dueDate, profile, existingLoad = {} }) => {
  const normalized = normalizeProfile(profile);
  return enumerateDates(startDate, dueDate).map((date) => {
    const available = Number(normalized.weekdayAvailableMinutes[weekday(date)] || 0);
    const limit = Math.min(available, normalized.maxDailyMinutes);
    return {
      date,
      capacityMinutes: Math.max(0, limit - Number(existingLoad[date] || 0)),
    };
  });
};

const allocateTasks = ({ descriptions, startDate, dueDate, profile, existingLoad = {} }) => {
  const normalized = normalizeProfile(profile);
  const days = buildDailyCapacity({ startDate, dueDate, profile: normalized, existingLoad });
  const totalCapacity = days.reduce((sum, day) => sum + day.capacityMinutes, 0);
  if (!Array.isArray(descriptions) || descriptions.length === 0 || totalCapacity < 1) return [];

  const minimumSession = Math.min(15, normalized.preferredSessionMinutes);
  const taskLimit = Math.max(1, Math.min(descriptions.length, Math.floor(totalCapacity / minimumSession)));
  const selected = taskLimit === 1
    ? [descriptions.at(-1)]
    : [...descriptions.slice(0, taskLimit - 1), descriptions.at(-1)];
  const mutableDays = days.map((day) => ({ ...day, remaining: day.capacityMinutes }));

  return selected.map((description) => {
    const day = mutableDays.find((candidate) => candidate.remaining > 0);
    if (!day) return null;
    const duration = Math.min(normalized.preferredSessionMinutes, day.remaining);
    day.remaining -= duration;
    return {
      task_description: description,
      scheduled_date: day.date,
      estimated_minutes: duration,
    };
  }).filter(Boolean);
};

module.exports = {
  DEFAULT_PROFILE,
  allocateTasks,
  buildDailyCapacity,
  normalizeProfile,
};
