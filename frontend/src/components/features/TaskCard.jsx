import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, FileText, CheckCircle2, Clock } from "lucide-react";

const TaskCard = ({ task }) => {
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // FIX 1: Initialize local state with the props from the server (so progress shows immediately)
  const [completedCount, setCompletedCount] = useState(task.completed_subtasks || 0);
  const [totalCount, setTotalCount] = useState(task.total_subtasks || 0);

  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const loadPlan = async () => {
    setLoading(true);
    try {
        const res = await fetch(`/api/assignment/plan/${task.id}`);
        const data = await res.json();
        setPlan(data);
        
        // Sync our local counts with the detailed plan
        setTotalCount(data.length);
        setCompletedCount(data.filter(t => t.completed).length);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const toggleTask = async (taskId, currentStatus) => {
    // FIX 2: Ensure currentStatus is treated as a boolean
    const isComplete = !!currentStatus;
    
    // Optimistic Update
    const newPlan = plan.map(t => 
        t.id === taskId ? { ...t, completed: !isComplete } : t
    );
    setPlan(newPlan);
    
    // Update the progress bar immediately
    setCompletedCount(prev => isComplete ? prev - 1 : prev + 1);

    await fetch(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !isComplete })
    });
  };

  return (
    <Dialog onOpenChange={(open) => open && loadPlan()}>
        <Card className="h-64 flex flex-col justify-between hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${
                 task.complexity === 'Hard' ? 'bg-red-500' :
                 task.complexity === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
            }`} />
            
            <CardContent className="pt-6 pl-6">
                <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{task.complexity}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                        <Calendar className="w-3 h-3" /> {task.due_date}
                    </span>
                </div>
                
                <h3 className="font-bold text-lg mb-2 leading-tight text-slate-800">{task.title}</h3>
                
                {/* Progress Bar (Always visible if tasks exist) */}
                {totalCount > 0 ? (
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Progress</span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-500" 
                                style={{ width: `${progressPercent}%` }} 
                            />
                        </div>
                    </div>
                ) : (
                   <p className="text-sm text-slate-500 line-clamp-3 mb-4">
                     {task.description || "No description provided."}
                   </p>
                )}
                
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-auto">
                    <FileText className="w-3 h-3" /> {task.total_items} Items
                </div>
            </CardContent>
            
            <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                <DialogTrigger asChild>
                    <Button variant="outline" className="w-full bg-white hover:bg-blue-50 hover:text-blue-600 transition-all">
                        {totalCount > 0 ? "Continue Plan" : "View Breakdown"}
                    </Button>
                </DialogTrigger>
            </div>
        </Card>

        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Study Plan: {task.title}</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-2 mt-2 space-y-2">
                {loading ? <div className="text-center py-10">Loading...</div> : (
                    plan.map((step, i) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${step.completed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
                            
                            {/* FIX 2: Checkbox Button (Fixed the '0' issue) */}
                            <button 
                                onClick={() => toggleTask(step.id, step.completed)}
                                className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                    !step.completed ? 'bg-white-500 border-gray-500 text-white' : 'border-slate-300 hover:border-blue-500'
                                }`}
                            >
                                {!!step.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                            
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${step.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                    {step.task_description}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-slate-400">{step.scheduled_date}</span>
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {step.estimated_minutes}m
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </DialogContent>
    </Dialog>
  );
};

export default TaskCard;