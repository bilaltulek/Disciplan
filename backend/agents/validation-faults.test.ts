import { describe, expect, it, vi } from 'vitest';
import { applyPrePublishValidationPause, resolveValidationFault } from './validation-faults.js';

const policy = {
  validationMode: 'development', dataEnvironment: 'isolated-preview', validationFaultsEnabled: true,
  effectiveModeForUser: (userId: number) => userId === 42 ? 'active' : 'off',
};

describe('development-only validation faults', () => {
  it('requires every environment and owner guard', () => {
    const input = {
      policy, userId: 42, triggerContext: { validationFault: 'transient_once_before_graph' },
      triggerEnvironmentType: 'DEVELOPMENT',
    };
    expect(resolveValidationFault(input)).toBe('transient_once_before_graph');
    expect(resolveValidationFault({ ...input, userId: 7 })).toBeNull();
    expect(resolveValidationFault({ ...input, triggerEnvironmentType: 'PREVIEW' })).toBeNull();
    expect(resolveValidationFault({ ...input, policy: { ...policy, validationFaultsEnabled: false } })).toBeNull();
  });

  it('pauses only for the pre-publication fixture', async () => {
    const delay = vi.fn(async () => undefined);
    await applyPrePublishValidationPause('transient_once_before_graph', delay);
    expect(delay).not.toHaveBeenCalled();
    await applyPrePublishValidationPause('pause_before_publish', delay);
    expect(delay).toHaveBeenCalledWith(15_000);
  });
});
