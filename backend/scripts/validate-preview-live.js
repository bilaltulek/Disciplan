const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const deployment = process.env.DISCIPLAN_PREVIEW_URL;
const databaseUrl = process.env.AGENT_DATABASE_URL;
if (!deployment || !databaseUrl) {
  throw new Error('DISCIPLAN_PREVIEW_URL and AGENT_DATABASE_URL are required.');
}

const normalizedDeployment = deployment.replace(/\/$/, '');
const vercelCli = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'vercel', 'dist', 'index.js');
if (!fs.existsSync(vercelCli)) throw new Error('The Vercel CLI installation could not be located.');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'disciplan-preview-validation-'));
const cookieJar = path.join(temporaryDirectory, 'cookies.txt');
const password = `Dv-${crypto.randomBytes(18).toString('base64url')}`;
const email = `preview-validation-${crypto.randomUUID()}@example.invalid`;
const summary = { capabilities: null, formRuns: [], conversationRuns: [], cleanup: false };
let accountRegistered = false;

const invokeVercelCurl = ({ method = 'GET', pathname, body, headers = {} }) => {
  const curlArgs = [
    'curl', pathname, '--deployment', normalizedDeployment, '--', '--silent', '--show-error',
    '--cookie', cookieJar, '--cookie-jar', cookieJar, '--request', method,
    '--write-out', '\n%{http_code}',
  ];
  for (const [name, value] of Object.entries(headers)) curlArgs.push('--header', `${name}: ${value}`);
  if (body !== undefined) {
    curlArgs.push('--header', 'Content-Type: application/json', '--data-raw', JSON.stringify(body));
  }
  const result = spawnSync(process.execPath, [vercelCli, ...curlArgs], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Preview request command failed with exit ${result.status}.`);
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  const status = Number(lines.pop());
  const rawBody = lines.join('\n');
  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new Error(`Preview returned a non-JSON response with status ${status}.`);
  }
  return { status, body: parsed };
};

const getCookie = (name) => {
  if (!fs.existsSync(cookieJar)) return null;
  for (const line of fs.readFileSync(cookieJar, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (fields[5] === name) return decodeURIComponent(fields[6]);
  }
  return null;
};

const request = ({ method = 'GET', pathname, body, idempotencyKey }) => {
  const headers = {};
  const csrf = getCookie('disciplan_csrf');
  if (csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrf;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return invokeVercelCurl({ method, pathname, body, headers });
};

const requireStatus = (response, expected, label) => {
  if (response.status !== expected) {
    const code = response.body?.code || response.body?.error || 'UNKNOWN_ERROR';
    throw new Error(`${label} returned ${response.status} (${code}).`);
  }
  return response.body;
};

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);
const waitForRun = async (runId, { allowWaitingForInput = false, timeoutMs = 360_000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = requireStatus(request({ pathname: `/api/agent-runs/${runId}` }), 200, 'Run status').run;
    if (terminalStatuses.has(latest.status) || (allowWaitingForInput && latest.status === 'waiting_for_input')) return latest;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Run ${runId} did not reach the expected state (last: ${latest?.status || 'unknown'}).`);
};

const isoDateAfter = (days) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const safeRunDiagnostics = async (runId) => {
  const [events, usage] = await Promise.all([
    pool.query('SELECT detail_code,safe_detail FROM agent_run_events WHERE run_id=$1 ORDER BY id', [runId]),
    pool.query(
      `SELECT endpoint,COUNT(*)::int AS calls,COALESCE(SUM(total_tokens),0)::int AS total_tokens
       FROM ai_usage_events WHERE agent_run_id=$1 GROUP BY endpoint ORDER BY endpoint`,
      [runId],
    ),
  ]);
  return {
    runId,
    events: events.rows.filter((row) => row.detail_code),
    usage: usage.rows,
  };
};

const assertAgentic = async (run, label) => {
  if (run.status !== 'succeeded' || run.plan_source !== 'agentic') {
    const diagnostics = await safeRunDiagnostics(run.id);
    throw new Error(`${label} ended as ${run.status}/${run.plan_source || 'no-source'} (${run.failure_code || 'no code'}); safe diagnostics: ${JSON.stringify(diagnostics)}.`);
  }
};

const normalizedTaskText = (tasks) => tasks.map((task) => task.task_description).join(' ').toLowerCase();
const requireTerms = (text, termGroups, label) => {
  const missing = termGroups.filter((alternatives) => !alternatives.some((term) => text.includes(term)));
  if (missing.length) throw new Error(`${label} omitted required topic groups: ${missing.map((terms) => terms[0]).join(', ')}.`);
};

