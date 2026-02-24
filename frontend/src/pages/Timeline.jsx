import React, { useState, useEffect } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/shared/api/client';

const NeuralNode = ({
  date, tasks, isToday, onToggle, disabled,
}) => (
  <div className="relative flex items-center mb-16 group">
    <div className="absolute left-[29px] top-10 w-0.5 h-full bg-gradient-to-b from-blue-300 to-slate-200 -z-10" />
    <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center border-4 z-10 bg-white transition-all duration-300 ${isToday ? 'border-blue-500 shadow-blue-200 shadow-lg scale-110' : 'border-slate-200'}`}>
      <span className="text-xs font-bold text-slate-400 uppercase">{new Date(date).toLocaleString('en-US', { weekday: 'short' })}</span>
      <span className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{new Date(date).getDate()}</span>
    </div>
    <div className="w-12 h-0.5 bg-slate-200 group-hover:bg-blue-200 transition-colors" />
    <div className="flex-1">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((task, i) => (
          <div key={i} className={`relative p-4 rounded-lg border-l-4 shadow-sm bg-white hover:shadow-md transition-all ${task.completed ? 'opacity-60 grayscale' : ''} ${task.complexity === 'Hard' ? 'border-l-red-500' : task.complexity === 'Medium' ? 'border-l-yellow-400' : 'border-l-blue-400'}`}>
            <div className="flex justify-between items-start mb-1">
              <h4 className={`font-bold text-sm ${task.completed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{task.assignment_title}</h4>
              <button disabled={disabled} onClick={() => onToggle(task.id, task.completed)} className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${task.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-blue-500'}`}>
                {task.completed && <CheckCircle2 className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-xs ${task.completed ? 'text-slate-400' : 'text-slate-500'}`}>{task.task_description}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const Timeline = () => {
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const tasks = await apiRequest('/api/timeline', { method: 'GET', headers: {} });

        const grouped = tasks.reduce((acc, task) => {
          const date = task.scheduled_date;
          if (!acc[date]) acc[date] = [];
          acc[date].push(task);
          return acc;
        }, {});

        const sortedDates = Object.keys(grouped).sort().map((date) => ({
          date,
          tasks: grouped[date],
          isToday: date === new Date().toISOString().split('T')[0],
        }));

        setTimelineData(sortedDates);
      } catch (error) {
        console.error('Failed to load timeline', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, []);

  const handleToggle = async (taskId, currentStatus) => {
    if (toggling) return;

    const previous = timelineData;
    const updatedData = timelineData.map((day) => ({
      ...day,
      tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, completed: !currentStatus } : t)),
    }));
    setTimelineData(updatedData);
    setToggling(true);

    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !currentStatus }),
      });
    } catch (error) {
      setTimelineData(previous);
      console.error('Failed to toggle task', error);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10">
        <h2 className="text-3xl font-bold text-slate-800 mb-10">Neural Timeline</h2>
        <div className="max-w-4xl mx-auto pl-4 md:pl-0 pb-20">
          {loading ? <div className="text-slate-500">Loading...</div>
            : timelineData.map((day, index) => (
              <NeuralNode key={index} {...day} onToggle={handleToggle} disabled={toggling} />
            ))}
        </div>
      </div>
    </div>
  );
};

export default Timeline;
