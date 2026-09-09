const db = require('../db');

const defaultSettings = Object.freeze({
  theme_mode: 'light',
  start_page: 'dashboard',
  assignment_default_complexity: 'Medium',
  assignment_default_items: 5,
  confirm_assignment_delete: true,
});

const normalizeSettings = (row: any) => ({
  theme_mode: row?.theme_mode || defaultSettings.theme_mode,
  start_page: row?.start_page || defaultSettings.start_page,
  assignment_default_complexity: row?.assignment_default_complexity || defaultSettings.assignment_default_complexity,
  assignment_default_items: Number.parseInt(row?.assignment_default_items, 10) || defaultSettings.assignment_default_items,
  confirm_assignment_delete: row?.confirm_assignment_delete === undefined
    ? defaultSettings.confirm_assignment_delete
    : !!row.confirm_assignment_delete,
});

const ensureUserSettings = async (userId: any, database: any = db) => {
  await database.query(
    `INSERT INTO user_settings (
       user_id,theme_mode,start_page,assignment_default_complexity,
       assignment_default_items,confirm_assignment_delete
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, defaultSettings.theme_mode, defaultSettings.start_page,
      defaultSettings.assignment_default_complexity, defaultSettings.assignment_default_items,
      defaultSettings.confirm_assignment_delete],
  );
};

const createUser = async ({ email, hashedPassword, name }: any, database: any = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO users (email,password,name) VALUES ($1,$2,$3) RETURNING id,email,name',
      [email, hashedPassword, name],
    );
    const user = result.rows[0];
    await ensureUserSettings(user.id, client);
    await client.query('COMMIT');
    return user;
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const findUserForLogin = async (email: any, database: any = db) => {
  const result = await database.query('SELECT id,email,name,password FROM users WHERE email=$1', [email]);
  return result.rows[0] || null;
};

const getUser = async (userId: any, database: any = db) => {
  const result = await database.query('SELECT id,email,name FROM users WHERE id=$1', [userId]);
  return result.rows[0] || null;
};

const getSettings = async (userId: any, database: any = db) => {
  await ensureUserSettings(userId, database);
  const result = await database.query(
    `SELECT theme_mode,start_page,assignment_default_complexity,
            assignment_default_items,confirm_assignment_delete
     FROM user_settings WHERE user_id=$1`,
    [userId],
  );
  return normalizeSettings(result.rows[0]);
};

const updateSettings = async ({ userId, patch }: any, database: any = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await ensureUserSettings(userId, client);
    const current = await client.query(
      `SELECT theme_mode,start_page,assignment_default_complexity,
              assignment_default_items,confirm_assignment_delete
       FROM user_settings WHERE user_id=$1 FOR UPDATE`,
      [userId],
    );
    const merged = {
      ...normalizeSettings(current.rows[0]),
      ...Object.fromEntries(Object.entries(patch).filter(([, value]: any) => value !== undefined)),
    };
    await client.query(
      `UPDATE user_settings SET theme_mode=$1,start_page=$2,
         assignment_default_complexity=$3,assignment_default_items=$4,
         confirm_assignment_delete=$5,updated_at=CURRENT_TIMESTAMP WHERE user_id=$6`,
      [merged.theme_mode, merged.start_page, merged.assignment_default_complexity,
        merged.assignment_default_items, merged.confirm_assignment_delete, userId],
    );
    await client.query('COMMIT');
    return merged;
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateProfile = async ({ userId, name }: any, database: any = db) => {
  const result = await database.query(
    'UPDATE users SET name=$1 WHERE id=$2 RETURNING id,email,name',
    [name, userId],
  );
  return result.rows[0] || null;
};

export = {
  createUser,
  defaultSettings,
  ensureUserSettings,
  findUserForLogin,
  getSettings,
  getUser,
  normalizeSettings,
  updateProfile,
  updateSettings,
};
