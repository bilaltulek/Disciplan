import React from 'react';
import { CheckCircle2, Circle, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const DateStackCard = ({
  layer,
  isFront,
  selectedTaskId,
  onSelectTask,
  onToggleTask,
  disabled,
}) => {
  const taskCount = layer.tasks.length;
  const dateLabel = new Date(`${layer.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  if (taskCount === 0) {
    return (
      <div className={cn('warp-stack-card-empty', isFront ? 'warp-front-surface' : 'warp-back-surface')}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <CalendarDays className="w-4 h-4" />
          {dateLabel}
        </div>
        <p className="mt-3 text-base font-semibold text-foreground">No tasks for this date</p>
        <p className="text-sm text-muted-foreground mt-1">Use navigation to move through nearby dates.</p>
      </div>
    );
  }

  return (
    <div className={cn('warp-stack', isFront ? 'warp-stack-front' : 'warp-stack-back')} tabIndex={isFront ? 0 : -1}>
      {layer.tasks.map((task, index) => {
        const centerOffset = index - (taskCount - 1) / 2;
        return (
          <article
            key={task.id}
            className={cn(
              'warp-stack-card',
              task.id === selectedTaskId ? 'warp-stack-card-selected' : '',
              task.completed ? 'opacity-75' : '',
              isFront ? 'cursor-pointer' : 'pointer-events-none',
            )}
            style={{
              '--stack-index': index,
              '--fan-offset': `${centerOffset * 84}px`,
              '--fan-tilt': `${centerOffset * 5}deg`,
              '--stack-total': taskCount,
            }}
            onClick={() => isFront && onSelectTask(task.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold truncate', task.completed ? 'line-through text-muted-foreground' : 'text-foreground')}>
                  {task.assignment_title}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{task.task_description}</p>
              </div>
              {isFront && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTask(task.id, !!task.completed);
                  }}
                  className={cn(
                    'shrink-0 rounded-full transition-colors',
                    task.completed ? 'text-emerald-600' : 'text-muted-foreground hover:text-primary',
                  )}
                  aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                >
                  {task.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="glass-chip rounded-full px-2 py-0.5">{layer.completedCount}/{layer.totalCount} complete</span>
              {layer.isToday && <span className="rounded-full bg-sky-100/70 px-2 py-0.5 text-sky-700 font-semibold">Today</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default DateStackCard;
