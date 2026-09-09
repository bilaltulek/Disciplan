// task-templates.js

const taskTemplates = {
  // MATHEMATICS ASSIGNMENTS
  mathematics: {
    Easy: [
      'Review relevant theorems and formulas',
      'Work through example problems from textbook',
      'Complete assigned problem set',
      'Check answers and review mistakes'
    ],
    Medium: [
      'Review chapter notes and key concepts',
      'Identify problem types and required techniques',
      'Solve first half of problems (show all work)',
      'Solve second half of problems',
      'Verify solutions and check for errors',
      'Write up solutions neatly',
      'Final review and submission'
    ],
    Hard: [
      'Review all relevant chapters and theorems',
      'Create formula sheet and reference guide',
      'Categorize problems by type and difficulty',
      'Attempt straightforward problems first',
      'Work on moderate difficulty problems',
      'Tackle challenging/proof-based problems',
      'Review solutions for logical consistency',
      'Verify calculations and check edge cases',
      'Write formal proofs with proper notation',
      'Final review, formatting, and submission'
    ]
  },

  // COMPUTER SCIENCE ASSIGNMENTS
  computer_science: {
    Easy: [
      'Read assignment requirements and setup environment',
      'Write pseudocode or plan algorithm',
      'Implement basic functionality',
      'Test, debug, and submit'
    ],
    Medium: [
      'Analyze requirements and edge cases',
      'Design algorithm and data structures',
      'Set up project structure and dependencies',
      'Implement core functionality',
      'Write test cases and debug',
      'Add error handling and validation',
      'Write documentation and comments',
      'Final testing and submission'
    ],
    Hard: [
      'Analyze requirements and system design',
      'Research algorithms and best practices',
      'Design architecture and choose data structures',
      'Set up development environment and version control',
      'Implement core modules/classes',
      'Implement additional features and integration',
      'Write comprehensive unit tests',
      'Perform integration testing and debugging',
      'Optimize performance and refactor code',
      'Write documentation and README',
      'Code review, final testing, and deployment'
    ]
  },

  // OPERATING SYSTEMS / SYSTEMS PROGRAMMING STUDY
  operating_systems: {
    Easy: [
      'Review the operating-systems chapter and define its key terms',
      'Connect the chapter concepts to a small C example',
      'Complete a short retrieval-practice check',
      'Review mistakes and summarize weak areas'
    ],
    Medium: [
      'Preview the operating-systems chapter and list its learning objectives',
      'Refresh the required C and systems-programming prerequisites',
      'Study process, memory, and concurrency concepts from the chapter',
      'Trace a small systems-programming example by hand',
      'Complete focused practice questions or code exercises',
      'Self-test the key concepts without notes',
      'Review weak areas and write a concise chapter summary'
    ],
    Hard: [
      'Map the operating-systems chapter objectives to prerequisite knowledge',
      'Refresh C syntax, memory, and systems-programming fundamentals',
      'Study process creation, execution, and lifecycle concepts',
      'Study memory-management and concurrency concepts',
      'Trace representative systems calls and execution paths',
      'Implement small focused C experiments for the requested concepts',
      'Explain observed behavior and identify edge cases',
      'Complete mixed retrieval and application exercises',
      'Self-test without notes and correct misconceptions',
      'Create a concise chapter review sheet'
    ]
  },

  // ENGLISH/WRITING ASSIGNMENTS
  english: {
    Easy: [
      'Read prompt and brainstorm ideas',
      'Create basic outline',
      'Write first draft',
      'Proofread, edit, and submit'
    ],
    Medium: [
      'Analyze prompt and identify key requirements',
      'Conduct research and gather sources',
      'Create detailed thesis and outline',
      'Write introduction and thesis statement',
      'Write body paragraphs with evidence',
      'Write conclusion',
      'Revise for clarity and argument strength',
      'Proofread for grammar and citations',
      'Final review and submission'
    ],
    Hard: [
      'Deep analysis of prompt and requirements',
      'Conduct extensive research and literature review',
      'Organize sources and create annotated bibliography',
      'Develop thesis and comprehensive outline',
      'Write introduction with strong thesis statement',
      'Write first set of body paragraphs with evidence',
      'Write second set of body paragraphs',
      'Write conclusion with synthesis',
      'Revise for argument coherence and flow',
      'Peer review or get feedback',
      'Major revision incorporating feedback',
      'Final proofreading and citation check',
      'Format according to style guide and submit'
    ]
  },

  // PHYSICS ASSIGNMENTS
  physics: {
    Easy: [
      'Review relevant physics concepts and formulas',
      'Work through example problems',
      'Solve assigned problems showing work',
      'Check units and verify answers'
    ],
    Medium: [
      'Review chapter material and key equations',
      'Identify which principles apply to each problem',
      'Draw diagrams and define variables',
      'Solve problems using systematic approach',
      'Check dimensional analysis and units',
      'Verify answers make physical sense',
      'Write up solutions with explanations',
      'Final review and submission'
    ],
    Hard: [
      'Comprehensive review of relevant physics topics',
      'Create equation sheet and concept map',
      'Analyze each problem and identify approach',
      'Draw detailed free-body diagrams and schematics',
      'Set up equations from first principles',
      'Solve mathematical equations step-by-step',
      'Verify solutions through alternate methods',
      'Check limiting cases and special scenarios',
      'Analyze results for physical reasonableness',
      'Write formal solutions with derivations',
      'Create graphs or visualizations if needed',
      'Final review of all work and submission'
    ]
  },

  // GENERIC (fallback for other subjects)
  generic: {
    Easy: [
      'Review course notes and materials',
      'Identify the required concepts or deliverables',
      'Complete the main work in a focused session',
      'Check understanding and review the result'
    ],
    Medium: [
      'Review the assignment goals and available materials',
      'Identify the main topics, requirements, and dependencies',
      'Work through the first major section or concept',
      'Work through the remaining sections or concepts',
      'Practice or verify the completed work',
      'Review weak areas and make corrections',
      'Complete a final requirements check'
    ],
    Hard: [
      'Analyze the goals, requirements, and prerequisite knowledge',
      'Gather and organize the necessary learning resources',
      'Create a detailed sequence of milestones',
      'Work on first section/component',
      'Work on second section/component',
      'Work on third section/component',
      'Integrate and verify the completed work',
      'Complete retrieval practice or a requirements review',
      'Correct weak areas and unresolved issues',
      'Complete a final quality check'
    ]
  }
};

