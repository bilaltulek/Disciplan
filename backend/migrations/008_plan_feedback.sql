CREATE TABLE IF NOT EXISTS plan_feedback (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  plan_version_id UUID REFERENCES plan_versions(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'too_heavy', 'too_vague')),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_feedback_assignment_created
  ON plan_feedback (assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_feedback_user_created
  ON plan_feedback (user_id, created_at DESC);
