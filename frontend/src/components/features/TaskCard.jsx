import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Calendar, FileText, CheckCircle2, Clock, Trash2,
} from 'lucide-react';
import { apiRequest } from '@/shared/api/client';

const TaskCard = ({ task, onDeleteAssignment }) => {
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [completedCount, setCompletedCount] = useState(task.completed_subtasks || 0);
  const [totalCount, setTotalCount] = useState(task.total_subtasks || 0);

  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const taskHueClass = task.complexity === 'Hard'
    ? 'task-hue-hard'
    : task.complexity === 'Medium'
      ? 'task-hue-medium'
      : 'task-hue-easy';
  const mutedTextClass = task.complexity === 'Hard' || task.complexity === 'Medium'
    ? 'text-slate-600'
    : 'text-muted-foreground';

  const loadPlan = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/assignment/plan/${task.id}`, { method: 'GET', headers: {} });
      setPlan(data);
      setTotalCount(data.length);
      setCompletedCount(data.filter((t) => t.completed).length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (taskId, currentStatus) => {
    if (toggleBusy) return;

    const isComplete = !!currentStatus;
    const nextPlan = plan.map((t) => (t.id === taskId ? { ...t, completed: !isComplete } : t));

    setToggleBusy(true);
    setPlan(nextPlan);
    setCompletedCount((prev) => (isComplete ? prev - 1 : prev + 1));

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !isComplete }),
      });
    } catch (error) {
      setPlan(plan);
      setCompletedCount((prev) => (isComplete ? prev + 1 : prev - 1));
      console.error('Task toggle failed', error);
    } finally {
      setToggleBusy(false);
    }
  };

  const handleDeleteClick = () => {
    const confirmMessage = `Delete assignment "${task.title}" and all mini tasks? This affects Dashboard, Timeline, and History.`;
    if (window.confirm(confirmMessage)) {
      onDeleteAssignment?.(task);
    }
  };

  return (
    <Dialog onOpenChange={(open) => open && loadPlan()}>
      <Card className={`h-64 flex flex-col justify-between hover:shadow-[0_26px_60px_-30px_rgba(15,23,42,0.8)] transition-shadow group relative overflow-hidden glass-panel ${taskHueClass}`}>
        <CardContent className="pt-6 px-6 flex h-full flex-col">
          <div className="flex justify-between items-start mb-4">
            <span className={`text-xs font-bold uppercase tracking-wider ${mutedTextClass}`}>{task.complexity}</span>
            <span className={`glass-chip text-xs flex items-center gap-1 px-2 py-1 rounded-full ${mutedTextClass}`}><Calendar className="w-3 h-3" /> {task.due_date}</span>
          </div>
          <h3 className="font-bold text-lg mb-2 leading-tight text-foreground">{task.title}</h3>
          {totalCount > 0 ? (
            <div className="mb-4">
              <div className={`flex justify-between text-xs mb-1 ${mutedTextClass}`}><span>Progress</span><span>{progressPercent}%</span></div>
              <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div>
            </div>
          ) : (<p className={`text-sm line-clamp-3 mb-4 ${mutedTextClass}`}>{task.description || 'No description provided.'}</p>)}
          <div className={`flex items-center gap-2 text-xs ${mutedTextClass}`}><FileText className="w-3 h-3" /> {task.total_items} Items</div>

          <div className="mt-auto pt-4 flex items-center gap-2">
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 hover:text-primary transition-all focus-visible:ring-2 focus-visible:ring-primary/60">
                {totalCount > 0 ? 'Continue Plan' : 'View Breakdown'}
              </Button>
            </DialogTrigger>
            <Button
              type="button"
              variant="outline"
              className="glass-chip border-red-300/70 text-red-700 hover:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-red-300"
              onClick={handleDeleteClick}
              aria-label={`Delete assignment ${task.title}`}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Study Plan: {task.title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 mt-2 space-y-2">
          {loading ? <div className="text-center py-10">Loading...</div> : (
            plan.map((step, i) => (
              <div key={i} className={`glass-chip flex items-start gap-3 p-3 rounded-xl border transition-colors ${step.completed ? 'opacity-70' : ''}`}>
                <button disabled={toggleBusy} onClick={() => toggleTask(step.id, step.completed)} className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${step.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 hover:border-primary'}`}>
                  {!!step.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${step.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{step.task_description}</p>
                  <div className="flex items-center gap-3 mt-1"><span className="text-xs text-muted-foreground">{step.scheduled_date}</span><span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {step.estimated_minutes}m</span></div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskCard;
