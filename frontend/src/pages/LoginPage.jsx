import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // Hook
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from 'lucide-react';

const LoginPage = () => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const res = await login(formData.email, formData.password);
    if (!res.success) {
        setError(res.error);
        setLoading(false);
    }
  };

  return (
    <div className="page-shell flex items-center justify-center p-4">
      <Link to="/" className="absolute top-8 left-8 text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors glass-chip px-3 py-2 rounded-xl">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">Enter your email to sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                    id="email" 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required 
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                    id="password" 
                    type="password" 
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required 
                />
            </div>
            
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <Button className="w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Sign In"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground mt-4">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary font-semibold hover:underline">Sign up</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
