import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(__filename);
const templates = require('./task-templates');
const planner = require('./gemini-planner');

const osAssignment = {
  title: 'OS chapter 1',
  description: 'I need a refresh on C syntax, C concepts for OS, pointers, fork, and memory.',
  complexity: 'Medium',
  dueDate: '2099-06-30',
  startDate: '2099-06-01',
};

describe('deterministic assignment classification', () => {
  it('classifies an OS/C chapter request as a study review with explicit focus topics', () => {
    const result = templates.getAssignmentTasks(osAssignment);
    expect(result.subject).toBe('operating_systems');
    expect(result.workType).toBe('study_review');
    expect(result.focusTopics).toEqual(expect.arrayContaining(['C syntax', 'pointers', 'fork()']));
  });

  it('does not treat an arbitrary word containing c as the C language', () => {
    expect(templates.detectSubject('Civic engagement chapter', 'Review local community policy.')).toBe('generic');
  });

  it('retains writing and implementation workflows only for matching requests', () => {
    expect(templates.detectWorkType('Research essay', 'Write a first draft.')).toBe('writing');
    expect(templates.detectWorkType('Programming project', 'Implement and debug a CLI.')).toBe('implementation');
  });

  it('builds a deterministic OS plan that covers named topics without essay boilerplate', () => {
    const first = planner.buildFallbackPlan(osAssignment);
    const second = planner.buildFallbackPlan(osAssignment);
    const text = first.map((task: { task_description: string }) => task.task_description).join(' ').toLowerCase();
    expect(second).toEqual(first);
    expect(text).toContain('c syntax');
    expect(text).toContain('pointers');
    expect(text).toContain('fork()');
    expect(text).toContain('os chapter 1');
    expect(text).not.toMatch(/first draft|proofread|submit assignment/);
  });
});
