import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/shared/api/client';
import type { ScheduledTask } from '@/shared/api/types';
import type { Complexity } from '@/shared/settings/defaults';

type ComplexityFilter = 'All' | Complexity;
type EditForm = {
  task_description: string;
  scheduled_date: string;
  estimated_minutes: string;
  actual_minutes: string;
};

const emptyForm: EditForm = {
  task_description: '', scheduled_date: '', estimated_minutes: '', actual_minutes: '',
};
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const filterClassByLevel: Record<ComplexityFilter, string> = {
  All: 'history-filter',
  Easy: 'history-filter history-filter-easy',
  Medium: 'history-filter history-filter-medium',
  Hard: 'history-filter history-filter-hard',
};
const difficultyClassByLevel: Record<Complexity, string> = {
  Easy: 'difficulty-chip difficulty-easy',
  Medium: 'difficulty-chip difficulty-medium',
  Hard: 'difficulty-chip difficulty-hard',
};

export default function History() {
  const [history, setHistory] = useState<ScheduledTask[]>([]);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [complexityFilter, setComplexityFilter] = useState<ComplexityFilter>('All');

  const fetchHistory = useCallback(async () => {
    try {
      setHistory(await apiRequest<ScheduledTask[]>('/api/history', { method: 'GET', headers: {} }));
    } catch (error) {
      console.error('Failed to load history', error);
    }
  }, []);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const stats = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return {
      totalTasks: history.length,
      totalMinutes: history.reduce((total, task) => total + (task.actual_minutes ?? task.estimated_minutes ?? 0), 0),
      weeklyTasks: history.filter((task) => new Date(task.completed_at || task.scheduled_date) >= oneWeekAgo).length,
    };
  }, [history]);

  const filteredHistory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return history.filter((task) => (
      (complexityFilter === 'All' || task.complexity === complexityFilter)
      && (!query || task.task_description.toLowerCase().includes(query) || task.assignment_title.toLowerCase().includes(query))
    ));
  }, [history, complexityFilter, searchQuery]);

  const openEdit = (task: ScheduledTask) => {
    setEditTask(task);
    setEditForm({
      task_description: task.task_description,
      scheduled_date: task.scheduled_date,
      estimated_minutes: String(task.estimated_minutes || 30),
      actual_minutes: task.actual_minutes ? String(task.actual_minutes) : '',
    });
  };

  const saveEdit = async () => {
    if (!editTask) return;
    setSaving(true);
    try {
      await apiRequest(`/api/tasks/${editTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          estimated_minutes: Number.parseInt(editForm.estimated_minutes, 10),
          actual_minutes: editForm.actual_minutes ? Number.parseInt(editForm.actual_minutes, 10) : null,
          completed: true,
        }),
      });
      setEditTask(null);
      await fetchHistory();
    } catch (error) {
      alert(errorMessage(error, 'Failed to update task.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (taskId: number) => {
    if (!window.confirm('Delete this task permanently?')) return;
    setBusyTaskId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE', headers: {} });
      await fetchHistory();
    } catch (error) {
      alert(errorMessage(error, 'Failed to delete task.'));
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <main className="app-container app-page history-page">
        <header className="history-heading">
          <p className="app-eyebrow">Completed work</p>
          <h1 className="app-page-heading">Completion History</h1>
          <p>Review what you finished, how long it took, and the work building your momentum.</p>
        </header>
        <Card className="history-summary" aria-label="Completion summary">
          <dl>
            <div><dt>Tasks completed</dt><dd>{stats.totalTasks}</dd></div>
            <div><dt>Study time</dt><dd>{Math.round(stats.totalMinutes / 60)} <span>hours</span></dd></div>
            <div><dt>Last 7 days</dt><dd>{stats.weeklyTasks}</dd></div>
          </dl>
        </Card>
        <section className="history-activity" aria-labelledby="history-activity-title">
          <div className="history-activity-heading">
            <div><p className="app-eyebrow">Archive</p><h2 id="history-activity-title">Recent activity</h2></div>
            <p>{filteredHistory.length} of {history.length} completed tasks</p>
          </div>
          <Card className="history-log">
            <div className="history-toolbar">
              <label className="history-search"><Search aria-hidden="true" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search task or assignment" aria-label="Search completed tasks" /></label>
              <div className="history-filters" aria-label="Filter completion history by difficulty">
              {(['All', 'Easy', 'Medium', 'Hard'] as ComplexityFilter[]).map((level) => (
                <button key={level} type="button" onClick={() => setComplexityFilter(level)} aria-pressed={complexityFilter === level} className={`${filterClassByLevel[level]} ${complexityFilter === level ? 'is-active' : ''}`}>{level}</button>
              ))}
              </div>
            </div>
            {filteredHistory.length === 0 ? <div className="history-empty">No completed tasks match your filters.</div> : (
              <ol className="history-list">{filteredHistory.map((task) => (
                <li key={task.id} className="history-row">
                  <span className="history-complete-mark" aria-hidden="true"><CheckCircle2 /></span>
                  <div className="history-task-copy">
                    <h3>{task.task_description}</h3>
                    <div className="history-task-meta"><span>{task.assignment_title}</span><span><Calendar />{task.completed_at ? new Date(task.completed_at).toLocaleDateString() : task.scheduled_date}</span><span className={difficultyClassByLevel[task.complexity]}>{task.complexity}</span></div>
                  </div>
                  <div className="history-row-actions">
                    <Badge variant="outline" className="history-duration"><Clock />{task.actual_minutes ?? task.estimated_minutes}m <span>{task.actual_minutes ? 'actual' : 'estimated'}</span></Badge>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(task)} aria-label="Edit completed task"><Pencil /></Button>
                    <Button className="history-delete" variant="ghost" size="icon" disabled={busyTaskId === task.id} onClick={() => void deleteTask(task.id)} aria-label="Delete completed task">{busyTaskId === task.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>
                  </div>
                </li>
              ))}</ol>
            )}
          </Card>
        </section>
      </main>
      <Dialog open={Boolean(editTask)} onOpenChange={(open) => { if (!open) setEditTask(null); }}>
        <DialogContent className="history-edit-dialog">
          <DialogHeader><DialogTitle>Edit Completed Task</DialogTitle></DialogHeader>
          <div className="history-edit-fields">
            <Field label="Task Description" id="task-desc"><Input id="task-desc" value={editForm.task_description} onChange={(event) => setEditForm((current) => ({ ...current, task_description: event.target.value }))} /></Field>
            <div className="history-edit-grid">
              <Field label="Scheduled Date" id="task-date"><Input id="task-date" type="date" value={editForm.scheduled_date} onChange={(event) => setEditForm((current) => ({ ...current, scheduled_date: event.target.value }))} /></Field>
              <Field label="Estimated" id="task-minutes"><Input id="task-minutes" type="number" min={1} max={720} value={editForm.estimated_minutes} onChange={(event) => setEditForm((current) => ({ ...current, estimated_minutes: event.target.value }))} /></Field>
              <Field label="Actual" id="actual-minutes"><Input id="actual-minutes" type="number" min={1} max={1440} value={editForm.actual_minutes} onChange={(event) => setEditForm((current) => ({ ...current, actual_minutes: event.target.value }))} placeholder="Optional" /></Field>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditTask(null)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="history-field"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
