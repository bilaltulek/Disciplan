export type ValidationFault = 'transient_once_before_graph' | 'pause_before_publish';

type ValidationPolicy = {
  validationMode: string;
  dataEnvironment: string;
  validationFaultsEnabled: boolean;
  effectiveModeForUser(userId: number): string;
};

export const resolveValidationFault = ({
  policy,
  userId,
  triggerContext,
  triggerEnvironmentType,
}: {
  policy: ValidationPolicy;
  userId: number;
  triggerContext: { validationFault?: unknown } | null;
  triggerEnvironmentType?: string;
}): ValidationFault | null => {
  if (policy.validationMode !== 'development'
    || policy.dataEnvironment !== 'isolated-preview'
    || !policy.validationFaultsEnabled
    || policy.effectiveModeForUser(userId) !== 'active'
    || triggerEnvironmentType !== 'DEVELOPMENT') return null;
  const fault = triggerContext?.validationFault;
  return fault === 'transient_once_before_graph' || fault === 'pause_before_publish' ? fault : null;
};

export const applyPrePublishValidationPause = async (
  fault: ValidationFault | null,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
) => {
  if (fault === 'pause_before_publish') await delay(15_000);
};