const requireNoWritingTemplate = (text, label) => {
  const forbidden = ['write first draft', 'proofread', 'submit assignment', 'create outline'];
  const found = forbidden.filter((term) => text.includes(term));
  if (found.length) throw new Error(`${label} contained generic writing phases: ${found.join(', ')}.`);
};

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 2 });

const executionEvidence = async (runId) => {
  const result = await pool.query(
    `SELECT r.id, r.status, r.plan_source, r.provider_run_id, r.model_provider, r.model_name,
            r.graph_version, r.prompt_bundle_version,
            usage.usage_events, usage.total_tokens,
            events.graph_started, events.plan_published
       FROM agent_runs r
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS usage_events,COALESCE(SUM(total_tokens),0)::int AS total_tokens
         FROM ai_usage_events WHERE agent_run_id=r.id AND status='allowed'
       ) usage
       CROSS JOIN LATERAL (
         SELECT BOOL_OR(detail_code='RUN_STARTED') AS graph_started,
                BOOL_OR(detail_code='PLAN_PUBLISHED') AS plan_published
         FROM agent_run_events WHERE run_id=r.id
       ) events
      WHERE r.id = $1
      `,
    [runId],
  );
  const evidence = result.rows[0];
  if (!evidence) throw new Error(`No database evidence exists for run ${runId}.`);
  if (!evidence.provider_run_id || !evidence.graph_started || !evidence.plan_published
      || evidence.model_provider !== 'gemini' || evidence.usage_events < 1 || evidence.total_tokens < 1
      || evidence.plan_source !== 'agentic') {
    throw new Error(`Run ${runId} did not prove the complete Trigger/LangGraph/Gemini path.`);
  }
  return {
    runId: evidence.id,
    providerRunId: evidence.provider_run_id,
    planSource: evidence.plan_source,
    modelProvider: evidence.model_provider,
    modelName: evidence.model_name,
    graphVersion: evidence.graph_version,
    promptBundleVersion: evidence.prompt_bundle_version,
    usageEvents: evidence.usage_events,
    totalTokens: evidence.total_tokens,
    graphStarted: evidence.graph_started,
    planPublished: evidence.plan_published,
  };
};

const createFormPlan = async ({ title, description, totalItems, dueInDays, topicGroups }) => {
  const accepted = requireStatus(request({
    method: 'POST', pathname: '/api/assignments', idempotencyKey: crypto.randomUUID(),
    body: { title, description, complexity: 'Medium', dueDate: isoDateAfter(dueInDays), totalItems },
  }), 202, `${title} assignment`);
  const run = await waitForRun(accepted.run.id);
  await assertAgentic(run, title);
  const tasks = requireStatus(request({ pathname: `/api/assignment/plan/${accepted.id}` }), 200, `${title} plan`);
  const taskText = normalizedTaskText(tasks);
  requireTerms(taskText, topicGroups, title);
  requireNoWritingTemplate(taskText, title);
  const evidence = await executionEvidence(run.id);
  summary.formRuns.push({ ...evidence, assignmentId: accepted.id, taskCount: tasks.length, topicCoverage: true });
};

const sendMessage = (threadId, content) => requireStatus(request({
  method: 'POST', pathname: `/api/agent-threads/${threadId}/messages`,
  idempotencyKey: crypto.randomUUID(), body: { content, clientMessageId: crypto.randomUUID() },
}), 202, 'Assistant message');

