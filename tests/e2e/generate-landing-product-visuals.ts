import { chromium, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Theme = 'light' | 'dark';
type View = 'desktop' | 'mobile';

const BASE_URL = process.env.LANDING_CAPTURE_BASE_URL || 'http://127.0.0.1:5173';
const REVIEW_MODE = process.env.LANDING_SEMANTIC_REVIEW === '1';
const OUTPUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  REVIEW_MODE ? '../../.tmp/landing-semantic-review' : '../../frontend/public/landing/product',
);
const CAPTURE_NOW = new Date('2026-09-07T17:00:00.000Z');

const dayKey = (offset: number) => {
  const value = new Date(CAPTURE_NOW);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

const assignments = [
  {
    id: 7,
    title: 'Operating Systems lab',
    description: 'Processes, memory, and C exercises',
    complexity: 'Hard',
    due_date: dayKey(5),
    total_items: 6,
    total_subtasks: 6,
    completed_subtasks: 2,
    plan_generation_status: 'succeeded',
    plan_generation_source: 'agentic',
  },
  {
    id: 8,
    title: 'Calculus midterm review',
    description: 'Derivatives and integration practice',
    complexity: 'Medium',
    due_date: dayKey(8),
    total_items: 8,
    total_subtasks: 8,
    completed_subtasks: 5,
    plan_generation_status: 'succeeded',
    plan_generation_source: 'fallback_limit',
  },
  {
    id: 9,
    title: 'Research essay draft',
    description: 'Outline, sources, and first draft',
    complexity: 'Easy',
    due_date: dayKey(12),
    total_items: 5,
    total_subtasks: 5,
    completed_subtasks: 1,
    plan_generation_status: 'succeeded',
    plan_generation_source: 'agentic',
  },
];

const plan = [
  ['Read process and address-space notes', -1, 40, true],
  ['Trace fork() parent and child execution', 0, 45, true],
  ['Practice exec() and waitpid() calls', 0, 50, false],
  ['Complete remaining process exercises', 1, 55, false],
  ['Test edge cases and error handling', 2, 45, false],
  ['Final review and submission check', 4, 30, false],
].map(([task_description, offset, estimated_minutes, completed], index) => ({
  id: 101 + index,
  assignment_id: 7,
  task_description,
  scheduled_date: dayKey(Number(offset)),
  estimated_minutes,
  completed,
}));

const timeline = [
  ...plan.map((task, index) => ({
    ...task,
    scheduled_date: index < 3 ? dayKey(0) : dayKey(index - 2),
    assignment_title: 'Operating Systems lab',
    complexity: 'Hard',
  })),
  {
    id: 201,
    assignment_id: 8,
    task_description: 'Work through derivative practice set',
    scheduled_date: dayKey(1),
    estimated_minutes: 35,
    completed: false,
    assignment_title: 'Calculus midterm review',
    complexity: 'Medium',
  },
];

const history = [
  ['Summarize process memory notes', 'Operating Systems lab', 'Hard', -1, 42, 40],
  ['Review derivative rules', 'Calculus midterm review', 'Medium', -2, 34, 35],
  ['Collect three supporting sources', 'Research essay draft', 'Easy', -3, 48, 45],
  ['Complete integration warm-up', 'Calculus midterm review', 'Medium', -5, 30, null],
].map(([task_description, assignment_title, complexity, offset, actual_minutes, estimated_minutes], index) => ({
  id: 301 + index,
  assignment_id: index + 7,
  task_description,
  assignment_title,
  complexity,
  scheduled_date: dayKey(Number(offset)),
  completed_at: `${dayKey(Number(offset))}T20:15:00.000Z`,
  estimated_minutes,
  actual_minutes,
  completed: true,
}));

const messages = [
  {
    id: 'message-1',
    role: 'user',
    content: 'I missed today\'s process exercise. Can you make Friday lighter?',
    created_at: CAPTURE_NOW.toISOString(),
  },
  {
    id: 'message-2',
    role: 'assistant',
    content: 'I can move the unfinished process exercise to Thursday and keep Friday for the final review. Review the proposed change below before it is published.',
    content_metadata: {
      kind: 'proposal',
      suggestedActions: [{ label: 'Explain the new sequence', prompt: 'Explain why this sequence works.' }],
    },
    created_at: CAPTURE_NOW.toISOString(),
  },
];

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const installRoutes = async (page: Page, theme: Theme) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = `${url.pathname}${url.search}`;
    if (url.pathname === '/api/me') return json(route, { user: { id: 7, email: 'alex@example.invalid', name: 'Alex' } });
    if (url.pathname === '/api/settings') return json(route, { settings: {
      theme_mode: theme,
      start_page: 'dashboard',
      assignment_default_complexity: 'Medium',
      assignment_default_items: 5,
      confirm_assignment_delete: true,
    } });
    if (url.pathname === '/api/assignments' && request.method() === 'GET') return json(route, assignments);
    if (url.pathname === '/api/assignment/plan/7') return json(route, plan);
    if (url.pathname === '/api/timeline') return json(route, timeline);
    if (url.pathname === '/api/history') return json(route, history);
    if (url.pathname === '/api/runtime-capabilities') return json(route, {
      mode: 'active',
      conversationalPlanning: true,
      asynchronousFormPlanning: true,
      tutoring: true,
      groundedResources: true,
    });
    if (url.pathname === '/api/agent-threads') return json(route, { threads: [{
      id: 'thread-1',
      title: 'Adjust Operating Systems plan',
      last_activity_at: CAPTURE_NOW.toISOString(),
    }] });
    if (url.pathname === '/api/agent-threads/thread-1') return json(route, { messages });
    if (path === '/api/approvals?status=pending') return json(route, { approvals: [{
      id: 'approval-1',
      run_id: 'run-1',
      assignment_title: 'Operating Systems lab',
      proposal_hash: 'a'.repeat(64),
      rationale: 'Move one unfinished exercise and preserve Friday for final review.',
    }] });
    if (url.pathname === '/api/approvals/approval-1') return json(route, { items: [{
      logical_task_id: 'task-process-exercise',
      task_description: 'Complete remaining process exercises',
      scheduled_date: dayKey(1),
      estimated_minutes: 55,
      operation: 'move',
    }] });
    return json(route, { error: `Unhandled capture route: ${path}` }, 500);
  });
};

