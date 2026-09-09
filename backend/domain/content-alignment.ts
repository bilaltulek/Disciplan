const { extractFocusTopics } = require('../task-templates');

const topicCoveragePatterns = {
  'operating-systems foundations': [/\boperating systems?\b/i, /\bos\s+(?:chapter|concept|foundation)/i],
  'C syntax': [/\bc\s+syntax\b/i],
  'C concepts for operating systems': [/\bc\s+(?:concepts?|fundamentals?|prerequisites?|systems programming)\b/i],
  pointers: [/\bpointers?\b/i],
  'fork()': [/\bfork\s*(?:\(\s*\))?/i, /\bprocess creation\b/i],
  processes: [/\bprocess(?:es| lifecycle| management)?\b/i],
  threads: [/\bthreads?\b/i],
  'memory management': [/\bmemory(?:\s+management|\s+handling)?\b/i],
  synchronization: [/\bsynchroni[sz](?:ation|e|ed)\b/i],
  concurrency: [/\bconcurren(?:cy|t)\b/i],
  'Unix/Linux': [/\bunix\b/i, /\blinux\b/i],
};

const getMissingFocusTopics = ({ assignment, tasks }: any) => {
  const requested = extractFocusTopics(assignment?.title, assignment?.description);
  if (!requested.length) return [];
  const planText = (Array.isArray(tasks) ? tasks : [])
    .map((task) => task?.task_description || task?.taskDescription || '')
    .join(' ');
  return requested.filter((topic: any) => {
    const patterns = (topicCoveragePatterns as Record<string, RegExp[]>)[topic] || [];
    return !patterns.some((pattern: any) => pattern.test(planText));
  });
};

const validateFocusTopicCoverage = (input: any) => {
  const missing = getMissingFocusTopics(input);
  return missing.length
    ? [`[CONTENT_ALIGNMENT_FAILED] The plan must explicitly cover: ${missing.join(', ')}.`]
    : [];
};

export = { getMissingFocusTopics, validateFocusTopicCoverage };