const run = async () => {
  requireStatus(request({ pathname: '/api/health' }), 200, 'Health');
  requireStatus(request({ method: 'POST', pathname: '/api/register', body: { email, password, name: 'Preview Validator' } }), 200, 'Registration');
  accountRegistered = true;

  const currentProfile = requireStatus(request({ pathname: '/api/planning-profile' }), 200, 'Planning profile').profile;
  requireStatus(request({
    method: 'PATCH', pathname: '/api/planning-profile', body: {
      expectedVersion: currentProfile.version,
      timezone: 'UTC',
      weekday_available_minutes: { 0: 720, 1: 720, 2: 720, 3: 720, 4: 720, 5: 720, 6: 720 },
      max_daily_minutes: 720,
      preferred_session_minutes: 45,
    },
  }), 200, 'Planning profile update');

  const capabilities = requireStatus(request({ pathname: '/api/runtime-capabilities' }), 200, 'Runtime capabilities');
  if (capabilities.mode !== 'active' || !capabilities.conversationalPlanning || !capabilities.asynchronousFormPlanning) {
    throw new Error('Vercel Preview does not expose active agent capabilities.');
  }
  summary.capabilities = capabilities;

  if (!process.argv.includes('--assistant-only')) await createFormPlan({
    title: 'OS chapter 1', dueInDays: 10, totalItems: 7,
    description: 'Refresh C syntax and C concepts for operating systems, including pointers, memory, processes, and fork(), while studying OS chapter 1.',
    topicGroups: [['c syntax'], ['pointer'], ['fork'], ['operating system', 'os chapter'], ['memory'], ['process']],
  });
  if (!process.argv.includes('--assistant-only')) await createFormPlan({
    title: 'Atlantic Slave Trade history review', dueInDays: 12, totalItems: 7,
    description: 'Study the triangular trade, Middle Passage, economic motives, resistance, abolition, and long-term consequences of the Atlantic slave trade.',
    topicGroups: [['triangular trade'], ['middle passage'], ['economic'], ['resistance'], ['abolition'], ['consequence']],
  });
  if (!process.argv.includes('--assistant-only')) await createFormPlan({
    title: 'Cellular respiration exam review', dueInDays: 9, totalItems: 6,
    description: 'Review glycolysis, the Krebs cycle, electron transport chain, ATP yield, and aerobic versus anaerobic respiration.',
    topicGroups: [['glycolysis'], ['krebs'], ['electron transport'], ['atp'], ['aerobic'], ['anaerobic']],
  });

  const normalThread = requireStatus(request({ method: 'POST', pathname: '/api/agent-threads', body: { title: 'Biology planning' } }), 201, 'Thread creation').thread;
  const normalAccepted = sendMessage(
    normalThread.id,
    `Create a study plan. Title: Cellular Biology Exam. Description: Review mitosis, meiosis, DNA replication, transcription, translation, and genetic variation. Complexity: Medium. Due date: ${isoDateAfter(11)}. Total items: 6.`,
  );
  const normalRun = await waitForRun(normalAccepted.run.id);
  await assertAgentic(normalRun, 'Normal Assistant plan');
  summary.conversationRuns.push({ kind: 'normal', ...await executionEvidence(normalRun.id) });

  const clarificationThread = requireStatus(request({ method: 'POST', pathname: '/api/agent-threads', body: { title: 'History clarification' } }), 201, 'Clarification thread creation').thread;
  const clarificationAccepted = sendMessage(clarificationThread.id, 'Help me plan a review of Reconstruction after the Civil War.');
  const waiting = await waitForRun(clarificationAccepted.run.id, { allowWaitingForInput: true });
  if (waiting.status !== 'waiting_for_input') throw new Error(`Clarification request ended as ${waiting.status} instead of waiting_for_input.`);
  const resumed = sendMessage(
    clarificationThread.id,
    `It is due ${isoDateAfter(13)}, Medium difficulty, and I want six study sessions covering emancipation, the Freedmen's Bureau, Reconstruction amendments, Black political participation, resistance, and the end of Reconstruction.`,
  );
  if (resumed.run.id !== waiting.id) throw new Error('Clarification created a new run instead of resuming the waiting run.');
  const resumedRun = await waitForRun(resumed.run.id);
  await assertAgentic(resumedRun, 'Clarification-resumed Assistant plan');
  const clarificationEvents = requireStatus(request({ pathname: `/api/agent-runs/${resumedRun.id}/events` }), 200, 'Clarification events').events;
  if (!clarificationEvents.some((event) => event.detail_code === 'CLARIFICATION_REQUIRED')) {
    throw new Error('Clarification run has no persisted CLARIFICATION_REQUIRED event.');
  }
  summary.conversationRuns.push({ kind: 'clarification_resume', clarificationPersisted: true, ...await executionEvidence(resumedRun.id) });

  requireStatus(request({ method: 'DELETE', pathname: '/api/account', body: { password } }), 200, 'Account deletion');
  accountRegistered = false;
  const deletion = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [email]);
  if (deletion.rows[0].count !== 0) throw new Error('Disposable validation account was not fully deleted.');
  summary.cleanup = true;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

run().catch((error) => {
  process.stderr.write(`Preview validation failed: ${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (accountRegistered) {
    try {
      const cleanup = request({ method: 'DELETE', pathname: '/api/account', body: { password } });
      if (cleanup.status === 200) accountRegistered = false;
    } catch {
      // Preserve the original validation failure. A leftover disposable account
      // is detected and reported by the next isolated-database cleanup audit.
    }
  }
  await pool.end().catch(() => {});
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});
