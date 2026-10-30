import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary, ScheduledTask } from '@/shared/api/types';

interface TimelineEditForm {
  task_description: string;
  scheduled_date: string;
  estimated_minutes: string;
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export const useTimelineTasks = () => {
  const [rawTasks, setRawTasks] = useState<ScheduledTask[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineError, setTimelineError] = useState('');
  const [metadataWarning, setMetadataWarning] = useState('');
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [editForm, setEditForm] = useState<TimelineEditForm>({ task_description: '', scheduled_date: '', estimated_minutes: '' });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchTimeline = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setTimelineError('');
    const [timelineResult, assignmentsResult] = await Promise.allSettled([
      apiRequest<ScheduledTask[]>('/api/timeline', { method: 'GET', headers: {} }),
      apiRequest<AssignmentSummary[]>('/api/assignments', { method: 'GET', headers: {} }),
    ]);

    if (timelineResult.status === 'fulfilled') {
      setRawTasks(timelineResult.value);
    } else {
      console.error('Failed to load timeline', timelineResult.reason);
      setTimelineError(errorMessage(timelineResult.reason, 'Timeline could not be loaded.'));
    }

    if (assignmentsResult.status === 'fulfilled') {
      setAssignments(assignmentsResult.value);
      setMetadataWarning('');
    } else {
      console.error('Failed to load assignment details', assignmentsResult.reason);
      setAssignments([]);
      setMetadataWarning('Some assignment details are temporarily unavailable. Tasks are still ready to use.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  const handleToggle = async (taskId: number, currentStatus: boolean) => {
    if (togglingId !== null) return;
    const previousTasks = rawTasks;
    const previousAssignments = assignments;
    const task = rawTasks.find((entry) => entry.id === taskId);
    setRawTasks((current) => current.map((entry) => (
      entry.id === taskId ? { ...entry, completed: !currentStatus } : entry
    )));
    if (task) {
      setAssignments((current) => current.map((assignment) => assignment.id === task.assignment_id ? {
        ...assignment,
        completed_subtasks: Math.min(
          assignment.total_subtasks,
          Math.max(0, assignment.completed_subtasks + (currentStatus ? -1 : 1)),
        ),
      } : assignment));
    }
    setTogglingId(taskId);

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !currentStatus }),
      });
    } catch (error) {
      setRawTasks(previousTasks);
      setAssignments(previousAssignments);
      console.error('Failed to toggle task', error);
      alert(errorMessage(error, 'Failed to update task completion.'));
    } finally {
      setTogglingId(null);
    }
  };

  const openEdit = (task: ScheduledTask) => {
    setEditTask(task);
    setEditForm({
      task_description: task.task_description,
      scheduled_date: task.scheduled_date,
      estimated_minutes: String(task.estimated_minutes || 30),
    });
  };

  const handleSaveEdit = async () => {
    if (!editTask) return;
    setSaving(true);
    try {
      await apiRequest(`/api/tasks/${editTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          task_description: editForm.task_description,
          scheduled_date: editForm.scheduled_date,
          estimated_minutes: Number.parseInt(editForm.estimated_minutes, 10),
          completed: !!editTask.completed,
        }),
      });
      setEditTask(null);
      await fetchTimeline(false);
    } catch (error) {
      console.error('Failed to update task', error);
      alert(errorMessage(error, 'Failed to update task.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!window.confirm('Delete this timeline task permanently?')) return;
    const task = rawTasks.find((entry) => entry.id === taskId);
    setDeletingId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE', headers: {} });
      setRawTasks((current) => current.filter((entry) => entry.id !== taskId));
      if (task) {
        setAssignments((current) => current.map((assignment) => assignment.id === task.assignment_id ? {
          ...assignment,
          total_subtasks: Math.max(0, assignment.total_subtasks - 1),
          completed_subtasks: Math.max(0, assignment.completed_subtasks - (task.completed ? 1 : 0)),
        } : assignment));
      }
    } catch (error) {
      console.error('Failed to delete task', error);
      alert(errorMessage(error, 'Failed to delete task.'));
    } finally {
      setDeletingId(null);
    }
  };
  return {
    rawTasks, assignments, loading, timelineError, metadataWarning, editTask, setEditTask,
    editForm, setEditForm, saving, togglingId, deletingId, fetchTimeline,
    handleToggle, openEdit, handleSaveEdit, handleDelete,
  };
};
