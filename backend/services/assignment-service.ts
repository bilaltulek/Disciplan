const crypto = require('crypto');
const db = require('../db');

const listAssignments = async (userId: any, database: any = db) => {
  const result = await database.query(
    `SELECT a.*,COUNT(t.id)::int AS total_subtasks,
       COALESCE(SUM(CASE WHEN t.completed THEN 1 ELSE 0 END),0)::int AS completed_subtasks,
       r.id AS plan_generation_run_id,r.status AS plan_generation_status,
       r.current_step AS plan_generation_step,r.plan_source AS plan_generation_source,
       r.failure_message AS plan_generation_failure_message
     FROM assignments a
     LEFT JOIN study_tasks t ON a.id=t.assignment_id
     LEFT JOIN LATERAL (
       SELECT id,status,current_step,plan_source,failure_message,created_at FROM (
         SELECT id,status,current_step,plan_source,failure_message,created_at
         FROM agent_runs WHERE assignment_id=a.id
           AND COALESCE((trigger_context->>'shadow')::boolean,FALSE)=FALSE
         UNION ALL
         SELECT id,status,current_step,plan_source,failure_message,created_at
         FROM plan_generation_runs WHERE assignment_id=a.id
       ) all_runs ORDER BY created_at DESC LIMIT 1
     ) r ON TRUE
     WHERE a.user_id=$1
     GROUP BY a.id,r.id,r.status,r.current_step,r.plan_source,r.failure_message
     ORDER BY a.created_at DESC`,
    [userId],
  );
  return result.rows;
};

const deleteAssignment = async ({ userId, assignmentId }: any, database: any = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id FROM assignments WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [assignmentId, userId],
    );
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    const count = await client.query(
      'SELECT COUNT(*)::int AS count FROM study_tasks WHERE assignment_id=$1',
      [assignmentId],
    );
    await client.query('DELETE FROM assignments WHERE id=$1 AND user_id=$2', [assignmentId, userId]);
    await client.query('COMMIT');
    return { assignmentId, deletedTaskCount: count.rows[0]?.count || 0 };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const createManualTask = async ({ userId, assignmentId, task }: any, database: any = db) => {
  const result = await database.query(
    `INSERT INTO study_tasks (assignment_id,task_description,scheduled_date,estimated_minutes,logical_task_id)
     SELECT a.id,$3,$4,$5,$6 FROM assignments a WHERE a.id=$1 AND a.user_id=$2
     RETURNING *`,
    [assignmentId, userId, task.description, task.scheduledDate, task.estimatedMinutes, crypto.randomUUID()],
  );
  return result.rows[0] || null;
};

const getPublishedTasks = async ({ userId, assignmentId }: any, database: any = db) => {
  const result = await database.query(
    `SELECT t.* FROM study_tasks t JOIN assignments a ON t.assignment_id=a.id
     WHERE t.assignment_id=$1 AND a.user_id=$2 AND t.archived_at IS NULL
     ORDER BY t.scheduled_date ASC,t.id ASC`,
    [assignmentId, userId],
  );
  return result.rows;
};

const createPlanFeedback = async ({ userId, assignmentId, feedbackType, comment }: any, database: any = db) => {
  const result = await database.query(
    `INSERT INTO plan_feedback (id,user_id,assignment_id,plan_version_id,feedback_type,comment)
     SELECT $1,a.user_id,a.id,p.id,$4,$5 FROM assignments a
     LEFT JOIN LATERAL (
       SELECT id FROM plan_versions
       WHERE assignment_id=a.id AND user_id=a.user_id AND status='published'
       ORDER BY version_number DESC LIMIT 1
     ) p ON TRUE
     WHERE a.id=$2 AND a.user_id=$3
     RETURNING id,assignment_id,plan_version_id,feedback_type,comment,created_at`,
    [crypto.randomUUID(), assignmentId, userId, feedbackType, comment || null],
  );
  return result.rows[0] || null;
};

export = {
  createManualTask,
  createPlanFeedback,
  deleteAssignment,
  getPublishedTasks,
  listAssignments,
};
