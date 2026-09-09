const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = require('./config.env');
const logger = require('./infrastructure/logger');
const { cancelProviderRun } = require('./infrastructure/cancel-provider-run');
const { dispatchRunBestEffort } = require('./infrastructure/best-effort-dispatch');
const { requestContext } = require('./http/middleware/request-context');
const { appendCookie, csrfProtection } = require('./http/middleware/csrf');
const { withErrorBoundary } = require('./http/middleware/error-boundary');
const { createWorkosAuthRouter } = require('./http/routes/workos-auth');
const { agentCapabilitiesForRequest, requireActiveAgentRuntime } = require('./http/middleware/agent-runtime');
const {
  createAssignmentAndRun,
  getRunForUser,
  getRunEventsForUser,
  cancelRunForUser,
  retryRunForUser,
  enqueueExistingRun,
} = require('./agent-runs');
const { authenticateToken } = require('./middleware/auth');
const { agentRateLimit, authRateLimit } = require('./http/middleware/rate-limit');
const {
  createMessageRun,
  createThreadForUser,
  getThreadForUser,
  listThreadsForUser,
} = require('./conversations');
const { getPlanningProfile, updatePlanningProfile } = require('./planning-profiles');
const { decideApproval, getApprovalForUser, listApprovalsForUser } = require('./approvals');
const { confirmMemory, deleteMemory, listMemories } = require('./preference-memories');
const {
  createUser, findUserForLogin, getSettings, getUser, updateProfile, updateSettings,
} = require('./services/user-service');
const {
  createManualTask, createPlanFeedback, deleteAssignment, getPublishedTasks, listAssignments,
} = require('./services/assignment-service');
const { deleteTask, listHistory, listTimeline, toggleTask, updateTask } = require('./services/task-service');
const { deleteAccount } = require('./services/account-deletion-service');
const {
  validateRegister,
  validateLogin,
  validateAssignment,
  validateIdParam,
  validateTaskToggle,
  validateTaskUpdate,
  validateSettingsPatch,
} = require('./middleware/validate');

const app = express();

app.use(helmet());
app.use(requestContext);
app.use(
  cors({
    origin(origin: any, callback: any) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Token', 'X-Request-ID'],
  }),
);
app.use(express.json({ limit: '10kb' }));
app.use(csrfProtection);
app.get('/api/health', (_req: any, res: any) => {
  res.status(200).json({ status: 'ok' });
});

const issueToken = (userId: any) => jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '24h' });

const setAuthCookie = (res: any, token: any) => {
  const secure = config.cookieSecure ? ' Secure;' : '';
  appendCookie(res, `token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400;${secure}`);
};

app.use('/api/auth', createWorkosAuthRouter({
  config,
  issueToken,
  setAuthCookie,
  rateLimit: authRateLimit,
  logger,
}));

app.get('/api/planning-profile', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ profile: await getPlanningProfile(req.user.id) });
}));

app.patch('/api/planning-profile', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return res.status(400).json({ error: 'A valid planning profile version is required.' });
  }
  const updated = await updatePlanningProfile({ userId: req.user.id, expectedVersion, profile: req.body });
  if (updated.issues) return res.status(400).json({ error: 'Invalid planning profile.', fields: updated.issues });
  if (updated.conflict) return res.status(409).json({ error: 'The planning profile changed in another session.', code: 'VERSION_CONFLICT' });
  return res.json({ profile: updated.profile });
}));

app.post('/api/register', validateRegister, authRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const { email, password, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await createUser({ email, hashedPassword, name });
    const token = issueToken(user.id);
    setAuthCookie(res, token);
    return res.json({ user });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account could not be created.' });
    }
    throw error;
  }
}));

app.post('/api/login', validateLogin, authRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const { email, password } = req.body;

  const user = await findUserForLogin(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const isValid = typeof user.password === 'string' && await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = issueToken(user.id);
  setAuthCookie(res, token);
  return res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

app.post('/api/logout', (_req: any, res: any) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;');
  res.json({ message: 'Logged out.' });
});

app.get('/api/me', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const user = await getUser(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
}));

app.get('/api/settings', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ settings: await getSettings(req.user.id) });
}));

app.patch('/api/settings', authenticateToken, validateSettingsPatch, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ settings: await updateSettings({ userId: req.user.id, patch: req.body }) });
}));

