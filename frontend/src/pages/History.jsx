import React, { useState, useEffect, useCallback } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2, Clock, Trophy, Calendar, Pencil, Trash2, Loader2, Flame,
} from 'lucide-react';
import { apiRequest } from '@/shared/api/client';

const History = () => {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalTasks: 0, totalMinutes: 0, weeklyTasks: 0,
  });
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({ task_description: '', scheduled_date: '', estimated_minutes: '' });
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [complexityFilter, setComplexityFilter] = useState('All');

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiRequest('/api/history', { method: 'GET', headers: {} });
      setHistory(data);

      const minutes = data.reduce((acc, curr) => acc + (curr.estimated_minutes || 0), 0);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weeklyTasks = data.filter((task) => new Date(task.scheduled_date) >= oneWeekAgo).length;
      setStats({
        totalTasks: data.length,
        totalMinutes: minutes,
        weeklyTasks,
      });
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
          completed: true,
        }),
      });
      setEditTask(null);
      await fetchHistory();
    } catch (error) {
      console.error('Failed to update task', error);
      alert(error.message || 'Failed to update task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task permanently?')) return;
    setBusyTaskId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {},
      });
      await fetchHistory();
    } catch (error) {
      console.error('Failed to delete task', error);
      alert(error.message || 'Failed to delete task.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const filteredHistory = history.filter((task) => {
    const filterMatch = complexityFilter === 'All' ? true : task.complexity === complexityFilter;
    const q = searchQuery.trim().toLowerCase();
    const searchMatch = q.length === 0
      ? true
      : task.task_description.toLowerCase().includes(q)
        || task.assignment_title.toLowerCase().includes(q);
    return filterMatch && searchMatch;
  });

  return (
    <div className="page-shell">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 glass-chip rounded-full text-yellow-600"><Trophy className="w-6 h-6" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Completion History</h1>
            <p className="text-muted-foreground">Track your academic momentum</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tasks Completed</CardTitle>
            </CardHeader>
            <CardContent><div className="text-4xl font-bold text-foreground">{stats.totalTasks}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Study Time (Est.)</CardTitle>
            </CardHeader>
            <CardContent><div className="text-4xl font-bold text-primary">{Math.round(stats.totalMinutes / 60)} <span className="text-lg text-muted-foreground font-normal">hours</span></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-amber-600 flex items-center gap-2">
                <Flame className="w-7 h-7" />
                {stats.weeklyTasks}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm glass-input focus-visible:ring-2 focus-visible:ring-primary/60"
                placeholder="Search task or assignment"
                aria-label="Search completed tasks"
              />
              {['All', 'Easy', 'Medium', 'Hard'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setComplexityFilter(level)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${complexityFilter === level ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}
                >
                  {level}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? <div className="text-center py-10 text-muted-foreground">No completed tasks match your filters.</div> : (
              <div className="space-y-4">
                {filteredHistory.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-4 glass-chip rounded-xl hover:bg-white/65 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-100/70 p-2 rounded-full"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
                      <div>
                        <h4 className="font-bold text-foreground line-through decoration-muted-foreground">{task.task_description}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="font-medium text-primary">{task.assignment_title}</span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.scheduled_date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-muted-foreground flex gap-1"><Clock className="w-3 h-3" /> {task.estimated_minutes}m</Badge>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(task)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" disabled={busyTaskId === task.id} onClick={() => handleDelete(task.id)}>
                        {busyTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Completed Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="task-desc">Task Description</Label>
              <Input id="task-desc" value={editForm.task_description} onChange={(e) => setEditForm((prev) => ({ ...prev, task_description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="task-date">Scheduled Date</Label>
                <Input id="task-date" type="date" value={editForm.scheduled_date} onChange={(e) => setEditForm((prev) => ({ ...prev, scheduled_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-minutes">Minutes</Label>
                <Input id="task-minutes" type="number" min={1} max={720} value={editForm.estimated_minutes} onChange={(e) => setEditForm((prev) => ({ ...prev, estimated_minutes: e.target.value }))} />
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

export default History;
