import { describe, expect, it } from 'vitest';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

describe('database integration opt-in', () => {
  it('requires the explicit integration flag even when a URL is configured', () => {
    expect(databaseIntegrationEnabled({ TEST_DATABASE_URL: 'postgresql://user:pass@db.example.com/test' })).toBe(false);
    expect(databaseIntegrationEnabled({ RUN_DB_INTEGRATION: 'true' })).toBe(true);
  });

  it('ignores example placeholders but accepts a syntactically usable Postgres URL', () => {
    expect(resolveSuppliedTestDatabaseUrl(
      'postgresql://TEST_USER:TEST_PASSWORD@DIRECT_HOST/DB_NAME?sslmode=require',
    )).toBeUndefined();
    expect(resolveSuppliedTestDatabaseUrl('not-a-url')).toBeUndefined();
    expect(resolveSuppliedTestDatabaseUrl('postgresql://runner:secret@db.example.com/disciplan_test'))
      .toBe('postgresql://runner:secret@db.example.com/disciplan_test');
  });
});
