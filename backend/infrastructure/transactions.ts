import type { Pool, PoolClient } from 'pg';

export type Queryable = Pick<PoolClient, 'query'>;

export async function withTransaction<T>(pool: Pick<Pool, 'connect'>, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
