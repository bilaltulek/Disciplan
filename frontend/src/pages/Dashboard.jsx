import React, {
  useState, useEffect, useMemo, useRef,
} from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Loader2, Filter, ArrowUpDown, Undo2,
} from 'lucide-react';
import TaskCard from '@/components/features/TaskCard';
import { apiRequest } from '@/shared/api/client';
import { useSettings } from '@/context/SettingsContext';

const Dashboard = () => {
  const { settings } = useSettings();
  const [tasks, setTasks] = useState([]);
  const [pendingDeletions, setPendingDeletions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [sortBy, setSortBy] = useState('dueSoonest');
  const deletionQueueRef = useRef(new Map());

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    complexity: settings.assignment_default_complexity,
    dueDate: '',
    totalItems: settings.assignment_default_items,
  });

  useEffect(() => {
    if (isOpen) return;
    setFormData((prev) => ({
      ...prev,
      complexity: settings.assignment_default_complexity,
      totalItems: settings.assignment_default_items,
    }));
  }, [settings.assignment_default_complexity, settings.assignment_default_items, isOpen]);

  const fetchAssignments = React.useCallback(async () => {
    try {
      const data = await apiRequest('/api/assignments', { method: 'GET', headers: {} });
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  useEffect(() => () => {
    deletionQueueRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    deletionQueueRef.current.clear();
  }, []);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => (
      difficultyFilter === 'All' ? true : task.complexity === difficultyFilter
    ));

    const withProgress = (task) => {
      const total = Number(task.total_subtasks || 0);
      const done = Number(task.completed_subtasks || 0);
      return total === 0 ? 0 : done / total;
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'newest') {
        if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
        return Number(b.id) - Number(a.id);
      }
      if (sortBy === 'mostProgress') return withProgress(b) - withProgress(a);
      const aDue = a.due_date || '9999-12-31';
      const bDue = b.due_date || '9999-12-31';
      return aDue.localeCompare(bDue);
    });
  }, [tasks, difficultyFilter, sortBy]);

  const handleAddTask = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          complexity: formData.complexity,
          dueDate: formData.dueDate,
          totalItems: parseInt(formData.totalItems, 10),
        }),
      });

      await fetchAssignments();
      setIsOpen(false);
      setFormData({
        title: '',
        description: '',
        complexity: settings.assignment_default_complexity,
        dueDate: '',
        totalItems: settings.assignment_default_items,
      });
    } catch (error) {
      alert(error.message || 'Failed to create plan.');
    } finally {
      setLoading(false);
    }
  };

  const removeTaskFromView = (taskId) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const restoreTaskToView = (taskToRestore) => {
    setTasks((prev) => {
      if (prev.some((task) => task.id === taskToRestore.id)) return prev;
      return [taskToRestore, ...prev];
    });
  };

  const finalizeAssignmentDelete = async (task) => {
    try {
      await apiRequest(`/api/assignments/${task.id}`, { method: 'DELETE', headers: {} });
      setPendingDeletions((prev) => prev.filter((item) => item.task.id !== task.id));
      deletionQueueRef.current.delete(task.id);
    } catch (error) {
      setPendingDeletions((prev) => prev.filter((item) => item.task.id !== task.id));
      deletionQueueRef.current.delete(task.id);
      restoreTaskToView(task);
      alert(error.message || 'Failed to delete assignment.');
    }
  };

  const handleDeleteAssignment = (task) => {
    if (deletionQueueRef.current.has(task.id)) return;
    if (settings.confirm_assignment_delete && !window.confirm('Delete this assignment? You can still undo within 5 seconds.')) return;

    removeTaskFromView(task.id);

    const timeoutId = setTimeout(() => {
      finalizeAssignmentDelete(task);
    }, 5000);

    deletionQueueRef.current.set(task.id, timeoutId);
    setPendingDeletions((prev) => [...prev, { task }]);
  };

  const handleUndoDeletion = (taskId) => {
    const timeoutId = deletionQueueRef.current.get(taskId);
    if (timeoutId) clearTimeout(timeoutId);
    deletionQueueRef.current.delete(taskId);

    const pendingItem = pendingDeletions.find((item) => item.task.id === taskId);
    if (pendingItem) restoreTaskToView(pendingItem.task);
    setPendingDeletions((prev) => prev.filter((item) => item.task.id !== taskId));
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <main className="container mx-auto p-6 md:p-10">
        <h2 className="text-2xl font-bold text-foreground mb-6">Current Assignments</h2>

        {pendingDeletions.length > 0 && (
          <div className="mb-5 space-y-2">
            {pendingDeletions.map((item) => (
              <div key={item.task.id} className="glass-chip rounded-xl p-3 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">{item.task.title}</span>
                  {' '}
                  will be deleted in 5 seconds.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="focus-visible:ring-2 focus-visible:ring-primary/60"
                  onClick={() => handleUndoDeletion(item.task.id)}
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Undo
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="glass-panel rounded-2xl p-3 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground pr-2">
            <Filter className="w-4 h-4" />
            Filter
          </div>
          {['All', 'Easy', 'Medium', 'Hard'].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setDifficultyFilter(level)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${difficultyFilter === level ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}
            >
              {level}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="glass-input h-9 rounded-xl px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label="Sort assignments"
            >
              <option value="dueSoonest">Due Soonest</option>
              <option value="newest">Newest</option>
              <option value="mostProgress">Most Progress</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Card className="h-64 border-dashed border-2 border-white/60 bg-transparent hover:bg-white/35 cursor-pointer flex flex-col items-center justify-center group transition-colors">
                <div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
                <span className="font-semibold text-muted-foreground group-hover:text-primary">Add New Assignment</span>
              </Card>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Study Plan</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">Title</Label>
                  <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="col-span-3" placeholder="Calculus Midterm" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="date" className="text-right">Due Date</Label>
                  <Input id="date" type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="items" className="text-right">Workload</Label>
                  <Input id="items" type="number" value={formData.totalItems} onChange={(e) => setFormData({ ...formData, totalItems: e.target.value })} className="col-span-3" placeholder="Num items" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="complexity" className="text-right">Difficulty</Label>
                  <select className="glass-input col-span-3 flex h-10 w-full rounded-xl border px-3 py-2 text-sm" value={formData.complexity} onChange={(e) => setFormData({ ...formData, complexity: e.target.value })}>
                    <option value="Easy">Easy (Review)</option>
                    <option value="Medium">Medium (Standard)</option>
                    <option value="Hard">Hard (Exam Prep)</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="desc" className="text-right pt-2">Description</Label>
                  <Textarea id="desc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="col-span-3" placeholder="Describe the assignment..." />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleAddTask} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Generating...' : 'Create Plan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onDeleteAssignment={handleDeleteAssignment} />
          ))}
        </div>

        {visibleTasks.length === 0 && (
          <Card className="mt-6 p-8 text-center glass-panel">
            <h3 className="text-lg font-semibold text-foreground mb-1">No assignments match this view</h3>
            <p className="text-sm text-muted-foreground">Try switching filters or sorting, or create a new assignment.</p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
