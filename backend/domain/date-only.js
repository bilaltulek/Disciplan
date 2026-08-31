const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDateOnly = (value) => {
  const match = DATE_ONLY_PATTERN.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ordinal = Date.UTC(year, month - 1, day) / 86_400_000;
  const roundTrip = new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
  return roundTrip === value ? { year, month, day, ordinal } : null;
};

const formatOrdinal = (ordinal) => new Date(ordinal * 86_400_000).toISOString().slice(0, 10);

const addDays = (value, count) => {
  const parsed = parseDateOnly(value);
  if (!parsed || !Number.isInteger(count)) throw new TypeError('A valid date-only value and integer day count are required.');
  return formatOrdinal(parsed.ordinal + count);
};

const weekday = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new TypeError('A valid date-only value is required.');
  return new Date(parsed.ordinal * 86_400_000).getUTCDay();
};

const todayInTimezone = (timezone = 'UTC', now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const enumerateDates = (start, end) => {
  const first = parseDateOnly(start);
  const last = parseDateOnly(end);
  if (!first || !last || first.ordinal > last.ordinal) return [];
  return Array.from({ length: last.ordinal - first.ordinal + 1 }, (_, index) => formatOrdinal(first.ordinal + index));
};

module.exports = {
  DATE_ONLY_PATTERN,
  addDays,
  enumerateDates,
  formatOrdinal,
  parseDateOnly,
  todayInTimezone,
  weekday,
};
