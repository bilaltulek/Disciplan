CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_input_micro_usd BIGINT NOT NULL DEFAULT 0,
  estimated_output_micro_usd BIGINT NOT NULL DEFAULT 0,
  estimated_total_micro_usd BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'blocked_budget', 'blocked_user_limit', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON ai_usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_day ON ai_usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_status ON ai_usage_events (status);
