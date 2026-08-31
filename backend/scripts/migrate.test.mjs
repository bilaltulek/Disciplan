import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { checksum } = require('./migrate.js');

describe('migration runner', () => {
  it('uses stable checksums to detect edited applied migrations', () => {
    expect(checksum('SELECT 1;')).toBe(checksum('SELECT 1;'));
    expect(checksum('SELECT 1;')).not.toBe(checksum('SELECT 2;'));
  });
});
