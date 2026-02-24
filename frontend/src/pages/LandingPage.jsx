import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Zap, BrainCircuit, LayoutDashboard } from "lucide-react";
import LandingNav from '@/components/layout/LandingNav';

const LandingPage = () => {
  return (
    <div className="page-shell">
      <LandingNav />
      
      <section className="container mx-auto px-4 pt-20 pb-32 text-center">
        <div className="inline-block px-3 py-1 mb-4 text-sm font-medium text-primary glass-chip rounded-full">
          v1.0 Now Live
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 text-balance">
          Stay disciplined with <span className="text-primary">Disciplan</span>
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Your AI powered solution to never miss another deadline. Plan and never procrastinate again.
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" className="px-8 text-lg">
            Get Started
          </Button>
          <Button size="lg" variant="outline" className="px-8 text-lg">
            View Demo
          </Button>
        </div>
      </section>

      <section className="container mx-auto px-4 mb-32">
        <div className="glass-panel rounded-3xl p-8 md:p-12">
            <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">How it works</h3>
                <p className="text-muted-foreground">We break your big assignments into daily bite-sized tasks.</p>
            </div>
            
            <div className="max-w-md mx-auto transform hover:scale-105 transition-transform duration-300">
                <Card className="border-l-4 border-l-primary shadow-lg">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Calculus Midterm Prep</CardTitle>
                                <CardDescription className="mt-1">Due: Friday, Oct 24th</CardDescription>
                            </div>
                            <span className="glass-chip text-primary text-xs font-bold px-2 py-1 rounded">Day 2 of 5</span>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-2 rounded hover:bg-white/45">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                <span className="text-sm line-through text-muted-foreground">Review Derivatives</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded glass-chip">
                                <div className="w-5 h-5 border-2 border-primary/60 rounded-full" />
                                <span className="text-sm font-medium">Practice Chain Rule problems (1-20)</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Built for High Achievers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
                { icon: <BrainCircuit className="w-8 h-8 text-blue-500"/>, title: "AI Breakdown", desc: "Context-aware breaking down of complex syllabus files into daily plans." },
                { icon: <LayoutDashboard className="w-8 h-8 text-cyan-500"/>, title: "Neural Timeline", desc: "Visualize your week with our unique network map view." },
                { icon: <Zap className="w-8 h-8 text-amber-500"/>, title: "Smart Priority", desc: "Dynamic rescheduling based on your completion velocity." }
            ].map((feature, i) => (
                <Card key={i} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <div className="mb-4">{feature.icon}</div>
                        <CardTitle>{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">{feature.desc}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
