const express = require('express');
const { dispatchRunBestEffort } = require('../../infrastructure/best-effort-dispatch');
const { withErrorBoundary } = require('../middleware/error-boundary');
const { createAssignmentAndRun } = require('../../agent-runs');
const { authenticateToken } = require('../../middleware/auth');
const { agentRateLimit } = require('../middleware/rate-limit');
const { createManualTask, createPlanFeedback, deleteAssignment, getPublishedTasks, listAssignments } = require('../../services/assignment-service');
const { deleteTask, listHistory, listTimeline, toggleTask, updateTask } = require('../../services/task-service');
const { validateAssignment, validateIdParam, validateTaskToggle, validateTaskUpdate } = require('../../middleware/validate');

const router = express.Router();

router.get('/api/assignments', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listAssignments(req.user.id));
}));

router.post('/api/assignments', authenticateToken, agentRateLimit, validateAssignment, withErrorBoundary(async (req: any, res: any) => {
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


router.delete('/api/assignments/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const deleted = await deleteAssignment({ userId: req.user.id, assignmentId: req.params.id });
  if (!deleted) return res.status(404).json({ error: 'Assignment not found.' });
  return res.json({ message: 'Assignment deleted.', ...deleted });
}));

router.post('/api/assignments/:id/tasks', authenticateToken, agentRateLimit, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
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

router.get('/api/assignment/plan/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await getPublishedTasks({ userId: req.user.id, assignmentId: req.params.id }));
}));

router.post('/api/assignments/:id/feedback', authenticateToken, agentRateLimit, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
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

router.get('/api/timeline', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listTimeline(req.user.id));
}));

router.patch('/api/tasks/:id', authenticateToken, validateIdParam, validateTaskUpdate, withErrorBoundary(async (req: any, res: any) => {
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

router.delete('/api/tasks/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req: any, res: any) => {
  const deleted = await deleteTask({ userId: req.user.id, taskId: req.params.id });
  if (!deleted) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ message: 'Task deleted.' });
}));

router.get('/api/history', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json(await listHistory(req.user.id));
}));

router.patch('/api/tasks/:id/toggle', authenticateToken, validateIdParam, validateTaskToggle, withErrorBoundary(async (req: any, res: any) => {
  const changes = await toggleTask({ userId: req.user.id, taskId: req.params.id, completed: req.body.completed });
  if (changes === 0) {
    return res.status(403).json({ error: 'Access denied or task not found.' });
  }
  return res.json({ message: 'Task updated', changes });
}));


export = router;