app.get('/api/assignments', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listAssignments(req.user.id));
}));

app.post('/api/assignments', authenticateToken, agentRateLimit, validateAssignment, withErrorBoundary(async (req: any, res: any) => {
  const {
    title, complexity, dueDate, description, totalItems,
  } = req.body;

  const idempotencyKey = req.get('Idempotency-Key');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return res.status(400).json({ error: 'A valid Idempotency-Key header is required.' });
  }
  const created = await createAssignmentAndRun({
    userId: req.user.id,
    assignment: { title, complexity, dueDate, description, totalItems },
    idempotencyKey,
  });
  await dispatchRunBestEffort(created.run.id);
  return res.status(202).json({
    message: 'Assignment accepted',
    id: created.assignment.id,
    assignment: created.assignment,
    run: created.run,
    queued: ['accepted', 'queued', 'running'].includes(created.run.status),
    duplicate: created.duplicate,
  });
}));

app.get('/api/runtime-capabilities', authenticateToken, (req: any, res: any) => {
  return res.json(agentCapabilitiesForRequest(config, req));
});

app.patch('/api/profile', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Display name must be 2-100 characters.', code: 'VALIDATION_FAILED' });
  }
  const user = await updateProfile({ userId: req.user.id, name });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
}));

app.get('/api/agent-runs/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const run = await getRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(404).json({ error: 'Planning run not found.' });
  return res.json({ run });
}));

app.post('/api/agent-threads', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (title.length > 80) return res.status(400).json({ error: 'Conversation title is too long.' });
  const thread = await createThreadForUser({ userId: req.user.id, title: title || null });
  return res.status(201).json({ thread });
}));

app.get('/api/agent-threads', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const limit = Number.parseInt(req.query.limit || '30', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: 'Invalid pagination.' });
  const threads = await listThreadsForUser({ userId: req.user.id, before: req.query.before, limit });
  return res.json({ threads });
}));

app.get('/api/agent-threads/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const limit = Number.parseInt(req.query.limit || '50', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'Invalid pagination.' });
  const conversation = await getThreadForUser({ userId: req.user.id, threadId: req.params.id, before: req.query.before, limit });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json(conversation);
}));

app.post('/api/agent-threads/:id/messages', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
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

app.get('/api/approvals', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!['pending', 'approved', 'rejected', 'expired', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid approval status.' });
  }
  return res.json({ approvals: await listApprovalsForUser({ userId: req.user.id, status }) });
}));

app.get('/api/approvals/:id', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const approval = await getApprovalForUser({ userId: req.user.id, approvalId: req.params.id });
  if (!approval) return res.status(404).json({ error: 'Approval not found.' });
  return res.json(approval);
}));

app.post('/api/approvals/:id/decision', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
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

app.get('/api/preference-memories', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  if (status && !['proposed', 'confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid memory status.' });
  return res.json({ memories: await listMemories({ userId: req.user.id, status }) });
}));

app.post('/api/preference-memories/:id/confirm', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const memory = await confirmMemory({ userId: req.user.id, memoryId: req.params.id });
  if (!memory) return res.status(404).json({ error: 'Preference proposal not found.' });
  return res.json({ memory });
}));

app.delete('/api/preference-memories/:id', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  if (!await deleteMemory({ userId: req.user.id, memoryId: req.params.id })) return res.status(404).json({ error: 'Preference memory not found.' });
  return res.json({ message: 'Preference memory deleted.' });
}));

app.get('/api/agent-runs/:id/events', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const afterId = Number.parseInt(req.query.afterId || '0', 10);
  const limit = Number.parseInt(req.query.limit || '100', 10);
  if (!Number.isInteger(afterId) || afterId < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Invalid event pagination.', code: 'VALIDATION_FAILED' });
  }
  const events = await getRunEventsForUser({ runId: req.params.id, userId: req.user.id, afterId, limit });
  if (!events) return res.status(404).json({ error: 'Planning run not found.' });
  return res.json({ events, nextAfterId: events.at(-1)?.id || afterId });
}));

app.post('/api/agent-runs/:id/cancel', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const run = await cancelRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(409).json({ error: 'This planning run cannot be cancelled.' });
  try {
    await cancelProviderRun(run.provider_run_id);
  } catch (error: any) {
    logger.warn({ err: error, runId: run.id }, 'Provider cancellation will be reconciled from canonical state');
  }
  return res.json({ run });
}));

