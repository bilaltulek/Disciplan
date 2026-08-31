import { z } from 'zod';

export const CapabilitySchema = z.enum([
  'planning_profile:read',
  'assignment:read',
  'plan:read',
  'schedule:read',
  'progress:read',
  'conflicts:read',
  'draft:write',
  'review:write',
  'memory:propose',
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export type ToolContext = Readonly<{
  actorUserId: number;
  runId: string;
  threadId: string;
  assignmentId?: number;
  capabilities: ReadonlySet<Capability>;
  deadline: Date;
  signal: AbortSignal;
}>;

export class ToolPermissionError extends Error {
  readonly code = 'TOOL_PERMISSION_DENIED';
}

export type ToolAuditEvent = {
  runId: string;
  toolName: string;
  resultCode: string;
  durationMs: number;
  resourceIds: Record<string, string | number>;
};

export const defineGovernedTool = <Input, Output>({
  name,
  capability,
  inputSchema,
  outputSchema,
  timeoutMs = 10_000,
  execute,
  audit,
}: {
  name: string;
  capability: Capability;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  timeoutMs?: number;
  execute: (context: ToolContext, input: Input) => Promise<Output>;
  audit: (event: ToolAuditEvent) => Promise<void> | void;
}) => async (context: ToolContext, rawInput: unknown): Promise<Output> => {
  const started = Date.now();
  let resultCode = 'OK';
  try {
    if (!context.capabilities.has(capability)) throw new ToolPermissionError(`Tool ${name} is not allowed in this node.`);
    if (context.signal.aborted || Date.now() >= context.deadline.getTime()) {
      throw Object.assign(new Error('Tool execution was cancelled.'), { code: 'TOOL_CANCELLED' });
    }
    const input = inputSchema.parse(rawInput);
    const remaining = Math.max(1, context.deadline.getTime() - Date.now());
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    context.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const result = await Promise.race([
        execute({ ...context, signal: controller.signal }, input),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(
          Object.assign(new Error('Tool execution timed out or was cancelled.'), { code: 'TOOL_TIMEOUT' }),
        ), { once: true })),
      ]);
      return outputSchema.parse(result);
    } finally {
      clearTimeout(timer);
      context.signal.removeEventListener('abort', onAbort);
    }
  } catch (error) {
    resultCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'TOOL_FAILED';
    throw error;
  } finally {
    await audit({
      runId: context.runId,
      toolName: name,
      resultCode,
      durationMs: Date.now() - started,
      resourceIds: context.assignmentId ? { assignmentId: context.assignmentId } : {},
    });
  }
};
