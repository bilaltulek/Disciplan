import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { defineGovernedTool, ToolPermissionError, type ToolContext } from './tool-registry.js';

const context = (capabilities: ToolContext['capabilities']): ToolContext => ({
  actorUserId: 1,
  runId: 'run-1',
  threadId: 'thread-1',
  assignmentId: 8,
  capabilities,
  deadline: new Date(Date.now() + 5_000),
  signal: new AbortController().signal,
});

describe('governed agent tools', () => {
  it('rejects missing capabilities before execution', async () => {
    const execute = vi.fn(async () => ({ title: 'Private' }));
    const tool = defineGovernedTool({
      name: 'get_assignment_constraints', capability: 'assignment:read',
      inputSchema: z.object({}), outputSchema: z.object({ title: z.string() }), execute, audit: vi.fn(),
    });
    await expect(tool(context(new Set()), {})).rejects.toBeInstanceOf(ToolPermissionError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('injects actor scope and validates bounded output', async () => {
    const audit = vi.fn();
    const tool = defineGovernedTool({
      name: 'get_assignment_constraints', capability: 'assignment:read',
      inputSchema: z.object({}), outputSchema: z.object({ actorUserId: z.number() }),
      execute: async (toolContext) => ({ actorUserId: toolContext.actorUserId }), audit,
    });
    await expect(tool(context(new Set(['assignment:read'])), {})).resolves.toEqual({ actorUserId: 1 });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ resultCode: 'OK', toolName: 'get_assignment_constraints' }));
  });
});
