import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface RequireAuthProps {
  children: ReactNode;
}

/** Prevent signed-out visitors from rendering private account pages. */
export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4 text-muted-foreground">
        Restoring your ETERNYX session…
      </main>
    );
  }

  if (!user || !isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
