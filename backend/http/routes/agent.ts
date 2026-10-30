const express = require('express');
const config = require('../../config.env');
const logger = require('../../infrastructure/logger');
const { cancelProviderRun } = require('../../infrastructure/cancel-provider-run');
const { dispatchRunBestEffort } = require('../../infrastructure/best-effort-dispatch');
const { withErrorBoundary } = require('../middleware/error-boundary');
const { agentCapabilitiesForRequest, requireActiveAgentRuntime } = require('../middleware/agent-runtime');
const { getRunForUser, getRunEventsForUser, cancelRunForUser, retryRunForUser, enqueueExistingRun } = require('../../agent-runs');
const { authenticateToken } = require('../../middleware/auth');
const { agentRateLimit } = require('../middleware/rate-limit');
const { createMessageRun, createThreadForUser, getThreadForUser, listThreadsForUser } = require('../../conversations');
const { getPlanningProfile, updatePlanningProfile } = require('../../planning-profiles');
const { decideApproval, getApprovalForUser, listApprovalsForUser } = require('../../approvals');
const { confirmMemory, deleteMemory, listMemories } = require('../../preference-memories');

const router = express.Router();

router.get('/api/planning-profile', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ profile: await getPlanningProfile(req.user.id) });
}));

router.patch('/api/planning-profile', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return res.status(400).json({ error: 'A valid planning profile version is required.' });
  }
  const updated = await updatePlanningProfile({ userId: req.user.id, expectedVersion, profile: req.body });
  if (updated.issues) return res.status(400).json({ error: 'Invalid planning profile.', fields: updated.issues });
  if (updated.conflict) return res.status(409).json({ error: 'The planning profile changed in another session.', code: 'VERSION_CONFLICT' });
  return res.json({ profile: updated.profile });
}));


router.get('/api/runtime-capabilities', authenticateToken, (req: any, res: any) => {
  return res.json(agentCapabilitiesForRequest(config, req));
});


router.get('/api/agent-runs/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const run = await getRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(404).json({ error: 'Planning run not found.' });
  return res.json({ run });
}));

router.post('/api/agent-threads', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (title.length > 80) return res.status(400).json({ error: 'Conversation title is too long.' });
  const thread = await createThreadForUser({ userId: req.user.id, title: title || null });
  return res.status(201).json({ thread });
}));

router.get('/api/agent-threads', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const limit = Number.parseInt(req.query.limit || '30', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: 'Invalid pagination.' });
  const threads = await listThreadsForUser({ userId: req.user.id, before: req.query.before, limit });
  return res.json({ threads });
}));

router.get('/api/agent-threads/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const limit = Number.parseInt(req.query.limit || '50', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'Invalid pagination.' });
  const conversation = await getThreadForUser({ userId: req.user.id, threadId: req.params.id, before: req.query.before, limit });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json(conversation);
}));

router.post('/api/agent-threads/:id/messages', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const clientMessageId = typeof req.body?.clientMessageId === 'string' ? req.body.clientMessageId.trim() : '';
  const assignmentId = req.body?.assignmentId == null ? null : Number(req.body.assignmentId);
  const replyToRunId = req.body?.replyToRunId == null ? null : String(req.body.replyToRunId).trim();
  const idempotencyKey = req.get('Idempotency-Key');
  if (content.length < 1 || content.length > 4000 || clientMessageId.length < 8 || clientMessageId.length > 128
      || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128
      || (assignmentId !== null && (!Number.isInteger(assignmentId) || assignmentId < 1))
      || (replyToRunId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(replyToRunId))) {
    return res.status(400).json({ error: 'Invalid conversation message.' });
  }
  const created = await createMessageRun({
    userId: req.user.id, threadId: req.params.id, content, assignmentId, replyToRunId, clientMessageId, idempotencyKey,
  });
  await dispatchRunBestEffort(created.run.id);
  return res.status(202).json(created);
}));

router.get('/api/approvals', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!['pending', 'approved', 'rejected', 'expired', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid approval status.' });
  }
  return res.json({ approvals: await listApprovalsForUser({ userId: req.user.id, status }) });
}));

router.get('/api/approvals/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const approval = await getApprovalForUser({ userId: req.user.id, approvalId: req.params.id });
  if (!approval) return res.status(404).json({ error: 'Approval not found.' });
  return res.json(approval);
}));

router.post('/api/approvals/:id/decision', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
  const decision = req.body?.decision;
  const proposalHash = req.body?.proposalHash;
  if (!['approve', 'reject'].includes(decision) || typeof proposalHash !== 'string' || !/^[a-f0-9]{64}$/.test(proposalHash)) {
    return res.status(400).json({ error: 'Invalid approval decision.' });
  }
  const result = await decideApproval({ userId: req.user.id, approvalId: req.params.id, decision, proposalHash });
  if (result.missing) return res.status(404).json({ error: 'Approval not found.' });
  if (result.stale) return res.status(409).json({ error: 'The proposal changed. Refresh before deciding.', code: 'STALE_PROPOSAL' });
  if (result.conflict) return res.status(409).json({ error: 'This approval is no longer pending.' });
  await dispatchRunBestEffort(result.approval.run_id);
  return res.status(202).json({ approval: result.approval, duplicate: result.duplicate });
}));

router.get('/api/preference-memories', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  if (status && !['proposed', 'confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid memory status.' });
  return res.json({ memories: await listMemories({ userId: req.user.id, status }) });
}));

router.post('/api/preference-memories/:id/confirm', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const memory = await confirmMemory({ userId: req.user.id, memoryId: req.params.id });
  if (!memory) return res.status(404).json({ error: 'Preference proposal not found.' });
  return res.json({ memory });
}));

router.delete('/api/preference-memories/:id', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  if (!await deleteMemory({ userId: req.user.id, memoryId: req.params.id })) return res.status(404).json({ error: 'Preference memory not found.' });
  return res.json({ message: 'Preference memory deleted.' });
}));

router.get('/api/agent-runs/:id/events', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const afterId = Number.parseInt(req.query.afterId || '0', 10);
  const limit = Number.parseInt(req.query.limit || '100', 10);
  if (!Number.isInteger(afterId) || afterId < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Invalid event pagination.', code: 'VALIDATION_FAILED' });
  }
  const events = await getRunEventsForUser({ runId: req.params.id, userId: req.user.id, afterId, limit });
  if (!events) return res.status(404).json({ error: 'Planning run not found.' });
  return res.json({ events, nextAfterId: events.at(-1)?.id || afterId });
}));

router.post('/api/agent-runs/:id/cancel', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const run = await cancelRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(409).json({ error: 'This planning run cannot be cancelled.' });
  try {
    await cancelProviderRun(run.provider_run_id);
  } catch (error: any) {
    logger.warn({ err: error, runId: run.id }, 'Provider cancellation will be reconciled from canonical state');
  }
  return res.json({ run });
}));

router.post('/api/agent-runs/:id/retry', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
  const run = await retryRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(409).json({ error: 'Only failed or cancelled planning runs can be retried.' });
  await enqueueExistingRun(run);
  await dispatchRunBestEffort(run.id);
  return res.status(202).json({ run });
}));


export = router;
