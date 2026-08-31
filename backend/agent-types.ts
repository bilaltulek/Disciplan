export type RunStatus = 'queued' | 'running' | 'reviewing' | 'revising' | 'succeeded' | 'failed' | 'cancelled';

export interface PlanTaskInput {
  task_description: string;
  scheduled_date: string;
  estimated_minutes: number;
}

export interface AssignmentForPlanning {
  id: number;
  userId: number;
  title: string;
  description: string;
  complexity: 'Easy' | 'Medium' | 'Hard';
  dueDate: string;
  totalItems: number;
}
