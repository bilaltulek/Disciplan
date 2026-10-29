import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import {
  Check, ListFilter, Loader2, Pencil, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary, ScheduledTask } from '@/shared/api/types';

interface TimelineEditForm {
  task_description: string;
  scheduled_date: string;
  estimated_minutes: string;
}

interface TimelineDay {
  date: string;
  tasks: ScheduledTask[];
  isToday: boolean;
  isPast: boolean;
}

interface AssignmentGroup {
  assignmentId: number;
  title: string;
  complexity: ScheduledTask['complexity'];
  tasks: ScheduledTask[];
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getToday = () => toDateKey(new Date());

const addDays = (dateKey: string, amount: number) => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
};

const formatFullDate = (dateKey: string) => parseDateKey(dateKey).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric',
});

const formatShortDate = (dateKey: string) => parseDateKey(dateKey).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric',
});

const formatDayHeading = (dateKey: string, today: string, tomorrow: string) => {
  if (dateKey === today) return 'Today';
  const dateLabel = parseDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  return dateKey === tomorrow ? `Tomorrow · ${dateLabel}` : dateLabel;
};

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const taskCountLabel = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`;

const groupTasksByAssignment = (tasks: ScheduledTask[]) => {
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

const Timeline = () => {
  const [rawTasks, setRawTasks] = useState<ScheduledTask[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineError, setTimelineError] = useState('');
  const [metadataWarning, setMetadataWarning] = useState('');
  const [today, setToday] = useState(getToday());
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [editForm, setEditForm] = useState<TimelineEditForm>({ task_description: '', scheduled_date: '', estimated_minutes: '' });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const fetchTimeline = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setTimelineError('');
    const [timelineResult, assignmentsResult] = await Promise.allSettled([
      apiRequest<ScheduledTask[]>('/api/timeline', { method: 'GET', headers: {} }),
      apiRequest<AssignmentSummary[]>('/api/assignments', { method: 'GET', headers: {} }),
    ]);

    if (timelineResult.status === 'fulfilled') {
      setRawTasks(timelineResult.value);
    } else {
      console.error('Failed to load timeline', timelineResult.reason);
      setTimelineError(errorMessage(timelineResult.reason, 'Timeline could not be loaded.'));
    }

    if (assignmentsResult.status === 'fulfilled') {
      setAssignments(assignmentsResult.value);
      setMetadataWarning('');
    } else {
      console.error('Failed to load assignment details', assignmentsResult.reason);
      setAssignments([]);
      setMetadataWarning('Some assignment details are temporarily unavailable. Tasks are still ready to use.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(() => setToday(getToday()), nextMidnight.getTime() - now.getTime());
    return () => window.clearTimeout(timer);
  }, [today]);

  const tomorrow = addDays(today, 1);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const weekEnd = weekDates[weekDates.length - 1];
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledTask[]>();
    rawTasks.forEach((task) => grouped.set(task.scheduled_date, [...(grouped.get(task.scheduled_date) || []), task]));
    return grouped;
  }, [rawTasks]);
  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment])), [assignments]);

  const upcomingDays = useMemo(() => {
    const laterTaskDates = [...new Set(rawTasks
      .map((task) => task.scheduled_date)
      .filter((dateKey) => dateKey > weekEnd))].sort();
    return [...weekDates, ...laterTaskDates].map<TimelineDay>((dateKey) => ({
      date: dateKey,
      tasks: tasksByDate.get(dateKey) || [],
      isToday: dateKey === today,
      isPast: false,
    }));
  }, [rawTasks, tasksByDate, today, tomorrow, weekDates, weekEnd]);

  const pastDays = useMemo(() => [...new Set(rawTasks
    .map((task) => task.scheduled_date)
    .filter((dateKey) => dateKey < today))]
    .sort((left, right) => right.localeCompare(left))
    .map<TimelineDay>((dateKey) => ({
      date: dateKey,
      tasks: tasksByDate.get(dateKey) || [],
      isToday: false,
      isPast: true,
    })), [rawTasks, tasksByDate, today]);

  const todayTasks = tasksByDate.get(today) || [];
  const todayCompleted = todayTasks.filter((task) => task.completed).length;
  const remainingEstimates = todayTasks
    .filter((task) => !task.completed && typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0)
    .map((task) => task.estimated_minutes as number);
  const remainingMinutes = remainingEstimates.reduce((total, minutes) => total + minutes, 0);

  const focusDay = (dateKey: string) => {
    const section = sectionRefs.current.get(dateKey);
    if (!section) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    section.focus({ preventScroll: true });
  };

  const handleToggle = async (taskId: number, currentStatus: boolean) => {
    if (togglingId !== null) return;
    const previousTasks = rawTasks;
    const previousAssignments = assignments;
    const task = rawTasks.find((entry) => entry.id === taskId);
    setRawTasks((current) => current.map((entry) => (
      entry.id === taskId ? { ...entry, completed: !currentStatus } : entry
    )));
    if (task) {
      setAssignments((current) => current.map((assignment) => assignment.id === task.assignment_id ? {
        ...assignment,
        completed_subtasks: Math.min(
          assignment.total_subtasks,
          Math.max(0, assignment.completed_subtasks + (currentStatus ? -1 : 1)),
        ),
      } : assignment));
    }
    setTogglingId(taskId);

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !currentStatus }),
      });
    } catch (error) {
      setRawTasks(previousTasks);
      setAssignments(previousAssignments);
      console.error('Failed to toggle task', error);
      alert(errorMessage(error, 'Failed to update task completion.'));
    } finally {
      setTogglingId(null);
    }
  };

  const openEdit = (task: ScheduledTask) => {
    setEditTask(task);
    setEditForm({
      task_description: task.task_description,
      scheduled_date: task.scheduled_date,
      estimated_minutes: String(task.estimated_minutes || 30),
    });
  };

  const handleSaveEdit = async () => {
    if (!editTask) return;
    setSaving(true);
    try {
      await apiRequest(`/api/tasks/${editTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          task_description: editForm.task_description,
          scheduled_date: editForm.scheduled_date,
          estimated_minutes: Number.parseInt(editForm.estimated_minutes, 10),
          completed: !!editTask.completed,
        }),
      });
      setEditTask(null);
      await fetchTimeline(false);
    } catch (error) {
      console.error('Failed to update task', error);
      alert(errorMessage(error, 'Failed to update task.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!window.confirm('Delete this timeline task permanently?')) return;
    const task = rawTasks.find((entry) => entry.id === taskId);
    setDeletingId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE', headers: {} });
      setRawTasks((current) => current.filter((entry) => entry.id !== taskId));
      if (task) {
        setAssignments((current) => current.map((assignment) => assignment.id === task.assignment_id ? {
          ...assignment,
          total_subtasks: Math.max(0, assignment.total_subtasks - 1),
          completed_subtasks: Math.max(0, assignment.completed_subtasks - (task.completed ? 1 : 0)),
        } : assignment));
      }
    } catch (error) {
      console.error('Failed to delete task', error);
      alert(errorMessage(error, 'Failed to delete task.'));
    } finally {
      setDeletingId(null);
    }
  };

  const renderDay = (day: TimelineDay) => {
    const visibleTasks = hideCompleted ? day.tasks.filter((task) => !task.completed) : day.tasks;
    const groups = groupTasksByAssignment(visibleTasks);
    const completedCount = day.tasks.filter((task) => task.completed).length;
    const dayRemainingMinutes = day.tasks
      .filter((task) => !task.completed && typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0)
      .reduce((total, task) => total + (task.estimated_minutes || 0), 0);
    const headingId = `timeline-day-heading-${day.date}`;

    return (
      <section
        key={day.date}
        id={`timeline-day-${day.date}`}
        ref={(element) => {
          if (element) sectionRefs.current.set(day.date, element);
          else sectionRefs.current.delete(day.date);
        }}
        className={`timeline-day-section${day.isToday ? ' is-today' : ''}${day.isPast ? ' is-past' : ''}${day.tasks.length === 0 ? ' is-empty' : ''}`}
        tabIndex={-1}
        aria-labelledby={headingId}
      >
        <header className="timeline-day-heading">
          <div>
            <h2 id={headingId}>{formatDayHeading(day.date, today, tomorrow)}</h2>
            {day.isToday && <span>{formatShortDate(day.date)}</span>}
          </div>
          <p>{day.isToday && dayRemainingMinutes > 0 ? `${formatMinutes(dayRemainingMinutes)} remaining` : taskCountLabel(day.tasks.length)}</p>
        </header>

        {groups.length === 0 ? (
          <div className="timeline-empty-day">
            <p>{day.tasks.length > 0 && hideCompleted ? 'Completed tasks are hidden.' : 'No work planned.'}</p>
          </div>
        ) : (
          <div className="timeline-assignment-list">
            {groups.map((group) => {
              const assignment = assignmentById.get(group.assignmentId);
              const progress = assignment && assignment.total_subtasks > 0
                ? { completed: assignment.completed_subtasks, total: assignment.total_subtasks }
                : null;
              return (
                <article key={group.assignmentId} className="timeline-assignment-group">
                  <header className="timeline-assignment-heading">
                    <div className="timeline-assignment-copy">
                      <h3>{group.title}</h3>
                      <p>
                        {assignment?.due_date && <span>Due {formatShortDate(assignment.due_date)}</span>}
                        <span>{group.complexity}</span>
                      </p>
                    </div>
                    {progress !== null && (
                      <p className="timeline-assignment-progress" aria-label={`${group.title} progress`}>
                        {progress.completed} / {progress.total} complete
                      </p>
                    )}
                  </header>

                  <div className="timeline-task-list">
                    {group.tasks.map((task) => (
                      <div key={task.id} className={`timeline-task-row${task.completed ? ' is-completed' : ''}`}>
                        <label className="timeline-task-toggle">
                          <input
                            type="checkbox"
                            checked={!!task.completed}
                            onChange={() => void handleToggle(task.id, !!task.completed)}
                            disabled={togglingId !== null}
                            aria-label={task.completed ? `Mark ${task.task_description} incomplete` : `Mark ${task.task_description} complete`}
                          />
                        </label>
                        <p className="timeline-task-title">{task.task_description}</p>
                        <div className="timeline-task-tail">
                          {typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0 && (
                            <span className="timeline-task-duration">{formatMinutes(task.estimated_minutes)}</span>
                          )}
                          <div className="timeline-task-actions">
                            <button type="button" onClick={() => openEdit(task)} aria-label={`Edit ${task.task_description}`}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className="timeline-task-delete" type="button" onClick={() => void handleDelete(task.id)} disabled={deletingId === task.id} aria-label={`Delete ${task.task_description}`}>
                              {deletingId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {day.tasks.length > 0 && day.tasks.length === completedCount && (
          <span className="sr-only">All tasks complete for this day.</span>
        )}
      </section>
    );
  };

  return (
    <div className="page-shell timeline-page">
      <DashboardNav />
      <main className="app-container app-page timeline-main">
        <header className="timeline-page-header">
          <p className="app-eyebrow">Study agenda</p>
          <h1 className="app-page-heading">Timeline</h1>
          <p className="timeline-current-date">{formatFullDate(today)}</p>
          <p className="timeline-page-description">Your work for today and what&apos;s ahead.</p>
          <div className="timeline-summary-row">
            <p className="timeline-summary" aria-label="Today summary">
              <span>{taskCountLabel(todayTasks.length)}</span>
              <span>{todayCompleted} complete</span>
              {remainingEstimates.length > 0 && <span>{formatMinutes(remainingMinutes)} remaining</span>}
            </p>
            <button
              type="button"
              onClick={() => setHideCompleted((current) => !current)}
              aria-pressed={hideCompleted}
              className={`timeline-completed-filter${hideCompleted ? ' is-active' : ''}`}
            >
              <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              {hideCompleted ? 'Show completed' : 'Hide completed'}
            </button>
          </div>
        </header>

        {metadataWarning && <p className="timeline-metadata-warning" role="status">{metadataWarning}</p>}
        {timelineError && rawTasks.length > 0 && <p className="timeline-metadata-warning" role="alert">{timelineError} Showing the last loaded agenda.</p>}

        {loading ? (
          <div className="timeline-loading" role="status"><Loader2 className="h-5 w-5 animate-spin" />Loading timeline…</div>
        ) : timelineError && rawTasks.length === 0 ? (
          <div className="timeline-load-error" role="alert">
            <h2>Timeline unavailable</h2>
            <p>{timelineError}</p>
            <Button type="button" variant="outline" onClick={() => void fetchTimeline()}>Try again</Button>
          </div>
        ) : (
          <>
            <nav className="timeline-week-overview" aria-label="Upcoming seven days">
              {weekDates.map((dateKey, index) => {
                const tasks = tasksByDate.get(dateKey) || [];
                const completedCount = tasks.filter((task) => task.completed).length;
                const isComplete = tasks.length > 0 && completedCount === tasks.length;
                const date = parseDateKey(dateKey);
                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`timeline-week-day${index === 0 ? ' is-today' : ''}${isComplete ? ' is-complete' : ''}${tasks.length === 0 ? ' is-empty' : ''}`}
                    onClick={() => focusDay(dateKey)}
                    aria-controls={`timeline-day-${dateKey}`}
                    aria-current={index === 0 ? 'date' : undefined}
                    aria-label={`Go to ${formatFullDate(dateKey)}`}
                  >
                    <span className="timeline-week-day-name">{index === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="timeline-week-day-date">{formatShortDate(dateKey)}</span>
                    <span className="timeline-week-day-count">
                      {tasks.length === 0 ? '—' : index === 0 ? `${completedCount} / ${tasks.length}` : taskCountLabel(tasks.length)}
                      {isComplete && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="timeline-agenda">{upcomingDays.map(renderDay)}</div>

            {pastDays.length > 0 && (
              <section className="timeline-earlier" aria-labelledby="timeline-earlier-heading">
                <header className="timeline-earlier-heading">
                  <p className="app-eyebrow">Earlier work</p>
                  <h2 id="timeline-earlier-heading">Past scheduled days</h2>
                </header>
                <div className="timeline-agenda timeline-past-agenda">{pastDays.map(renderDay)}</div>
              </section>
            )}
          </>
        )}
      </main>

      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent className="timeline-edit-dialog">
          <DialogHeader><DialogTitle>Edit Timeline Task</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="timeline-task-desc">Task Description</Label>
              <Input id="timeline-task-desc" value={editForm.task_description} onChange={(event) => setEditForm((current) => ({ ...current, task_description: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4 max-[440px]:grid-cols-1">
              <div className="grid gap-2">
                <Label htmlFor="timeline-task-date">Scheduled Date</Label>
                <Input id="timeline-task-date" type="date" value={editForm.scheduled_date} onChange={(event) => setEditForm((current) => ({ ...current, scheduled_date: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timeline-task-minutes">Minutes</Label>
                <Input id="timeline-task-minutes" type="number" min={1} max={720} value={editForm.estimated_minutes} onChange={(event) => setEditForm((current) => ({ ...current, estimated_minutes: event.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>Cancel</Button>
            <Button onClick={() => void handleSaveEdit()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Timeline;
