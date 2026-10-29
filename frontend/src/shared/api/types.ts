import type { Complexity } from '@/shared/settings/defaults';

export type PlanGenerationStatus = 'accepted' | 'queued' | 'running' | 'reviewing' | 'revising' | 'waiting_for_input' | 'waiting_for_approval' | 'succeeded' | 'failed' | 'cancelled';
export type PlanSource = 'gemini' | 'fallback_error' | 'fallback_limit' | 'agentic' | null;
export interface RuntimeCapabilities {
  mode: 'off' | 'shadow' | 'active';
  conversationalPlanning: boolean;
  asynchronousFormPlanning: boolean;
  tutoring: boolean;
  groundedResources: boolean;
}

export interface StudyTask {
  id: number;
  assignment_id: number;
  task_description: string;
  scheduled_date: string;
  estimated_minutes: number | null;
  actual_minutes?: number | null;
  completed: boolean;
  completed_at?: string | null;
  assignment_title?: string;
  complexity?: Complexity;
}

export interface AssignmentSummary {
  id: number;
  title: string;
  description: string;
  complexity: Complexity;
  due_date: string;
  total_items: number;
  total_subtasks: number;
  completed_subtasks: number;
  created_at?: string;
  plan_generation_run_id?: string | null;
  plan_generation_status?: PlanGenerationStatus | null;
  plan_generation_step?: string | null;
  plan_generation_source?: PlanSource;
  plan_generation_failure_message?: string | null;
}

export interface ScheduledTask extends StudyTask {
  assignment_title: string;
  complexity: Complexity;
}