const waitForTheme = async (page: Page, theme: Theme) => {
  await page.waitForFunction((expected) => document.documentElement.classList.contains('dark') === (expected === 'dark'), theme);
  await page.waitForTimeout(450);
};

const showcaseSkin = `
  @font-face {
    font-family: "Landing Geist";
    src: url("/landing/fonts/Geist-Variable.woff2") format("woff2");
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
  }

  :root {
    --background: 60 6% 96%;
    --foreground: 120 3% 12%;
    --card: 0 0% 100%;
    --card-foreground: 120 3% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 120 3% 12%;
    --primary: 210 10% 39%;
    --primary-foreground: 0 0% 100%;
    --secondary: 60 4% 92%;
    --secondary-foreground: 120 3% 16%;
    --muted: 60 4% 93%;
    --muted-foreground: 120 2% 42%;
    --accent: 210 7% 91%;
    --accent-foreground: 210 10% 29%;
    --destructive: 0 32% 46%;
    --destructive-foreground: 0 0% 100%;
    --border: 120 3% 83%;
    --input: 60 4% 97%;
    --ring: 210 10% 39%;
    --radius: 0.75rem;
    color-scheme: light;
  }

  .dark {
    --background: 120 3% 7%;
    --foreground: 60 5% 94%;
    --card: 120 3% 10%;
    --card-foreground: 60 5% 94%;
    --popover: 120 3% 10%;
    --popover-foreground: 60 5% 94%;
    --primary: 210 7% 69%;
    --primary-foreground: 120 3% 9%;
    --secondary: 120 3% 15%;
    --secondary-foreground: 60 5% 94%;
    --muted: 120 3% 15%;
    --muted-foreground: 90 2% 66%;
    --accent: 210 5% 18%;
    --accent-foreground: 60 5% 94%;
    --destructive: 0 28% 54%;
    --destructive-foreground: 0 0% 100%;
    --border: 120 2% 23%;
    --input: 120 3% 13%;
    --ring: 210 7% 69%;
    color-scheme: dark;
  }

  body,
  .page-shell,
  .timeline-warp-page {
    background: #f4f4f2 !important;
    background-image: none !important;
    color: #1d1f1d !important;
    font-family: "Landing Geist", Arial, sans-serif !important;
  }

  .dark body,
  .dark .page-shell,
  .dark .timeline-warp-page {
    background: #111211 !important;
    background-image: none !important;
    color: #f0f1ee !important;
  }

  h1, h2, h3, h4, button, input, textarea, select {
    font-family: "Landing Geist", Arial, sans-serif !important;
    letter-spacing: -0.02em;
  }

  .glass-nav,
  .glass-panel,
  .glass-input,
  .glass-chip,
  .timeline-day-panel,
  .timeline-depth-future .timeline-day-panel,
  .timeline-depth-past .timeline-day-panel,
  .timeline-task-row,
  .timeline-depth-placeholder {
    background: #fbfbfa !important;
    background-image: none !important;
    border-color: #d5d7d3 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  .glass-nav {
    box-shadow: 0 1px 0 rgba(20, 22, 20, 0.03) !important;
  }

  .glass-panel,
  .timeline-day-panel {
    border-radius: 16px !important;
    box-shadow: 0 14px 34px -26px rgba(20, 22, 20, 0.42) !important;
  }

  .glass-chip,
  .glass-input,
  .timeline-task-row,
  .timeline-depth-placeholder {
    border-radius: 10px !important;
    box-shadow: none !important;
  }

  .dark .glass-nav,
  .dark .glass-panel,
  .dark .glass-input,
  .dark .glass-chip,
  .dark .timeline-day-panel,
  .dark .timeline-depth-future .timeline-day-panel,
  .dark .timeline-depth-past .timeline-day-panel,
  .dark .timeline-task-row,
  .dark .timeline-depth-placeholder {
    background: #191a19 !important;
    background-image: none !important;
    border-color: #343734 !important;
    box-shadow: none !important;
  }

  .glass-accent,
  .bg-primary,
  .bg-gradient-to-r,
  .bg-gradient-to-br {
    background: #606c76 !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  .dark .glass-accent,
  .dark .bg-primary,
  .dark .bg-gradient-to-r,
  .dark .bg-gradient-to-br {
    background: #9aa4ab !important;
    background-image: none !important;
    color: #141514 !important;
  }

  .task-hue-easy,
  .task-hue-medium,
  .task-hue-hard {
    background: #fbfbfa !important;
    background-image: none !important;
    border-color: #d5d7d3 !important;
    box-shadow: 0 12px 30px -26px rgba(20, 22, 20, 0.42) !important;
  }

  .dark .task-hue-easy,
  .dark .task-hue-medium,
  .dark .task-hue-hard {
    background: #191a19 !important;
    background-image: none !important;
    border-color: #343734 !important;
    box-shadow: none !important;
  }

  .task-hue-hard [class*="uppercase"],
  .task-hue-medium [class*="uppercase"],
  .task-hue-easy [class*="uppercase"] {
    display: inline-flex !important;
    align-items: center !important;
    min-height: 25px !important;
    padding: 3px 9px !important;
    border: 1px solid !important;
    border-radius: 999px !important;
    font-size: 10px !important;
    line-height: 1 !important;
    letter-spacing: 0.06em !important;
  }

  .task-hue-hard [class*="uppercase"] {
    background: #f6eaea !important;
    border-color: #ddc0c0 !important;
    color: #8a4b4b !important;
  }

  .task-hue-medium [class*="uppercase"] {
    background: #f5efe2 !important;
    border-color: #daccaa !important;
    color: #7b632f !important;
  }

  .task-hue-easy [class*="uppercase"] {
    background: #eaf1eb !important;
    border-color: #c4d4c7 !important;
    color: #506b57 !important;
  }

  .dark .task-hue-hard [class*="uppercase"] {
    background: #2b1f20 !important;
    border-color: #553638 !important;
    color: #d19797 !important;
  }

  .dark .task-hue-medium [class*="uppercase"] {
    background: #2b261c !important;
    border-color: #51442b !important;
    color: #c7a966 !important;
  }

  .dark .task-hue-easy [class*="uppercase"] {
    background: #1e2922 !important;
    border-color: #354b3b !important;
    color: #8eb499 !important;
  }

  .task-hue-hard .mb-4 > .w-full,
  .task-hue-medium .mb-4 > .w-full,
  .task-hue-easy .mb-4 > .w-full {
    box-sizing: border-box !important;
    background: #e6eaec !important;
    border: 1px solid #aeb8bd !important;
    box-shadow: inset 0 1px 1px rgba(28, 35, 39, .06) !important;
  }

  .task-hue-hard .mb-4 > .w-full > div,
  .task-hue-medium .mb-4 > .w-full > div,
  .task-hue-easy .mb-4 > .w-full > div {
    background: #3f7092 !important;
    background-image: none !important;
    border-radius: 999px !important;
  }

  .dark .task-hue-hard .mb-4 > .w-full,
  .dark .task-hue-medium .mb-4 > .w-full,
  .dark .task-hue-easy .mb-4 > .w-full {
    background: #252a2d !important;
    border-color: #525d63 !important;
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, .28) !important;
  }

  .dark .task-hue-hard .mb-4 > .w-full > div,
  .dark .task-hue-medium .mb-4 > .w-full > div,
  .dark .task-hue-easy .mb-4 > .w-full > div {
    background: #6f9bb8 !important;
  }

  .task-hue-hard .mt-auto > button:first-child,
  .task-hue-medium .mt-auto > button:first-child,
  .task-hue-easy .mt-auto > button:first-child {
    background: #242624 !important;
    border-color: #242624 !important;
    color: #ffffff !important;
    box-shadow: none !important;
  }

  .dark .task-hue-hard .mt-auto > button:first-child,
  .dark .task-hue-medium .mt-auto > button:first-child,
  .dark .task-hue-easy .mt-auto > button:first-child {
    background: #e7e9e6 !important;
    border-color: #e7e9e6 !important;
    color: #171817 !important;
    box-shadow: 0 5px 14px -10px rgba(255, 255, 255, .45) !important;
  }

  .task-hue-hard .mt-auto > button:last-child,
  .task-hue-medium .mt-auto > button:last-child,
  .task-hue-easy .mt-auto > button:last-child {
    background: transparent !important;
    border-color: #d9bcbc !important;
    color: #965252 !important;
  }

  .dark .task-hue-hard .mt-auto > button:last-child,
  .dark .task-hue-medium .mt-auto > button:last-child,
  .dark .task-hue-easy .mt-auto > button:last-child {
    background: transparent !important;
    border-color: #563638 !important;
    color: #cf8d8d !important;
  }

  .task-hue-hard p.mt-1.text-xs,
  .task-hue-medium p.mt-1.text-xs,
  .task-hue-easy p.mt-1.text-xs {
    color: #707570 !important;
    font-size: 10px !important;
    line-height: 1.3 !important;
    opacity: .72 !important;
  }

  .dark .task-hue-hard p.mt-1.text-xs,
  .dark .task-hue-medium p.mt-1.text-xs,
  .dark .task-hue-easy p.mt-1.text-xs {
    color: #9ba09c !important;
  }

  .glass-panel.mb-6 > button.glass-chip:nth-of-type(1) {
    background: #ededeb !important;
    border-color: #cfd2ce !important;
    color: #2e312f !important;
  }

  .glass-panel.mb-6 > button.glass-chip:nth-of-type(2) {
    background: #eaf1eb !important;
    border-color: #c4d4c7 !important;
    color: #506b57 !important;
  }

  .glass-panel.mb-6 > button.glass-chip:nth-of-type(3) {
    background: #f5efe2 !important;
    border-color: #daccaa !important;
    color: #7b632f !important;
  }

  .glass-panel.mb-6 > button.glass-chip:nth-of-type(4) {
    background: #f6eaea !important;
    border-color: #ddc0c0 !important;
    color: #8a4b4b !important;
  }

  .dark .glass-panel.mb-6 > button.glass-chip:nth-of-type(1) {
    background: #242624 !important;
    border-color: #454945 !important;
    color: #f0f1ee !important;
  }

  .dark .glass-panel.mb-6 > button.glass-chip:nth-of-type(2) {
    background: #1e2922 !important;
    border-color: #354b3b !important;
    color: #8eb499 !important;
  }

  .dark .glass-panel.mb-6 > button.glass-chip:nth-of-type(3) {
    background: #2b261c !important;
    border-color: #51442b !important;
    color: #c7a966 !important;
  }

  .dark .glass-panel.mb-6 > button.glass-chip:nth-of-type(4) {
    background: #2b1f20 !important;
    border-color: #553638 !important;
    color: #d19797 !important;
  }

  .glass-nav .cursor-pointer.rounded-full {
    border-color: #c9ccc8 !important;
    background: #e7e9e6 !important;
    box-shadow: none !important;
  }

  .glass-nav .cursor-pointer.rounded-full > .rounded-full {
    background: #e7e9e6 !important;
    color: #454a46 !important;
    backdrop-filter: none !important;
  }

  .dark .glass-nav .cursor-pointer.rounded-full {
    border-color: #3b3e3b !important;
    background: #292b29 !important;
  }

  .dark .glass-nav .cursor-pointer.rounded-full > .rounded-full {
    background: #292b29 !important;
    color: #e5e7e3 !important;
  }

  [class*="bg-sky-"],
  [class*="bg-cyan-"],
  [class*="bg-blue-"],
  [class*="bg-indigo-"],
  [class*="bg-purple-"],
  [class*="bg-emerald-"],
  [class*="bg-yellow-"],
  [class*="bg-amber-"],
  [class*="bg-rose-"] {
    background-color: #eceeec !important;
    background-image: none !important;
  }

  .dark [class*="bg-sky-"],
  .dark [class*="bg-cyan-"],
  .dark [class*="bg-blue-"],
  .dark [class*="bg-indigo-"],
  .dark [class*="bg-purple-"],
  .dark [class*="bg-emerald-"],
  .dark [class*="bg-yellow-"],
  .dark [class*="bg-amber-"],
  .dark [class*="bg-rose-"] {
    background-color: #202220 !important;
  }

  [class*="text-sky-"],
  [class*="text-cyan-"],
  [class*="text-blue-"],
  [class*="text-indigo-"],
  [class*="text-purple-"],
  [class*="text-emerald-"],
  [class*="text-yellow-"],
  [class*="text-amber-"],
  [class*="text-rose-"] {
    color: #586771 !important;
  }

  .dark [class*="text-sky-"],
  .dark [class*="text-cyan-"],
  .dark [class*="text-blue-"],
  .dark [class*="text-indigo-"],
  .dark [class*="text-purple-"],
  .dark [class*="text-emerald-"],
  .dark [class*="text-yellow-"],
  .dark [class*="text-amber-"],
  .dark [class*="text-rose-"] {
    color: #aab3b9 !important;
  }

  [class*="border-sky-"],
  [class*="border-cyan-"],
  [class*="border-blue-"],
  [class*="border-indigo-"],
  [class*="border-purple-"],
  [class*="border-emerald-"],
  [class*="border-yellow-"],
  [class*="border-amber-"],
  [class*="border-rose-"] {
    border-color: #aeb5b1 !important;
  }

  .dark [class*="border-sky-"],
  .dark [class*="border-cyan-"],
  .dark [class*="border-blue-"],
  .dark [class*="border-indigo-"],
  .dark [class*="border-purple-"],
  .dark [class*="border-emerald-"],
  .dark [class*="border-yellow-"],
  .dark [class*="border-amber-"],
  .dark [class*="border-rose-"] {
    border-color: #4a4f4b !important;
  }

  [class*="border-amber-"][class*="bg-amber-"] {
    background: #f5f0e5 !important;
    border-color: #d7c69f !important;
  }

  .dark [class*="border-amber-"][class*="bg-amber-"] {
    background: #262218 !important;
    border-color: #584b2f !important;
  }

  [class*="border-amber-"] [class*="text-amber-"] {
    color: #806631 !important;
  }

  .dark [class*="border-amber-"] [class*="text-amber-"] {
    color: #c8a969 !important;
  }

  button[class*="bg-emerald-"] {
    background: #66816d !important;
    border-color: #66816d !important;
    color: #ffffff !important;
  }

  .dark button[class*="bg-emerald-"] {
    background: #7e9f87 !important;
    border-color: #7e9f87 !important;
    color: #101310 !important;
  }

  .timeline-depth-stage,
  .timeline-depth-stack,
  .warp-stage {
    background: transparent !important;
    background-image: none !important;
  }

  .timeline-chip,
  .timeline-chip-easy,
  .timeline-chip-medium,
  .timeline-chip-hard {
    background: #f0f1ef !important;
    border-color: #d6d8d5 !important;
    color: #555b57 !important;
  }

  .dark .timeline-chip,
  .dark .timeline-chip-easy,
  .dark .timeline-chip-medium,
  .dark .timeline-chip-hard {
    background: #242624 !important;
    border-color: #3b3e3b !important;
    color: #b8bdb9 !important;
  }

  .timeline-nav-arrow,
  .timeline-task-actions button {
    background: #fbfbfa !important;
    border-color: #d5d7d3 !important;
    color: #3c413e !important;
    box-shadow: none !important;
  }

  .dark .timeline-nav-arrow,
  .dark .timeline-task-actions button {
    background: #202220 !important;
    border-color: #3b3e3b !important;
    color: #d8dbd7 !important;
  }

  .timeline-task-toggle input {
    accent-color: #66816d !important;
  }

  .dark .timeline-task-toggle input {
    accent-color: #86a68e !important;
  }

  .timeline-depth-front .timeline-day-panel {
    background: #f8f9f8 !important;
    border-color: #cbd0cd !important;
    box-shadow: 0 16px 38px -28px rgba(20, 24, 22, 0.48), inset 0 2px 0 #a3aca7 !important;
  }

  .dark .timeline-depth-front .timeline-day-panel {
    background: #1a1d1b !important;
    border-color: #3a403c !important;
    box-shadow: inset 0 2px 0 #66716a !important;
  }

  .timeline-task-row:hover,
  .timeline-task-row:focus-within {
    transform: none !important;
    box-shadow: none !important;
  }
`;

