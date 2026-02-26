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
      'Create outline or structure',
      'Complete first draft',
      'Final review and submission'
    ],
    Medium: [
      'Gather research materials and resources',
      'Read and take notes on key topics',
      'Create detailed outline',
      'Write first draft',
      'Review and edit content',
      'Finalize and proofread',
      'Submit assignment'
    ],
    Hard: [
      'Conduct initial research and literature review',
      'Organize and categorize sources',
      'Create detailed project plan',
      'Work on first section/component',
      'Work on second section/component',
      'Work on third section/component',
      'Integration and testing',
      'Comprehensive review and editing',
      'Get feedback and revise',
      'Final polish and submission'
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
function detectSubject(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // Keywords for each subject
  const subjectKeywords = {
    mathematics: ['math', 'calculus', 'algebra', 'geometry', 'statistics', 'theorem', 'proof', 'equation', 'problem set', 'linear algebra'],
    computer_science: ['programming', 'code', 'algorithm', 'software', 'app', 'web', 'database', 'java', 'python', 'javascript', 'css', 'html'],
    english: ['essay', 'paper', 'literature', 'analysis', 'writing', 'composition', 'novel', 'poem', 'author', 'shakespeare'],
    physics: ['physics', 'mechanics', 'thermodynamics', 'quantum', 'force', 'energy', 'motion', 'electricity', 'magnetism']
  };

  // Check for keyword matches
  for (const [subject, keywords] of Object.entries(subjectKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return subject;
    }
  }

  return 'generic';
}

// Get tasks for a given subject and complexity
function getTasks(subject, complexity) {
  const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '_');
  
  if (taskTemplates[normalizedSubject] && taskTemplates[normalizedSubject][complexity]) {
    return taskTemplates[normalizedSubject][complexity];
  }
  
  return taskTemplates.generic[complexity];
}

// Get estimated duration for a task
function getEstimatedDuration(subject, complexity) {
  const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '_');
  
  const durations = durationEstimates[normalizedSubject] || durationEstimates.generic;
  const options = durations[complexity];
  
  return options[Math.floor(Math.random() * options.length)];
}

module.exports = {
  taskTemplates,
  durationEstimates,
  detectSubject,
  getTasks,
  getEstimatedDuration
};