// Duration estimates by subject and complexity (in minutes)
const durationEstimates = {
  mathematics: {
    Easy: [30, 45, 60],
    Medium: [60, 90, 120],
    Hard: [90, 120, 180]
  },
  computer_science: {
    Easy: [45, 60, 90],
    Medium: [90, 120, 150],
    Hard: [120, 180, 240]
  },
  operating_systems: {
    Easy: [30, 45, 60],
    Medium: [45, 60, 90],
    Hard: [60, 90, 120]
  },
  english: {
    Easy: [30, 45, 60],
    Medium: [60, 90, 120],
    Hard: [120, 150, 180]
  },
  physics: {
    Easy: [30, 45, 60],
    Medium: [60, 90, 120],
    Hard: [90, 120, 180]
  },
  generic: {
    Easy: [30, 45, 60],
    Medium: [60, 90, 120],
    Hard: [120, 150, 180]
  }
};

// Helper function to get subject from assignment title/description
const matchesAny = (text: any, patterns: any) => patterns.some((pattern: any) => pattern.test(text));

const subjectPatterns = {
  operating_systems: [
    /\boperating systems?\b/i, /\bos\b/i, /\bunix\b/i, /\blinux\b/i,
    /\bsystems programming\b/i, /\bfork\s*\(\s*\)?/i, /\bsystem calls?\b/i,
    /\bprocess(?:es)?\b/i, /\bthreads?\b/i, /\bsynchroni[sz]ation\b/i,
  ],
  mathematics: [
    /\bmath(?:ematics)?\b/i, /\bcalculus\b/i, /\balgebra\b/i, /\bgeometry\b/i,
    /\bstatistics\b/i, /\btheorems?\b/i, /\bproofs?\b/i, /\bequations?\b/i,
    /\blinear algebra\b/i,
  ],
  computer_science: [
    /\bprogramming\b/i, /\bcoding\b/i, /\balgorithms?\b/i, /\bsoftware\b/i,
    /\bdatabases?\b/i, /\bjava\b/i, /\bpython\b/i, /\bjavascript\b/i,
    /\bhtml\b/i, /\bcss\b/i, /\bc\s+(?:syntax|language|programming|concepts?)\b/i,
    /\bpointers?\b/i,
  ],
  english: [
    /\bessays?\b/i, /\bpapers?\b/i, /\bliterature\b/i, /\bwriting\b/i,
    /\bcomposition\b/i, /\bnovels?\b/i, /\bpoems?\b/i, /\bshakespeare\b/i,
  ],
  physics: [
    /\bphysics\b/i, /\bmechanics\b/i, /\bthermodynamics\b/i, /\bquantum\b/i,
    /\bforces?\b/i, /\benergy\b/i, /\bmotion\b/i, /\belectricity\b/i,
    /\bmagnetism\b/i,
  ],
};

const workTypePatterns = {
  writing: [/\bessay\b/i, /\bpaper\b/i, /\breport\b/i, /\bthesis\b/i, /\bdraft\b/i, /\bwrite\b/i],
  implementation: [/\bimplement\b/i, /\bbuild\b/i, /\bcreate\s+(?:an?\s+)?(?:app|program|website)\b/i, /\bcode\b/i, /\bdebug\b/i],
  problem_set: [/\bproblem set\b/i, /\bhomework problems?\b/i, /\bsolve\b/i, /\bexercises?\b/i],
  study_review: [/\bchapters?\b/i, /\bstudy\b/i, /\breview\b/i, /\brefresh\b/i, /\blearn\b/i, /\bunderstand\b/i, /\bexam\b/i, /\bquiz\b/i, /\bread(?:ing)?\b/i],
};

