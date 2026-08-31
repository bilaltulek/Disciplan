import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Flame, Loader2, Pencil, Trash2, Trophy } from 'lucide-react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <div className="container mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 glass-chip rounded-full text-yellow-600"><Trophy className="w-6 h-6" /></div>
          <div><h1 className="text-3xl font-bold text-foreground">Completion History</h1><p className="text-muted-foreground">Track your academic momentum</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatCard label="Tasks Completed" value={String(stats.totalTasks)} />
          <StatCard label="Study Time" value={`${Math.round(stats.totalMinutes / 60)} hours`} />
          <StatCard label="Completed (Last 7 Days)" value={String(stats.weeklyTasks)} icon={<Flame className="w-7 h-7" />} />
        </div>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="max-w-sm glass-input" placeholder="Search task or assignment" aria-label="Search completed tasks" />
              {(['All', 'Easy', 'Medium', 'Hard'] as ComplexityFilter[]).map((level) => (
                <button key={level} type="button" onClick={() => setComplexityFilter(level)} className={`px-3 py-1.5 rounded-full text-sm border ${complexityFilter === level ? 'glass-chip text-foreground' : 'text-muted-foreground'}`}>{level}</button>
              ))}
            </div>
            {filteredHistory.length === 0 ? <div className="text-center py-10 text-muted-foreground">No completed tasks match your filters.</div> : (
              <div className="space-y-4">{filteredHistory.map((task) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4 glass-chip rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-100/70 p-2 rounded-full"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <h4 className="font-bold text-foreground line-through decoration-muted-foreground">{task.task_description}</h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1"><span className="font-medium text-primary">{task.assignment_title}</span><span>•</span><span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{task.completed_at ? new Date(task.completed_at).toLocaleDateString() : task.scheduled_date}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{task.actual_minutes ?? task.estimated_minutes}m {task.actual_minutes ? 'actual' : 'estimated'}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(task)} aria-label="Edit completed task"><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={busyTaskId === task.id} onClick={() => void deleteTask(task.id)} aria-label="Delete completed task">{busyTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}</Button>
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={Boolean(editTask)} onOpenChange={(open) => { if (!open) setEditTask(null); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle>Edit Completed Task</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Task Description" id="task-desc"><Input id="task-desc" value={editForm.task_description} onChange={(event) => setEditForm((current) => ({ ...current, task_description: event.target.value }))} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><div className="text-4xl font-bold text-foreground flex items-center gap-2">{icon}{value}</div></CardContent></Card>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
