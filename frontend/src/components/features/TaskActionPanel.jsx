import React from 'react';
import {
  Calendar, Clock, Circle, CheckCircle2, Pencil, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const complexityTone = (complexity) => {
  if (complexity === 'Hard') return 'bg-rose-100/70 text-rose-700';
  if (complexity === 'Medium') return 'bg-amber-100/70 text-amber-700';
  return 'bg-emerald-100/70 text-emerald-700';
};

const TaskActionPanel = ({
  task,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  onClose,
  className = '',
}) => {
  if (!task) {
    return (
      <aside className={cn('warp-action-panel glass-panel rounded-2xl p-5', className)}>
        <p className="text-sm text-muted-foreground">Select a front card in the tunnel to view details and actions.</p>
      </aside>
    );
  }

  return (
    <aside className={cn('warp-action-panel glass-panel rounded-2xl p-5', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Selected Task</p>
          <h3 className="text-base font-semibold text-foreground leading-snug">{task.task_description}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Close
        </button>
      </div>

      <p className="font-semibold text-foreground mb-2">{task.assignment_title}</p>
      <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {task.scheduled_date}</div>
        <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> {task.estimated_minutes}m</div>
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', complexityTone(task.complexity))}>
          {task.complexity || 'Unknown'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onToggle(task.id, !!task.completed)} disabled={disabled}>
          {task.completed ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> : <Circle className="w-4 h-4 mr-2" />}
          {task.completed ? 'Mark Incomplete' : 'Mark Complete'}
        </Button>
        <Button type="button" variant="outline" onClick={() => onEdit(task)} disabled={disabled}>
          <Pencil className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button type="button" variant="outline" className="border-red-300/70 text-red-700 hover:bg-red-50/60" onClick={() => onDelete(task.id)} disabled={disabled}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>
    </aside>
  );
};

export default TaskActionPanel;
