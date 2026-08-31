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

  return <div className="page-shell"><DashboardNav /><main className="container mx-auto p-6 md:p-10">
    <h2 className="text-2xl font-bold text-foreground mb-6">Current Assignments</h2>
    {planWarning && <div className="mb-5 glass-chip rounded-xl p-3 flex items-center justify-between gap-3 border-amber-300/70 bg-amber-50/60"><p className="text-sm text-amber-800">{planWarning}</p><button type="button" onClick={() => setPlanWarning('')} className="text-xs text-amber-700 hover:text-amber-900 underline shrink-0">Dismiss</button></div>}
    {pendingDeletions.length > 0 && <div className="mb-5 space-y-2">{pendingDeletions.map(({ task }) => <div key={task.id} className="glass-chip rounded-xl p-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-700"><span className="font-semibold">{task.title}</span> will be deleted in 5 seconds.</p><Button type="button" variant="outline" className="focus-visible:ring-2 focus-visible:ring-primary/60" onClick={() => handleUndoDeletion(task.id)}><Undo2 className="w-4 h-4 mr-2" />Undo</Button></div>)}</div>}
    <div className="glass-panel rounded-2xl p-3 mb-6 flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 text-sm text-muted-foreground pr-2"><Filter className="w-4 h-4" />Filter</div>{(['All', 'Easy', 'Medium', 'Hard'] as DifficultyFilter[]).map((level) => <button key={level} type="button" onClick={() => setDifficultyFilter(level)} className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${difficultyFilter === level ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}>{level}</button>)}<div className="ml-auto flex items-center gap-2"><ArrowUpDown className="w-4 h-4 text-muted-foreground" /><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="glass-input h-9 rounded-xl px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" aria-label="Sort assignments"><option value="dueSoonest">Due Soonest</option><option value="newest">Newest</option><option value="mostProgress">Most Progress</option></select></div></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"><Dialog open={isOpen} onOpenChange={setIsOpen}><DialogTrigger asChild><Card className="h-64 border-dashed border-2 border-white/60 bg-transparent hover:bg-white/35 cursor-pointer flex flex-col items-center justify-center group transition-colors"><div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Plus className="w-8 h-8 text-primary" /></div><span className="font-semibold text-muted-foreground group-hover:text-primary">Add New Assignment</span></Card></DialogTrigger><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle>Create New Study Plan</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div className="flex flex-col gap-1.5"><Label htmlFor="title">Title</Label><Input id="title" value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} placeholder="Calculus Midterm" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="date">Due Date</Label><Input id="date" type="date" value={formData.dueDate} onChange={(event) => setFormData({ ...formData, dueDate: event.target.value })} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="items">Workload</Label><Input id="items" type="number" value={formData.totalItems} onChange={(event) => setFormData({ ...formData, totalItems: event.target.value })} placeholder="Num items" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="complexity">Difficulty</Label><select className="glass-input flex h-10 w-full rounded-xl border px-3 py-2 text-sm" value={formData.complexity} onChange={(event) => setFormData({ ...formData, complexity: event.target.value as Complexity })}><option value="Easy">Easy (Review)</option><option value="Medium">Medium (Standard)</option><option value="Hard">Hard (Exam Prep)</option></select></div><div className="flex flex-col gap-1.5"><Label htmlFor="desc">Description</Label><Textarea id="desc" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} placeholder="Describe the assignment..." /></div></div><DialogFooter><Button type="button" onClick={() => void handleAddTask()} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? 'Queuing...' : 'Create Plan'}</Button></DialogFooter></DialogContent></Dialog>{visibleTasks.map((task) => <TaskCard key={task.id} task={task} onDeleteAssignment={handleDeleteAssignment} onRetryRun={(runId) => void handleRunAction(runId, 'retry')} onCancelRun={(runId) => void handleRunAction(runId, 'cancel')} />)}</div>
    {visibleTasks.length === 0 && <Card className="mt-6 p-8 text-center glass-panel"><h3 className="text-lg font-semibold text-foreground mb-1">No assignments match this view</h3><p className="text-sm text-muted-foreground">Try switching filters or sorting, or create a new assignment.</p></Card>}
  </main></div>;
}
