import { schedules, task } from '@trigger.dev/sdk';
import { z } from 'zod';
import type { Pool } from 'pg';
import { executeGenericAgentRun } from '../backend/agents/run-executor.js';
import { DispatchService } from '../backend/services/dispatch-service.js';
import { TriggerDevProvider } from '../backend/infrastructure/trigger-provider.js';
import { RetentionService } from '../backend/services/retention-service.js';
import { ScheduleHealthService } from '../backend/services/schedule-health.js';
import { ShadowPlanningService } from '../backend/services/shadow-planning.js';
import { runPreviewSmoke } from './preview-smoke.js';
import { assertDevelopmentValidationEnvironment, assertRunAllowed } from './validation-guard.js';

const config = require('../backend/config.env');
const db = require('../backend/worker-db') as Pool;

const AgentRunPayload = z.object({ runId: z.string().uuid() });

export const previewSmokeTask = task({
  id: 'disciplan-preview-smoke',
  retry: { maxAttempts: 1 },
  run: async (_payload, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    return runPreviewSmoke(db, config, ctx.environment.type);
  },
});

export const agentRunTask = task({
  id: 'disciplan-agent-run',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async (payload: unknown, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    const { runId } = AgentRunPayload.parse(payload);
    await assertRunAllowed(db, config, runId);
    return executeGenericAgentRun(runId, { triggerEnvironmentType: ctx.environment.type });
  },
});

const validationOwnerIds = () => [
  ...config.agentExecutionPolicy.activeUserIds,
  ...config.agentExecutionPolicy.shadowUserIds,
];

export const dispatchReconcilerTask = schedules.task({
  id: 'disciplan-dispatch-reconciler',
  cron: '*/5 * * * *',
  run: async (_payload, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    const allowedUserIds = config.agentRolloutMode === 'off' ? validationOwnerIds() : undefined;
    if (config.agentRolloutMode === 'off' && !allowedUserIds?.length) return { disabled: true, dispatched: [] };
    return {
      disabled: false,
      dispatched: await new DispatchService(db, new TriggerDevProvider()).dispatchPending(50, allowedUserIds),
    };
  },
});

export const retentionTask = schedules.task({
  id: 'disciplan-retention',
  cron: '17 3 * * *',
  run: async (_payload, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    return new RetentionService(db).enforce();
  },
});

export const scheduleHealthTask = schedules.task({
  id: 'disciplan-schedule-health',
  cron: '23 4 * * *',
  run: async (_payload, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    if (config.agentRolloutMode === 'active') {
      return { disabled: false, createdRunIds: await new ScheduleHealthService(db).scan() };
    }
    const allowedUserIds = config.agentExecutionPolicy.validationMode === 'development'
      ? config.agentExecutionPolicy.activeUserIds
      : [];
    return allowedUserIds.length
      ? { disabled: false, createdRunIds: await new ScheduleHealthService(db).scan(200, allowedUserIds) }
      : { disabled: true, createdRunIds: [] };
  },
});

export const shadowPlanningTask = schedules.task({
  id: 'disciplan-shadow-planning',
  cron: '41 2 * * *',
  run: async (_payload, { ctx }) => {
    assertDevelopmentValidationEnvironment(config, ctx);
    if (config.agentRolloutMode === 'shadow') {
      return { disabled: false, createdRunIds: await new ShadowPlanningService(db).enqueueSample() };
    }
    const allowedUserIds = config.agentExecutionPolicy.validationMode === 'development'
      ? config.agentExecutionPolicy.shadowUserIds
      : [];
    return allowedUserIds.length
      ? { disabled: false, createdRunIds: await new ShadowPlanningService(db).enqueueSample(20, allowedUserIds) }
      : { disabled: true, createdRunIds: [] };
  },
});
