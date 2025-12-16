import React, { useState, useEffect } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import TaskCard from '@/components/features/TaskCard';
import { useAuth } from '@/context/AuthContext'; // Import Auth

const Dashboard = () => {
  const { token } = useAuth(); // Get Token
  const [tasks, setTasks] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({ 
    title: '', description: '', complexity: 'Medium', dueDate: '', totalItems: 5 
  });

  const fetchAssignments = React.useCallback(async () => {
    try {
      const res = await fetch('/api/assignments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error("Failed to fetch assignments:", error);
    }
  }, [token]); // Only recreate if token changes

  
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]); // Re-run if token changes


  const handleAddTask = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Secure Call
        },
        body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            complexity: formData.complexity,
            dueDate: formData.dueDate,
            totalItems: parseInt(formData.totalItems)
        }),
      });

      if (response.ok) {
        await fetchAssignments(); 
        setIsOpen(false);
        setFormData({ title: '', description: '', complexity: 'Medium', dueDate: '', totalItems: 5 });
      } else {
        alert("Failed to create plan. Check backend console.");
      }
    } catch (error) {
      console.error("Error creating assignment:", error);
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
                            <Input id="title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="col-span-3" placeholder="Calculus Midterm" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="date" className="text-right">Due Date</Label>
                            <Input id="date" type="date" value={formData.dueDate} onChange={(e) => setFormData({...formData, dueDate: e.target.value})} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="items" className="text-right">Workload</Label>
                            <Input id="items" type="number" value={formData.totalItems} onChange={(e) => setFormData({...formData, totalItems: e.target.value})} className="col-span-3" placeholder="Num items" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="complexity" className="text-right">Difficulty</Label>
                            <select className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.complexity} onChange={(e) => setFormData({...formData, complexity: e.target.value})}>
                                <option value="Easy">Easy (Review)</option>
                                <option value="Medium">Medium (Standard)</option>
                                <option value="Hard">Hard (Exam Prep)</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="desc" className="text-right pt-2">Context</Label>
                            <Textarea id="desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="col-span-3" placeholder="Details..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleAddTask} disabled={loading}>
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Asking Gemini...</> : "Generate Plan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {tasks.map(task => (
                 <TaskCard key={task.id} task={task} />
            ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;