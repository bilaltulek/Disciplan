const crypto = require('crypto');
const db = require('./db');

const listApprovalsForUser = async ({ userId, status = 'pending', limit = 50 }) => {
  const result = await db.query(
    `SELECT ap.*, a.title AS assignment_title, pv.rationale, pv.version_number
     FROM agent_approvals ap
     JOIN assignments a ON a.id = ap.assignment_id AND a.user_id = ap.user_id
     JOIN plan_versions pv ON pv.id = ap.plan_version_id
     WHERE ap.user_id = $1 AND ap.status = $2
     ORDER BY ap.created_at DESC LIMIT $3`,
    [userId, status, Math.min(Math.max(limit, 1), 50)],
  );
  return result.rows;
};

const getApprovalForUser = async ({ userId, approvalId }) => {
  const approval = await db.query(
    `SELECT ap.*, a.title AS assignment_title, pv.rationale, pv.assumptions,
            pv.version_number, pv.parent_plan_version_id
     FROM agent_approvals ap
     JOIN assignments a ON a.id = ap.assignment_id AND a.user_id = ap.user_id
     JOIN plan_versions pv ON pv.id = ap.plan_version_id
     WHERE ap.id = $1 AND ap.user_id = $2`,
    [approvalId, userId],
  );
  if (!approval.rows[0]) return null;
  const items = await db.query(
    `SELECT logical_task_id, ordinal, task_description, scheduled_date, estimated_minutes, operation
     FROM plan_version_items WHERE plan_version_id = $1 ORDER BY ordinal ASC`,
    [approval.rows[0].plan_version_id],
  );
  return { approval: approval.rows[0], items: items.rows };
};

const decideApproval = async ({ userId, approvalId, decision, proposalHash }) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT * FROM agent_approvals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [approvalId, userId],
    );
    const approval = found.rows[0];
    if (!approval) {
      await client.query('ROLLBACK');
      return { missing: true };
    }
    const targetStatus = decision === 'approve' ? 'approved' : 'rejected';
    if (approval.proposal_hash !== proposalHash) {
      await client.query('ROLLBACK');
      return { stale: true };
    }
    if (approval.status === targetStatus) {
      await client.query('COMMIT');
      return { approval, duplicate: true };
    }
    if (approval.status !== 'pending' || (approval.expires_at && new Date(approval.expires_at) <= new Date())) {
      await client.query('ROLLBACK');
      return { conflict: true };
    }
    const updated = await client.query(
      `UPDATE agent_approvals SET status = $2, decided_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [approvalId, targetStatus],
    );
    if (targetStatus === 'rejected') {
      await client.query(
        `UPDATE plan_versions SET status = 'rejected'
         WHERE id = $1 AND status = 'pending_approval'`,
        [approval.plan_version_id],
      );
    }
    const run = await client.query(
      `UPDATE agent_runs SET status = 'accepted', current_step = 'resuming_approval', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'waiting_for_approval'
       RETURNING id`,
      [approval.run_id, userId],
    );
    if (!run.rows[0]) throw new Error('The approval run is not waiting for a decision.');
    await client.query(
      `INSERT INTO agent_dispatch_outbox (id, run_id, task_type, dispatch_key)
       VALUES ($1, $2, 'agent_run', $3)`,
      [crypto.randomUUID(), approval.run_id, `approval:${approvalId}:${targetStatus}`],
    );
    await client.query(
      `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
       VALUES ($1, $2, 'approval', $3, $4)`,
      [approval.run_id, targetStatus, targetStatus === 'approved' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
        targetStatus === 'approved' ? 'The student approved the exact plan proposal.' : 'The student rejected the plan proposal.'],
    );
    await client.query('COMMIT');
    return { approval: updated.rows[0], duplicate: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { decideApproval, getApprovalForUser, listApprovalsForUser };
