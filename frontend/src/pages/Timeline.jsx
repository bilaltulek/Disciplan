import React, {
  useState, useEffect, useMemo, useCallback,
} from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import {
  ChevronLeft, ChevronRight, Loader2, Pencil, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/shared/api/client';

const ANIMATION_LOCK_MS = 300;
const VISIBLE_DEPTH = 2;

const getToday = () => new Date().toISOString().split('T')[0];

const parseDateKey = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const eachDateInRange = (startKey, endKey) => {
  const cursor = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const keys = [];
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

const buildHeaderLabel = (dateKey, todayKey) => {
  const date = parseDateKey(dateKey);
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (dateKey === todayKey) return `Today, ${monthDay}`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const Timeline = () => {
  const [rawTasks, setRawTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [today, setToday] = useState(getToday());
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [transitionMeta, setTransitionMeta] = useState({ prevIndex: null, direction: 0, running: false });
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({ task_description: '', scheduled_date: '', estimated_minutes: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [hideCompleted, setHideCompleted] = useState(false);

  const fetchTimeline = useCallback(async () => {
    try {
      const tasks = await apiRequest('/api/timeline', { method: 'GET', headers: {} });
      setRawTasks(tasks);
    } catch (error) {
      console.error('Failed to load timeline', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(() => setToday(getToday()), timeoutMs);
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const visibleTasks = useMemo(
    () => (hideCompleted ? rawTasks.filter((task) => !task.completed) : rawTasks),
    [rawTasks, hideCompleted],
  );

  const dateLayers = useMemo(() => {
    const grouped = visibleTasks.reduce((acc, task) => {
      if (!acc[task.scheduled_date]) acc[task.scheduled_date] = [];
      acc[task.scheduled_date].push(task);
      return acc;
    }, {});

    const allTaskDates = Object.keys(grouped);
    const minDate = allTaskDates.length > 0 ? allTaskDates[0] : today;
    const maxDate = allTaskDates.length > 0 ? allTaskDates[allTaskDates.length - 1] : today;
    const startKey = minDate < today ? minDate : today;
    const endKey = maxDate > today ? maxDate : today;
    const continuousDates = eachDateInRange(startKey, endKey);

    return continuousDates.map((dateKey) => {
      const tasks = grouped[dateKey] || [];
      const completedCount = tasks.filter((task) => !!task.completed).length;
      return {
        date: dateKey,
        tasks,
        completedCount,
        totalCount: tasks.length,
        isToday: dateKey === today,
        headerLabel: buildHeaderLabel(dateKey, today),
      };
    });
  }, [visibleTasks, today]);

  useEffect(() => {
    if (dateLayers.length === 0) {
      setActiveIndex(0);
      return;
    }
    const todayIndex = dateLayers.findIndex((layer) => layer.date === today);
    if (todayIndex >= 0) {
      setActiveIndex((prev) => (prev >= 0 && prev < dateLayers.length ? prev : todayIndex));
    } else {
      setActiveIndex((prev) => Math.min(Math.max(prev, 0), dateLayers.length - 1));
    }
  }, [dateLayers, today]);

  const activeLayer = dateLayers[activeIndex] || null;

  const stepDay = useCallback((direction) => {
    if (isAnimating || dateLayers.length === 0) return;
    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= dateLayers.length) return;

    setIsAnimating(true);
    setTransitionMeta({ prevIndex: activeIndex, direction, running: true });
    setActiveIndex(nextIndex);

    window.setTimeout(() => {
      setTransitionMeta({ prevIndex: null, direction: 0, running: false });
      setIsAnimating(false);
    }, ANIMATION_LOCK_MS);
  }, [activeIndex, dateLayers.length, isAnimating]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        stepDay(1);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        stepDay(-1);
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        const todayIndex = dateLayers.findIndex((layer) => layer.date === today);
        if (todayIndex >= 0) setActiveIndex(todayIndex);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dateLayers, stepDay, today]);

  const maybeAutoAdvance = useCallback((nextTasks, activeDate) => {
    if (!activeDate) return;
    const dayTasks = nextTasks.filter((task) => task.scheduled_date === activeDate);
    if (dayTasks.length === 0) return;
    if (dayTasks.every((task) => !!task.completed)) {
      stepDay(1);
    }
  }, [stepDay]);

  const handleToggle = async (taskId, currentStatus) => {
    if (toggling) return;

    const activeDate = activeLayer?.date;
    let optimisticTasks = rawTasks;

    setRawTasks((prev) => {
      optimisticTasks = prev.map((task) => (task.id === taskId ? { ...task, completed: !currentStatus } : task));
      return optimisticTasks;
    });
    setToggling(true);

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !currentStatus }),
      });
      if (!currentStatus) maybeAutoAdvance(optimisticTasks, activeDate);
    } catch (error) {
      setRawTasks(rawTasks);
      console.error('Failed to toggle task', error);
    } finally {
      setToggling(false);
    }
  };

  const openEdit = (task) => {
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
      await fetchTimeline();
    } catch (error) {
      console.error('Failed to update task', error);
      alert(error.message || 'Failed to update task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this timeline task permanently?')) return;
    setDeletingId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE', headers: {} });
      setRawTasks((prev) => prev.filter((task) => task.id !== taskId));
    } catch (error) {
      console.error('Failed to delete task', error);
      alert(error.message || 'Failed to delete task.');
    } finally {
      setDeletingId(null);
    }
  };

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < dateLayers.length - 1;
  const visibleIndices = useMemo(() => {
    const indices = [];
    for (let idx = Math.max(0, activeIndex - VISIBLE_DEPTH); idx <= Math.min(dateLayers.length - 1, activeIndex + VISIBLE_DEPTH); idx += 1) {
      indices.push(idx);
    }
    if (transitionMeta.running && transitionMeta.prevIndex !== null && !indices.includes(transitionMeta.prevIndex)) {
      indices.push(transitionMeta.prevIndex);
    }
    return indices.sort((a, b) => a - b);
  }, [activeIndex, dateLayers.length, transitionMeta]);

  return (
    <div className="timeline-warp-page">
      <DashboardNav />
      <main className="timeline-depth-stage">
        <div className="absolute top-4 left-0 right-0 z-30 flex justify-center">
          <button
            type="button"
            onClick={() => setHideCompleted((prev) => !prev)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${hideCompleted ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}
          >
            {hideCompleted ? 'Showing Incomplete Only' : 'Hide Completed'}
          </button>
        </div>

        <button
          type="button"
          className="timeline-nav-arrow timeline-nav-arrow-left"
          onClick={() => stepDay(-1)}
          disabled={!canPrev || isAnimating}
          aria-label="Previous Day"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          type="button"
          className="timeline-nav-arrow timeline-nav-arrow-right"
          onClick={() => stepDay(1)}
          disabled={!canNext || isAnimating}
          aria-label="Next Day"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {loading ? (
          <div className="text-muted-foreground z-20">Loading...</div>
        ) : (
          <div className="timeline-depth-stack">
            {visibleIndices.map((idx) => {
              const layer = dateLayers[idx];
              if (!layer) return null;

              const delta = idx - activeIndex;
              const isFront = delta === 0;
              const isExiting = transitionMeta.running && transitionMeta.prevIndex === idx;
              const isEntering = transitionMeta.running && idx === activeIndex;
              const directionClass = transitionMeta.direction > 0
                ? 'timeline-depth-dir-next'
                : transitionMeta.direction < 0
                  ? 'timeline-depth-dir-prev'
                  : '';

              return (
                <section
                  key={layer.date}
                  className={`timeline-depth-layer ${isFront ? 'timeline-depth-front' : ''} ${delta > 0 ? 'timeline-depth-future' : ''} ${delta < 0 ? 'timeline-depth-past' : ''} ${isExiting ? 'timeline-depth-exiting' : ''} ${isEntering ? 'timeline-depth-entering' : ''} ${directionClass}`}
                  style={{
                    '--depth-z': `${-230 * Math.abs(delta)}px`,
                    '--depth-scale': Math.max(0.76, 1 - Math.abs(delta) * 0.1),
                    '--depth-blur': `${Math.abs(delta) * 1.4}px`,
                    '--depth-opacity': Math.max(0.22, 1 - Math.abs(delta) * 0.2),
                    '--depth-y': `${delta < 0 ? Math.abs(delta) * 10 : 0}px`,
                    zIndex: 120 - Math.abs(delta),
                  }}
                >
                  <article className="timeline-day-panel">
                    <header className="timeline-day-panel-header">
                      <h3>{layer.headerLabel}</h3>
                      <p>{layer.completedCount}/{layer.totalCount} completed</p>
                    </header>

                    <div className="timeline-day-panel-body timeline-scrollbar-none">
                      {isFront ? (
                        layer.tasks.length === 0 ? (
                          <div className="timeline-empty-state">
                            <p>No tasks scheduled for this day.</p>
                            <p>Use the arrows to check nearby dates.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {layer.tasks.map((task) => (
                              <div key={task.id} className={`timeline-task-row ${task.completed ? 'timeline-task-row-completed' : ''}`}>
                                <label className="timeline-task-toggle">
                                  <input
                                    type="checkbox"
                                    checked={!!task.completed}
                                    onChange={() => handleToggle(task.id, !!task.completed)}
                                    disabled={toggling}
                                    aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                                  />
                                </label>
                                <div className="timeline-task-content timeline-task-row-content">
                                  <p className="timeline-task-title">{task.task_description}</p>
                                  <div className="timeline-task-meta">
                                    <span className="timeline-chip">{task.assignment_title}</span>
                                    <span className={`timeline-chip ${task.complexity === 'Hard' ? 'timeline-chip-hard' : task.complexity === 'Medium' ? 'timeline-chip-medium' : 'timeline-chip-easy'}`}>{task.complexity}</span>
                                    <span className="timeline-chip">{task.estimated_minutes}m</span>
                                  </div>
                                </div>
                                <div className="timeline-task-actions">
                                  <button type="button" onClick={() => openEdit(task)} aria-label="Edit task">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => handleDelete(task.id)} disabled={deletingId === task.id} aria-label="Delete task">
                                    {deletingId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="timeline-depth-placeholder" aria-hidden="true">
                          <div className="timeline-depth-placeholder-line w-[78%]" />
                          <div className="timeline-depth-placeholder-line w-[62%]" />
                          <div className="timeline-depth-placeholder-line w-[70%]" />
                        </div>
                      )}
                    </div>
                  </article>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Timeline Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="timeline-task-desc">Task Description</Label>
              <Input id="timeline-task-desc" value={editForm.task_description} onChange={(e) => setEditForm((prev) => ({ ...prev, task_description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="timeline-task-date">Scheduled Date</Label>
                <Input id="timeline-task-date" type="date" value={editForm.scheduled_date} onChange={(e) => setEditForm((prev) => ({ ...prev, scheduled_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timeline-task-minutes">Minutes</Label>
                <Input id="timeline-task-minutes" type="number" min={1} max={720} value={editForm.estimated_minutes} onChange={(e) => setEditForm((prev) => ({ ...prev, estimated_minutes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
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
