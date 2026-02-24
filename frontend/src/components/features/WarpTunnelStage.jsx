import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import DateStackCard from '@/components/features/DateStackCard';

const VISIBLE_RANGE = 4;

const WarpTunnelStage = ({
  layers,
  activeIndex,
  selectedTaskId,
  isAnimating,
  onStep,
  onFocusLayer,
  onSelectTask,
  onToggleTask,
  disabled,
}) => {
  const touchStartX = useRef(null);

  return (
    <div
      className="warp-stage"
      onWheel={(event) => {
        if (isAnimating) return;
        if (Math.abs(event.deltaY) < 10) return;
        event.preventDefault();
        onStep(event.deltaY > 0 ? 1 : -1);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null || isAnimating) return;
        const deltaX = touchStartX.current - event.changedTouches[0].clientX;
        if (Math.abs(deltaX) > 40) onStep(deltaX > 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <div className="warp-tunnel">
        {layers.map((layer, index) => {
          const delta = index - activeIndex;
          if (Math.abs(delta) > VISIBLE_RANGE) return null;

          return (
            <div
              key={layer.date}
              className={cn(
                'warp-layer',
                delta === 0 ? 'warp-layer-front' : '',
                delta > 0 ? 'warp-layer-behind' : '',
                delta < 0 ? 'warp-layer-past' : '',
              )}
              style={{
                '--warp-delta': delta,
                '--warp-z': `${-220 * Math.abs(delta)}px`,
                '--warp-scale': Math.max(0.64, 1 - Math.abs(delta) * 0.1),
                '--warp-blur': `${Math.abs(delta) * 1.2}px`,
                '--warp-opacity': Math.max(0.2, 1 - Math.abs(delta) * 0.18),
                zIndex: 120 - Math.abs(delta),
              }}
              onClick={() => onFocusLayer(index)}
            >
              <DateStackCard
                layer={layer}
                isFront={delta === 0}
                selectedTaskId={selectedTaskId}
                onSelectTask={onSelectTask}
                onToggleTask={onToggleTask}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WarpTunnelStage;
