import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TunnelNavControls = ({
  hideCompleted,
  onToggleHideCompleted,
  onPrev,
  onNext,
  onToday,
  canPrev,
  canNext,
  activeDateText,
}) => (
  <div className="warp-nav-controls glass-chip rounded-2xl p-3 flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={onToggleHideCompleted}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${hideCompleted ? 'glass-chip text-foreground' : 'border-white/45 text-muted-foreground hover:text-foreground hover:bg-white/45'}`}
    >
      {hideCompleted ? 'Showing Incomplete Only' : 'Hide Completed'}
    </button>

    <div className="ml-auto flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={!canPrev}>
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!canNext}>
        Next
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
      <Button type="button" size="sm" onClick={onToday}>Today</Button>
    </div>

    <div aria-live="polite" className="basis-full text-xs text-muted-foreground pt-1">
      Active date: {activeDateText}
    </div>
  </div>
);

export default TunnelNavControls;
