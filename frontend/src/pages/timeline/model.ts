import type { ScheduledTask } from '@/shared/api/types';

export interface TimelineDay {
  date: string;
  tasks: ScheduledTask[];
  isToday: boolean;
  isPast: boolean;
}

export interface AssignmentGroup {
  assignmentId: number;
  title: string;
  complexity: ScheduledTask['complexity'];
  tasks: ScheduledTask[];
}

export const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getToday = () => toDateKey(new Date());

export const addDays = (dateKey: string, amount: number) => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
};

export const formatFullDate = (dateKey: string) => parseDateKey(dateKey).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric',
});

export const formatShortDate = (dateKey: string) => parseDateKey(dateKey).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric',
});

export const formatDayHeading = (dateKey: string, today: string, tomorrow: string) => {
  if (dateKey === today) return 'Today';
  const dateLabel = parseDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  return dateKey === tomorrow ? `Tomorrow · ${dateLabel}` : dateLabel;
};

export const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export const taskCountLabel = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`;

export const groupTasksByAssignment = (tasks: ScheduledTask[]) => {
  const groups = new Map<number, AssignmentGroup>();
  tasks.forEach((task) => {
    const existing = groups.get(task.assignment_id);
    if (existing) {
      existing.tasks.push(task);
      return;
    }
    groups.set(task.assignment_id, {
      assignmentId: task.assignment_id,
      title: task.assignment_title,
      complexity: task.complexity,
      tasks: [task],
    });
  });
  return [...groups.values()];
};

export const buildTimelineDays = (rawTasks: ScheduledTask[], today: string) => {
  const tomorrow = addDays(today, 1);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const weekEnd = weekDates.at(-1)!;
  const tasksByDate = new Map<string, ScheduledTask[]>();
  rawTasks.forEach((task) => tasksByDate.set(task.scheduled_date, [...(tasksByDate.get(task.scheduled_date) || []), task]));
  const upcomingDays = [...weekDates, ...new Set(rawTasks
    .map((task) => task.scheduled_date).filter((date) => date > weekEnd))]
    .sort((left, right) => left.localeCompare(right))
    .map<TimelineDay>((date) => ({ date, tasks: tasksByDate.get(date) || [], isToday: date === today, isPast: false }));
  const pastDays = [...new Set(rawTasks.map((task) => task.scheduled_date).filter((date) => date < today))]
    .sort((left, right) => right.localeCompare(left))
    .map<TimelineDay>((date) => ({ date, tasks: tasksByDate.get(date) || [], isToday: false, isPast: true }));
  return { tomorrow, weekDates, tasksByDate, upcomingDays, pastDays };
};
