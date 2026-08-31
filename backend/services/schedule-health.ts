import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../infrastructure/transactions.js';

const { todayInTimezone } = require('../domain/date-only.js');
const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('../agents/runtime-registry.js') as {
  GRAPH_VERSION: string;
  PROMPT_BUNDLE_VERSION: string;
};

export type ScheduleHealthTask = {
  id: number;
  scheduledDate: string;
  estimatedMinutes: number;
  completed: boolean;
};

export const detectScheduleConflicts = ({
  today,
  dueDate,
  tasks,
  weekdayAvailableMinutes,
  maxDailyMinutes,
}: {
  today: string;
  dueDate: string;
  tasks: ScheduleHealthTask[];
  weekdayAvailableMinutes: Record<number, number>;
  maxDailyMinutes: number;
}) => {
  const conflicts = new Set<string>();
  const load = new Map<string, number>();
  for (const task of tasks.filter((item) => !item.completed)) {
    if (task.scheduledDate < today) conflicts.add(`MISSED_TASK:${task.id}`);
    load.set(task.scheduledDate, (load.get(task.scheduledDate) || 0) + task.estimatedMinutes);
  }
  if (dueDate < today && tasks.some((task) => !task.completed)) conflicts.add('ASSIGNMENT_OVERDUE');
  for (const [date, minutes] of load) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const capacity = Math.min(Number(weekdayAvailableMinutes[weekday] || 0), maxDailyMinutes);
    if (minutes > capacity) conflicts.add(`DAILY_OVERLOAD:${date}`);
  }
  return [...conflicts].sort();
};

export class ScheduleHealthService {
  constructor(private readonly pool: Pool) {}

  async scan(limit = 200, allowedUserIds?: readonly number[]) {
    const rows = await this.pool.query(
      `SELECT a.id AS assignment_id, a.user_id, a.due_date,
              p.timezone, p.weekday_available_minutes, p.max_daily_minutes,
              t.id AS task_id, t.scheduled_date, t.estimated_minutes, t.completed
       FROM assignments a
       JOIN plan_versions pv ON pv.assignment_id = a.id AND pv.status = 'published'
       JOIN study_tasks t ON t.assignment_id = a.id AND t.archived_at IS NULL
       LEFT JOIN user_planning_profiles p ON p.user_id = a.user_id
       WHERE EXISTS (SELECT 1 FROM study_tasks pending WHERE pending.assignment_id = a.id AND pending.completed = FALSE AND pending.archived_at IS NULL)
         AND ($2::int[] IS NULL OR a.user_id = ANY($2::int[]))
       ORDER BY a.id, t.scheduled_date
       LIMIT $1`,
      [limit * 120, allowedUserIds ? [...allowedUserIds] : null],
    );
    const assignments = new Map<number, typeof rows.rows>();
    for (const row of rows.rows) {
      const list = assignments.get(row.assignment_id) || [];
      list.push(row);
      assignments.set(row.assignment_id, list);
    }
    const created: string[] = [];
    for (const [assignmentId, records] of assignments) {
      const first = records[0];
      const timezone = first.timezone || 'UTC';
      const today = todayInTimezone(timezone);
      const conflicts = detectScheduleConflicts({
        today,
        dueDate: first.due_date,
        tasks: records.map((row) => ({
          id: row.task_id,
          scheduledDate: row.scheduled_date,
          estimatedMinutes: Number(row.estimated_minutes || 0),
          completed: Boolean(row.completed),
        })),
        weekdayAvailableMinutes: first.weekday_available_minutes || { 0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 },
        maxDailyMinutes: Number(first.max_daily_minutes || 120),
      });
      if (!conflicts.length) continue;
      const conflictHash = crypto.createHash('sha256').update(JSON.stringify(conflicts)).digest('hex');
      const runId = await withTransaction(this.pool, async (client) => {
        const id = crypto.randomUUID();
        const inserted = await client.query(
          `INSERT INTO agent_runs (
             id, user_id, assignment_id, idempotency_key, request_hash, trigger_context,
             run_type, trigger_type, status, current_step, graph_version, prompt_bundle_version
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'repair','schedule_health','accepted','accepted',$7,$8)
           ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`,
          [id, first.user_id, assignmentId, `health:${assignmentId}:${today}:${conflictHash}`, conflictHash, JSON.stringify({ conflicts }), GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
        );
        if (!inserted.rows[0]) return null;
        await client.query(
          `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail, resource_refs)
           VALUES ($1,'accepted','health_scan','SCHEDULE_CONFLICT_DETECTED','A schedule conflict requires a repair proposal.',$2::jsonb)`,
          [id, JSON.stringify({ assignmentId, conflictCodes: conflicts })],
        );
        await client.query(
          `INSERT INTO agent_dispatch_outbox (id, run_id, task_type) VALUES ($1,$2,'agent_run')`,
          [crypto.randomUUID(), id],
        );
        return id;
      });
      if (runId) created.push(runId);
    }
    return created;
  }
}
