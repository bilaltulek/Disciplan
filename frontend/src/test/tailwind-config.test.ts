import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tailwind source discovery', () => {
  it('scans the strict TypeScript source tree used by the production build', () => {
    const root = process.cwd().endsWith(`${path.sep}frontend`) ? process.cwd() : path.join(process.cwd(), 'frontend');
    const config = fs.readFileSync(path.join(root, 'tailwind.config.js'), 'utf8');
    expect(config).toContain("'./src/**/*.{ts,tsx}'");
    expect(config).not.toContain("'./src/**/*.{js,jsx}'");
  });
});
