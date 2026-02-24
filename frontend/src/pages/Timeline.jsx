import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import {
  CheckCircle2, Pencil, Trash2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/shared/api/client';

const getToday = () => new Date().toISOString().split('T')[0];

const NeuralNode = ({
  date,
  tasks,
  isToday,
  isSelected,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  disabled,
  nodeRef,
}) => (
  <div className="relative flex items-start mb-16 group">
    <div className="absolute left-[29px] top-10 w-0.5 h-full bg-gradient-to-b from-sky-300 to-white/60 -z-10" />
    <button
      type="button"
      onClick={() => onSelect(date)}
      ref={nodeRef}
      className={`w-16 h-16 rounded-full flex flex-col items-center justify-center border-2 z-10 glass-panel transition-all duration-300 ${isToday ? 'border-primary shadow-cyan-200 shadow-lg' : 'border-white/55'} ${isSelected ? 'scale-110 ring-2 ring-primary/50' : ''}`}
    >
      <span className="text-xs font-bold text-muted-foreground uppercase">{new Date(date).toLocaleString('en-US', { weekday: 'short' })}</span>
      <span className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>{new Date(date).getDate()}</span>
    </button>
    <div className="w-12 h-0.5 mt-8 bg-white/60 group-hover:bg-primary/35 transition-colors" />
    <div className="flex-1">
      {tasks.length === 0 ? (
        <div className="p-4 rounded-xl glass-chip text-sm text-muted-foreground">No tasks scheduled for this day.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((task) => (
            <div key={task.id} className={`relative p-4 rounded-xl border-l-4 shadow-sm glass-panel hover:shadow-md transition-all ${task.completed ? 'opacity-60 grayscale' : ''} ${task.complexity === 'Hard' ? 'border-l-red-500' : task.complexity === 'Medium' ? 'border-l-yellow-400' : 'border-l-cyan-400'}`}>
              <div className="flex justify-between items-start mb-1">
                <h4 className={`font-bold text-sm ${task.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.assignment_title}</h4>
                <button disabled={disabled} onClick={() => onToggle(task.id, task.completed)} className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 hover:border-primary'}`}>
                  {task.completed && <CheckCircle2 className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{task.task_description}</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(task)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const Timeline = () => {
  const [rawTasks, setRawTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [today, setToday] = useState(getToday());
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({ task_description: '', scheduled_date: '', estimated_minutes: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [isTodayVisible, setIsTodayVisible] = useState(true);
  const todayNodeRef = useRef(null);

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
    setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(() => setToday(getToday()), timeoutMs);
    return () => clearTimeout(timer);
  }, [today]);

  const timelineData = useMemo(() => {
    const sourceTasks = hideCompleted ? rawTasks.filter((task) => !task.completed) : rawTasks;

    const grouped = sourceTasks.reduce((acc, task) => {
      const date = task.scheduled_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(task);
      return acc;
    }, {});

    if (!grouped[today]) grouped[today] = [];

    return Object.keys(grouped).sort().map((date) => ({
      date,
      tasks: grouped[date],
      isToday: date === today,
      isSelected: date === selectedDate,
    }));
  }, [rawTasks, selectedDate, today, hideCompleted]);

  useEffect(() => {
    if (loading) return;
    if (todayNodeRef.current) {
      todayNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, today, timelineData.length]);

  useEffect(() => {
    if (loading || !todayNodeRef.current) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsTodayVisible(entry.isIntersecting),
      { root: null, threshold: 0.5 },
    );
    observer.observe(todayNodeRef.current);

    return () => observer.disconnect();
  }, [loading, timelineData.length, today]);

  const handleToggle = async (taskId, currentStatus) => {
    if (toggling) return;

    const previous = rawTasks;
    setRawTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !currentStatus } : t)));
    setToggling(true);

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !currentStatus }),
      });
    } catch (error) {
      setRawTasks(previous);
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
      setRawTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (error) {
      console.error('Failed to delete task', error);
      alert(error.message || 'Failed to delete task.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10">
        <h2 className="text-3xl font-bold text-foreground mb-2">Neural Timeline</h2>
        <p className="text-sm text-muted-foreground mb-8">Today is auto-selected. Past tasks older than 10 days are automatically removed.</p>
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setHideCompleted((prev) => !prev)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${hideCompleted ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}
          >
            {hideCompleted ? 'Showing Incomplete Only' : 'Hide Completed'}
          </button>
        </div>
        <div className="max-w-4xl mx-auto pl-4 md:pl-0 pb-20">
          {loading ? <div className="text-muted-foreground">Loading...</div>
            : timelineData.map((day) => (
              <NeuralNode
                key={day.date}
                {...day}
                onSelect={setSelectedDate}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={handleDelete}
                disabled={toggling || deletingId !== null}
                nodeRef={day.isToday ? todayNodeRef : null}
              />
            ))}
        </div>
      </div>

      {!isTodayVisible && !loading && (
        <Button
          type="button"
          className="fixed bottom-6 right-6 glass-accent rounded-full px-4 py-2 focus-visible:ring-2 focus-visible:ring-primary/60"
          onClick={() => {
            setSelectedDate(today);
            todayNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          Jump to Today
        </Button>
      )}

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
