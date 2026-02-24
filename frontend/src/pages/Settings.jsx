import React, { useState, useEffect } from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Bell, Lock, Eye } from "lucide-react";

const Settings = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [emailDigest, setEmailDigest] = useState(true);
  
  useEffect(() => {
    if (darkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="page-shell transition-colors duration-300">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">Settings</h1>

        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" /> Appearance</CardTitle>
                <CardDescription>Customize how Disciplan looks for you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">Dark Mode</Label>
                        <p className="text-sm text-muted-foreground">Reduce eye strain during late night study sessions.</p>
                    </div>
                    <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
            </CardContent>
        </Card>

        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" /> Notifications</CardTitle>
                <CardDescription>Manage your alerts and reminders.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">Daily Digest</Label>
                        <p className="text-sm text-muted-foreground">Receive an email summary of tasks due today.</p>
                    </div>
                    <Switch checked={emailDigest} onCheckedChange={setEmailDigest} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">Assignment Created</Label>
                        <p className="text-sm text-muted-foreground">Get notified when AI finishes generating a plan.</p>
                    </div>
                    <Switch checked={true} disabled />
                </div>
            </CardContent>
        </Card>

        <Card className="border-red-200/70">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600"><Lock className="w-5 h-5" /> Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base text-red-600">Delete Account</Label>
                        <p className="text-sm text-muted-foreground">Permanently remove your account and all data.</p>
                    </div>
                    <Button variant="destructive">Delete Account</Button>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