const installShowcaseSkin = async (page: Page) => {
  await page.addStyleTag({ content: showcaseSkin });
  await page.evaluate(() => document.fonts.ready);
};

const pngToWebp = async (context: BrowserContext, png: Buffer, quality = 0.84) => {
  const converter = await context.newPage();
  const dataUrl = await converter.evaluate(async ({ source, outputQuality }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', outputQuality);
  }, { source: png.toString('base64'), outputQuality: quality });
  await converter.close();
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
};

const saveViewport = async (page: Page, context: BrowserContext, name: string, height: number) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Capture viewport is unavailable.');
  const png = await page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(height, viewport.height) },
  });
  await writeFile(resolve(OUTPUT_DIR, `${name}.webp`), await pngToWebp(context, png));
};

const saveClip = async (
  page: Page,
  context: BrowserContext,
  name: string,
  clip: { x: number; y: number; width: number; height: number },
) => {
  const png = await page.screenshot({ type: 'png', animations: 'disabled', clip });
  await writeFile(resolve(OUTPUT_DIR, `${name}.webp`), await pngToWebp(context, png));
};

const saveElement = async (page: Page, context: BrowserContext, selector: string, name: string) => {
  const png = await page.locator(selector).screenshot({ type: 'png', animations: 'disabled' });
  await writeFile(resolve(OUTPUT_DIR, `${name}.webp`), await pngToWebp(context, png));
};

