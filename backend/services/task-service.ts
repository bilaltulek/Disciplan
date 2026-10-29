const db = require('../db');

const listTimeline = async (userId: any, database: any = db) => {
  const result = await database.query(
    `SELECT t.*,a.title AS assignment_title,a.complexity
     FROM study_tasks t JOIN assignments a ON t.assignment_id=a.id
     WHERE a.user_id=$1 AND t.archived_at IS NULL
     ORDER BY t.scheduled_date ASC,t.id ASC`,
    [userId],
  );
  return result.rows;
};

const listHistory = async (userId: any, database: any = db) => {
  const result = await database.query(
    `SELECT t.*,a.title AS assignment_title,a.complexity
     FROM study_tasks t JOIN assignments a ON t.assignment_id=a.id
     WHERE t.completed=TRUE AND a.user_id=$1 AND t.archived_at IS NULL
     ORDER BY t.completed_at DESC NULLS LAST,t.scheduled_date DESC,t.id DESC`,
    [userId],
  );
  return result.rows;
};

const updateTask = async ({ userId, taskId, patch }: any, database: any = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT t.* FROM study_tasks t JOIN assignments a ON t.assignment_id=a.id
       WHERE t.id=$1 AND a.user_id=$2 FOR UPDATE OF t`,
      [taskId, userId],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return false;
    }
    const completed = patch.completed === undefined ? existing.completed : patch.completed;
    await client.query(
      `UPDATE study_tasks SET task_description=$1,scheduled_date=$2,estimated_minutes=$3,
         completed=$4,actual_minutes=$5,
         completed_at=CASE WHEN $4 THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id=$6`,
      [patch.task_description ?? existing.task_description,
        patch.scheduled_date ?? existing.scheduled_date,
        patch.estimated_minutes ?? existing.estimated_minutes,
        completed,
        patch.actual_minutes === undefined ? existing.actual_minutes : patch.actual_minutes,
        taskId],
    );
    await client.query('COMMIT');
    return true;
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteTask = async ({ userId, taskId }: any, database: any = db) => {
  const result = await database.query(
    `DELETE FROM study_tasks WHERE id=$1
       AND assignment_id IN (SELECT id FROM assignments WHERE user_id=$2)
     RETURNING id`,
    [taskId, userId],
  );
  return result.rowCount > 0;
};

const toggleTask = async ({ userId, taskId, completed }: any, database: any = db) => {
  const result = await database.query(
    `UPDATE study_tasks SET completed=$1,
       completed_at=CASE WHEN $1 THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE NULL END
     WHERE id=$2 AND assignment_id IN (SELECT id FROM assignments WHERE user_id=$3)
     RETURNING id`,
    [completed, taskId, userId],
  );
  return result.rowCount || 0;
};

export = { deleteTask, listHistory, listTimeline, toggleTask, updateTask };
