import React from 'react';
import DashboardNav from '@/components/layout/DashboardNav';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { User, Mail, Shield } from "lucide-react";

const Profile = () => {
  const { user, logout } = useAuth();

  // Helper to get initials (e.g. "John Doe" -> "JD")
  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNav />
      <div className="container mx-auto p-6 md:p-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-800 mb-8">My Profile</h1>

        {/* Identity Card */}
        <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <Avatar className="w-16 h-16">
                    <AvatarImage src="" /> {/* Add image URL here later if you want */}
                    <AvatarFallback className="bg-blue-100 text-blue-600 text-xl font-bold">
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
                        <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input id="name" value={user?.name || ''} readOnly className="pl-9 bg-slate-50" />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input id="email" value={user?.email || ''} readOnly className="pl-9 bg-slate-50" />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="role">Account Role</Label>
                    <div className="relative">
                        <Shield className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input id="role" value="Student" readOnly className="pl-9 bg-slate-50" />
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end">
            <Button variant="destructive" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;