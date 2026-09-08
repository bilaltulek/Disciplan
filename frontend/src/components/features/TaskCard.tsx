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
  const difficultyClass = task.complexity === 'Hard'
    ? 'difficulty-hard'
    : task.complexity === 'Medium' ? 'difficulty-medium' : 'difficulty-easy';
  const captureClass = task.complexity === 'Hard'
    ? 'task-hue-hard'
    : task.complexity === 'Medium' ? 'task-hue-medium' : 'task-hue-easy';
  const isComplete = totalCount > 0 && completedCount === totalCount;
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
      <Card className={`assignment-card ${captureClass}`}>
        <CardContent className="flex h-full flex-col p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <span className={`difficulty-chip uppercase ${difficultyClass}`}>{task.complexity}</span>
            <span className="assignment-date"><Calendar className="h-3.5 w-3.5" /> {formatDate(task.due_date)}</span>
          </div>
          <h2 className="assignment-title">{task.title}</h2>
          {totalCount > 0 ? (
            <div className="mb-4 mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{progressPercent}%</span></div>
              <div className="assignment-progress-track" role="progressbar" aria-label={`${task.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
                <div className={`assignment-progress-fill${isComplete ? ' is-complete' : ''}`} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : <p className="mb-4 mt-3 line-clamp-3 text-sm text-muted-foreground">{task.description || 'No description provided.'}</p>}
          <div className="assignment-meta"><FileText className="h-3.5 w-3.5" /> {task.total_items} items</div>
          {planSourceLabel && <p className="assignment-source">{planSourceLabel}</p>}
          <div className="mt-auto flex items-center gap-2 pt-5">
            {isPlanning || isWaiting ? <Button variant="outline" className="flex-1" disabled>{runStatus === 'waiting_for_input' ? 'Needs Information' : runStatus === 'waiting_for_approval' ? 'Needs Approval' : runStatus === 'queued' || runStatus === 'accepted' ? 'Plan Queued' : 'Planning…'}</Button> : (
              <DialogTrigger asChild><Button className="flex-1">{totalCount > 0 ? 'Continue Plan' : 'View Breakdown'}</Button></DialogTrigger>
            )}
            <Button type="button" variant="ghost" className="assignment-delete" onClick={() => onDeleteAssignment(task)} aria-label={`Delete assignment ${task.title}`}><Trash2 className="h-4 w-4" />Delete</Button>
          </div>
          {(isPlanning || isWaiting) && <p className="text-xs text-muted-foreground mt-2">{task.plan_generation_step || 'Preparing your study plan'}.</p>}
          {hasFailed && <div className="assignment-error mt-2 flex items-center gap-2"><p className="flex-1 text-xs">{task.plan_generation_failure_message || 'Plan generation failed.'}</p>{task.plan_generation_run_id && <Button type="button" size="sm" variant="outline" onClick={() => onRetryRun?.(task.plan_generation_run_id!)}>Retry</Button>}</div>}
          {(isPlanning || isWaiting) && task.plan_generation_run_id && <button type="button" className="text-xs underline text-muted-foreground mt-1" onClick={() => onCancelRun?.(task.plan_generation_run_id!)}>Cancel planning</button>}
        </CardContent>
      </Card>
      <DialogContent className="study-plan-dialog max-h-[85vh] flex flex-col">
        <DialogHeader className="pr-10"><DialogTitle>Study Plan: {task.title}</DialogTitle></DialogHeader>
        <div className="study-plan-list mt-2 flex-1 space-y-2 overflow-y-auto pr-2">
          {loading ? <div className="text-center py-10">Loading...</div> : plan.map((step) => (
            <div key={step.id} className={`study-plan-task${step.completed ? ' is-complete' : ''}`}>
              <button type="button" disabled={toggleBusy} aria-label={`Mark ${step.task_description} ${step.completed ? 'incomplete' : 'complete'}`} onClick={() => void toggleTask(step.id, step.completed)} className={`study-plan-toggle${step.completed ? ' is-complete' : ''}`}>
                {step.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0 flex-1"><p className={`text-sm font-medium${step.completed ? ' text-muted-foreground line-through' : ''}`}>{step.task_description}</p><div className="mt-1.5 flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{formatDate(step.scheduled_date)}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {step.estimated_minutes}m</span></div></div>
            </div>
          ))}
        </div>
        {!loading && plan.length > 0 && <div className="mt-3 border-t pt-4">
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
