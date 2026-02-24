import React, { useState, useEffect } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Clock, Trophy, Calendar,
} from 'lucide-react';
import { apiRequest } from '@/shared/api/client';

const History = () => {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalTasks: 0, totalMinutes: 0 });

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await apiRequest('/api/history', { method: 'GET', headers: {} });
        setHistory(data);

        const minutes = data.reduce((acc, curr) => acc + (curr.estimated_minutes || 0), 0);
        setStats({
          totalTasks: data.length,
          totalMinutes: minutes,
        });
      } catch (e) {
        console.error('Failed to load history', e);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-yellow-100 rounded-full text-yellow-600"><Trophy className="w-6 h-6" /></div>
          <div><h1 className="text-3xl font-bold text-slate-800">Completion History</h1><p className="text-slate-500">Track your academic momentum</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Tasks Completed</CardTitle></CardHeader><CardContent><div className="text-4xl font-bold text-slate-800">{stats.totalTasks}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Study Time (Est.)</CardTitle></CardHeader><CardContent><div className="text-4xl font-bold text-blue-600">{Math.round(stats.totalMinutes / 60)} <span className="text-lg text-slate-400 font-normal">hours</span></div></CardContent></Card>
        </div>
        <Card className="border-none shadow-sm">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? <div className="text-center py-10 text-slate-400">No completed tasks yet.</div> : (
              <div className="space-y-4">
                {history.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="bg-green-100 p-2 rounded-full"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                      <div><h4 className="font-bold text-slate-700 line-through decoration-slate-400">{task.task_description}</h4><div className="flex items-center gap-2 text-xs text-slate-400 mt-1"><span className="font-medium text-blue-600">{task.assignment_title}</span><span>•</span><span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.scheduled_date}</span></div></div>
                    </div>
                    <Badge variant="outline" className="text-slate-500 flex gap-1"><Clock className="w-3 h-3" /> {task.estimated_minutes}m</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default History;
