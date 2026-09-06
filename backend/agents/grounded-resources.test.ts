import { describe, expect, it } from 'vitest';
import { normalizeCitation } from './grounded-resources.js';

describe('grounded resource citations', () => {
  it('accepts public HTTPS sources and strips credentials and local targets', () => {
    expect(normalizeCitation({ title: 'MIT notes', url: 'https://ocw.mit.edu/courses/operating-systems/' }))
      .toEqual({ title: 'MIT notes', url: 'https://ocw.mit.edu/courses/operating-systems/' });
    expect(normalizeCitation({ title: 'bad', url: 'javascript:alert(1)' })).toBeNull();
    expect(normalizeCitation({ title: 'bad', url: 'https://user:pass@example.com/' })).toBeNull();
    expect(normalizeCitation({ title: 'bad', url: 'https://127.0.0.1/internal' })).toBeNull();
    expect(normalizeCitation({ title: 'bad', url: 'https://[::1]/internal' })).toBeNull();
  });
});
