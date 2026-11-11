import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';

interface RequireAuthProps {
  children: ReactNode;
}

/** Prevent signed-out visitors from rendering private account pages. */
export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { user, isAuthenticated, isLoading, setUser } = useAuthStore();
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);

  useEffect(() => {
    if (isLoading || (user && isAuthenticated) || sessionCheckComplete) return;

    let active = true;

    // The app store can briefly be out of sync with Supabase's persisted session
    // after a hard navigation or a delayed auth-state restoration. Ask Supabase
    // before treating that temporary empty store as a signed-out user.
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) console.error('Unable to verify the current session:', error);
        if (!active) return;
        if (data.session?.user) setUser(data.session.user);
      })
      .catch((error) => {
        console.error('Unable to restore the current session for this route:', error);
      })
      .finally(() => {
        if (active) setSessionCheckComplete(true);
      });

    return () => {
      active = false;
    };
  }, [isLoading, user, isAuthenticated, sessionCheckComplete, setUser]);

  if (isLoading || ((!user || !isAuthenticated) && !sessionCheckComplete)) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4 text-muted-foreground" role="status" aria-live="polite">
        Restoring your ETERNYX session…
      </main>
    );
  }

  if (!user || !isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
