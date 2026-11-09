import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Crown, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { user, signIn } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [signingIn, setSigningIn] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;

    const verifyAdmin = async () => {
      if (!user) {
        if (active) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('is_admin');
        if (error) throw error;
        if (active) setIsAdmin(data === true);
      } catch (err) {
        console.error('Admin verification failed:', err);
        if (active) setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);

    try {
      const result = await signIn(credentials.email, credentials.password);

      if (!result.success) {
        toast({
          title: 'Authentication Failed',
          description: result.error || 'Unable to sign in',
          variant: 'destructive',
        });
        return;
      }

      // Authentication proves identity; the database function independently
      // verifies whether this account has a trusted administrator assignment.
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;

      if (data !== true) {
        setIsAdmin(false);
        toast({
          title: 'Access Denied',
          description: 'This account is not authorized to access the administrator panel.',
          variant: 'destructive',
        });
        return;
      }

      setIsAdmin(true);
      toast({
        title: 'Admin Access Granted',
        description: 'Welcome to the ETERNYX Admin Panel',
      });
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Admin sign-in verification failed:', err);
      toast({
        title: 'System Error',
        description: 'Unable to verify administrator authorization. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-cyan-400 animate-pulse text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p>Verifying Security Clearance...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="bg-gray-900/80 backdrop-blur-sm border border-red-500/30">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-red-400" />
              </div>
              <CardTitle className="text-2xl text-red-400 flex items-center justify-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                RESTRICTED ACCESS
              </CardTitle>
              <p className="text-gray-400 text-sm">
                This system requires administrator clearance
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdminSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="admin-email" className="text-cyan-400">
                    Administrator Email
                  </Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={credentials.email}
                    onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter your administrator email"
                    className="bg-gray-800/50 border-gray-700 text-white"
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-cyan-400">
                    Password
                  </Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter your password"
                    className="bg-gray-800/50 border-gray-700 text-white"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={signingIn}
                  className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white"
                >
                  {signingIn ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      Request Admin Access
                    </div>
                  )}
                </Button>
              </form>

              <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-xs text-center">
                  Administrator access is verified by the database, not by an email address supplied by the browser.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminGuard;