const captureSet = async (browser: Browser, theme: Theme, view: View) => {
  const mobile = view === 'mobile';
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1.25,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(CAPTURE_NOW);
  page.on('pageerror', (error) => console.error(`[${theme}/${view}] page error`, error));
  page.on('requestfailed', (request) => console.error(`[${theme}/${view}] request failed`, request.url(), request.failure()?.errorText));
  await installRoutes(page, theme);
  const suffix = `${theme}-${view}`;

  await page.goto(`${BASE_URL}/dashboard`);
  await page.getByRole('heading', { name: 'Current Assignments' }).waitFor();
  await waitForTheme(page, theme);
  await installShowcaseSkin(page);
  if (mobile) await saveElement(page, context, '.task-hue-hard', `dashboard-overview-${suffix}`);
  else await saveViewport(page, context, `dashboard-overview-${suffix}`, 620);

  if (REVIEW_MODE && !mobile) {
    await saveElement(page, context, '.task-hue-hard', `assignment-card-a-no-keyline-${theme}`);
    const keylineStyle = await page.addStyleTag({ content: `
      .task-hue-hard { box-shadow: inset 2px 0 0 #a96767, 0 12px 30px -26px rgba(20, 22, 20, .42) !important; }
      .task-hue-medium { box-shadow: inset 2px 0 0 #a88a49, 0 12px 30px -26px rgba(20, 22, 20, .42) !important; }
      .task-hue-easy { box-shadow: inset 2px 0 0 #6f8c76, 0 12px 30px -26px rgba(20, 22, 20, .42) !important; }
      .dark .task-hue-hard { box-shadow: inset 2px 0 0 #a66d6d !important; }
      .dark .task-hue-medium { box-shadow: inset 2px 0 0 #aa8d50 !important; }
      .dark .task-hue-easy { box-shadow: inset 2px 0 0 #719079 !important; }
    ` });
    await saveElement(page, context, '.task-hue-hard', `assignment-card-b-keyline-${theme}`);
    await keylineStyle.evaluate((element) => element.remove());
  }

  await page.getByRole('button', { name: 'Continue Plan' }).first().click();
  await page.getByText('Practice exec() and waitpid() calls').waitFor();
  await page.waitForTimeout(200);
  if (mobile) await saveViewport(page, context, `dashboard-plan-${suffix}`, 844);
  else await saveClip(page, context, `dashboard-plan-${suffix}`, { x: 120, y: 60, width: 1200, height: 720 });

  await page.goto(`${BASE_URL}/timeline`);
  await page.getByRole('button', { name: 'Hide Completed' }).waitFor();
  await waitForTheme(page, theme);
  await installShowcaseSkin(page);
  if (mobile) await saveViewport(page, context, `timeline-${suffix}`, 844);
  else await saveClip(page, context, `timeline-${suffix}`, { x: 120, y: 60, width: 1200, height: 720 });

  await page.goto(`${BASE_URL}/assistant`);
  await page.getByText('Review changes for Operating Systems lab').waitFor();
  await waitForTheme(page, theme);
  await installShowcaseSkin(page);
  if (mobile) {
    await page.locator('main').evaluate((element) => {
      element.style.height = 'auto';
      element.style.display = 'block';
    });
    await page.locator('main > div').first().evaluate((element) => { element.style.display = 'none'; });
    await page.locator('main > div').nth(1).evaluate((element) => {
      element.style.height = 'auto';
      element.style.minHeight = '0';
      element.style.overflow = 'visible';
    });
    await page.locator('main > div').nth(1).locator('section').evaluate((element) => {
      element.style.overflow = 'visible';
      element.style.flex = 'none';
    });
    await page.locator('main > div').nth(1).locator('form').evaluate((element) => { element.style.display = 'none'; });
    await saveElement(page, context, 'main > div:nth-child(2)', `assistant-${suffix}`);
  } else {
    await saveViewport(page, context, `assistant-${suffix}`, 660);
  }

  await page.goto(`${BASE_URL}/history`);
  await page.getByRole('heading', { name: 'Completion History' }).waitFor();
  await waitForTheme(page, theme);
  await installShowcaseSkin(page);
  await saveViewport(page, context, `history-${suffix}`, mobile ? 844 : 720);

  await context.close();
};

const main = async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const view of (REVIEW_MODE ? ['desktop'] : ['desktop', 'mobile']) as View[]) {
        await captureSet(browser, theme, view);
      }
    }
  } finally {
    await browser.close();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
