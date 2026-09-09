import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'backend/migrations/007_langgraph_checkpoint_schema.sql'), 'utf8');

describe('LangGraph checkpoint schema migration', () => {
  it.each(['checkpoint_migrations', 'checkpoints', 'checkpoint_blobs', 'checkpoint_writes'])('creates agent_memory.%s', (table: any) => {
    expect(migration).toContain(`agent_memory.${table}`);
  });

  it('marks every bundled saver migration as applied', () => {
    expect(migration).toContain('VALUES (0), (1), (2), (3), (4)');
  });
});
