import React from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { User, Mail, Shield } from "lucide-react";
import { useSettings } from '@/context/SettingsContext';

const Profile = () => {
  const { user, logout } = useAuth();
  const { settings } = useSettings();

  // Helper to get initials (e.g. "John Doe" -> "JD")
  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U';
  };

  return (
    <div className="page-shell">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">My Profile</h1>

        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <Avatar className="w-16 h-16">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-cyan-100/70 text-primary text-xl font-bold">
                        {getInitials(user?.name)}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <CardTitle className="text-xl">{user?.name}</CardTitle>
                    <CardDescription>{user?.email}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-6 mt-4">
                <div className="grid gap-2">
                    <Label htmlFor="name">Display Name</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="name" value={user?.name || ''} readOnly className="pl-9" />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="email" value={user?.email || ''} readOnly className="pl-9" />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="role">Account Role</Label>
                    <div className="relative">
                        <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="role" value="Student" readOnly className="pl-9" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card className="mb-6">
            <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Current app preferences from your settings.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="pref-theme">Theme</Label>
                    <Input id="pref-theme" value={settings.theme_mode} readOnly />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="pref-start-page">Start Page</Label>
                    <Input id="pref-start-page" value={settings.start_page} readOnly />
                </div>
            </CardContent>
        </Card>

        <div className="flex justify-end">
            <Button variant="destructive" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
