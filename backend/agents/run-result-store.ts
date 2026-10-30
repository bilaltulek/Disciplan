import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { DisciplanState } from './graph-state.js';
import { appendRunEvent } from './run-lifecycle.js';
import type { RunContextRow } from './run-context.js';

const db = require('../worker-db') as Pool;
const { proposeMemory } = require('../preference-memories');

type Interrupt = { value?: { type?: string; question?: string } };

export const persistGraphResult = async ({
  runId, context, conversationSummary, result, interrupts, fallbackReason, specialistsAvailable,
}: {
  runId: string;
  context: Pick<RunContextRow, 'thread_id' | 'user_id'>;
  conversationSummary: string;
  result: DisciplanState;
  interrupts: Interrupt[];
  fallbackReason: 'limit' | 'error' | null;
  specialistsAvailable: boolean;
}) => {
  if (interrupts.length) {
    const waitingForApproval = interrupts.some((item) => item.value?.type === 'approval');
    const status = waitingForApproval ? 'waiting_for_approval' : 'waiting_for_input';
    const safeDetail = waitingForApproval
      ? 'A plan change is waiting for student approval.'
      : 'The assistant is waiting for one clarification.';
    await db.query(
      `UPDATE agent_runs SET status = $2, current_step = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'running' AND cancellation_requested_at IS NULL`,
      [runId, status],
    );
    await appendRunEvent(runId, status, status, waitingForApproval ? 'APPROVAL_REQUIRED' : 'CLARIFICATION_REQUIRED', safeDetail);
    if (context.thread_id) {
      const assistantMessageId = crypto.randomUUID();
      const assistantContent = waitingForApproval
        ? safeDetail
        : interrupts[0]?.value?.question || 'What detail would help me continue?';
      await db.query(
        `INSERT INTO agent_messages (id, thread_id, user_id, role, content, content_metadata)
         VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)`,
        [assistantMessageId, context.thread_id, context.user_id, assistantContent,
          JSON.stringify({ kind: waitingForApproval ? 'proposal' : 'clarification', runId })],
      );
      await db.query(
        `UPDATE agent_threads SET summary=$2,summary_updated_at=CURRENT_TIMESTAMP,
         summary_through_message_id=$3,context_state=$4::jsonb,context_version=context_version+1,
         last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$5`,
        [context.thread_id, `${conversationSummary}\nassistant: ${assistantContent}`.slice(-16_000), assistantMessageId, JSON.stringify({
          originalGoal: result.originalGoal,
          collectedContext: result.collectedContext,
          activeTutorTopic: result.activeTutorTopic,
        }), context.user_id],
      );
    }
    return { waiting: true as const, status };
  }
  const failed = Boolean(result.failureCode);
  await db.query(
    `UPDATE agent_runs SET status = $2, current_step = $3, failure_code = $4,
     failure_message = $5, plan_source = $6, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'running' AND cancellation_requested_at IS NULL`,
    [
      runId, failed ? 'failed' : 'succeeded', failed ? 'validation' : 'completed',
      result.failureCode, failed ? result.finalResponse : null,
      result.usingFallback || fallbackReason === 'error'
        ? 'fallback_error'
        : fallbackReason === 'limit' || !specialistsAvailable
          ? 'fallback_limit'
          : 'agentic',
    ],
  );
  const completionCode = failed
    ? 'PLAN_FAILED'
    : result.planVersionId
      ? 'PLAN_PUBLISHED'
      : result.assistantResponse?.kind === 'tutor'
        ? 'TUTOR_RESPONSE_COMPLETED'
        : 'ASSISTANT_RESPONSE_COMPLETED';
  await appendRunEvent(
    runId, failed ? 'failed' : 'succeeded', failed ? 'validation' : 'completed', completionCode,
    failed ? 'The agent run could not produce a valid plan.' : 'The agent run completed safely.',
  );
  if (context.thread_id && result.finalResponse) {
    const assistantMessageId = crypto.randomUUID();
    await db.query(
      `INSERT INTO agent_messages (id, thread_id, user_id, role, content, content_metadata)
       VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)`,
      [assistantMessageId, context.thread_id, context.user_id, result.finalResponse, JSON.stringify({
        kind: result.assistantResponse?.kind || (failed ? 'failure' : result.planVersionId ? 'plan' : 'answer'),
        runId,
        citations: result.assistantResponse?.citations || [],
        suggestedActions: result.assistantResponse?.suggestedActions || [],
        planSource: result.planVersionId ? (result.usingFallback ? 'fallback' : 'agentic') : undefined,
      })],
    );
    await db.query(
      `UPDATE agent_threads SET summary=$2,summary_updated_at=CURRENT_TIMESTAMP,
       summary_through_message_id=$4,context_state=$5::jsonb,
       context_version=context_version+1,
       last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND user_id=$3`,
      [context.thread_id, `${conversationSummary}\nassistant: ${result.finalResponse}`.slice(-16_000), context.user_id,
        assistantMessageId,
        JSON.stringify({ originalGoal: result.originalGoal, collectedContext: result.collectedContext, activeTutorTopic: result.activeTutorTopic })],
    );
  }
  if (result.intent?.preferenceProposal) {
    await proposeMemory({
      userId: context.user_id,
      runId,
      key: result.intent.preferenceProposal.key,
      value: result.intent.preferenceProposal.value,
    });
  }
  return { waiting: false as const, failed };
};