app.post('/api/agent-runs/:id/retry', authenticateToken, agentRateLimit, requireActiveAgentRuntime, withErrorBoundary(async (req: any, res: any) => {
  const run = await retryRunForUser(req.params.id, req.user.id);
  if (!run) return res.status(409).json({ error: 'Only failed or cancelled planning runs can be retried.' });
  await enqueueExistingRun(run);
  await dispatchRunBestEffort(run.id);
  return res.status(202).json({ run });
}));

app.delete('/api/assignments/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const deleted = await deleteAssignment({ userId: req.user.id, assignmentId: req.params.id });
  if (!deleted) return res.status(404).json({ error: 'Assignment not found.' });
  return res.json({ message: 'Assignment deleted.', ...deleted });
}));

app.post('/api/assignments/:id/tasks', authenticateToken, agentRateLimit, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const description = typeof req.body?.task_description === 'string' ? req.body.task_description.trim() : '';
  const scheduledDate = req.body?.scheduled_date;
  const estimatedMinutes = Number(req.body?.estimated_minutes);
  if (description.length < 3 || description.length > 500 || typeof scheduledDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !Number.isInteger(estimatedMinutes)
      || estimatedMinutes < 1 || estimatedMinutes > 720) {
    return res.status(400).json({ error: 'Invalid study task.' });
  }
  const task = await createManualTask({
    userId: req.user.id, assignmentId: req.params.id,
    task: { description, scheduledDate, estimatedMinutes },
  });
  if (!task) return res.status(404).json({ error: 'Assignment not found.' });
  return res.status(201).json({ task });
}));

app.get('/api/assignment/plan/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await getPublishedTasks({ userId: req.user.id, assignmentId: req.params.id }));
}));

app.post('/api/assignments/:id/feedback', authenticateToken, agentRateLimit, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const feedbackType = req.body?.feedbackType;
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : null;
  if (!['helpful', 'too_heavy', 'too_vague'].includes(feedbackType)
      || (comment !== null && comment.length > 1000)) {
    return res.status(400).json({ error: 'Invalid plan feedback.', code: 'VALIDATION_FAILED' });
  }
  const feedback = await createPlanFeedback({
    userId: req.user.id, assignmentId: req.params.id, feedbackType, comment,
  });
  if (!feedback) return res.status(404).json({ error: 'Assignment not found.' });
  return res.status(201).json({ feedback });
}));

app.get('/api/timeline', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listTimeline(req.user.id));
}));

app.patch('/api/tasks/:id', authenticateToken, validateIdParam, validateTaskUpdate, withErrorBoundary(async (req: any, res: any) => {
  const {
    task_description,
    scheduled_date,
    estimated_minutes,
    actual_minutes,
    completed,
  } = req.body;

  const updated = await updateTask({
    userId: req.user.id, taskId: req.params.id,
    patch: { task_description, scheduled_date, estimated_minutes, actual_minutes, completed },
  });
  if (!updated) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ message: 'Task updated.' });
}));

app.delete('/api/tasks/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const deleted = await deleteTask({ userId: req.user.id, taskId: req.params.id });
  if (!deleted) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ message: 'Task deleted.' });
}));

app.get('/api/history', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listHistory(req.user.id));
}));

app.patch('/api/tasks/:id/toggle', authenticateToken, validateIdParam, validateTaskToggle, withErrorBoundary(async (req: any, res: any) => {
  const changes = await toggleTask({ userId: req.user.id, taskId: req.params.id, completed: req.body.completed });
  if (changes === 0) {
    return res.status(403).json({ error: 'Access denied or task not found.' });
  }
  return res.json({ message: 'Task updated', changes });
}));

app.delete('/api/account', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) return res.status(400).json({ error: 'Password confirmation is required.' });
  const result = await deleteAccount({
    userId: req.user.id,
    password,
    verifyPassword: bcrypt.compare,
    cancelProviderRun,
  });
  if (result.reauthRequired) {
    return res.status(409).json({ error: 'Provider reauthentication is required before account deletion.', code: 'PROVIDER_REAUTH_REQUIRED' });
  }
  if (!result.verified) return res.status(403).json({ error: 'Password confirmation failed.' });
  appendCookie(res, `token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;${config.cookieSecure ? ' Secure;' : ''}`);
  return res.json({ message: 'Account deleted.' });
}));

export = app;
