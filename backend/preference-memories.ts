const crypto = require('crypto');
const db = require('./db');

const ALLOWED_KEYS = new Set(['planning_style', 'task_description_style', 'study_preferences']);

const validateMemory = ({ key, value }: any) => ALLOWED_KEYS.has(key)
  && typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 500;

const listMemories = async ({ userId, status }: any) => {
  const result = await db.query(
    `SELECT id, memory_key, memory_value, status, confirmed_at, created_at, updated_at
     FROM user_preference_memories
     WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC`,
    [userId, status || null],
  );
  return result.rows;
};

const proposeMemory = async ({ userId, runId, key, value }: any) => {
  if (!validateMemory({ key, value })) throw Object.assign(new Error('Invalid preference memory.'), { code: 'VALIDATION_FAILED' });
  const existing = await db.query(
    `SELECT * FROM user_preference_memories
     WHERE user_id = $1 AND memory_key = $2 AND memory_value = $3::jsonb AND status IN ('proposed', 'confirmed')
     ORDER BY created_at DESC LIMIT 1`,
    [userId, key, JSON.stringify(value.trim())],
  );
  if (existing.rows[0]) return existing.rows[0];
  const result = await db.query(
    `INSERT INTO user_preference_memories (id, user_id, source_run_id, memory_key, memory_value)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [crypto.randomUUID(), userId, runId || null, key, JSON.stringify(value.trim())],
  );
  return result.rows[0];
};

const confirmMemory = async ({ userId, memoryId }: any) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const proposed = await client.query(
      `SELECT * FROM user_preference_memories WHERE id = $1 AND user_id = $2 AND status = 'proposed' FOR UPDATE`,
      [memoryId, userId],
    );
    if (!proposed.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE user_preference_memories SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND memory_key = $2 AND status = 'confirmed'`,
      [userId, proposed.rows[0].memory_key],
    );
    const result = await client.query(
      `UPDATE user_preference_memories SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [memoryId],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

const deleteMemory = async ({ userId, memoryId }: any) => {
  const result = await db.query('DELETE FROM user_preference_memories WHERE id = $1 AND user_id = $2 RETURNING id', [memoryId, userId]);
  return Boolean(result.rows[0]);
};

module.exports = { ALLOWED_KEYS, confirmMemory, deleteMemory, listMemories, proposeMemory, validateMemory };
