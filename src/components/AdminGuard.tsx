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
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data?.role === 'admin');
      }
    } catch (err) {
      console.error('Admin check failed:', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);

    try {
      // Special handling for admin account
      if (credentials.email === 'naimatullahullahofficial01@gmail.com') {
        const { error } = await signIn(credentials.email, credentials.password);
        
        if (error) {
          toast({
            title: "Authentication Failed",
            description: error,
            variant: "destructive",
          });
        } else {
          // Set admin role after successful sign in
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          
          if (currentUser) {
            const { error: updateError } = await supabase
              .from('profiles')
              .upsert({ 
                user_id: currentUser.id,
                role: 'admin',
                full_name: 'Naimat Ullah',
                username: 'admin'
              });

            if (updateError) {
              console.error('Failed to set admin role:', updateError);
            }
          }

          toast({
            title: "Admin Access Granted",
            description: "Welcome to ETERNYX Admin Panel",
          });
          
          // Recheck admin status and force re-render
          await checkAdminStatus();
          
          // Navigate to dashboard instead of reloading
          window.location.href = '/dashboard';
        }
      } else {
        toast({
          title: "Access Denied",
          description: "Only authorized administrators can access this system",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Admin sign in error:', err);
      toast({
        title: "System Error",
        description: "Authentication system error",
        variant: "destructive",
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
                    placeholder="admin@eternyx.com"
                    className="bg-gray-800/50 border-gray-700 text-white"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-cyan-400">
                    Security Code
                  </Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••••••"
                    className="bg-gray-800/50 border-gray-700 text-white"
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
                      Authenticating...
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
                  ⚠️ Unauthorized access attempts are logged and monitored
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