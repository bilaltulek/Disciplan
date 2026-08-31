import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Calendar, FileText, CheckCircle2, Clock, Trash2,
} from 'lucide-react';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary, StudyTask } from '@/shared/api/types';

interface TaskCardProps {
  task: AssignmentSummary;
  onDeleteAssignment: (assignment: AssignmentSummary) => void;
  onRetryRun?: (runId: string) => void;
  onCancelRun?: (runId: string) => void;
}

const formatDate = (date?: string) => (
  date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) : ''
);

export default function TaskCard({ task, onDeleteAssignment, onRetryRun, onCancelRun }: TaskCardProps) {
  const [plan, setPlan] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [completedCount, setCompletedCount] = useState(task.completed_subtasks || 0);
  const [totalCount, setTotalCount] = useState(task.total_subtasks || 0);
  const [feedbackStatus, setFeedbackStatus] = useState('');

  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const taskHueClass = task.complexity === 'Hard'
    ? 'task-hue-hard'
    : task.complexity === 'Medium' ? 'task-hue-medium' : 'task-hue-easy';
  const mutedTextClass = task.complexity === 'Hard' || task.complexity === 'Medium'
    ? 'text-slate-600 dark:text-white'
    : 'text-muted-foreground dark:text-white';
  const runStatus = task.plan_generation_status;
  const isPlanning = ['accepted', 'queued', 'running', 'reviewing', 'revising'].includes(runStatus || '');
  const isWaiting = ['waiting_for_input', 'waiting_for_approval'].includes(runStatus || '');
  const hasFailed = runStatus === 'failed';
  const planSourceLabel = task.plan_generation_source === 'agentic' || task.plan_generation_source === 'gemini'
    ? 'Agent-generated plan'
    : task.plan_generation_source === 'fallback_error'
      ? 'Deterministic fallback after agent failure'
      : task.plan_generation_source === 'fallback_limit'
        ? 'Deterministic fallback plan'
        : null;

  const loadPlan = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<StudyTask[]>(`/api/assignment/plan/${task.id}`, { method: 'GET', headers: {} });
      setPlan(data);
      setTotalCount(data.length);
      setCompletedCount(data.filter((studyTask) => studyTask.completed).length);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (taskId: number, currentStatus: boolean) => {
    if (toggleBusy) return;
    const nextPlan = plan.map((studyTask) => (
      studyTask.id === taskId ? { ...studyTask, completed: !currentStatus } : studyTask
    ));
    setToggleBusy(true);
    setPlan(nextPlan);
    setCompletedCount((previous) => (currentStatus ? previous - 1 : previous + 1));

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH', body: JSON.stringify({ completed: !currentStatus }),
      });
    } catch (error) {
      setPlan(plan);
      setCompletedCount((previous) => (currentStatus ? previous + 1 : previous - 1));
      console.error('Task toggle failed', error);
    } finally {
      setToggleBusy(false);
    }
  };

  const submitFeedback = async (feedbackType: 'helpful' | 'too_heavy' | 'too_vague') => {
    setFeedbackStatus('Saving feedback...');
    try {
      await apiRequest(`/api/assignments/${task.id}/feedback`, {
        method: 'POST', body: JSON.stringify({ feedbackType }),
      });
      setFeedbackStatus('Feedback saved.');
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : 'Feedback could not be saved.');
    }
  };

  return (
    <Dialog onOpenChange={(open) => { if (open) void loadPlan(); }}>
      <Card className={`h-64 flex flex-col justify-between hover:shadow-[0_26px_60px_-30px_rgba(15,23,42,0.8)] transition-shadow group relative overflow-hidden glass-panel ${taskHueClass}`}>
        <CardContent className="pt-6 px-6 flex h-full flex-col">
          <div className="flex justify-between items-start mb-4">
            <span className={`text-xs font-bold uppercase tracking-wider ${mutedTextClass}`}>{task.complexity}</span>
            <span className={`glass-chip text-xs flex items-center gap-1 px-2 py-1 rounded-full ${mutedTextClass}`}><Calendar className="w-3 h-3" /> {formatDate(task.due_date)}</span>
          </div>
          <h3 className="font-bold text-lg mb-2 leading-tight text-foreground dark:text-white">{task.title}</h3>
          {totalCount > 0 ? (
            <div className="mb-4">
              <div className={`flex justify-between text-xs mb-1 ${mutedTextClass}`}><span>Progress</span><span className="dark:text-white">{progressPercent}%</span></div>
              <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div>
            </div>
          ) : <p className={`text-sm line-clamp-3 mb-4 ${mutedTextClass}`}>{task.description || 'No description provided.'}</p>}
          <div className={`flex items-center gap-2 text-xs ${mutedTextClass}`}><FileText className="w-3 h-3" /> {task.total_items} Items</div>
          {planSourceLabel && <p className={`mt-1 text-xs ${mutedTextClass}`}>{planSourceLabel}</p>}
          <div className="mt-auto pt-4 flex items-center gap-2">
            {isPlanning || isWaiting ? <Button variant="outline" className="flex-1" disabled>{runStatus === 'waiting_for_input' ? 'Needs Information' : runStatus === 'waiting_for_approval' ? 'Needs Approval' : runStatus === 'queued' || runStatus === 'accepted' ? 'Plan Queued' : 'Planning…'}</Button> : (
              <DialogTrigger asChild><Button variant="outline" className="flex-1 hover:text-primary transition-all focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-white dark:border-white/35">{totalCount > 0 ? 'Continue Plan' : 'View Breakdown'}</Button></DialogTrigger>
            )}
            <Button type="button" variant="outline" className="glass-chip border-red-300/70 text-red-700 hover:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-red-300 dark:text-red-300 dark:border-red-300/60 dark:hover:bg-red-900/30" onClick={() => onDeleteAssignment(task)} aria-label={`Delete assignment ${task.title}`}><Trash2 className="w-4 h-4" />Delete</Button>
          </div>
          {(isPlanning || isWaiting) && <p className="text-xs text-muted-foreground mt-2">{task.plan_generation_step || 'Preparing your study plan'}.</p>}
          {hasFailed && <div className="mt-2 flex items-center gap-2"><p className="text-xs text-red-700 flex-1">{task.plan_generation_failure_message || 'Plan generation failed.'}</p>{task.plan_generation_run_id && <Button type="button" size="sm" variant="outline" onClick={() => onRetryRun?.(task.plan_generation_run_id!)}>Retry</Button>}</div>}
          {(isPlanning || isWaiting) && task.plan_generation_run_id && <button type="button" className="text-xs underline text-muted-foreground mt-1" onClick={() => onCancelRun?.(task.plan_generation_run_id!)}>Cancel planning</button>}
        </CardContent>
      </Card>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Study Plan: {task.title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 mt-2 space-y-2">
          {loading ? <div className="text-center py-10">Loading...</div> : plan.map((step) => (
            <div key={step.id} className={`glass-chip flex items-start gap-3 p-3 rounded-xl border transition-colors ${step.completed ? 'opacity-70' : ''}`}>
              <button type="button" disabled={toggleBusy} aria-label={`${step.completed ? 'Mark' : 'Mark'} ${step.task_description} ${step.completed ? 'incomplete' : 'complete'}`} onClick={() => void toggleTask(step.id, step.completed)} className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${step.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 hover:border-primary'}`}>
                {step.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1"><p className={`text-sm font-medium ${step.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{step.task_description}</p><div className="flex items-center gap-3 mt-1"><span className="text-xs text-muted-foreground">{formatDate(step.scheduled_date)}</span><span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {step.estimated_minutes}m</span></div></div>
            </div>
          ))}
        </div>
        {!loading && plan.length > 0 && <div className="border-t pt-3 mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">How does this plan feel?</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void submitFeedback('helpful')}>Helpful</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void submitFeedback('too_heavy')}>Too heavy</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void submitFeedback('too_vague')}>Too vague</Button>
          </div>
          {feedbackStatus && <p role="status" className="text-xs text-muted-foreground mt-2">{feedbackStatus}</p>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
