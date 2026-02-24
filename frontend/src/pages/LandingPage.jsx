import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  History,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import LandingNav from '@/components/layout/LandingNav';

const howItWorks = [
  {
    icon: <CalendarCheck2 className="w-5 h-5 text-sky-600" />,
    title: 'Create assignment',
    description: 'Add your due date, workload, and difficulty in under a minute.',
  },
  {
    icon: <BrainCircuit className="w-5 h-5 text-cyan-600" />,
    title: 'AI breaks it down',
    description: 'Disciplan generates day-by-day tasks with estimated study time.',
  },
  {
    icon: <Network className="w-5 h-5 text-emerald-600" />,
    title: 'Track and finish',
    description: 'Complete tasks from Dashboard, Timeline, and History to stay on pace.',
  },
];

const surfaces = [
  {
    icon: <LayoutDashboard className="w-5 h-5 text-sky-600" />,
    title: 'Dashboard',
    description: 'View all assignments, progress, and next actions in one place.',
    bullets: ['Difficulty-tinted cards', 'Continue and delete actions'],
    mock: (
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-sky-400/70 w-9/12" />
        <div className="h-2 rounded-full bg-white/70 w-11/12" />
        <div className="h-2 rounded-full bg-emerald-300/70 w-7/12" />
      </div>
    ),
  },
  {
    icon: <Network className="w-5 h-5 text-cyan-600" />,
    title: 'Timeline',
    description: 'Follow your scheduled tasks day by day and adjust quickly.',
    bullets: ['Auto-focus on today', 'Hide completed items'],
    mock: (
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-cyan-400/70 w-6/12" />
        <div className="h-2 rounded-full bg-white/70 w-10/12" />
        <div className="h-2 rounded-full bg-white/70 w-8/12" />
      </div>
    ),
  },
  {
    icon: <History className="w-5 h-5 text-amber-600" />,
    title: 'History',
    description: 'Review completed work and keep momentum visible over time.',
    bullets: ['Search and filter by complexity', 'Weekly completion stats'],
    mock: (
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-amber-300/80 w-5/12" />
        <div className="h-2 rounded-full bg-white/70 w-11/12" />
        <div className="h-2 rounded-full bg-white/70 w-9/12" />
      </div>
    ),
  },
];

const features = [
  {
    icon: <BrainCircuit className="w-7 h-7 text-blue-500" />,
    title: 'AI Task Breakdown',
    desc: 'Turn large assignments into focused mini tasks mapped to real dates.',
  },
  {
    icon: <Clock3 className="w-7 h-7 text-cyan-500" />,
    title: 'Progress Visibility',
    desc: 'Track completion percent and keep your workload realistic each day.',
  },
  {
    icon: <Zap className="w-7 h-7 text-amber-500" />,
    title: 'Fast Iteration',
    desc: 'Edit or delete tasks quickly as plans change during the week.',
  },
];

const faqs = [
  {
    q: 'Do I need to manually create every study task?',
    a: 'No. You create the assignment once, and Disciplan generates the detailed study plan.',
  },
  {
    q: 'Can I adjust generated tasks later?',
    a: 'Yes. You can edit, toggle, and delete tasks from Timeline and History views.',
  },
  {
    q: 'Is my data tied to my account?',
    a: 'Yes. Assignments and tasks are scoped to authenticated users.',
  },
];

const LandingPage = () => (
  <div className="page-shell">
    <LandingNav />

    <section className="landing-section pt-16 md:pt-24 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 text-sm font-medium text-primary glass-chip rounded-full">
          <ShieldCheck className="w-4 h-4" />
          Built for consistent study momentum
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 text-balance">
          Stop guessing what to study next
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Disciplan turns assignments into clear daily action across Dashboard, Timeline, and History.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/signup">
            <Button size="lg" className="px-8 text-base focus-visible:ring-2 focus-visible:ring-primary/60">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">
            Already have an account?
            {' '}
            <Link className="text-primary hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm" to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="landing-section">
      <div className="glass-panel rounded-3xl p-6 md:p-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">How It Works</h2>
          <p className="text-muted-foreground">Three steps from assignment to completion.</p>
        </div>
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="hidden md:block absolute left-1/6 right-1/6 top-6 h-px bg-white/60" />
          {howItWorks.map((step) => (
            <Card key={step.title} className="relative glass-chip border-white/60">
              <CardHeader>
                <div className="w-10 h-10 rounded-full glass-chip flex items-center justify-center mb-3">
                  {step.icon}
                </div>
                <CardTitle className="text-xl">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>

    <section className="landing-section">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-2">See the Workspace</h2>
        <p className="text-muted-foreground">Each view solves a different planning problem.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {surfaces.map((surface) => (
          <Card key={surface.title} className="glass-panel">
            <CardHeader>
              <div className="w-10 h-10 rounded-full glass-chip flex items-center justify-center mb-3">
                {surface.icon}
              </div>
              <CardTitle>{surface.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{surface.description}</p>
              <ul className="text-sm space-y-1">
                {surface.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-white/55 bg-white/40 p-3">
                {surface.mock}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>

    <section id="features" className="landing-section">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-2">Built for High Achievers</h2>
        <p className="text-muted-foreground">Practical tools for consistent output, not just motivation.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature) => (
          <Card key={feature.title} className="hover:shadow-lg transition-shadow glass-panel">
            <CardHeader>
              <div className="mb-3">{feature.icon}</div>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{feature.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 glass-chip rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-center gap-3 md:gap-6 text-sm">
        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-600" /> Private account auth</span>
        <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Task-level editing</span>
        <span className="flex items-center gap-2"><Network className="w-4 h-4 text-cyan-600" /> Progress tracking</span>
      </div>
    </section>

    <section className="landing-section pb-16 md:pb-24">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-6">FAQ</h2>
        <div className="space-y-3">
          {faqs.map((item) => (
            <Card key={item.q} className="glass-chip">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  </div>
);

export default LandingPage;
