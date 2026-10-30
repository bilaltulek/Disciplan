import type { Pool } from 'pg';

const db = require('../worker-db') as Pool;

export type RunContextRow = {
  id: string;
  thread_id: string | null;
  user_id: number;
  assignment_id: number | null;
  status: string;
  run_type: 'initial_plan' | 'conversation' | 'repair' | 'health_scan';
  trigger_type: 'assignment_form' | 'user_message' | 'user_request' | 'schedule_health';
  graph_version: string;
  prompt_bundle_version: string;
  trigger_context: { conflicts?: string[]; shadow?: boolean; validationFault?: unknown } | null;
  title: string | null;
  description: string | null;
  complexity: 'Easy' | 'Medium' | 'Hard' | null;
  due_date: string | null;
  total_items: number | null;
  message_content: string | null;
  timezone: string | null;
  weekday_available_minutes: Record<number, number> | null;
  max_daily_minutes: number | null;
  preferred_session_minutes: number | null;
  profile_version: number | null;
  published_plan_version_id: string | null;
  thread_summary: string | null;
  summary_through_message_id: string | null;
  thread_context: Record<string, unknown> | null;
};

export const loadContext = async (runId: string): Promise<RunContextRow | null> => {
  const result = await db.query<RunContextRow>(
    `SELECT r.*, a.title, a.description, a.complexity, a.due_date, a.total_items,
            p.timezone, p.weekday_available_minutes, p.max_daily_minutes,
            p.preferred_session_minutes, p.version AS profile_version,
            m.content AS message_content,
            published.id AS published_plan_version_id,
            th.summary AS thread_summary,
            th.summary_through_message_id,
            th.context_state AS thread_context
     FROM agent_runs r
     LEFT JOIN assignments a ON a.id = r.assignment_id AND a.user_id = r.user_id
     LEFT JOIN agent_messages m ON m.id = r.input_message_id AND m.user_id = r.user_id
     LEFT JOIN user_planning_profiles p ON p.user_id = r.user_id
     LEFT JOIN agent_threads th ON th.id = r.thread_id AND th.user_id = r.user_id
     LEFT JOIN LATERAL (
       SELECT id FROM plan_versions
       WHERE assignment_id = r.assignment_id AND status = 'published'
       LIMIT 1
     ) published ON TRUE
     WHERE r.id = $1`,
    [runId],
  );
  return result.rows[0] ?? null;
};
