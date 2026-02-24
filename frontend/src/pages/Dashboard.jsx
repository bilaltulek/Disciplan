import React, { useState, useEffect } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2 } from 'lucide-react';
import TaskCard from '@/components/features/TaskCard';
import { apiRequest } from '@/shared/api/client';

const Dashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '', description: '', complexity: 'Medium', dueDate: '', totalItems: 5,
  });

  const fetchAssignments = React.useCallback(async () => {
    try {
      const data = await apiRequest('/api/assignments', { method: 'GET', headers: {} });
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleAddTask = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          complexity: formData.complexity,
          dueDate: formData.dueDate,
          totalItems: parseInt(formData.totalItems, 10),
        }),
      });

      await fetchAssignments();
      setIsOpen(false);
      setFormData({
        title: '', description: '', complexity: 'Medium', dueDate: '', totalItems: 5,
      });
    } catch (error) {
      alert(error.message || 'Failed to create plan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNav />
      <main className="container mx-auto p-6 md:p-10">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Current Assignments</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Card className="h-64 border-dashed border-2 border-slate-300 bg-transparent hover:bg-blue-50/50 cursor-pointer flex flex-col items-center justify-center group transition-colors">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-8 h-8 text-blue-600" />
                </div>
                <span className="font-semibold text-slate-600 group-hover:text-blue-600">Add New Assignment</span>
              </Card>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Study Plan</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">Title</Label>
                  <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="col-span-3" placeholder="Calculus Midterm" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="date" className="text-right">Due Date</Label>
                  <Input id="date" type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="items" className="text-right">Workload</Label>
                  <Input id="items" type="number" value={formData.totalItems} onChange={(e) => setFormData({ ...formData, totalItems: e.target.value })} className="col-span-3" placeholder="Num items" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="complexity" className="text-right">Difficulty</Label>
                  <select className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.complexity} onChange={(e) => setFormData({ ...formData, complexity: e.target.value })}>
                    <option value="Easy">Easy (Review)</option>
                    <option value="Medium">Medium (Standard)</option>
                    <option value="Hard">Hard (Exam Prep)</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="desc" className="text-right pt-2">Description</Label>
                  <Textarea id="desc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="col-span-3" placeholder="Describe the assignment..." />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleAddTask} className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Generating...' : 'Create Plan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
