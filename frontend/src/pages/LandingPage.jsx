import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Zap, BrainCircuit, LayoutDashboard } from "lucide-react";
import LandingNav from '@/components/layout/LandingNav';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background font-sans">
      <LandingNav />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-20 pb-32 text-center">
        <div className="inline-block px-3 py-1 mb-4 text-sm font-medium text-blue-600 bg-blue-100 rounded-full">
          v1.0 Now Live
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900 mb-6">
          Stay disciplined with <span className="text-blue-600">Disciplan</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-600 max-w-2xl mx-auto mb-10">
          Your AI powered solution to never miss another deadline. Plan and never procrastinate again.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 text-lg">
            Get Started
          </Button>
          <Button size="lg" variant="outline" className="px-8 text-lg">
            View Demo
          </Button>
        </div>
      </section>

      {/* Task Preview Section */}
      <section className="container mx-auto px-4 mb-32">
        <div className="bg-slate-50 border rounded-3xl p-8 md:p-12 shadow-xl">
            <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">How it works</h3>
                <p className="text-slate-500">We break your big assignments into daily bite-sized tasks.</p>
            </div>
            
            {/* Mock Task Card Visualization */}
            <div className="max-w-md mx-auto transform hover:scale-105 transition-transform duration-300">
                <Card className="border-l-4 border-l-blue-500 shadow-lg">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Calculus Midterm Prep</CardTitle>
                                <CardDescription className="mt-1">Due: Friday, Oct 24th</CardDescription>
                            </div>
                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">Day 2 of 5</span>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-2 rounded hover:bg-slate-50">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                <span className="text-sm line-through text-slate-400">Review Derivatives</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded bg-blue-50 border border-blue-100">
                                <div className="w-5 h-5 border-2 border-blue-400 rounded-full" />
                                <span className="text-sm font-medium">Practice Chain Rule problems (1-20)</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      </section>

      {/* Modern Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Built for High Achievers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
                { icon: <BrainCircuit className="w-8 h-8 text-blue-500"/>, title: "AI Breakdown", desc: "Context-aware breaking down of complex syllabus files into daily plans." },
                { icon: <LayoutDashboard className="w-8 h-8 text-purple-500"/>, title: "Neural Timeline", desc: "Visualize your week with our unique network map view." },
                { icon: <Zap className="w-8 h-8 text-yellow-500"/>, title: "Smart Priority", desc: "Dynamic rescheduling based on your completion velocity." }
            ].map((feature, i) => (
                <Card key={i} className="hover:shadow-lg transition-shadow border-none bg-slate-50/50">
                    <CardHeader>
                        <div className="mb-4">{feature.icon}</div>
                        <CardTitle>{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600">{feature.desc}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;