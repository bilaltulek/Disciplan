import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowUpDown, Filter, Loader2, Plus, Undo2,
} from 'lucide-react';
import TaskCard from '@/components/features/TaskCard';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary } from '@/shared/api/types';
import { useSettings } from '@/context/SettingsContext';
import type { Complexity } from '@/shared/settings/defaults';
import { useActiveRunPolling } from '@/shared/hooks/useActiveRunPolling';

type DifficultyFilter = 'All' | Complexity;
type SortOption = 'dueSoonest' | 'newest' | 'mostProgress';
interface AssignmentForm { title: string; description: string; complexity: Complexity; dueDate: string; totalItems: number | string; }
interface CreateAssignmentResponse { queued: boolean; assignment: AssignmentSummary; run: { id: string }; }

const filterClassByLevel: Record<DifficultyFilter, string> = {
  All: 'dashboard-filter-all',
  Easy: 'dashboard-filter-easy',
  Medium: 'dashboard-filter-medium',
  Hard: 'dashboard-filter-hard',
};

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function Dashboard() {
  const { settings } = useSettings();
  const [tasks, setTasks] = useState<AssignmentSummary[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Array<{ task: AssignmentSummary }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [planWarning, setPlanWarning] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('dueSoonest');
  const deletionQueueRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [formData, setFormData] = useState<AssignmentForm>({ title: '', description: '', complexity: settings.assignment_default_complexity, dueDate: '', totalItems: settings.assignment_default_items });

  useEffect(() => {
    if (!isOpen) setFormData((previous) => ({ ...previous, complexity: settings.assignment_default_complexity, totalItems: settings.assignment_default_items }));
  }, [settings.assignment_default_complexity, settings.assignment_default_items, isOpen]);

  const fetchAssignments = useCallback(async () => {
    try {
      setTasks(await apiRequest<AssignmentSummary[]>('/api/assignments', { method: 'GET', headers: {} }));
    } catch (error) { console.error('Failed to fetch assignments:', error); throw error; }
  }, []);

  useEffect(() => { void fetchAssignments().catch(() => undefined); }, [fetchAssignments]);
  useActiveRunPolling(tasks, fetchAssignments);
  useEffect(() => () => { deletionQueueRef.current.forEach((timeout) => clearTimeout(timeout)); deletionQueueRef.current.clear(); }, []);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => difficultyFilter === 'All' || task.complexity === difficultyFilter);
    const progress = (task: AssignmentSummary) => task.total_subtasks === 0 ? 0 : task.completed_subtasks / task.total_subtasks;
    return [...filtered].sort((left, right) => {
      if (sortBy === 'newest') return left.created_at && right.created_at ? right.created_at.localeCompare(left.created_at) : right.id - left.id;
      if (sortBy === 'mostProgress') return progress(right) - progress(left);
      return (left.due_date || '9999-12-31').localeCompare(right.due_date || '9999-12-31');
    });
  }, [tasks, difficultyFilter, sortBy]);

  const resetForm = () => setFormData({ title: '', description: '', complexity: settings.assignment_default_complexity, dueDate: '', totalItems: settings.assignment_default_items });
  const handleAddTask = async () => {
    setLoading(true); setPlanWarning('');
    try {
      const result = await apiRequest<CreateAssignmentResponse>('/api/assignments', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ ...formData, totalItems: Number.parseInt(String(formData.totalItems), 10) }) });
      await fetchAssignments(); setIsOpen(false); resetForm();
      if (!result.queued) setPlanWarning('A deterministic fallback plan was published because agent planning is not active for this environment.');
    } catch (error) { alert(errorMessage(error, 'Failed to create plan.')); } finally { setLoading(false); }
  };
  const restoreTaskToView = (task: AssignmentSummary) => setTasks((previous) => previous.some((entry) => entry.id === task.id) ? previous : [task, ...previous]);
  const finalizeAssignmentDelete = async (task: AssignmentSummary) => {
    try { await apiRequest(`/api/assignments/${task.id}`, { method: 'DELETE', headers: {} }); setPendingDeletions((previous) => previous.filter((item) => item.task.id !== task.id)); deletionQueueRef.current.delete(task.id); }
    catch (error) { setPendingDeletions((previous) => previous.filter((item) => item.task.id !== task.id)); deletionQueueRef.current.delete(task.id); restoreTaskToView(task); alert(errorMessage(error, 'Failed to delete assignment.')); }
  };
  const handleDeleteAssignment = (task: AssignmentSummary) => {
    if (deletionQueueRef.current.has(task.id) || (settings.confirm_assignment_delete && !window.confirm('Delete this assignment? You can still undo within 5 seconds.'))) return;
    setTasks((previous) => previous.filter((entry) => entry.id !== task.id));
    deletionQueueRef.current.set(task.id, setTimeout(() => { void finalizeAssignmentDelete(task); }, 5000));
    setPendingDeletions((previous) => [...previous, { task }]);
  };
  const handleUndoDeletion = (taskId: number) => {
    const timeout = deletionQueueRef.current.get(taskId); if (timeout) clearTimeout(timeout); deletionQueueRef.current.delete(taskId);
    const pending = pendingDeletions.find((item) => item.task.id === taskId); if (pending) restoreTaskToView(pending.task);
    setPendingDeletions((previous) => previous.filter((item) => item.task.id !== taskId));
  };
  const handleRunAction = async (runId: string, action: 'retry' | 'cancel') => {
    try { await apiRequest(`/api/agent-runs/${runId}/${action}`, { method: 'POST', headers: {} }); await fetchAssignments(); }
    catch (error) { alert(errorMessage(error, `Failed to ${action} plan generation.`)); }
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <main className="app-container app-page">
        <header className="mb-7">
          <h1 className="app-page-heading">Current Assignments</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create plans, monitor progress, and continue the next useful step.</p>
        </header>

        {planWarning && (
          <div className="app-notice app-notice-warning">
            <p className="text-sm">{planWarning}</p>
            <button type="button" onClick={() => setPlanWarning('')} className="min-h-10 shrink-0 text-xs font-medium underline underline-offset-4">Dismiss</button>
          </div>
        )}

        {pendingDeletions.length > 0 && (
          <div className="mb-5 space-y-2">
            {pendingDeletions.map(({ task }) => (
              <div key={task.id} className="app-notice">
                <p className="text-sm"><span className="font-semibold">{task.title}</span> will be deleted in 5 seconds.</p>
                <Button type="button" variant="outline" onClick={() => handleUndoDeletion(task.id)}><Undo2 className="mr-2 h-4 w-4" />Undo</Button>
              </div>
            ))}
          </div>
        )}

        <div className="dashboard-toolbar app-card">
          <div className="dashboard-toolbar-label"><Filter className="h-4 w-4" />Filter</div>
          {(['All', 'Easy', 'Medium', 'Hard'] as DifficultyFilter[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setDifficultyFilter(level)}
              className={`dashboard-filter ${filterClassByLevel[level]}${difficultyFilter === level ? ' is-active' : ''}`}
              aria-pressed={difficultyFilter === level}
            >
              {level}
            </button>
          ))}
          <div className="dashboard-sort">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="app-select h-10 px-3 text-sm" aria-label="Sort assignments">
              <option value="dueSoonest">Due Soonest</option>
              <option value="newest">Newest</option>
              <option value="mostProgress">Most Progress</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <button type="button" className="dashboard-add-card">
                <span className="dashboard-add-icon" aria-hidden="true"><Plus className="h-5 w-5" /></span>
                <span className="font-semibold">Add New Assignment</span>
              </button>
            </DialogTrigger>
            <DialogContent className="assignment-dialog sm:max-w-[500px]">
              <DialogHeader><DialogTitle>Create New Study Plan</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-3">
                <div className="flex flex-col gap-1.5"><Label htmlFor="title">Title</Label><Input id="title" value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} placeholder="Calculus Midterm" /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="date">Due Date</Label><Input id="date" type="date" value={formData.dueDate} onChange={(event) => setFormData({ ...formData, dueDate: event.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="items">Workload</Label><Input id="items" type="number" value={formData.totalItems} onChange={(event) => setFormData({ ...formData, totalItems: event.target.value })} placeholder="Num items" /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="complexity">Difficulty</Label><select id="complexity" className="app-select flex h-10 w-full px-3 py-2 text-sm" value={formData.complexity} onChange={(event) => setFormData({ ...formData, complexity: event.target.value as Complexity })}><option value="Easy">Easy (Review)</option><option value="Medium">Medium (Standard)</option><option value="Hard">Hard (Exam Prep)</option></select></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="desc">Description</Label><Textarea id="desc" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} placeholder="Describe the assignment..." /></div>
              </div>
              <DialogFooter><Button type="button" onClick={() => void handleAddTask()} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? 'Queuing...' : 'Create Plan'}</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onDeleteAssignment={handleDeleteAssignment} onRetryRun={(runId) => void handleRunAction(runId, 'retry')} onCancelRun={(runId) => void handleRunAction(runId, 'cancel')} />
          ))}
        </div>

        {visibleTasks.length === 0 && (
          <Card className="mt-6 p-8 text-center">
            <h2 className="mb-1 text-lg font-semibold">No assignments match this view</h2>
            <p className="text-sm text-muted-foreground">Try switching filters or sorting, or create a new assignment.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