const focusTopicPatterns = [
  { label: 'operating-systems foundations', patterns: [/\boperating systems?\b/i, /\bos\b/i] },
  { label: 'C syntax', patterns: [/\bc\s+syntax\b/i] },
  { label: 'C concepts for operating systems', patterns: [/\bc\s+concepts?(?:\s+for\s+(?:operating systems?|os))?\b/i] },
  { label: 'pointers', patterns: [/\bpointers?\b/i] },
  { label: 'fork()', patterns: [/\bfork\s*(?:\(\s*\))?/i] },
  { label: 'processes', patterns: [/\bprocess(?:es)?\b/i] },
  { label: 'threads', patterns: [/\bthreads?\b/i] },
  { label: 'memory management', patterns: [/\bmemory(?:\s+management)?\b/i] },
  { label: 'synchronization', patterns: [/\bsynchroni[sz]ation\b/i] },
  { label: 'concurrency', patterns: [/\bconcurren(?:cy|t)\b/i] },
  { label: 'Unix/Linux', patterns: [/\bunix\b/i, /\blinux\b/i] },
];

function detectSubject(title: any, description: any) {
  const text = `${title || ''} ${description || ''}`;
  for (const subject of ['operating_systems', 'mathematics', 'physics', 'english', 'computer_science']) {
    if (matchesAny(text, (subjectPatterns as Record<string, RegExp[]>)[subject])) return subject;
  }
  return 'generic';
}

function detectWorkType(title: any, description: any) {
  const text = `${title || ''} ${description || ''}`;
  for (const workType of ['writing', 'implementation', 'problem_set', 'study_review']) {
    if (matchesAny(text, (workTypePatterns as Record<string, RegExp[]>)[workType])) return workType;
  }
  return 'general_project';
}

function extractFocusTopics(title: any, description: any, limit = 8) {
  const text = `${title || ''} ${description || ''}`;
  return focusTopicPatterns
    .filter(({ patterns }) => matchesAny(text, patterns))
    .map(({ label }) => label)
    .slice(0, Math.max(0, Math.min(limit, 8)));
}

function buildStudyReviewTasks({ title, subject, focusTopics, complexity }: any) {
  const boundedTopics = focusTopics.slice(0, complexity === 'Easy' ? 3 : complexity === 'Hard' ? 8 : 6);
  const topicSummary = boundedTopics.length ? boundedTopics.join(', ') : 'the requested concepts';
  const tasks = [];
  if (title) tasks.push(`Preview ${title} and map its learning objectives to ${topicSummary}`);
  tasks.push(...boundedTopics.map((topic: any) => `Review and practice ${topic} with notes and a small worked example`));
  if (subject === 'operating_systems') {
    tasks.push('Trace how the requested operating-systems concepts behave in a small C example');
  } else {
    tasks.push('Complete focused retrieval practice on the requested concepts');
  }
  tasks.push(`Self-test ${topicSummary} without notes, correct mistakes, and summarize the weakest concepts`);
  return [...new Set(tasks)];
}

function getAssignmentTasks({ title, description, complexity = 'Medium' }: any) {
  const subject = detectSubject(title, description);
  const workType = detectWorkType(title, description);
  const focusTopics = extractFocusTopics(title, description);
  if (workType === 'study_review') {
    return {
      subject, workType, focusTopics,
      tasks: buildStudyReviewTasks({ title, subject, focusTopics, complexity }),
    };
  }
  const templateSubject = workType === 'writing' ? 'english' : subject;
  return { subject, workType, focusTopics, tasks: getTasks(templateSubject, complexity) };
}

// Get tasks for a given subject and complexity
function getTasks(subject: any, complexity: any) {
  const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '_');
  const templates = taskTemplates as Record<string, Record<string, string[]>>;
  
  if (templates[normalizedSubject] && templates[normalizedSubject][complexity]) {
    return templates[normalizedSubject][complexity];
  }
  
  return templates.generic[complexity];
}

// Get estimated duration for a task
function getEstimatedDuration(subject: any, complexity: any) {
  const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '_');
  const estimates = durationEstimates as Record<string, Record<string, number[]>>;
  
  const durations = estimates[normalizedSubject] || estimates.generic;
  const options = durations[complexity];
  
  return options[Math.floor(options.length / 2)];
}

module.exports = {
  taskTemplates,
  durationEstimates,
  detectSubject,
  detectWorkType,
  extractFocusTopics,
  getAssignmentTasks,
  getTasks,
  getEstimatedDuration
};
